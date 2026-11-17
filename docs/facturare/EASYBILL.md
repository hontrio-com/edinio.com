# easybill.ro: evidenta integrarii

> **Ce e fisierul asta.** Evidenta integrarii, tinuta la zi ODATA CU codul, in acelasi commit:
> securitate, functionalitate, compatibilitate cu platforma, conformitate cu documentatia lor, si ce
> asteapta inca dovada pe fir. A sasea casa de facturare, dupa SmartBill, Oblio, fGO, Facturis si
> Factureaza.ro.

**Cod:** `src/lib/easybill/` (`config.ts` regula „gata”, `client.ts` firul si emiterea in pasi,
`document.ts` compunerea pura, `stornare.ts` verificarea stornarii facute in easybill, `server.ts`
citirea configurarii), `src/lib/actions/easybill.actions.ts`, `src/components/dashboard/EasybillConfigClient.tsx`,
`src/components/dashboard/easybill/EasybillStornareManuala.tsx`, `src/app/(dashboard)/dashboard/features/easybill/`,
`src/app/api/easybill/pdf/route.ts`, plus regulile comune din `src/lib/billing/*`.
**Baza:** `docs/facturare/2027-02-06-factureaza-easybill-saga.sql` (migratia comuna a celor trei;
se aplica INAINTE de deploy, dupa `2027-02-05-facturis.sql`).
**Probe:** `src/lib/easybill/*.test.ts` (143). Bancuri de mutanti: 27 pe client si compunere, 13 pe
stornarea inregistrata, 31 pe regulile din revizia din 17.11 (factura dubla, liniile, stornarea partiala,
legatura stornare-factura, timpul, plafonul listei, ciorna, judetul, TVA-ul); toti ucisi, cu fisierele
puse la loc verificat prin sha1.

---

## Sursele, in ordinea increderii

1. **Pagina lor de API**: https://easybill.ro/ajutor/api-easybill-integrare-rapida-cu-aplicatiile-tale
   (publicata 03.09.2025, citita integral pe 17.11.2026). Metodele, parametrii, exemplele de raspuns.
2. **Articolele lor de ajutor**: „Stornare facturi în EasyBill”, „Anularea si stergerea unei facturi”,
   „Afiseaza buton finalizare factura – facturi cirone”, „Algoritm numerotare facturii”, „Modificare
   numar si serie facturi”, „Incarcare factura fiscala in RO e-Factura”, „Ghid conectare EasyBill la
   ANAF RO e-Factura”.
3. **Masurat pe fir**, 17.11.2026, cu date INVENTATE (nu se poate crea nimic): intai cu `curl`, apoi
   cu CHIAR clientul nostru. Raspunsurile brute stau in `client.test.ts` (`PE_FIR`).
4. **Colectia Postman** de pe pagina lor: link Google Drive care cere acces („You need access”).
   N-am cerut acces (ar fi fost un mesaj in numele proprietarului) si n-am vazut-o.

## Ce stim despre API

| | |
| --- | --- |
| Capat | `https://apps.easybill.ro/cgi-bin/index.cgi?action=plugin`, metoda cu `sec=…_fct`, plus `mode=api` |
| Autentificare | `authenticateUser_fct` cu `Username` si `Password` ale unui utilizator de tip API → `SessionId`, `AppUnique` (tenantul), `UserId`, trimise apoi la fiecare cerere |
| Client | `addClient_fct` → `clientId`; `searchClient_fct` (cautare pe tot textul); `updateClient_fct` |
| Factura | `createInvoice_fct` (`invoiceStatus` 0 ciorna/proforma, 1 finala) → `ebInvoiceNo` = id-ul INTERN, nu numarul |
| Linii | `addProductToInvoice_fct`, CATE UNA, pe id (`invoiceIdType=id`); raspunsul are `prodId`, `valueWithoutVat`, `vatValue` |
| Citire | `searchInvoices_fct` (dupa interval sau dupa `invoiceId`) → serie, numar, total, stare `fiscal`/`draft`, anulata, observatii, stare ANAF; `getInvoiceProducts_fct` → liniile |
| PDF | `downloadInvoice_fct`, `fact` = id-ul sau numarul → octetii PDF |
| Plata | `addPayment_fct` (`type` card/cash/bank/receipt) → `{"status": "0"}`, fara id; `getPayments_fct` |
| e-Factura | `getCompanyInfo_fct` da `anafConnectionURL`, legatura unica a comerciantului catre ANAF; dupa conectare, easybill trimite singur |
| `status` | NEUNITAR: 1 la reusita la autentificare, client si factura; 0 la reusita la linie, plata si actualizarea clientului |

