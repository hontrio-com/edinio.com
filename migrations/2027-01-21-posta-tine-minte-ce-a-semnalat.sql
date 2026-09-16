-- ═══════════════════════════════════════════════════════════════════════════
-- POSTA ROMANA: ce evenimente au fost DEJA semnalate comerciantului
--
-- ═══ ⚠ CE REPARA: UN EVENIMENT CARE CERE O DECIZIE SE PIERDE DE TOT ═══
--
--   Cronul Postei tinea minte UN SINGUR cod — `posta_status_code`, starea ultimului
--   eveniment vazut — si semnala numai daca ULTIMA stare cerea atentie SI codul ei
--   era altul decat cel retinut:
--
--       const schimbat = codNou !== null && codNou !== (o.posta_status_code ?? null);
--       if (schimbat && trebuieSemnalat(codNou)) { … }
--
--   Comentariul de deasupra spunea ca se pierde „al doilea din doua evenimente care
--   cer atentie". Masurat, pierderea e alta si mai mare: daca in fereastra de doua
--   ore intra „Refuz destinatar" (cod 21) si DUPA el un eveniment obisnuit —
--   „Redirectionat" (35), „Reexpediat" (36), o simpla scanare de tranzit — atunci
--   ultima stare NU cere atentie, iar refuzul nu se striga NICIODATA. Nu se striga
--   „al doilea": nu se striga nimic.
--
--   Ritmul postei face cazul obisnuit, nu rar. Refuzul la usa si redirectarea catre
--   oficiu se inregistreaza in aceeasi tura a factorului, deci ajung impreuna in
--   acelasi raspuns. Exact evenimentul care cere o decizie omeneasca e cel mai
--   probabil urmat de unul administrativ.
--
-- ═══ DE CE O LISTA, SI NU UN COD ═══
--
--   Aceeasi solutie ca la GLS, din 31.08: se tine minte CE am spus, nu CE am vazut
--   ultima data. Cheia unui eveniment e `<cod>|<data>`, cu data in forma lor
--   („ZZ.LL.AAAA HH:mm"), fiindca aia e valoarea pe care ne-o dau si singura care
--   deosebeste doua scanari cu acelasi cod.
--
--   ⚠ Nu se compara data evenimentului cu `posta_status_checked_at`: sunt doua
--   ceasuri diferite, iar Posta publica scanarile in loturi. Gaura aceea a fost deja
--   platita la GLS si e descrisa in migratia 2026-08-31.
--
--   `posta_status_code` RAMANE — el duce starea comenzii si raspunde la
--   `eStareFinala`, deci are treaba lui. `posta_status_checked_at` ramane si el,
--   pentru rotatie, unde chiar despre ceasul nostru e vorba.
--
-- Aditiva: o coloana nullable, fara implicit. Codul vechi n-o atinge, deci se poate
-- aplica INAINTE de deploy. Invers nu: cronul nou fara migratie scrie intr-o coloana
-- care nu exista si CADE la fiecare colet.
--
-- ⚠ `null` inseamna „n-am inregistrat niciodata ce am spus despre coletul asta".
-- Codul se bizuie pe asta ca sa nu strige TOT istoricul la prima trecere de dupa
-- migratie. De aia coloana NU primeste `default '[]'::jsonb`.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists posta_evenimente_semnalate jsonb;

comment on column public.orders.posta_evenimente_semnalate is
  'Cheile evenimentelor Postei Romane despre care comerciantul a fost deja '
  'instiintat, ca tablou JSON de siruri „<cod>|<data>", cu data in formatul lor '
  '(ZZ.LL.AAAA HH:mm). Inlocuieste memoria de UN SINGUR cod, care pierdea orice '
  'eveniment ce cerea atentie daca era urmat in aceeasi fereastra de unul '
  'administrativ. NULL = nu s-a inregistrat niciodata nimic pentru coletul asta, '
  'deci la prima vedere se semnaleaza doar starea curenta. '
  'Vezi src/app/api/cron/posta-tracking/route.ts.';

-- ---------------------------------------------------------------------------
-- PostgREST trebuie sa afle de coloana noua
--
-- ⚠ Fara asta, cronul primeste „column does not exist" pana la urmatoarea
-- repornire a PostgREST — care poate veni peste ore.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
