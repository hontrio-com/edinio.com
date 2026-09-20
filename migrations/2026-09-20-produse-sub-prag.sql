-- ═══════════════════════════════════════════════════════════════════════════
-- STOCUL SCAZUT, VAZUT SI PE VARIANTE (20.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE E NEVOIE DE O FUNCTIE, si nu ajunge o interogare din aplicatie.
--
-- Pana azi, „produs sub prag" insemna `products.stock_quantity <= 5`. La
-- produsele cu variante, numarul acela e SUMA variantelor, recalculata de
-- `sync_product_stock_from_variants`. Deci un produs cu 17 bucati in total, dar
-- cu varianta „alb mat" pe ZERO, nu aparea nicaieri: clientul care voia alb mat
-- nu putea cumpara, iar comerciantul nu afla niciodata. Masurat pe date reale
-- in baza demo, la produsul „Pendul Ember din metal".
--
-- Conditia adevarata („macar o varianta aprinsa e sub prag") se pune pe
-- elementele unui tablou JSON, iar PostgREST nu stie sa filtreze asa: din
-- aplicatie ar fi insemnat sa aducem toate produsele cu variante si sa alegem in
-- JavaScript. La un magazin cu mii de produse, asta ar fi adus tot catalogul la
-- fiecare deschidere a panoului.
--
-- ⚠ SECURITY INVOKER (implicit), dinadins: functia se vede prin ochii celui care
-- o cheama, deci politicile RLS de pe `products` raman in vigoare si nimeni nu
-- poate citi produsele altui magazin. `p_business` NU e o poarta de securitate,
-- e doar un filtru; poarta e RLS.
--
-- ⚠ Nicio semnatura nu numeste o tabela (regula din migrations/CITESTE-INTAI.md):
-- ambele intorc `table (...)` cu coloanele scrise.

-- Cat se citeste dintr-o combinatie: numarul, daca chiar e numar. Orice altceva
-- (gol, text, lipsa) se citeste ca zero, nu ca „fara stoc cunoscut": un camp
-- stricat nu are voie sa ascunda un produs epuizat.
create or replace function public.stoc_combinatie(p_combinatie jsonb)
returns numeric
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select case
           when p_combinatie ->> 'stock_quantity' ~ '^-?[0-9]+(\.[0-9]+)?$'
             then (p_combinatie ->> 'stock_quantity')::numeric
           else 0
         end
$$;

-- O combinatie stinsa nu se vinde, deci nu intra la socoteala. Lipsa campului
-- inseamna aprinsa, ca peste tot in cod.
create or replace function public.combinatie_aprinsa(p_combinatie jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select coalesce(nullif(p_combinatie ->> 'enabled', '') <> 'false', true)
$$;

-- ── Lista pentru modal ──────────────────────────────────────────────────────
create or replace function public.produse_sub_prag(p_business uuid, p_prag integer default 5)
returns table (
  id uuid,
  nume text,
  imagine text,
  stoc integer,
  variante jsonb
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with aprinse as (
    select p.id, p.name, p.images, p.stock_quantity,
           coalesce(
             (select jsonb_agg(
                       jsonb_build_object(
                         'id',   c ->> 'id',
                         'sku',  nullif(c ->> 'sku', ''),
                         'stoc', public.stoc_combinatie(c),
                         'eticheta', coalesce(
                           nullif(c ->> 'label', ''), nullif(c ->> 'title', ''),
                           nullif(c ->> 'name', ''),  c ->> 'id')
                       )
                       order by public.stoc_combinatie(c)
                     )
                from jsonb_array_elements(
                       coalesce(p.page_sections -> 'variants' -> 'combinations', '[]'::jsonb)) c
               where public.combinatie_aprinsa(c)
                 and nullif(c ->> 'id', '') is not null),
             '[]'::jsonb) as combos
      from public.products p
     where p.business_id = p_business
       and p.is_active
       and p.track_inventory
  )
  select a.id,
         a.name,
         (case when jsonb_typeof(a.images) = 'array' then a.images ->> 0 end) as imagine,
         coalesce(a.stock_quantity, 0) as stoc,
         a.combos
    from aprinse a
   where (jsonb_array_length(a.combos) = 0 and coalesce(a.stock_quantity, 0) <= p_prag)
      or exists (select 1 from jsonb_array_elements(a.combos) v
                  where (v ->> 'stoc')::numeric <= p_prag)
   order by coalesce(a.stock_quantity, 0), a.name
   limit 200
$$;

-- ── Cele doua numere de pe banda ────────────────────────────────────────────
-- `epuizate` inseamna „nu se mai poate vinde NIMIC din produs": fie produsul
-- simplu e pe zero, fie toate variantele aprinse sunt pe zero. Un produs cu o
-- singura varianta epuizata e sub prag, dar nu epuizat, si asa si scrie pe banda.
create or replace function public.numar_produse_sub_prag(p_business uuid, p_prag integer default 5)
returns table (sub_prag integer, epuizate integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with aprinse as (
    select p.stock_quantity,
           coalesce(
             (select jsonb_agg(jsonb_build_object('stoc', public.stoc_combinatie(c)))
                from jsonb_array_elements(
                       coalesce(p.page_sections -> 'variants' -> 'combinations', '[]'::jsonb)) c
               where public.combinatie_aprinsa(c)
                 and nullif(c ->> 'id', '') is not null),
             '[]'::jsonb) as combos
      from public.products p
     where p.business_id = p_business
       and p.is_active
       and p.track_inventory
  ),
  clasificate as (
    select
      ((jsonb_array_length(a.combos) = 0 and coalesce(a.stock_quantity, 0) <= p_prag)
        or exists (select 1 from jsonb_array_elements(a.combos) v
                    where (v ->> 'stoc')::numeric <= p_prag)) as e_sub_prag,
      ((jsonb_array_length(a.combos) = 0 and coalesce(a.stock_quantity, 0) <= 0)
        or (jsonb_array_length(a.combos) > 0
            and not exists (select 1 from jsonb_array_elements(a.combos) v
                             where (v ->> 'stoc')::numeric > 0))) as e_epuizat
      from aprinse a
  )
  select count(*) filter (where e_sub_prag)::integer,
         count(*) filter (where e_sub_prag and e_epuizat)::integer
    from clasificate
$$;

-- ── Drepturi ────────────────────────────────────────────────────────────────
-- Nimic pentru `public`/`anon`: sunt functii ale panoului. `authenticated` le
-- cheama, iar RLS decide ce vede fiecare.
revoke execute on function public.stoc_combinatie(jsonb) from public;
revoke execute on function public.combinatie_aprinsa(jsonb) from public;
revoke execute on function public.produse_sub_prag(uuid, integer) from public;
revoke execute on function public.numar_produse_sub_prag(uuid, integer) from public;

grant execute on function public.stoc_combinatie(jsonb) to authenticated, service_role;
grant execute on function public.combinatie_aprinsa(jsonb) to authenticated, service_role;
grant execute on function public.produse_sub_prag(uuid, integer) to authenticated, service_role;
grant execute on function public.numar_produse_sub_prag(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
