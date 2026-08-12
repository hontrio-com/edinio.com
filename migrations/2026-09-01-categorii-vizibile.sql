-- Categorii care se pot stinge, cu tot ce atarna sub ele.
--
-- Pana acum o categorie putea fi doar stearsa. Comerciantul care voia sa scoata
-- un raion din magazin — sezonier, epuizat, sau pur si simplu nepregatit — nu
-- avea decat stergerea, care duce cu ea si subcategoriile, si legatura
-- produselor. `is_active` e comutatorul care lipsea.
--
-- STINSA INSEAMNA SI PRODUSELE EI. Alegerea e a comerciantului, luata explicit:
-- o categorie stinsa nu mai apare in navigare, in filtre si in cautare, iar
-- produsele din ea ies din grila, din fatete si din numaratori. Raman accesibile
-- prin link direct catre pagina lor de produs — pentru „nu se mai vinde deloc"
-- exista `products.is_active`, care e alta intrebare.
--
-- MOSTENIREA E PE SUBARBORE. Stingand „Furaje" se sting si „Concentrate" si
-- „Lapte praf", desi randurile lor raman `is_active = true`: altfel un raion
-- stins si-ar fi aratat mai departe rafturile. De aici si `categorii_ascunse`,
-- care coboara recursiv.

alter table public.categories
  add column if not exists is_active boolean not null default true;

comment on column public.categories.is_active is
  'Categoria se vede in magazin. Stinsa, ea si tot subarborele ei ies din navigare, filtre, cautare si grila. Vezi public.categorii_ascunse().';

/*
 * Numele de categorie care NU au voie sa apara in magazin.
 *
 * Numele, nu id-urile, fiindca `products.category` e TEXT: legatura produs-
 * categorie se face prin nume peste tot in proiect, deci si taierea trebuie sa se
 * faca tot acolo.
 *
 * `union`, nu `union all`: un ciclu de parinti (imposibil prin interfata, dar
 * randurile pot fi atinse si din consola) ar face recursia sa nu se opreasca
 * niciodata cu `union all`. Cu `union`, un rand deja vazut nu mai produce randuri
 * noi si recursia se inchide.
 *
 * UN NUME IESE DIN MAGAZIN DOAR CAND TOATE CATEGORIILE CARE IL POARTA SUNT
 * STINSE. Unicitatea numelui e pe frati, nu pe magazin, deci acelasi nume poate
 * sta in doua locuri din arbore — pe Vetdepo, „Insecticide" sta si sub
 * „Deratizare", si sub „Farmacie Veterinara". Produsele nu stiu decat numele:
 * fara regula asta, stingerea unuia dintre cele doua raioane ar fi golit si
 * celalalt. Perechea din TypeScript (`numeCategoriiAscunse`) o aplica identic.
 *
 * Intoarce `'{}'`, NICIODATA null. Apelantii o folosesc in `<> all (...)`, iar
 * `x <> all (null)` e NULL, adica „arunca fiecare rand" — exact catalogul gol pe
 * care nu-l raporteaza nimeni.
 */
