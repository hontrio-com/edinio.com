-- Rambursul Woot: starea banilor incasati de curier ajunge pe comanda - 15.09.2026
--
-- ═══ CE LIPSEA, MASURAT ═══
--
-- Prin Woot au plecat 199 de comenzi cu ramburs, aproape 15.600 lei, si nimic din platforma nu
-- spunea vreodata daca banii au fost chiar virati inapoi comerciantului. 192 dintre ele stau si
-- azi pe `payment_status = 'unpaid'`, fiindca nimeni nu le-a spus niciodata altceva.
--
-- Partea de BANI VIRATI intra in `courier_settlements`, tabelul deschis de FAN pe 13.09.2026, si
-- se vede in pagina `/dashboard/settlements` fara nicio schimbare de interfata: tabelul e generic
-- pe `courier`. Coloanele de aici sunt cealalta jumatate, cea care nu incape acolo.
--
-- ═══ ⚠ DE CE NU INCAPE TOT IN `courier_settlements` ═══
--
-- Acolo `transfer_date` e NOT NULL, si pe buna dreptate: un rand din pagina de decontari inseamna
-- „banii astia au fost virati in ziua asta". Dar un ramburs mai are trei stari inainte de aceea,
-- si tocmai ele lipsesc azi comerciantului:
--
--     0=Cancelled   1=Unpicked   2=Picked up   3=Paid   4=External
--
-- ⚠ Lista e a LOR, documentata chiar in specificatie, pe campul `status_id` al schemei
-- `Repayment`. Nu e ghicita, spre deosebire de starile unei COMENZI, unde nu exista nicio
-- enumerare si de aceea cronul de urmarire nu hotaraste nimic (vezi migratia `2027-01-14`).
--
-- „Incasat de curier, inca nevirat" e cea mai utila dintre ele: banii exista, sunt la ei, si se
-- stie pe ce comanda. Fara coloanele astea, singurul raspuns ar fi tacerea.
--
-- ═══ ⚠ DE CE SE TINE SI SUMA LOR ═══
--
-- `woot_cod_value` nu e decor: e suma pe care o tin EI, iar noi avem separat suma pe care o
-- asteptam. Cand cele doua difera, diferenta e chiar intrebarea pe care trebuie sa si-o puna
-- comerciantul. Fara suma lor, o nepotrivire n-ar avea de unde sa iasa la iveala.
--
-- ═══ CE NU FACE ═══
--
-- ⚠ NU atinge `payment_status`. Tentatia e mare, fiindca „virat" chiar inseamna ca banii au ajuns
-- la comerciant, iar cele 192 de comenzi ar deveni „platite" dintr-o singura scriere. Dar
-- `payment_status` e si declansatorul facturarii automate: o singura interpretare gresita a
-- rambursului ar emite facturi in lant. Trecerea aia merita lotul ei, cu masuratoare si cu
-- hotararea proprietarului, nu un efect lateral al unei reconcilieri.
--
-- Nimic retroactiv: comenzile vechi raman cu `null` pe toate trei pana le vede cronul.
--
-- Cele trei coloane sunt aditive si anulabile; nicio citire existenta nu se schimba.

alter table public.orders
  add column if not exists woot_cod_status_id integer,
  add column if not exists woot_cod_value numeric,
  add column if not exists woot_cod_updated_at timestamptz;

comment on column public.orders.woot_cod_status_id is
  'Starea rambursului la Woot, din lista LOR documentata: 0=anulat, 1=neincasat, 2=incasat de curier, 3=virat, 4=extern.';
comment on column public.orders.woot_cod_value is
  'Suma de ramburs pe care o tin EI. Comparata cu ce asteptam noi, o nepotrivire iese la iveala.';
comment on column public.orders.woot_cod_updated_at is
  'Cand am aflat ultima oara starea rambursului de la ei.';

create index if not exists orders_woot_cod_idx
  on public.orders using btree (business_id, woot_cod_status_id)
  where woot_cod_status_id is not null;
