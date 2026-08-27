-- ═══════════════════════════════════════════════════════════════════════════
-- „IN CATE ZILE EXPEDIEZI", LA TRENDYOL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ SE POATE, DAR NU CA LA eMAG (27.08.2026)
--
-- Trendyol are un singur camp echivalent: `deliveryDuration`, intreg, optional, INVELIT in
-- `deliveryOption` (singular) la creare/actualizare de produs, si in `deliveryOptions` (PLURAL) pe
-- ruta dedicata `delivery-info-bulk-update`. Se declara pe BARCOD, nu pe magazin.
--
-- La eMAG comerciantul alege dintr-o lista pe care ei ne-o dau (`/handling_time/read`). Trendyol
-- n-are asa ceva: documentatia lor da inteles doar lui `0` („azi in curier") si `1` („cel tarziu
-- maine"), iar OpenAPI-ul spune atat, `integer` — fara minim, maxim sau lista. Fraza lor e „poti
-- introduce durate in intervalele indicate de echipele de operatiuni", iar intervalul ala nu e
-- publicat nicaieri.
--
-- Deci nu putem promite „expediez in 3 zile" pana nu se probeaza pe un cont adevarat. Ecranul
-- ofera exact ce e documentat: azi, maine, sau „cum e in contul Trendyol".
--
-- ⚠ CE SE ADAUGA IN BAZA: doar operatia de coada. `livrare` merge pe ruta usoara,
-- `delivery-info-bulk-update`, care NU atinge continutul — pe cand `upsert` ar trimite produsul
-- intreg si l-ar trece din nou prin revizuia lor, pentru un singur numar. Aceeasi regula ca la
-- eMAG, unde confuzia intre ruta grea si cea usoara a raportat succes pe 1051 de produse fara sa
-- schimbe niciun pret.
--
-- ⚠ CONSTRANGEREA SE SCHIMBA INAINTE DE A SE SCRIE VALOAREA. O valoare pe care `check`-ul o
-- respinge nu strica randul: il opreste sa existe. Coada ar fi tacut, iar termenul n-ar fi plecat
-- niciodata — si nimic n-ar fi aratat de ce.

alter table public.trendyol_sync_queue drop constraint if exists trendyol_sync_queue_op_check;
alter table public.trendyol_sync_queue add constraint trendyol_sync_queue_op_check
  CHECK ((op = ANY (ARRAY['upsert'::text, 'delete'::text, 'inventory'::text, 'livrare'::text])));

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- SI FELUL LOTULUI, PE CARE MI L-A PRINS O PROBA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `trendyol_batches` are propria constrangere pe `kind`, iar `recordBatch(..., "livrare", ...)`
-- ar fi fost respins. Randul de lot n-ar fi existat, deci lotul nu s-ar fi sondat NICIODATA: la
-- Trendyol termenul s-ar fi schimbat, iar la noi n-am fi aflat nici daca a mers, nici daca nu.
--
-- ⚠ N-am gasit-o eu. A gasit-o `audit-integritate.test.ts`, care aduna felurile de lot scrise in
-- cod si le confrunta cu constrangerea din baseline — o proba scrisa cu luni in urma, tocmai
-- pentru asta. E a doua oara azi cand un `check` uitat ar fi oprit un rand sa existe.

alter table public.trendyol_batches drop constraint if exists trendyol_batches_kind_check;
alter table public.trendyol_batches add constraint trendyol_batches_kind_check
  CHECK ((kind = ANY (ARRAY['product'::text, 'inventory'::text, 'archive'::text, 'update'::text,
                            'delete'::text, 'dezarhivare'::text, 'livrare'::text])));

notify pgrst, 'reload schema';
