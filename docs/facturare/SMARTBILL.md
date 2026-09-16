# SmartBill: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare integrare pana cand e 10/10 din
> toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu platforma,
> si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per integrare. `docs/curieri/` pentru transportatori, `docs/facturare/`
> pentru casele de facturare. Prima din a doua serie.

**Ce sunt ei:** casa de facturare cu ADEVARAT folosita din platforma. Dintre cele trei integrate
(SmartBill, Oblio, fGO), aici sta aproape tot traficul fiscal.

**Referinta autoritara:** specificatia OpenAPI **3.1.0** pe care proprietarul a pus-o pe disc pe
16.09.2026 (`smartbill-openapi-spec (1).json`, 420 KB, `SmartBill API 1.0.0`): **29 de cai si 24 de
scheme**, server `https://ws.smartbill.ro/SBORO/api`. Descrierile campurilor sunt neobisnuit de
bune: spun nu doar tipul, ci si **ce se intampla cand gresesti** (vezi `numberOfItems` mai jos).

**Cod:** `src/lib/smartbill.ts` (clientul), `src/lib/actions/smartbill.actions.ts` (actiunile si
calea automata), `src/lib/billing/*` (regulile comune celor trei case), `SmartbillConfigClient.tsx`,
`app/api/smartbill/pdf/route.ts`.

---

## Expunerea masurata, 16.09.2026

⚠⚠ **Si aici e toata deosebirea fata de cei 17 curieri.** Acolo, 14 din 17 n-au emis niciun AWB
vreodata, iar fiecare fisa spune ca nimic nu e dovedit live. Aici NU:

| ce | cat |
| --- | --- |
| Magazine cu SmartBill pornit | **7** din 129 |
| Magazine cu Oblio / fGO pornit | 3 / 1 |
| Facturi emise vreodata | **240** |
| Stornouri emise | **21** |
| Proforme emise | 0 |
| Magazine cu facturare AUTOMATA | 2 |
| Magazine cu trimitere pe email | 3 |
| Ultima factura | **chiar azi**, 16.09.2026 |

Pe magazine: `suporti-numar` 230 de facturi si 20 de stornouri (activ azi), `tonel-beauty` 6,
`itp-blk` 3, `esafero` 1. Pe luni: iunie 6, iulie 50, august 97, septembrie 87.

Ce e exercitat de trafic real: transportul (238 din 240), reducerea la plata online (27), doua cote
de TVA in joc (0% si 21%), stornarea (21). Ce NU e atins deloc: proformele, conversia proforma to
factura, reducerile promotionale, rambursul.

---

## ⚠⚠ Defectul care s-a vazut din baza, nu din cod

### 1. Adresa documentului n-a fost salvata NICIODATA, la niciuna din 240 de facturi

Reparatia din 07.07.2026 adaugase coloanele `smartbill_invoice_url` / `smartbill_estimate_url` si un
buton „SmartBill" in pagina comenzii. Masurat azi:

* `smartbill_invoice_url` e **NULL la toate cele 240 de facturi**;
* **184** dintre ele au fost emise DUPA acea reparatie;
* in registrul de operatii externe, **181** de emiteri reusite au cheia `url` si valoarea NULL la
  toate 181.

Deci drumul de scriere mergea; `POST /invoice` pur si simplu nu intorcea adresa. Specificatia lor de
azi nici nu mai cunoaste `POST /invoice`: are numai **`POST /invoice/v2`**, cu ACELASI corp de cerere
(`InvoiceRequest`), si un raspuns care declara `documentUrl`, `documentId` si `documentViewUrl`.

**Ce costa, dincolo de butonul care nu apare:** `facturaComenzii()` cere si numarul, si adresa. Fara
adresa intoarce `null`, deci pentru un comerciant pe SmartBill **nicio factura nu se poate urca la
eMAG sau Trendyol**. Expunerea de azi e zero (cele 7 magazine n-au comenzi de marketplace), dar
drumul era mort, nu doar incomplet.

### ⚠⚠ Si de ce reparatia grabita ar fi fost mai rea decat defectul

Raspunsul poarta DOUA adrese, cu regimuri opuse:

| camp | ce e | cine il poate deschide |
| --- | --- | --- |
| `documentUrl` | editare in SmartBill Cloud | **cere autentificare** |
| `documentViewUrl` | vizualizare, partajabila cu clientul | oricine are linkul |

Urcarea la marketplace aduce documentul cu `fetch(f.url)` **fara nicio acreditare**, apoi il pune in
R2 cu `contentType: "application/pdf"`. Pusa in coloana, adresa de editare ar fi adus pagina de
LOGIN si ar fi urcat acel HTML la eMAG drept document fiscal. Comerciantul ar fi aflat cand i l-ar fi
cerut cineva.

**Gol e o lipsa vizibila. Plin cu adresa gresita e o factura falsa care arata ca merge.** De aceea
`adresaPublica()` NU cade pe `documentUrl`, iar proba are un mutant anume pentru cadere.

