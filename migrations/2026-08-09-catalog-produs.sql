-- Modelul de citire al catalogului: un rand ingust per produs, gata calculat.
--
-- DE CE. Storefrontul citeste azi TOT catalogul la fiecare afisare de pagina, cu
-- `page_sections` intreg cu tot, ca sa deriveze in JS pretul, fatetele, stocul
-- pachetelor si indexul de cautare. Pe eSAFE asta inseamna 19 MB de JSON scosi
-- din Postgres in patru dus-intorsuri secventiale, ca sa se randeze 40 de carduri.
-- La 100.000 de produse ar fi 100 de dus-intorsuri si ~600 MB intr-o singura
-- invocare de functie — adica un OOM, nu o pagina lenta.
--
-- Tabela asta e raspunsul: ~300-400 de octeti per produs, cu tot ce citeste un
-- card, o fateta si o cautare, si NIMIC din ce nu se citeste.
--
-- CE NU FACE, si asta e decizia centrala: NU rescrie regulile de business in SQL.
-- O singura regula se porteaza aici — disponibilitatea pachetului, fiindca de ea
-- depinde un declansator. Tot restul (intervalul de pret, fatetele, normalizarea
-- pentru cautare, descrierea scurta) se calculeaza APELAND functiile TypeScript
-- care exista deja, dintr-un proiector Node (`lib/storefront/catalog/proiector.ts`).
--
-- Motivul e concret. `getProductPriceRange` codifica patru reguli castigate greu:
-- doar combinatiile `enabled`; doar PRIMA combinatie per titlu duplicat (129 de
-- perechi duplicate in productie — bug-ul GEACA VISION 203-vs-231); randurile
-- `null` nu au voie sa arunce; un pret 0 sau nenumeric cade pe pretul de baza
-- (25 de combinatii vii trec pe calea aia). O reimplementare in SQL care greseste
-- oricare dintre ele schimba preturile AFISATE pe 3.047 de produse. Un port nu
-- merita riscul asta cand apelul direct costa 1 ms.
--
-- FAZA A1: tabela se scrie si se intretine, dar NIMENI nu o citeste inca.
-- Reversibila prin `drop table ... cascade`. Cititorii vin in faza urmatoare.

create table if not exists public.catalog_produs (
  product_id       uuid primary key references public.products(id) on delete cascade,
  business_id      uuid not null references public.businesses(id) on delete cascade,

  -- MECANICE: copiate de declansator, instantaneu, in aceeasi tranzactie cu
  -- scrierea in `products`. Nu trec prin proiector fiindca nu au ce calcula.
  name             text        not null,
  slug             text,
  category         text,
  prima_imagine    text,
  price            numeric     not null,
  compare_at_price numeric,
  is_featured      boolean     not null default false,
  is_bundle        boolean     not null default false,
  track_inventory  boolean     not null default false,
  stock_quantity   integer,
  sort_order       integer     not null default 0,
  creat            timestamptz not null,
  are_imagine      boolean     not null default false,
  -- Singura regula portata in SQL. Vezi `catalog_fara_stoc` mai jos.
  fara_stoc        boolean     not null default false,

  -- PROIECTATE: scrise de Node, apeland functiile TS existente.
  price_min        numeric     not null,
  price_max        numeric     not null,
  has_range        boolean     not null default false,
  fara_oferta      boolean     not null default false,
  -- `slimPageSections()`: doar axele de varianta si configul de pachet.
  optiuni          jsonb,
  -- `descriereDeCautare()`: marcaj taiat, apoi 300 de caractere.
  descriere_scurta text        not null default '',
  -- `normalizeSearchText()`: fara diacritice, pentru cautare.
  cauta_norm       text        not null default '',
  -- `perechileProdusului()`, fiecare ca 'cheie' || U&'\0001' || 'valoare'.
  -- Separatorul e un caracter de control tocmai fiindca nu poate aparea intr-un
  -- nume de fateta sau intr-o valoare venita din `page_sections`.
  fatete           text[]      not null default '{}',

  -- NULL = randul asteapta proiectorul. Declansatorul scrie mecanicele imediat,
  -- dar campurile calculate raman cele vechi pana trece Node-ul.
  proiectat_la     timestamptz
);

