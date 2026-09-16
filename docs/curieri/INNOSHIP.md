# Innoship: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al treisprezecelea.

**Ce sunt ei:** al zecelea transportator si al patrulea BROKER, cu **~230 de curieri**.

⚠ **Cel mai bun contract din platforma**, si merita spus de fiecare data: raspunsuri documentate,
nomenclatoare publicate, webhook cu exemplu, credentiale de test, si DOUA endpointuri de proba care
nu creeaza nimic (`POST /api/Order/validate` si `/simulate`).

**API-ul real:** doua gazde, cu calendar. `api.innoship.com` pentru scrieri, `query.innoship.com`
pentru citiri; citirile se retrag de pe `api` la 30.06.2027. ⚠ `api-version` se trimite **si in
adresa, nu doar ca antet**: Swagger-ul il declara `in: query, required: true`, iar articolul lor de
suport pomeneste doar antetul.

**Referinta autoritara:** cele doua specificatii OpenAPI, aduse intregi pe 16.09.2026:

| fisier | marime | cai | scheme |
| --- | --- | --- | --- |
| `api.innoship.com/swagger/v1/swagger.json` | 327 KB | **43** | **89** |
| `query.innoship.com/swagger/v1/swagger.json` | 50 KB | **18** | 24 |

⚠ **Specificatia a CRESCUT** de cand s-a scris integrarea: 40 → 43 de cai si 83 → 89 de scheme pe
`api`, 17 → 18 pe `query`.

