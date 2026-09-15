# eColet: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al saselea, dupa `WOOT.md`, `DPD.md`,
> `SAMEDAY.md`, `CARGUS.md` si `COLETE-ONLINE.md`.

**Ce sunt ei:** al treilea BROKER al platformei, dupa Woot si Colete Online. Dau mai departe la
DPD, TNT, Sameday si ceilalti, iar `/services` intoarce serviciile fiecaruia cu `slug`-ul lor
(`dpd_standard`, `tnt_express`).

**API-ul real:** `https://panel.ecolet.ro/api/v1`, cu jeton in antet.

⚠ **Trei purtari NEDOCUMENTATE, gasite prin sondare pe API-ul real in august 2026**, si toate trei
raman adevarate: antetul `Accept: application/json` e **obligatoriu** (fara el raspunsul e HTML);
`/me` **nu da 401 niciodata**, deci nu e buna ca proba de conexiune (se foloseste `/services`); iar
**emiterea e ASINCRONA**, ceea ce nu scrie nicaieri in documentatie.

**Referinta autoritara:** specificatia lor OpenAPI 3.0, versiunea **1.0.3**, de la
<https://panel.ecolet.ro/docs/api-docs.json>. ⚠ Pagina `panel.ecolet.ro/api/documentation` e o
coaja de Swagger UI, dar **specul e servit separat** si scrie in chiar `<script>`-ul paginii
(`url: "https://panel.ecolet.ro/docs/api-docs.json"`). Spre deosebire de Colete Online, unde era
compilat in bundle. 17 cai, 132 KB.

**Cod:** `src/lib/ecolet/` (`client.ts`, `preturi.ts`, `expediere.ts`, `extraoptiuni.ts`,
`statusuri.ts`, `localitati.ts`, `cautare.ts`, `documente.ts`),
`src/lib/actions/ecolet.actions.ts`, cronul `src/app/api/cron/ecolet-tracking`, ruta de eticheta
`src/app/api/ecolet/awb`, ferestrele `EcoletAwbModal.tsx` si `EcoletConfigClient.tsx`.

---

## Expunerea masurata, 15.09.2026

| ce | cat |
| --- | --- |
| Magazine cu eColet configurat | **ZERO** |
| AWB-uri emise vreodata | **ZERO** |
| Trimiteri pornite (`order_to_send_id`) | 0 |
| Comenzi care au ales eColet la checkout | 0 |
| Operatii in registrul de operatii externe | 0 |

⚠ **Zero peste tot, ca la Colete Online.** Nimeni n-a deschis vreodata pagina de configurare, deci
nu exista niciun semnal de productie dupa care sa prioritizez. Singura masura ramane conformitatea
cu specificatia lor.

⚠ Dar spre deosebire de Cargus si Colete Online, integrarea **nu e verde de nefolosinta**: a fost
scrisa in august cu doua runde de verificare pe API-ul real, iar memoria proiectului pastreaza
capcanele inchise atunci. Ce urmeaza sunt lucruri pe care le-a scos la iveala specificatia, nu
lipsuri de structura.

---

## ⚠ Ce il face altfel de toti ceilalti: EMITEREA E ASINCRONA

```
POST /add-parcel/send-order  ->  { order_to_send_id }        ATAT
GET  /order-to-send/{id}     ->  new | ordered | error
GET  /order/{id}             ->  abia aici apare `awb`
```

Intre prima si a treia linie e o fereastra in care expedierea EXISTA la ei si noi n-avem niciun
numar. De aici vine toata arhitectura: garda de idempotenta sta pe `ecolet_order_to_send_id`, NU pe
AWB (o garda pe AWB e goala tocmai in fereastra aia, iar a doua apasare ar fi a doua expediere
REALA); `ecolet_awb_at` se scrie la TRIMITERE, nu la aparitia AWB-ului; iar cronul are DOUA treburi,
sa finalizeze emiterile atarnate si sa urmareasca in lot.

---

## Ce foloseste platforma din API-ul lor

