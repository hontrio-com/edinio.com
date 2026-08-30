-- ═══════════════════════════════════════════════════════════════════════════
-- SAMEDAY: AWB DE RETUR (25.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pana azi retururile prin Sameday nu erau doar nefolosite, erau IMPOSIBILE: `thirdPartyPickup`
-- pleca scris fix pe `0`, in ambele locuri din care se emitea, iar ambele servicii de retur
-- (Retur Standard si Locker Retur) cer ca ridicarea sa se faca de la CUMPARATOR, cu magazinul
-- ca destinatar. Nu exista nicio cale de a le atinge.
--
-- ⚠ SE TINE SEPARAT DE `sameday_awb_number`, si nu din exces de zel. O comanda poate avea in
-- acelasi timp un AWB de tur, livrat, si unul de retur, in drum inapoi. Scrise in aceeasi
-- coloana, al doilea l-ar sterge pe primul — iar urmarirea, care se uita la
-- `sameday_awb_number`, ar incepe sa raporteze drumul returului drept drumul comenzii.

alter table public.orders
  add column if not exists sameday_return_awb_number text,
  add column if not exists sameday_return_awb_at timestamptz;

comment on column public.orders.sameday_return_awb_number is
  'AWB-ul de retur emis prin Sameday: ridicare de la cumparator, livrare la magazin.';

notify pgrst, 'reload schema';
