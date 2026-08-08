-- O pagina de catalog, dintr-un singur apel.
--
-- Pana acum pagina de catalog citea TOT catalogul si felia in browser. RPC-ul
-- asta intoarce exact randurile paginii cerute, plus numarul total dupa filtre.
--
-- `returns jsonb`, UN SINGUR RAND. Nu `returns setof`, si asta nu e stil:
-- `db-max-rows` (plafonul PostgREST de 1000) se aplica SI la proceduri, deci un
-- `setof` ar reintroduce exact trunchierea silentioasa pentru care exista
-- `fetchAllRows`. Un singur rand nu poate fi taiat. Plafonul `least(...,96)`
-- ramane si el, dar ca a doua centura.

-- Colatie cu ordonare numerica, perechea exacta a lui
-- `localeCompare(x, "ro", { numeric: true })` din lib/storefront/catalog/sortare.ts.
-- Fara ea, „Cizma 10" ar veni inaintea lui „Cizma 2" pe server si dupa el in
-- browser — aceeasi lista, doua ordini, in functie de unde s-a sortat.
do $$ begin
  if not exists (select 1 from pg_collation where collname = 'ro_numeric') then
    execute $c$create collation public.ro_numeric (provider = icu, locale = 'ro-RO-u-kn-true')$c$;
  end if;
end $$;

