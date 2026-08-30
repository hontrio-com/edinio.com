-- ═══════════════════════════════════════════════════════════════════════════
-- STERGEREA IN MASA CADEA PE „STATEMENT TIMEOUT"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE VEDEA COMERCIANTUL (VetDepo, 26.08.2026)
--
-- „Eroare la actiunea in masa. Incearca din nou." De sapte ori la rand, pe aceleasi 340 de
-- produse. Mesajul nu spune nimic — dar `bulkProductAction` scria motivul adevarat in
-- `error_logs`, si acolo scria: `canceling statement due to statement timeout`.
--
-- ⚠ DE CE. O cheie straina care arata spre `products` obliga Postgres, la fiecare rand sters, sa
-- caute randurile care il pomenesc. Fara index pe coloana care arata, cautarea aia e o SCANARE
-- INTREAGA a tabelei care arata — o data pentru fiecare produs sters.
--
-- Masurat pe productie, cu `explain (analyze)`, stergerea UNUI SINGUR produs al VetDepo:
--
--     total .......................................... 3018 ms
--     din care `product_import_rows_product_id_fkey` .. 2270 ms   (386.378 randuri, ZERO indexuri)
--     din care `catalog_index_cuvant_product_id_fkey` .. 725 ms   (205.101 randuri)
--     tot restul, cele 16 chei straine ramase ......... ~10 ms
--
-- 340 de produse × 3 secunde = vreo saptesprezece minute. Nicio limita de instructiune nu
-- ingaduie asta, si nici n-ar trebui.
--
-- ⚠ `catalog_index_cuvant` PAREA sa aiba index: `product_id` chiar apare in cheia primara
-- `(business_id, cuvant, product_id)`. Dar e a TREIA coloana, iar un index compus nu se poate
-- folosi pentru o cautare doar dupa ultima lui coloana. Numaratoarea „apare in vreun index" e
-- prea grosolana; `explain` a spus adevarul.
--
-- ⚠ DUPA INDEXURI, aceeasi masuratoare: 3018 ms → 19,6 ms. De 154 de ori mai repede. Iar chiar
-- cazul care pica — 340 de produse, in bucatile de 200 pe care le face codul — se face in 931 ms
-- plus 577 ms. O secunda si jumatate, fata de saptesprezece minute.
--
-- ⚠ CELE PATRU MICI (olx, gmc, aboutyou_retururi) sunt goale sau aproape azi, deci nu ele au
-- cauzat pana. Se indexeaza acum tocmai fiindca sunt goale: cand vor creste, ar deveni exact
-- acelasi defect, si atunci s-ar cauta din nou de la capat.
--
-- ⚠ CREATE INDEX CONCURRENTLY, ca sa nu se blocheze scrierile pe o tabela de 386 de mii de randuri
-- in mijlocul zilei. De aceea nu se poate rula intr-o tranzactie, deci si aici stau una sub alta.

create index concurrently if not exists product_import_rows_product_id_idx
  on public.product_import_rows (product_id) where product_id is not null;

create index concurrently if not exists catalog_index_cuvant_product_id_idx
  on public.catalog_index_cuvant (product_id);

create index concurrently if not exists olx_adverts_product_id_idx
  on public.olx_adverts (product_id) where product_id is not null;

create index concurrently if not exists olx_sync_queue_product_id_idx
  on public.olx_sync_queue (product_id) where product_id is not null;

create index concurrently if not exists gmc_sync_queue_product_id_idx
  on public.gmc_sync_queue (product_id) where product_id is not null;

create index concurrently if not exists aboutyou_retururi_product_id_idx
  on public.aboutyou_retururi (product_id) where product_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- ACEEASI MECANICA, LA `orders`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Proba scrisa pentru `products` a gasit imediat cincisprezece chei straine spre `orders` fara
-- index. Masurat: stergerea unei comenzi costa azi 55 ms, iar cele mai scumpe declansatoare sunt
-- `abandoned_carts` (17 ms) si `notice_sms_log` (11 ms).
--
-- ⚠ NU E O PANA, SI ASA SI SCRIE. Cele cincisprezece tabele au azi cel mult 216 randuri, deci
-- cea mai mare parte din cele 55 ms e cheltuiala fixa a declansatoarelor, nu scanare. Se indexeaza
-- tocmai fiindca sunt mici: `abandoned_carts` si `notice_sms_log` cresc cu fiecare comanda, iar
-- cand vor avea sute de mii de randuri ar fi exact prapastia de la `product_import_rows` — numai
-- ca atunci s-ar cauta din nou de la capat, si tot cu un comerciant care nu poate sa stearga.
--
-- ⚠ FARA `CONCURRENTLY`, si asta e o alegere: cea mai mare tabela are 152 kB, deci indexul se face
-- instantaneu si lacatul nu se simte. Asa incap toate intr-o singura migratie.

create index if not exists abandoned_carts_order_id_idx on public.abandoned_carts (order_id) where order_id is not null;
create index if not exists notice_sms_log_order_id_idx on public.notice_sms_log (order_id) where order_id is not null;
create index if not exists notice_inbox_order_id_idx on public.notice_inbox (order_id) where order_id is not null;
create index if not exists operatii_externe_order_id_idx on public.operatii_externe (order_id) where order_id is not null;
create index if not exists return_requests_order_id_idx on public.return_requests (order_id) where order_id is not null;
create index if not exists aboutyou_orders_order_id_idx on public.aboutyou_orders (order_id) where order_id is not null;
create index if not exists aboutyou_retururi_order_id_idx on public.aboutyou_retururi (order_id) where order_id is not null;
create index if not exists trendyol_orders_order_id_idx on public.trendyol_orders (order_id) where order_id is not null;
create index if not exists trendyol_claims_order_id_idx on public.trendyol_claims (order_id) where order_id is not null;
create index if not exists emag_orders_order_id_idx on public.emag_orders (order_id) where order_id is not null;
create index if not exists emag_rma_order_id_idx on public.emag_rma (order_id) where order_id is not null;
create index if not exists emag_awb_order_id_idx on public.emag_awb (order_id) where order_id is not null;
create index if not exists dhl_etichete_order_id_idx on public.dhl_etichete (order_id) where order_id is not null;
create index if not exists fedex_etichete_order_id_idx on public.fedex_etichete (order_id) where order_id is not null;
create index if not exists ups_etichete_order_id_idx on public.ups_etichete (order_id) where order_id is not null;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- SI DOUA PE CARE LE-A GASIT PROBA, NU EU
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `gmc_products` si `intentii_publicare` aveau `product_id` intr-un index COMPUS, dar pe pozitia
-- a doua: `(business_id, product_id)`, respectiv `(business_id, product_id, marketplace)`. Postgres
-- nu poate folosi un index compus pentru o cautare dupa a doua coloana, deci ele scanau. Azi n-are
-- efect — au 247 de randuri, iar o scanare pe atat costa jumatate de milisecunda — dar mecanica e
-- aceeasi cu cea de la `product_import_rows`.
--
-- ⚠ AICI PROBA A FOST MAI ATENTA DECAT MINE. Prima mea numaratoare a intrebat „apare `product_id`
-- in vreun index?" si a raspuns da pentru amandoua. Numai `explain` si apoi proba, care cere
-- coloana pe PRIMA pozitie, au aratat ca raspunsul ala nu inseamna nimic.

create index if not exists gmc_products_product_id_idx
  on public.gmc_products (product_id) where product_id is not null;

create index if not exists intentii_publicare_product_id_idx
  on public.intentii_publicare (product_id);

notify pgrst, 'reload schema';