**Nu documenteaza:** cat traieste sesiunea, o finalizare a ciornei (cuprinsul pomeneste „Actualizare
factură”, dar sectiunea lipseste), stornarea, daca `invoiceExternalId` face emiterea idempotenta,
formatul erorilor de validare, paginarea listei de facturi.

**Din articole:** implicit, factura e fiscala si numerotata LA CREARE; cu setarea „Afișează buton de
finalizare factură”, intai e ciorna si se numeroteaza la finalizare. Numerotarea e consecutiva pe
serie. Stornarea (cantitativa sau valorica) se face din pagina facturii, „Acțiuni factură”, „Stornare
factură”. Anularea si stergerea raman in easybill, nu ajung la ANAF; o factura acceptata de ANAF se
storneaza.

## Masurat pe fir, 17.11.2026 (date INVENTATE)

| cerere | raspuns |
| --- | --- |
| autentificare, utilizator sau parola gresite | `200`, `Content-Type: application/json`, iar CORPUL e `Status: 302 Found` + `Location: index.cgi?action=plugin&mode=easybill&sec=friendlyerrormessage_frm` (antetul CGI scris in corp, nu JSON) |
| autentificare fara utilizator | `200`, `{"status": -2, "StatusMessage": "Error"}` |
| ORICE metoda cu sesiune gresita sau lipsa (si `createInvoice_fct`, `addProductToInvoice_fct`, `addPayment_fct`, `downloadInvoice_fct`) | `403`, `{"error": -1, "errorMessage": "User not authenticated!"}` |
| metoda necunoscuta, sau fara `mode=api` | `302` catre `…sec=friendlyerrormessage_frm`, corp gol |
| GET-ul din documentatie, fara sesiune buna | `302` (Apache) catre `http://www.easybill.ro/pagina-de-eroare` |
| POST cu `charset=UTF-8` in `Content-Type` | acelasi raspuns ca fara: corpul se citeste |

De aici: **garda de sesiune vine inaintea oricarei lucrari**, pe toate metodele, deci un 403 „User not
authenticated!” dovedeste ca nu s-a facut nimic (si pe o scriere); **POST-ul ajunge la metodele de
citire** (garda lor raspunde); **eroarea lor nu are o singura forma** (redirectare reala, redirectare
scrisa in corp sub un 200, JSON cu `error`, JSON cu `status` negativ).

Rulat apoi CHIAR clientul nostru pe capat, cu acreditari inventate: proba de conexiune da
`refuz: true` cu mesajul tradus (salvarea se opreste); citirea, PDF-ul si incasarea ies `esuat`;
emiterea iese `esuat` cu „Nu s-a emis nicio factură.” (nimic nu pleaca inainte de autentificare).

---

## Hotarari, si de ce

### Autentificarea: utilizatorul de tip API, nu cheia de partener
Documentatia spune ca accesul cere „o cheie sau un utilizator de tip API”, dar singura autentificare
aratata pentru un comerciant e `authenticateUser_fct` cu utilizator si parola. Cheile de partener
(`apikey` + `consumer`) apar DOAR la `provisionuser_fct` (crearea de conturi easybill de catre un
partener); nu le avem si nu ne trebuie. Pentru „cheia de acces API” din Setari, Automatizari, API
Management nu exista niciun parametru documentat. Formularul cere deci **utilizatorul API si parola
lui**, si spune unde se creeaza. Doar parola e secret (`password`); utilizatorul se vede, ca omul sa
stie ce cont a legat.

### Sesiunea: in memorie, refacuta o data
Tinuta pe server, in harta modulului, 20 de minute de la autentificare. **Cheia NU e secretul in
clar**: `cheieToken(["easybill", utilizator], [parola])`, deci o parola gresita nu primeste sesiunea
alteia (proba „cheia contine secretul”). Cereri simultane pe acelasi cont asteapta aceeasi
autentificare. La „User not authenticated!” sesiunea se reface O DATA si cererea pleaca din nou;
refacerea e sigura si pe scrieri (vezi masuratoarea). Refuzata si a doua oara, se opreste.

