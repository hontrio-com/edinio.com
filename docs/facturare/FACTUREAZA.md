# Factureaza.ro: evidenta integrarii

> **Ce e fisierul asta.** Evidenta integrarii, tinuta la zi ODATA CU codul, in acelasi commit:
> securitate, functionalitate, compatibilitate cu platforma, conformitate cu API-ul lor, si ce
> asteapta inca dovada pe fir.

**Cod:** `src/lib/factureaza/` (`config.ts` regula „gata”, mediul si cheia de pe comanda; `client.ts`
firul; `document.ts` compunerea pura; `server.ts` citirea configurarii si PDF-ul pentru cronuri),
`src/lib/actions/factureaza.actions.ts`, `src/components/dashboard/FactureazaConfigClient.tsx`,
`src/app/(dashboard)/dashboard/features/factureaza/`, `src/app/api/factureaza/pdf/route.ts`, plus
regulile comune din `src/lib/billing/*`.
**Baza:** `docs/facturare/2027-02-06-factureaza-easybill-saga.sql` (migratia comuna a celor trei;
se aplica INAINTE de deploy, dupa `2027-02-05-facturis.sql`).
**Probe:** `src/lib/factureaza/*.test.ts` (112, toate verzi; banc de mutanti 45 din 45, cu fiecare
fisier refacut identic, verificat pe sha1).

---

## Sursele, in ordinea increderii

1. **Masuratori pe sandbox-ul lor PUBLIC**, 17.11.2026: `https://sandbox.factureaza.ro/graphql`, cu
   cheia de proba tiparita in documentatie (sectiunea 2). Facturi, stornari, clienti si plati
   create cu date inventate, apoi sterse (sandbox-ul a ramas cum era: contorul seriei „openapi”
   inapoi la 8, cei patru clienti initiali). Raspunsurile brute stau in `client.test.ts`.
2. **Schema GraphQL, citita prin introspectie** pe sandbox (67 de tipuri). De acolo argumentele
   exacte ale fiecarei mutatii (documentatia arata doar exemple).
3. **Documentatia GraphQL**: https://factureaza.ro/documentatie-api (descarcata si citita integral).
4. **Documentatia REST veche**: https://factureaza.ro/documentatie-api-v1. Spune ce lipseste din cea
   noua: gazda de productie, ca datele clientului de pe factura „se preiau automat din client”, ca
   stornarea e „o factura obisnuita” cu doua campuri in plus.
5. **Preturile**: https://factureaza.ro/preturi (cererile API incluse pe abonament).
6. **Productia, cu o cheie INVENTATA**: o singura citire, doar ca sa vedem raspunsul 401.

## Ce stim despre API

| | |
| --- | --- |
| Capat | `POST https://factureaza.ro/graphql` (productie) · `https://sandbox.factureaza.ro/graphql` (test) |
| Autentificare | `Authorization: Basic base64("<cheie>:x")`: cheia ca utilizator, parola ignorata. Cheia e a UTILIZATORULUI (Contul meu, Cheie API) si poate fi ingradita („Ce poate face cheia”) |
| Reusita | `200`, `{"data": {...}}` |
| Cheie gresita | `401 text/plain`: `401 not authorized - please provide a valid API key` (masurat, si pe productie) |
| Validare | `200`, `{"data":{"createInvoice":null},"errors":[{"message":"Validare nereuşită …","path":["createInvoice"]}]}` |
| Sintaxa / schema | `200`, `{"errors":[…]}` FARA `data`; `path` e calea din DOCUMENT (`["mutation","createInvoice","campInventat"]`) |
| Eroare interna | `500`, `{"error":{"message":"Mysql2::Error: …"},"data":{}}`: `error` la SINGULAR |
| Limita abonamentului | `200`, `errors[0].extensions.code = API_RATE_LIMIT_EXCEEDED` + `Retry-After` (documentat, nemasurat) |
| 403 / 429 | API indisponibil pe abonament sau utilizator / protectia pe adresa IP (documentat) |
| Cereri incluse pe luna | Premium 500k · Business 50k · Standard 5k · Basic 500 · Free 50, plus limite pe ora si pe zi |
| Factura | `createInvoice`: `clientId` OBLIGATORIU, `documentSeriesId`, `documentDate` (obligatoriu), `documentState`, `dueDays`, `lowerAnnotation`, `note`, `documentPositions[{description, unit, unitCount, total sau price, vat, productCode}]` |
| Serii | `invoiceSeries`: ⚠ o serie e a UNUI AN (SRV 2026 si SRV 2027 au id-uri diferite) |
| Citire | `invoices(id | ids | where)`. Un id inexistent da lista goala, fara eroare |
| PDF | `invoices(id){pdfContent}`: base64, rupt la 60 de caractere (masurat: ~100 KB, ~1 s) |
| Stornare | `createInvoice` cu `reversedDocumentId` + `inputCurrencyReversing` (OBLIGATORIU, nenul) + liniile cu minus |
| Incasare | `createPayment(invoiceId, amount, paymentDate, currency, description)`: restul de plata scade la 0 |
| e-Factura | trimiterea o face Factureaza.ro; prin API: `efacturaProperties` la creare, `submitInvoiceEfacturaUbl`, `checkInvoiceEfacturaStatus`, `efacturaTransactions` |
| Idempotenta | NU exista o cheie de idempotenta |