-- Fara nicio politica: tabela nu se citeste direct de nimeni, nici macar de
-- proprietar. Accesul vine prin functii si prin `service_role`. O politica
-- publica adaugata din reflex ar expune `descriere_scurta` a produselor
-- inactive, care NU sunt in tabela — dar reflexul e cel periculos, nu campul.
alter table public.catalog_produs enable row level security;

-- Ordinea implicita a catalogului: `is_featured desc, sort_order, product_id`.
-- Exact tripletul din `[slug]/page.tsx` si `pagina-magazin.tsx`, si acum si
-- departajarea totala din `lib/storefront/catalog/sortare.ts`.
create index if not exists cp_ord   on public.catalog_produs (business_id, is_featured desc, sort_order, product_id);
create index if not exists cp_creat on public.catalog_produs (business_id, creat desc, product_id);
create index if not exists cp_pret  on public.catalog_produs (business_id, price_min, product_id);
create index if not exists cp_cat   on public.catalog_produs (business_id, category);
create index if not exists cp_fat   on public.catalog_produs using gin (fatete);
-- `pg_trgm` e deja instalat (1.6), in schema `extensions`.
create index if not exists cp_trgm  on public.catalog_produs using gin (cauta_norm extensions.gin_trgm_ops);

comment on table public.catalog_produs is
  'Model de citire pentru storefront. Se intretine prin declansator + proiector Node. NU se scrie de mana.';

-- Coada de reproiectat.
--
-- Declansatorul nu poate chema JavaScript, deci cand se schimba ceva ce NUMAI
-- proiectorul stie sa calculeze (nume, descriere, categorie, etichete, pret,
-- page_sections) marcheaza randul aici si trece mai departe. Proiectorul goleste
-- coada: sincron din actiunile aplicatiei, si la fiecare minut din cron pentru
-- editarile care ocolesc aplicatia (Studio, SQL brut, migratii).
create table if not exists public.catalog_murdar (
  product_id  uuid primary key references public.products(id) on delete cascade,
  business_id uuid not null,
  marcat_la   timestamptz not null default now()
);
create index if not exists cm_biz on public.catalog_murdar (business_id, marcat_la);
alter table public.catalog_murdar enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- Disponibilitatea pachetului: SINGURA regula portata in SQL.
--
-- Se porteaza fiindca de ea depinde un declansator: cand se schimba stocul unei
-- COMPONENTE, pachetele care o contin trebuie sa-si schimbe `fara_stoc` in
-- aceeasi tranzactie, altfel catalogul ar arata disponibil un pachet care nu se
-- poate expedia — chiar defectul care a tinut „Pachet Femei" (358,40 lei) o
-- saptamana pe raft cu toate cele trei componente sterse.
--
-- E o oglinda linie cu linie a lui `disponibilitatePachet` (lib/bundles.ts) plus
-- normalizarea din `readBundleConfig`. Paritatea nu e o speranta: exista un test
-- care ruleaza AMBELE implementari peste aceleasi cazuri si peste toate pachetele
-- vii din productie.
--
-- Trei detalii care nu sunt cosmetice:
--   * `c.id::text = it.pid`, nu `it.pid::uuid`. Un `product_id` care nu e UUID
--     (importurile lasa asa ceva) ar arunca `22P02` si ar rupe declansatorul
--     pentru TOATA scrierea, nu doar pentru randul cu pricina.
--   * pentru produsele simple portul e LITERAL `stock_quantity = 0`, nu `<= 0`.
--     Stocul negativ se citeste azi ca „in stoc" peste tot in aplicatie. Pastrez
--     purtarea identica: o proiectie n-are voie sa schimbe pe furis ce vede
--     clientul. Daca se schimba, se schimba separat si vizibil.
--   * componenta DEZACTIVATA se citeste ca lipsa, nu ca fara stoc. In browser
--     payload-ul e deja filtrat pe `is_active`, deci `!!comp` da acelasi verdict;
--     aici conditia e scrisa explicit ca sa nu depinda de un filtru din alta parte.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.catalog_fara_stoc(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with s as (
    select p.is_bundle, p.track_inventory, p.stock_quantity, p.business_id,
           p.page_sections->'bundle'->'items' as items
      from public.products p
     where p.id = p_id
  ),
  -- `readBundleConfig`: un element fara `product_id` sir nu e element;
  -- `quantity` = max(1, floor(Number(q) || 1)).
  it as (
    select (e->>'product_id') as pid,
           greatest(1, floor(coalesce(
             case when btrim(coalesce(e->>'quantity','')) ~ '^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$'
                  then btrim(e->>'quantity')::numeric
             end, 1)))::int as qty
      from s, lateral jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) e
     where jsonb_typeof(e->'product_id') = 'string'
  )
  select case
    when not coalesce((select is_bundle from s), false)
      then coalesce((select track_inventory and stock_quantity = 0 from s), false)
    -- Zero componente inseamna si „pachet gol", si „configul a fost sters de
    -- formularul obisnuit de produs". In amandoua cazurile nevandabil.
    when (select count(*) from it) = 0
      then true
    else exists (
      select 1
        from it
        left join public.products c
               on c.id::text = it.pid
              and c.business_id = (select business_id from s)
       where c.id is null or not c.is_active                                        -- componenta_lipsa
          or (c.track_inventory
              and floor(coalesce(c.stock_quantity, 0)::numeric / it.qty) < 1)       -- stoc_insuficient
    )
  end
