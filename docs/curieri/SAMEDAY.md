# Sameday: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al treilea, dupa `WOOT.md` si `DPD.md`.

**API-ul real:** `https://api.sameday.ro/` (test: `https://sameday-api.demo.zitec.com/`). Jeton pe
`X-AUTH-TOKEN`, obtinut din `api/authenticate`. Corpurile pleaca
`application/x-www-form-urlencoded`, cu campuri imbricate scrise `awbRecipient[cityString]`.

**Referintele autoritare, toate pe disc la 15.09.2026:**

1. `Documentatie SameDay.pdf`: tabelul de parametri al expedierii, cu ce e obligatoriu si cand.
2. `735502958-Documentatie-API-Sameday-v2-3-2024.pdf`: mai vechi, aproape numai imagini.
3. ⚠ **`samedaycourier-shipping.1.11.1.zip`, modulul lor OFICIAL de WooCommerce**: cel care chiar
   ruleaza in mii de magazine. Contine SDK-ul lor PHP (`lib/sameday-courier/src/Sameday/`), care e
   referinta cea mai buna pentru FORMA incarcaturii: documentatia lor arata pe alocuri doua forme
   care nu se potrivesc intre ele, iar SDK-ul arata care e cea folosita.

**Cod:** `src/lib/sameday/` (`client.ts`, `statusuri.ts`, `colete.ts`, `punctul-de-pe-awb.ts`,
`ultima-mila.ts`, `mesajul-de-validare.ts`), `src/lib/actions/sameday.actions.ts`, ramura Sameday
din `src/lib/actions/shipping.actions.ts`, cronul `src/app/api/cron/sameday-tracking/route.ts`,
`src/components/dashboard/SamedayAwbModal.tsx`, `src/app/api/sameday/awb/route.ts`.

---

## Expunerea masurata, 15.09.2026

| ce | cat |
| --- | --- |
| AWB-uri Sameday emise vreodata | **1** (reusit, zero esuate) |
| Magazine cu Sameday configurat | **4**, toate pe productie (`sandbox: false`) |
| Comenzi care au ales Sameday la checkout | 8 |
| dintre care **la easybox** | **5** |
| Zone Sameday cu cotare LIVE (`auto_price`) | 1 din 4 |
| AWB-uri de RETUR emise vreodata | 0 |
| Comenzi de persoana JURIDICA, pe toata platforma | **0** |

⚠ **Sameday e al treilea curier ca trafic, dar PRIMUL ca easybox.** Cele 5 comenzi la dulap sunt
cea mai grea folosire de puncte de ridicare de pe platforma. Si toate cinci sunt la UN SINGUR
magazin, cel al carui serviciu configurat e `57`; niciuna n-are inca AWB. Deci drumul cel mai
incarcat al integrarii e drumul care **inca n-a fost umblat**. De acolo vine ordinea de mai jos.

⚠ **Un colet CHIAR merge acum.** AWB-ul `1ONB24534762562` a plecat pe 15.09.2026 la 09:40 UTC,
cronul l-a intrebat la 18:11 UTC, a scris starea („Coletul este în drum spre depozitul central.",
cod 7) si a mutat comanda pe `shipped`. Deci drumul emitere → urmarire → tranzitie e **dovedit
live**, nu doar citit din documentatie.

---

## Ce foloseste platforma din API-ul lor

Din cele **18 cai** pe care le cheama SDK-ul lor oficial, folosim **13**.

| Calea lor | Folosim | Unde |
| --- | --- | --- |
| `api/authenticate` | **da** | `getSamedayToken` |
| `api/awb` (POST) | **da** | `createSamedayAwb`, si turul, si returul |
| `api/awb/{awb}` (DELETE) | **da** | anularea AWB-ului |
| `api/awb/download/{awb}/{tip}` | **da** | eticheta A4/A6, prin `/api/sameday/awb` |
| `api/awb/estimate-cost` | **da** | `estimateSamedayCost`, cotarea din checkout |
| `api/client/awb/{awb}/status` | **da** | sumarul expeditiei, in cron |
| `api/client/status-sync` | **da** | cine s-a miscat intr-un interval, o cerere pe magazin |
| `api/client/services` | **da** | serviciile contului si extraoptiunile lor |
| `api/client/pickup-points` | **da** | punctele de ridicare (citire SI scriere) |
| `api/client/lockers` | **da** | cele 7.021 de dulapuri, 500 pe pagina |
| `api/client/ooh-locations` | **scris, necablat** | `puncteOohSameday`; vezi D-1 |
| `api/geolocation/county` | **scris, necablat** | `judeteSameday`; vezi D-3 |
| `api/geolocation/city` | **scris, necablat** | `localitatiSameday`; vezi D-3 |
| `api/awb/{awb}/update-cod` | nu | schimbarea rambursului pe un AWB emis |
| `api/awb/{awb}/parcel` | nu | adaugarea unui colet pe o expeditie emisa |
| `api/client/parcel/{id}/size` | nu | schimbarea dimensiunilor unui colet |
| `api/client/parcel/{id}/status-history` | nu | urmarire pe COLET; noi o facem pe EXPEDITIE, care da mai mult |
| `api/client/pickup-points/{id}` | nu | un singur punct; lista ni-l da oricum |

