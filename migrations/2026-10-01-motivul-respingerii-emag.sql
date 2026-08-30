-- Raspunsul lor brut, pastrat pentru ofertele pe care eMAG le-a respins.
--
-- ═══ ⚠ DE CE (audit 24.08.2026) ═══
--
-- 152 de oferte ale unui comerciant sunt respinse de eMAG: 112 cu documentatia
-- respinsa (`validation_status = 8`), 34 blocate (10), 6 cu EAN respins (6).
-- La TOATE 152, `doc_errors` e gol.
--
-- Deci omul are 152 de produse refuzate si nu-i aratam niciun motiv pentru niciunul.
-- E chiar greseala scrisa in planul integrarii ca fiind de evitat (§12.9, lectia
-- Trendyol: „motivul respingerii n-a fost aratat si produsele au stat «in aprobare»
-- la nesfarsit").
--
-- ⚠ NU STIM SUB CE CHEIE VINE MOTIVUL. Raspunsul lui `product_offer/read` NU e in
-- schema lor — e `ApiResponse` generic — iar noi citim `o.doc_errors` din presupunere,
-- exact ca la `ownership`, care s-a dovedit `boolean` in loc de intreg.
--
-- Deci se pastreaza raspunsul INTREG pentru ofertele respinse, si abia din el se scoate
-- ce se poate arata. Ghicitul se opreste cand exista dovada.
--
-- ⚠ Numai pentru cele respinse. Pastrat pentru toate, ar fi insemnat un jsonb pe
-- fiecare din cele 3.754 de randuri, rescris la fiecare trecere a cronului.

alter table public.emag_offers
  add column if not exists raspuns_brut jsonb;

comment on column public.emag_offers.raspuns_brut is
  'Raspunsul lor la ultima citire, pastrat DOAR pentru ofertele respinse de eMAG. Vezi migratia 2026-10-01.';

notify pgrst, 'reload schema';
