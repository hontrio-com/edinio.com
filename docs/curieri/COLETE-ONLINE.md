# Colete Online: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al cincilea, dupa `WOOT.md`, `DPD.md`,
> `SAMEDAY.md` si `CARGUS.md`.

**Ce sunt ei:** un BROKER, nu un curier. Dau mai departe la Cargus, DPD, Sameday, TNT si ceilalti,
iar `service/list` intoarce ofertele fiecaruia. Asta schimba mai multe reguli decat pare, si se
vede mai jos la adrese.

**API-ul real:** `https://api.colete-online.ro/v1` (test: `/v1/staging`). OAuth2 client credentials
pe `https://auth.colete-online.ro/token`, cu `Authorization: Basic base64(client_id:client_secret)`;
jetonul se tine cat spune `expires_in`.

**Referintele autoritare, toate verificate pe 15.09.2026:**

1. ⚠⚠ **Specificatia lor OpenAPI**, cea care sta in spatele <https://docs.api.colete-online.ro/>.
   Pagina e o coaja de Swagger UI (`app.bundle.js`), iar specul e **inauntrul bundle-ului**, nu
   servit separat. Auditul din iulie s-a oprit la „docs-ul e SPA" si a folosit doar colectia
   Postman; de acolo vin doua afirmatii care s-au dovedit FALSE (vezi I-2 si I-3).
2. **Colectia Postman oficiala**,
   <https://www.colete-online.ro/assets/coleteonline_api.postman_collection.json>, 24 de cereri.
   Buna pentru corpuri, dar **incompleta**: n-are anularea si n-are raspunsuri de exemplu la
   status.
3. **`colete-online.2.1.1.zip`, modulul lor OFICIAL de WordPress**, din `Downloads`. `lib/common`
   contine tipuri PHP care documenteaza API-ul mai bine decat pagina publica.

**Cod:** `src/lib/colete.ts`, `src/lib/actions/colete.actions.ts`, modulele pure din
`src/lib/shipping/` (`adresa-colete.ts`, `statusuri-colete.ts`), ramura Colete din
`src/lib/actions/shipping.actions.ts`, cronul `src/app/api/cron/colete-tracking`, ferestrele
`ColeteAwbModal.tsx` si `ColeteConfigClient.tsx`, ruta de eticheta `src/app/api/colete/awb`.

---

## Expunerea masurata, 15.09.2026

| ce | cat |
| --- | --- |
| Magazine cu credentiale Colete Online | **ZERO** |
| AWB-uri emise vreodata | **ZERO** |
| Comenzi care au ales Colete la checkout | 0 |
| Operatii in registrul de operatii externe | 0 |
| Zone `colete` declarate pe magazine | 19 (setul implicit, fara credentiale) |

⚠⚠ **Cea mai mica expunere dintre toti curierii trecuti pana acum.** La Cargus erau macar doua
magazine configurate; aici `colete_config` e **null pe fiecare rand din baza**: nimeni n-a deschis
vreodata pagina de configurare. Deci nu exista NICIUN semnal de productie dupa care sa prioritizez,
iar singura masura ramane conformitatea cu contractul lor documentat.

---

## Ce foloseste platforma din API-ul lor

| Calea lor | Folosim | Unde |
| --- | --- | --- |
| `POST /token` (auth) | **da** | `getCOToken`, cu jeton tinut cat spune `expires_in` |
| `POST /order/price` | **da** | cotarea din checkout, cu `priceMinimal` pe destinatar |
| `POST /order` | **da** | `createCOOrder` |
| `GET /order/awb/{id}` | **da** | eticheta A4/A6 |
| `GET /service/list` | **da** | serviciile brokerului |
| `GET /user/balance` | **da** | doar la „Testeaza conexiunea"; vezi D-2 |
| **`GET /order/status/{id}`** | **da, de azi** | cronul `colete-tracking` |
| **`DELETE /order/{id}`** | **da, de azi** | anularea; vezi I-2 |
| `POST /shipping-points/*` | nu | punctele lor; `domesticToPoint` a fost exclus deliberat in iulie |
| `GET /search/*` | nu | nomenclatoare; noi trimitem NUME, pe care ei le accepta |
| `GET /validate/phone`, `/validate/email` | nu | verificarea destinatarului inainte de emitere |
| `GET /address` | nu | agenda de adrese a contului |
| `GET /platform/updates`, `/service/logos` | nu | nu ne privesc |

