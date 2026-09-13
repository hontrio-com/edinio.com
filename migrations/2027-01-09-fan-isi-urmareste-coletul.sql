-- Urmarirea coletului FAN: starea AWB-ului ajunge pe comanda - 13.09.2026
--
-- ═══ CE LIPSEA ═══
--
-- FAN nu era intrebat NICIODATA ce s-a intamplat cu un AWB dupa ce a fost emis. Zero cron,
-- zero functie in client, zero coloane. Comanda ramanea „Expediata" pana cand suna clientul,
-- iar un retur sau o adresa gresita se aflau cu zile intarziere, cand coletul era deja inapoi.
--
-- Doisprezece curieri au deja bucla asta, cu ACELEASI trei coloane: eColet, GLS, Pall-Ex,
-- Posta, Innoship, Packeta, SmartShip, Shipo, FedEx, UPS, DHL, Sameday. FAN si Woot erau
-- singurii fara. Coloanele de aici urmeaza tiparul lor intocmai, ca sa nu se nasca a
-- treisprezecea conventie.
--
-- ═══ ⚠ DE CE `status_code` E TEXT, SI NU INTREG CA LA SAMEDAY ═══
--
-- FAN publica un tabel de coduri STABIL (`reports/awb-events`, pag. 41-44 din documentatia
-- lor): `S2` livrat, `S43` retur, `S6` receptie refuzata, `S42` adresa gresita, `S46` predat
-- in punct, `S49` activitate suspendata. Sunt siruri cu litera in fata, nu numere.
--
-- `sameday_status_id` si `packeta_status_code` sunt `integer` fiindca acei curieri chiar dau
-- numere. Copiat orbeste aici, tipul ar fi taiat litera si ar fi facut din `S2` si `H2`
-- acelasi cod: doua stari care nu au nimic in comun, una fiind „Livrat" si cealalta „in
-- tranzit". De aia coloana e `text`, ca la ceilalti zece.
--
-- ═══ ⚠ DE CE E NEVOIE SI DE `awb_at` ═══
--
-- Nu e decor: cronul cere starile doar pentru AWB-urile din ultimele saptamani, iar fereastra
-- aia se masoara de la momentul emiterii. Fara coloana, singurul reper ar fi `created_at` al
-- comenzii, care poate fi cu luni inainte de expediere. Aceeasi pereche exista la toti
-- ceilalti doisprezece.
--
-- ═══ INDEXUL ═══
--
-- Partial si pe aceeasi forma ca `orders_ecolet_urmarire_idx` / `orders_gls_urmarire_idx`:
-- ordonat dupa `status_checked_at` cu NULLS FIRST, fiindca rotatia cronului ia mereu comenzile
-- neverificate de cel mai mult timp, iar cele niciodata verificate trebuie sa fie primele.
-- Filtrul pe `status` tine indexul mic: o comanda livrata sau anulata nu se mai intreaba.
--
-- ═══ CE NU FACE ═══
--
-- Nimic retroactiv, si nu din lene. Comenzile vechi raman cu `null` pe toate trei.
--
-- ⚠ In special `fan_courier_awb_at` NU se umple din `created_at`: ar fi o data INVENTATA a
-- expedierii, care ar intra apoi in fereastra de urmarire si in orice raport ca si cum ar fi
-- masurata. Masurat inainte de migratie: zero AWB-uri FAN emise vreodata in productie, deci
-- nu exista nicio comanda care sa piarda ceva.
--
-- Cele trei coloane sunt aditive si anulabile; nicio citire existenta nu se schimba.

alter table public.orders
  add column if not exists fan_courier_awb_at timestamptz,
  add column if not exists fan_courier_status_code text,
  add column if not exists fan_courier_status_checked_at timestamptz;

comment on column public.orders.fan_courier_awb_at is
  'Cand a fost emis AWB-ul FAN. Fereastra de urmarire a cronului se masoara de aici, nu din `created_at`.';
comment on column public.orders.fan_courier_status_code is
  'Ultimul cod de stare de la FAN (`reports/awb-events`: S2 livrat, S43 retur, S42 adresa gresita...). TEXT, fiindca literele deosebesc familiile: S2 nu e H2.';
comment on column public.orders.fan_courier_status_checked_at is
  'Cand a fost intrebat ultima oara FAN despre acest AWB. Cronul ia mereu cele mai vechi, NULLS FIRST, ca sa nu infometeze pe nimeni.';

create index if not exists orders_fan_courier_urmarire_idx
  on public.orders using btree (fan_courier_status_checked_at nulls first)
  where fan_courier_awb_number is not null
    and status = any (array['pending', 'confirmed', 'processing', 'shipped']);
