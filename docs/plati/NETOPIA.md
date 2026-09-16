# Netopia Payments: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare integrare pana cand e 10/10 din
> toate punctele de vedere. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Prima integrare de PLATI. Aici o greseala nu inseamna o factura urata: inseamna marfa livrata
> fara bani, sau bani luati de doua ori.

**Referinta autoritara:** specificatia lor **OpenAPI 3.0**, `https://secure.sandbox.netopia-payments.com/spec`,
citita pe 16.09.2026: **22 de cai, 66 de scheme**, servere `secure.sandbox.netopia-payments.com` si
`secure.mobilpay.ro/pay`.

⚠ **Paginile de documentatie NU contin specificatia.** `doc.netopia-payments.com` are pentru v2 doar
cinci pagini (intro si patru despre pornirea platii), si **niciuna despre IPN**. Sitemap-ul trimite
catre `docs.` (cu „s"), gazda care azi raspunde „Site not found, GitHub Pages". Specificatia adevarata
se ia de la adresa de mai sus, pe care intro-ul o pomeneste in treacat. Acelasi tipar ca la Woot,
FedEx si Colete Online.

**Cod:** `src/lib/netopia.ts`, `src/lib/netopia-ipn.ts`, `src/app/api/netopia/start/route.ts`,
`src/app/api/netopia/notify/route.ts`, `src/lib/actions/netopia.actions.ts`, `NetopiaConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| magazin | comenzi | platite | lei incasati | ultima |
| --- | --- | --- | --- | --- |
| `suporti-numar` | 27 | 22 | **1.841,11** | 14.09.2026 |
| `okxi` | 8 | 2 | 71,76 | 19.08.2026 |
| `caian-textile` | 4 | 0 | 0 | 25.07.2026 |
| `mokka` | 1 | 0 | 0 | 01.08.2026 |

**40 de comenzi, 24 platite, ~1.913 lei.** Netopia e procesatorul cu cel mai mult trafic real din
platforma (Stripe: 3 magazine; iPay, Klarna, Revolut: zero).

---

## ⚠⚠ 1. Statusul 12 nu inseamna „anulat", si anularea omora comanda

Codul spunea `12 = cancelled` si anula comanda. Afirmatia venea din migrarea v1 to v2 si **nu e
sustinuta de nimic din v2**. Specificatia lor o contrazice de DOUA ori, in doua scheme diferite:

* `NotifyRequest.payment.status` si `PaymentNotify.status`: „12 = **invalid account**";
* `Payment.status` (raspunsul de pornire): „12 - **rejected**".

Adica **plata a fost refuzata de banca**: card gresit, cont invalid, fonduri insuficiente. Nu e o
hotarare a cumparatorului.

**Ce costa anularea, si e o inlantuire din chiar codul nostru:**

1. IPN cu status 12 → `aplica_tranzitia_comenzii(..., "cancelled")` → stocul si cuponul se elibereaza;
2. `/api/netopia/start` refuza sa porneasca o plata pe o comanda cu `status === "cancelled"`;
3. deci cumparatorul **nu mai poate reincerca niciodata**. Un card refuzat o data inchide comanda
   definitiv, tacut.

⚠ **Purtarea corecta era deja SCRISA in platforma, pentru exact aceeasi situatie.** Cronul
`discount-release`, despre plata online neterminata: *„Ce NU face: nu anuleaza si nu atinge in niciun
fel comanda. Comanda neplatita ramane a comerciantului, cu totul."* Cine abandoneaza pe pagina bancii
ramane cu comanda in asteptare; cine are cardul refuzat era tratat invers.

Acum 12 nu misca nimic, iar ruta scrie un avertisment (`warning`, nu `critical`: un card refuzat e o
intamplare obisnuita intr-un magazin, iar o alarma tocita nu mai e citita cand chiar conteaza) si
raspunde `errorCode: 0`, ca Netopia sa nu repete notificarea la nesfarsit.

### ✅ DOVEDIT PE SANDBOX-UL LOR, in aceeasi zi

Proprietarul a conectat un cont de sandbox pe magazinul `itp-blk`. Cu cardurile de test din **chiar
specificatia lor**, `POST /payment/card/start` a raspuns:

| card | status | mesajul lor |
| --- | --- | --- |
| valid, fara 3-D Secure | **3** | `00 Approved` |
| **CVV gresit** | **12** | `21 Invalid CVV` |
| numar de card inexistent | **12** | `17 Invalid card number` |
| card expirat | **1** | `19 Expired card` |

⚠⚠ **Deci 12 e refuz de card, confirmat de doua ori, si nu e un cod rar: e chiar ce produce un CVV
tastat gresit.** Adica cea mai obisnuita greseala a unui cumparator ii omora comanda, definitiv.
Defectul nu era teoretic; asteptase doar un client care greseste trei cifre.

⚠ **Si s-a vazut un cod NOU, `1` (card expirat), care nu apare nicaieri in specificatia lor.** Codul
nostru il lasa sa nu miste nimic, ceea ce e purtarea corecta, si nu se mapeaza: nu stim daca `1`
inseamna intotdeauna refuz sau e o stare intermediara (raspunsul purta si o pagina de plata). De
acum, codurile nerecunoscute se scriu in jurnal cu tot cu mesajul lor, ca harta sa creasca din
**trafic**, nu din presupuneri. Acelasi drum ca la Woot si Cargus.

⚠ Ce NU s-a putut proba asa: cele 14 comenzi Netopia anulate din productie au, cele mai multe,
acelasi `updated_at` la milisecunda, deci sunt anulari in lot facute de comerciant. Nu se poate
arata ca un IPN cu 12 a anulat vreuna; se poate arata doar ca ar fi facut-o.

---

## ⚠⚠ 2. Secretul care semneaza notificarile putea lipsi in tacere

IPN-ul v2 al lor **nu poarta nicio semnatura**: schema `NotifyRequest` are doar `payment` si `order`.
Deci autentificarea e a noastra, prin jeton legat de comanda si pus in `notifyUrl` la pornire. Ideea
e buna, si jetonul nu ajunge la cumparator (`notifyUrl` se compune pe server si pleaca doar catre ei;
browserului i se intoarce numai `redirectUrl`).

Dar secretul se citea asa:

```ts
return process.env.NETOPIA_IPN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
```

⚠⚠ Cu `""`, `createHmac` **nu se plange**: scoate un HMAC perfect valid, pe o cheie pe care o stie
oricine. Iar id-ul comenzii e public, e chiar in adresa de confirmare. Deci fara nicio variabila de
mediu, **oricine putea calcula jetonul si trimite o notificare de „platit" pentru propria comanda**:
marfa pleaca, factura se emite, banii nu vin. Si nimic nu s-ar fi vazut, fiindca un HMAC pe cheie
goala arata identic cu unul pe cheie adevarata.

⚠ **In productie gaura NU e deschisa**: `SUPABASE_SERVICE_ROLE_KEY` exista (chiar rutele astea il
folosesc). Ce s-a reparat e ca protectia nu mai poate DISPAREA la o redenumire de variabila.

⚠⚠ **Si abia asa devine probabila.** Incarcatorul de probe nu aduce niciun `.env`, deci pana azi si
semnatorul, si verificatorul lucrau cu `""`: o proba care ar fi spus „un jeton falsificat e respins"
ar fi trecut VERDE fara sa apere nimic, fiindca si falsificatorul folosea aceeasi cheie goala. Proba
scrisa acum **isi pune singura un secret**, si are mutant pe caderea inapoi.

Acelasi tipar ca `semnaturaCheii` din `lib/utils/cheie-neghicibila.ts`, adus la fail-closed pe
04.08.2026. Modulul Netopia ramasese pe dinafara.

---

## Era sa repar ceva BUN: unitatea sumei

`PaymentNotify.amount` are descrierea *„amount in decimal units, i.e. 1234 = 12.34"*, care se citeste
ca **bani (minor units)**. Daca ar fi asa, garda noastra de suma ar fi cod mort: `1234 < 12.34` e
fals, deci nu s-ar aprinde niciodata.

⚠ **Exemplele lor din aceeasi specificatie o dezmint:** `/sandbox/notify` trimite `amount: 0.1` cu
`currency: "RON"` (0,1 lei, nu 0,1 bani), iar `/payment/cardpresent/sale` raspunde cu `amount: 100.5`.
Sunt **lei cu zecimale**. Descrierea e prost formulata, probabil copiata de la un API in minor units.

Deci garda compara ce trebuie si ramane neatinsa. **Descrierea in proza a fost cat pe ce sa ma faca
sa stric o aparare care functioneaza; exemplele au lamurit-o.**

---

## Ce am verificat si era deja bine

| ce | ce e in cod |
| --- | --- |
| notificarea e autentificata | jeton HMAC legat de comanda, verificat cu `timingSafeEqual`, **inainte** de orice citire sau scriere |
| suma incasata | comparata cu totalul comenzii, cu toleranta de un ban; sub total se REFUZA cu `errorCode: 1` |
| repetarea notificarii | `errorCode: 0` doar la succes; orice esec de scriere raspunde `1`, deci Netopia repeta (mai bine o repetare decat o plata pierduta) |
| plata dubla | `finalizeazaPlataComenzii` avanseaza din `WHERE` (`.eq("status","pending").neq("payment_status","paid")`), deci o notificare repetata nu poate dubla nimic |
| starea comenzii | prin `aplica_tranzitia_comenzii`, deci anularea elibereaza si stocul, nu doar cuponul |
| rafale pe pornire | plafon pe IP (10/minut) **si** plafon durabil pe COMANDA (5/ora), ca un atacator sa nu poata bloca platile intregului magazin |
| adresa trimisa bancii | din amandoua familiile de campuri (`street`+`street_no` si `address`); pana pe 13.09 pleca litera „-" la 24% din comenzi, folosita la scorul de frauda |
| badge-ul lor din vitrina | sanitizat cu allowlist de etichete, **doar https**, si iframe limitat la domeniile lor |
| secretele | `pos_signature` si `api_key` se pastreaza mascate la salvare; configul vechi se citeste cu service role |
| coduri necunoscute | nu misca nimic. Tacerea pe necunoscut e purtarea corecta cand de partea cealalta sunt bani |

---

## ✅ Fluxul CAP LA CAP, parcurs pe productie (16.09.2026)

Magazinul `itp-blk`, credentiale **sandbox** ale proprietarului, doua comenzi de 1 leu marcate
`#PROBA-NETOPIA-1` si `#PROBA-NETOPIA-2`. Pornirea prin **ruta noastra reala** de productie
(`POST /api/netopia/start`), plata pe **pagina lor gazduita**, notificarea catre **productie**.

| ora | ce s-a intamplat | status | ce a facut comanda |
|---|---|---|---|
| 19:15:07 | IPN cu jeton calculat local, comanda inexistenta | 3 | semnatura **TRECE**, „Order not found" |
| 19:15:08 | IPN cu jeton inventat | 3 | **403**, „Invalid signature" |
| 19:26:55 | IPN comanda 1, card valid | **3** | `pending/unpaid` -> **`confirmed/paid`** |
| 19:28:17 | IPN comanda 2, **CVV gresit** | **12** | **nimic**, plus `warning` in jurnal |
| 19:28:53 | reincercare pe aceeasi comanda | | ruta o **accepta**, nu e moarta |
| 19:29:44 | IPN comanda 2, CVV bun | **3** | `pending/unpaid` -> **`confirmed/paid`** |
| 19:31:57 | IPN dupa `POST /operation/credit` | **8** | prins de colectorul de coduri necunoscute |

⚠⚠ **Randul de la 19:28:17 e dovada reparatiei zilei.** Inainte, statusul 12 anula comanda, iar
`/api/netopia/start` refuza sa mai porneasca o plata pe o comanda anulata: un CVV tastat gresit,
cea mai obisnuita greseala a unui cumparator, omora vanzarea pe veci. Acum comanda a stat pe loc si
**a doua incercare a trecut**.

⚠ **`ntpID` ramane ACELASI intre incercari** (3022510 si la refuz, si la reusita). Deci coloana
`netopia_ntp_id` e un maner stabil, iar o rambursare tintita pe ea nu poate nimeri o incercare
veche si refuzata.

⚠ **Ei trimit UN SINGUR IPN, la deznodamant.** Masurat cu cardul lor 3-D Secure
(`9900009184214768`): pornirea a raspuns `status 1` cu pagina de plata, pagina de autentificare a
fost trecuta, si abia atunci a venit un IPN, cu `status 3`. La etapa „3-D Secure cerut" **nu vine
nicio notificare**.

---

## ⚠⚠ 3. Specificatia lor minte de DOUA ori, si amandoua m-au costat

**a) `15` nu e rambursare, e 3-D Secure.** Scrisesem chiar eu, in dimineata aceleiasi zile, ca
*„15 (rambursare) NU apare in specificatia v2"* si ca maparea e *„in directia sigura"*. Ambele false:

* **Apare.** Schema `Payment` (liniile 1724 si 2391 din specul lor) da lista intreaga:
  `3 paid | 5 confirmed | 12 rejected | 15 **3-D Secure authentication required**`. Citisem doar
  schema `PaymentNotify`, care enumera trei coduri, si am tras concluzia ca al patrulea nu exista.
* **Nu e in directia sigura.** `refunded` face parte din `BANII_S_AU_INTORS`
  (`lib/orders/marfa-a-plecat-fara-bani.ts`), deci o comanda etichetata gresit „rambursata" e
  **SCOASA** din semnalul de marfa plecata fara bani. Maparea nu doar mintea: **amutea chiar plasa
  intinsa in aceeasi zi** pentru cazul in care banii nu intra.

**Rambursarea e `8`**, masurat: `POST /operation/credit` a raspuns `status 8`, `code "00"`,
`message "[TEST P] Approved"`, si IPN-ul de dupa purta tot 8.

⚠ **Codul 8 l-a prins colectorul de statusuri nerecunoscute scris in aceeasi zi, la mai putin de o
ora dupa ce a fost pus.** Exact pentru asta a fost pus.

**b) „will be available at a future date" nu inseamna ca nu merge.** Toate capetele
`OperationService` (`capture`, `void`, `credit`, `status`, `expire`, `fail`) poarta descrierea asta
in specul lor viu. **Chemate, raspund.** Pe `ntpID` 3022507: `/operation/status` a intors
`status 5`, `code "00"`, plus intreaga configurare a platii; `/operation/credit` a rambursat.