Din cele **17 cai** ale specificatiei, folosim **8**.

| Calea lor | Folosim | Unde |
| --- | --- | --- |
| `GET /services` | **da** | catalogul; si ca proba de conexiune, fiindca `/me` nu da 401 |
| `POST /add-parcel/reload-form` | **da** | cotarea, si validarea dinaintea emiterii |
| `POST /add-parcel/send-order` | **da** | emiterea (asincrona) |
| `GET /order-to-send/{id}` | **da** | finalizarea emiterii atarnate |
| `GET /order/{id}` | **da** | AWB-ul, dupa ce apare |
| `DELETE /order/{id}` | **da** | anularea, cu 404 tratat ca „deja sters" |
| `GET /order/{id}/download-waybill` | **da** | eticheta |
| `POST /order/get-statuses-for-many-orders` | **da** | urmarirea in lot |
| `GET /me` | citit o data | ⚠ nu da 401 niciodata, deci nu e buna ca proba |
| `POST /map-points/{countryCode}` | nu | punctele lor; vezi D-1 |
| `GET /address-book` | nu | agenda contului |
| `POST /add-parcel/save-order-to-send` | nu | salvare fara trimitere |
| `GET /locations/*` (6 cai) | partial | doar cautarea de localitati |

---

## Inchis

### I-1. ⚠⚠ Extraoptiunile pleacau pe servicii care nu le pot face

Cotarea lor intoarce `form.additional_services`, indexat pe SLUG, cu ce poate fiecare serviciu
pentru comanda ASTA. Chiar exemplul din specificatia lor:

```json
"additional_services": {
  "dpd_standard": { "cod": true, "rod": true, "open_package": false },
  "tnt_express":  { "cod": true, "rod": false, "open_package": false }
}
```

⚠ **Citeam de acolo NUMAI `cod`.** Restul extraoptiunilor vin din configul magazinului, o data
pentru toate expedierile, si plecau la emitere cu `status: true` oricare ar fi fost serviciul ales.

Deci un comerciant care bifa „Deschidere la livrare" in Setari trimitea `open_package: true` si pe
`dpd_standard`, unde chiar exemplul LOR spune `false`. Ori emiterea cade cu un mesaj pe care omul
nu-l poate lega de nimic, ori eColet o ignora in tacere: comerciantul crede ca i-a dat
cumparatorului dreptul sa deschida coletul, si nu i l-a dat.

⚠ **LIPSA CHEII NU INSEAMNA „NU POATE".** In exemplul lor, `dpd_standard` are trei chei si nu le
are pe `saturday_delivery` sau `sms_notify`. Tratata ca refuz, lipsa ar fi stins livrarea de sambata
pentru servicii care o fac foarte bine, si nimeni n-ar fi aflat de ce. Deci se stinge DOAR cand ei
spun limpede `false`. Aceeasi cumpana ca la `PaymentType`-ul punctelor Cargus.

⚠ **Rambursul face exceptie si ramane strict** (`=== true`), asa cum era: acolo tacerea se plateste
pe dos, iar un colet trimis cu ramburs pe un serviciu care nu incaseaza inseamna marfa livrata si
bani neluati.

⚠ Si taierea **nu se face in tacere**: iese in jurnal sub `ecolet.extraoptiuni`, fiindca omul a
cerut ceva si n-a primit.

### I-2. ⚠ Forma coletului era scrisa fix, desi ei o spun

`parcel.shape` pleca mereu `"standard"`. Dar cotarea lor intoarce `form.is_standard`, indexat pe
slug, care spune pentru care servicii comanda ASTA are dimensiuni standard, iar `form.info` chiar
explica: `"Parcel length is non standard (75)"`.

Declarat „standard" pentru un colet pe care EI il socotesc nestandard, coletul **se retarifeaza la
depozit**, iar diferenta o plateste comerciantul.

