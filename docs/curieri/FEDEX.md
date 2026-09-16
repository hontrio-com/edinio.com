# FedEx: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al cincisprezecelea.

**Ce sunt ei:** primul TRANSPORTATOR GLOBAL propriu-zis din platforma. Primul fara ramburs, fara
idempotenta si fara reimprimare de eticheta.

**Referinta autoritara:** specificatiile OpenAPI publice, descarcate pe 16.09.2026 din
`developer.fedex.com/wirc/json/api_groups/`: **13 cai si 921 de scheme** in Rate, Ship si Track,
plus `API_Reference_Guide.json` (nomenclatoare). Sunt publice fara autentificare, dar ascunse in
input-uri din HTML (`<input id="swaggerjson">`) — paginile de documentatie au doar naratiunea.

**Cod:** `src/lib/fedex/` (`client.ts` 1270 randuri, `expediere.ts`, `preturi.ts`, `servicii.ts`,
`statusuri.ts`), `src/lib/actions/fedex.actions.ts`, cronul `src/app/api/cron/fedex-tracking`,
`FedexAwbModal.tsx` si `FedexConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu FedEx configurat | **ZERO** (din 129) |
| AWB-uri emise vreodata | **ZERO** |
| Etichete pastrate | **ZERO** |
| Operatii `fedex` in registru | **ZERO** |

⚠ Deci nu exista date de reparat. Tot ce urmeaza sunt lucruri care ar fi cazut **la prima folosire
reala**, si trei dintre ele ar fi costat un colet sau o factura gresita.

---

## Cum s-a facut trecerea

Un audit pe **sapte dimensiuni** (corpul cererii, citirea raspunsurilor si verdictele, tarif si TVA,
statusuri si cron, securitate, checkout, etichete si anulare), fiecare cu specificatiile alaturi.
**38 de constatari propuse.**

⚠ **Filtrul automat de sceptici a fost oprit de proprietar** (ar fi insemnat 121 de agenti: 7
cautatori + 3 sceptici pentru fiecare constatare, si nu pusesem niciun plafon). De aici incolo
verificarea s-a facut **de mana, in cod si in specificatii** — ceea ce oricum se facea inainte de
orice reparatie. Sectiunea de la urma spune limpede ce a ramas neverificat.

---

## ⚠⚠ Cele doua critice

### 1. Un refuz DOVEDIT al autentificarii iesea „nu stim” — si bloca o comanda despre nimic

In `apel()`, luarea tokenului statea INAUNTRUL aceluiasi `try` cu cererea, iar `catch`-ul rescria tot
ce iesea de acolo prin `ambiguu`. Pe o SCRIERE, `ambiguu` inseamna `necunoscut`: randul din registru
BLOCHEAZA si cazul iese la om.

Dar `token()` arunca verdicte gandite: chei lipsa, 401 „credentiale respinse" si 403 „prag de rata pe
IP" sunt toate `eroareRefuz` — si pe buna dreptate, fiindca **cererea de expediere nici nu plecase**.
Comerciantul cu o cheie gresita apasa „Emite AWB", nu pleca nimic nicaieri, si totusi ramanea cu o
comanda inghetata din care nu iesea decat cu mana.

⚠ **Acelasi defect era in TREI clienti**, scrisi dupa acelasi sablon: FedEx, **UPS** si **Shipo**.
Toti trei reparati, cu o singura proba comuna (`refuzul-tokenului-ramane-refuz.test.ts`) care ii
apara pe toti si cade daca apare al patrulea.

### 2. Plasa contra duplicatelor era respinsa de ei la fiecare apel

FedEx nu are idempotenta. Fereastra „am trimis si n-am primit raspuns" se inchide cu o CITIRE:
`POST /track/v1/referencenumbers` pe referinta noastra. Numai ca `cautaDupaReferinta` isi compunea
capatul de sus al ferestrei cu o zi in plus, deci `shipDateEnd` era **intotdeauna MAINE**.

Iar in chiar fisierul lor de erori sta codul **`TRACKING.SHIPDATEEND.FUTURE`**: „Invalid ship date
range. End date must not be in the future."

Adica singurul lucru care sta intre un raspuns pierdut si al doilea colet real ar fi picat de fiecare
data — si tocmai cand era nevoie de el. Acum capatul se opreste la ziua de azi.

⚠ Ce se pierde, si e scris pe fata in cod: o expediere datata in VIITOR (comerciantul poate alege
data, FedEx accepta pana la 10 zile inainte) nu poate fi gasita pe drumul asta. E plafonul lor, nu
alegerea noastra.

---

## Celelalte reparatii

### 3. ⚠ Un retur ajuns inapoi era citit ca LIVRARE, si de acolo pleaca factura

FedEx nu deschide alt numar pentru retur: **acelasi AWB** primeste `RS`, se intoarce, si se incheie
cu `DL` plus `dateAndTimes[type=ACTUAL_DELIVERY]` — la adresa EXPEDITORULUI. Citind doar starea
curenta, un colet intors la comerciant e de nedeosebit de unul livrat cumparatorului: comanda trecea
pe „Livrata" si de acolo `maybeAutoInvoice` emitea **factura pentru o vanzare care nu s-a facut**.

Leacul era deja in raspuns: `scanEvents[]`, pe care le ceream la fiecare apel (`includeDetailedScans:
true`) **si nu le citea nimeni**. Acum un `RS`/`RT` in istoric taie inaintea oricarei alte hotarari,
iar comerciantul primeste notificarea „coletul returnat a ajuns la tine" — care inchide promisiunea
facuta la `RS` („urmareste-l pana ajunge").

⚠ **DHL rezolvase deja exact capcana asta**, si comentariul lui o spune pe fata. FedEx era copia care
nu invatase.

### 4. Parametrii de cotare stateau in obiectul gresit

`rateRequestControlParameters: { returnTransitTimes: true }` era pus in `requestedShipment`. In
schema lor (`Full_Schema_Quote_Rate`) campul e **frate** cu `accountNumber` si `requestedShipment`,
iar lista de proprietati a lui `RequestedShipment` nu-l contine deloc. Pus inauntru, e ignorat tacut
— deci timpii de tranzit nu veneau niciodata, desi tot codul care ii traduce si ii arata
cumparatorului exista si ii astepta.

⚠ **Proba ingheta defectul**: citea campul din acelasi loc gresit, deci era verde. Acum verifica si
ABSENTA din locul gresit.

### 5. „Nu gasesc numarul" era numarat ca defectiune

Un AWB proaspat nu vine lipsa din raspuns, ci ca `trackResults[].error` cu
`TRACKING.TRACKINGNUMBER.NOTFOUND` intr-un 200. Chiar textul lor, pastrat in codul nostru: „Poate
dura pana la 24 de ore pana apare in sistemul lor." Cronul il punea pe acelasi picior cu o cadere de
retea, deci umplea galeata de erori si trimitea comerciantului o alarma care arata a chei gresite —
la fiecare lot de AWB-uri nou emise. Cazul „n-au intors nimic" era deja tratat cum trebuie; asta e
acelasi lucru, spus de ei cu un cod in loc de tacere.

### 6. Cheia gresita batea in pragul lor pe IP

Harta de tokenuri pastra doar REUSITELE, deci o configurare cu cheie gresita cerea un token nou la
FIECARE cotare. Iar `/oauth/token` are prag **pe adresa IP** (3 cereri/s timp de 5s → 403 timp de
zece minute), si pe Vercel IP-ul e partajat: un singur magazin prost configurat putea sa stinga
cotarea FedEx pentru toate. Acum refuzul DOVEDIT se tine minte 60 de secunde. La 403 asta chiar
repara cauza: fara el, fiecare cotare mai adauga o cerere peste pragul care tocmai ne-a blocat.

### 7. Diacriticele se scoteau doar din strada

Motivul (eticheta se imprima pe hartie termica in reteaua lor globala; la Woot un singur caracter cu
diacritice a dus la un 400) n-are nimic de-a face cu strada in mod deosebit — dar `stripDiacritics`
aparea intr-un singur loc din tot fisierul. Asa plecau cu diacritice `personName` si `companyName`,
adica **numele cumparatorului**, care e pe fiecare eticheta romaneasca. Acum scoaterea traieste in
functia de taiere, exact ca la fratele lui DHL.

### 8. Trei coduri de status, si o nota despre patru care lipsesc dinadins

Comparat mecanic cu toate tabelele lor: **46 documentate, 44 in codul nostru.** Adaugate: `RC`
(membrul care lipsea dintr-o familie pe care o aveam intreaga — aveam cererea `RR` si schimbarea
`RM`, dar nu si anularea cererii), `AC` si `OX`. Cele patru ramase (`LC`, `RD`, `RG`, `RP`) privesc
eticheta de retur trimisa pe email, pe care noi n-o cream niciodata: puse cu o clasa inventata, ar fi
miscat comenzi pe un drum pe care nimic nu umbla. Lasate afara, un cod necunoscut se pastreaza brut
si nu misca nimic — purtarea corecta. Scris ca atare in cod.

---

## ⚠ Un defect in propria mea plasa, gasit pe drum

Recensamantul de cache-uri de token pe care l-am scris la trecerea FAN (`fancourier.token.test.ts`)
se numeste „fiecare cache de token din `src/`". Detectorul lui cauta insa sirurile `tokenCache`,
`TOKEN_CACHE` si `cacheToken` — adica exact cache-urile botezate in engleza.

**Masurat: vedea 8 din 11.** Cele trei invizibile isi numesc harta `tokenuri`: FedEx, UPS si Shipo.
Si cel pe care nu-l vedea era chiar cel pe care ar fi trebuit sa-l prinda: **Shipo tinea cheia de API
in clar, drept cheie de `Map`**. Un filtru care nu poate sa vada un caz nu poate nici sa-l apere,
oricat de verde ar fi.

Acum censul se face pe FORMA declaratiei, nu pe numele variabilei, si cere anume cele trei fisiere.
Shipo trece prin ajutorul comun, ca toti ceilalti.

⚠ Si o dovada in plus ca detectorul se uita la text: prima oara cand censul a cazut pe Shipo, l-a
aprins un **comentariu** pe care tocmai il scrisesem acolo si care pomenea cuvantul `tokenCache`.

---

## Ce am verificat si era deja bine

| ce cere documentatia | ce e in cod |
| --- | --- |
| serviciile interne cu origine RO | randul `Romania` din „Europe New Domestic Services Portfolio": bifa la FIRST, PRIORITY EXPRESS, PRIORITY si PRIORITY FREIGHT; gol la ECONOMY („Only U.K."), PRIORITY EXPRESS FREIGHT si PRIORITY OVERNIGHT. **Exact cele patru din `servicii.ts`.** |
| cheile cu spatiu la final (`"FEDEX_PRIORITY "`) | inca sunt in JSON-ul lor; codul le scrie curat, cu motivul alaturi |
| marcajul cronului pe fiecare cale de iesire | toate cele sase cai il scriu |
| codul scris peste un AWB reemis | `scrieUrmarirea` scrie pe IDENTITATEA expedierii citite |
| `dimensions.units` lipsa = INCH | unitatea pleaca intotdeauna |
| cheia de cache cuprinde si GAZDA | da — acelasi `client_id` merge pe ambele medii |

---

## A doua trecere, 16.09.2026: inca sase reparatii

Proprietarul a cerut sa se repare tot ce se poate repara cu certitudine. Din cele 21 ramase,
**sase** au fost verificate de mana in cod si in specificatii, si reparate. Fiecare are proba si
mutant.

### 9. ⚠⚠ Pretul cotat nu continea suprataxa de valoare declarata, dar factura o continea

`totalDeclaredValue` pleca **doar** din `corpExpediere`. Cotarea mergea fara el, deci pretul aratat
cumparatorului in checkout si comerciantului in panou era mai mic decat cel facturat. Diferenta o
suporta comerciantul, tacut, la fiecare colet asigurat.

⚠ **Acelasi defect a fost reparat la DHL pe 14.09** (`valoareaDeclarataLaCurier`,
`buildDhlOptions`). Aici statea a doua copie, si asta e lectia care se repeta: cauta a doua copie
INAINTE. Blocul e acum unul singur (`puneValoareaDeclarata`), chemat din amandoua corpurile, iar
`buildFedexOptions` primeste valoarea la fel ca `buildDhlOptions`, cu **podea** din catalog, nu
plafon: la valoarea declarata pericolul e coborarea din browser, nu umflarea.

### 10. ⚠⚠ Vama primea un colet fara valoare

`customsValue`, `unitPrice` si `totalCustomsValue` se puneau numai cand `valoareComanda > 0`. Sub
zero lei (o comanda de inlocuire, un cadou, o linie cu pret zero) `customsClearanceDetail` pleca
cu marfa fara nicio valoare declarata. Factura comerciala pe care FedEx o intocmeste din campurile
astea merge la vama: ori ei refuza cererea, ori coletul e **oprit acolo** si se descurca
cumparatorul. A doua varianta nu se afla decat de la el.

⚠ Oprit acum in `lipsuriExpediere`, dar **doar cand tara destinatarului e scrisa si chiar difera de
a expeditorului**: lista aceea e si poarta de dinaintea cotarii din checkout, unde destinatarul se
compune fara tara. O conditie care ar fi socotit „lipsa tarii" drept international ar fi taiat
cotarea FedEx pentru orice magazin al carui expeditor nu e in Romania, pret fix in loc de cel
adevarat, tacut.

### 11. ⚠ Descrierea marfii e generica, si nimeni nu spunea nimic

Implicitul e „Produse" (modalul) sau „Bunuri de consum" (`corpExpediere`). `Commodity.description` e
singurul camp obligatoriu la ei, deci trece, **la FedEx**. La vama, o descriere generica e motivul
obisnuit pentru care un colet e retinut si cerut lamurit.

`avertismenteExpediere` o spune la **cotare**, adica in ultima clipa in care omul mai poate schimba
casuta; intors din raspunsul de emitere, avertismentul ar veni dupa ce coletul a plecat. Si **nu
opreste**: „Produse" poate fi chiar descrierea potrivita pentru un colet cu de toate, iar noi n-avem
cum sa stim ce e inauntru.

### 12. ⚠⚠ Cotarea in euro facea emiterea IMPOSIBILA

Butonul era `disabled={emitand || !aleasa}`, iar `aleasa` venea doar dintr-o oferta cotata.
`ofertePosibile` insa arunca **toate** ofertele cand contul coteaza in alta valuta decat leul, ceea
ce conturile FedEx din Romania fac des.

Rezultatul: comerciantul vedea un avertisment limpede despre valuta si un buton pe care nu-l putea
apasa **niciodata**. Coletul se putea expedia perfect; noi refuzam sa AFISAM un pret in euro, si din
asta faceam o imposibilitate de a expedia.

Pretul ramane nearatat, aceea a fost hotararea buna si nu se schimba. Se desparte doar afisarea
pretului de emiterea coletului: cand cotarea n-a intors nimic, serviciul se alege din nomenclator,
iar costul se scrie `null`, nu `0` (un zero in `fedex_cost` s-ar vedea la reconciliere ca transport
gratuit si ar ascunde exact diferenta pe care coloana exista s-o arate).

### 13. ⚠⚠ Eticheta se salva cu formatul CERUT, nu cu cel TRIMIS

`format: specificatieEticheta(config).imageType`. Dar `imageType` si `labelStockType` nu sunt
independente la ei, iar un proiect de API fara formatul cerut intoarce alt `docType`, **fara nicio
alerta**, fiindca eticheta chiar a fost produsa.

Coloana `format` e apoi singura sursa pentru numele fisierului si tipul MIME la descarcare, deci un
ZPL ajungea la om ca `.pdf` si nu se deschidea cu nimic. Iar FedEx nu are reimprimare: nu exista
„mai cere-o o data".

Acum se ia `docType` din raspuns, cu cadere pe cel cerut cand lipseste, `docType` ramane optional la
ei, iar o eticheta perfect buna refuzata din cauza asta ar fi pierdere definitiva.

### 14. ⚠ Motivul exceptiei nu ajungea la comerciant

`latestStatusDetail.ancillaryDetails[]` poarta motivul („Customer not available or business closed",
„Incorrect address") si actiunea recomandata; `statusByLocale` spune doar „Delivery exception".
Notificarea ii spunea comerciantului ca s-a intamplat ceva, fara sa-i spuna ce, deci fara sa-i spuna
ce poate face.

⚠ Se citesc si intra in descriere, dar **nicio hotarare nu se ia din ele**: sunt text tradus dupa
`x-locale`, iar o comparatie pe ele ar merge in engleza si ar tacea in romana. Codul ramane singura
autoritate.

---

## Ce am verificat si NU era un defect

| constatarea propusa | ce s-a masurat |
| --- | --- |
| „FedEx stins face eticheta inaccesibila din panou" | **fals.** `getFedexEtichetaAction` trece prin `proprietar(businessId)`, nu prin `configSiComanda`, nu atinge configurarea deloc. O eticheta platita ramane descarcabila si dupa ce integrarea e stinsa. |
| „avertismentul «doar preturi de lista» nu poate sa apara niciodata" | **fals.** `tarifulPotrivit` cade pe `LIST` abia dupa ce incearca toate celelalte opt tipuri; un cont fara tarife negociate ajunge acolo, `deLista === tipuri`, si steagul se aprinde. |
| „cererile CDO (schimbare de adresa) misca gresit comanda" | **nu.** `RA`/`PR`/`AS` sunt clasate `in_retea`, iar comanda e deja `shipped` cand ele apar; `statusUrmator` nu coboara niciodata. Ramane deschis doar daca ar trebui **semnalate**, vezi mai jos. |

---

## ⚠ Ce ramane deschis, si de ce NU s-a atins

Cinci lucruri. Niciunul nu e o scapare: la fiecare, reparatia ar fi cerut ori o hotarare a
proprietarului, ori o specificatie pe care n-o avem pe disc. **Ghicitul aici costa un colet real.**

1. **Etichetele poarta date personale si nu le sterge nimic vreodata.** `fedex_etichete`,
   `ups_etichete` si `dhl_etichete` tin PDF-uri cu numele, telefonul si adresa cumparatorului, fara
   nicio retentie. Exista deja un tipar in platforma (`curata-fisiere`: 30 de zile orfanii, 6 luni de
   la comanda). ⚠ **Nu s-a facut fiindca e o stergere de date pe un termen pe care proprietarul nu
   l-a ales**, iar la FedEx stergerea e definitiva: nu exista reimprimare. Cere o hotarare, nu un
   commit.
2. **`cautaDupaReferinta` nu citeste `output.alerts[]`.** Efectul e **conservator**, nu periculos:
   un „nu gasesc" care ar veni ca alerta de nivel superior nu e vazut, deci `chiarNuExista([])`
   raspunde `false`, „nu stim", si randul din registru ramane blocat. ⚠ Reparatia ar merge in
   directia SCUMPA (ar elibera reincercarea), iar codul exact al alertei nu e in niciun fisier de pe
   disc. Nu se ghiceste.
3. **Formatul si hartia etichetei se aleg independent in configurare**, desi FedEx le perecheaza
   (din textul lor stim sigur doar `resolution: 300` ↔ `ZPLII`, care e deja tratat). ⚠ Dupa
   reparatia 13, o nepotrivire nu mai strica descarcarea, devine o eroare a lor, vizibila. Un
   filtru inventat in configurare ar putea interzice o pereche valida.
4. **Cu FedEx singurul curier pornit si o comanda cu ramburs, lista de livrare iese GOALA** si
   cumparatorul nu afla de ce. ⚠ **Expunere masurata: zero.** `fedex_config.enabled` e fals la toate
   cele 129 de magazine (la fel UPS si DHL). Reparatia cere un canal nou de la `getShippingOptions`
   catre interfata de checkout, adica o schimbare in formularul TUTUROR magazinelor, pentru un caz
   care azi nu exista.
5. **Cererile de schimbare a adresei (`RA`, `PR`, `AS`) nu se semnaleaza.** Un colet redirectat de
   cumparator dupa comanda e si un tipar de frauda. ⚠ Dar sunt si evenimente banale (corectare de
   adresa de catre curier), iar o notificare la fiecare ar fi zgomot care ii invata pe oameni sa nu
   se mai uite la notificari. Nu sunt sigur, deci nu ating.

---

## Nota, cinstit

**9,5/10.**

Integrarea era scrisa cu grija de la inceput: cinci niveluri de citire a raspunsului, `type: "D"`
refuzat ca livrare, verdicte separate pe citire si pe scriere, cheia de cache cu gazda inauntru. Cele
paisprezece reparatii inchid tot ce se putea inchide fara sa ghicim.

⚠ **De ce nu e 10:**

1. **Nimic n-a atins vreodata API-ul lor.** Zero magazine configurate, zero AWB-uri, zero etichete.
   Toate probele sunt pe forma cererii si pe raspunsuri compuse de noi dupa specificatiile lor. Doua
   dintre defectele reparate azi sunt tocmai genul care nu se vad decat la prima emitere reala.
2. **Retentia etichetelor ramane deschisa**, si e singura care priveste date personale.
3. Cele cinci deschise de mai sus sunt scrise cu motivul lor, dar sunt tot deschise.

**Probe:** 12 la prima trecere + 30 la a doua (17 la vama si emitere, 13 la pret, eticheta si
urmarire), plus 10 comune celor trei clienti. Banc de mutanti **20 din 20**. Urmarirea e probata si
**prin clientul adevarat**, cu `fetch` fals, nu doar pe forma codului. `tsc` curat, **8.415 de probe
verzi**, build OK, fara migratie.