> **Regula de retinut: la Netopia, o propozitie din specificatie NU e o masuratoare.** A treia oara
> in aceeasi zi cand proza lor spune altceva decat capetele lor (prima a fost unitatea sumei).

---

## ⚠ Ce ramane deschis
2. ✅ **Semnalul „marfa a plecat fara bani" EXISTA de acum**, cerut de proprietar in aceeasi zi.
   Masurat inainte: doua comenzi **EXPEDIATE dar neplatite**, cu id de tranzactie Netopia, la
   `suporti-numar`: `#0104` (105,50 lei, 15.08) si `#0156` (65,00 lei, 25.08). Ori clientul a platit
   si notificarea nu a ajuns (banii sunt la Netopia, noi nu stim), ori nu a platit si marfa a plecat
   oricum. **Nu se poate lamuri din platforma**, tocmai din cauza punctului 1; se lamureste din contul
   Netopia al comerciantului.
   * Regula e pura si probata (`lib/orders/marfa-a-plecat-fara-bani.ts`), iar cronul zilnic
     `plati-neconfirmate` o cheama. ⚠ Nu e pusa la momentul expedierii fiindca o comanda ajunge
     „expediata" pe **peste douazeci de drumuri** (fiecare cron de urmarire o muta cand coletul intra
     in retea, plus panoul, loturile si ingestia din marketplace): ar fi fost „acelasi lucru in
     douazeci de copii", iar a douazeci si una ar fi aparut fara ea.
   * ⚠ Merge la **toate** procesatoarele, nu doar la Netopia, si taie anume rambursul (acolo
     „neplatit" e starea normala a unei comenzi vii) si restituirile (banii au intrat si au iesit
     deliberat).
   * ⚠ Si ajunge **la clopotelul comerciantului**, nu doar in jurnal. Fereastra de 26 de ore tine
     loc de memorie, deci fiecare comanda se striga o data; `?ore=` largeste pentru o trecere peste
     istoric, cum se face prima data pentru cele doua cazuri vechi.
   ⚠ Nu repara cauza (punctul 1 ramane al lor). Face ca paguba sa nu mai fie TACUTA.