create or replace function public.catalog_pagina(
  p_business uuid,
  p_filtre   jsonb,
  p_limit    int,
  p_offset   int
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lim        int := least(greatest(coalesce(p_limit, 20), 1), 96);
  v_off        int := greatest(coalesce(p_offset, 0), 0);
  v_sort       text := coalesce(p_filtre->>'sortare', '');
  /*
   * Testul pe tip e POZITIV, si asta e reparatia unui incident.
   *
   * Cand nu se cere nicio categorie, apelantul trimite `categorii: null` — care
   * ajunge aici ca jsonb `null`, NU ca SQL NULL. Deci `coalesce` il lasa sa
   * treaca nevatamat, iar `jsonb_array_elements` peste un scalar arunca
   * `22023 cannot extract elements from a scalar`. Prima aprindere a palierului
   * server a randat asa „0 din 1049 produse".
   *
   * `jsonb_typeof(...) = 'array'` e singura verificare care tine: acopera si
   * cheia absenta (unde `jsonb_typeof` da SQL NULL, iar orice comparatie
   * NEGATIVA ar da NULL si ar arunca fiecare rand), si jsonb `null`, si un scalar
   * trimis din greseala.
   */
  v_categorii  text[] := case
    when jsonb_typeof(p_filtre->'categorii') = 'array'
      then (select array_agg(x #>> '{}') from jsonb_array_elements(p_filtre->'categorii') x)
    else null end;
  v_pmin       numeric := nullif(p_filtre->>'pretMin', '')::numeric;
  v_pmax       numeric := nullif(p_filtre->>'pretMax', '')::numeric;
  v_reduceri   boolean := coalesce((p_filtre->>'reduceri')::boolean, false);
  v_stoc       boolean := coalesce((p_filtre->>'stoc')::boolean, false);
  v_fara_img   boolean := coalesce((p_filtre->>'faraImagini')::boolean, false);
  v_fara_stoc  boolean := coalesce((p_filtre->>'faraStocAscuns')::boolean, false);
  -- Fatetele: un array de array-uri de jetoane. Fiecare element interior e o
  -- CHEIE cu valorile ei alese.
  -- Acelasi test pozitiv, din acelasi motiv. Vezi `v_categorii` mai sus.
  v_grupuri    jsonb := case when jsonb_typeof(p_filtre->'fatete') = 'array'
                             then p_filtre->'fatete' else '[]'::jsonb end;
  v_out        jsonb;
begin
  /*
   * Poarta de vizibilitate, evaluata O DATA, nu per rand.
   *
   * Oglindeste politica RLS de pe `products` („produs activ al unei afaceri
   * publicate") PLUS cazul de previzualizare al proprietarului. `catalog_produs`
   * contine deja doar produse active, deci aici ramane doar partea de afacere.
   *
   * Proprietarul se citeste din `auth.uid()`, NU dintr-un argument. Un argument
   * ar fi forjabil de oricine are cheia anon — adica „arata-mi catalogul oricarui
   * magazin nepublicat".
   */
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'total', 0);
  end if;

  with vizibile as (
    select c.*
      from public.catalog_produs c
     where c.business_id = p_business
       -- Comutatoarele de vizibilitate ale magazinului.
       and (not v_fara_img  or c.are_imagine)
       and (not v_fara_stoc or not c.fara_stoc)
  ),
  filtrate as (
    select v.*
      from vizibile v
     where (v_categorii is null or v.category = any(v_categorii))
       /*
        * Pretul se compara cu `price_min`, LA AMANDOUA CAPETELE.
        *
        * Nu e o scapare: filtrul judeca pretul AFISAT, iar cardul afiseaza
        * minimul intervalului. Cu `price_max` la capatul de sus, „sub 200 lei"
        * cuprindea un produs al carui card scrie 203.
        */
       and (v_pmin is null or v.price_min >= v_pmin)
       and (v_pmax is null or v.price_min <= v_pmax)
       and (not v_reduceri or (v.compare_at_price is not null and v.compare_at_price > v.price_min))
       and (not v_stoc or not v.fara_stoc)
       /*
        * Fatetele: SAU in interiorul unei chei, SI intre chei.
        * Exact `trecefiltrele` (facets.ts): fiecare cheie aleasa trebuie sa aiba
        * cel putin o valoare potrivita. `&&` e „se intersecteaza".
        */
       and (
         jsonb_array_length(v_grupuri) = 0
         or not exists (
           select 1
             from jsonb_array_elements(v_grupuri) g
            -- Un grup care nu e tablou se IGNORA, nu arunca: `jsonb_array_elements`
            -- peste un scalar da `22023`, iar forma vine din adresa.
            where jsonb_typeof(g) = 'array'
              and not (v.fatete && (select array_agg(x #>> '{}') from jsonb_array_elements(g) x))
         )
       )
  ),
  /*
   * Numarul si pagina, in ACEEASI instructiune, peste ACELASI CTE.
   *
   * `count(*) over ()` langa `LIMIT/OFFSET` inseamna ca filtrarea si numararea
   * nu mai pot iesi din pas — nu exista doua interogari care sa vada seturi
   * diferite. Cu doua instructiuni, „251 de produse" si o pagina 13 goala sunt
   * o combinatie posibila.
   */
  pagina as (
    select f.*, count(*) over () as total_filtrate
      from filtrate f
     order by
       -- Fiecare sortare se termina cu `product_id`: fara departajare, doua
       -- cereri pentru pagini diferite pot aseza altfel randurile egale, si
       -- atunci un produs apare pe doua pagini si altul pe niciuna. Vezi
       -- lib/storefront/catalog/sortare.ts.
       case when v_sort = 'price_asc'  then f.price_min end asc  nulls last,
       case when v_sort = 'price_desc' then f.price_min end desc nulls last,
       case when v_sort = 'name_asc'   then f.name collate public.ro_numeric end asc nulls last,
       case when v_sort = 'newest'     then f.creat end desc nulls last,
       -- „popular" si implicitul folosesc amandoua ordinea de catalog.
       case when v_sort in ('price_asc','price_desc','name_asc','newest') then null
            else (case when f.is_featured then 0 else 1 end) end asc nulls last,
       case when v_sort in ('price_asc','price_desc','name_asc','newest') then null
            else f.sort_order end asc nulls last,
       f.product_id asc
     limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', coalesce((select max(total_filtrate) from pagina), 0),
    'randuri', coalesce(jsonb_agg(to_jsonb(p) - 'total_filtrate' - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
  ) into v_out
  from pagina p;

  -- `jsonb_agg` peste zero randuri da NULL, nu `[]`; pe o pagina goala
  -- (offset peste sfarsit) apelantul ar fi primit `randuri: null`.
  return coalesce(v_out, jsonb_build_object('randuri', '[]'::jsonb, 'total', 0));
end;
$$;

revoke all on function public.catalog_pagina(uuid, jsonb, int, int) from public;
grant execute on function public.catalog_pagina(uuid, jsonb, int, int) to anon, authenticated, service_role;

-- Fara asta, PostgREST nu vede functia noua si raspunde 404 pana la urmatorul
-- reload de schema, care poate intarzia oricat.
notify pgrst, 'reload schema';