create or replace function public.categorii_ascunse(p_business uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with recursive ascunse as (
    select c.id, c.name
      from public.categories c
     where c.business_id = p_business
       and not c.is_active
    union
    select k.id, k.name
      from public.categories k
      join ascunse a on k.parent_id = a.id
     where k.business_id = p_business
  )
  select coalesce(array_agg(distinct a.name), '{}'::text[])
    from ascunse a
   where not exists (
     select 1
       from public.categories v
      where v.business_id = p_business
        and v.name = a.name
        and not exists (select 1 from ascunse b where b.id = v.id)
   );
$$;

-- EXECUTE e al lui PUBLIC din oficiu, deci revocarea trebuie sa fie explicita.
-- Chemata doar din interiorul functiilor `security definer` de mai jos (unde
-- utilizatorul curent e proprietarul) si din cron cu cheia de serviciu.
revoke all on function public.categorii_ascunse(uuid) from public, anon, authenticated;
grant execute on function public.categorii_ascunse(uuid) to service_role;

/*
 * Orice atingere a categoriilor invalideaza agregatele magazinului.
 *
 * De cand o categorie stinsa scoate produse din catalog, `catalog_rezumat` —
 * totalul, intervalul de pret, fatetele si lista de categorii cu produse —
 * depinde si de tabela asta, nu doar de `catalog_produs`. Fara declansator,
 * comerciantul stingea un raion si numaratoarea din magazin ramanea cea veche
 * pana la urmatoarea modificare de produs, adica oricat.
 */
create or replace function public.trg_categorii_rezumat_murdar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.catalog_rezumat_murdar (business_id, marcat_la)
  values (coalesce(new.business_id, old.business_id), now())
  on conflict (business_id) do update set marcat_la = now();
  return coalesce(new, old);
end;
$$;

drop trigger if exists categorii_rezumat_murdar on public.categories;
create trigger categorii_rezumat_murdar
  after insert or update or delete on public.categories
  for each row
  execute function public.trg_categorii_rezumat_murdar();

/*
 * `catalog_pagina`, recreata cu poarta de categorii stinse.
 *
 * Corpul e cel din `2026-08-11-catalog-pagina.sql`, cu doua randuri in plus:
 * `v_ascunse` si conditia din CTE-ul `vizibile`. Se recreeaza intreaga fiindca
 * `create or replace function` nu are alta forma — motiv in plus ca filtrul sa
 * stea in `vizibile`, langa celelalte doua comutatoare de vizibilitate ale
 * magazinului, si nu imprastiat prin `filtrate`.
 */
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
  -- Categoriile stinse ale magazinului, citite O DATA pe apel.
  v_ascunse    text[] := public.categorii_ascunse(p_business);
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
       /*
        * Categoriile stinse. `c.category is null` PRIMA, nu din prudenta: un
        * produs fara categorie da `null <> all (...)` = NULL, adica ar fi cazut
        * din catalog fara ca nimeni sa fi stins nimic.
        */
       and (c.category is null or c.category <> all (v_ascunse))
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

/*
 * `catalog_candidati`, recreata cu aceeasi poarta.
 *
 * Corpul e cel din `2026-08-16-catalog-cauta-filtre.sql`, cu `ascunse` in CTE-ul
 * `filtru` si conditia in `where`. Filtrele celor doua functii sunt copiate
 * litera cu litera una din alta prin constructie; o categorie stinsa care ar fi
 * disparut din grila dar nu si din cautare e exact felul de divergenta pe care
 * fisierul acela o numeste ca fiind garantata daca regulile se scriu de doua ori.
 */
create or replace function public.catalog_candidati(
  p_business uuid,
  p_cuvinte  text[],
  p_filtre   jsonb
) returns table (product_id uuid)
language sql
stable
security definer
set search_path to 'public', 'pg_temp', 'extensions'
as $$
  with cerute as (
    select w, public.semnatura_cuvant(w) as semn,
           case when length(w) >= 7 then 2 when length(w) >= 4 then 1 else 0 end as buget
      from unnest(coalesce(p_cuvinte, '{}'::text[])) w
     where length(w) >= 1
  ),
  potrivite as (
    select distinct c.w as cerut, v.cuvant
      from cerute c
      join public.catalog_cuvant v
        on v.business_id = p_business
       and (
         -- 1. exact si prefix: `d === q`, `d.startsWith(q)`
         v.cuvant like c.w || '%'
         -- 2. subsir, doar de la 3 litere: `ql >= 3 && d.includes(q)`
         or (length(c.w) >= 3 and v.cuvant like '%' || c.w || '%')
         -- 3. greseli de tastare pe cuvantul intreg: `editDistanceWithin(q, d, budget)`
         or (c.buget > 0
             and extensions.levenshtein_less_equal(v.cuvant, c.w, c.buget) <= c.buget)
         -- 4. prefix tolerant la greseli — ramura „ultimul cuvant se tasteaza inca".
         or (c.buget > 0 and length(v.cuvant) > length(c.w) and exists (
              select 1 from generate_series(greatest(1, length(c.w) - 1), length(c.w) + c.buget) k
               where extensions.levenshtein_less_equal(left(v.cuvant, k), c.w, c.buget) <= c.buget
                  or public.semnatura_cuvant(left(v.cuvant, k)) = c.semn))
         -- 5. semnatura — literele SORTATE (transpozitiile, pe care `levenshtein`
         -- le numara ca doua editari iar motorul ca una).
         or v.semnatura = c.semn
       )
  ),
  pe_cerut as (
    select distinct p.cerut, i.product_id
      from potrivite p
      join public.catalog_index_cuvant i
        on i.business_id = p_business and i.cuvant = p.cuvant
  ),
  gasite as (
    select g.product_id
      from pe_cerut g
     group by g.product_id
    having count(*) = (select count(*) from cerute)
  ),
  /*
   * Filtrele, citite O DATA, cu ACELEASI formule ca in `catalog_pagina`.
   *
   * Testul pe tip e POZITIV (`= 'array'`), nu negativ, si asta nu e stil.
   * `jsonb_typeof` pe o cheie ABSENTA da SQL NULL, iar `NULL <> 'array'` e NULL,
   * nu `true` — deci un lant de `or`-uri construit pe negatie se evalueaza NULL si
   * arunca fiecare rand. Prima versiune a functiei asteia facea exact asta si
   * intorcea ZERO candidati la orice interogare, fara nicio eroare.
   */
  filtru as (
    select coalesce((p_filtre->>'faraImagini')::boolean, false)     as fara_img,
           coalesce((p_filtre->>'faraStocAscuns')::boolean, false)  as fara_stoc_ascuns,
           case when jsonb_typeof(p_filtre->'categorii') = 'array'
                then (select array_agg(x #>> '{}') from jsonb_array_elements(p_filtre->'categorii') x)
                else null end                                      as categorii,
           public.categorii_ascunse(p_business)                     as ascunse,
           nullif(p_filtre->>'pretMin', '')::numeric               as pmin,
           nullif(p_filtre->>'pretMax', '')::numeric               as pmax,
           coalesce((p_filtre->>'reduceri')::boolean, false)        as reduceri,
           coalesce((p_filtre->>'stoc')::boolean, false)            as stoc,
           case when jsonb_typeof(p_filtre->'fatete') = 'array'
                then p_filtre->'fatete' else '[]'::jsonb end        as grupuri
  )
  select c.product_id
    from public.catalog_produs c
    join gasite g on g.product_id = c.product_id
   cross join filtru f
   where c.business_id = p_business
     and (not f.fara_img or c.are_imagine)
     and (not f.fara_stoc_ascuns or not c.fara_stoc)
     -- Categoriile stinse, cu aceeasi paza pe `null` ca in `catalog_pagina`.
     and (c.category is null or c.category <> all (f.ascunse))
     and (f.categorii is null or c.category = any (f.categorii))
     and (f.pmin is null or c.price_min >= f.pmin)
     and (f.pmax is null or c.price_min <= f.pmax)
     and (not f.reduceri or (c.compare_at_price is not null and c.compare_at_price > c.price_min))
     and (not f.stoc or not c.fara_stoc)
     and (
       jsonb_array_length(f.grupuri) = 0
       or not exists (
         select 1
           from jsonb_array_elements(f.grupuri) g2
          where jsonb_typeof(g2) = 'array'
            and not (c.fatete && (select array_agg(x #>> '{}') from jsonb_array_elements(g2) x))
       )
     )
$$;

revoke all on function public.catalog_candidati(uuid, text[], jsonb) from public, anon, authenticated;

/*
 * `catalog_randuri`, recreata cu aceeasi poarta, in toate cele PATRU randuri.
 *
 * Corpul e cel din `2026-08-12-catalog-randuri.sql`. Poarta se pune si la
 * „Recomandate", si la pachete, nu doar la randurile de categorie: un produs
 * dintr-un raion stins care ramane pe prima pagina fiindca e bifat „recomandat"
 * e chiar cazul pe care comerciantul crede ca l-a rezolvat cand a stins raionul.
 */
create or replace function public.catalog_randuri(
  p_business uuid,
  p_spec     jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_fara_img  boolean := coalesce((p_spec->>'faraImagini')::boolean, false);
  v_fara_stoc boolean := coalesce((p_spec->>'faraStocAscuns')::boolean, false);
  v_featured  int     := coalesce((p_spec->>'featuredLimit')::int, 0);
  v_sectiuni  jsonb   := case when jsonb_typeof(p_spec->'sectiuni') = 'array'
                              then p_spec->'sectiuni' else '[]'::jsonb end;
  -- Categoriile stinse ale magazinului, citite O DATA pe apel.
  v_ascunse   text[]  := public.categorii_ascunse(p_business);
  v_out       jsonb   := '{}'::jsonb;
  v_randuri   jsonb;
  s           jsonb;
  v_mod       text;
  v_lim       int;
  v_ids       uuid[];
  v_cat       text[];
begin
  -- Aceeasi poarta ca `catalog_pagina`: publicat, sau proprietarul lui.
  -- `auth.uid()`, nu un argument — un argument ar fi forjabil cu cheia anon.
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('featured', '[]'::jsonb, 'sectiuni', '{}'::jsonb);
  end if;

  -- Randul „Recomandate": produsele marcate, in ordinea de catalog.
  if v_featured > 0 then
    select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
      into v_randuri
      from (
        select c.* from public.catalog_produs c
         where c.business_id = p_business
           and c.is_featured
           and (not v_fara_img  or c.are_imagine)
           and (not v_fara_stoc or not c.fara_stoc)
           and (c.category is null or c.category <> all (v_ascunse))
         order by c.sort_order, c.product_id
         limit least(v_featured, 96)
      ) t;
    v_out := jsonb_set(v_out, '{featured}', v_randuri);
  else
    v_out := jsonb_set(v_out, '{featured}', '[]'::jsonb);
  end if;

  v_out := jsonb_set(v_out, '{sectiuni}', '{}'::jsonb);

  for s in select * from jsonb_array_elements(v_sectiuni) loop
    v_mod := s->>'mode';
    -- Acelasi plafon ca `SECTION_MAX` din store-sections.ts.
    v_lim := least(greatest(coalesce((s->>'limit')::int, 8), 1), 24);

    if v_mod = 'selected' then
      -- Ordinea ALEASA DE MANA de comerciant, nu cea de catalog. `array_position`
      -- pe lista trimisa e echivalentul lui `order.get(id)` din TS.
      v_ids := case when jsonb_typeof(s->'productIds') = 'array'
                    then (select array_agg((x #>> '{}')::uuid) from jsonb_array_elements(s->'productIds') x)
               end;
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and v_ids is not null and c.product_id = any(v_ids)
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
             and (c.category is null or c.category <> all (v_ascunse))
           order by array_position(v_ids, c.product_id)
           limit v_lim
        ) t;

    elsif v_mod = 'category' then
      -- `categorii` vine gata rezolvat din TS (subarborele, daca sectiunea il cere).
      -- Pachetele INTRA, ca la filtrul principal de categorie: altfel sectiunea si
      -- linkul ei „Vezi toate" ar arata liste diferite.
      v_cat := case when jsonb_typeof(s->'categorii') = 'array'
                    then (select array_agg(x #>> '{}') from jsonb_array_elements(s->'categorii') x)
               end;
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and v_cat is not null and c.category = any(v_cat)
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
             and (c.category is null or c.category <> all (v_ascunse))
           order by (case when c.is_featured then 0 else 1 end), c.sort_order, c.product_id
           limit v_lim
        ) t;

    else
      -- „Pachete"
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and c.is_bundle
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
             and (c.category is null or c.category <> all (v_ascunse))
           order by (case when c.is_featured then 0 else 1 end), c.sort_order, c.product_id
           limit v_lim
        ) t;
    end if;

    -- Sectiunile goale raman goale aici; cine le arunca e apelantul, cu aceeasi
    -- regula ca azi (`items.length > 0`).
    v_out := jsonb_set(v_out, array['sectiuni', s->>'id'], coalesce(v_randuri, '[]'::jsonb));
  end loop;

  return v_out;
end;
$$;

revoke all on function public.catalog_randuri(uuid, jsonb) from public;
grant execute on function public.catalog_randuri(uuid, jsonb) to anon, authenticated, service_role;

-- Fara asta, PostgREST nu vede coloana si functia noua si raspunde cu forma
-- veche pana la urmatorul reload de schema, care poate intarzia oricat.
notify pgrst, 'reload schema';

-- Copia de siguranta a mutarii celor 557 de produse de pe nume orfane
-- (`zz_backup_categorii_okxi_20260812`) nu se citeste si nu se scrie de nimeni in
-- afara cheii de serviciu.
--
-- Tabelele noi din `public` primesc din oficiu toate drepturile pentru `anon` si
-- `authenticated` — deci, fara randul asta, oricine are cheia publica putea face
-- TRUNCATE pe singurul lucru care poate anula mutarea. Fara nicio politica, RLS
-- inchide tabelul pentru amandoua rolurile; `service_role` trece pe deasupra.
--
-- ⚠ `zz_backup_preturi_bricosmart_20260804` e in aceeasi situatie si a ramas
-- neatinsa aici: e copia altei operatiuni, si nu se schimba pe furis din
-- migratia asta.
do $$ begin
  if to_regclass('public.zz_backup_categorii_okxi_20260812') is not null then
    execute 'alter table public.zz_backup_categorii_okxi_20260812 enable row level security';
  end if;
end $$;