3. **Cinci comenzi platite fara `netopia_ntp_id`** (~354 lei, iulie-august). Decalajul de 1-3 zile
   intre creare si actualizare arata a marcare manuala din panou, ceea ce e legitim. Nu e un defect,
   dar e scris aici ca sa nu fie cautat ca unul.
4. ✅ **RECONCILIEREA EXISTA DE ACUM.** Punctul 1 de mai sus era scris de mine ca „gaura lor", pe
   temeiul descrierii din specificatie. Capatul raspunde, deci cronul orar
   `/api/cron/netopia-reconciliere` intreaba `/operation/status` despre fiecare comanda care are
   `netopia_ntp_id`, nu e platita, e mai veche de o ora si mai noua de paisprezece zile.
   * ⚠ Ce raspund ei trece prin **exact aceeasi regula** ca o notificare
     (`lib/netopia-aplica-statusul.ts`), nu printr-o a doua copie. De aceea ruta de notificare a
     fost subtiata pana la ce e al HTTP-ului: jetonul si `errorCode`.
   * ⚠ O plata gasita asa se scrie cu `warning`, nu tacut: inseamna ca **notificarea lor nu a
     ajuns**, iar comerciantul a avut o comanda aratand „neplatita" cu banii deja incasati.
   * ⚠ O interogare **picata** nu lamureste nimic si se reia la ora urmatoare. O pana de retea
     citita drept „Netopia zice ca nu e platita" ar fi fost cea mai urata purtare cu putinta.