---

## Conformitatea incarcaturii, fata de `SamedayPostAwbRequest` din SDK-ul lor

Trimitem: `pickupPoint`, `contactPerson`, `packageType`, `packageNumber`, `packageWeight`,
`service`, `awbPayment`, `cashOnDelivery`, `insuredValue`, `currency`, `thirdPartyPickup`,
`thirdParty[*]`, `serviceTaxes[]`, `awbRecipient[*]`, `parcels[][weight|length|width|height]`,
`observation`, `priceObservation`, `clientInternalReference`, `clientObservation`,
`lockerFirstMile`, `returnLockerParcel[eligibilityDate]`, si campul de ultima mila (mai jos).

Ce NU trimitem, si **de ce fiecare e in regula**, verificat pe documentatia lor:

| campul lor | de ce nu | dovada |
| --- | --- | --- |
| `awbRecipient[companyCui]`, `companyOnrcNumber`, `companyIban`, `companyBank` | „devin obligatorii doar daca `personType`=1 **si** `awbPayment`=2" | noi trimitem mereu `awbPayment=1` (plateste expeditorul), iar platforma are **0 comenzi de persoana juridica** |
| `cashOnDeliveryReturns` | „optional, implicit 1 (incaseaza clientul); se trimite 0 pentru tert" | singurul drum cu tert e RETURUL, iar acolo `cashOnDelivery` e 0 din principiu |
| `deliveryInterval` | „optional, specific pentru serviciul 3H" | niciun magazin nu are 3H configurat |
| `awbNumber`, `parcels[][awbParcelNumber]` | „NU ESTE RECOMANDAT; nu se trimite si va fi generat de Sameday" | chiar asa facem |

⚠ **JUDETUL E VALIDAT, ORASUL NU.** Documentatia lor o spune pe fata: „daca se trimit doar
string-uri, la Judet se va valida ca string-ul trimis sa faca parte din nomenclatorul Sameday; la
oras nu se va valida". Deci un `countyString` gresit inseamna AWB respins, pe cand un `cityString`
gresit e **mai rau fiindca e tacut**: AWB acceptat, rutat dupa textul adresei. De aceea
`normalizeCountyName` pe judet nu e cosmetica, iar sectorul corect pe oras ramane obligatoriu chiar
si fara refuz.

⚠ **Bucurestiul la Sameday e PE DOS fata de ceilalti:** sectoarele SUNT orase (`Sector 1`…
`Sector 6`), iar „Bucuresti" nu exista ca localitate. Woot cere `Sectorul 3`, DPD/Cargus/FAN cer
`Bucuresti`. Cele trei forme sunt in `sameday-audit-2026-07`. `localitateSameday` nu ghiceste
niciodata sectorul: fara el se trimite textul curatat, fiindca un sector inventat ar duce coletul
in alta parte a orasului.

**Masurat pe magazinele cu Sameday:** din 47 de comenzi bucurestene, **44** poarta deja sectorul in
campul de oras, **0** il au numai in adresa, si **3** nu-l au nicaieri. Deci plierea din adresa
(reparatia facuta la Woot) n-ar castiga aici nimic; cele 3 sunt comenzi in care cumparatorul chiar
n-a scris niciun sector, si singurul lucru cinstit e sa i se spuna comerciantului. Vezi I-2.

---

## Inchis

### I-1. Urmarirea coletului, dovedita live

Cronul `sameday-tracking` merge la doua ore (`11 */2`). Doua rute, fiecare la ce e buna:
`status-sync` intoarce dintr-o cerere pe magazin **cine** s-a miscat in ultimele 6 ore, si numai
aceia primesc apelul amanuntit `awb/{awb}/status`. La cincizeci de colete in drum, deosebirea e
intre cincizeci de cereri si doua.

