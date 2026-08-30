-- ═══ BLOG: TEMELIA ═══
-- Aplicata pe 30.08.2026 ca migrarea `blog_temelia_tabele_si_drepturi`.
-- Etapa 1 din plan: tabelele, cu drepturile pe rand scrise ODATA cu ele.
--
-- ⚠ PROGRAMAREA NU E O STARE, E UN CEAS.
-- Nu exista status 'scheduled'. Un articol programat e 'published' cu
-- published_at in viitor, iar regula publica il lasa sa treaca abia cand
-- ceasul ajunge acolo. Asa nu exista cron care sa nu porneasca si sa lase
-- articolul blocat intr-o stare intermediara: daca nu ruleaza nimic, ceasul
-- tot merge. O stare in minus e o cale de esec in minus.

-- ── Autorii ──
-- `sameas` nu e ornament: intra direct in Person.sameAs din datele
-- structurate. Motoarele care raspund cu text (ChatGPT, Perplexity, AI
-- Overviews) leaga autorul de o entitate cunoscuta prin exact acele adrese.
-- Fara ele, autorul e un sir de caractere, nu o persoana.
create table if not exists public.blog_authors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  slug        text not null unique,
  name        text not null,
  role_title  text,
  bio         text,
  avatar_url  text,
  sameas      text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint blog_authors_slug_form check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- ── Categoriile ──
create table if not exists public.blog_categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  seo_title       text,
  seo_description text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint blog_categories_slug_form check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- ── Etichetele ──
create table if not exists public.blog_tags (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now(),
  constraint blog_tags_slug_form check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- ── Articolele ──
-- ⚠ ADRESA E PLATA: /blog/<slug>, nu /blog/<categorie>/<slug>. Cu categoria in
-- adresa, mutarea unui articol dintr-o categorie in alta ii schimba adresa, iar
-- un articol in doua categorii ar avea doua adrese pentru acelasi text. Plata,
-- fiecare articol are o singura adresa canonica de la nastere pana la moarte.
create table if not exists public.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,

  -- Rezumatul care pleaca in <meta description> si pe cartonasele din lista.
  excerpt         text,

  -- ⚠ RASPUNSUL SCURT E PENTRU MOTOARELE CARE RASPUND CU TEXT.
  -- Un paragraf care se tine pe picioarele lui, fara „cum spuneam mai sus".
  -- Motoarele generative citeaza pasaje care se inteleg scoase din context;
  -- unul care trimite inapoi in articol nu poate fi citat, deci nu e citat.
  answer_summary  text,

  content_html    text not null default '',

  cover_url       text,
  cover_alt       text,
  og_image_url    text,

  author_id       uuid references public.blog_authors(id) on delete set null,
  category_id     uuid references public.blog_categories(id) on delete set null,

  status          text not null default 'draft',
  published_at    timestamptz,

  is_featured     boolean not null default false,

  -- Intrebari si raspunsuri: [{"q": "...", "a": "..."}]
  -- Se arata in pagina SI pleaca in datele structurate ca FAQPage.
  faq             jsonb not null default '[]'::jsonb,

  seo_title       text,
  seo_description text,
  canonical_url   text,
  noindex         boolean not null default false,

  reading_minutes int,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint blog_posts_slug_form check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint blog_posts_status_known check (status in ('draft','review','published','archived')),
  -- Publicat fara data ar fi un articol vizibil pe care nu-l poate ordona nimic.
  constraint blog_posts_published_has_date check (status <> 'published' or published_at is not null),
  constraint blog_posts_faq_is_list check (jsonb_typeof(faq) = 'array')
);