### Totul prin POST
Documentatia arata citirile ca GET, cu `SessionId` in ADRESA, unde ar fi ajuns in jurnalele oricarui
proxy. La noi totul pleaca prin POST, catre aceeasi adresa fara nimic secret, cu `redirect: "manual"`
(pagina lor de eroare e o redirectare; urmata, s-ar fi pierdut semnul „eroare”). Fiecare cerere are
termen: 30 s scrierile, 15 s citirile si PDF-ul.

### `status` nu spune nimic singur
Reusita se judeca dupa ce trebuia sa vina: `SessionId`, `clientId`, `ebInvoiceNo`, `prodId`. Un
`status` negativ e un NU al lor; un `error` in JSON e refuz; orice alta forma, pe o scriere, e „nu
stim”. Singura exceptie e plata, care nu intoarce niciun id: acolo `status` 0 (si „0” text, ca in
exemplul lor) e reusita, iar orice alt `status` nenegativ e „nu stim”.

### Emiterea in pasi, sub O SINGURA cheie de registru
easybill nu primeste factura dintr-o bucata: clientul, factura goala, apoi liniile una cate una. Tot
sirul ruleaza in `cuRegistru`, cu cheia `factura:easybill:<comanda>[-R<storno>]` (`cheieDocument`).
Verdictul fiecarui pas (`emiteFactura`):

| pas | o cadere e | de ce |
| --- | --- | --- |
| reluarea: factura ramasa citita DUPA ID, sau cautata dupa marcaj | refuz | citiri, inaintea oricarei scrieri |
| clientul (cautare dupa CUI, creare) | refuz, si pe scriere | nu exista inca document fiscal; un client in plus nu dubleaza nimic fiscal |
| timpul (inainte de factura) | refuz | nu ajunge pentru toate liniile: nu se incepe nimic |
| factura goala | refuzul lor = refuz; restul = „nu stim” | legatura rupta, pagina de eroare, 5xx, succes fara id |
| fiecare linie | „nu stim”, chiar si un refuz dovedit, cu id-ul pe eroare | documentul fiscal EXISTA deja, pe jumatate |

**Id-ul facturii ramase sta pe randul registrului.** De la crearea facturii incolo, ORICE eroare pleaca
purtand id-ul ei (`cuReferintaRamasa`); registrul il scrie in `referinta_externa`, iar deblocarea il
pastreaza. Mesajul il poarta si el, cu unul din doua indemnuri: o linie GRESITA (refuzata de ei,
socotita altfel, straina de comanda) cere ANULAREA facturii, fiindca completata ar ramane gresita; o
linie oprita de o legatura cazuta sau de timp cere doar deblocarea, iar Edinio o completeaza.

**O linie nesigura se lamureste, nu se ghiceste:** se citesc liniile facturii; daca linia a ajuns se
merge mai departe, daca nu se mai trimite O DATA. Nicio linie nu ajunge de doua ori.

**Fiecare linie se verifica pe loc:** raspunsul lor are valoarea fara TVA si TVA-ul liniei; se compara
AMANDOUA cu ale noastre (pe marime, cu toleranta rotunjirii). O valoare lipsa sau necitibila e
nepotrivire, nu o verificare sarita. Emiterea se opreste la PRIMA linie socotita altfel.

**Reluarea (o incercare de dinainte sub aceeasi cheie; fiecare reluare are randul ei in registru):**

1. **Dupa id**, drumul obisnuit: cel mai nou rand cu `referinta_externa` da factura ramasa, citita
   direct (`searchInvoices_fct` cu `invoiceId`), oricat de veche. Se COMPLETEAZA daca liniile ei sunt
   inceputul planului (nume, cantitate, valoare, TVA) si totalul ei e chiar suma lor. Altfel REFUZ:
   anulata, disparuta, cu alte linii sau cu alt total. **Peste o factura ramasa nu se emite niciodata
   alta**, sub aceeasi cheie.