⚠ **Hotararea se ia din SUMAR, nu din ultimul eveniment.** `expeditionSummary.delivered` si
`.canceled` sunt cumulativi; un eveniment administrativ venit dupa livrare ar fi ascuns livrarea.
Lectia e platita la GLS si scrisa intreaga in `posta/statusuri.ts`.

⚠ **Nu se face `switch` pe `expeditionStatus.statusState`:** nici documentatia v2.3, nici SDK-ul
lor nu spun ce valori poate lua. Un `switch` pe el ar fi fost o presupunere imbracata in logica.

⚠ **Anularea NU coboara comanda**, fiindca un AWB anulat la ei poate insemna ca s-a reemis altul.
Se semnaleaza in `/admin/logs` si hotaraste omul. La fel la trei incercari de livrare esuate: dupa
ele vine returul, iar returul e o hotarare.

Fereastra se ancoreaza pe `sameday_awb_at`, nu pe `created_at`; rotatia scoate primele comenzile
neintrebate de cel mai mult timp; marcajul se scrie neconditionat, iar starea numai pe expedierea
citita (`scrieUrmarirea`). Factura automata pleaca la livrare.

### I-2. ⚠ Refuzul lor era un bloc de JSON, nu o propozitie

Cand Sameday respinge o expeditie, nu intoarce o fraza: intoarce un **arbore**, cu adevarul pe
frunza, sub doua-trei niveluri de `children`:

```json
{"error":{"code":400,"message":"Validation Failed",
  "errors":{"children":{"awbRecipient":{"children":{
    "cityString":{"errors":["This value is not valid."]}}}}}}}
```

`mesajulLor` citea doar `error.message`, deci comerciantul primea „Validation Failed", sau, cand
nici atat nu venea, blocul intreg pus in fereastra ca text. **Din el nu se putea afla NICIODATA
care camp e de vina.**

`mesajul-de-validare.ts` coboara arborele exact ca parserul din SDK-ul lor
(`SamedayBadRequestException::parseErrors`, care merge si pe `errors.children`, si pe `children`),
si scoate „Localitatea destinatarului: This value is not valid." ⚠ **Textul LOR ramane neatins**:
se traduce numai eticheta campului, fiindca ei schimba mesajele fara sa ne spuna si o traducere pe
dinafara ar ascunde tocmai ce e nou. Brutul pleaca in continuare, dar in spatele propozitiei.

Acolo lovesc cele 3 comenzi bucurestene fara sector.

### I-3. ⚠⚠ Un colet la dulap putea pleca pe serviciul de livrare la domiciliu

Cel mai serios lucru gasit in trecerea asta, si sta fix pe drumul cu cea mai mare expunere.

`createSamedayAwb` cauta serviciul de easybox dupa COD (id-ul 15 din documentatie nu e garantat pe
niciun cont). Randul era:

```ts
serviceId = (await getSamedayLockerServiceId(config)) ?? config.service_id;
```

Deci un cont **fara** serviciu de dulap primea id-ul easybox-ului ales de cumparator scris pe un
serviciu de livrare la domiciliu: o expediere pe care nimeni n-o poate duce unde scrie pe ea,
plecata tacut si facturata. Trei cusururi, toate inchise acum:

1. **Cautarea era numai dupa `LN`.** Modulul lor oficial are DOUA coduri de dulap, `LN` si `XL`
   (Locker Crossborder). Un cont cu dulapurile pe `XL` cadea pe acelasi drum gresit.
2. **Lipsa serviciului cadea inapoi in loc sa refuze.** Acum refuza, cu acelasi mesaj pe care
   drumul de RETUR il avea de mult: „Cere-l departamentului comercial Sameday."
3. **`null` se tinea minte pe tot procesul.** Adica un cont caruia Sameday tocmai i-a activat
   serviciul ar fi ramas refuzat pana la urmatoarea pornire, fara ca nimeni sa poata face ceva.
   Acum se tine minte doar un id gasit.

⚠ **Si checkoutul nu mai promite ce emiterea refuza.** Optiunea „Sameday EasyBox (locker)" se punea
in lista neconditionat, cu cadere pe tariful fix al zonei daca cotarea pica. Un cont fara dulapuri
ii arata deci cumparatorului o livrare pe care comerciantul n-o putea emite. Verificarea sta **in
lant**, nu inaintea buclei: scrisa ca `await`, ar fi intarziat cotarea TUTUROR curierilor cu un
drum dus-intors la Sameday. Iar livrarea la adresa a ramas neconditionata: legata din greseala de
serviciul de dulap, un magazin cu Sameday ca singura zona ar fi ramas fara nicio optiune de
livrare, exact fundatura platita la FAN.