-- ── Legatura articol ↔ eticheta ──
create table if not exists public.blog_post_tags (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  tag_id  uuid not null references public.blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

-- ── Istoricul versiunilor ──
create table if not exists public.blog_post_revisions (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.blog_posts(id) on delete cascade,
  title        text,
  content_html text,
  saved_by     uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── Redirectarile ──
-- ⚠ FARA ASTA, ORICE CORECTURA DE SLUG OMOARA POZITIA CASTIGATA.
-- Un articol care a strans legaturi pe /blog/x si se muta pe /blog/y fara
-- redirectare pierde tot ce a strans si lasa in urma un 404 pe care il tin
-- minte si Google, si motoarele generative.
create table if not exists public.blog_redirects (
  id         uuid primary key default gen_random_uuid(),
  from_slug  text not null unique,
  to_slug    text not null,
  created_at timestamptz not null default now(),
  constraint blog_redirects_not_circular check (from_slug <> to_slug)
);

-- ── Abonatii ──
-- Fara nicio regula pentru anon, dinadins: inscrierea trece printr-o actiune
-- de server cu cheia de serviciu, care poate numara cererile. O regula de
-- INSERT pentru anon ar fi o adresa deschisa de umplut cu gunoi.
create table if not exists public.blog_subscribers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  source       text,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ── Cautarea in lista ──
create index if not exists blog_posts_public_order_idx
  on public.blog_posts (status, published_at desc nulls last);
create index if not exists blog_posts_category_idx on public.blog_posts (category_id);
create index if not exists blog_posts_author_idx   on public.blog_posts (author_id);
create index if not exists blog_post_revisions_post_idx
  on public.blog_post_revisions (post_id, created_at desc);

-- ── updated_at ──
-- set_updated_at() exista deja in schema. NU o recreez: recrearea unei functii
-- ii reda lui `anon` dreptul de EXECUTE, si nu are de ce sa-l aiba.
drop trigger if exists blog_authors_touch on public.blog_authors;
create trigger blog_authors_touch before update on public.blog_authors
  for each row execute function public.set_updated_at();
drop trigger if exists blog_categories_touch on public.blog_categories;
create trigger blog_categories_touch before update on public.blog_categories
  for each row execute function public.set_updated_at();
drop trigger if exists blog_posts_touch on public.blog_posts;
create trigger blog_posts_touch before update on public.blog_posts
  for each row execute function public.set_updated_at();

-- ═══ DREPTURILE PE RAND ═══
alter table public.blog_authors        enable row level security;
alter table public.blog_categories     enable row level security;
alter table public.blog_tags           enable row level security;
alter table public.blog_posts          enable row level security;
alter table public.blog_post_tags      enable row level security;
alter table public.blog_post_revisions enable row level security;
alter table public.blog_redirects      enable row level security;
alter table public.blog_subscribers    enable row level security;

-- Citirea publica. Blogul e continut de marketing: il citeste si cine nu are
-- cont, deci regula e pe `anon`, nu doar pe `authenticated` ca la anunturi.
--
-- ⚠ CEASUL E IN REGULA, NU IN COD. Un articol cu published_at in viitor nu
-- trece de aici nici daca o pagina uita sa filtreze. Ciorna nu poate scapa
-- printr-o interogare gresita, fiindca nu iese din baza.
--
-- Verificat pe 30.08 cu patru randuri (ciorna, programat maine, arhivat,
-- publicat acum) citite ca `anon`: a iesit doar cel publicat.
drop policy if exists blog_posts_public_read on public.blog_posts;
create policy blog_posts_public_read on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists blog_authors_public_read on public.blog_authors;
create policy blog_authors_public_read on public.blog_authors
  for select to anon, authenticated using (true);

drop policy if exists blog_categories_public_read on public.blog_categories;
create policy blog_categories_public_read on public.blog_categories
  for select to anon, authenticated using (true);

drop policy if exists blog_tags_public_read on public.blog_tags;
create policy blog_tags_public_read on public.blog_tags
  for select to anon, authenticated using (true);

drop policy if exists blog_redirects_public_read on public.blog_redirects;
create policy blog_redirects_public_read on public.blog_redirects
  for select to anon, authenticated using (true);

-- Legatura articol-eticheta se vede doar pentru articolele care se vad.
drop policy if exists blog_post_tags_public_read on public.blog_post_tags;
create policy blog_post_tags_public_read on public.blog_post_tags
  for select to anon, authenticated
  using (exists (
    select 1 from public.blog_posts p
    where p.id = post_id
      and p.status = 'published'
      and p.published_at is not null
      and p.published_at <= now()
  ));

-- Administrarea. Aceeasi poarta ca la anunturi: is_admin().
drop policy if exists blog_posts_admin_all on public.blog_posts;
create policy blog_posts_admin_all on public.blog_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists blog_authors_admin_all on public.blog_authors;
create policy blog_authors_admin_all on public.blog_authors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists blog_categories_admin_all on public.blog_categories;
create policy blog_categories_admin_all on public.blog_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists blog_tags_admin_all on public.blog_tags;
create policy blog_tags_admin_all on public.blog_tags
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists blog_post_tags_admin_all on public.blog_post_tags;
create policy blog_post_tags_admin_all on public.blog_post_tags
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists blog_post_revisions_admin_all on public.blog_post_revisions;
create policy blog_post_revisions_admin_all on public.blog_post_revisions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists blog_redirects_admin_all on public.blog_redirects;
create policy blog_redirects_admin_all on public.blog_redirects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists blog_subscribers_admin_all on public.blog_subscribers;
create policy blog_subscribers_admin_all on public.blog_subscribers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
