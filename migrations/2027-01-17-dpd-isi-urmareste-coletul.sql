-- Urmarirea coletului DPD: starea lui ajunge pe comanda - 15.09.2026
--
-- ═══ CE LIPSEA ═══
--
-- DPD e al DOILEA curier al platformei dupa trafic (3 AWB-uri reusite, 2 esuate, 5 comenzi cu numar
-- DPD), si era, alaturi de Woot, fara nicio bucla de urmarire. Auditul din 05.07.2026 il numea
-- deja: „fara tracking (shipment/info)". Comenzile DPD raman pe starea la care le-a lasat emiterea.
--
-- ═══ ⚠ DE CE `status_code` E INTREG, SI DE CE POATE FI NEGATIV ═══
--
-- DPD isi publica tabelul de coduri („Appendix 1 - Track And Trace Operation Codes", din
-- `api.dpd.ro/web-api.html`), iar codurile sunt NUMERE: 1 Arrival Scan, 12 Out for Delivery,
-- 44 Unsuccessful Delivery, 111 Return to Sender.
--
-- ⚠⚠ Iar „Livrat" e **-14**. NEGATIV. Un `smallint` fara semn sau un parser care taie semnul ar
-- citi 14, care in CEALALTA lista a lor (Appendix 2, codurile de exceptie) inseamna „Refused by
-- recipient - not ordered". Adica exact pe dos. De aceea coloana e `integer`, si de aceea harta din
-- `statusuri-dpd.ts` isi tine cheile ca SIRURI.
--
-- ⚠ Deosebirea fata de Woot, si e toata deosebirea: DPD PUBLICA tabelul, deci aici comanda chiar se
-- poate muta si factura poate pleca. La Woot nu exista nicio enumerare nicaieri, si de aceea cronul
-- lui inregistreaza si nu hotaraste (vezi migratia `2027-01-14`).
--
-- ═══ ⚠ SI ETICHETA LOR, LANGA NUMAR ═══
--
-- Raspunsul lor poarta `description`, in romana daca ceri `language: "RO"`. Se pastreaza: numarul e
-- pentru cod, textul e pentru om. Aceeasi pereche ca la Sameday si la Woot.
--
-- ═══ ⚠ IDENTITATEA E `dpd_awb_number` ═══
--
-- `BASE_URL/track` cere NUMERE DE COLET (`parcels[].id`), nu identificatorul expedierii. La noi
-- acela e `dpd_awb_number`; `dpd_shipment_id` e altceva si nu se potriveste pe drumul asta.
--
-- ═══ CE NU FACE ═══
--
-- Nimic retroactiv. ⚠ In special `dpd_awb_at` NU se umple din `created_at`: ar fi o data INVENTATA
-- a expedierii, care intra apoi in fereastra de urmarire ca si cum ar fi masurata. Cele cinci
-- comenzi vechi raman cu `null` si intra in urmarire prin ramura de `awb_at is null`, cat timp
-- COMANDA e in fereastra.
--
-- Cele patru coloane sunt aditive si anulabile; nicio citire existenta nu se schimba.

alter table public.orders
  add column if not exists dpd_awb_at timestamptz,
  add column if not exists dpd_status_code integer,
  add column if not exists dpd_status_label text,
  add column if not exists dpd_status_checked_at timestamptz;

comment on column public.orders.dpd_awb_at is
  'Cand a fost emis AWB-ul DPD. Fereastra de urmarire a cronului se masoara de aici, nu din `created_at`.';
comment on column public.orders.dpd_status_code is
  'Ultimul cod de operatie DPD (Appendix 1). ⚠ INTREG cu semn: „Livrat" e -14, iar 14 inseamna cu totul altceva in tabelul lor de exceptii.';
comment on column public.orders.dpd_status_label is
  'Descrierea lor pentru ultima operatie, asa cum o scriu ei. Numarul e pentru cod, textul e pentru om.';
comment on column public.orders.dpd_status_checked_at is
  'Cand a fost intrebat ultima oara DPD despre acest colet. Cronul ia mereu cele mai vechi, NULLS FIRST.';

create index if not exists orders_dpd_urmarire_idx
  on public.orders using btree (dpd_status_checked_at nulls first)
  where dpd_awb_number is not null
    and status = any (array['pending', 'confirmed', 'processing', 'shipped']);
