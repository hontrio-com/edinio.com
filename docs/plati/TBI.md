# tbi bank: evidenta integrarii (plata in rate)

Livrata pe 15.11.2026. Clientul alege „Plata in rate prin tbi bank", comanda se scrie neplatita, iar
el e trimis pe pagina tbi, unde completeaza cererea de credit. tbi ne trimite fiecare schimbare de
stare a cererii; aprobarea marcheaza comanda platita, prin aceeasi regula ca la ceilalti procesatori
(`finalizeazaPlataComenzii`).

Codul: `src/lib/tbi/` (pur: `config`, `cripto`, `cerere`, `stari`; server: `client`, `server`),
`src/app/api/tbi/start`, `src/app/api/tbi/notificare/[jeton]`, `src/app/api/cron/tbi-reconciliere`,
`src/lib/actions/tbi.actions.ts`, panoul `features/tbi`, caseta din pagina comenzii
(`components/dashboard/tbi/TbiComandaPanel.tsx`). Migratia: `migrations/2027-02-03-tbi-bank.sql`.

---

## Sursele, toate citite cap la cap

* **eCommerce-API-Documentation.pdf** (tbibank.ro, 06.2024), 8 pagini, documentul dat de proprietar.
  Culorile s-au citit cu PyMuPDF: ROSU (obligatoriu) sunt `order_total`, `promo` si tot `items`.
