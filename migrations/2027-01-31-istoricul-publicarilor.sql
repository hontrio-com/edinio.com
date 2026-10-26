-- ═══════════════════════════════════════════════════════════════════════════
-- Editorul magazinului: istoricul publicarilor („revino la ce era ieri”)
-- 26.10.2026, etapa 7 din docs/editor-magazin/PLAN.md
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pana acum „Publică” suprascria designul si continutul magazinului fara sa pastreze nimic: un
-- „Publică” gresit nu se mai putea desface. De acum fiecare publicare reusita lasa aici o versiune
-- (designul publicat si continutul pe care il regleaza editorul), iar inaintea primei se pastreaza si
-- ce era in magazin. Readusa din editor, versiunea intra in CIORNA, nu in magazin: ajunge la clienti
-- abia la „Publică”, care face la randul lui o versiune noua.
--
-- Scrie si citeste NUMAI serverul (`service_role`), dupa ce a verificat proprietarul, si numai cu
-- `business_id`-ul magazinului lui (`src/lib/actions/store-design.actions.ts`). Ca la
-- `blog_post_revisions`: RLS pornit, fara nicio politica, si niciun drept pentru `anon` sau
-- `authenticated` (Supabase le da drepturi pe orice tabel nou; aici se iau inapoi, pe nume).
--
-- Plafonul (30 pe magazin) il tine serverul, la scriere (`VERSIUNI_PASTRATE`).
-- Masurat in productie pe 26.10.2026: o versiune are sub 10 KB (continutul cel mult 5,5 KB, designul
-- cel mult 3,1 KB).
--
-- Aditiva: un tabel nou, nimic schimbat in rest. Se aplica INAINTE de deploy (codul il scrie la
-- fiecare „Publică”; fara el, publicarea merge, dar istoricul ramane gol si caderea ajunge in jurnal).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.storefront_design_versions (
  id uuid not null default gen_random_uuid() primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- Designul publicat, asa cum l-a scris `publishDesign` (parsat).
  design jsonb not null,
  -- `{ pc, magazin }`: cheile editorului din `page_content` si logo, coperta, culoare, galerie.
  continut jsonb not null,
  -- `publicare` = ce a dus un „Publică” in magazin; `inainte` = ce era in magazin inaintea primei versiuni.
  origine text not null default 'publicare' check (origine in ('publicare', 'inainte')),
  publicat_de uuid references auth.users(id) on delete set null,
  -- Chiar data publicarii (`storefront_design_pub_at`): asa stie lista care versiune e in magazin acum.
  created_at timestamptz not null default now()
);

comment on table public.storefront_design_versions is
  'Istoricul publicarilor din editorul magazinului: o versiune la fiecare „Publică” (designul si continutul '
  'editorului). Doar service_role. Vezi src/lib/editor-magazin/versiuni.ts si docs/editor-magazin/PLAN.md, etapa 7.';

create index if not exists storefront_design_versions_business_idx
  on public.storefront_design_versions (business_id, created_at desc);

alter table public.storefront_design_versions enable row level security;

revoke all on table public.storefront_design_versions from public, anon, authenticated;
grant select, insert, delete on table public.storefront_design_versions to service_role;

-- Verificarea, chiar in migratie: rezultatul, nu raspunsul comenzii.
do $$
declare
  rol text;
  drept text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.storefront_design_versions'::regclass) then
    raise exception 'storefront_design_versions: RLS oprit';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'storefront_design_versions') then
    raise exception 'storefront_design_versions: are politici; nu trebuie sa aiba niciuna';
  end if;
  foreach rol in array array['anon', 'authenticated'] loop
    foreach drept in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege(rol, 'public.storefront_design_versions', drept) then
        raise exception 'storefront_design_versions: % are inca %', rol, drept;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', 'public.storefront_design_versions', 'insert') then
    raise exception 'storefront_design_versions: service_role nu poate scrie';
  end if;
end $$;

notify pgrst, 'reload schema';