**Cod:** `src/lib/innoship/` (`client.ts`, `expediere.ts`, `preturi.ts`, `statusuri.ts`, `puncte.ts`,
`suprapunere.ts`, `aplica-urmarire.ts`), `src/lib/actions/innoship.actions.ts`, cronul
`src/app/api/cron/innoship-tracking`, webhookul `src/app/api/innoship/track`, ferestrele
`InnoshipAwbModal.tsx` si `InnoshipConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu Innoship configurat | **ZERO** (din 129) |
| AWB-uri emise vreodata | **ZERO** |
| Operatii `innoship` in registrul de operatii externe | **ZERO** |

⚠ **Zero curat.** Singura masura ramane conformitatea cu specificatia lor.

---

## ⚠⚠ Defectul gasit: id-ul de la CURIER nu e id de Innoship

Raspunsul lui `GET /api/Location/FixedLocations` e **singurul contract nedocumentat din tot API-ul
lor**, si asta ramane adevarat si azi: reverificat in specificatie, are
`responses: {200: {description: "OK"}}`, fara nicio schema. De aceea randul se citeste TOLERANT,
cu o lista de nume cu putinta, iar butonul Diagnostic arata cheile reale.

Lista aceea avea la coada `courierFixedLocationId`. Si tocmai argumentul scris in cod, cel care il
pune pe `fixedLocationId` primul, il exclude pe celalalt:

> „`fixedLocationId` sta primul dinadins: el e chiar numele campului pe care `OrderRequest.addressTo`
> il asteapta inapoi."

Numai ca `OrderRequest.addressTo` are **AMANDOUA** campurile, separat si cu nume diferite:
`fixedLocationId` **si** `courierFixedLocationId`. Deci specificatia lor **dovedeste** ca sunt doua
lucruri, nu doua nume pentru acelasi lucru.

Folosit ca rezerva, id-ul de la CURIER ajungea in campul lui Innoship. Ce urmeaza e ori un refuz
(vizibil, si atunci e bine), ori o expediere catre alt punct decat cel ales de cumparator, cu HTTP
200 si cu omul trimis sa ridice de unde nu e nimic.

⚠ Aceeasi clasa cu „acelasi camp, doua feluri de id" de la Shipo si SmartShip, doar ca acolo capcana
e scrisa in documentatia lor, iar aici se vede numai punand alaturi doua parti ale specificatiei.

**Leacul, si de ce arata asa:**

- `courierFixedLocationId` iese din lista de rezerve. Un rand care are DOAR id de curier nu poate fi
  folosit, deci ramane afara. ⚠ **Lipsa lui din lista SE VEDE** (puncte mai putine), pe cand un punct
  gresit nu se vede deloc.
- ⚠ **Si nu se pierde tacut:** `puncteDoarCuIdDeCurier()` numara randurile acelea, iar numarul ajunge
  in Diagnostic, langa cheile reale. Zero inseamna ca excluderea nu costa nimic. Un numar mare
  inseamna ca nomenclatorul lor arata altfel decat presupunem, si atunci raspunsul **nu** e sa punem
  la loc campul gresit, ci sa intrebam ce inseamna.
- Panoul spune de ce, in cuvintele comerciantului, si cere lista de campuri.

---

## Ce am reverificat din memorie, si ce a iesit

| afirmatie | azi |
| --- | --- |
| „raspunsul lui `FixedLocations` e singurul contract nedocumentat" | ⚠ **inca adevarat**, verificat in specificatia proaspata |
| „`api-version` se trimite si in adresa, nu doar ca antet" | adevarat: `in: query, required: true` |
| „doua gazde, cu calendar: `api` scrie, `query` citeste" | adevarat, si codul se naste migrat |
| „cheia ofertei are TREI parti: `courierId` + `serviceId` + `optionId`" | adevarat |
| „`payment` se trimite `Sender`" | ⚠ verificat pe enum: `PaymentType` e `["Sender","Recipient","ThirdParty"]`. Corect |
| „urmarirea se face dupa ID-UL NOSTRU (`by-external-order-id`), deci fereastra de emitere se inchide cu o CITIRE" | adevarat, si ramane cea mai valoroasa proprietate a integrarii |

---

## Acoperirea specificatiei: 8 din 61 de cai

Folosite: `POST /api/Price`, `POST /api/Order`, `POST /api/Order/validate`,
`DELETE /api/Order/{courierId}/awb/{awbNo}`, `GET /api/Label/by-courier/{courierId}/awb/{awb}`,
`GET /api/Courier/All`, `GET /api/Location/FixedLocations`, `POST /api/Track/by-external-order-id`.

Cele 53 nefolosite nu sunt o lipsa: sunt functionalitati pe care platforma nu le are (vouchere,
manifeste, comenzi offline, SMS-uri, administrarea locatiilor de client). Trei merita totusi numite,
fiindca ar avea sens la noi:

- ⚠ **`POST /api/Track/by-awb/with-return` si `POST /api/Track/return/by-awb`**, plus
  `GET /api/Order/ReturnAwbInfo/{courierId}/{returnAwb}`: urmarirea RETURULUI, cu AWB propriu. Azi
  urmarim doar tura. La Sameday exact asta a fost ultima bucata facuta.
- **`GET /api/Location/Postalcodes/...`**: nomenclator de coduri postale. Ar muta erorile de adresa
  de la „primul AWB" la „configurare", ca la GLS si FAN.
- **`POST /api/Courier/RequestPickup`**: chemarea curierului.

⚠ Si doua campuri din `OrderRequestExtra` pe care nu le trimitem si care ar putea conta cand apare
trafic: `reference1`..`reference4` (referinte proprii, care ar putea purta numarul comenzii pe
eticheta) si `uitCode` (codul UIT de e-Transport, pentru transporturile care il cer prin lege).

---

## Ce ramane deschis, si de ce

1. **Nedovedit live (D-5).** Zero magazine, zero expedieri. ⚠ Aici doare mai mult decat la altii:
   forma raspunsului de puncte se afla DOAR cu o cheie de cont, iar pana atunci lista de nume ramane
   o presupunere tolerata. Butonul Diagnostic exista tocmai ca sa o scurteze la adevar in prima zi.
   Ei dau credentiale de test la `sales@innoship.com`.
2. **Urmarirea returului** (trei cai pentru ea in API-ul lor): reala, si nefacuta.
3. **Statusul rambursului nu misca `payment_status`.** Se pastreaza si se semnaleaza. Aceeasi
   hotarare ca la Posta si eColet: mutarea automata a banilor asteapta date reale.
4. **Nomenclatorul de coduri postale**: ar muta erorile de la primul AWB la configurare.

---

## Nota, cinstit

**9,5/10.**

Integrarea era deja foarte buna, si se vede in locurile unde alte integrari au cazut: cheia ofertei
are toate trei partile (defectul `optionKey` a fost prins inainte sa ajunga in productie),
`innoship_courier_id` cade pe curierul CERUT cand raspunsul nu-l aduce (fara el, AWB-ul n-ar mai
putea fi nici tiparit, nici anulat), webhookul raspunde mereu 200 si isi ia secretul din adresa
fiindca ei nu semneaza nimic, iar `webhook_secret` se naste o singura data.

Ce s-a inchis azi e un lucru pe care nu-l putea vedea nici `tsc`, nici cele 8.225 de probe: **o
lista de rezerve isi contrazicea propriul argument**. Campul pus ultim era exact cel pe care
specificatia lor il declara, negru pe alb, ca fiind altceva.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live**, si aici cantareste concret: singurul contract nedocumentat din tot API-ul lor
   e chiar cel de care atarna livrarea la punct.
2. **Urmarirea returului** e o functionalitate reala pe care ei o expun pe trei cai si noi n-o citim.
3. **Rambursul nu misca `payment_status`**, dinadins, si ramane o faza separata.

**Probe:** 10 noi. Banc de mutanti **7 din 7**, cu mutantul pe APELANT in trei locuri: actiunea de
diagnostic, panoul care arata numarul, si constructorul de adresa la emitere. `tsc` curat,
**8.235 de probe verzi**, build OK, fara migratie.
