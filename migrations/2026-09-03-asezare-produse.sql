-- Asezarea produselor pe pagina principala: „amestecat" si „ordinea mea".
--
-- ═══ CE SE SCHIMBA ═══
--
-- Doar `ORDER BY`-ul din `catalog_pagina`, si numai pe doua valori NOI ale lui
-- `sortare`. Semnatura functiei ramane aceeasi, deci PostgREST n-are ce recitit
-- si nu exista fereastra in care codul cere ceva ce baza nu stie inca.
--
-- Pentru orice magazin de azi rezultatul e IDENTIC: `v_baza` e egal cu `v_sort`
-- pentru toate sortarile vechi, iar cele doua ramuri noi se aleg pe valori care
-- nu existau (`random`, `manual`).
--
-- ═══ „AMESTECAT" ═══
--
-- Ordinea e data de primii 32 de biti ai id-ului XOR o samanta.
--
-- ⚠ Samanta vine GATA AMESTECATA din TypeScript (`samantaAmestec`, `asezare.ts`).
-- SQL nu o recalculeaza. Doua motive:
--   1. o a doua implementare a amestecului s-ar putea desincroniza de prima, si
--      atunci palierul server si palierul client ar aseza altfel aceleasi produse;
--   2. amestecul are inmultiri pe 32 de biti, iar in `bigint` o inmultire de doi
--      intregi de 32 de biti DEPASESTE (4294967295 * 3266489909 > 2^63).
-- Aici ramane un singur XOR, care nu poate depasi si nu poate diverge.
--
-- Id-ul e UUID, deci bitii aia sunt deja uniformi. Coliziunile pe 32 de biti sunt
-- posibile si sunt in regula: departajarea finala pe `product_id` tine ordinea
-- TOTALA, adica paginarea nu poate arata acelasi produs pe doua pagini.
--
-- ═══ „ORDINEA MEA" ═══
--
-- `ordine` e un OBIECT `{ id: pozitie }`, construit de `hartaOrdine` in TypeScript.
-- Produsele care nu sunt in el primesc un rang mai mare decat oricare si se aseaza
-- dupa regula de rezerva (`ordineRest`).
--
-- ⚠ Obiect, nu tablou, si e o alegere MASURATA pe eSAFE (3351 de produse):
-- `array_position` peste o lista de 100 costa **13,5 ms**, fiindca se plimba prin
-- tot tabloul pentru FIECARE rand. Cautarea intr-un obiect jsonb e binara pe chei
-- sortate: **1,7 ms**. Un `left join unnest(...) with ordinality` da acelasi timp
-- (1,6 ms), dar ar fi adus doua coloane in plus care trebuiau apoi scoase din
-- randurile intoarse — o piesa in plus care se poate uita.
--
-- Al doilea castig: cheile unui obiect sunt siruri prin constructie, deci dispare
-- capcana `array_position` pe un tablou cu NULL — aceea intoarce NULL pentru TOATE
-- randurile, adica ordinea manuala ar fi disparut fara nicio eroare.

