-- ═══════════════════════════════════════════════════════════════════════════
-- SAMEDAY: URMARIRE, COST SI COD DE LOCKER (25.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Auditul documentatiei lor v2.3, confruntata cu ce aveam, a aratat ca din 14 rute foloseam
-- 8, si ca lipsea cu totul urmarirea coletului. Sameday era singurul curier din doisprezece
-- fara ea: unsprezece au cron de urmarire SI o coloana `*_awb_at` dupa care umbla cronul.
-- Sameday avea `sameday_awb_number` si atat.
--
-- ⚠ POTRIVIREA E EXACTA, si de-aia se vede: cei unsprezece curieri cu cron sunt exact cei
-- unsprezece cu `*_awb_at`. Coloana nu e decor, e marcajul din care cronul stie ce sa
-- priveasca si cat de departe in urma sa se uite.

alter table public.orders
  -- Cand a fost emis AWB-ul. Fereastra de urmarire se masoara de aici.
  add column if not exists sameday_awb_at timestamptz,

  -- ⚠ Costul REAL al transportului, pe care ei ni-l intorc la emitere (`awbCost`) si pe care
  -- il aruncam. Nu se afla din nicio alta parte: estimarea de la checkout e o estimare.
  add column if not exists sameday_awb_cost numeric,

  -- ⚠ Codul cu care CUMPARATORUL deschide easybox-ul ca sa predea un retur
  -- (`lockerReturnChargeCode`). Ei il dau o singura data, in raspunsul de la emitere. Nesalvat,
  -- se pierde pentru totdeauna, iar omul nu-si mai poate preda coletul.
  add column if not exists sameday_locker_charge_code text,

  -- Ultimul status citit de la ei, si cand.
  add column if not exists sameday_status_id int,
  add column if not exists sameday_status_label text,
  add column if not exists sameday_status_checked_at timestamptz;

comment on column public.orders.sameday_awb_cost is
  'Costul real al transportului, asa cum l-a intors Sameday la emiterea AWB-ului.';
comment on column public.orders.sameday_locker_charge_code is
  'Codul de incarcare in easybox pentru retururi. Sameday il da o singura data, la emitere.';
comment on column public.orders.sameday_status_label is
  'Eticheta lor, in romana, gata de aratat. Hotararile se iau din `delivered`/`canceled`, nu de aici.';

-- ⚠ Indexul urmeaza chiar intrebarea cronului: „comenzile cu AWB, cele neintrebate de cel
-- mai mult timp intai". Fara el, fiecare trecere ar citi tot tabelul de comenzi.
create index if not exists orders_sameday_de_urmarit_idx
  on public.orders (sameday_status_checked_at nulls first)
  where sameday_awb_number is not null;

notify pgrst, 'reload schema';
