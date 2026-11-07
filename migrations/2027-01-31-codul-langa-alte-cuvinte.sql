-- Codul de produs se gaseste si cand e scris LANGA alte cuvinte („vesta C494").
--
-- ═══ DE CE (05.11.2026) ═══
--
-- Migratia 2027-01-30 compara codul cu TOATA interogarea lipita: „C494" mergea, dar
-- „vesta C494" devenea „vestac494", care nu e codul nimanui, deci zero rezultate. Masurat
-- pe esafe.ro (palierul server) si pe caian-textile (palierul client).
--
-- Acum orice sir de cuvinte ALATURATE (cel mult 8), lipite la loc, de minim trei caractere,
-- poate fi codul: `bucatiDeCod` din product-search.ts genereaza aceleasi bucati. Regula de
-- potrivire ramane cea din `scorCod`: codul intreg mereu, inceputul doar cand bucata are o
-- cifra. SQL-ul doar ALEGE candidatii (un superset e voie); ca restul cuvintelor potrivesc
-- produsul verifica motorul din Node, exact ca in browser.
--
-- ⚠ Bucatile se calculeaza O DATA pe cautare si comparatia sta in interogare, nu intr-o
-- functie pe rand: o functie cu `search_path` propriu nu se poate insera in plan, iar chemata
-- pentru fiecare produs x fiecare bucata costa 1,2 s pe eSAFE (3.351 produse). Asa: ~150 ms
-- la sase cuvinte, masurat.
--
-- Compatibila cu codul vechi: semnaturile `catalog_cauta`/`catalog_candidati` raman.

create or replace function public.catalog_bucati_cod(p_cuvinte text[])
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select coalesce(array_agg(distinct x), '{}'::text[])
    from (select array_to_string(p_cuvinte[i:j], '') as x
            from generate_subscripts(coalesce(p_cuvinte, '{}'::text[]), 1) i
           cross join lateral generate_series(i, least(cardinality(p_cuvinte), i + 7)) j) z
   where length(x) >= 3;
$function$;

revoke execute on function public.catalog_bucati_cod(text[]) from public, anon, authenticated;
grant execute on function public.catalog_bucati_cod(text[]) to service_role;

create or replace function public.catalog_candidati(p_business uuid, p_cuvinte text[], p_filtre jsonb)
 returns table(product_id uuid)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp', 'extensions'
as $function$
  with bucati as (select public.catalog_bucati_cod(p_cuvinte) as b),
  cerute as (
    select w, public.semnatura_cuvant(w) as semn,
           case when length(w) >= 7 then 2 when length(w) >= 4 then 1 else 0 end as buget
      from unnest(coalesce(p_cuvinte, '{}'::text[])) w
     where length(w) >= 1
       -- ⚠ Cu un cuvant sub trei litere, ramura pe cuvinte NU ruleaza: vocabularul incepe de
       -- la trei litere, iar `catalog_cauta` ajunge aici cu el doar cand codul a gasit ceva.
       and not exists (select 1 from unnest(coalesce(p_cuvinte, '{}'::text[])) z where length(z) < 3)
  ),
  potrivite as (
    select distinct c.w as cerut, v.cuvant
      from cerute c
      join public.catalog_cuvant v
        on v.business_id = p_business
       and (
         v.cuvant like c.w || '%'
         or (length(c.w) >= 3 and v.cuvant like '%' || c.w || '%')
         or (c.buget > 0
             and extensions.levenshtein_less_equal(v.cuvant, c.w, c.buget) <= c.buget)
         or (c.buget > 0 and length(v.cuvant) > length(c.w) and exists (
              select 1 from generate_series(greatest(1, length(c.w) - 1), length(c.w) + c.buget) k
               where extensions.levenshtein_less_equal(left(v.cuvant, k), c.w, c.buget) <= c.buget
                  or public.semnatura_cuvant(left(v.cuvant, k)) = c.semn))
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
    union
    -- Produsele gasite dupa COD, si cand e scris langa alte cuvinte. Vezi 2027-01-31.
    select c.product_id
      from public.catalog_produs c, bucati
     where c.business_id = p_business
       and cardinality(bucati.b) > 0
       and (c.coduri && bucati.b
            or exists (select 1 from unnest(c.coduri) k, unnest(bucati.b) p
                        where p ~ '[0-9]' and k like p || '%'))
  ),
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
$function$;

create or replace function public.catalog_cauta(p_business uuid, p_cuvinte text[], p_filtre jsonb, p_plafon integer default 3000)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp', 'extensions'
as $function$
declare
  v_plafon    int := least(greatest(coalesce(p_plafon, 3000), 1), 6000);
  v_vocabular int;
  v_nr        int;
  v_out       jsonb;
  v_bucati    text[] := public.catalog_bucati_cod(p_cuvinte);
begin
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false, 'cuvant_scurt', false);
  end if;

  select count(*) into v_vocabular from public.catalog_cuvant where business_id = p_business;
  if v_vocabular = 0 then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false, 'cuvant_scurt', false);
  end if;

  -- ⚠ Un cuvant scurt nu mai inchide cautarea cand interogarea e un COD gasit: „C494" se
  -- tokenizeaza „c" + „494". Fara potrivire de cod, purtarea e cea de pana acum.
  if exists (select 1 from unnest(coalesce(p_cuvinte, '{}'::text[])) w where length(w) < 3)
     and not exists (
       select 1 from public.catalog_produs c
        where c.business_id = p_business
          and cardinality(v_bucati) > 0
          and (c.coduri && v_bucati
               or exists (select 1 from unnest(c.coduri) k, unnest(v_bucati) p
                           where p ~ '[0-9]' and k like p || '%'))
     ) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular,
                              'prea_larg', false, 'cuvant_scurt', true);
  end if;

  select count(*) into v_nr from public.catalog_candidati(p_business, p_cuvinte, p_filtre);
  if v_nr > v_plafon then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular, 'prea_larg', true, 'cuvant_scurt', false);
  end if;

  select coalesce(
           jsonb_agg(to_jsonb(c) - 'business_id' - 'cauta_norm' - 'proiectat_la'),
           '[]'::jsonb)
    into v_out
    from public.catalog_produs c
    join public.catalog_candidati(p_business, p_cuvinte, p_filtre) k
      on k.product_id = c.product_id;

  return jsonb_build_object(
    'randuri', coalesce(v_out, '[]'::jsonb),
    'vocabular', v_vocabular,
    'prea_larg', false,
    'cuvant_scurt', false);
end;
$function$;

-- Inlocuita de comparatia din interogari; nu o mai cheama nimeni.
drop function if exists public.catalog_potriveste_cod(text[], text);

notify pgrst, 'reload schema';
