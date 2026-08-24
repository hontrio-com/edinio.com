-- ═══════════════════════════════════════════════════════════════════════════
-- Un al doilea contor pentru coada eMAG: pauzele, separat de încercări
-- 24.08.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE SE REPARĂ
--
-- Verdictul „trecătoare" (429, timeout, 5xx, releul căzut) elibera rândul FĂRĂ nicio
-- amânare și fără plafon: `update({revendicat_pana: null, last_error: …})`, atât.
--
-- Deci la o pană la ei sau la releul de IP fix, cronul lua în FIECARE MINUT aceleași 30
-- de rânduri și le trimitea iar. Documentația lor spune explicit că și cererile invalide
-- se numără în limită — bucla ardea chiar cele 3 cereri pe secundă prin care ar fi
-- trebuit să plece o mișcare de stoc după o vânzare. Iar cu un timeout de 25 s, două
-- elemente blocate consumau singure toată trecerea și opreau capul cozii.
--
-- ⚠ DE CE UN CONTOR NOU, ȘI NU `attempts`
--
-- `attempts` numără REFUZURI și duce la abandon după cinci. Numărate acolo, cinci minute
-- de 429 ar fi golit definitiv coada unui magazin — chiar incidentul de la Trendyol, și
-- chiar motivul pentru care ramura „trecătoare" nu ardea nimic.
--
-- Cele două întrebări sunt diferite: „de câte ori a fost refuzat?" (se abandonează) și
-- „de câte ori n-am putut ajunge la ei?" (se așteaptă mai mult, dar nu se renunță
-- NICIODATĂ). Un singur contor pentru două bucle e greșeala scrisă la §12.11 din planul
-- integrării.
--
-- `pauze` nu are prag de abandon, dinadins: o pană trece, iar elementul trebuie să fie
-- acolo când trece.

alter table public.emag_sync_queue
  add column if not exists pauze integer default 0 not null;

comment on column public.emag_sync_queue.pauze is
  'De cate ori elementul a fost amanat pentru o pana trecatoare (429, timeout, 5xx). '
  'SEPARAT de `attempts`, care numara refuzuri si duce la abandon dupa cinci: o pana '
  'nu e vina elementului si nu trebuie sa-l scoata niciodata din coada.';

notify pgrst, 'reload schema';