**extraOptions trimise:** 2 (deschidere la livrare), 3 (sambata), 4 (asigurare), 5 (ramburs in
cont, cu IBAN si titular), 6 (ramburs numerar), 9 (referinta interna = numarul comenzii).
**Netrimise:** 1 (webhook de stare, vezi D-1), 7, 8, 10, 11, 12, 13, 14.

---

## Inchis

### I-1. ⚠⚠ La ei diacriticele se PASTREAZA, si noi le scoteam pe jumatate

La Cargus, DPD sau FAN nomenclatorul e fara diacritice, si de aceea `normalizeLocalityName` si
`normalizeCountyName` le scot. La Colete Online e invers, si o spun chiar ei, de doua ori:

1. Colectia lor Postman trimite, in corpul comenzii, `"city": "Timișoara"`, `"county": "Timiș"`,
   `"street": "Piața Avram Iancu"`, `"street": "Băncilă Octav"`.
2. Modulul lor de WordPress ia orasul si judetul din comanda **verbatim**
   (`WoocommerceOrderRepository::getDeliveryAddressCity` intoarce `get_shipping_city()` si atat)
   si nu are nicaieri vreo transliterare.

⚠ **Ce faceam: doua reguli pentru acelasi camp, in ACELASI corp.** Orasul DESTINATARULUI trecea
prin `normalizeLocalityName` (care le scoate), dar judetul lui pleca neatins, si la fel toata
adresa EXPEDITORULUI. Deci o singura cerere purta „Timisoara" langa „Timiș": una ciuntita, una
intreaga.

⚠ **Masurat:** din 468 de comenzi cu adresa, **64 au diacritice in oras**, 14 in judet si 44 pe
strada. Una din sapte comenzi, nu un caz de colt.

⚠ **Singura interventie care ramane e plierea sectorului in capitala**, si tocmai fiindca ei sunt
BROKER: dau mai departe la Cargus, DPD si ceilalti, unde Bucurestiul e o SINGURA localitate.
„Sector 3" trimis ca oras n-ar fi gasit in niciun nomenclator din lantul lor. Pe dos fata de
Sameday, unde sectoarele CHIAR sunt orase.

### I-2. ⚠⚠ Ei CHIAR au anulare, iar codul nostru scria negru pe alb ca nu au

Comentariul din `createCOAwb` spunea: „Colete Online e cel mai prost caz din toti sase: NU are
endpoint de anulare". Aceeasi propozitie statea si in memoria proiectului, din iulie. Era adevarata
despre **colectia lor Postman**, care n-are o asemenea cerere. **Nu e adevarata despre API-ul lor:**
specificatia OpenAPI documenteaza `DELETE /order/{uniqueId}`, „Cancel an existing expedition", cu
un `cancelReason` optional (1 nu mai doresc, 2 am gresit, 3 mai ieftin in alta parte, 4 nu a venit
curierul).

Doua luni, comerciantul a trebuit sa intre in contul lor si sa anuleze de mana.

⚠⚠ **SI `200` NU INSEAMNA „ANULAT".** Raspunsul e `{ success: boolean }`, iar documentatia lor
spune: „Cancellation may not be possible depending on the current status of the expedition (for
example, after the package has already been picked up by the courier). In such cases the response
field `success` will be `false`".

Citit ca reusita, comanda ar ramane fara AWB in panou in timp ce coletul chiar pleaca, iar
comerciantul ar afla din factura. Aceeasi forma ca la Cargus, unde un `200` putea purta un obiect
de eroare. De aceea se cere `success === true` ANUME: `!!success` ar inghiti sirul „false".

⚠ **Dezlegarea locala se face oricum**, fiindca butonul a insemnat mereu „scoate numarul de pe
comanda", iar comerciantul poate sa fi anulat deja de mana. Dar refuzul lor **nu se inghite**: iese
in mesajul de pe ecran. Si „colete" a iesit din lista `scrieDoarLaNoi` a panoului, altfel i-am fi
spus omului ca la ei nu s-a atins nimic exact cand se atinsese.