---

## Hotarari, si de ce

### Seria se tine dupa PREFIX, nu dupa id
MASURAT: o factura din 2026 pe seria SRV a lui 2027 e refuzata („Anul seriei selectate nu coincide
cu data documentului"). Un id salvat ar fi oprit facturarea in fiecare 1 ianuarie. Se salveaza
prefixul; id-ul seriei pentru ANUL documentului (in ora Romaniei) se afla la fiecare emitere, in
aceeasi cerere cu cautarea clientului, deci fara cerere in plus. In ianuarie comerciantul creeaza in
Factureaza.ro seria noului an, cu acelasi prefix, si nu schimba nimic in Edinio.

### Liniile pleaca prin TOTALUL lor cu TVA, iar documentul da fix `orders.total`
O linie primeste fie pretul unitar net, fie totalul cu TVA. MASURAT: totalul e AUTORITAR (1000 buc.
cu 1234,57 au ramas 1234,57, desi pretul scos de ei, 1,0203, da inapoi 1234,56), iar documentul
insumeaza totalurile liniilor. Deci se trimite totalul fiecarei linii, socotit din comanda: la
preturi cu TVA e chiar suma platita; la preturi fara TVA e `net + rotunjit(net x cota)`. Garda comuna
(`reconciliazaComanda`) verifica in BRUT, linie cu linie; diferenta legitima (un ban pe linie) intra
intr-o linie „Ajustare rotunjire”. Pretul de pachet 6,705 x 2 iese 13,41, fara ajustare.

### Reducerile: cantitate -1, total negativ, deci pret unitar POZITIV
BR-27 din e-Factura interzice pretul net negativ. MASURAT: `unitCount -1, total -10` da pretul
+8,2645, iar XML-ul lor pentru SPV are `InvoicedQuantity -1`, `PriceAmount 8.26`. Un produs cu pret
negativ pe comanda opreste facturarea.

### Clientul: fisa EXACTA, sau una noua
MASURAT (si scris in documentatia REST): datele clientului de pe factura se copiaza din FISA lui;
cele trimise pe `createInvoice` langa `clientId` se ignora, iar fara `clientId` factura e refuzata.
Deci se cauta fisele cu acelasi nume si se refoloseste doar cea cu EXACT datele de tiparit (nume,
CIF, adresa, oras, judet, tara; la firma si registrul si „RO”-ul). Altfel se creeaza una noua.
Fisele existente nu se rescriu niciodata: comerciantul le foloseste si la facturile lui.
CIF-ul firmei pleaca fara „RO”, iar „RO” in `taxId` (asa tiparesc ei „CIF: RO 24335356”). Persoana
fizica are CNP-ul necunoscut `0000000000000` (cerinta ANAF; masurat in XML-ul lor). Emailul si
telefonul NU se pun pe fisa: factura nu le cere, iar pe PDF s-ar tipari.

### `documentState: "open"`, scris anume
Fara el documentul se naste CIORNA (masurat: „draft”, cu numar luat din serie, rest de plata 0).

### Raspunsul mutatiei e si citirea
`createInvoice` intoarce seria, numarul, starea si totalul; nu mai trebuie o citire dupa emitere.
Coloanele comenzii: seria si numarul despartite din eticheta lor („SRV-1027” + contorul 1027 da
`SRV` / `1027`); ce nu se lasa despartit ramane INTREG in numar.

### Marcajul emiterii, in nota interna: adoptarea dupa deblocare
Neavand idempotenta la ei, fiecare document poarta in `note` (nevazuta pe PDF) cheia lui din
registru. Inainte de a emite, aceeasi cerere de pregatire intreaba daca exista deja un document cu
marcajul (filtrul `where`, MASURAT: il gaseste pe al lui si nu gaseste altul). Daca da, il ADOPTA.
Asa, si o reincercare dupa ce omul deblocheaza o operatie nelamurita, si un refuz clasificat gresit,
leaga documentul existent in loc sa emita al doilea. ⚠ Se adopta doar un document EMIS (`open` sau
`closed`, `facturaExistenta`); o CIORNA cu marcajul nostru opreste emiterea („emite-o sau șterge-o din
Factureaza.ro”): legata drept factura, ar fi pus pe comanda un document care fiscal nu exista.

### Stornarea: copiata din factura LOR, si adoptata daca exista
Liniile se iau din factura citita (cu totalurile ei autoritare), cu semn schimbat: anuleaza exact
documentul emis, chiar daca comanda s-a schimbat (MASURAT: -1274,57 pe o factura de 1274,57). Inainte,
aceeasi citire cauta stornarile facturii (`where reversedDocumentId`, `stornareExistenta`): se adopta
doar una COMPLETA si EMISA (`open`/`closed`); o ciorna, una partiala sau una intr-o stare necunoscuta
opresc, cu pasul urmator in contul lor; una anulata se ignora. Factura anulata, ciorna sau ea insasi
stornare nu se storneaza; o linie de alt fel, cu reducere procentuala sau cu cota TVA necitita (care NU
e 0%) trimite omul in contul lor.

### TVA-ul magazinului necitit opreste emiterea
O citire cazuta a setarilor de TVA nu se mai citeste „neplatitor” (cu 0% pe toate liniile, fara niciun
semn): emiterea se opreste cu „Încearcă din nou”.

### Data documentului in registru (pentru SAGA)
Pe randul reusit al facturii si al stornarii, si la adoptare, `detalii.data` = data scrisa pe document
(„AAAA-LL-ZZ”, cea citita de la ei; la emitere, altfel, cea trimisa). SAGA o prefera fata de `creat_la`:
o adoptare dupa deblocare, in alta zi, ar fi pus documentul in alta perioada de TVA. La o adoptare fara
data citibila, campul lipseste.

### Mesajele: dupa frazele lor INTREGI
Sfatul („creeaza seria anului”, „clientul lipseste”, „stornarea refuzata”) se alege doar dupa frazele lor
MASURATE, recunoscute ca final al unei parti a mesajului (in fata sta numele campului). Un subsir ar fi
prins si date („Cota TVA nu este permisă”, un produs „Dreptunghi”). Fara fraza cunoscuta, motivul lor se
arata intreg (inclusiv cel de drepturi ale cheii, a carui forma nu s-a putut masura).

### Verdictele

| ce s-a intamplat | scriere | citire |
| --- | --- | --- |
| `data.<mutatie>` cu id | facut | - |
| 401 · 403 · 429 · validare (`data` nul, eroare pe mutatie) · fara `data` (inainte de executie) · limita | `esuat` | refuz |
| eroare pe un SUB-camp al rezultatului · 5xx · 408 · eroare interna · forma necunoscuta · legatura rupta · termen depasit · confirmare fara id | `necunoscut` | refuz |
| orice esec la CREAREA CLIENTULUI | `esuat` (inca nu exista document fiscal) | |

### Modul de test (sandbox)
Comutator Test / Real, cu panou de avertizare cat timp e ales (lectia fGO din 16.09.2026):
* sandbox-ul e UN cont PUBLIC (cheia lui e tiparita in documentatie). Documentele de test poarta deci
  un CLIENT INVENTAT: niciun nume, adresa sau CIF de cumparator nu pleaca acolo. Liniile si totalul
  raman ale comenzii;
* cheia documentului pe comanda e `test:<id>`. Documentul se recunoaste dupa CHEIE, nu dupa
  configurare: PDF-ul si stornarea merg la gazda lui, marketplace-ul il refuza
  (`pdfDocumentAlMagazinului`, inainte de orice cerere), iar ruta de PDF il numeste `TEST_…`;
* pe Real, documentele de test de pe comanda se ignora (nu sunt fiscale, nu cer stornare); pe Test,
  o comanda cu documente REALE nu se atinge;
* mediul intra in cheia registrului, ca o emitere reala sa nu primeasca „deja facut” de la una de test;
* fiecare emitere de test o spune (avertisment pe ecran si `warning` pe calea automata), iar PDF-ul
  poarta „DOCUMENT DE TEST, FARA VALOARE FISCALA”;
* ⚠⚠ CHEIA E A MEDIULUI EI (`cheiaDeFolosit`): la salvare si la „Testează conexiunea”, cheia salvata se
  refoloseste doar in acelasi mediu. Dupa o trecere pe Test fara cheie noua, cheia contului real NU
  pleaca in sandbox-ul public; se cere cheia noului mediu (si formularul o spune la camp);
* ecranul spune separat ce e SALVAT si ce urmeaza sa salvezi (`stareaMediului`): antetul si randul
  „Mediu” arata mediul salvat, o alegere nesalvata apare „după salvare”, iar avertizarea are titlul
  potrivit („Ești în modul de testare”, „Ești încă în modul de testare”, „După salvare treci în modul
  de testare”).

### Incasarea: optionala, doar platile cu cardul, o singura data
La emitere, daca e cerut si comanda e DEJA platita cu cardul, `createPayment` legat de factura, sub
registru (cheia pe factura). FARA `paymentType`: e text liber la ei (MASURAT: primeste si „xyz”), iar
valorile meniului lor nu sunt publicate; felul platii sta in descriere. ⚠ Se incaseaza RESTUL de plata
(`sumaDeIncasat`), nu totalul: o factura adoptata poate avea deja o plata partiala. Cea platita intreg nu
primeste nimic; pe una adoptata cu restul necitit nu se ghiceste (se spune ca trebuie marcata de mana).

### Proba de conexiune si salvarea
O singura citire autentificata: firma contului si seriile (pentru lista din formular). O cheie care
nu poate citi seriile e refuzata acolo, nu la prima comanda. Salvarea refuza ce Factureaza.ro refuza
(cheie, abonament, un prefix de serie care nu exista deloc in cont) si trece, cu avertisment, cand nu
raspund. ⚠ IN IANUARIE, pana se creeaza seria noului an, prefixul exista doar pe anul trecut: atunci
salvarea TRECE cu avertisment (`verificaSeriaLaSalvare`), ca omul sa-si poata schimba celelalte setari
(si sa opreasca facturarea automata); emiterea refuza pana atunci, cu acelasi mesaj.

### Cate cereri costa o factura
Doua sau trei: pregatirea (clienti + serie + marcaj, una singura), clientul daca lipseste, factura;
plus una pentru incasare. Conteaza: pe Basic sunt 500 de cereri pe luna.

### Moneda si easySales
Ca la celelalte case: o comanda in alta moneda nu se factureaza in lei; comanda procesata in easySales
isi primeste factura acolo.

---

## Securitate

* `api_key` e singurul secret: criptat in baza (`privat.campuri_secrete`, fragmentul SQL) si mascat in
  browser. Pagina foloseste `mascheazaFactureaza`, care mascheaza si fara intrarea din
  `CAMPURI_SECRETE`; salvarea pastreaza cheia venita goala si fara ea (`pastreazaCheia`).
* Configurarea se citeste numai cu cheia de serviciu, dupa garda de proprietate.
* Cheia pleaca numai in antet, catre doua adrese CONSTANTE, cu `redirect: "error"`. Toate valorile pleaca
  in `variables`: textul cererilor e constant (un nume cu ghilimele nu poate schimba cererea).
* Fiecare cerere are termen (`AbortSignal.timeout`: 30 s scrieri, 15 s citiri, 20 s PDF) si plafon de
  marime; PDF-ul se verifica (`%PDF-`, 4,4 MB) inainte sa plece mai departe.
* Ruta de PDF: sesiune, MFA, proprietar, abia apoi configurarea; `private, no-store`; nume de fisier
  curatat.
* `client.ts` si `server.ts` sunt `server-only` si NU sunt „use server”; actiunile exporta doar cele
  sapte functii din contract, fiecare cu garda ei.

## Ce trebuie legat in platforma (coordonatorul)

`CAMPURI_SECRETE.factureaza_config = ["api_key"]` · dispecerul automat (`maybeAutoGenerateInvoice`) ·
lotul (`generateFactureazaInvoice(businessId, o.id)`) · pagina comenzii si lista (emitere, stornare cu
confirmare, „Citește numărul” = `refreshFactureazaDocuments`, PDF prin `/api/factureaza/pdf`) · cronurile
eMAG si Trendyol (`pdfDocumentAlMagazinului(admin, businessId, f.cheie)`) · contul cumparatorului
(`pdfFactura(acreditari(config), cheie, semnal)`, cu documentele `test:` oprite) · pagina Integrari
(`factureazaGata`), sigla in `IntegrationHeader` (fara `invert`: e albastru-inchis), ghidul din Ajutor.
Detaliile, cu diff-uri, sunt in raportul integrarii.

## Lasat dinadins

* **Proformele.** API-ul le are (creare, citire, PDF, factura generata la plata), dar comanda n-are
  coloane pentru ele. Se pot adauga pe acelasi tipar.
* **Trimiterea in e-Factura din API** (`efacturaProperties`, `submitInvoiceEfacturaUbl`). O face
  Factureaza.ro, dupa configurarea contului; trimise de noi pe jumatate, proprietatile ar fi putut
  inlocui pe cele ale contului.
* **Anularea si stergerea.** `deleteInvoice` sterge si o factura EMISA (masurat, pe sandbox). Un buton
  asa ar fi un act fiscal gresit la indemana; se storneaza.
* **Sincronizarea produselor si a stocului.** Alta lucrare. Codul SKU pleaca pe linie
  (`productCode`), ca omul sa recunoasca produsul.
* **Alte monede.** Doar lei, ca la celelalte case.

## Masurat pe fir, 17.11.2026

| cerere | raspuns |
| --- | --- |
| cheie inventata, sandbox si productie | `401 text/plain` „401 not authorized - please provide a valid API key” |
| `createInvoice` fara `clientId` (client dat pe factura) | refuz: „Client câmp obligatoriu, Client nu este inclus în listă” |
| `createInvoice` fara `documentState` | documentul se naste `draft`, cu numar |
| `clientId` + adresa alta pe factura | adresa trimisa IGNORATA; pe factura, cea din fisa |
| linie cu `total` (1000 buc., 1234,57) | totalul ramane 1234,57; pretul scos 1,0203 |
| reducere `unitCount -1, total -10` | pret +8,2645; in XML-ul SPV `InvoicedQuantity -1`, `PriceAmount 8.26` |
| cote 21% si 11% pe acelasi document | primite, totalurile exacte |
| serie din alt an | refuz: „Anul seriei selectate nu coincide cu data documentului” |
| stornare fara linii | refuz: „Poziții insuficiente…, Total stornat trebuie specificată…” |
| stornare cu liniile cu minus + `inputCurrencyReversing` | primita, total exact negativ, legata de factura |
| `createPayment` cu `paymentType: "xyz"` | primit fara validare; restul de plata 0 |
| `pdfContent` | base64 pe randuri de 60, PDF 1.4 valid (~100 KB) |
| `where` pe un camp inexistent | `500`, `{"error":{"message":"Mysql2::Error…"},"data":{}}` |
| `where` cu `_like` | `200`, `data.invoices: null`, „Operatorul like nu există.” |
| argument inexistent | `200`, fara `data`, `extensions.code: argumentNotAccepted` |
| `deleteInvoice` pe o factura emisa | stearsa (contorul seriei revine, daca e ultima) |

Apoi CHIAR modulele integrarii (nu `curl`), capat la capat pe sandbox: proba, compunerea unei comenzi
cu cote amestecate si reducere, pregatirea, clientul, emiterea (168,41 trimis = 168,41 la ei),
marcajul gasit la a doua pregatire, PDF-ul, incasarea, stornarea (-168,41) si gasirea ei, refuzul pe
serie gresita cu verdictul `esuat`.

## ⚠ CE ASTEAPTA DOVADA PE FIR (productie)

Productia n-a fost atinsa decat cu o cheie inventata. **Prima factura reala e dovada.** De urmarit:
1. ca `https://factureaza.ro/graphql` raspunde ca sandbox-ul (aceeasi aplicatie, alta gazda);
2. antetele `X-RateLimit-*` si raspunsul la limita depasita (pe sandbox nu apar);
3. un cont NEPLATITOR de TVA: `vatType` nu se trimite (il da contul), liniile pleaca cu 0%;
4. o cheie ingradita („Ce poate face cheia”): forma erorii de drepturi;
5. trimiterea automata in SPV a unei facturi cu reducere (-1) si a unei stornari.

## De intrebat Factureaza.ro, in scris

* Ce valori are `paymentType` (meniul lor), ca incasarea sa poarte felul platii.
* Daca stornarea trimisa in SPV poarta referinta facturii stornate (BT-25); exportul UBL facut de noi
  pe sandbox nu avea `BillingReference`.
* Daca exista (sau va exista) o cheie de idempotenta la `createInvoice`.
* Daca `where` pe `note` e un filtru pe care se pot baza (il folosim pentru adoptare).
