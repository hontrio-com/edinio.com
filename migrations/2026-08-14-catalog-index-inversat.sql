-- Indexul inversat, si cautarea peste el.
--
-- DRUMUL PANA AICI, ca sa nu se refaca. Doua abordari au picat inainte:
--   1. trigrame pe `cauta_norm` — dar acela e un DOCUMENT (nume + categorie +
--      optiuni + descriere), iar `similarity(document_lung, cuvant_scurt)` e
--      aproape zero INTOTDEAUNA. „bocani" scris gresit dadea ZERO candidati.
--   2. vocabular + `cauta_norm LIKE '%cuvant%'` — potrivirea de cuvinte mergea,
--      dar LIKE-ul nu poate folosi niciun index: scaneaza documentul fiecarui
--      produs pentru fiecare cuvant potrivit. A EXPIRAT si pentru un singur cuvant.
--
-- Ce lipsea era lista de aparitii. Masurat inainte de a o construi: eSAFE 98.661
-- perechi cuvant-produs (29 de cuvinte per produs), bricosmart 29.637.
create table if not exists public.catalog_index_cuvant (
  business_id uuid not null references public.businesses(id) on delete cascade,
  cuvant      text not null,
  product_id  uuid not null references public.products(id) on delete cascade,
  primary key (business_id, cuvant, product_id)
);
alter table public.catalog_index_cuvant enable row level security;

comment on table public.catalog_index_cuvant is
  'Index inversat pentru cautare: (magazin, cuvant) -> produs. Se reface odata cu vocabularul.';

-- Reface vocabularul SI indexul, dintr-o singura despicare. Despicarea oglindeste
-- `tokenize()` din product-search.ts; `cauta_norm` vine deja normalizat din TS.
create or replace function public.catalog_reface_cuvinte(p_business uuid)
returns int language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_nr int;
begin
  create temporary table if not exists _per (cuvant text, product_id uuid) on commit drop;
  delete from _per;
  insert into _per (cuvant, product_id)
  select distinct w, c.product_id
    from public.catalog_produs c
    cross join lateral regexp_split_to_table(
      regexp_replace(regexp_replace(c.cauta_norm, '([0-9])([a-z])', '\1 \2', 'g'),
                     '([a-z])([0-9])', '\1 \2', 'g'), '[^a-z0-9]+') w
   where c.business_id = p_business and length(w) >= 3;

  delete from public.catalog_cuvant
   where business_id = p_business and cuvant not in (select cuvant from _per);
  insert into public.catalog_cuvant (business_id, cuvant, cate)
  select p_business, cuvant, count(*) from _per group by cuvant
  on conflict (business_id, cuvant) do update set cate = excluded.cate;

  -- Se sterge intai ce nu mai e, apoi se adauga ce lipseste: un `delete` total
  -- urmat de `insert` ar lasa cautarea GOALA intre ele.
  delete from public.catalog_index_cuvant i
   where i.business_id = p_business
     and not exists (select 1 from _per p where p.cuvant = i.cuvant and p.product_id = i.product_id);
  insert into public.catalog_index_cuvant (business_id, cuvant, product_id)
  select p_business, cuvant, product_id from _per on conflict do nothing;

  select count(distinct cuvant) into v_nr from _per;
  return v_nr;
end;
$$;
revoke all on function public.catalog_reface_cuvinte(uuid) from public, anon, authenticated;
grant execute on function public.catalog_reface_cuvinte(uuid) to service_role;

-- Candidatii unei cautari. NU scoruri, NU ordinea finala — alea raman in
-- `product-search.ts`, rulate pe candidati. Acelasi cod, alt set de intrare,
-- deci ranking identic prin CONSTRUCTIE.
--
-- SI intre cuvintele cerute, nu SAU: cu SAU, „manusa protectie" dadea 600 de
-- candidati (plafonul) FARA rezultatele de top, fiindca „protectie" apare in
-- aproape tot catalogul unui magazin de protectia muncii.
--
-- Toate cele trei potriviri de vocabular folosesc INDEX: `%` si `like prefix` pe
-- GIN-ul de trigrame, semnatura pe btree. Cu `similarity(...) >= 0.45` — apel de
-- functie, deci evaluat pe fiecare rand — aceeasi cautare lua 316 ms; cu `%` ia 36.
create or replace function public.catalog_cauta(
  p_business uuid, p_cuvinte text[], p_limit int default 600
) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp', 'extensions'
as $$
declare v_lim int := least(greatest(coalesce(p_limit, 600), 1), 2000); v_nrc int; v_out jsonb;
begin
  if not exists (select 1 from public.businesses b
                  where b.id = p_business and (b.is_published or b.user_id = auth.uid()))
  then return '[]'::jsonb; end if;

  select count(*) into v_nrc from unnest(coalesce(p_cuvinte,'{}')) w where length(w) >= 2;
  if v_nrc = 0 then return '[]'::jsonb; end if;

  with cerute as (
    select w, public.semnatura_cuvant(w) as semn from unnest(p_cuvinte) w where length(w) >= 2
  ),
  potrivite as (
    select distinct c.w as cerut, v.cuvant
      from cerute c
      join public.catalog_cuvant v on v.business_id = p_business
       and (v.cuvant % c.w or v.cuvant like c.w || '%' or v.semnatura = c.semn)
  ),
  pe_cerut as (
    select distinct p.cerut, i.product_id
      from potrivite p
      join public.catalog_index_cuvant i on i.business_id = p_business and i.cuvant = p.cuvant
  ),
  toate as (select product_id from pe_cerut group by product_id having count(*) = v_nrc)
  select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'proiectat_la'), '[]'::jsonb) into v_out
    from (select c.* from public.catalog_produs c
            join toate t on t.product_id = c.product_id
           where c.business_id = p_business order by c.product_id limit v_lim) t;
  return v_out;
end;
$$;
revoke all on function public.catalog_cauta(uuid, text[], int) from public;
grant execute on function public.catalog_cauta(uuid, text[], int) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
