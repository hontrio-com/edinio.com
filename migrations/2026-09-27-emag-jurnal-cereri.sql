-- Jurnalul cererilor catre eMAG (§65) si firul care le leaga (§66)
--
-- ⚠ CE INTREBARE RASPUNDE
--
-- „Pretul ala chiar a plecat? Cand? Si ce-au zis ei?" E singura intrebare care se
-- pune cu adevarat despre o integrare de marketplace, si pana acum n-avea niciun
-- raspuns: `error_logs` scrie doar ce a CAZUT, iar o cerere care reuseste si nu face
-- nimic — chiar tiparul Trendyol — nu lasa nicio urma.
--
-- ⚠ CE NU INTRA AICI, NICIODATA
--
-- Nu se scrie CORPUL cererii si nici al raspunsului. `awb/save` duce numele, adresa
-- si telefonul cumparatorului; `order/read` intoarce comenzi intregi. Scrise aici,
-- tabelul asta ar fi devenit o A DOUA copie a datelor clientilor, cu alta pastrare,
-- alte drepturi de citire si niciun motiv sa existe.
--
-- Se scriu ruta, verdictul, codul, durata, ce oferte au fost atinse si MESAJELE lor.
-- Mesajele eMAG vorbesc despre campuri („characteristic 38 is required"), nu despre
-- oameni — si sunt exact partea folositoare.
--
-- ⚠ NU SE JURNALIZEAZA TOT. Cronul bate din minut in minut; jurnalizate si citirile
-- reusite, ar fi fost zeci de mii de randuri pe zi din care niciunul nu spune nimic.
-- Se scriu scrierile (au efecte) si tot ce n-a reusit. Regula e in `jurnal.ts`.

create table if not exists public.emag_request_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  -- ⚠ Firul lucrarii (§66). Toate cererile unui element de coada il impart, deci o
  -- cadere se poate urmari din capat in capat. `null` pentru cererile facute in
  -- afara unei lucrari cu fir.
  corelatie text,

  metoda text not null,
  cale text not null,

  -- 0 inseamna „n-am ajuns la ei" (timp expirat, releu cazut), NU un raspuns cu
  -- codul zero. Deosebirea conteaza: una se repara la noi, cealalta se asteapta.
  status integer not null default 0,

  -- `reusit` · `reusit_cu_observatii` · `refuz` · `trecatoare` · `chei`
  -- ⚠ Al doilea e cel care nu exista la niciun alt furnizor: eMAG intoarce
  -- `isError: true` pe `product_offer/save` si TOTUSI salveaza oferta.
  verdict text not null,

  durata_ms integer,

  -- Ofertele atinse, ca sa se poata cauta dupa ele. Cel mult 50.
  emag_ids bigint[],

  -- Mesajele LOR, neatinse. Nu se rezuma si nu se traduc.
  mesaje jsonb not null default '[]'::jsonb,
  eroare text,

  created_at timestamptz not null default now()
);

-- Cautarea obisnuita: „ce s-a intamplat in ultima ora la magazinul asta".
create index if not exists emag_request_log_biz_idx
  on public.emag_request_log (business_id, created_at desc);

-- ⚠ Cautarea dupa fir (§66), care e chiar rostul lui: „arata-mi toate cererile
-- lucrarii asteia". PARTIAL, fiindca randurile fara fir n-au ce cauta in el.
create index if not exists emag_request_log_fir_idx
  on public.emag_request_log (corelatie)
  where corelatie is not null;

-- „Arata-mi tot ce n-a mers", fara sa citeasca randurile reusite.
create index if not exists emag_request_log_probleme_idx
  on public.emag_request_log (business_id, created_at desc)
  where verdict <> 'reusit';

-- Stergerea dupa 30 de zile umbla pe `created_at` peste toate magazinele.
create index if not exists emag_request_log_varsta_idx
  on public.emag_request_log (created_at);

-- ⚠ Cautarea dupa o oferta anume cere index GIN: fara el, „ce s-a intamplat cu
-- oferta 1000000042" ar fi citit tabelul intreg, adica milioane de randuri.
create index if not exists emag_request_log_iduri_idx
  on public.emag_request_log using gin (emag_ids);

alter table public.emag_request_log enable row level security;

-- Citire numai pentru proprietar, dupa modelul `owner_select_emag_offers`.
--
-- ⚠ `businesses.user_id`, nu `owner_id` — asa se numeste coloana in productie.
-- ⚠ `( select auth.uid() )` invelit in subselect, nu chemat direct: asa Postgres il
-- socoteste O SINGURA DATA pe interogare, nu pe fiecare rand. Pe un jurnal care
-- creste la sute de mii de randuri, diferenta nu e cosmetica.
create policy owner_select_emag_request_log on public.emag_request_log
  for select to public
  using (business_id in (
    select businesses.id from public.businesses
     where businesses.user_id = (select auth.uid())
  ));

-- ═══ ⚠ SE REVOCA, NU SE ACORDA ═══
--
-- Proiectul are `alter default privileges` care da ANON si AUTHENTICATED toate
-- drepturile pe orice tabel nou din `public`, si se bizuie numai pe RLS. Masurat pe
-- productie chiar la crearea tabelului asta: `DELETE,INSERT,...,UPDATE` pentru
-- amandoua rolurile, fara sa fi scris nimeni un `grant`.
--
-- Deci un `grant select` singur n-ar fi restrans NIMIC — ar fi fost un rand care
-- pare o incuietoare si nu e. Se revoca anume.
--
-- Jurnalul nu se scrie niciodata din browser: nici cronul, nici actiunile nu trec
-- prin cheia comerciantului. Asa, o politica de scriere adaugata din greseala peste
-- un an n-are cum sa deschida ce nu e acordat. Doua incuietori, nu una.
revoke insert, update, delete, truncate, references, trigger
  on table public.emag_request_log from anon, authenticated;
grant select on table public.emag_request_log to anon, authenticated;

notify pgrst, 'reload schema';
