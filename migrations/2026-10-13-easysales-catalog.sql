-- easySales, CATALOGUL (E3) - 13.10.2026. Dupa `2026-10-13-easysales-comenzi.sql` (73).
--
-- Aplicata pe productie pe 15.10.2026, la pornirea E3, la cererea proprietarului („sa poata fi
-- folosit fara testare”): FARA proba pe contul de test, deci fara M-PROD-1..7 si M-CAT-1 masurate.
-- Pana atunci a stat in `docs/marketplace/` (in `migrations/` intra numai ce e deja in productie),
-- aplicata si probata numai pe DEMO (`docs/redesign/REGISTRU.md`, randul 74). Comutatorul din cod e
-- `CATALOG_PORNIT` (`src/lib/easysales/constante.ts`); proba
-- `src/lib/easysales/catalogul-si-migratia-merg-impreuna.test.ts` cere ca el si locul fisierului sa
-- se schimbe impreuna. Stocul real (E4) ramane oprit: asteapta M-STOC-1.
--
-- Ce atinge:
--   1. `easysales_produse`: starile `respins`, `disparut`, `exclus`; amprenta continutului trimis,
--      preturile si stocul trimise, verificarea, arhivarea;
--   2. `easysales_categorii`: id-ul trimis al fiecarei categorii (cheia: id-ul categoriei Edinio sau
--      `#fara-categorie`, categoria de rezerva);
--   3. `easysales_caracteristici`: unica pe `(business_id, cheie_normalizata)`;
--   4. `easysales_joburi`: incarcarea si verificarea, reluabile pe mai multe treceri ale cronului;
--   5. `easysales_fara_stoc(jsonb)` si `easysales_variante_pe(jsonb, text[])`: ce din `page_sections`
--      e continut, ce e pret si ce e stoc;
--   6. declansatorul `easysales_marcheaza_produsul` pe `products` (INSERT, DELETE si UPDATE OF ...),
--      numai pentru magazinele cu catalogul pornit, si `easysales_marcheaza_categoria` pe `categories`;
--   7. `easysales_pune_catalogul_in_coada`: tot catalogul magazinului, intr-o singura instructiune
--      (pornirea catalogului, schimbarea domeniului, a permalinkurilor sau a TVA-ului);
--   8. `easysales_revendica_catalogul`: revendicarea pe magazin si pe operatie, ca preturile si stocul
--      sa plece cate 100 pe cerere, nu cate unul;
--   9. bucla de stoc (E4, fara alta migratie): stocul vazut la ei si deriva pe articol, liniile unei
--      vanzari externe (consumate sau, in umbra, „ce as consuma").

-- ---------------------------------------------------------------------------
-- 1. `easysales_produse`: starile catalogului si urma trimiterilor
-- ---------------------------------------------------------------------------
-- Starile:
--   nou        alocat (de o linie de comanda, E2, sau de catalog), netrimis ca produs;
--   de_trimis  eligibil, asteapta (de exemplu imaginile);
--   trimis     plecat intr-un lot; asteapta verificarea (un lot reusit intoarce `data: null` [A]);
--   confirmat  vazut la ei, cu ambii martori (`product_website_id` si `sku`);
--   blocat     neeligibil, cu motivul in `motiv`;
--   respins    422 pe element, cu mesajul lor in `motiv`;
--   disparut   confirmat candva, lipsa acum la ei: NU se recreeaza singur (hotararea omului);
--   exclus     scos de om din catalog;
--   arhivat    arhivat la ei: nu mai intra in nicio impingere (stoc, pret, continut).

alter table public.easysales_produse
  add column if not exists amprenta text,
  add column if not exists pret_trimis numeric(12,2),
  add column if not exists pret_vechi_trimis numeric(12,2),
  add column if not exists stoc_trimis integer,
  add column if not exists verificat_la timestamptz,
  add column if not exists lipsa_la timestamptz,
  add column if not exists retrimis_la timestamptz,
  add column if not exists arhivare_blocata_de_la timestamptz,
  add column if not exists arhivat_la timestamptz,
  -- E4: stocul vazut la ei la ultima citire a listei lor, si prima observatie a unei derive in jos
  -- neexplicate (a doua la rand porneste alarma, planul §5.5).
  add column if not exists stoc_la_ei integer,
  add column if not exists stoc_la_ei_la timestamptz,
  add column if not exists deriva_la timestamptz;

-- E4: liniile unei comenzi venite de la ei (`directie = 'intrare'`), cum s-au consumat in Edinio sau,
-- in umbra, cum s-ar fi consumat: `[{product_id, variant_title, quantity, sku}]`. Fara date personale.
alter table public.easysales_comenzi add column if not exists linii jsonb;

alter table public.easysales_produse drop constraint if exists easysales_produse_stare_check;
alter table public.easysales_produse add constraint easysales_produse_stare_check check (stare = any (array[
  'nou', 'de_trimis', 'trimis', 'confirmat', 'blocat', 'respins', 'disparut', 'exclus', 'arhivat'
]::text[]));

create index if not exists easysales_produse_stare_idx
  on public.easysales_produse (business_id, stare);

-- ---------------------------------------------------------------------------
-- 2. Categoriile
-- ---------------------------------------------------------------------------
-- `id` e `category_website_id` [A: „Category id used in your app"], din secventa comuna. Numele
-- trimis e calea („Femei > Rochii"); produsul primeste numai frunza (D23).
-- `nume_edinio` e numele propriu al categoriei la ultima sincronizare: cand categoria se sterge din
-- Edinio, produsele care o purtau dupa nume trebuie retrimise (ajung in categoria de rezerva).

create table if not exists public.easysales_categorii (
  id bigint primary key default nextval('public.easysales_id_seq'),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  cheie text not null,
  nume_edinio text,
  nume_trimis text,
  es_category_id text,
  stare text not null default 'de_trimis',
  motiv text,
  trimis_la timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint easysales_categorii_cheie unique (business_id, cheie),
  constraint easysales_categorii_stare_check check (stare = any (array[
    'de_trimis', 'trimis', 'respins', 'scoasa'
  ]::text[]))
);

comment on table public.easysales_categorii is
  'Categoriile trimise la easySales. id = category_website_id. O categorie stearsa din Edinio ramane '
  'aici, `scoasa`: la ei se sterge numai printr-o hotarare (E5), fiindca o categorie atasata da 422.';

create index if not exists easysales_categorii_categorie_idx
  on public.easysales_categorii (category_id);

-- ---------------------------------------------------------------------------
-- 3. Caracteristicile
-- ---------------------------------------------------------------------------
-- Cheia normalizata: fara diacritice, cu litere mici, cu spatiile stranse („Mărime " si „MARIME"
-- sunt una). `id` e `characteristic_website_id`.

create table if not exists public.easysales_caracteristici (
  id bigint primary key default nextval('public.easysales_id_seq'),
  business_id uuid not null references public.businesses(id) on delete cascade,
  cheie_normalizata text not null,
  nume text not null,
  es_characteristic_id text,
  stare text not null default 'de_trimis',
  motiv text,
  trimis_la timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint easysales_caracteristici_cheie unique (business_id, cheie_normalizata),
  constraint easysales_caracteristici_stare_check check (stare = any (array[
    'de_trimis', 'trimis', 'respins'
  ]::text[]))
);

-- ---------------------------------------------------------------------------
-- 4. Joburile: incarcarea si verificarea, pe felii
-- ---------------------------------------------------------------------------
-- Un singur job viu pe (magazin, fel). `revendicat_pana` tine doua treceri suprapuse ale cronului
-- departe de aceeasi felie; `pagina`/`ultima_pagina`/`total` sunt ale listei lor
-- (`GET /products?website=&page=N`, 50 pe pagina [A]).

create table if not exists public.easysales_joburi (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  fel text not null,
  stare text not null default 'in_lucru',
  pagina integer not null default 0,
  ultima_pagina integer,
  total integer,
  contoare jsonb not null default '{}'::jsonb,
  eroare text,
  revendicat_pana timestamptz,
  pornit_la timestamptz not null default now(),
  actualizat_la timestamptz not null default now(),
  terminat_la timestamptz,
  constraint easysales_joburi_fel_check check (fel = any (array['incarcare', 'verificare']::text[])),
  constraint easysales_joburi_stare_check check (stare = any (array['in_lucru', 'gata', 'oprit', 'esuat']::text[]))
);

create unique index if not exists easysales_joburi_unul_viu
  on public.easysales_joburi (business_id, fel) where stare = 'in_lucru';
create index if not exists easysales_joburi_magazin_idx
  on public.easysales_joburi (business_id, pornit_la desc);

-- ---------------------------------------------------------------------------
-- 5. Ce din `page_sections` e continut, ce e pret, ce e stoc
-- ---------------------------------------------------------------------------
-- ⚠ O miscare de stoc nu are voie sa para o schimbare de continut: la fiecare comanda,
-- `revendica_stoc_complet` scrie in `products`, iar fara curatarea de aici fiecare vanzare ar
-- retrimite produsul intreg. Stocul combinatiilor (`stock_quantity`), `stock_status` si pragul de
-- stoc scazut (care nu pleaca la ei) ies din comparatia continutului.

create or replace function public.easysales_fara_stoc(p jsonb)
returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then p
    when jsonb_typeof(p -> 'variants') = 'object' and jsonb_typeof(p -> 'variants' -> 'combinations') = 'array' then
      jsonb_set(p - 'stock_status' - 'low_stock_threshold', '{variants,combinations}',
        (select coalesce(jsonb_agg(case when jsonb_typeof(e.c) = 'object' then e.c - 'stock_quantity' else e.c end order by e.o), '[]'::jsonb)
           from jsonb_array_elements(p -> 'variants' -> 'combinations') with ordinality as e(c, o)))
    else p - 'stock_status' - 'low_stock_threshold'
  end
$$;

-- Combinatiile, fiecare redusa la cheile cerute, in ordinea din date. Pentru pret:
-- `title, price, compare_at_price`; pentru stoc: `title, stock_quantity`.
create or replace function public.easysales_variante_pe(p jsonb, p_chei text[])
returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(
           case when jsonb_typeof(e.c) = 'object'
                then (select coalesce(jsonb_object_agg(k.k, e.c -> k.k), '{}'::jsonb)
                        from unnest(p_chei) as k(k) where e.c ? k.k)
                else e.c end
           order by e.o), '[]'::jsonb)
    from jsonb_array_elements(
           case when jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'variants') = 'object'
                     and jsonb_typeof(p -> 'variants' -> 'combinations') = 'array'
                then p -> 'variants' -> 'combinations' else '[]'::jsonb end
         ) with ordinality as e(c, o)
$$;

-- ---------------------------------------------------------------------------
-- 6. Declansatorii
-- ---------------------------------------------------------------------------
-- ⚠ PRINDE SI INSERAREA, SI STERGEREA. `aboutyou_marcheaza_modificarea` e AFTER UPDATE OF, fara
-- INSERT si fara DELETE: un produs nou sau unul sters nu ajungea la About You. Aici ajung.
--
-- ⚠ PAZA IEFTINA E IN AFARA BLOCULUI DE EXCEPTIE. Un bloc `exception` e o subtranzactie; o
-- actualizare in masa de 45.000 de produse (feedul de stoc, un import) ar deschide 45.000 de
-- subtranzactii si pe un magazin care nici n-are easySales. Pentru magazinele fara catalog pornit,
-- declansatorul iese dupa o singura citire pe cheie.
--
-- ⚠ BLOCUL DE EXCEPTIE RAMANE pentru magazinele cu catalog: declansatorul sta pe drumul checkout-ului
-- (`revendica_stoc_complet` scrie in `products`), iar o eroare de-a noastra n-are voie sa opreasca o
-- comanda. Ce scapa aici prinde plasa zilnica (verificarea).
--
-- Clasificarea (planul, §5.4.6): pret -> `articol_pret`; stoc (`stock_quantity`, stocul
-- combinatiilor, `track_inventory`, `stock_status`, `is_active`) -> `articol_stoc`; restul, cu
-- `page_sections` fara cheile de stoc -> `articol_continut`; stergere -> `articol_sterge`. O singura
-- inserare comasata in coada, cu prioritatile: stoc 3, pret 4, continut 5, stergere 6.

create or replace function public.easysales_marcheaza_produsul()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_b   uuid;
  v_id  uuid;
  v_ops text[] := array[]::text[];
begin
  if tg_op = 'DELETE' then
    v_b := old.business_id;
    v_id := old.id;
  else
    v_b := new.business_id;
    v_id := new.id;
  end if;

  if not exists (
    select 1 from privat.store_settings s
     where s.business_id = v_b
       and coalesce(s.easysales_config ->> 'catalog_activ', '') = 'true'
       and coalesce(s.easysales_config ->> 'connected', '') = 'true'
  ) then
    return null;
  end if;

  begin
    if tg_op = 'DELETE' then
      v_ops := array['articol_sterge'];
    elsif tg_op = 'INSERT' then
      -- Primul Save poarta si pretul, si stocul [A: `sale_price`, `stock` obligatorii].
      v_ops := array['articol_continut'];
    else
      if new.price is distinct from old.price
         or new.compare_at_price is distinct from old.compare_at_price
         or public.easysales_variante_pe(new.page_sections, array['title', 'price', 'compare_at_price'])
            is distinct from public.easysales_variante_pe(old.page_sections, array['title', 'price', 'compare_at_price']) then
        v_ops := v_ops || 'articol_pret'::text;
      end if;
      if new.stock_quantity is distinct from old.stock_quantity
         or new.track_inventory is distinct from old.track_inventory
         or new.is_active is distinct from old.is_active
         or (new.page_sections -> 'stock_status') is distinct from (old.page_sections -> 'stock_status')
         or public.easysales_variante_pe(new.page_sections, array['title', 'stock_quantity'])
            is distinct from public.easysales_variante_pe(old.page_sections, array['title', 'stock_quantity']) then
        v_ops := v_ops || 'articol_stoc'::text;
      end if;
      if new.name is distinct from old.name
         or new.description is distinct from old.description
         or new.images is distinct from old.images
         or new.category is distinct from old.category
         or new.sku is distinct from old.sku
         or new.weight_grams is distinct from old.weight_grams
         or new.slug is distinct from old.slug
         or new.is_bundle is distinct from old.is_bundle
         or new.is_active is distinct from old.is_active
         or new.track_inventory is distinct from old.track_inventory
         or public.easysales_fara_stoc(new.page_sections) is distinct from public.easysales_fara_stoc(old.page_sections) then
        v_ops := v_ops || 'articol_continut'::text;
      end if;
    end if;

    if cardinality(v_ops) > 0 then
      insert into public.easysales_sync_queue as q (business_id, op, cheie, prioritate)
      select v_b, o.op, v_id::text,
             (case o.op when 'articol_stoc' then 3 when 'articol_pret' then 4 when 'articol_sterge' then 6 else 5 end)::smallint
        from unnest(v_ops) as o(op)
      on conflict (business_id, op, cheie) do update
         set abandonat_la = null,
             incercari = 0,
             pauze = 0,
             next_retry_at = null,
             ultima_eroare = null,
             prioritate = least(q.prioritate, excluded.prioritate);
    end if;
  exception when others then
    raise warning 'easysales_marcheaza_produsul (%): %', v_id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists easysales_marcheaza_produsul on public.products;
create trigger easysales_marcheaza_produsul
  after insert or delete or update of name, description, price, compare_at_price, images, category, sku,
    weight_grams, page_sections, is_active, track_inventory, stock_quantity, slug, is_bundle
  on public.products
  for each row execute function public.easysales_marcheaza_produsul();

-- Categoriile: numele trimis e calea, deci o redenumire sau o mutare schimba si numele copiilor.
-- Se pune in coada arborele intreg (`*`), o singura data, oricate categorii s-ar schimba.
create or replace function public.easysales_marcheaza_categoria()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_b uuid;
begin
  if tg_op = 'DELETE' then
    v_b := old.business_id;
  else
    v_b := new.business_id;
  end if;
  if not exists (
    select 1 from privat.store_settings s
     where s.business_id = v_b
       and coalesce(s.easysales_config ->> 'catalog_activ', '') = 'true'
       and coalesce(s.easysales_config ->> 'connected', '') = 'true'
  ) then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.name is not distinct from old.name and new.parent_id is not distinct from old.parent_id then
    return null;
  end if;
  begin
    perform public.easysales_pune_in_coada(v_b, 'categorie', '*', 5);
  exception when others then
    raise warning 'easysales_marcheaza_categoria: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists easysales_marcheaza_categoria on public.categories;
create trigger easysales_marcheaza_categoria
  after insert or delete or update of name, parent_id
  on public.categories
  for each row execute function public.easysales_marcheaza_categoria();

-- ---------------------------------------------------------------------------
-- 7. Tot catalogul, intr-o singura instructiune
-- ---------------------------------------------------------------------------
-- La pornirea catalogului si cand se schimba ceva ce nu atinge `products` (domeniul, permalinkurile,
-- TVA-ul, setarile catalogului): fara asta, `url` si pretul brut ar ramane vechi la ei. Prioritatea
-- 7 lasa schimbarile individuale (3-6) sa treaca inainte.

create or replace function public.easysales_pune_catalogul_in_coada(p_business uuid, p_ops text[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_n integer := 0;
  v_k integer;
  v_op text;
begin
  if p_business is null then
    raise exception 'easysales_pune_catalogul_in_coada: magazinul e obligatoriu';
  end if;
  foreach v_op in array coalesce(p_ops, array[]::text[]) loop
    if v_op not in ('articol_continut', 'articol_pret', 'articol_stoc') then
      raise exception 'easysales_pune_catalogul_in_coada: operatie nepermisa %', v_op;
    end if;
    insert into public.easysales_sync_queue as q (business_id, op, cheie, prioritate)
    select p_business, v_op, p.id::text, 7::smallint
      from public.products p
     where p.business_id = p_business
    on conflict (business_id, op, cheie) do update
       set abandonat_la = null,
           incercari = 0,
           pauze = 0,
           next_retry_at = null,
           ultima_eroare = null,
           prioritate = least(q.prioritate, excluded.prioritate);
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Revendicarea pe magazin si pe operatie
-- ---------------------------------------------------------------------------
-- Aceeasi forma ca `revendica_din_coada` (acelasi `as materialized`, aceleasi trei clauze, acelasi
-- `to_jsonb`), restransa la un magazin si la operatiile cerute: preturile pleaca cate 100 pe cerere
-- [A: `/products/prices/bulk`], stocul la fel [A: `/stocks/bulk`], arhivarea cate 50.

create or replace function public.easysales_revendica_catalogul(
  p_business uuid, p_ops text[], p_limita integer default 100, p_lease interval default '00:05:00'::interval
)
returns setof jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_business is null or p_ops is null or cardinality(p_ops) = 0 then
    return;
  end if;
  return query
    with alese as materialized (
      select c.id from public.easysales_sync_queue c
       where c.business_id = p_business
         and c.op = any (p_ops)
         and (c.revendicat_pana is null or c.revendicat_pana < now())
         and (c.next_retry_at is null or c.next_retry_at <= now())
         and c.abandonat_la is null
       order by c.prioritate, c.created_at
       limit greatest(1, least(coalesce(p_limita, 100), 500))
       for update skip locked)
    update public.easysales_sync_queue q
       set revendicat_pana = now() + p_lease
      from alese a
     where q.id = a.id
    returning to_jsonb(q.*);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Drepturile
-- ---------------------------------------------------------------------------

alter table public.easysales_categorii      enable row level security;
alter table public.easysales_caracteristici enable row level security;
alter table public.easysales_joburi         enable row level security;

drop policy if exists owner_select_easysales_categorii on public.easysales_categorii;
create policy owner_select_easysales_categorii on public.easysales_categorii for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));

drop policy if exists owner_select_easysales_caracteristici on public.easysales_caracteristici;
create policy owner_select_easysales_caracteristici on public.easysales_caracteristici for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));

