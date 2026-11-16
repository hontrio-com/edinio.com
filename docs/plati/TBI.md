# tbi bank: evidenta integrarii (plata in rate, Fusion Pay)

Livrata pe 15.11.2026 pe API-ul vechi („eCommerce", RSA) si mutata pe 16.11.2026 pe **Fusion Pay**,
cand tbi i-a trimis lui VetDepo date numai pentru acesta (reseller_code, reseller_key, encryption key).
Niciun magazin nu apucase sa configureze API-ul vechi, deci a fost inlocuit cu totul.

Clientul alege „Plata in rate prin tbi bank", comanda se scrie neplatita, iar el e trimis pe pagina
tbi, unde isi alege numarul de rate si completeaza cererea de credit. tbi ne trimite fiecare schimbare
de stare; aprobarea marcheaza comanda platita, prin aceeasi regula ca la ceilalti procesatori
(`finalizeazaPlataComenzii`).

Codul: `src/lib/tbi/` (pur: `config`, `cerere`, `stari`; server: `cripto`, `client`, `server`),
`src/app/api/tbi/start`, `src/app/api/tbi/notificare/[jeton]`, `src/app/api/cron/tbi-reconciliere`,
`src/lib/actions/tbi.actions.ts`, panoul `features/tbi` (`TbiConfigClient.tsx`), caseta din pagina
comenzii (`components/dashboard/tbi/TbiComandaPanel.tsx`). Migratii: `2027-02-03-tbi-bank.sql`, apoi
`2027-02-04-tbi-fusion-pay.sql` (secretele noi, coloanele pentru id-ul si jetonul tbi).

---

## Sursele, citite cap la cap

* **„API documentation - RO Fusion Pay"** (tbigroup.atlassian.net, spatiul „Merchant helpdesk", pagina
  4496752652, citita prin API-ul public Confluence pe 16.11.2026): metodele, parametrii, codurile de
  eroare, vestile, calculatorul gata facut si datele de TEST publice (`TBI_test` / `tbitest` + cheia).