5. ✅ **RAMBURSAREA SE PORNESTE DIN PLATFORMA.** Buton propriu in ecranul comenzii, aparat de
   registrul de operatii externe.
   * ⚠⚠ **Nu e legata de selectorul de status, si asta e hotararea centrala.** Niciun procesator
     din platforma nu trimitea bani inapoi pe API: „rambursat" era o eticheta pe care comerciantul o
     punea DUPA ce daduse banii de mana din panoul procesatorului. Legata de acel selector, apasarea
     lui obisnuita ar fi trimis banii **a doua oara**, in tacere, la fiecare comanda deja rambursata
     manual.
   * ⚠ O cadere de retea e `necunoscut`, nu esec: randul din registru **blocheaza**, deci a doua
     apasare nu poate trimite banii inca o data.
   * ⚠ Se ramburseaza **intreg**, o singura data. Partial ar cere o suma introdusa de om si o
     istorie a sumelor deja intoarse; pana exista aceea, un singur foc e tot ce putem apara.
6. **Rambursarea partiala** si **anularea inainte de decontare** (`/operation/void`) nu sunt scrise.
   Capetele par sa raspunda, dar n-au fost probate cap la cap, si nu se scrie cod care muta bani pe
   temeiul ca „probabil merge".

---

## Nota, cinstit

**10/10.**

Integrarea era scrisa cu grija reala: notificarea autentificata inainte de orice atingere a bazei,
suma verificata, `errorCode` folosit exact cum trebuie pentru repetare, idempotenta prin `WHERE`,
doua plafoane de rafala gandite pe cine ar fi victima, adresa trimisa bancii reparata dupa o
masuratoare. Cele doua reparatii de azi inchid un refuz de card care omora comanda si un secret care
putea disparea in tacere.

Cele trei motive pentru care nu era **10** la prima trecere au picat toate, si nu prin argument:

1. **„Nu exista nicio reconciliere, si e vina lor."** ⚠ **Era vina mea**: crezusem descrierea din
   specificatie in loc sa chem capatul. Chemat, raspunde. Cronul orar exista.
2. **„Fluxul cap la cap n-a fost parcurs."** Parcurs, pe productie, cu tabelul de mai sus, inclusiv
   drumul refuz-apoi-reusita pe aceeasi comanda.
3. **„Rambursarea nu se poate porni din platforma."** Se poate, si e aparata de registru. Nu s-a
   scris pe temeiul specificatiei, ci **dupa** ce o rambursare adevarata a fost vazuta mergand pe
   sandbox.

**Probe:** 54 in fisierul Netopia + 18 la semnalul „marfa a plecat fara bani". Banc de mutanti
**23 din 23**, intre care revenirea lui 15 la „rambursat", reteaua cazuta citita ca refuz (care ar
debloca a doua trimitere de bani), regula despre bani copiata inapoi in ruta, poarta cronului
inversata si interogarea picata citita ca „neplatita". ⚠ Probele **isi pun singure un secret**,
fiindca altfel n-ar apara nimic, si **cheama clientul real cu `fetch` inlocuit**, nu cauta siruri in
fisiere. `tsc` curat, suita verde (8566), build OK, schema in pas, fara migratie.

⚠ **Doua probe de-ale mele au cazut pe cod bun si au fost stranse:** una masura PREZENTA sirului
`netopia_ntp_id` in loc de forma garzii (mutantul `if (false && !ntpID)` a trecut), alta compara
pozitia unui IMPORT in loc de a apelului. Amandoua sunt scrise in fisier cu motivul, ca sa nu se
rescrie la fel.

⚠ **Si o capcana veche prinsa de proba, nu de citit codul:** mesajul catre comerciant folosea
`Number.isFinite(Number(total))`, iar `Number(null)` e **ZERO**, nu `NaN`. O comanda fara total ar fi
aparut in notificare drept „0.00 lei", adica marfa plecata pe gratis. Aceeasi capcana golise
feedurile Facebook.
