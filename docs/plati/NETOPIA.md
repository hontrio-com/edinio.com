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

⚠ **Nu pot dovedi din date ca s-a si intamplat.** Cele 14 comenzi Netopia anulate au, cele mai multe,
acelasi `updated_at` la milisecunda: sunt anulari in lot facute de comerciant. Doua au marcaj propriu
si ar putea fi IPN, dar nu se poate deosebi. Defectul e dovedit din **specificatie si din codul
nostru**, nu din trafic, si asa il scriu.

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

## ⚠ Ce ramane deschis

1. ⚠⚠ **Netopia nu are plasa, si ei o spun.** `/operation/status` exista in specificatie cu
   descrierea *„get order payment status - will be available at a future date"*. Deci **nu se poate
   interoga starea unei plati**: daca IPN-ul nu ajunge, plata se pierde tacut si nimic n-o mai
   gaseste. `ntpID` se pastreaza tocmai pentru ziua in care endpointul va exista.
2. ⚠⚠ **Masurat azi, si merita uitat pe el:** doua comenzi **EXPEDIATE dar neplatite**, cu id de
   tranzactie Netopia, la `suporti-numar`: `#0104` (105,50 lei, 15.08) si `#0156` (65,00 lei, 25.08).
   Ori clientul a platit si notificarea nu a ajuns (banii sunt la Netopia, noi nu stim), ori nu a
   platit si marfa a plecat oricum. **Nu se poate lamuri din platforma**, tocmai din cauza punctului
   1; se lamureste din contul Netopia al comerciantului.
   ⚠ Nu exista niciun semnal care sa-i spuna comerciantului „ai expediat o comanda a carei plata nu
   e confirmata". E o lucrare de produs, nu un defect de integrare, si nu s-a facut fara cerere.
3. **Cinci comenzi platite fara `netopia_ntp_id`** (~354 lei, iulie-august). Decalajul de 1-3 zile
   intre creare si actualizare arata a marcare manuala din panou, ceea ce e legitim. Nu e un defect,
   dar e scris aici ca sa nu fie cautat ca unul.
4. **`15 = rambursare` nu apare in specificatia v2.** E cunostinta mostenita din v1. Se pastreaza:
   maparea e in directia sigura (o comanda marcata gresit „rambursata" nu trimite marfa si nu
   incaseaza nimic), iar alternativa ar fi sa nu recunoastem deloc o rambursare.

---

## Nota, cinstit

**9/10.**

Integrarea era scrisa cu grija reala: notificarea autentificata inainte de orice atingere a bazei,
suma verificata, `errorCode` folosit exact cum trebuie pentru repetare, idempotenta prin `WHERE`,
doua plafoane de rafala gandite pe cine ar fi victima, adresa trimisa bancii reparata dupa o
masuratoare. Cele doua reparatii de azi inchid un refuz de card care omora comanda si un secret care
putea disparea in tacere.

⚠ **De ce nu e mai mult:**

1. **Nu exista nicio reconciliere**, si nu din vina noastra: endpointul lor de interogare a starii nu
   e inca disponibil. Pana atunci, o notificare pierduta inseamna o plata pierduta, iar cele doua
   comenzi expediate-si-neplatite de mai sus sunt chiar forma pe care o ia.
2. **Reparatia statusului 12 e argumentata din specificatie, nu probata pe traficul lor.** Un card
   refuzat nu se poate produce la comanda intr-un mediu real fara un cont de test.
3. **Nimeni nu e avertizat** cand expediaza o comanda cu plata neconfirmata (punctul 2 de mai sus).

**Probe:** 16 noi. Banc de mutanti **4 din 4**, intre care revenirea la anulare si caderea inapoi pe
cheia goala. ⚠ Probele **isi pun singure un secret**, fiindca altfel n-ar apara nimic. `tsc` curat,
suita verde, build OK, fara migratie.
