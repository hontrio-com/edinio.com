-- Ce trebuie sa stie pagina de catalog DESPRE TOT catalogul, ca sa poata trimite
-- doar o pagina din el.
--
-- Paginarea pe server se loveste de o problema care nu e a paginarii: patru
-- lucruri de pe pagina de catalog nu se pot deriva dintr-o singura pagina de
-- produse, fiindca descriu intregul.
--
--   * fatetele si numaratorile lor („Marime: XL (37)")
--   * intervalul de pret al magazinului, care da capetele filtrului
--   * arborele de categorii curatat la cele care CHIAR contin produse
--   * numarul total, fara de care „20 din 20 produse" ar fi o minciuna
--
-- Toate patru se calculeaza azi in browser, peste tot catalogul — de aia trebuie
-- trimis tot catalogul. Tabela asta le calculeaza o data, la scriere, si asa
-- pagina poate deveni o pagina.
--
-- PATRU RANDURI PE MAGAZIN, nu unul: comutatoarele „ascunde produsele fara
-- imagini" si „ascunde produsele fara stoc" schimba multimea peste care se
-- numara. Precalculate toate patru combinatiile, schimbarea unui comutator nu
-- declanseaza niciodata un recalcul la cerere — comerciantul apasa si vede
-- imediat, iar vizitatorul nu plateste niciodata.
--
-- FAZA A3, pasul 1: tabela se scrie si se intretine, dar NIMENI nu o citeste
-- inca. Acelasi tipar ca `catalog_produs` la A1, din acelasi motiv: fundatia se
-- dovedeste inainte sa depinda ceva de ea. Reversibila prin `drop table`.

create table if not exists public.catalog_rezumat (
  business_id      uuid    not null references public.businesses(id) on delete cascade,
  -- Cele doua comutatoare, ca parte din cheie.
  fara_imagini     boolean not null,
  fara_stoc_ascuns boolean not null,

  total            integer not null,
  price_min        numeric not null,
  price_max        numeric not null,
  -- Numele de categorie care au macar un produs vizibil. Aici intra si cele
  -- „orfane" — purtate doar de produse, fara rand in `categories` — pe care
  -- importurile le lasa des si care au pagini adevarate in magazin.
  categorii        text[]  not null default '{}',
  -- `{ jetoane: string[], fatete: Fateta[] }`, exact ce intoarce
  -- `construiesteFatete`. Politica de fatete NU se reexprima aici: se scrie ce a
  -- calculat codul TypeScript, cu pragurile si deduplicarea lui, iar
  -- `facets.test.ts` ramane paznicul lor.
  fatete           jsonb   not null default '{}'::jsonb,

  calculat_la      timestamptz not null default now(),
  primary key (business_id, fara_imagini, fara_stoc_ascuns)
);

-- Fara nicio politica, ca la `catalog_produs`: se citeste doar prin RPC sau cu
-- cheia de serviciu.
alter table public.catalog_rezumat enable row level security;

comment on table public.catalog_rezumat is
  'Agregatele catalogului per magazin, cate un rand pentru fiecare combinatie de comutatoare de vizibilitate. Scris de proiector. NU se scrie de mana.';

-- Coada de rezumat, separata de `catalog_murdar`.
--
-- Nu se poate refolosi coada de produse: acolo un rand inseamna „reproiecteaza
-- produsul", aici inseamna „recalculeaza AGREGATELE magazinului". Un import de
-- 5.000 de produse marcheaza 5.000 de randuri in prima si UNUL in a doua — iar
-- recalculul agregatelor e cel scump, fiindca citeste tot magazinul.
create table if not exists public.catalog_rezumat_murdar (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  marcat_la   timestamptz not null default now()
);
alter table public.catalog_rezumat_murdar enable row level security;

-- Orice atingere a proiectiei unui produs invalideaza agregatele magazinului lui.
--
-- Se leaga de `catalog_produs`, nu de `products`: pana aici ajung DEJA filtrate
-- doar schimbarile care conteaza (declansatorul de la A1 nu scrie randul pentru o
-- modificare care nu schimba nimic din ce se vede). Un `after ... for each
-- statement` n-ar fi mers: are nevoie de `business_id`, care e per rand.
create or replace function public.trg_catalog_rezumat_murdar()
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

drop trigger if exists catalog_produs_rezumat on public.catalog_produs;
create trigger catalog_produs_rezumat
  after insert or update or delete on public.catalog_produs
  for each row
  execute function public.trg_catalog_rezumat_murdar();

-- Scrie cele patru randuri ale unui magazin dintr-un singur jsonb.
--
-- Acelasi motiv ca la `catalog_aplica_proiectii`: agregatele se calculeaza in
-- Node, apeland `construiesteFatete` NEATINSA, si se scriu intr-o instructiune.
-- Politica de fatete ramane intr-un singur loc, in TypeScript.
create or replace function public.catalog_scrie_rezumat(p_randuri jsonb)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_afectate int;
begin
  insert into public.catalog_rezumat (
    business_id, fara_imagini, fara_stoc_ascuns, total, price_min, price_max,
    categorii, fatete, calculat_la)
  select (r->>'business_id')::uuid,
         (r->>'fara_imagini')::boolean,
         (r->>'fara_stoc_ascuns')::boolean,
         (r->>'total')::int,
         (r->>'price_min')::numeric,
         (r->>'price_max')::numeric,
         coalesce((select array_agg(x #>> '{}') from jsonb_array_elements(r->'categorii') x), '{}'::text[]),
         coalesce(r->'fatete', '{}'::jsonb),
         now()
    from jsonb_array_elements(p_randuri) r
  on conflict (business_id, fara_imagini, fara_stoc_ascuns) do update set
    total       = excluded.total,
    price_min   = excluded.price_min,
    price_max   = excluded.price_max,
    categorii   = excluded.categorii,
    fatete      = excluded.fatete,
    calculat_la = excluded.calculat_la;

  get diagnostics v_afectate = row_count;
  return v_afectate;
end;
$$;

revoke all on function public.catalog_scrie_rezumat(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_scrie_rezumat(jsonb) to service_role;