2. **Dupa marcaj**, doar plasa, pentru procesul taiat inainte de orice `catch` (fara id pe rand): de la
   ziua primei incercari MINUS o zi pana azi, in ora Romaniei, cel mult 31 de zile; peste plafon =
   REFUZ, niciodata creare (fereastra de 4 zile de dinainte lasa o deblocare de luni, peste o
   incercare de vineri, sa emita a doua factura). Facturile anulate nu conteaza aici; doua gasite =
   refuz.

Marcajul: `EDN-` + 12 caractere din cheia registrului (deci altul dupa o stornare), in
`invoiceExternalId` si in observatii („Comanda #… - plata: … - ref. EDN-…”, inaintea mentiunii de
refacturare, ca un camp taiat la ei sa nu-l piarda). Dupa o creare noua pe o reluare, liniile facturii
se citesc oricum: easybill ar putea intoarce, pentru acelasi `invoiceExternalId`, o factura de dinainte.

**Timpul.** Calea manuala are 240 s, cea automata 40 s (`maybeAutoGenerateInvoice` e chemata si din
cronuri cu `maxDuration` 60). Un pas e socotit prudent la 2 s (de patru ori cat masuram). Inainte de
factura, daca nu ajunge pentru N+3 pasi: refuz, nimic creat. Intre linii, termenul trecut opreste
emiterea curat: „nu stim”, cu id-ul pe eroare, si deblocarea o completeaza.

**Registrul are si data documentului** (`detalii.data`, „YYYY-MM-DD”): a facturii noi, sau a celei
ramase si completate. SAGA o prefera fata de `creat_la`.

### De ce factura FINALA direct, si nu ciorna → linii → finalizare
Ar fi fost drumul fara documente fiscale pe jumatate, dar **finalizarea nu e documentata** (sectiunea
„Actualizare factură” lipseste, colectia Postman e inaccesibila). O ciorna creata de noi ar fi ramas
ciorna. Drumul ales e chiar exemplul lor (`invoiceStatus=1`, apoi `addProductToInvoice_fct`), cu
garzile de mai sus. Daca factura iese totusi ciorna (contul cu „Afișează buton de finalizare
factură”), citirea de dupa o intoarce PE LOC, si fara numar (easybill o numeroteaza la finalizare),
iar omul primeste avertismentul. Numarul unei ciorne sau al unei facturi anulate nu se scrie pe
comanda: contul cumparatorului si urcarea la marketplace l-ar fi luat drept document fiscal.

### Liniile
Pret cu TVA (aproape toate magazinele): pretul unitar brut, taiat la doi bani, cu
`productPriceIncludesVat=1`; totalul liniei e chiar ce a platit clientul. Preturi fara TVA: pretul net,
TVA-ul il pune easybill. Reducerile: cantitate -1 si pret POZITIV (BR-27, e-Factura). Unitatea:
`H87` (bucata) pentru marfa, `C62` pentru transport, taxe, reduceri si extraoptiuni (codurile ANAF din
lista lor). Produs simplu (`simpleProduct=1`), fara gestiune; codul de articol merge in observatia
liniei („Cod: …”), fiindca produsul simplu n-are camp de cod. Totalul se verifica de doua ori: inainte
(`reconciliazaComanda`, cu linia „Ajustare rotunjire”) si dupa (totalul citit; daca difera, se spune
si se scrie `easybill.totalDiferit`).

### Clientul
Persoana fizica: tip `PF`, FARA cod fiscal. „0000000000000” ar fi acelasi la toti cumparatorii; daca
easybill isi potriveste clientii dupa cod, a doua comanda ar fi primit clientul primei. Se creeaza un
client nou la fiecare factura (nu se cauta dupa nume: alt om cu acelasi nume ar fi adus alta adresa).
Firma: tip `LE`, CUI-ul cu „RO” la platitori, registrul, persoana de contact; se refoloseste clientul
cu ACELASI CUI (egalitate, nu subsir). Judetul pleaca drept cod ANAF („BV”; si din „Jud. Cluj”, „Mun.
Bucuresti”), Bucurestiul cu sectorul („B-SECTOR3”, forma lor); sectorul nu se ghiceste: fara el pleaca
„B”. O adresa din Romania FARA judet nu se factureaza (e-Factura il cere): se opreste inainte de
emitere, cand comanda inca se poate corecta. Fara trimiteri automate
(`xSendInvoiceByEmail=0`, `xSendInvoiceBySms=0`): s-ar fi putut face la crearea facturii, adica
inainte de linii.

