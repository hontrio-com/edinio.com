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

## ⚠ Ce ramane: 21 de constatari, inca NEVERIFICATE

Auditul a propus 38. Am reparat 8 (plus una a mea) in prima trecere, si **inca 3 verificate de mana
pe 16.09**, dupa ce proprietarul a cerut sa se repare tot ce se poate repara cu certitudine:

1. ⚠⚠ **Anularea avea TREI coduri de reusita, si stiam unul.** In `Ship-Common-ErrorMapping.json`
   sunt trei coduri care inseamna „s-a anulat", si toate trei vin pe canalul de ERORI:
   `CANCELSHIPMENT.TRACKINGNUMBER.DELETED` (il stiam), `MASTERTRACKINGID.TRACKINGNUMBER.CANCELLED`,
   si — cel care costa — `SHIPMENT.CANCELEDWITHOUTPICKUP.SUCCESS`, a carui propozitie spune limpede
   „has been successfully canceled". Comerciantul afla ca anularea a picat pe o expediere pe care
   FedEx tocmai o anulase, si ramanea cu un AWB mort pe comanda.
   ⚠ Perechea NEGATIVA (`SHIPMENT.CANCELEDWITHOUTPICKUP.FAILURE`) e tinuta afara anume, si are proba:
   cand copiezi o familie de coduri, verifica intai care dintre ele sunt perechea negativa a celorlalte.
2. **Traducerea zilelor de tranzit se oprea la `TEN_DAYS`**, iar enumerarea lor are 22 de valori, pana
   la `TWENTY_DAYS`. Adica pentru expedierile internationale — exact acolo unde cumparatorul chiar
   vrea sa stie — nu se arata nimic. Acum numarul se citeste din chiar numele enumerarii, deci nu mai
   poate ramane in urma; `UNKNOWN` si `SMARTPOST_TRANSIT_DAYS` raman fara text, dinadins.
3. ⚠⚠ **Comentariul portii de cron mintea, si era o invitatie.** Spunea ca poarta accepta si antetul
   `x-vercel-cron`; codul citeste doar `authorization`, si bine face: `x-vercel-cron` e un antet
   OBISNUIT, nu un secret. Cine ar fi „reparat" dupa comentariu ar fi deschis toate cele saptesprezece
   cronuri, cu rol de serviciu, adica ocolind RLS. Comentariul spune acum de ce NU se accepta, iar
   proba cade daca antetul ajunge vreodata in fisier.

**Restul de 21 n-au trecut prin niciun filtru si nu le-am verificat eu.** Le las scrise ca sa nu se
piarda, cu eticheta lor, si nimic mai mult:

- anularea refuzata de ei (colet deja predat) lasa comanda fara nicio cale de dezlegare;
- `cautaDupaReferinta` nu citeste `output.alerts[]` si nici `successful`;
- eticheta nesalvata nu spune nimic comerciantului, si FedEx stins o face inaccesibila din panou;
- etichetele poarta date personale si nu le sterge nimic vreodata;
- valoarea declarata pleaca la emitere dar nu si la cotare, si fara `declaredValue` pe colet;
- checkout-ul arunca verdictul de TVA pe care tot codul il calculeaza;
- `stateOrProvinceCode` nu se trimite pentru nicio tara, desi la US/CA/PR e obligatoriu;
- formatul si hartia etichetei se aleg independent, desi FedEx le perecheaza;
- avertismentul „doar preturi de lista" nu poate sa apara niciodata;
- traducerea zilelor de tranzit se opreste la `TEN_DAYS`, enumerarea lor merge la `TWENTY_DAYS`;
- motivul exceptiei (`ancillaryDetails`) nu se citeste, desi ei il trimit;
- comentariul portii de cron spune ca accepta `x-vercel-cron`, iar codul nu-l accepta;
- plus alte unsprezece, mai mici.

---

## Nota, cinstit

**9/10.**

Integrarea era deja scrisa cu grija: cinci niveluri de citire a raspunsului, `type: "D"` refuzat ca
livrare, verdicte separate pe citire si pe scriere, cheia de cache cu gazda inauntru. Ce s-a inchis
azi sunt insa doua defecte CRITICE, si unul dintre ele desfiinta chiar plasa contra coletului dublu.

⚠ **De ce nu e mai mult:**

1. **Nimic n-a atins vreodata API-ul lor**, iar cele doua critice sunt tocmai genul care nu se vad
   decat la prima emitere reala.
2. **24 de constatari raman neverificate**, fiindca filtrul automat a fost oprit la jumatate. Nu stiu
   cate din ele sunt reale; stiu ca n-am verificat niciuna.
3. Cele opt reparate sunt dovedite cu probe si cu mutanti, dar tot pe un drum pe care **nu a umblat
   niciun colet**.

**Probe:** 12 noi la FedEx, 10 comune celor trei clienti. Banc de mutanti **14 din 14**. `tsc` curat,
**8.271 de probe verzi**, build OK, fara migratie.