$$;

revoke all on function public.catalog_fara_stoc(uuid) from public, anon, authenticated;
grant execute on function public.catalog_fara_stoc(uuid) to service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Declansatorul, cu ramuri.
--
-- Ramurile nu sunt o optimizare de dragul optimizarii: PATRU sincronizari de
-- marketplace scriu in `products` LA FIECARE MINUT, si aproape toate ating doar
-- stocul. Daca fiecare atingere ar marca randul murdar, coada n-ar fi niciodata
-- goala si proiectorul ar recalcula fatetele intregii platforme la minut, degeaba.
--
--   DELETE / is_active=false  -> se sterge randul, si se re-evalueaza pachetele
--                                care contineau produsul (au ramas fara componenta)
--   doar stoc / activare      -> se actualizeaza mecanicele si `fara_stoc`, si al
--                                pachetelor parinte. NU marcheaza murdar.
--   orice altceva             -> mecanicele + marcaj murdar (proiectorul urmeaza)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_catalog_proiectie()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_doar_stoc boolean := false;
begin
  v_id := coalesce(new.id, old.id);

  -- Produsul iese din catalog: sters, sau dezactivat.
  if (tg_op = 'DELETE') or not coalesce(new.is_active, false) then
    delete from public.catalog_produs where product_id = v_id;
    delete from public.catalog_murdar where product_id = v_id;
    -- Pachetele care il contineau si-au pierdut o componenta.
    update public.catalog_produs cp
       set fara_stoc = public.catalog_fara_stoc(cp.product_id)
     where cp.is_bundle
       and exists (
         select 1 from public.products b
          where b.id = cp.product_id
            and b.page_sections->'bundle'->'items'
                @> jsonb_build_array(jsonb_build_object('product_id', v_id::text)));
    return coalesce(new, old);
  end if;

  -- Ce s-a schimbat: doar lucruri mecanice, sau si ceva ce cere proiectorul?
  if tg_op = 'UPDATE' then
    v_doar_stoc :=
      new.name             is not distinct from old.name
      and new.description  is not distinct from old.description
      and new.category     is not distinct from old.category
      and new.tags         is not distinct from old.tags
      and new.price        is not distinct from old.price
      and new.page_sections is not distinct from old.page_sections
      and new.images       is not distinct from old.images
      and new.slug         is not distinct from old.slug;
  end if;

  insert into public.catalog_produs as cp (
    product_id, business_id, name, slug, category, prima_imagine,
    price, compare_at_price, is_featured, is_bundle, track_inventory, stock_quantity,
    sort_order, creat, are_imagine, fara_stoc,
    price_min, price_max, proiectat_la
  )
  values (
    new.id, new.business_id, new.name, new.slug, new.category,
    nullif(new.images->>0, ''),
    new.price, new.compare_at_price,
    coalesce(new.is_featured, false), coalesce(new.is_bundle, false),
    coalesce(new.track_inventory, false), new.stock_quantity,
    coalesce(new.sort_order, 0), new.created_at,
    coalesce(jsonb_array_length(coalesce(new.images, '[]'::jsonb)), 0) > 0,
    public.catalog_fara_stoc(new.id),
    -- Samanta pentru un produs SIMPLU e chiar pretul de baza, deci randul e
    -- corect din prima. Pentru unul cu variante e o aproximare pe care o
    -- corecteaza proiectorul — si nimeni nu apuca sa o vada, fiindca in faza A1
    -- nu exista cititori, iar de la A2 scrierile din aplicatie proiecteaza sincron.
    new.price, new.price, null
  )
  on conflict (product_id) do update set
    business_id      = excluded.business_id,
    name             = excluded.name,
    slug             = excluded.slug,
    category         = excluded.category,
    prima_imagine    = excluded.prima_imagine,
    price            = excluded.price,
    compare_at_price = excluded.compare_at_price,
    is_featured      = excluded.is_featured,
    is_bundle        = excluded.is_bundle,
    track_inventory  = excluded.track_inventory,
    stock_quantity   = excluded.stock_quantity,
    sort_order       = excluded.sort_order,
    creat            = excluded.creat,
    are_imagine      = excluded.are_imagine,
    fara_stoc        = excluded.fara_stoc,
    -- Campurile calculate NU se ating aici: raman ce a scris proiectorul ultima
    -- data. Altfel o simpla schimbare de stoc ar rescrie `price_min` cu pretul de
    -- baza si ar sterge intervalul unui produs cu variante.
    proiectat_la     = cp.proiectat_la;

  -- Stocul unei componente s-a mutat: pachetele care o contin isi recalculeaza
  -- disponibilitatea. Forma `@>` e cea deja dovedita in migratia de repretuire, si
  -- se sprijina pe `products_business_is_bundle_idx`, care exista.
  if tg_op <> 'INSERT' and not coalesce(new.is_bundle, false) then
    update public.catalog_produs cp
       set fara_stoc = public.catalog_fara_stoc(cp.product_id)
     where cp.business_id = new.business_id
       and cp.is_bundle
       and exists (
         select 1 from public.products b
          where b.id = cp.product_id
            and b.page_sections->'bundle'->'items'
                @> jsonb_build_array(jsonb_build_object('product_id', new.id::text)));
  end if;

  -- Coada de proiectat.
  if tg_op = 'INSERT' or not v_doar_stoc then
    insert into public.catalog_murdar (product_id, business_id)
    values (new.id, new.business_id)
    on conflict (product_id) do update set marcat_la = now();
  end if;

  return new;