### Seria: optionala
Gol = seria implicita a contului. Daca e scrisa, pleaca in `invoiceSeries` („serie externa”, in
cuvintele lor); formularul cere una existenta deja in easybill.

### Stornarea: NU prin API
API-ul n-are stornare. In easybill ea e un document LEGAT de factura (cantitativ sau valoric), facut
din pagina facturii. O factura cu minus facuta de noi prin `createInvoice_fct` ar fi un document
nelegat, pe un drum pe care nu l-a vazut nimeni mergand (cantitatile negative si `productIsReturned`
sunt nedovedite), iar o greseala acolo e un document fiscal gresit. Deci `stornoEasybillInvoiceAction`
**nu exista**; omul storneaza din easybill.

### Stornarea facuta in easybill, inregistrata in Edinio
Fara drum inapoi, comanda ar fi ramas „facturata” pentru totdeauna (slot ocupat, contul cumparatorului
aratand un document stornat drept viu). Deci omul ne spune seria si numarul stornarii
(`EasybillStornareManuala`, in fila easybill a comenzii), iar `inregistreazaStornareaEasybill`:

1. cere factura pe comanda si nicio stornare inregistrata inca;
2. citeste factura originala (data, total, client);
3. CAUTA documentul in lista lor (`searchInvoices_fct`), de la AZI inapoi pana la data facturii,
   plafonat la 62 de zile: primele 7 zile una cate una, apoi cate o saptamana pe cerere (lista n-are
   paginare documentata, deci „paginarea” o fac intervalele), si se opreste la primul interval in
   care il gaseste (`intervaleDeCautare`, `cautaFacturi`);
4. il VERIFICA (`verificaStornarea`, pura): **refuz** daca e negasit, ambiguu (acelasi numar in mai
   multe serii, fara serie data), chiar factura originala, ciorna, anulat, cu total pozitiv, zero
   sau necitibil, daca NU anuleaza exact factura (|total| diferit de al facturii cu mai mult de un ban,
   in oricare sens: dupa inregistrare „Emite factură nouă” refactureaza TOT, deci o stornare partiala
   se rezolva in easybill), sau daca observatiile lui pomenesc ALTA factura (serie si numar; marcajul
   nostru si mentiunea noastra de refacturare nu se numara); **avertisment** daca nici clientul, nici
   observatiile nu-l leaga de factura, daca e datat inaintea ei, sau daca factura e anulata;
5. refuza daca stornarea e deja pe ALTA comanda a magazinului: `easybill_storno_key` egal, o cheie de
   reemitere `factura:easybill:*-R<S>` sau o inregistrare `storno:easybill:*-S<S>` a altei comenzi;
6. lasa un rand in registru (`storno`, cheie `storno:easybill:<comanda>-S<stornare>`, fara apel extern,
   cu `detalii: { data, inregistrata: true }`): SAGA ii afla asa data;
7. scrie `easybill_storno_key/series/number` cu `business_id` si CONDITIONAT de aceeasi factura
   (`easybill_invoice_key`) si de nicio stornare inca, apoi `verificaLegaturaDocumentului` si o urma
   `info` in jurnal (`easybill.stornoInregistrat`).

Seria scrisa in campul de numar („EBF 961”) se desparte singura. Lista lor se cere cu `limit` explicit;
o saptamana venita plina se reia zi cu zi, iar o zi plina fara potrivire face „negasit” nedovedit: refuz.
Dupa inregistrare slotul e liber (`slotFacturare`), iar o factura noua pleaca cu alta cheie de registru
si alt marcaj. PDF-ul stornarii merge prin aceeasi ruta (`type=storno`).

**Refacturarea se sprijina pe stornare**: inaintea registrului, stornarea se citeste din nou la easybill
(`stornareaMaiTine`); negasita, anulata, ciorna sau fara total negativ = refuz, fiindca factura veche
ar fi din nou vie. Apoi garda SAGA (`sagaPermiteReemiterea`): o factura deja trimisa in contabilitate
trece si prin regula lor.

