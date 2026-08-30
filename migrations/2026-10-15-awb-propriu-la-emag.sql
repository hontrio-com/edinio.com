-- ═══════════════════════════════════════════════════════════════════════════
-- AWB-UL CURIERULUI PROPRIU AJUNGE SI LA eMAG (25.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Panoul spunea „poți expedia cu curierul tău, eMAG le acceptă pe amândouă". Adevarat
-- despre ei — dar Edinio nu inchidea bucla: dupa un AWB emis cu curierul magazinului,
-- nimic nu-i trimitea numarul lui eMAG. Comanda ramanea la ei fara urmarire, ceea ce ei
-- numara.
--
-- ⚠ LA EI NU EXISTA CAMP DE AWB PE COMANDA. Verificat in schema lor (`OrderSave`, 22 de
-- campuri): nici `awb`, nici `tracking_number`. Singura cale e atasamentul `type = 10`,
-- care cere o ADRESA catre un `.pdf`.
--
-- Coloana asta e perechea lui `invoice_uploaded_at` si are acelasi rost: sa se stie ce
-- s-a urcat, ca sa nu se urce a doua oara si ca sa se poata gasi ce n-a apucat.
--
-- ⚠ NU e o dovada de idempotenta prin ea insasi — aia sta in `operatii_externe`, prin
-- `cuRegistru`. Coloana e cum se GASESC candidatii ieftin, fara sa citim registrul pentru
-- fiecare comanda la fiecare trecere.

alter table public.emag_orders
  add column if not exists awb_uploaded_at timestamptz;

comment on column public.emag_orders.awb_uploaded_at is
  'Cand s-a urcat la eMAG atasamentul cu AWB-ul curierului propriu (type 10). Gol = nu s-a urcat.';

-- ⚠ Indexul e PARTIAL, pe exact intrebarea pusa de cron: „care comenzi legate, aflate
-- intr-o stare in care un AWB are rost, n-au inca AWB-ul urcat". Pe intreaga tabela ar fi
-- crescut la fel de mult ca ea; asa ramane cat lucrul de facut, adica aproape gol.
--
-- ⚠ `order_status in (2, 3, 4)` — in procesare, pregatita, finalizata. O comanda ANULATA
-- (0) sau RETURNATA (5) nu va primi niciodata un AWB, iar una NOUA (1) nici n-a fost
-- confirmata. Lasate in bazin n-ar fi facut rau, dar ar fi INTARZIAT lucrul adevarat:
-- fereastra e rotativa, zece pe trecere la cinci minute, deci o mie de comenzi anulate
-- inseamna vreo opt ore pana se ajunge la un AWB nou. Adica un cumparator care asteapta
-- urmarirea o zi de lucru intreaga.
drop index if exists public.emag_orders_fara_awb_urcat_idx;
create index emag_orders_fara_awb_urcat_idx
  on public.emag_orders (business_id, created_at)
  where awb_uploaded_at is null and order_id is not null and order_status in (2, 3, 4);

notify pgrst, 'reload schema';
