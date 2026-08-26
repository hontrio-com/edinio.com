-- ══════════════════════════════════════════════════════════════════════════
-- O PUNERE LA COADA PICATA PIERDEA CEREREA PENTRU TOTDEAUNA (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Lantul era: produsul se salveaza, apoi `enqueue…` il pune la coada. Salvarea reuseste, iar
-- punerea la coada e un efect lateral care se poate rata — plan depasit, politica, o pana de o
-- clipa a bazei. Am facut ca refuzul sa se VADA, dar pierderea ramanea pierdere: nimic nu mai
-- relua lucrarea.
--
-- ⚠ SI NU SE POATE PRESUPUNE. „Produs fara listare, deci publica-l" ar fi cea mai fireasca
-- plasa — si e gresita: cele mai multe produse fara listare sunt chiar produse pe care
-- comerciantul nu le-a vrut niciodata acolo. Plasa aia ar publica intreg catalogul.
--
-- De-aia se scrie INTENTIA: „la ora asta, pentru produsul asta, s-a cerut publicarea pe
-- marketplace-ul asta". Randul se scrie INAINTEA cozii — invers, o pana intre cele doua ar
-- pierde exact cazul pentru care exista tabela — si se inchide doar cand exista dovada ca s-a
-- facut, adica o listare.
--
-- ⚠ CU PLAFON DE INCERCARI. Un produs care nu se poate publica (fara categorie mapata, fara
-- marca) n-are rost reluat la nesfarsit: ar arde bugetul de cereri al magazinului pentru ceva ce
-- numai omul poate repara. Dupa plafon randul ramane, cu eroarea scrisa, si se vede.

create table if not exists public.intentii_publicare (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  marketplace text not null,
  sursa text not null default 'auto_publish',
  cerut_la timestamptz not null default now(),
  rezolvat_la timestamptz,
  incercari integer not null default 0,
  ultima_eroare text,
  updated_at timestamptz not null default now(),
  constraint intentii_publicare_marketplace_check
    check (marketplace = any (array['trendyol'::text, 'emag'::text, 'aboutyou'::text])),
  constraint intentii_publicare_sursa_check
    check (sursa = any (array['auto_publish'::text, 'import'::text, 'manual'::text])),
  -- O cerere pe produs si pe marketplace. A doua n-are ce adauga.
  unique (business_id, product_id, marketplace)
);

create index if not exists intentii_publicare_nerezolvate_idx
  on public.intentii_publicare (marketplace, business_id, cerut_la)
  where rezolvat_la is null;

alter table public.intentii_publicare enable row level security;

create policy owner_select_intentii_publicare on public.intentii_publicare
  for select using (business_id in (
    select id from public.businesses where user_id = (select auth.uid())));

comment on table public.intentii_publicare is
  'Ce s-a CERUT sa fie publicat, separat de ce a apucat sa intre in coada. O punere la coada picata pierdea altfel intentia pentru totdeauna.';

notify pgrst, 'reload schema';
