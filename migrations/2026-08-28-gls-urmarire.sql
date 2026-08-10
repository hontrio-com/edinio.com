-- ═══════════════════════════════════════════════════════════════════════════
-- GLS: memoria urmaririi coletelor
--
-- CE ADAUGA
--
--   1. `orders.gls_status_code`       — ultimul cod de status GLS prelucrat.
--   2. `orders.gls_status_checked_at` — cand a intrebat cronul ultima oara.
--   3. Un index PARTIAL pentru interogarea cronului.
--
-- ═══ ⚠ DE CE NU E DE AJUNS SA CITIM STATUSUL COMENZII ═══
--
--   Cronul de urmarire (`/api/cron/gls-tracking`) intreaba MyGLS ce s-a intamplat
--   cu fiecare colet si muta comanda. Dar o parte din evenimente NU misca statusul
--   si totusi cer atentia comerciantului: retur la expeditor, refuz la livrare,
--   adresa gresita, colet distrus. Comanda ramane „expediata" — pe buna dreptate,
--   fiindca anularea si rambursarea sunt decizii omenesti, nu ale curierului.
--
--   Fara un loc in care sa tinem minte ce am vazut deja, fiecare rulare ar
--   semnala DIN NOU acelasi retur. Din doua in doua ore, la nesfarsit. Iar un
--   avertisment care striga mereu nu mai e citit nici cand e adevarat.
--
--   `gls_status_code` e memoria aceea. Se compara cu ultimul cod venit de la GLS
--   si se semnaleaza doar ce s-a schimbat.
--
-- ═══ ⚠ DE CE DOUA COLOANE, SI NU UNA ═══
--
--   `gls_status_checked_at` NU e data evenimentului de la GLS, e momentul in care
--   AM INTREBAT noi. Sunt lucruri diferite, si a doua e cea care da ROTATIA
--   dreapta: cronul ia intotdeauna coletele neintrebate de cel mai mult timp
--   (`order by gls_status_checked_at nulls first`), deci un plafon pe rulare nu
--   mai lasa niciodata aceleasi comenzi pe dinafara.
--
--   Data evenimentului de la GLS nu se pastreaza: panoul o cere oricum live, cu
--   descrierile in romana, cand comerciantul deschide comanda.
--
-- ═══ ⚠ DE CE `text` SI NU `integer` ═══
--
--   Codurile sunt numerice (Appendix G: 5, 51, 55), dar `StatusCode` vine de la
--   MyGLS ca SIR. Pastrat ca text, un cod nou sau neasteptat se scrie asa cum a
--   venit, in loc sa cada la scriere sau sa devina tacut `null`. Interpretarea o
--   face `src/lib/gls/statusuri.ts`, care stie deja sa nu se increada in el
--   (`codNumeric` intoarce `null` pentru orice nu e intreg).
--
-- Aditiva: doua coloane nullable si un index. Codul vechi nu le atinge, deci se
-- poate aplica INAINTE de deploy. Invers nu: cronul fara migratie scrie in
-- coloane care nu exista.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Memoria de pe comanda
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists gls_status_code text;

comment on column public.orders.gls_status_code is
  'Ultimul StatusCode GLS prelucrat de cronul de urmarire, exact cum a venit '
  '(sir, desi continutul e numeric — Appendix G). Serveste la a NU semnala de '
  'doua ori acelasi eveniment. Interpretarea: src/lib/gls/statusuri.ts.';

alter table public.orders
  add column if not exists gls_status_checked_at timestamptz;

comment on column public.orders.gls_status_checked_at is
  'Cand a intrebat cronul ultima oara de acest colet — NU data evenimentului de '
  'la GLS. Da rotatia: se iau intotdeauna coletele neintrebate de cel mai mult '
  'timp, deci plafonul pe rulare nu lasa mereu aceleasi comenzi pe dinafara.';

alter table public.orders
  add column if not exists gls_awb_at timestamptz;

comment on column public.orders.gls_awb_at is
  'Cand s-a emis AWB-ul GLS. Fereastra cronului se ancoreaza pe EL, nu pe '
  'created_at: o comanda veche careia i se emite AWB tarziu ar fi ramas altfel in '
  'afara ferestrei si nu s-ar fi urmarit niciodata. Si nu pe updated_at, pe care '
  'declansatorul l-ar improspata la fiecare trecere a cronului, tinand coletul in '
  'fereastra la nesfarsit.';

-- ---------------------------------------------------------------------------
-- 2. Indexul cronului
--
-- ⚠ PARTIAL, pe `gls_awb_number is not null`.
--
-- Comenzile cu AWB GLS sunt o mana din tabel; un index pe tot `orders` ar fi
-- platit la fiecare scriere de comanda, pentru un cron care ruleaza din doua in
-- doua ore. Precedentul e `orders_cupon_neplatit_idx`, din acelasi motiv.
--
-- `nulls first` nu e ornament: e chiar ordinea ceruta de cron, iar implicitul lui
-- Postgres la `asc` e `nulls last`. Scris invers, coletele NEINTREBATE VREODATA —
-- exact cele mai importante — ar fi iesit ultimele si, sub plafon, niciodata.
-- ---------------------------------------------------------------------------
-- ⚠ Si statusul intra in PREDICAT, nu doar in interogare.
--
-- Comenzile incheiate (livrate, anulate, rambursate) isi pastreaza numarul de
-- colet, deci ar ramane in index cu marcajul inghetat la ultima verificare — adica
-- exact in CAPUL lui, fiindca acolo sorteaza cele mai vechi. Cu vremea, primele
-- randuri citite ar fi numai comenzi moarte, iar cele vii n-ar mai ajunge la rand.
--
-- Cu statusul in predicat, randul IESE din index in clipa in care comanda se
-- incheie. Predicatul e scris exact ca filtrul din cron, ca planificatorul sa poata
-- dovedi implicatia si sa foloseasca indexul.
create index if not exists orders_gls_urmarire_idx
  on public.orders (gls_status_checked_at asc nulls first)
  where gls_awb_number is not null
    and status = any (array['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]);

-- ---------------------------------------------------------------------------
-- 3. PostgREST trebuie sa afle de coloanele noi
--
-- ⚠ Fara asta, cronul primeste „column does not exist" pe `gls_status_code` si pe
-- `gls_status_checked_at` pana la urmatoarea repornire a PostgREST — care poate
-- veni peste ore.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
