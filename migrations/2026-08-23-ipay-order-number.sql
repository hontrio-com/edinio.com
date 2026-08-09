-- ═══════════════════════════════════════════════════════════════════════════
-- BT iPay: referinta NOASTRA se salveaza, ca sa poata fi si cautata
--
-- CE ERA GRESIT
--
--   `ipayOrderNumber` (src/lib/ipay.ts) lipea `Date.now().toString(36)` plus
--   `Math.random()`, iar rezultatul NU se scria nicaieri — pe `orders` exista doar
--   `ipay_order_id`, adica UUID-ul BANCII, primit DUPA `register.do`.
--
--   Asta anula amandoua jumatatile pe care BT le ofera gratis:
--
--     1. Banca DEDUPLICA dupa `orderNumber` (register.do, errorCode 1: „Order with
--        this number was already processed"). Cu sufix din ceas, fiecare apasare
--        producea alt numar — deci alta plata.
--     2. Banca permite INTEROGAREA dupa el: `getOrderStatusExtended.do` accepta
--        `orderNumber` in locul lui `orderId`, iar `ipayGetOrderStatus`
--        (src/lib/ipay.ts) are deja ramura, doar ca nu o cheama nimeni.
--
--   Consecinta exacta: daca scrierea lui `ipay_order_id` pica dupa `register.do`,
--   plata EXISTA la banca si nimic nu o mai poate gasi — cronul `ipay-reconcile`
--   filtreaza chiar pe `ipay_order_id` nenul. Referinta trimisa dispare din univers.
--
-- CE ADAUGA
--
--   Coloana in care se scrie referinta INAINTE de apel. Forma e cea recomandata de
--   documentatia bancii — „nrFactură-0, nrFactură-1, nrFactură-2" — adica
--   determinista SI enumerabila: reconcilierea poate cauta orbeste `-0`, `-1`, `-2`
--   chiar daca nu s-a salvat nimic dupa apel.
--
--   ⚠ Incercarea trebuie sa CREASCA: iPay cere un numar nou per tentativa, iar o
--   plata expirata ar bloca-o pe urmatoarea cu errorCode 1.
--
-- Aditiva: o coloana noua, nullable. Codul vechi n-o atinge, deci se poate aplica
-- inainte de deploy.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists ipay_order_number text;

comment on column public.orders.ipay_order_number is
  'Referinta NOASTRA trimisa la BT iPay (register.do). Determinista si enumerabila (<numarComanda>-<incercare>), ca reconcilierea sa poata interoga getOrderStatusExtended.do dupa ea chiar daca ipay_order_id nu s-a salvat.';

-- Fara reincarcare, insertul/updatul cu coloana noua esueaza cu PGRST204 desi
-- coloana EXISTA. Vezi incidentul MFA din 04.08.
notify pgrst, 'reload schema';


-- APLICATA in productie pe 20.08.2026, inainte de deploy: e aditiva (o coloana
-- nullable pe care codul care ruleaza n-o atinge).
--
-- VERIFICARE:
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='orders' and column_name='ipay_order_number';
-- Trebuie sa intoarca exact un rand, `text`.