`refreshEasybillDocuments`: o factura ANULATA sau CIORNA in easybill se spune (`avertisment`) si NU se
scrie nimic pe comanda; o stornare anulata sau ciorna nu se rescrie nici ea. Omul hotaraste.

### PDF-ul
Prin ruta noastra (`/api/easybill/pdf`): sesiune, poarta MFA, proprietar, apoi configurarea; antetul
`%PDF-` si marimea se verifica inainte sa plece mai departe. Fara `json=1` la descarcare.

### Incasarea: optionala, doar cardul, o singura data
Ca la Facturis: la emitere, daca comanda e DEJA platita cu cardul, `addPayment_fct` cu `type=card`,
suma facturii, sub registru cu cheia pe factura. Un esec nu strica emiterea.

### e-Factura
O trimite easybill, din contul comerciantului, dupa ce acesta il conecteaza la ANAF. Pagina arata
butonul „Conectează ANAF (e-Factura)” catre `anafConnectionURL`, adusa la proba de conexiune si
scrisa de server in configurare (doar o adresa `https` pe `easybill.ro`).

### Salvarea face proba de conexiune
Autentificarea plus o citire autentificata (datele firmei). easybill spune NU → nu se salveaza;
easybill nu raspunde → se salveaza cu avertisment. Un `status` negativ la datele firmei e tot un NU al
lor. TVA-ul contului si al magazinului se compara in AMBELE sensuri: cont neplatitor pe un magazin cu
TVA, dar si cont platitor pe un magazin fara TVA (facturile ar iesi cu 0%, fara niciun semn).

### Setarile de TVA ale magazinului
Citite picat, nu devin „fara TVA”: emiterea se opreste. Altfel o factura fiscala ar fi plecat cu toate
liniile pe 0%.

---

## Securitate

* Doar `password` e secret: criptat in baza (`privat.campuri_secrete`, din migratia comuna) si mascat in
  browser. Pagina il goleste de doua ori (`mascheazaConfig` si `SECRETE_EASYBILL`), iar salvarea il
  pastreaza si singura, deci nimic nu se scurge si nimic nu se sterge chiar inainte ca
  `CAMPURI_SECRETE` sa stie de easybill.
* Configurarea se citeste numai cu cheia de serviciu, dupa garda de proprietate.
* Parola si sesiunea pleaca NUMAI in corpul POST, catre o adresa fixa; nu se scriu in jurnale, in
  mesaje sau in registru. Cheia sesiunii din memorie e hasuita.
* Emiterea si incasarea trec prin registrul de operatii externe (verdictele de mai sus).
* `client.ts` si `server.ts` sunt `server-only` si NU sunt „use server”; actiunile isi verifica
  fiecare proprietarul (sau primesc clientul de sistem).
* Legatura ANAF se arata numai daca e `https://…easybill.ro/…`.

## Lasat dinadins

* **Stornarea si anularea** prin API (vezi mai sus).
* **Ciornele/proformele**: n-avem cum sa le finalizam prin API.
* **Produsele din gestiunea lor** (`simpleProduct=0`, `productId` din catalog): ar cere maparea
  produselor noastre pe catalogul lor; alta lucrare.
* **`updateClient_fct`** pe firma refolosita: ar rescrie fisa clientului din nomenclatorul
  comerciantului (si ce a corectat el de mana).
* **Trimiterea facturii pe email/SMS din easybill**: oprita, vezi „Clientul”.
* **Facturile in alta moneda**: doar lei, ca la celelalte case.
* **`provisionuser_fct`** (crearea de conturi easybill de catre partener): cere chei de partener.

## Unde trebuie legata in platforma

Dispecerul automat (dupa celelalte case) · facturarea in lot · pagina comenzii (fila easybill:
emitere, PDF, „Citește numărul”, `EasybillStornareManuala` cand exista factura si nu exista stornare;
FARA buton de stornare) · lista comenzilor · urcarea facturii la eMAG si
Trendyol (PDF-ul prin `pdfDocumentAlMagazinului`) · contul cumparatorului (`ruta-document.ts`,
`pdf-document.ts`) · `CAMPURI_SECRETE.easybill_config = ["password"]` · cardul din Integrari (fara
`soon`) · panoul de admin · ghidul din Ajutor · catalogul de pe site. Lista exacta, cu diff-uri, e in
raportul de predare; o proba „legat peste tot”, ca la Facturis, ar trebui sa vina odata cu legarea.

