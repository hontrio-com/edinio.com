-- ═══════════════════════════════════════════════════════════════════════════
-- GLS: ce evenimente au fost DEJA semnalate comerciantului
--
-- ═══ ⚠ CE REPARA: DOUA CEASURI CARE NU AU CE COMPARA ═══
--
--   Cronul de urmarire hotara ce sa semnaleze comparand DATA EVENIMENTULUI, asa
--   cum o da GLS, cu `gls_status_checked_at` — momentul in care am intrebat NOI:
--
--       stari.filter(st => Date.parse(st.data) > vazutePanaLa)
--
--   Sunt doua ceasuri diferite, si intre ele sta intarzierea cu care GLS publica
--   scanarile. Soferul inregistreaza refuzul la livrare (cod 17) la 09:12, dar
--   scanarile de depou se incarca in loturi si evenimentul apare in API abia la
--   12:30. Cronul a rulat la 11:41 si ruleaza iar la 13:41: starea EXISTA acum in
--   raspuns, dar are data 09:12, care e mai VECHE decat 11:41. Deci se filtreaza.
--
--   Refuzul — singurul eveniment care cerea o decizie omeneasca — nu e semnalat
--   niciodata. La fel si returul (cod 23), care de regula poarta data zilei in
--   care coletul a fost intors, nu data la care apare in API. Acolo pretul e si
--   mai mare: marfa vine inapoi, rambursul nu se incaseaza, si nimeni nu afla.
--
-- ═══ DE CE O LISTA, SI NU INCA UN MOMENT DE TIMP ═══
--
--   Orice varianta bazata pe timp are aceeasi gaura, fiindca problema NU e
--   pragul, ci compararea a doua ceasuri. Singurul lucru care raspunde exact la
--   intrebarea „am spus deja asta?" e sa tinem minte CE am spus.
--
--   Cheia unui eveniment e `<cod>|<data ISO>`. Istoricul unui colet are cateva
--   zeci de linii si fereastra de urmarire e de 21 de zile, deci lista e marginita
--   natural; codul o taie oricum la 200 de intrari.
--
--   `gls_status_checked_at` RAMANE, dar numai pentru ce face bine: rotatia (cine
--   n-a fost intrebat de cel mai mult timp iese primul). Acolo e corect, fiindca
--   chiar despre ceasul nostru e vorba.
--
-- Aditiva: o coloana nullable, fara implicit. Codul vechi n-o atinge, deci se
-- poate aplica INAINTE de deploy. Invers nu: cronul nou fara migratie scrie
-- intr-o coloana care nu exista si CADE la fiecare colet.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists gls_evenimente_semnalate jsonb;

comment on column public.orders.gls_evenimente_semnalate is
  'Cheile evenimentelor GLS despre care comerciantul a fost deja instiintat, ca '
  'tablou JSON de siruri „<cod>|<data ISO>". Inlocuieste compararea datei '
  'evenimentului (ceasul GLS) cu gls_status_checked_at (ceasul nostru), care '
  'pierdea orice eveniment publicat cu intarziere — tipic refuzurile la livrare '
  'si retururile. Vezi src/app/api/cron/gls-tracking/route.ts.';

-- ---------------------------------------------------------------------------
-- PostgREST trebuie sa afle de coloana noua
--
-- ⚠ Fara asta, cronul primeste „column does not exist" pana la urmatoarea
-- repornire a PostgREST — care poate veni peste ore.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