create or replace function public.catalog_pagina(
  p_business uuid,
  p_filtre   jsonb,
  p_limit    integer,
  p_offset   integer
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lim        int := least(greatest(coalesce(p_limit, 20), 1), 96);
  v_off        int := greatest(coalesce(p_offset, 0), 0);
  v_sort       text := coalesce(p_filtre->>'sortare', '');
  v_categorii  text[] := case
    when jsonb_typeof(p_filtre->'categorii') = 'array'
      then (select array_agg(x #>> '{}') from jsonb_array_elements(p_filtre->'categorii') x)
    else null end;
  v_ascunse    text[] := public.categorii_ascunse(p_business);
  v_pmin       numeric := nullif(p_filtre->>'pretMin', '')::numeric;
  v_pmax       numeric := nullif(p_filtre->>'pretMax', '')::numeric;
  v_reduceri   boolean := coalesce((p_filtre->>'reduceri')::boolean, false);
  v_stoc       boolean := coalesce((p_filtre->>'stoc')::boolean, false);
  v_fara_img   boolean := coalesce((p_filtre->>'faraImagini')::boolean, false);
  v_fara_stoc  boolean := coalesce((p_filtre->>'faraStocAscuns')::boolean, false);
  v_grupuri    jsonb := case when jsonb_typeof(p_filtre->'fatete') = 'array'
                             then p_filtre->'fatete' else '[]'::jsonb end;
  -- Samanta amestecului, deja amestecata in TypeScript. Lipsa = 0, adica ordinea
  -- bruta a id-urilor; nu e o eroare, e doar o zi ca oricare alta.
  v_samanta    bigint := coalesce(nullif(p_filtre->>'samanta', '')::bigint, 0);
  -- Harta manuala `{ id: pozitie }`. `null` cand nu e „manual" sau cand lista e goala.
  v_ordine     jsonb := case
    when jsonb_typeof(p_filtre->'ordine') = 'object' and p_filtre->'ordine' <> '{}'::jsonb
      then p_filtre->'ordine'
    else null end;
  -- Regula dupa care se aseaza randurile pe care lista manuala nu le numeste. In
  -- afara lui „manual" e chiar sortarea ceruta, deci toate magazinele de azi trec
  -- prin exact aceleasi ramuri ca inainte.
  v_baza       text := case
    when v_sort = 'manual' then coalesce(nullif(p_filtre->>'ordineRest', ''), 'newest')
    else v_sort end;
  v_out        jsonb;
begin
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
       and (not v_fara_img  or c.are_imagine)
       and (not v_fara_stoc or not c.fara_stoc)
       and (c.category is null or c.category <> all (v_ascunse))
  ),
  filtrate as (
    select v.*
      from vizibile v
     where (v_categorii is null or v.category = any(v_categorii))
       and (v_pmin is null or v.price_min >= v_pmin)
       and (v_pmax is null or v.price_min <= v_pmax)
       and (not v_reduceri or (v.compare_at_price is not null and v.compare_at_price > v.price_min))
       and (not v_stoc or not v.fara_stoc)
       and (
         jsonb_array_length(v_grupuri) = 0
         or not exists (
           select 1
             from jsonb_array_elements(v_grupuri) g
            where jsonb_typeof(g) = 'array'
              and not (v.fatete && (select array_agg(x #>> '{}') from jsonb_array_elements(g) x))
         )
       )
  ),
  pagina as (
    select f.*, count(*) over () as total_filtrate
      from filtrate f
     order by
       -- Ordinea manuala, cand exista. Cei nealesi primesc un rang mai mare decat
       -- orice pozitie posibila, deci cad toti dupa lista, unde ii asaza `v_baza`.
       case when v_sort = 'manual' and v_ordine is not null
            then coalesce((v_ordine ->> f.product_id::text)::int, 2147483647) end asc nulls last,
       case when v_baza = 'price_asc'  then f.price_min end asc  nulls last,
       case when v_baza = 'price_desc' then f.price_min end desc nulls last,
       case when v_baza = 'name_asc'   then f.name collate public.ro_numeric end asc nulls last,
       case when v_baza = 'newest'     then f.creat end desc nulls last,
       -- Perechea lui `cheieAmestec` din `asezare.ts`. Acelasi XOR, aceeasi samanta.
       case when v_baza = 'random'
            then (('x' || substr(f.product_id::text, 1, 8))::bit(32)::bigint # v_samanta) end asc nulls last,
       case when v_baza in ('price_asc','price_desc','name_asc','newest','random') then null
            else (case when f.is_featured then 0 else 1 end) end asc nulls last,
       case when v_baza in ('price_asc','price_desc','name_asc','newest','random') then null
            else f.sort_order end asc nulls last,
       f.product_id asc
     limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', coalesce((select max(total_filtrate) from pagina), 0),
    'randuri', coalesce(jsonb_agg(to_jsonb(p) - 'total_filtrate' - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
  ) into v_out
  from pagina p;

  return coalesce(v_out, jsonb_build_object('randuri', '[]'::jsonb, 'total', 0));
end;
$function$;

notify pgrst, 'reload schema';