---

## ⚠ CE ASTEAPTA DOVADA PE FIR

N-avem cont easybill, deci drumul CU acreditari bune n-a atins serverul lor. **Prima factura reala e
dovada.** De urmarit atunci, in ordinea riscului:

1. **Citirile prin POST** (`getCompanyInfo_fct`, `searchInvoices_fct`, `getInvoiceProducts_fct`,
   `downloadInvoice_fct`) cu o sesiune buna. Pe fir ajung la garda lor; daca ar ignora parametrii
   din corp, „Testează conexiunea” ar raspunde „formă necunoscută”, iar remedierea e trecerea
   citirilor pe GET intr-un singur loc (`trimite`), fara sa logam adresa.
2. **`productPriceIncludesVat=1`**: daca e ignorat, verificarea pe linie opreste emiterea la prima
   linie (factura ramasa se anuleaza din easybill).
3. **Cantitatea -1** la reduceri si semnul din `valueWithoutVat`/`vatValue` (verificarea pe linie
   compara marimea; semnul il prinde totalul de la final).
4. **`invoiceComments`** intors intreg de `searchInvoices_fct` (marcajul) si daca `invoiceExternalId`
   face emiterea idempotenta.
5. **Ordinea si id-urile din `getInvoiceProducts_fct`** (`productId` = `prodId` de la adaugare).
6. **Clientul**: PF fara cod fiscal si fara CNP in e-Factura; judetul „B” fara sector; diacriticele
   (UTF-8) in nume si adrese.
7. **Seria scrisa** (`invoiceSeries`) cand nu exista in cont.
8. **Cat traieste sesiunea** si daca o autentificare noua o inchide pe cea veche (mai multe instante
   Vercel pe acelasi utilizator).
9. **Cand trimite easybill factura in SPV**: daca ar trimite-o la creare, inainte de linii, ar pleca
   goala. Exemplul lor (finala, apoi liniile) sugereaza ca nu.
10. **`addPayment_fct`**: `status` 0 la reusita si refuzul pe o suma mai mare decat restul.
11. **Durata**: o factura cu N linii inseamna N+3 cereri pe rand (~0,5 s fiecare, masurat pe
    erori); o comanda cu zeci de linii sau un lot mare pot apasa pe limita functiei.
12. **Liniile citite** (`getInvoiceProducts_fct`): `productPrice` pe bucata FARA TVA si
    `productVATValue` pe bucata (asa arata exemplul lor, la o linie trimisa fara TVA). La o linie
    trimisa CU TVA nu stim daca `productPrice` vine net sau brut; daca vine brut, reluarea refuza
    (sensul sigur) si comparatia se potriveste pe ce arata ei.
13. **`limit` la `searchInvoices_fct`**: nedocumentat acolo. Daca serverul il ignora, primim lista
    intreaga (si refuzam doar peste plafon); daca are alt plafon, mai mic, o lista taiata nu se vede.
14. **Stornarea lor, in lista lor**: ca document separat, `fiscal`, cu `invoiceTotalAmount` NEGATIV.
    Daca easybill o arata altfel (total pozitiv cu alt `invoiceCategory`, sau o nota de credit care
    nu apare in `searchInvoices_fct`), verificarea refuza orice stornare reala si trebuie potrivita
    pe ce arata ei. Tot atunci: daca observatiile stornarii pomenesc factura originala.

## De intrebat easybill, in scris

* Cum se finalizeaza prin API o factura creata ciorna (`invoiceStatus=0`)? Ce e „Actualizare
  factură” din cuprins?
* Exista stornare prin API (o factura legata de cea originala)? Merge `productQuantity` negativ si ce
  face `productIsReturned`?
* `invoiceExternalId` e unic pe cont (idempotent), si se poate cauta dupa el?
* Cat traieste `SessionId`? O autentificare noua o invalideaza pe cea veche?
* Ce face „cheia de acces API” din API Management, si unde se trimite?
* Persoana fizica: cum se trimite CNP-ul (sau „0000000000000”) la `addClient_fct`?
* Cand trimite easybill o factura in SPV, cand contul e conectat la ANAF?
* Acces la colectia Postman.
