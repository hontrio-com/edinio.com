# Woot.ro: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`.

**Documentatia oficiala:** <https://ws.woot.ro/latest/> (Swagger UI).
Specificatia OpenAPI 3.0 se ia direct de la <https://ws.woot.ro/latest/assets/webservice.json>
(„Woot.ro WEBSERVICE 1.0.0", 22 de cai). ⚠ Pagina de documentatie e un invelis care isi incarca
continutul din JavaScript: citita cu un simplu `fetch`, iese GOALA. Se ia fisierul JSON.

**Cod:** `src/lib/woot.ts`, `src/lib/actions/woot.actions.ts`, ramurile Woot din
`src/lib/actions/shipping.actions.ts` si `src/lib/actions/bulk-orders.actions.ts`,
`src/components/dashboard/WootConfigClient.tsx` si `WootAwbModal.tsx`.
**Probe:** `src/lib/woot.test.ts`.

---

## ⚠ De ce Woot e primul

Masurat in productie pe 15.09.2026 (`operatii_externe`):

| curier | AWB reusite | AWB esuate |
| --- | --- | --- |
| **woot** | **172** | **7** |
| dpd | 3 | 1 |
| sameday | 1 | 0 |
| ceilalti 14 | 0 | 0 |

**Woot duce 96% din toate expedierile platformei.** Restul integrarilor n-au emis niciodata niciun
AWB. Ordinea de lucru se ia de aici, nu din gravitatea declarata de un audit extern.

⚠ Si o nuanta care conteaza pentru cotare: cele 226 de comenzi Woot merg pe **pret FIX de zona**,
nu pe cotatie live (`auto_price` e pornit la trei perechi magazin-curier in toata platforma).

---

## Ce foloseste platforma din API-ul lor

| Calea lor | Metoda | Folosim | Unde |
| --- | --- | --- | --- |
| `/account/authorize` | POST | **da** | `getWootToken` |
| `/account/info` | GET | **da** | `getAccountInfo`, doar la testul de conexiune |
| `/account/credit` | GET | **da** | `getCredit`, doar la testul de conexiune |
| `/general/counties` | GET | **da** | `fetchCounties`, cu cache in memorie 6h |
| `/general/cities` | GET | **da** | `fetchCities`, cu cache in memorie 6h |
| `/general/locations` | GET | **da** | `getLocations` (lockere si puncte) |
| `/orders/prices` | POST | **da** | `getPrices` (cotare) |
| `/orders` | POST | **da** | `createOrder` (emitere) |
| `/orders/{id}/awb` | GET | **da** | `getOrderAwb` (eticheta) |
| `/orders/{id}` | DELETE | **da** | `cancelWootOrder` (anulare) |
| `/orders/{id}/history` | GET | **NU** | ⚠ urmarirea coletului. Vezi D-1. |
| `/repayments` | GET | **NU** | ⚠ rambursurile incasate. Vezi D-2. |
| `/repayments/reports` | GET | **NU** | rapoarte de decont. Vezi D-2. |
| `/orders` | GET | nu | lista cu filtre; ar ajuta la reconciliere |
| `/orders/{id}` | GET | nu | starea unei comenzi |
| `/general/services` | GET | nu | catalogul de servicii |
| `/general/couriers` | GET | nu | curierii din spatele brokerului |
| `/general/countries` | GET | nu | nefolosit, tara e fixata la 189 (RO) |
| `/addresses/*` | toate | nu | agenda de adrese a contului; noi trimitem adresa intreaga |
| `/account/login` | POST | nu | folosim `authorize` cu chei, nu user si parola |

---

## Inchis

### I-1. Motivul lor nu se mai pierde pe ramura de 200 (`5af4f882` si urmatorul)

Woot raspunde **HTTP 200 si cand NU a creat nimic**: adevarul sta in campul `success` din corp.
Extragerea motivului exista, dar traia ingropata in ramura de raspuns nereusit a lui `wootReq`, deci
se aplica numai la 4xx si 5xx. Pe ramura de 200, cele trei plicuri (creare, eticheta, anulare)
aruncau propozitia noastra si ARUNCAU motivul lor.

⚠ Nu e ipoteza: **toate cele sapte esecuri reale** din viata platformei poarta chiar mesajul lor,
„Nu aveti suficient credit pentru a finaliza comanda", adica exact mesajul din care comerciantul stie ce
sa faca. Acum motivul se pune la coada propozitiei noastre (a noastra spune ce s-a intamplat la noi,
a lor spune de ce, la ei), iar cand ei tac propozitia ramane intreaga, fara doua puncte orfane.

Extras in `motivulWoot()`, folosit in toate cele patru locuri. **7 probe, 3 mutanti prinsi.**

### I-2. Regimul de plata al contului se poate alege

Pana atunci nimeni nu trimitea `payment_method`, deci toate magazinele plecau pe `credit`. Un
magazin cu cont **pe termen** ar fi esuat la nesfarsit exact cu mesajul din cele sapte randuri.

⚠ **`card` NU se ofera in panou, si asta e scris la EI**, nu e o precautie de-a noastra: la
`POST /orders`, `awb_number` e documentat „for credit/term payments", iar `payment_id` e „for card
payments". Pe card nu intorc niciun AWB, ci un identificator de plata care cere un drum de plata pe
care platforma nu-l are. Oferit, comerciantul ar fi emis o expediere fara eticheta si fara numar, si
ar fi aflat abia cand se ducea sa tipareasca. **3 probe**, una chiar pe sursa panoului.

### I-3. O garda moarta care mintea

`if (!result.success) throw eroareRefuz("Creare AWB esuata")` in `createWootAwb` nu se putea executa
niciodata: `createOrder` arunca deja inainte, deci tipul lui intoarce `success: true`. Paguba nu era
codul mort, ci **nota**: spunea ca acolo se tine reincercarea libera, deci cine venea sa
imbunatateasca mesajul l-ar fi schimbat intr-un loc care nu ruleaza.

### I-4. Plicul de succes (13.09.2026, anterior)

`createOrder` fara `order_id` scria sirul literal „undefined" pe comanda; `cancelWootOrder` isi
arunca rezultatul, deci un refuz golea comanda si raporta „anulat"; `getOrderAwb` fara `pdf` trimitea
un PDF de zero octeti. Toate trei inchise, cu probe.

### I-5. Emiterea dubla

`createWootAwb` nu citea deloc comanda inainte de a chema Woot: singura oprire era o proprietate SSR
in browser. Doua file, un dublu-click sau un POST direct produceau **doua AWB-uri reale, platite**.
Inchis cu registrul de operatii externe (`cuRegistru` + `cheieOperatie`), plus index unic partial pe
`(business_id, cheie)` pentru starile vii. ⚠ `esuat` NU ocupa cheia, dinadins: reincercarea dupa o
cadere ramane libera. De aceea cele sapte esecuri apar ca sapte randuri pe cinci chei, si e corect.

### I-6. Tokenul se cheieste si pe secret

Cheiat doar pe `public_key`, cache-ul intorcea tokenul valid si pentru un `secret_key` GRESIT: dupa
o rotire de chei, ecranul scria „conectat" si defectul iesea a doua zi, la prima emitere.

---

## Deschis

### D-1. ⚠ Urmarirea coletului NU exista deloc: CEL MAI MARE GOL

Woot ofera `GET /orders/{order_id}/history`, cu istoricul de stari (`status_id`, `comment`,
`added`). **Nu-l chemam niciodata.** Nu exista nicio ruta de cron pentru Woot, desi FAN si Sameday
au. Adica pentru 96% din expedierile platformei nu stim niciodata unde e coletul, iar cumparatorul
nu primeste nicio instiintare.

De facut: ruta de cron, harta de stari catre starile noastre, intrare in `vercel.json`, si rotatia
„cele neintrebate de cel mai mult timp intai", dupa tiparul lui `sameday-tracking`.

### D-2. Rambursurile incasate nu se reconciliaza

`GET /repayments` si `/repayments/reports` dau banii de ramburs pe care Woot i-a incasat si
virat. Nu le chemam. Pe un magazin cu sute de comenzi cu ramburs, nimic din platforma nu spune daca
banii au fost chiar virati. E bani, nu comoditate.

### D-3. `declared_value` pe colet nu se trimite

Specificatia are `parcels[].declared_value` („Declared value for customs (international)"). Noi
trimitem `insurance` la nivel de comanda, dar nu `declared_value` pe colet. De verificat daca conteaza
pentru expedierile internationale prin ei.

### D-4. Creditul nu se verifica inainte de emitere

`getCredit` se cheama doar la testul de conexiune. Toate cele sapte esecuri ar fi putut fi prinse
INAINTE de a chema emiterea, cu un mesaj care spune si cat mai lipseste. ⚠ Costa un apel in plus pe
fiecare AWB, deci e un schimb, nu o imbunatatire evidenta: de cantarit.

### D-5. Nedovedit in sandbox

Nu avem credentiale de sandbox Woot. Tot ce se poate spune despre drumurile neumblate e „respecta
documentatia", nu „merge". Vezi `AUDIT-CURIERI-RASPUNS-2026-09-15.md`, sectiunea 6.

---

## Conformitate cu documentatia lor

Verificat pe specificatia OpenAPI pe 15.09.2026.

| Ce cere documentatia | Starea noastra |
| --- | --- |
| `service_id`, `sender`, `receiver`, `parcels` obligatorii la `POST /orders` | ✔ toate trimise |
| `parcels[].type` enum `envelope` sau `package` | ✔ |
| `parcels[].content` obligatoriu | ✔ |
| `length`/`width`/`height`/`weight` cerute pentru `package` | ✔ prin `coletePentruWoot` |
| `payment_method` enum `credit`/`card`/`term`, implicit `credit` | ✔ credit si term; ⚠ card exclus dinadins (vezi I-2) |
| `awb_number` doar pentru credit/term; `payment_id` pentru card | ✔ tratat prin excluderea lui card |
| `receiver` accepta ori `address_id`, ori adresa intreaga (`oneOf`) | ✔ trimitem adresa intreaga |
| `location_id` pentru servicii la punct | ✔ |
| telefon in format international | ✔ `wootPhone` pliaza `07…` la `+407…` |
| eroarea sta in `error` sau `message`, iar 200 poate insemna esec | ✔ de la I-1 |

---

## Porti, la ultima atingere

| Poarta | Rezultat |
| --- | --- |
| Suita de probe | 7892 din 7892 |
| TypeScript | curat |
| Build | curat |
| Clichet de lint | neschimbat: 83 erori, 129 avertismente |
| Banc de mutanti, motivul lui Woot | 3 din 3 |

---

## Nota, cinstit

**Nu e 10/10 azi.** Securitatea si corectitudinea drumului umblat sunt bune si probate; ce lipseste e
**functionalitate**: urmarirea (D-1) si reconcilierea rambursurilor (D-2). Pana la ele, nota onesta e
**7/10**: integrarea emite, anuleaza si tipareste corect, dar dupa ce coletul pleaca platforma nu mai
stie nimic despre el.
