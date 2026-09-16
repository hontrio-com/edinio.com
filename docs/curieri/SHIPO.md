# Shipo.ro: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al doisprezecelea.

**Ce sunt ei:** al treisprezecelea transportator si al saselea BROKER. Un singur cont, mai multi
curieri (FAN, Cargus, DPD, Sameday si altii), tarife proprii.

**API-ul real:** `https://api.shipo.ro`. ⚠ Autentificare in DOI PASI, cu token de **o ora**:
`POST /auth` cu cheia in antetul `auth-key` (CU CRATIMA, redenumit de ei la 16.07.2026), apoi
`Bearer` pe tot restul. Niciun alt transportator n-are token cu viata asa scurta.

**Referinta autoritara:** `https://shipo.ro/documentatie-api`, o singura pagina, adusa intreaga cu
`curl` (298 KB HTML, 2.822 de randuri de text) si citita pe 16.09.2026.
⚠ **Documentatia a crescut** de la 1.535 de randuri, cat avea cand s-a scris integrarea: are acum un
CHANGELOG propriu, si doua endpointuri in plus fata de ce stia memoria.

**Cod:** `src/lib/shipo/` (`client.ts`, `expediere.ts`, `preturi.ts`, `statusuri.ts`,
`localitati.ts`, `puncte.ts`), `src/lib/actions/shipo.actions.ts`, cronul
`src/app/api/cron/shipo-tracking`, ferestrele `ShipoAwbModal.tsx` si `ShipoConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu Shipo configurat | **ZERO** (din 129) |
| AWB-uri emise vreodata | **ZERO** |
| Comenzi cu tarif Shipo ales in checkout | **ZERO** |
| Operatii `shipo` in registrul de operatii externe | **ZERO** |

⚠ **Zero curat.** Singura masura ramane conformitatea cu documentatia lor.

---

## ⚠⚠ Defectul gasit: judetul nu ajungea NICIODATA la ei

`oras_sosire` e una dintre **denumirile vechi** pe care Shipo le pastreaza pentru integrarile
existente. Documentatia spune limpede ce asteapta campul:

> „Ele asteapta localitatea intr-un singur camp, in formatul **«Oras, Judet»**."

Noi trimiteam doar numele orasului. Iar regula lor de potrivire e scrisa in acelasi paragraf:

> „Daca in acelasi judet exista mai multe localitati cu acelasi nume, adauga `municipality` sau
> foloseste ID-ul, **altfel se ia PRIMA POTRIVIRE**."

Fara judet, „prima potrivire" nu se mai cauta intr-un judet: se cauta **in toata tara**.

⚠ **Si nu e o teama teoretica.** Chiar codul nostru avea deja scris, in `orasulPotrivit`, ca
`/city` al lor intoarce omonime si ca **„Victoria" exista in PATRU judete** (Brasov, Iasi, Braila,
Vaslui). Coletul pleca in alt judet cu HTTP 200, cu AWB valid si fara nicio urma. Comerciantul afla
de la client.

⚠ **Defectul era ascuns tocmai fiindca partea grea fusese deja rezolvata.** La CAUTAREA punctelor,
`orasulPotrivit` cere si judetul si refuza ambiguitatea, cu proba. La EXPEDIERE, unde conteaza cel
mai mult, judetul nu pleca deloc.

**Leacul:** `localitateaExpedierii()`, langa `localitateShipo()`, si folosita doar la expediere. Trei
lucruri nu sunt de stil:

- ⚠ **Bucurestiul face EXCEPTIE, si tot ei o cer**: „Pentru Bucuresti se trimite doar
  `city: «Bucuresti»`, **FARA judet**, impreuna cu `sector`". Un „Bucuresti, Bucuresti" ar fi chiar
  forma pe care documentatia o exclude.
- ⚠ **Fara judet nu se inventeaza unul.** Mai bine ambiguitatea LOR decat un judet pus de noi;
  comanda fara judet e oprita oricum de `lipsuriExpediere`.
- ⚠ **`/rates` ramane cu numele SINGUR.** Acolo `delivery_city` e documentat ca „Orasul de livrare",
  cu exemplul „Cluj-Napoca". Doua campuri, doua reguli: lipit cu judetul, cotarea ar putea sa nu
  gaseasca nimic, iar cumparatorul ar primi tariful fix in loc de cel real, tacut.

---

## Changelogul lor, verificat intrare cu intrare

Documentatia are acum o sectiune proprie de modificari. Toate sunt acoperite:

| data | ce au schimbat | la noi |
| --- | --- | --- |
| 07.09.2026 | `POST /shipment` nu mai trimite expedierea cand creditul nu acopera costul: raspunde **402** cu expedierea SALVATA, si se reia cu `POST /shipment/send/{id}` | acoperit din 15.09 (commit `b8acebe2`): ciorna se REIA, nu se recreeaza |
| 23.07.2026 | `insurance`, `open_on_delivery`, `notify_recipient`, `quick_cod` trimise ca TEXT erau tratate gresit; `"false"` insemna ACTIVAT, si se facturau servicii nedorite | ⚠ verificat: trimitem **booleeni adevarati**, si numai cand comerciantul a bifat optiunea. N-am fost niciodata in cazul acela, nici inainte, nici acum |
| 23.07.2026 | `GET /points` nou, cu ID care e de PUNCT, nu de adresa salvata | acoperit, si deosebirea e scrisa in cod |
| 23.07.2026 | `/client/address_list` intoarce acum intotdeauna o LISTA (inainte putea fi obiect indexat pe id) | ⚠ acoperit pe amandoua formele: `Array.isArray(r) ? … : Object.values(r)` |
| 23.07.2026 | `quick_cod` (ramburs turbo) | acoperit |
| 16.07.2026 | antetul `auth_key` redenumit `auth-key` | acoperit |

---

## Ce am reverificat din memorie, si ce a iesit

| afirmatie veche | azi |
| --- | --- |
| „statusurile sunt `order_placed`, `collected`, …, `loaded_locker`, `return_to_sender`" | ⚠ lista LOR are acum si **`dropoff_pudo`** si **`loaded_pudo`**. Codul le are pe amandoua, cu clasa corecta (`in_retea`, fiindca coletul asteapta ridicarea). Memoria era in urma, codul nu |
| „`POST /rates` intoarce un OBIECT indexat pe `rate_id`, nu un tablou" | adevarat, si acoperit (`Object.values`) |
| „refuzul vine cu HTTP 200 si `success: false`" | adevarat, si acoperit (`esteRefuz` in `apel()`) |
| ⚠ „NU exista cautare dupa referinta NOASTRA, deci fereastra «am trimis si n-am primit raspuns» nu se poate inchide cu o citire" | **reverificat si PASTRAT.** `POST /shipment` are un camp `meta`, dar documentat ca „Info suplimentare (os_type, os_version, utm_url)" si **nu se intoarce** in `/shipments`. `order_id` din raspunsurile lor e id-ul de ridicare al CURIERULUI. Registrul local ramane singura plasa |
| „`total_fee` cu sau fara TVA: documentatia nu spune" | **inca nu spune.** Nu s-a inventat niciun adaos |

---

## Acoperirea documentatiei: 14 din 16 endpointuri

Folosite: `/auth`, `/client`, `/client/address_list`, `/city`, `/address`, `/points`, `/couriers`,
`/rates`, `/rates/services`, `/shipment`, `/shipment/send/{id}`, `/shipment/validate`,
`/shipment/cancel/{awb}`, `/tracking`.

**Nefolosite:**

- ⚠ **`GET /store-returns`** (nou fata de ce stia memoria): lista retururilor trimise catre magazin,
  cu `pending_approval` si `return_reason`. Adica **retururi care asteapta aprobarea
  comerciantului**, despre care platforma nu stie nimic azi, desi are ecran propriu de retururi. E o
  functionalitate intreaga (cron + ecran), nu o reparatie, si la zero AWB-uri n-are pe ce lucra.
- `GET /shipments`: lista paginata a expedierilor, cu filtre pe status, AWB si interval de date.
  Utila la reconciliere. ⚠ **Nu inchide fereastra de emitere**: nu se poate filtra dupa referinta
  noastra, fiindca ea nu pleaca nicaieri in cerere.

---

## Ce ramane deschis, si de ce

1. **Nedovedit live (D-5).** Zero magazine, zero expedieri. Trei lucruri se lamuresc doar cu o cheie
   de cont: daca `/shipment` chiar intoarce AWB de la prima (sau cere `/send`), daca linkurile de
   eticheta cer autentificare, si daca `total_fee` e cu sau fara TVA.
2. **Retururile de magazin** (`/store-returns`): reale, si nefacute.
3. ⚠ **Denumirile noi de campuri.** Azi trimitem `oras_sosire`/`strada_sosire`, cele vechi, care „au
   PRIORITATE daca sunt trimise impreuna cu noile denumiri". Mutarea pe
   `recipient_address_city` + `recipient_address_county` (+ `recipient_address_municipality`) ar
   rezolva si omonimele din ACELASI judet, pe care forma „Oras, Judet" nu le poate exprima. E o
   migrare, nu o reparatie, si o jumatate de migrare ar fi mai rea decat niciuna: campurile vechi
   castiga.
4. **Fereastra de emitere ramane inchisa doar de registrul local**, ca la Woot si FAN. Nu e o lipsa
   a integrarii: e o lipsa a API-ului lor, reverificata azi.

---

## Nota, cinstit

**9,5/10.**

Integrarea e printre cele mai bine tinute din platforma, si asta se vede in ce NU a trebuit reparat:
tokenul de o ora cu cache si o singura reincercare, coordonatele rasucite intr-un singur loc,
refuzul pe HTTP 200, raspunsul de tarife care e obiect si nu tablou, cele doua forme ale listei de
adrese, si patru intrari de changelog ale lor deja acoperite, una din ele de acum noua zile.

Ce s-a inchis azi e un lucru pe care nici tsc, nici cele 8.216 de probe, nici build-ul nu-l puteau
vedea: **un camp de text primea jumatate din ce cere documentatia**. Iar jumatatea care lipsea era
exact cea care deosebeste patru localitati cu acelasi nume.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live**, si aici cantareste concret: trei intrebari raman fara raspuns pana la prima
   cheie de cont, una dintre ele despre TVA.
2. **Retururile de magazin** sunt o functionalitate reala pe care ei o expun si noi n-o citim.
3. **Migrarea pe denumirile noi de campuri** ar rezolva si omonimele din acelasi judet. Nu o fac pe
   jumatate.

**Probe:** 9 noi. Banc de mutanti **7 din 7**, cu mutantul pe APELANT in amandoua sensurile: si
„expedierea cheama iar varianta fara judet", si „cotarea primeste judetul lipit". `tsc` curat,
**8.225 de probe verzi**, build OK, fara migratie.