* **DOCUMENTATIE-TEST-API.zip** (tbibank.ro, pagina „API 2024"): foaia cu credentialele si adresele
  UAT, exemplele PHP de trimitere si de descifrare, exemplul de cerere, documentul de anulare si cele
  doua arhive de chei ale magazinului de test `tbitestapi_ro` (`Chei_Comerciant_`, `Chei_SFTL_`;
  fiecare cu `priv_key.pem`, `pub.pem`, `pub.crt`, `.pfx`).
* **CC_Woocommerce_TBI_RO_v.3.4.2.zip**, modulul lor oficial. ⚠ Nu vorbeste direct cu tbi: trece prin
  serverul dezvoltatorului lui (`tbicp.com`, `providerCode: "avast"`), care tine limitele, butoanele
  si vestile. De la el am luat doar ce e despre tbi: `multipart/form-data` la trimitere,
  `CURLOPT_FOLLOWLOCATION` + antetul `Location`, pretul articolului = `line_total / qty`, si randul
  de credit sub butonul de cos de pe pagina produsului. Modulul NU schimba starea comenzii din vesti.

---

## Fluxul

1. **Formularul** (`checkout-core.ts` / `OrderModal.tsx`) arata metoda doar daca: tbi e gata, comanda
   e in Romania, pe persoana fizica, si totalul intra in limite (`metodeLaComanda`). Serverul repeta
   regula la plasare, INAINTE de cupon si stoc (`refuzulSumeiTbi` + garda pe firma).
2. **`/api/tbi/start`**: scrie randul `tbi_cereri` („creata", cu jetonul) INAINTE de apel, construieste
   cererea, o cripteaza, o trimite (`Finalize`), iar din `301 Location` ia adresa paginii tbi. O
   reincercare in 30 de minute, pe aceeasi suma, primeste ACEEASI cerere (nu inca un credit cerut pe
   numele omului).
3. **Vestile** vin la `back_ref` = `/api/tbi/notificare/<jeton>`; se aplica prin `aplicaVesteaTbi`.
4. **Cronul `tbi-reconciliere`** (din 10 in 10 minute): anuleaza la tbi cererile deschise ale
   comenzilor anulate sau sterse, indiferent pe ce drum s-a anulat comanda; si reia plata pentru
   cererile APROBATE ale caror comenzi au ramas neplatite (baza cazuta in clipa vestii), cu aceleasi
   garzi ca vestea. Nu intreaba banca nimic: API-ul lor n-are interogare de stare.

---

## ⚠ Securitatea vestilor: criptarea NU e semnatura

Vestea vine criptata cu cheia PUBLICA a magazinului. Pe aceea o are tbi, deci oricine o afla poate
cripta o veste „aprobata". Criptarea ascunde, nu dovedeste. Trei lacate, in ordinea asta:

1. **Jetonul** din adresa: 256 de biti aleatori, pusi de noi in `back_ref`, care pleaca la tbi numai
   criptat; in baza sta doar SHA-256. Un jeton necunoscut se opreste inainte de citirea corpului si de
   orice descifrare, deci ruta nu poate fi folosita ca oracol de umplutura.
2. **Descifrarea** cu cheia privata a magazinului caruia ii apartine cererea.
3. **`order_id` din veste = id-ul cererii de pe jeton.** O veste adevarata nu se poate rejuca pe
   jetonul altei cereri.

O veste care nu se poate descifra (cheie gresita sau stearsa) se spune comerciantului (clopotel,
o data la sase ore) si in jurnal, `critical`: cat ramane asa, nicio aprobare nu ajunge la comenzi.

---

## Criptarea, masurata

RSA cu PKCS#1 v1.5, pe BUCATI DE OCTETI: `(biti/8) - 11` la criptare, `biti/8` la descifrare,
rezultatele lipite, apoi base64. Textul se reface din octetii lipiti (o litera de doi octeti poate fi
rupta intre doua bucati).

**Verificat pe fir pe 15.11.2026**, cu `src/lib/tbi/cripto.ts` exact cum e in depozit:

* vestea-exemplu din „5. Decripting status Update Code Example.php", descifrata cu cheia de test a
  comerciantului, da `{"order_id":"528413423","status_id":1,"motiv":""}`. Adica `status_id` vine
  NUMAR, desi documentatia il scrie text; citirea le primeste pe amandoua;
* `pub.pem` si `pub.crt` din `Chei_Comerciant_tbitestapi_ro` sunt perechea cheii din exemplu;
* dus-intors cu perechea SFTL de test, pe un text cu diacritice de trei bucati;
* cheia gresita, cheia lipita pe un rand, `+` devenit spatiu, cheile inversate: toate prinse.

⚠ Node 24 (OpenSSL 3.5) are respingere implicita la PKCS#1 v1.5: o cheie gresita NU arunca, da
octeti pseudo-aleatori. De aceea textul trebuie sa fie UTF-8 curat, JSON, cu campurile asteptate.

⚠ Cheile de test NU sunt in depozit (probele genereaza chei). Sunt publice la tbi, dar o cheie privata
scrisa in Git e un tipar prost si un fals pozitiv vesnic pentru scanerele de secrete.

---

## Adresele si ce raspund (masurat 15.11.2026)

| | productie | test (UAT) |
|---|---|---|
| Finalize | `https://ecommerce.tbibank.ro/Api/LoanApplication/Finalize` | `https://vmrouatftos01.westeurope.cloudapp.azure.com/LoanApplication/Finalize` |
| Anulare | `.../Api/LoanApplication/CanceledByCustomer` | `.../LoanApplication/CanceledByCustomer` |

* Productia are `/Api` in cale, testul nu: asa scrie in ambele documente.
* Productia raspunde public: `405` la GET (deci exista si vrea POST), certificat DigiCert valid.
* **Serverul de test NU raspunde din afara** (conexiunea expira): primeste doar adrese aprobate de tbi.
  Vercel n-are IP fix, deci pentru test (sau daca tbi va cere IP fix si pe productie) apelurile pot
  trece prin releul CONNECT de la eMAG (`scripts/emag-proxy/`): se adauga gazdele tbi in lista
  `dstdomain` a lui squid, se pune `TBI_PROXY_URL` (aceeasi forma ca `EMAG_PROXY_URL`) si
  `TBI_PROXY_IP` (il arata panoul, ca omul sa-l dea echipei tbi). Fara ele se iese direct.

---

## Ce face fiecare veste

| `status_id` | `motiv` | starea noastra | efect |
|---|---|---|---|
| 1 | gol | `aprobata` | comanda platita + confirmata (`finalizeazaPlataComenzii`, idempotenta) |
| 2 | etapa | `in_analiza` | nimic; dupa aprobare, ignorata (ordinea de sosire nu e garantata) |
| 0 | gol | `anulata` | notificare (nu si cand anularea am cerut-o noi) |
| 0 | text | `respinsa` | notificare cu motivul |
| 0 | oricare, DUPA aprobare | `anulata`/`respinsa` | ⚠ notificare tare; comanda NU se atinge |

Aprobarea NU marcheaza platita o comanda: anulata (se spune: contractul se anuleaza la tbi), cu alta
metoda de plata intre timp, sau cu totalul schimbat fata de suma din cerere (ca la Revolut).

Raspunsul rutei: 200 aplicata, 400 necitibila (repetata ar da la fel), 404 jeton necunoscut, 503 baza
cazuta. Documentatia nu spune daca tbi repeta vestile; 503 e o sansa, nu o plasa.

---

## Hotarari

* **Platita la APROBARE.** Banca finanteaza, clientul nu mai plateste nimic la livrare; ca la Klarna.
  Factura la Oblio iese „Alta incasare banca" (banii vin prin virament de la tbi); la SmartBill nu se
  marcheaza „Card online", fiindca nu e card. Reducerea „plata cu cardul" NU se aplica.
* **Fara reconciliere activa: API-ul lor n-are interogare de stare.** Singura cale e vestea. De aceea
  cererea se scrie inaintea apelului si de aceea vestea care nu se poate descifra striga.
* **Fara rata lunara afisata.** Dobanda, comisionul si asigurarea le stabileste tbi pe fiecare client;
  DAE-ul nu se poate socoti la noi, iar o rata inventata ar fi o oferta de credit falsa. Pagina
  produsului spune doar „Plateste in rate cu tbi bank", intre limitele magazinului.
* **Mesajul de pe pagina produsului are patru forme** (`banner_produs`, „Ce apare pe pagina produsului"
  in panou, cu previzualizare din chiar componentele vitrinei): `rand` (implicit, „Plateste in rate cu
  [tbi bank]"), `banner` (card cu sigla mare, titlu si o banda cu cei trei pasi), `video` (acelasi card, cu
  sigla si textul in stanga si clipul in dreapta) si `ascuns`. Alegerea schimba DOAR pagina produsului
  (`bannerTbiPePaginaProdusului` -> `tbi_produs` din configurarea publica -> `product-data.ts` -> `RateTbi`).
  Formularul de comanda si plasarea citesc `limiteleTbi`, deci plata in rate ramane la comanda oricare ar fi
  forma. Componentele: `components/storefront/RandRateTbi.tsx`, `CardTbi.tsx`, `BannerRateTbi.tsx`,
  `VideoRateTbi.tsx`.
* **Cardul bannerelor** (`CardTbi`) preia chenarul in straturi din „Texture Card", Cult UI (licenta MIT),
  in culori FIXE, deschise: sigla tbi are textul „bank" aproape negru, deci cardul ramane deschis si pe
  temele inchise. Prima varianta (fond portocaliu translucid, cifre in cercuri portocalii) a fost respinsa
  de proprietar pe 15.11 ca „prea vibe code".
* **Clipul bannerului video** (`public/plati/tbi/cumparaturi-tbi.mp4` + afisul `cumparaturi-tbi.jpg`):
  motion design generat cu ElevenLabs pe 15.11.2026, fluxul „Edinio · tbi bank · banner plata in rate".
  Cadrul de start: Seedream 5 Pro, 1440x1080, un cos de cumparaturi negru pe portocaliul tbi, cu produse de
  zi cu zi deasupra (fara text si fara sigle); clipul: Seedance 2.5, 4:3, 720p, 6 s, fara sonor: produsele
  cad pe rand in cos. Bucla se inchide cu o trecere `xfade` de la cosul plin la cadrul de start. Sigla
  oficiala si textul stau LANGA clip, pe alb: modelele video deformeaza literele si siglele. Prima varianta
  (sfere portocalii, sigla mica peste clip) a fost respinsa: „cercurile nu semnifica nimic". Clipul porneste
  doar in ecran (`preload="none"` + `IntersectionObserver`) si deloc cu „miscare redusa".
* **Numai persoane fizice si numai Romania**: cererea lor are CNP, nu CUI.
* **`order_id` = id-ul cererii** (de la 700000001), nu numarul comenzii: o comanda poate avea mai multe
  cereri, iar o aprobare pentru o cerere VECHE (terminata in alt tab) trebuie sa ajunga tot la comanda.
* **`category` = „1"** implicit (documentatia cere numar intreg, fara lista); editabil in panou.
* **`instalments` nu se trimite**: clientul alege numarul de rate in pagina tbi.
* Anularea are buton propriu in pagina comenzii; schimbarea starii comenzii nu cheama banca.

---

## Ce ramane de vazut pe fir

* **Nimic n-a rulat inca pe o cerere adevarata** (serverul de test e inchis pentru noi). Nota cinstita
  e deci 9/10 pana la prima aprobare reala: vezi `integrarea-care-n-a-rulat-niciodata`.
* De confirmat cu tbi la primul magazin: codarea vestii (formular, multipart sau JSON: ruta le primeste
  pe toate), daca repeta vestile, si numele campurilor la anulare (`orderData`/`encryptCode` din
  exemplu, fata de `order_data`/`providerCode` din explicatia de sub el).
