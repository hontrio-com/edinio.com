-- ═══════════════════════════════════════════════════════════════════════════
-- O SINGURA PRIVIRE NU DOVEDESTE CA UN LOT ORB S-A TERMINAT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (27.08.2026, noaptea)
--
-- Un lot ORB — trimis, cu raspunsul pierdut — se lamurea pana acum CITIND o data ce au ei: daca
-- la ei era deja starea de acum, lotul se inchidea ca `depasit` si nu se mai revenea niciodata.
-- Numai ca lotul ala poate sa se aseze la ei ORICAND, si dupa citirea noastra: loturile lor se
-- prelucreaza asincron, iar in contractul lor public nu scrie nicaieri ca doua loturi diferite se
-- aseaza in ordinea trimiterii.
--
--     10:00  GEN 10 pleaca, raspunsul se pierde   -> `necunoscut`
--     10:05  GEN 11 pleaca si se incheie          -> la ei e starea noua ✅
--     10:10  citim: identic                       -> inchidem GEN 10
--     11:30  GEN 10 se aseaza in sfarsit          -> la ei e IAR starea veche ❌
--
-- Si de la 11:30 incolo nu mai exista NIMIC care sa observe asta.
--
-- ⚠ RASPUNSUL NU E O CITIRE MAI DESTEAPTA, E MAI MULTE CITIRI. Tabelul de mai jos tine produsele
-- cu istoric problematic sub observatie o fereastra de timp si le compara periodic cu starea
-- dorita. Prima deriva descoperita porneste o retrimitere; veghea nu se stinge la prima citire
-- curata, ci dupa cateva la rand.

create table if not exists public.aboutyou_veghe (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  style_key text not null,
  product_id uuid,
  -- De ce e sub veghe: `lot-orb`, `generatie-depasita`, `lot-abandonat`. Se citeste in alarme.
  motiv text not null,
  pornita_la timestamp with time zone default now() not null,
  -- Pana cand se mai uita. Fiecare deriva gasita o impinge mai departe: cat timp produsul
  -- deriveaza, veghea nu are voie sa expire.
  pana_la timestamp with time zone not null,
  urmatoarea_verificare timestamp with time zone default now() not null,
  verificari integer default 0 not null,
  -- Cate citiri LA RAND au gasit produsul identic. O singura citire curata nu inchide veghea:
  -- exact aia era greseala de dinainte.
  curate_la_rand integer default 0 not null,
  reasertari integer default 0 not null,
  ultima_deriva_la timestamp with time zone,
  -- ⚠ O alarma se scrie o SINGURA data pe rand. Cronul bate din minut in minut; fara marcaj,
  -- acelasi produs ar umple jurnalul si ar ingropa alarmele adevarate.
  alarma_scrisa_la timestamp with time zone,
  creat_la timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  -- Un produs, o veghe. Doua motive pe acelasi style inseamna aceeasi treaba de doua ori.
  unique (business_id, style_key)
);

comment on table public.aboutyou_veghe is
  'Produsele About You cu istoric de lot orb, tinute sub observatie: se compara periodic cu starea dorita, fiindca un lot vechi se poate aseza si dupa o citire curata.';

-- ⚠ Indexul urmeaza chiar interogarea cronului: ce e scadent, cel mai vechi intai.
create index if not exists aboutyou_veghe_scadente_idx
  on public.aboutyou_veghe (urmatoarea_verificare);
create index if not exists aboutyou_veghe_magazin_idx
  on public.aboutyou_veghe (business_id);

alter table public.aboutyou_veghe enable row level security;

-- Citire numai pentru proprietar, ca la celelalte tabele About You. Scrierile raman service-role.
drop policy if exists owner_select_aboutyou_veghe on public.aboutyou_veghe;
create policy owner_select_aboutyou_veghe on public.aboutyou_veghe
  for select using (
    business_id in (
      select businesses.id from public.businesses
       where businesses.user_id = (select auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SI „TOATE PRODUSELE" NU MAI ARE PLAFON
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA
--
-- `enqueueForListings` se oprea la 20.000 de produse si intorcea `incomplet`. Pentru schimbarile
-- de setari exista deja o reluare (`aboutyou_config.fanout`), dar pentru „Sincronizeaza tot" si
-- „Publica toate" nu exista NICIUNA: la 30.000 de produse, ultimele 10.000 nu intrau niciodata in
-- coada, iar o noua apasare pornea iar de la inceput — deci exact ele n-ar fi plecat vreodata.
--
-- ⚠ SI CAMPUL DIN CONFIG AVEA UN SINGUR LOC. O apasare pe „Publica toate" urmata de o salvare de
-- setari suprascria cursorul publicarii cu cel al preturilor: prima lucrare disparea in tacere.
-- Un rand per lucrare nu are cum sa se calce in picioare.
--
-- ⚠ SI URMA SE SCRIE INAINTEA LUCRULUI. Randul se creeaza INAINTE de prima transa; daca actiunea
-- moare la jumatate, lucrarea exista deja si cronul o duce la capat. Invers — cum era —, scrierea
-- cursorului picata dupa 20.000 de randuri puse lasa restul catalogului fara nimic care sa-l mai
-- atinga, in timp ce ecranul spunea „Salvat". Acelasi tipar ca `cuLotDurabil`.

create table if not exists public.aboutyou_bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  op text not null,
  -- Ultimul `product_id` DUS LA CAPAT, nu ultimul citit. Ordinea e crescatoare, deci reluarea
  -- „mai mare decat" nu poate nici sari, nici repeta un produs; un `offset` ar fi alunecat la
  -- fiecare listare noua sau stearsa intre treceri.
  dupa uuid,
  -- Filtrele cu care a pornit lucrarea, ca reluarea sa citeasca exact aceeasi multime.
  status_filtru text,
  doar_trimise boolean default false not null,
  puse integer default 0 not null,
  status text default 'deschis' not null,
  last_error text,
  creat_la timestamp with time zone default now() not null,
  atins_la timestamp with time zone default now() not null,
  terminat_la timestamp with time zone,
  constraint aboutyou_bulk_jobs_op_check check (op = any (array['upsert'::text, 'price'::text, 'publish'::text])),
  constraint aboutyou_bulk_jobs_status_check check (status = any (array['deschis'::text, 'gata'::text, 'oprit'::text]))
);

comment on table public.aboutyou_bulk_jobs is
  'Lucrarile in masa About You (Sincronizeaza tot, Publica toate, raspandirea unei setari globale), reluate de cron pana la capat. Fara plafon terminal.';

-- ⚠ O singura lucrare DESCHISA per magazin si operatie. A doua apasare pe acelasi buton continua
-- lucrarea care merge, nu porneste inca una care ar parcurge acelasi catalog in paralel.
create unique index if not exists aboutyou_bulk_jobs_unic_deschis_idx
  on public.aboutyou_bulk_jobs (business_id, op)
  where status = 'deschis';

create index if not exists aboutyou_bulk_jobs_deschise_idx
  on public.aboutyou_bulk_jobs (atins_la)
  where status = 'deschis';

alter table public.aboutyou_bulk_jobs enable row level security;

drop policy if exists owner_select_aboutyou_bulk_jobs on public.aboutyou_bulk_jobs;
create policy owner_select_aboutyou_bulk_jobs on public.aboutyou_bulk_jobs
  for select using (
    business_id in (
      select businesses.id from public.businesses
       where businesses.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