Si fiindca tot nu putem chema API-ul lor de aici, **prima factura emisa de acum raspunde singura**:
cand documentul se creeaza fara `documentViewUrl`, se scrie un avertisment cu tot cu „are sau nu
adresa de editare". Nu ramanem cu presupunerea.

**Bonus scos la aceeasi trecere:** panoul facea `raw.replace("editare", "vizualizare")`, adica
traducea prin potrivire de text o adresa al carei format nu e documentat nicaieri. A disparut.

---

## 2. Calea fara niciun om in fata isi inghitea esecurile

`maybeAutoGenerateInvoice` e singura cale de facturare fara om in fata. Eroarea de **reconciliere**
era strigata corect (`smartbill.reconcileRefuzat`, critical). Trei guri ramaneau mute:

1. **refuzul VENIT DE LA EI** (token gresit, serie inexistenta, plafon de abonament atins):
   `return false` sec;
2. **avertismentul de email**: pe calea manuala ajunge in interfata, aici era pur si simplu ARUNCAT;
3. **`catch {}` gol** la capat: inghitea si defectele noastre, cu acelasi simptom, adica niciunul.

⚠ **Masurat, si nu e o ipoteza:** `error_logs` are 2.071 de randuri de la 45 de actiuni, pana azi, si
**ZERO** de la oricare dintre cele trei case de facturare. Iar in registru exista un esec pe 15.09,
„Autentificare esuata", pe un magazin viu. S-a intamplat exact ce descrie lista de mai sus, si nimeni
n-a aflat.

`return false` ramane pe toate trei: dispecerul nu are voie sa rupa actualizarea comenzii fiindca n-a
putut emite o factura. Ce se schimba e ca tacerea devine un rand scris, cu comanda si cu pasul
urmator in mesaj.

---

## 3. Doua lucruri mici, la fel de sigure

* **O scriere din sase nu purta magazinul in filtru.** Scrierea stornoului filtra doar pe `id`. Nu
  era o gaura (comanda fusese deja legata de magazin la citire, iar clientul e cel al
  utilizatorului, deci RLS statea in fata), dar filtrele de aici sunt AUTORIZARE, nu cautare, iar o
  singura scriere care se bizuie pe altceva e chiar cea care supravietuieste unui refactor. Proba le
  numara pe toate sase.
* **Numele fisierului PDF intra intr-un ANTET prin interpolare.** Seria vine dintr-un dropdown
  alimentat din nomenclatorul lor, deci azi nu poate purta ghilimele sau rand nou. Se curata oricum:
  intre sursa valorii si antet stau baza noastra si un formular.

---

## 4. Rezerva de la storno, facuta vizibila

Cand `POST /invoice/reverse` nu intoarce numarul notei de credit, codul scrie pe comanda numarul
facturii STORNATE. Fara asta, comanda n-ar arata nicio stornare si omul ar storna a doua oara, deci
rezerva e buna si ramane. Dar ce scrie ea e un numar gresit in dreptul stornoului, iar butonul de PDF
aduce originalul.

⚠ **Masurat: nu s-a aprins niciodata.** Toate cele 21 de stornouri din productie au numar PROPRIU,
diferit de al facturii stornate, iar specificatia declara acum `number` pe raspunsul de 200. Nota din
cod care spunea „raspunsul poate veni FARA numarul stornoului (exemplul oficial il are gol)" era din
iulie si a ramas in urma; e inlocuita cu masuratoarea. Rezerva scrie de acum un avertisment.

---

## Ce am verificat si era deja bine

| ce cere documentatia | ce e in cod |
| --- | --- |
| `client.required = [country, name]` | `country` se compune din `countryNameFor`, cu Romania implicit |
| `products[].required` include `taxPercentage` | fiecare linie isi poarta cota ei (`cotaLiniei`), nu cota documentului |
| `discountValue` **trebuie sa fie negativa**, altfel CRESTE totalul | se trimite `-valoare` |
| `numberOfItems` **obligatoriu** pe linia de discount, altfel discountul e ignorat in tacere si documentul iese cu totalul neredus | se trimite pe fiecare linie de reducere |
| `payment.type` enum, cu `Card online` | exact acesta, si doar cand banii chiar au intrat (`baniiAuIntrat`) |
| `/document/send`: corp FLAT, `type` `factura`/`proforma`, `subject` Base64, raspuns `{status:{code}}` | camp cu camp la fel |
| `/estimate/invoices`: `areInvoicesCreated` + `invoices[]` | citit exact asa, si verificat INAINTE de conversie, ca sa nu iasa a doua factura |
| erorile vin si ca **200 cu `errorText`**, nu doar 4xx | `if (data.number)` intai, apoi `errorText`: un document real nu se arunca niciodata |
| plafonul de documente al abonamentului (410) | iese `esuat`, deci reincercarea e libera dupa ce comerciantul mareste pachetul |
| lot de facturi | `INVOICE_CONCURRENCY = 1`, adica strict serial: nu batem in pragul lor |
| PDF-ul | ruta proprie, cu autentificare, poarta MFA, verificare de proprietar si `no-store` |

