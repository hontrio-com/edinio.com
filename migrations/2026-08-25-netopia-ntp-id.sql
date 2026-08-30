-- ═══════════════════════════════════════════════════════════════════════════
-- Netopia: `ntpID` se PASTREAZA, ca sa se poata scrie candva o reconciliere
--
-- `startNetopiaPayment` (src/lib/netopia.ts:178) intoarce `payment.ntpID`, dar ruta
-- de start il ARUNCA: `return NextResponse.json({ redirectUrl })`. Iar pe `orders`
-- nu exista nicio coloana Netopia — spre deosebire de Stripe, iPay, Klarna si
-- Revolut, care au fiecare una.
--
-- Consecinta: Netopia e singurul procesator FARA niciun cron de reconciliere, si
-- nici nu se putea scrie unul — o interogare de status ar cere `ntpID`, pe care nu
-- il aveam. Daca IPN-ul nu ajunge, plata se pierde tacut.
--
-- ⚠ CE NU FACE MIGRATIA ASTA: nu adauga cronul. Documentatia Netopia v2 pe care o
-- avem local e pentru API v1 (XML/certificat), deci NU e dovada ca v2 expune un
-- endpoint de status. Se cere Netopia in scris; candidatii de verificat sunt
-- `/payment/card/verify` si `/operation/status`, si daca accepta `orderID`
-- (referinta NOASTRA, care oricum se trimite) sau doar `ntpID`. Coloana asta e
-- exact ce lipseste ca raspunsul „doar ntpID" sa nu ne mai blocheze.
--
-- Aditiva: o coloana nullable pe care codul care ruleaza n-o atinge.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists netopia_ntp_id text;

comment on column public.orders.netopia_ntp_id is
  'Id-ul tranzactiei la Netopia (`payment.ntpID`), intors de /payment/card/start. Se arunca pana la 20.08.2026, iar fara el nu se poate interoga Netopia pentru o comanda anume - deci nu se putea scrie niciun cron de reconciliere.';

notify pgrst, 'reload schema';

-- APLICATA in productie pe 20.08.2026, inainte de deploy (aditiva).