* **`Cryptor.php`**, atasat paginii: algoritmul de criptare (vezi mai jos).
* **`tbi-financing-button-design-guidelines.md`**, atasat: aspectul butonului de finantare (doar vizual).
* Masuratori pe serverul lor de test, cu datele publice, pe 16.11.2026 (mai jos, „Ce raspund de fapt").

---

## Fluxul

1. **Formularul** (`checkout-core.ts` / `OrderModal.tsx`) arata metoda doar daca: tbi e gata, comanda
   e in Romania, pe persoana fizica, si totalul intra in limite (`metodeLaComanda`). Serverul repeta
   regula la plasare, INAINTE de cupon si stoc (`refuzulSumeiTbi` + garda pe firma).
2. **`/api/tbi/start`**: scrie randul `tbi_cereri` („creata", cu jetonul) INAINTE de apel, construieste
   cererea, o cripteaza in `data` si o trimite (`RegisterApplication`). Raspunsul `{error: 0, order_id,
   token, url}`: `url` e pagina tbi a clientului, iar `order_id` + `token` (ale LOR) se pastreaza pentru
   interogari, anulare si rambursare. O reincercare in 30 de minute, pe aceeasi suma, primeste ACEEASI
   cerere (nu inca un credit cerut pe numele omului).
3. **Intoarcerea clientului**: `successRedirectURL` / `failRedirectURL` = pagina de confirmare a
   magazinului (`/<slug>/confirm?orderId=…`, respectiv `?status=esuat&…`), ca la Netopia si Klarna.
4. **Vestile** vin la `statusURL` = `/api/tbi/notificare/<jeton>`; se aplica prin `aplicaVesteaTbi`.
5. **Cronul `tbi-reconciliere`** (din 10 in 10 minute): (1) anuleaza la tbi cererile deschise ale
   comenzilor anulate sau sterse, indiferent pe ce drum s-a anulat comanda; (2) reia plata pentru
   cererile APROBATE ale caror comenzi au ramas neplatite; (3) intreaba starea cererilor deschise care
   n-au mai auzit nimic (`GetApplicationStatus`): dupa 30 de minute in prima zi, apoi la trei ore,
   cel mult 14 zile. Raspunsul trece pe drumul vestii, cu aceleasi garzi.
6. **Rambursarea** (`loanRefund`), din caseta comenzii, pentru un credit aprobat: integrala sau
   partiala. Vestile ei (4, 5, 6) vin la `refundLink`, cu un jeton NOU, tinut in `jetoane_rambursare`.

---

## ⚠ Securitatea vestilor: criptarea NU e semnatura

AES-CTR fara MAC: cheia o are si tbi, iar cine stie un text si criptarea lui poate rasturna biti.
Criptarea ascunde, nu dovedeste. Trei lacate, in ordinea asta:

1. **Jetonul** din adresa: 256 de biti aleatori, pusi de noi in `statusURL` (si `refundLink`), care
   pleaca la tbi numai CRIPTAT, in `data`; in baza sta doar SHA-256. Un jeton necunoscut se opreste
   inainte de citirea corpului si de orice descifrare.
2. **Descifrarea** cu cheia de criptare a magazinului caruia ii apartine cererea.
3. **`order_id` din veste = id-ul cererii de pe jeton.** O veste adevarata nu se poate rejuca pe
   jetonul altei cereri.

O veste care nu se poate descifra (cheie schimbata sau stearsa) se spune comerciantului (clopotel,
o data la sase ore) si in jurnal, `critical`: cat ramane asa, nicio aprobare nu ajunge la comenzi.

`tbi_token` si amprentele nu se pot citi din browser: privilegiul pe `tbi_cereri` e dat pe coloane.

---

## Criptarea, masurata

Din `Cryptor.php`: AES-256-CTR, cheia = `sha256(cheia din email)` (32 de octeti bruti), IV aleator de
16 octeti LIPIT IN FATA textului criptat, totul in base64. `src/lib/tbi/cripto.ts`.

**Verificat pe 16.11.2026**, cu codul din depozit:

* `data` din exemplul de RegisterApplication, descifrat cu cheia de test publicata, da exact JSON-ul
  scris langa el (Jane Doe, doua produse);
* ⚠ **vestea-exemplu CRIPTATA** (`PjNk…`) da pe fir `{"command":"update_status","order_id":"2371998",
  "status":0,"message":"Comanda anulata TBI","motive":"","contract_id":"20266032281"}`: litere mici si
  `status` NUMAR, desi JSON-ul scris in pagina are `OrderId`, `Status: "0"`, `Message`, `Motive`,
  `ContractNumber` (iar tabelul, `Contract_id`). Citirea le primeste pe toate; citita dupa numele din
  text, vestea s-ar fi pierdut;
* serverul lor de test primeste cererile criptate de noi (cereri reale de test, anulate dupa proba).

Vectorii de test sunt in `src/lib/tbi/vectori-fusion.test-date.json`: numai valorile PUBLICE din
documentatie, nu ale vreunui comerciant.

---

## Adresele si ce raspund de fapt (masurat 16.11.2026)

| | productie | test (UAT) |
|---|---|---|
| baza | `https://ro.tbibank.support/api` | `https://ro.tbi-uat.online/api` |

Metodele: `GetCalculations`, `RegisterApplication`, `GetApplicationStatus`, `loanCancellation`,
`loanRefund`. Toate POST cu JSON; `reseller_code` si `reseller_key` in clar, restul criptat in `data`.

* **Ambele servere raspund public**, spre deosebire de testul API-ului vechi (doar IP-uri aprobate).
  `TBI_PROXY_URL` ramane, nefolosit, pentru cazul in care tbi cere vreodata o adresa fixa.
* Codul din `error` vine si ca stare HTTP (401, 404, 207). Reusita: `error: 0` la inregistrare,
  `error: 200` la anulare si rambursare.
* ⚠ Cu `data` care nu se poate descifra, sau fara `items`, inregistrarea raspunde **204 fara corp**, nu
  207/208 cum scrie documentatia. Serverul de test a primit si un `orderid` gol si un articol fara `sku`
  (cu avertismente PHP in fata JSON-ului): nu ne bizuim, pleaca mereu tot.
* ⚠ **Verificarea datelor de acces** („Verifica legatura" si salvarea din panou): o anulare pentru o
  cerere care nu exista. 404 = tot bun, 207 = cheia de criptare gresita, 401 = codul sau cheia de
  reseller gresite. Nu se atinge nimic la banca.
* `GetApplicationStatus` scrie starea in cuvinte: „Comanda trimisa catre TBI", „Comanda in derulare
  TBI", „Plata TBI acceptata", „Comanda anulata TBI" (si „CanceledByCustomer" in lant, dupa o anulare).

---

## Ce face fiecare veste

| `status` | text | starea noastra | efect |
|---|---|---|---|
| 1 | Plata TBI acceptata | `aprobata` | comanda platita + confirmata (`finalizeazaPlataComenzii`, idempotenta) |
| 2 | Comanda in derulare TBI | `in_analiza` | nimic; dupa aprobare, ignorata (ordinea de sosire nu e garantata) |
| 0 | Comanda anulata TBI | `anulata` | notificare (nu si cand anularea am cerut-o noi) |
| 3 | Comanda anulata TBI | `respinsa` | notificare cu motivul (`motive`) |
| 0 / 3, DUPA aprobare | | `anulata`/`respinsa` | ⚠ notificare tare; comanda NU se atinge |
| 4, 5 | Refund Registered / Processing | neschimbata | doar in istoric |
| 6 | Refund Completed | neschimbata | `baniiSAuIntors` cu suma ceruta din Edinio (integrala: plata devine „rambursata"; partiala: notificare). Fara suma stiuta (rambursare din portalul tbi): notificare |

Aprobarea NU marcheaza platita o comanda: anulata (se spune: banii se intorc prin rambursare), cu alta
metoda de plata intre timp, sau cu totalul schimbat fata de suma din cerere (ca la Revolut).

Raspunsul rutei: 200 aplicata, 400 necitibila (repetata ar da la fel), 404 jeton necunoscut, 503 baza
cazuta. Documentatia nu spune daca tbi repeta vestile; plasa e cronul care intreaba starea.

---

## Hotarari

* **Platita la APROBARE.** Banca finanteaza, clientul nu mai plateste nimic la livrare; ca la Klarna.
  Factura la Oblio iese „Alta incasare banca" (banii vin prin virament de la tbi); la SmartBill nu se
  marcheaza „Card online", fiindca nu e card. Reducerea „plata cu cardul" NU se aplica.
* **Datele de acces se verifica la salvare**, la tbi: un refuz dovedit (401, 207) opreste salvarea; o
  retea cazuta nu (se salveaza, cu avertisment).
* **Produsele de finantare** (`GetCalculations`: perioada, dobanda, comisionul, sumele) se arata in panou,
  iar intervalul lor poate deveni limitele magazinului dintr-un clic. Peste ele tbi refuza cererea (210).
* **Fara rata lunara afisata, deocamdata.** Fusion Pay o permite (`installment_factor`, `nir`), iar
  documentatia lor cere atunci dobanda, totalul de plata, rata si perioada langa ea. DAE-ul nu vine din
  API. De hotarat cu proprietarul, separat.
* **Mesajul de pe pagina produsului are patru forme** (`banner_produs`): `rand` (implicit), `banner`,
  `video`, `ascuns`. Alegerea schimba DOAR pagina produsului; formularul si plasarea citesc `limiteleTbi`.
  Componentele: `RandRateTbi.tsx`, `CardTbi.tsx` (chenar din „Texture Card", Cult UI, MIT),
  `BannerRateTbi.tsx`, `VideoRateTbi.tsx` (clip ElevenLabs, `public/plati/tbi/`).
* **Numai persoane fizice si numai Romania.**
* **`orderid` = id-ul cererii noastre** (de la 700000001), nu numarul comenzii: o comanda poate avea mai
  multe cereri, iar o aprobare pentru o cerere VECHE trebuie sa ajunga tot la comanda.
* **`category` = 1** implicit (documentatia cere numar intreg, fara lista); editabil in panou.
* **Fara adresa si CNP in cerere**: Fusion Pay nu le cere, pagina tbi le ia de la om.
* Anularea si rambursarea au butoane proprii in pagina comenzii; schimbarea starii comenzii nu cheama
  banca.

---

## Ce ramane de vazut pe fir

* **Nicio aprobare reala inca.** Pe serverul de test s-au inregistrat, interogat si anulat cereri; o
  aprobare cere completarea cererii in portalul lor. Nota cinstita: 9/10 pana la prima aprobare la un
  magazin (vezi `integrarea-care-n-a-rulat-niciodata`).
* De confirmat la primul magazin: codarea vestii pe productie (JSON, ca in documentatie; ruta primeste
  si formular si multipart), daca tbi repeta vestile, si numele campurilor din veste pe productie
  (citirea le primeste pe ambele forme).