**`measuringUnitName: "buc"` pe toate liniile** e o limitare a PLATFORMEI, nu o scapare: catalogul
nostru n-are deloc coloana de unitate de masura. Scris asa e onest; ar deveni defect abia cand
produsele vor avea unitati.

---

## Ce ramane deschis, si de ce

1. ✅ **CONFIRMAT LIVE la 16 minute dupa deploy (16.09.2026, 19:47 ora Romaniei).** Prima factura
   emisa pe `/invoice/v2` a fost `SNR0426`, comanda `#0261`, magazinul `suporti-numar`. A venit cu
   adresa publica, iar aceasta a ajuns pe comanda:
   `https://cloud.smartbill.ro/documente/extern/fact…`. Cuvantul `extern` din adresa confirma ca e
   cea PUBLICA, nu cea de editare. Deci bucla intreaga merge: raspunsul lor, registrul, coloana de
   pe comanda, si de acolo butonul din panou si drumul catre marketplace.
   ⚠ Asta inchide si intrebarea veche: `POST /invoice` chiar NU intorcea adresa (181 din 181 goale),
   iar `POST /invoice/v2` o intoarce de la prima cerere.
2. **`GET /invoice/paymentstatus` nu se foloseste.** Ar inchide bucla incasarilor (mai ales la
   ramburs, unde banii vin dupa livrare). E o lucrare de produs, nu un defect: azi nimic nu pretinde
   ca stie starea incasarii.
3. **Proformele n-au fost emise niciodata** (0 din 240), deci tot drumul proforma to factura, inclusiv
   garda `getEstimateInvoices`, e scris si neumblat.
4. **`useStock`, bonul fiscal, `paymentUrl`, e-Factura** raman in afara, ca si pana acum.
5. **Cele doua reduceri deodata** (promotie + plata online) n-au aparut niciodata in productie
   (0 comenzi din 240). Acolo a doua linie de reducere isi numara si pe prima in `numberOfItems`;
   cu o singura reducere, cazul masurat de 27 de ori, socoteala e corecta.
6. **Cotele amestecate pe acelasi document n-au aparut niciodata** (masurat: 0 din 240 de facturi au
   linii cu cote diferite, si 0 au si cote amestecate SI reducere). Toata masinaria de grupe de cota
   cu impartire proportionala a transportului si a reducerilor, scrisa pe 09.09.2026, e deci corecta
   pe hartie si neumblata in productie. ⚠ Acolo sta si singura intrebare la care nu pot raspunde
   fara serverul lor: cand reducerile se impart pe grupe, `numberOfItems` al liniei de reducere a
   unei grupe numara si liniile celeilalte grupe. Suma NU atarna de el (`discountType: 1` cu
   `discountValue` explicit), dar atribuirea de TVA ar putea. Nu se atinge fara o factura de proba.

---

## Nota, cinstit

**9,5/10.**

Integrarea era deja departe: reguli de TVA comune celor trei case, cote pe linii cu impartirea
proportionala a transportului si a reducerilor, reconciliere care refuza documentul cand totalul nu
bate, registru de operatii externe cu verdicte despartite pe „refuzat" si „nu stiu", si o purtare
foarte atenta la documentul deja creat (nu se arunca niciodata, ca sa nu iasa al doilea).

⚠ **De ce nu e 10:**

1. ⚠⚠ **Trimiterea facturii pe email n-a fost verificata NICIODATA, si e cel mai mare necunoscut.**
   Masurat: `suporti-numar` are `send_email` PORNIT si 187 de facturi cu email de client, deci
   aproximativ atatea trimiteri au fost incercate. Nu exista nicio dovada ca vreuna a ajuns.
   Reparatia din 07.07 rescrisese corpul cererii (`/document/send`), dar nimeni n-a masurat de
   atunci, iar raspunsul lor nu se scria nicaieri. **De azi se scrie** (`emailAutomatNetrimis`),
   deci urmatoarea comanda de la magazinul acela raspunde. Pana atunci: nu stiu, si nu pretind ca
   stiu.
2. **Suprafata probata de realitate e ingusta.** Din 241 de documente: zero proforme, zero conversii
   proforma-factura, zero facturi cu cote amestecate, zero reduceri promotionale, zero ramburs.
   Codul le acopera pe toate si e scris cu grija, dar nimic din ele n-a fost umblat de un client.
3. **Bucla incasarilor nu e inchisa** (`/invoice/paymentstatus` nefolosit), mai ales la ramburs,
   unde banii vin dupa livrare.
4. **Ochii sunt de o zi.** Alarmele care fac diferenta intre „merge" si „a incetat sa mearga" au
   fost puse azi; pana ieri, trei luni de facturare n-au lasat niciun rand in `error_logs`.

**Probe:** 17 noi, in doua fisiere. Banc de mutanti **7 din 7**, intre care caderea pe adresa de
editare si intoarcerea la `POST /invoice`. Emiterea e probata **prin clientul adevarat**, cu `fetch`
fals, nu doar pe forma codului. `tsc` curat, suita verde, build OK, fara migratie.