### I-3. Urmarirea coletului

Clientul se oprea la cotare, emitere, eticheta si dezlegare.

⚠⚠ **Aici codurile EXISTA, spre deosebire de Woot si Cargus.** Raspunsul lor poarta, pe fiecare
eveniment, un `code` NUMERIC plus numele in romana (`statusTextParts.ro.name`). Deci comanda CHIAR
se poate misca: `20800` se cheama, la ei, „Colet livrat". Nu e o deducere de-a noastra, e eticheta
lor.

⚠ **Dar tabelul nu e publicat.** In toata specificatia lor exista UN SINGUR exemplu de istoric, pe
un drum fericit, cu zece coduri: 9000 comanda trimisa la curier, 10000 document emis, 11000 alocata
pentru ridicare, 20050 ridicat de la expeditor, 20100 in tranzit, 20200 si 20210 in depozit, 20400
in depozit central, 20500 in livrare la curier, 20800 colet livrat. `STARI_COLETE` are exact pe
acelea. **Ce nu s-a vazut nu misca nimic** si se strange pe nume in raspunsul cronului, ca harta sa
creasca din trafic adevarat, ca la Woot. Codurile de refuz, retur sau livrare esuata nu apar in
exemplul lor, deci nu se ghicesc dupa banda: un „Livrat" pus pe un retur ar emite si factura.

⚠ **Primele trei coduri NU misca comanda**, si merita spus: „Document de transport emis" nu
inseamna ca a plecat ceva, coletul e inca la comerciant.

⚠⚠ **O CERERE PE ORA PER COLET, si o spun ei:** „The requests to this endpoint are limited to once
every hour for each uniqueId/awb. If you want to update the status in real time use the order
status change notify extra option." De aceea cronul merge la DOUA ore, si de aceea nu exista
„reincearca imediat": un `429` ar insemna ca noi am gresit ritmul, nu ca ei sunt cazuti.

⚠ **Si nu exista cerere in LOT.** Fiecare colet se intreaba pe numele lui, spre deosebire de
Sameday (`status-sync`) sau Cargus (`GetDeltaEvents`). De aici plafonul mai mic pe rulare (60, nu
120) si jetonul luat o singura data pe magazin.

⚠ Forma interogarii a fost **probata pe PostgREST inainte de a fi scrisa**: identica pe coloanele
Woot intoarce 138 de randuri adevarate; pe coloanele Colete intoarce zero fiindca zero AWB-uri s-au
emis vreodata. Vezi `zero-randuri-nu-e-succes`.

Migratia `2027-01-20-colete-isi-urmareste-coletul.sql`, aplicata.

### I-4. ⚠ O coloana stearsa, dar niciodata scrisa

`colete_unique_id` exista in schema din prima zi si dezlegarea o STERGE, dar **nimic n-o scria
vreodata**: era goala pe fiecare comanda. `uniqueId`-ul lor statea, sub alt nume, in
`colete_order_id`.

Nu se poate sterge niciuna: `colete_order_id` e citita de ruta de eticheta, de fereastra si de
`legaturaVie` din registru. Deci de azi se scriu amandoua, iar cititorii noi o prefera pe cea cu
numele adevarat si cad pe cealalta pentru comenzile vechi.

⚠ Conteaza fiindca documentatia lor spune ca numai `uniqueId` merge MEREU: „If the order has no
awb, only searching by the uniqueId will work."

---

## Ce era deja bine, si nu se atinge

- **Securitate.** `colete_config.client_secret` si `token` se decripteaza doar in vederea privata;
  configul se citeste cu rol de serviciu abia DUPA dovedirea proprietatii magazinului; ruta de
  eticheta trece prin aceeasi poarta.
- **Registrul de operatii externe.** Emiterea trece prin `cuRegistru` cu `legaturaVie`, iar un `2xx`
  fara `awb`/`uniqueId` arunca `eroareNesigura` in loc sa inchida slotul cu referinta goala.
- **Poarta AWB.** `poartaAwbPropriu` se cheama INAINTE de orice apel la curier.
- **Cotarea vie la checkout**, cu o optiune per serviciu al brokerului, `coleteServiceId` dus pana
  pe comanda si preselectat in fereastra de AWB. Pe regim net se cere `price.noVat` si se verifica
  la rulare; necredibil inseamna „nu stim", deci oferta se arunca.