⚠ **Nu putea strica nimic ce merge azi:** zero AWB-uri cu dulap in toata viata platformei.

### I-4. Punctul de ultima mila pleaca pe campul LUI

Sameday are **doua retele** de ridicare, nu una: `api/client/lockers` sunt dulapurile (7.021,
masurat pe contul de productie) si `api/client/ooh-locations` sunt punctele PUDO (6.706, tejghele
in magazine partenere). Se suprapun, dar nu sunt aceeasi lista. Iar AWB-ul le cere pe **campuri
diferite**, si modulul lor oficial alege dupa CODUL serviciului, nu dupa lista din care a venit
punctul: `LN` → `lockerLastMile`, `PP` → `oohLastMile`.

Noi scriam mereu `lockerLastMile`. Pe drumul de azi iese acelasi lucru, fiindca fereastra noastra
ofera numai dulapuri, dar legatura era o **coincidenta, nu o regula**. `ultima-mila.ts` o face
regula. ⚠ Necunoscutul cade pe `lockerLastMile`, adica pe purtarea de pana acum: un cod nou de-al
lor n-are voie sa mute tacit coletele care merg azi.

### I-5. ⚠ `business_id` la scriere e AUTORIZARE, nu podoaba

Trecerea a scos la iveala ceva mai larg decat Sameday. Cronurile de urmarire au de mult proba care
cere filtrul (`api/cron/scrierile-de-urmarire-poarta-magazinul.test.ts`), dar **AWB-ul nu se scrie
numai din cron**: se scrie si din actiunea pe care o apasa comerciantul, si acolo nu exista nimic
care sa ceara filtrul.

Masurat pe 15.09.2026, din 16 fisiere de actiuni care scriu un numar de expediere, **patru** aveau
scrieri fara el:

| fisier | ce scria | clientul |
| --- | --- | --- |
| `sameday.actions.ts` | AWB-ul de tur **si** cel de retur, plus recitirea adresei | al omului (RLS) |
| `cargus.actions.ts` | AWB-ul | al omului (RLS) |
| `dpd.actions.ts` | AWB-ul | al omului (RLS) |
| `colete.actions.ts` | detasarea AWB-ului | ⚠ de **SERVICIU** (ocoleste RLS) |
| `packeta.actions.ts` | urmarirea, intr-o functie pe care n-o cheama nimeni | ⚠ de **SERVICIU** |

Toate poarta acum filtrul, iar `scrierile-din-actiuni-poarta-magazinul.test.ts` **enumera** familia,
ca urmatorul curier adaugat sa nu nasca aceeasi gaura in tacere.

⚠ La Colete si Packeta filtrul chiar e singurul lucru care margineste scrierea. La celelalte RLS
tine azi, dar RLS pe `orders` s-a mai slabit o data pe platforma asta, si atunci a doua incuietoare
e tot ce ramane.

⚠ **Ramase in afara acestei treceri, fiindca nu tin de expediere:** patru scrieri de storno in
`fgo.actions.ts` (doua), `oblio.actions.ts` si `smartbill.actions.ts`. Sunt de hotarat separat.

**Total pentru I-2 … I-5: 23 de probe noi, banc de mutanti 12 din 12.**

---

## Ce era deja bine, si nu se atinge

- **Securitate.** `sameday_config.password` e in registrul de secrete write-only
  (`integrari/secrete.ts`); ruta de eticheta cere autentificare, dovedeste proprietatea
  magazinului si trece prin `poartaEtichetei`; configul se citeste cu rol de serviciu abia DUPA
  dovedirea proprietatii, fiindca vederea publica nu mai decripteaza.
- **Registrul de operatii externe.** Emiterea trece prin `cuRegistru`, cu cheie separata pentru
  retur (aceeasi cheie ar fi facut returul sa adopte numarul coletului dus, deci returul n-ar fi
  plecat niciodata, dar ar fi parut ca a plecat). `legaturaVie` NU se da, si motivul e scris pe
  larg in cod: predicatul ar fi fost garantat fals, iar fals pe ramura `deja` inseamna **inca un
  colet real, facturat**.
- **Poarta AWB.** `poartaAwbPropriu` se cheama INAINTE de orice apel la curier: un refuz de dupa
  emitere ar fi un colet deja platit si o eticheta deja tiparita.
