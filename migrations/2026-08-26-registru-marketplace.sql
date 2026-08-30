-- ═══════════════════════════════════════════════════════════════════════════
-- Registrul primeste felul `publicare` si furnizorii de marketplace
--
-- Publicarea unui produs pe un marketplace e un efect extern IREVERSIBIL in
-- acelasi sens ca un AWB: al doilea anunt e viu, public si, la OLX, platit.
--
-- Cazul cel mai curat e OLX (src/lib/olx/sync.ts): singura garda impotriva unui al
-- doilea anunt e `olx_adverts.olx_advert_id` — adica exact valoarea care NU s-a
-- apucat sa fie scrisa daca upsert-ul de dupa apel pica. Iar butonul „Reincearca"
-- (`retryOlxProduct`) duce fix acolo.
--
-- ⚠ CHECK-urile sunt liste ALBE dinadins (vezi antetul migratiei din 2026-08-20):
-- cheia contine numele furnizorului, deci „olx" scris intr-un loc si „OLX" in altul
-- ar produce doua spatii de nume separate si AMANDOUA ar publica. Adica exact
-- defectul pe care il inchidem. De aceea lista se extinde explicit, nu se scoate.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.operatii_externe
  drop constraint if exists operatii_externe_fel_check;

alter table public.operatii_externe
  add constraint operatii_externe_fel_check check (fel in (
    'awb', 'anulare_awb', 'ridicare',
    'factura', 'proforma', 'storno', 'anulare_document',
    'plata', 'incasare', 'rambursare',
    -- marketplace
    'publicare', 'retragere', 'expediere',
    'proba'));

alter table public.operatii_externe
  drop constraint if exists operatii_externe_furnizor_check;

alter table public.operatii_externe
  add constraint operatii_externe_furnizor_check check (furnizor in (
    'cargus', 'sameday', 'fancourier', 'dpd', 'woot', 'colete',
    'smartbill', 'oblio', 'fgo',
    'stripe', 'netopia', 'ipay', 'klarna', 'revolut',
    -- marketplace
    'trendyol', 'aboutyou', 'olx', 'gmc',
    'proba'));

commit;

notify pgrst, 'reload schema';

-- APLICATA in productie pe 20.08.2026, inainte de deploy: largeste doua liste albe,
-- deci nu poate respinge nimic din ce era deja acceptat.
--
-- VERIFICARE (in tranzactie anulata):
--   DO $t$ DECLARE v_biz uuid; v jsonb; BEGIN
--     select b.id into v_biz from public.businesses b limit 1;
--     v := public.rezerva_operatie_externa(v_biz, null, 'publicare', 'olx', 'proba:' || gen_random_uuid()::text);
--     if (v->>'rezervat')::boolean is not true then raise exception '>>> publicare/olx respinsa: %', v; end if;
--     RAISE EXCEPTION '>>> INCHIS: felul si furnizorul noi sunt acceptati. (anulata)';
--   END $t$;