⚠ Se schimba DOAR cand ei spun limpede `false`: cheia lipsa ar fi trecut fiecare colet pe tariful
scump. Si schimbarea se striga in jurnal sub `ecolet.forma`, cu explicatia LOR dusa mai departe,
fiindca acolo se schimba pretul.

⚠ **Nu costa niciun apel in plus:** amandoua se citesc din raspunsul pe care emiterea il cerea deja
ca sa valideze serviciul.

### I-3. Plafonul de colete e al LOR

`parcel.amount` are, in specificatie, `minimum: 1, maximum: 10`. Trimiteam doar podeaua. Netaiat, un
numar mai mare pleca si cadea la ei cu un mesaj de nelegat de nimic. ⚠ Masurat: azi niciun apelant
nu trece `numarColete`, deci plafonul e o plasa pentru maine, nu o reparatie de azi.

---

## Ce era deja bine, si nu se atinge

Toate astea vin din cele doua runde din august si raman valabile:

- **Garda de idempotenta pe `ecolet_order_to_send_id`**, nu pe AWB, fiindca emiterea e asincrona.
  ⚠ Si slotul se elibereaza doar cu **martor pozitiv** de refuz (`ecolet_send_state === "error"`):
  o eliberare pe orice `deja` ar fi insemnat al doilea transport real, facturat.
- **`ecolet_awb_number` ramane null pana apare cel adevarat**, fara surogat: e cheia lotului de
  statusuri, iar un numar necunoscut de eColet iese din raspuns fara sa lase urma.
- **Validarea dinaintea emiterii** prin chiar endpointul lor (`reload-form`), care spune si daca
  serviciul poate duce comanda asta, si daca poate incasa la livrare. ⚠ Un esec de RETEA acolo nu
  opreste emiterea: s-ar bloca comerciantul pentru o indisponibilitate de o secunda.
- **`form.errors` nevid opreste TOT**, fiindca documentatia lor spune ca atunci expedierea nu se
  poate face.
- **Codul postal**: `shipping_address.postal_code` se scrie doar la comenzile din afara tarii, deci
  se cade pe cel al localitatii (`codPostalDeTrimis`).
- **Marcajul de rotatie e pe COLOANA DUPA CARE E ORDONATA COADA**, iar memoria urmaririi sta pe
  CLASA, nu pe fraza (textul lor se schimba la fiecare scanare).
- **Alarma „nicio verificare reusita" se numara SI pe magazin**, altfel un magazin mare si sanatos
  ar acoperi la nesfarsit vecinul caruia i-a expirat tokenul.
- **Anularea** e cablata pe `DELETE /order/{id}`, cu 404 tratat ca „deja sters".
- **Emiterea in LOT e exclusa dinadins**: broker plus asincron, deci lotul ar raporta „gata" pentru
  zeci de comenzi fara niciun numar.

---

## Deschis

### D-1. ⚠ Livrarea la punct: campurile EXISTA, dar nu se stie care serviciu le accepta

Asta merita spus pe larg, fiindca e o decizie pe care am reverificat-o azi si am pastrat-o.

Specificatia **documenteaza acum** si punctele, si campurile:

* `POST /map-points/{countryCode}` intoarce puncte cu `id`, `name` („easybox Luceafarul"),
  `courier_slug`, `couriers[]` cu `status`, **`is_cod_available`**, **`is_for_receiver`**,
  `open_hours` pe zile;
* `receiver.has_map_point` si `receiver.map_point_id` sunt campuri ale corpului de emitere.

⚠ **Si totusi exclusia ramane**, pentru exact motivul din august: `Service.conditions` are NOUA
steaguri (`has_cod`, `has_open_package`, `has_rod`, `has_rop`, `has_saturday_delivery`,
`has_sms_notify`, `has_swap`, `has_multipacks`, `has_pickup_only_today`) si **niciunul nu spune daca
serviciul accepta un punct pe harta**. Nici `form.additional_services` nu are asa ceva.

Deci s-ar putea alege un punct si un serviciu care nu-l accepta, iar coletul ar pleca la adresa sau
emiterea ar cadea. Se poate DERIVA (punctul spune ce curieri il servesc, serviciul spune al carui
curier e), dar o derivare nu e o garantie, iar aici greseala se vede abia cand coletul nu ajunge.
Vezi ce a costat ghicitul la Woot, in `woot-audit-2026-07`.

**Se deschide cand:** exista un cont pe care se poate proba, sau ei adauga steagul.

### D-2. Reconcilierea rambursului: mecanismul exista, dar costa un apel pe comanda

`GET /order/{id}` intoarce **`cod_received_at`** (cand s-a incasat de la cumparator) si
**`cod_returned_at`** (cand a fost virat comerciantului). Nu le citim deloc.

⚠ **Lotul NU le are.** `OrderWithStatuses`, din `get-statuses-for-many-orders`, are doar `id`,
`awb`, `courier`, `status`, `statuses`, `updated_at`, `created_at`. Deci reconcilierea ar cere un
apel **pe fiecare comanda**, repetat zilnic pana apare virarea, care vine la zile dupa livrare.

La Woot si Cargus reconcilierea s-a facut fiindca ei au o ruta care intoarce tot intervalul dintr-o
cerere. Aici ar fi o coada zilnica per comanda, adica exact genul de masinarie pe care n-o pun
pentru zero trafic. **Se face cand exista comenzi cu ramburs adevarate.**

### D-3. Tipurile de colet `envelope` si `pallet`

`parcel.type` are, in specificatie, `enum: ["package", "envelope", "pallet"]`. Trimitem mereu
`"package"`, deci plicul si paletul sunt de neatins. Nu e un defect, e o functionalitate lipsa.

### D-4. Extraoptiunile `rod`, `rop`, `swap`, `epod`, si `shipment_details`

`additional_services` mai are `rod` (retur documente, cu `rod_code`), `rop`, `swap` si `epod`, iar
`shipment_details` are `uit_code` (codul e-Transport), `sender_forklift` si `receiver_forklift`.
Niciuna nu e ceruta de cineva azi. ⚠ `uit_code` ar deveni obligatoriu daca platforma ar duce
vreodata marfa sub regim e-Transport.

### D-5. ⚠⚠ Nedovedit live

**Niciun magazin n-are macar credentiale**, si nicio expediere reala nu s-a emis vreodata. Prima
emitere adevarata e si prima proba a ferestrei asincrone, care e partea cea mai delicata a
integrarii.

---

## Nota, cinstit

**9/10.**

Structura era deja buna, si asta se vede: emiterea asincrona e tratata cum trebuie, garda de
idempotenta sta pe identificatorul potrivit, validarea dinaintea emiterii foloseste chiar endpointul
lor, iar anularea si urmarirea sunt cablate de mult. Nu e o integrare care s-a facut in graba.

Ce s-a inchis azi sunt doua lucruri pe care le stia SPECIFICATIA si noi nu: extraoptiunile pleacau
pe servicii care nu le pot face, si forma coletului se declara „standard" chiar cand ei spuneau
limpede ca nu e. Amandoua se citesc din raspunsul pe care emiterea il cerea oricum, deci nu costa
niciun apel in plus.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live** (D-5). Zero credentiale, zero expedieri. Iar aici cantareste mai mult decat la
   altii, fiindca partea delicata a integrarii, fereastra asincrona, se probeaza doar cu o expediere
   adevarata.
2. **Reconcilierea rambursului** (D-2) e reala si nefacuta. Mecanismul il stiu exact
   (`cod_received_at`, `cod_returned_at` din `GET /order/{id}`), dar lotul nu le are, deci ar fi o
   coada zilnica per comanda. Nu pun masinaria aia pentru zero trafic; o pun cand exista comenzi.
3. **Livrarea la punct** (D-1) ramane inchisa DINADINS, si e singura decizie pe care am
   reverificat-o azi si am pastrat-o: campurile exista, dar nimic din API nu spune care serviciu
   accepta un punct.