drop policy if exists owner_select_easysales_joburi on public.easysales_joburi;
create policy owner_select_easysales_joburi on public.easysales_joburi for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));

revoke insert, update, delete, truncate, references, trigger
  on table public.easysales_categorii, public.easysales_caracteristici, public.easysales_joburi
  from anon, authenticated;
grant select on table public.easysales_categorii, public.easysales_caracteristici, public.easysales_joburi
  to anon, authenticated;

revoke all on function public.easysales_fara_stoc(jsonb) from public, anon, authenticated;
grant execute on function public.easysales_fara_stoc(jsonb) to service_role;
revoke all on function public.easysales_variante_pe(jsonb, text[]) from public, anon, authenticated;
grant execute on function public.easysales_variante_pe(jsonb, text[]) to service_role;
revoke all on function public.easysales_pune_catalogul_in_coada(uuid, text[]) from public, anon, authenticated;
grant execute on function public.easysales_pune_catalogul_in_coada(uuid, text[]) to service_role;
revoke all on function public.easysales_revendica_catalogul(uuid, text[], integer, interval) from public, anon, authenticated;
grant execute on function public.easysales_revendica_catalogul(uuid, text[], integer, interval) to service_role;
revoke all on function public.easysales_marcheaza_produsul() from public, anon, authenticated;
revoke all on function public.easysales_marcheaza_categoria() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verificarile stau IN migratie.
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
  t text;