end;
$$;

drop trigger if exists products_catalog_proiectie on public.products;
create trigger products_catalog_proiectie
  after insert or update of
    name, slug, description, price, compare_at_price, images, category, tags,
    is_featured, is_active, is_bundle, track_inventory, stock_quantity, sort_order, page_sections
  or delete
  on public.products
  for each row
  execute function public.trg_catalog_proiectie();


-- ─────────────────────────────────────────────────────────────────────────────
-- Alarma de drift.
--
-- Doua surse de adevar diverg TACUT. Repo-ul n-are CI, deci un test nu pazeste
-- nimic in productie; singurul mecanism de aplicare nesupravegheat care exista e
-- `error_logs` plus cronul orar. Aici se leaga de el.
--
-- Compara pe un esantion apartenenta (produs activ fara rand, sau rand fara
-- produs activ), `fara_stoc` si `price_min`. Nu compara fatetele si nici
-- `cauta_norm`: alea depind de proiector, iar un rand proaspat marcat murdar e
-- legitim nesincronizat pana trece cronul de un minut.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.catalog_verifica(p_esantion int default 300)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lipsa int;
  v_in_plus int;
  v_stoc int;
  v_total int;
begin
  select count(*) into v_lipsa
    from (select p.id from public.products p
           where p.is_active
             and not exists (select 1 from public.catalog_produs c where c.product_id = p.id)
           limit p_esantion) t;

  select count(*) into v_in_plus
    from (select c.product_id from public.catalog_produs c
           where not exists (select 1 from public.products p
                              where p.id = c.product_id and p.is_active)
           limit p_esantion) t;

  -- Doar randurile deja proiectate SI necoada: restul sunt legitim in tranzit.
  select count(*) into v_stoc
    from (select c.product_id from public.catalog_produs c
           where c.proiectat_la is not null
             and not exists (select 1 from public.catalog_murdar m where m.product_id = c.product_id)
             and c.fara_stoc is distinct from public.catalog_fara_stoc(c.product_id)
           limit p_esantion) t;

  v_total := v_lipsa + v_in_plus + v_stoc;

  if v_total > 0 then
    -- Coloanele sunt `action`/`message`/`details`/`severity`, iar `severity` are
    -- constrangere pe info|warning|error|critical. Verificate pe instanta, nu
    -- presupuse: prima scriere e si ultima sansa ca alarma sa functioneze.
    insert into public.error_logs (severity, action, message, details)
    values ('error', 'catalog_verifica',
            format('Proiectia catalogului a divergat: %s lipsa, %s in plus, %s cu stoc gresit',
                   v_lipsa, v_in_plus, v_stoc),
            jsonb_build_object('lipsa', v_lipsa, 'in_plus', v_in_plus, 'stoc', v_stoc,
                               'esantion', p_esantion));
  end if;

  return v_total;
