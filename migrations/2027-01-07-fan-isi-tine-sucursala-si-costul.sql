-- AWB-ul FAN isi tine sucursala cu care a fost emis, si costul pe care l-a spus FAN - 09.09.2026
--
-- ═══ DOUA LIPSURI, AMANDOUA GASITE LA AUDITUL DIN 09.09.2026 ═══
--
-- 1. SUCURSALA NU SE PASTREAZA NICAIERI.
--
-- Pe comanda se scria doar `fan_courier_awb_number`. Anularea si tiparirea etichetei citesc insa
-- configurarea DE ACUM a magazinului, deci `client_id` de acum. Un comerciant cu doua puncte de
-- lucru care isi muta sucursala in Setari ajungea sa ceara AWB-urile VECHI pe contul NOU: FAN
-- raspunde „nu e al tau", iar eticheta unei comenzi deja expediate nu se mai putea scoate. Cu
-- fotografia sucursalei pe comanda, operatiile de dupa emitere se pot face in contextul in care
-- s-a emis.
--
-- ⚠ SE PASTREAZA DOAR `client_id`, NU si credentiala. Parola sta mai departe in singurul loc unde
-- are ce cauta, coloana criptata din `store_settings`, ca sa poata fi rotita o data pentru tot.
--
-- 2. CAT A COSTAT COLETUL NU SE STIE DE NICAIERI.
--
-- Raspunsul de emitere (pag. 15 din documentatia FAN) contine `tariff` si `vat`, chiar in
-- obiectul din care codul citeste numarul AWB, si le arunca. Fara ele, NICIO subcotare de
-- transport nu se poate vedea vreodata: nici greutatea de rezerva, nici dimensiunile lipsa, nici
-- coletele in plus, nici comisionul de ramburs. Toate se scumpesc identic, in tacere, si diferenta
-- o plateste comerciantul la factura lunara.
--
-- Aceeasi solutie ca la ceilalti curieri care o au deja: `dhl_cost`, `ups_cost`, `sameday_awb_cost`.
--
-- ═══ CE NU FACE ═══
--
-- Nimic retroactiv. Comenzile vechi raman cu `null` pe toate trei, si asa trebuie: o valoare
-- inventata acolo ar fi mai rea decat lipsa ei, fiindca ar intra in rapoarte ca si cum ar fi
-- masurata. Cele trei coloane sunt aditive si anulabile; nicio citire existenta nu se schimba.

alter table public.orders
  add column if not exists fan_courier_awb_client_id bigint,
  add column if not exists fan_courier_cost numeric,
  add column if not exists fan_courier_vat numeric;

comment on column public.orders.fan_courier_awb_client_id is
  'Sucursala (clientId) FAN cu care a fost emis AWB-ul. Anularea si eticheta o folosesc pe ea, nu pe cea din configurarea de acum.';
comment on column public.orders.fan_courier_cost is
  'Tariful comunicat de FAN la emitere (`tariff`, pag. 15). Cu TVA separat in `fan_courier_vat`.';
comment on column public.orders.fan_courier_vat is
  'TVA-ul comunicat de FAN la emitere (`vat`, pag. 15).';