begin
  if not exists (select 1 from pg_trigger where tgname = 'easysales_marcheaza_produsul' and tgrelid = 'public.products'::regclass) then
    raise exception 'lipseste declansatorul catalogului pe products';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'easysales_marcheaza_categoria' and tgrelid = 'public.categories'::regclass) then
    raise exception 'lipseste declansatorul catalogului pe categories';
  end if;
  if position('respins' in pg_get_constraintdef((select oid from pg_constraint where conname = 'easysales_produse_stare_check'))) = 0 then
    raise exception 'starile catalogului lipsesc din easysales_produse';
  end if;
  if public.easysales_fara_stoc('{"stock_status":"out_of_stock","low_stock_threshold":3,"variants":{"enabled":true,"combinations":[{"title":"S","price":"10","stock_quantity":"4"}]}}'::jsonb)
     is distinct from '{"variants":{"enabled":true,"combinations":[{"title":"S","price":"10"}]}}'::jsonb then
    raise exception 'easysales_fara_stoc nu scoate cheile de stoc';
  end if;
  if public.easysales_variante_pe('{"variants":{"combinations":[{"title":"S","price":"10","stock_quantity":"4"}]}}'::jsonb, array['title', 'stock_quantity'])
     is distinct from '[{"title":"S","stock_quantity":"4"}]'::jsonb then
    raise exception 'easysales_variante_pe nu proiecteaza combinatiile';
  end if;
  if public.easysales_variante_pe('{"variants":"stricat"}'::jsonb, array['price']) is distinct from '[]'::jsonb then
    raise exception 'easysales_variante_pe cade pe date stricate';
  end if;
  foreach f in array array[
    'public.easysales_fara_stoc(jsonb)',
    'public.easysales_variante_pe(jsonb, text[])',
    'public.easysales_pune_catalogul_in_coada(uuid, text[])',
    'public.easysales_revendica_catalogul(uuid, text[], integer, interval)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;
  foreach t in array array['public.easysales_categorii', 'public.easysales_caracteristici', 'public.easysales_joburi'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'RLS oprit pe %', t;
    end if;
    if has_table_privilege('authenticated', t, 'INSERT') or has_table_privilege('authenticated', t, 'UPDATE')
       or has_table_privilege('authenticated', t, 'DELETE') then
      raise exception '% se poate scrie din browser', t;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