end;
$$;

revoke all on function public.catalog_verifica(int) from public, anon, authenticated;
grant execute on function public.catalog_verifica(int) to service_role;


-- Scrie un LOT intreg de proiectii intr-o singura instructiune.
--
-- Varianta rand-cu-rand ar fi insemnat 5.826 de dus-intorsuri la backfill si
-- cateva sute la fiecare import — chiar tiparul pe care modelul asta de citire
-- exista ca sa-l stearga.
--
-- NU e un upsert, deliberat: randurile care nu exista in `catalog_produs` nu se
-- creeaza aici. Cine intra in catalog decide declansatorul, dupa `is_active`. Un
-- upsert ar fi avut nevoie si de coloanele mecanice si le-ar fi rescris cu ce a
-- citit proiectorul, care poate fi mai vechi decat ce e deja in tabela.
create or replace function public.catalog_aplica_proiectii(p_randuri jsonb)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_afectate int;
begin
  update public.catalog_produs cp set
    price_min        = (r->>'price_min')::numeric,
    price_max        = (r->>'price_max')::numeric,
    has_range        = (r->>'has_range')::boolean,
    fara_oferta      = (r->>'fara_oferta')::boolean,
    optiuni          = case when jsonb_typeof(r->'optiuni') = 'null' then null else r->'optiuni' end,
    descriere_scurta = coalesce(r->>'descriere_scurta', ''),
    cauta_norm       = coalesce(r->>'cauta_norm', ''),
    fatete           = coalesce(
                         (select array_agg(x #>> '{}') from jsonb_array_elements(r->'fatete') x),
                         '{}'::text[]),
    proiectat_la     = (r->>'proiectat_la')::timestamptz
  from jsonb_array_elements(p_randuri) r
  where cp.product_id = (r->>'product_id')::uuid;

  get diagnostics v_afectate = row_count;
  return v_afectate;
end;
$$;

revoke all on function public.catalog_aplica_proiectii(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_aplica_proiectii(jsonb) to service_role;