- **Easybox-ul, mai departe.** E-mailul cumparatorului pleaca la livrarea in dulap (acolo primeste
  codul de deschidere), destinatarul de pe AWB devine lockerul ca in modulul lor, iar alegerea
  comerciantului bate comanda si **se scrie inapoi** pe `shipping_address`, ca panoul si emailurile
  sa nu arate alt dulap decat cel adevarat. Comutatorul stins chiar stinge easybox-ul; `laEasybox`
  lipsa pastreaza purtarea veche, pentru browserele cu pagina deschisa dinainte.
- **Retururile.** Ridicarea de la tert e cablata (fara ea, si Retur Standard, si Locker Retur erau
  de neatins), iar `lockerReturnChargeCode` se salveaza fiindca ei il dau O SINGURA DATA.
- **Extraoptiunile pleaca ca ID-uri**, cum face SDK-ul lor, nu ca sir de coduri, iar id-urile NU
  se pot scrie in cod: acelasi cod are alt id pe alt serviciu si pe alt tip de colet (masurat pe
  contul de productie: `PDO` e 674262 pe 24H si 690892 pe Locker NextDay).
- **Moneda tarii de destinatie** pleaca explicit; cu `RON` scris fix, serviciile crossborder erau
  de neatins.

---

## Deschis

### D-1. Punctele PUDO (Sameday Point) nu se pot alege

`puncteOohSameday` exista si aduce cele 6.706 de puncte, iar `campulUltimeiMile` stie de azi sa le
trimita pe `oohLastMile`. Ce lipseste e restul drumului: a doua retea in selectorul din checkout si
in fereastra de AWB, plus alegerea serviciului `PP`. ⚠ Cablata fara campul potrivit, ar fi
**misdirijat colete**. De-aia I-4 s-a facut inaintea ei.

**Cat valoreaza:** easybox-ul e deja drumul cel mai incarcat al Sameday (5 din 8 comenzi), iar
punctele PUDO sunt tejghele in magazine, deschise si seara. E o functionalitate lipsa, nu un defect.

### D-2. Coletul de RETUR nu se urmareste

Cronul se uita numai la `sameday_awb_number`. Un retur emis nu e intrebat niciodata, deci
comerciantul nu afla din Edinio ca marfa s-a intors. ⚠ Cere si coloane noi
(`sameday_return_status_*`), deci o migratie. **Masurat: zero retururi emise vreodata.**

### D-3. Trei functii scrise care nu sunt chemate de nicaieri

`judeteSameday`, `localitatiSameday` si `adaugaPunctDeRidicareSameday` sunt exportate si necablate
(verificat numarand si folosirile dinauntrul clientului). Prima ar putea verifica judetul **inainte**
de emitere, singurul camp pe care ei chiar il valideaza; a treia ar scuti un comerciant care isi
deschide un depozit nou de un telefon la suportul lor. Nu sunt defecte, sunt drumuri incepute.

### D-4. `update-cod`: rambursul nu se poate schimba pe un AWB emis

Ei au ruta. Azi, o comanda editata dupa emitere cere AWB nou.

### D-5. Nedovedit pe drumurile grele

Un singur AWB in toata viata platformei, si acela la adresa. **Zero** AWB-uri la easybox, zero
retururi, zero comenzi de persoana juridica. Ce se poate spune despre drumurile neumblate e
„respecta SDK-ul si documentatia lor", nu „merge".

---

## Nota, cinstit

**9,5/10.**

Emiterea, anularea, eticheta, cotarea, extraoptiunile, retururile si urmarirea sunt intregi, iar
urmarirea e **dovedita live chiar azi**, pe un colet adevarat, cu tranzitia comenzii si tot. Fata
de dimineata s-au inchis un defect care putea trimite un colet de easybox pe serviciul de
domiciliu, un checkout care promitea o livrare pe care emiterea o refuza, un refuz al lor pe care
comerciantul nu-l putea citi, si cinci scrieri fara filtru de autorizare, dintre care doua cu rol
de serviciu, adica fara nicio plasa sub ele.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit pe drumurile grele** (D-5). Drumul cu cea mai mare expunere, easybox, **inca n-a
   fost umblat**: cele 5 comenzi asteapta AWB la un singur magazin. Reparatia de la I-3 il face
   sigur, dar sigur nu e acelasi lucru cu dovedit. Asta e singurul punct pe care **nu-l pot inchide
   eu**: se inchide cand acel magazin emite primul AWB la dulap.
2. **PUDO** (D-1) si **urmarirea returului** (D-2) sunt functionalitati lipsa, nu greseli, si
   amandoua masoara zero azi. A doua cere si o migratie.

⚠ Si nuanta care se uita usor: **judetul e validat de ei, orasul nu**. Un oras gresit nu se intoarce
ca eroare, ci ca un colet rutat dupa textul adresei.