- **extraOptions** pentru ramburs (numerar sau in cont, cu IBAN si titular validat la salvare),
  asigurare, deschidere la livrare, sambata si referinta interna.

---

## Deschis

### D-1. ⚠ Webhookul lor de stare (extraOption 1), pe care ei il recomanda

`{ id: 1, url, key }` pus pe comanda face ca ei sa trimita un POST la fiecare schimbare de stare.
E **mecanismul pe care documentatia lor il indica pentru timp real**, tocmai fiindca `order/status`
e plafonat la o cerere pe ora.

Nu s-a facut azi, si motivul e pe fata: cere o ruta PUBLICA noua, o cheie per magazin si o paza
impotriva reluarii, adica exact genul de suprafata pe care n-as vrea s-o deschid fara un cont pe
care s-o pot proba. Cronul acopera intre timp aceeasi nevoie, mai lent.

### D-2. Soldul contului nu se verifica inainte de emitere

Colete Online e **preplatit** (`/user/balance`, iar modulul lor are chiar un link de reincarcare).
Soldul se citeste azi doar la „Testeaza conexiunea". Cu sold insuficient, emiterea cade la ei, cu
mesajul lor; o verificare locala ar spune-o mai devreme si mai clar. Aceeasi forma ca la Woot, unde
creditul se verifica inainte de emitere.

### D-3. Validarea telefonului si a e-mailului inainte de emitere

Ei au `validate/phone/{...}` si `validate/email/{...}`, folosite de modulul lor. Azi aflam ca
datele destinatarului nu sunt bune abia din refuzul emiterii.

### D-4. Punctele lor (`domesticToPoint`), excluse deliberat din iulie

`shipping-points/list/{county}` si `specific.domesticToPoint` exista. Au fost lasate afara fiindca
alegerea explicita a punctului nu era documentata public, iar `showClosest` alege automat, ceea ce
e riscant fara un cont pe care sa-l probezi. Ramane valabil.

### D-5. ⚠⚠ Nedovedit live, si aici mai mult decat oriunde

**Niciun magazin n-are macar credentiale.** Zero AWB-uri, zero cotari, zero apeluri catre ei in
toata viata platformei. Tot ce scrie mai sus se sprijina pe specificatia lor, pe colectia lor
Postman si pe modulul lor, nu pe un colet care a plecat.

---

## Nota, cinstit

**9/10.**

Cotarea vie, emiterea, eticheta, extraOptions si registrul erau intregi din iulie; de azi platforma
stie si ce se intampla cu coletul dupa ce pleaca, si stie sa-l anuleze la ei.

S-au inchis doua lucruri pe care le crezusem imposibile si una pe care o faceam pe jumatate:
anularea CHIAR exista si e cablata (cu `success: false` tratat ca refuz, nu ca reusita);
urmarirea CHIAR are coduri, si comanda se muta pe ele; iar diacriticele nu se mai scot dintr-un
singur camp al unei cereri in care celelalte le pastreaza.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live** (D-5), si aici cantareste cel mai mult din toti cinci curieri: la Woot sunt
   172 de AWB-uri, la Sameday unul, la Cargus niciunul dar macar doua magazine configurate; aici
   **nici macar credentiale**. Nu exista niciun apel catre ei in istoria platformei.
2. **Webhookul lor** (D-1) e mecanismul pe care ei il recomanda, si nu l-am facut: cere o ruta
   publica si o cheie per magazin, adica o suprafata pe care n-as deschide-o fara un cont pe care
   s-o pot proba.
3. **Harta de stari e partiala**, si nu din lene: tabelul lor nu e publicat, iar cele zece coduri
   vin dintr-un singur exemplu. Cronul strange restul din trafic.

⚠ Si o lectie care nu e despre cod: doua dintre defectele de azi au existat fiindca o afirmatie
FALSA („n-au anulare") a fost scrisa in iulie in cod si in memorie, si de atunci nimeni n-a mai
verificat-o. Vezi `docs/curieri/` si nota din `documentatia-curierilor-dispare-de-pe-disc`.
