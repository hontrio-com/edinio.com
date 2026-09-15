-- Urmarirea coletului Woot: ce spune EL despre expediere ajunge pe comanda - 15.09.2026
--
-- ═══ CE LIPSEA ═══
--
-- Woot duce 96% din expedierile platformei (172 AWB reusite; DPD 3, Sameday 1, ceilalti
-- paisprezece ZERO) si era SINGURUL curier cu trafic adevarat fara nicio bucla de urmarire:
-- paisprezece cronuri de urmarire in platforma, niciunul pentru el. Dupa ce pleca coletul,
-- platforma nu mai stia nimic despre el, iar comerciantul afla de un retur cand ajungea inapoi.
--
-- Migratia de la FAN (`2027-01-09`) numea chiar perechea: „FAN si Woot erau singurii fara".
-- Randul asta inchide a doua jumatate a propozitiei aceleia.
--
-- ═══ ⚠ DE CE STAREA VINE CU O ETICHETA LANGA EA, SI DE CE ASTA SCHIMBA LUCRAREA ═══
--
-- `GET /orders/{order_id}/history` da evenimente cu `status_id` INTREG, `comment` si `added`.
-- Dar in TOATA specificatia lor, toate cele 22 de cai, NU exista nicio enumerare a starilor unei
-- comenzi. Singura lista documentata e a rambursurilor (`0=Cancelled, 1=Unpicked, 2=Picked up,
-- 3=Paid, 4=External`), si aceea e alt drum. Din exemplele lor se vede doar capatul de jos:
-- 1 „Comanda primita", 2 „AWB generat", 3 „Ridicat de curier". Modulul lor oficial de
-- WooCommerce (2.2.8, verificat pe disc) nu atinge deloc `status_id`.
--
-- De aceea se tin AMANDOUA: numarul, ca sa se poata construi harta cand vom sti ce inseamna, si
-- `comment`-ul lor ca ETICHETA, fiindca el e scris in romana si e singurul lucru care se poate
-- arata comerciantului fara sa inventam un inteles. Aceeasi pereche o are si Sameday
-- (`sameday_status_id` + `sameday_status_label`).
--
-- ⚠ SI CUM SE VA AFLA HARTA: din chiar coloanele astea. Cronul strange perechi (numar, eticheta)
-- din expedieri ADEVARATE, iar harta se va citi din baza noastra peste cateva zile, nu dintr-o
-- presupunere de azi. E acelasi drum ca peste tot aici: intai se masoara, apoi se cableaza.
--
-- ⚠ CE NU FACE CRONUL, scris si aici ca sa nu para o scapare: NU muta starea comenzii si NU
-- declanseaza facturarea automata, spre deosebire de ceilalti paisprezece. Amandoua ar cere sa
-- stim care numar inseamna „livrat", iar un numar ghicit ar emite facturi pe comenzi nelivrate.
--
-- ═══ ⚠ IDENTITATEA EXPEDIERII E `woot_order_id`, NU NUMARUL AWB ═══
--
-- La Woot, `woot_order_id` e cheia cu care se cere eticheta, se cere istoricul si se anuleaza;
-- `woot_awb_number` e doar numarul tiparit pe colet, si el chiar lipseste la platile cu cardul
-- (la ei `awb_number` e documentat „for credit/term payments"). Deci indexul si filtrul cronului
-- stau pe `woot_order_id`, la fel cum sta si `campuriAnulareWoot`. Aceeasi lectie ca la Packeta
-- (`packeta_packet_id`) si Pall-Ex (`pallex_consignment_id`): identitatea NU e „AWB-ul".
--
-- ═══ ⚠ DE CE E NEVOIE SI DE `awb_at` ═══
--
-- Cronul cere starile doar pentru expedierile din ultimele saptamani, iar fereastra aia se
-- masoara de la EMITERE. Fara coloana, singurul reper ar fi `created_at` al comenzii, care poate
-- fi cu luni inaintea expedierii: o comanda veche careia comerciantul ii emite AWB abia acum ar fi
-- din start in afara ferestrei, deci n-ar fi intrebata NICIODATA. Aceeasi pereche o au toti
-- ceilalti treisprezece.
--
-- ═══ INDEXUL ═══
--
-- Partial si pe aceeasi forma ca `orders_fan_courier_urmarire_idx`: ordonat dupa
-- `status_checked_at` cu NULLS FIRST, fiindca rotatia ia mereu expedierile neintrebate de cel mai
-- mult timp, iar cele niciodata intrebate trebuie sa iasa primele. Filtrul pe `status` tine
-- indexul mic: o comanda livrata sau anulata nu se mai intreaba.
--
-- ═══ CE NU FACE ═══
--
-- Nimic retroactiv. Cele 172 de expedieri vechi raman cu `null` pe toate patru.
--
-- ⚠ In special `woot_awb_at` NU se umple din `created_at`: ar fi o data INVENTATA a expedierii,
-- care ar intra apoi in fereastra de urmarire si in orice raport ca si cum ar fi masurata. Ce
-- pierd cele vechi: cele inca vii intra oricum in urmarire prin ramura de `awb_at is null`, atat
-- timp cat COMANDA e in fereastra.
--
-- Cele patru coloane sunt aditive si anulabile; nicio citire existenta nu se schimba.

alter table public.orders
  add column if not exists woot_awb_at timestamptz,
  add column if not exists woot_status_id integer,
  add column if not exists woot_status_label text,
  add column if not exists woot_status_checked_at timestamptz;

comment on column public.orders.woot_awb_at is
  'Cand a fost emisa expedierea Woot. Fereastra de urmarire a cronului se masoara de aici, nu din `created_at`.';
comment on column public.orders.woot_status_id is
  'Ultimul `status_id` din `GET /orders/{id}/history`. ⚠ Woot NU documenteaza nicaieri ce inseamna numerele; se strang aici ca sa se poata construi harta din date adevarate.';
comment on column public.orders.woot_status_label is
  'Ultimul `comment` de la ei, in romana („Ridicat de curier"). E singurul lucru care se poate arata comerciantului fara sa inventam un inteles pentru numar.';
comment on column public.orders.woot_status_checked_at is
  'Cand a fost intrebat ultima oara Woot despre aceasta expediere. Cronul ia mereu cele mai vechi, NULLS FIRST, ca sa nu infometeze pe nimeni.';

create index if not exists orders_woot_urmarire_idx
  on public.orders using btree (woot_status_checked_at nulls first)
  where woot_order_id is not null
    and status = any (array['pending', 'confirmed', 'processing', 'shipped']);
