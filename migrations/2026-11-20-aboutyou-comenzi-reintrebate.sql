-- ═══════════════════════════════════════════════════════════════════════════
-- Comenzile neterminate se reintreaba pe NUMAR, nu pe fereastra de timp
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `orders_from` FILTREAZA DUPA DATA CREARII (26.08.2026)
--
-- Scrie chiar in codul nostru, la `candFacuta`: „Cursorul se construieste NUMAI din campul dupa
-- care se si filtreaza fereastra (`orders_from` merge pe `created_at`)."
--
-- Deci o comanda facuta acum trei saptamani care se anuleaza AZI nu mai reintra in nicio
-- fereastra: marcajul a trecut demult de data crearii ei. Ce se schimba la ea — o linie anulata,
-- una expediata, un retur — nu se mai afla NICIODATA pe calea obisnuita.
--
-- ⚠ Webhook-ul e calea rapida, dar nu e o garantie: daca ruta noastra e indisponibila cat timp
-- ei reincearca, evenimentul se pierde definitiv. Iar sondarea nu-l poate recupera, tocmai
-- fiindca filtreaza pe data crearii.
--
-- ⚠ ACEEASI FORMA CA LA RETURURILE TRENDYOL, reparata in aceeasi zi si din acelasi motiv: ce se
-- schimba in timp nu se urmareste cu o fereastra care merge inainte. Se reintreaba pe NUMARUL
-- comenzii, cele mai demult atinse intai.
--
-- ⚠ SI ROTATIA MERGE PE UN CAMP AL NOSTRU. `updated_at` se misca la fiecare scriere a randului
-- lateral, deci n-ar spune „cand am reintrebat"; iar `last_synced_at` se scrie si din alte cai.
-- `reintrebat_la` se scrie la FIECARE reintrebare, chiar si cand n-a venit nimic nou — altfel
-- aceleasi comenzi ar veni mereu primele si restul niciodata.

alter table public.aboutyou_orders
  add column if not exists reintrebat_la timestamp with time zone;

comment on column public.aboutyou_orders.reintrebat_la is
  'Cand a fost reintrebata comanda pe numar, chiar daca n-a venit nimic nou. Tine roata reconcilierii.';

-- ⚠ Indexul acopera chiar interogarea reconcilierii: pe magazin, cele mai demult atinse intai.
create index if not exists aboutyou_orders_reintrebat_idx
  on public.aboutyou_orders (business_id, reintrebat_la nulls first);

notify pgrst, 'reload schema';
