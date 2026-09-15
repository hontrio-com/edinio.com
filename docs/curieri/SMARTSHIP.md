# SmartShip.ro: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al optulea, dupa `WOOT.md`, `DPD.md`,
> `SAMEDAY.md`, `CARGUS.md`, `COLETE-ONLINE.md`, `ECOLET.md` si `PACKETA.md`.

**Ce sunt ei:** al cincilea BROKER al platformei, dupa Woot, Colete Online, eColet si Innoship. Un
singur cont, mai multi curieri, un singur tarif negociat de ei. In plus fata de toti ceilalti au
doua lucruri pe care nu le mai are nimeni:

- **contract propriu (BYOC)**: comerciantul isi leaga PROPRIILE conturi de curier si emite pe ele,
  prin acelasi API. Atunci acelasi curier apare de doua ori la cotare, la preturi diferite, si se
  deosebesc dupa `own_contract: true`;
- **oferte de transport pentru marfa grea**, cerute de la un OM din echipa lor si primite peste ore
  sau zile. Patru pasi: cere, verifica, accepta sau refuza.

**API-ul real:** `https://api.smartship.ro`, cu cheia in antetul `X-API-KEY`. Nu exista mediu de
proba: orice emitere e reala si facturata.

**Referinta autoritara:** <https://smartship.ro/api-docs>, o singura pagina, bilingva RO/EN, adusa
intreaga cu `curl` (259 KB de HTML, 2.230 de randuri de text) si citita cap-coada pe 16.09.2026.
Tabelul de curieri de acolo e **generat automat din platforma**, deci se schimba: azi listeaza 8
curieri (1 Cargus, 2 SameDay, 5 DragonStar, 8 si 14 PTT Express, 12 SameDay EasyBox, 16 SmartShip
Delivery, 19 FedEx), iar in capul paginii statea si un anunt ca **Cargus e momentan indisponibil**.
Id-urile 3 (FanCourier), 6 (DPD), 34 si 35 (Komy) apar in documentatie fara sa fie in tabel.

**Cod:** `src/lib/smartship/` (`client.ts`, `expediere.ts`, `preturi.ts`, `statusuri.ts`,
`localitati.ts`, `geo.ts`, `lockere.ts`, `suprapunere.ts`), `src/lib/actions/smartship.actions.ts`,
cronul `src/app/api/cron/smartship-tracking`, ferestrele `SmartshipAwbModal.tsx` si
`SmartshipConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu SmartShip configurat | **ZERO** (din 129) |
| AWB-uri emise vreodata | **ZERO** |
| Comenzi care au ales SmartShip la checkout | **ZERO** (din 468) |
| Comenzi trimise la locker SmartShip | **ZERO** |
| Solicitari de oferta de transport | **ZERO** |
| Ridicari FedEx programate | **ZERO** |
| Operatii in registrul de operatii externe | **ZERO** |

⚠ **Zero peste tot**, ca la Colete Online, eColet si Packeta. Nimeni n-a deschis vreodata pagina de
configurare, deci nu exista niciun semnal de productie dupa care sa prioritizez. Singura masura
ramane conformitatea cu documentatia lor, plus compatibilitatea cu restul platformei.

⚠ Dar integrarea **nu e verde de nefolosinta**: a fost scrisa in august 2026 (LIVE 15.08, commit
`07de2cb`), cu documentatia citita intreaga si cu migratia deja aplicata. Ce urmeaza sunt trei
lucruri gasite azi, si toate trei sunt de fond, nu de forma.

---

## Acoperirea documentatiei: 21 din 22 de endpointuri

| endpoint | folosit | unde |
| --- | --- | --- |
| `POST /cost` | da | cotare checkout si panou |
| `POST /awb/new` | da | emitere |
| `GET /awb/status/{awb}` | da | cron de urmarire |
| `GET /awb/order_id/{order_id}` | da | „Verifica la SmartShip" |
| `GET /awb/cancel/{awb}` | da | anulare |
| `GET /awb/print/{awb}/{format}` | da | eticheta A4 sau A6 |
| `GET /geolocation/counties` | da | nomenclator si proba de conexiune |
| `GET /geolocation/cities` | da | nomenclator, inclusiv `loc_sel` |
| `GET /geolocation/easybox` | da | lockere in checkout |
| `GET /geolocation/fanbox` | da | lockere in checkout (doar BYOC) |
| `GET /account/senders` | da | butonul „Incarca expeditorii" |
| `GET /account/balance` | da | soldul din fereastra de emitere |
| **`GET /awbs`** | **NU** | vezi mai jos |
| `GET /pickup/availability/{awb}` | da | ridicare FedEx |
| `POST /pickup/{awb}` | da | ridicare FedEx |
| `GET /invoices` | da | contabilitate |
| `GET /payouts` | da | deconturi ramburs |
| `GET /payouts/{number}` | da | liniile unui decont |
| `POST /transport-offer` | da | marfa grea |
| `GET /transport-offer/{ref}` | da | marfa grea |
| `POST /transport-offer/{ref}/accept` | da | marfa grea |
| `POST /transport-offer/{ref}/reject` | da | marfa grea |

**Codurile de eroare: 28 din 28.** Transcrise endpoint cu endpoint in `CODURI`, cu text propriu, nu
cu propozitia lor de referinta: comerciantul trebuie sa stie ce are de FACUT.

⚠ **`GET /awbs` ramane nefolosit dinadins.** E util pentru reconciliere in ERP, dar nu poate fi
interogat pe o LISTA de numere (filtrele lui sunt data, status, curier si un singur `order_id`) si
nu intoarce istoricul. Pentru un magazin cu multe expedieri ar insemna sa citim tot contul la
fiecare rulare de cron, iar cronul interogheaza deja fiecare AWB in parte. La zero AWB-uri, n-are
cine sa castige din el.

---

## 1. ⚠ `601` inseamna DOUA lucruri, iar noi il spuneam mereu pe cel gresit

Documentatia lor da `601` de doua ori, la doua endpointuri diferite:

```
POST /awb/new                       601 = „courier_id invalid"
POST /transport-offer/{ref}/accept  601 = „credite insuficiente pentru pretul ofertei"
```

Tabelul nostru de coduri era unul singur. Deci comerciantul care accepta o oferta de marfa grea
fara sa aiba credit in cont primea mesajul **„Curierul ales nu e in lista celor acceptate de
SmartShip"**: o propozitie adevarata despre ALT endpoint, care il trimite sa umble la lista de
curieri in loc sa-si alimenteze contul. Iar oferta aia are un termen de valabilitate
(`valid_until`), deci timpul pierdut cautand in locul gresit costa chiar oferta.

E aceeasi capcana ca la `301`, care la ei inseamna si „cheie de API gresita" si „AWB inexistent".
Acolo deosebirea se vedea in COD, si e tratata de mult (`cautaDupaComanda` face o a doua citire
inainte sa deblocheze registrul). Aici se vedea doar in TEXT, deci nimic nu putea cadea: nici
`tsc`, nici probele de tipuri.

**Leacul:** un al doilea tabel, `CODURI_PE_CALE`, care are precedenta fata de cel general si numai
pe calea lui. Calea se potriveste pe FORMA (`/transport-offer/{orice}/accept`), nu pe un sir fix:
referinta ofertei e a lor si se schimba la fiecare solicitare. Acoperite si `409` (care la accept
inseamna „nu exista oferta de acceptat" si la reject „nu mai poate fi refuzata") si `410`.

⚠ **Verdictul nu s-a schimbat.** Un mesaj mai bun n-are voie sa se plateasca cu un slot de registru
deblocat pe nedrept: `verdictCod` cauta acum in AMANDOUA tabelele, deci un cod cunoscut ramane refuz
dovedit si unul necunoscut ramane necunoscut.

⚠ Si mutantul sta pe APELANT: `apel()` e cel care trebuie sa duca `cale` mai departe. O tabela
corecta la care nu ajunge nimeni n-ar repara nimic, deci jumatate din probe trec prin clientul real,
cu `fetch` fals care raspunde exact ca ei: HTTP 200, codul in CORP.

---

## 2. ⚠ Sectorul bucurestean se cauta doar in ORAS, si asta bloca emiterea

SmartShip cere `sector` 1-6 pentru capitala si `0` pentru restul tarii. La noi, `null` inseamna „e
in Bucuresti si nu stim care", iar `null` opreste expedierea in `lipsuriExpediere`. Regula aia e
buna si ramane: un sector ghicit plimba coletul prin oras.

Dar sectorul se citea DOAR din numele orasului. Iar orasul poarta sectorul numai pentru comenzile
venite prin checkout-ul nostru, care din 15.08.2026 il impune acolo („Sector 3"). Celelalte nu:

- **eMAG, Trendyol si About You** trimit `oras: "Bucuresti"` si scriu sectorul in strada;
- la fel face **comerciantul care isi scrie comanda de mana** in panou.

Pentru toate acelea sectorul iesea `null`, si comanda **nu putea primi AWB deloc**. Nu e cazul
blând al cotarii, unde o adresa nerecunoscuta cade tacut pe tariful fix: aici se oprea EMITEREA, cu
un mesaj care ii cerea omului sa completeze un lucru pe care clientul il scrisese deja, doua campuri
mai incolo. In cea mai mare piata din tara.

⚠ **Comentariul promitea deja ce codul nu facea**: „Sectorul poate fi scris si in oras («Sector
3»), si in restul adresei". Aceeasi clasa cu garda promisa in comentariu de la Packeta. Un
comentariu nu e o garda.

**Leacul:** `sectorSmartship(oras, judet, restulAdresei)`, care cauta in cele trei locuri IN ORDINEA
ASTA, si `rezolvaLocalitatea(..., { adresa })`, prin care strada ajunge pana acolo. Aceeasi cautare
o fac deja Shipo, Woot, DHL, UPS si FedEx.

⚠ **Nu se ghiceste nimic in plus.** In afara Bucurestiului raspunsul ramane `0`, oricat ar scrie
„Sector 3 Business Park" in strada. Iar cand sectorul nu scrie nicaieri, raspunsul ramane `null` si
expedierea se opreste, ca pana acum.

⚠ **Checkout-ul nu se schimba, si e in regula.** Cotarea din checkout nu are strada (destinatia e
doar judet, oras si cod postal, la toti curierii), iar formularul nostru impune oricum „Sector N" in
oras. Reparatia atinge exact calea pe care era stricata: comenzile care NU trec prin formular.

---

## 3. ⚠ Filtrul de curieri stingea LOCKERUL, tacut

`curieri_permisi` e lista de curieri pe care comerciantul ii lasa sa apara. Casutele din panou se
umplu dintr-o **cotare de proba** (Bucuresti spre Cluj-Napoca, 1 kg, fara locker), fiindca SmartShip
n-are endpoint de curieri.

Iar documentatia lor spune: **„Fara `locker_id`, easybox nu apare la estimare si nu se poate
emite."** Deci curierul 12 nu poate ajunge NICIODATA in acea lista, si deci nici in
`curieri_permisi`.

Pe cealalta parte, cotarea unei comenzi la locker trimite `locker_id`, iar atunci **„`/cost`
intoarce DOAR varianta la locker"**. Un singur rand, cu curierul 12.

Puse cap la cap: comerciantul care bifa fie si un singur curier isi stingea easybox-ul. Comanda
venita din checkout cu punct de ridicare nu mai putea primi AWB din panou, iar mesajul dadea vina pe
furnizor: „SmartShip n-a intors nicio oferta pentru comanda asta". Nicio eroare, niciun log, nimic
de cautat.

⚠ Nu era o nepotrivire de forma, ci una de INTELES: filtrul raspunde la „ce curieri livreaza la
adresa", iar lockerele au deja comutatoarele lor (`foloseste_easybox`, `foloseste_fanbox`).

**Leacul:** `ofertePosibile(costs, config, { laLocker })`. La locker filtrul nu se aplica; restul
verificarilor (pret, curier, deduplicare pe cheia `(courier_id, own_contract)`) raman toate.

---

## Ce era DEJA bine, si de ce conteaza

Trecerea de azi a reverificat fiecare hotarare veche fata de documentatia lor de acum. Toate au
rezistat:

- ⚠ **Raspunsul se citeste de DOUA ori.** Documentatia lor nu pomeneste niciun cod HTTP, iar toate
  exemplele au `"status": 200` in CORP. Un client care s-ar uita doar la `res.ok` ar citi drept
  succes un „credit insuficient" servit cu 200, si ar scrie pe comanda un AWB inexistent.
- ⚠ **`pdf_link` din raspunsul de emitere CONTINE CHEIA DE API** (`smartship.ro/api/CHEIA_TA_API/print/...`).
  Nu se salveaza si nu pleaca spre browser: eticheta se ia cu cheia in ANTET si urca prin serverul
  nostru ca base64, cu semnatura `%PDF` verificata.
- ⚠ **ZERO E UN STATUS** (`0 = emis, neridicat`). La toti ceilalti curieri codurile incep de la 1.
  Comparatiile se fac cu `!== null`, niciodata cu adevar-fals.
- ⚠ **Cheia unei oferte are DOUA parti**, `(courier_id, own_contract)`: cu `show_byoc` acelasi
  curier apare de doua ori, la preturi diferite.
- ⚠ **Pe contract propriu easybox nu e curier separat** (`courier_id: 12` + `use_own_contract: 1`
  cade cu 4004). Traducerea sta intr-un singur loc, `courierDeEmis()`.
- ⚠ **`show_byoc` si `use_own_contract` stau la nivelul PRINCIPAL**, nu in `content`. Ratacit in
  `content`, `use_own_contract` n-ar da nicio eroare: ar emite tacut pe contractul SmartShip.
- ⚠ **`205` la anulare e SUCCES**, nu esec: efectul dorit exista deja.
- ⚠ **`open_package` nu se trimite la locker**, fiindca ei il ignora acolo, si comerciantul e
  avertizat ca optiunea nu se aplica.
- ⚠ **Codul 301 la cautarea dupa `order_id`** inseamna si „cheie invalida" si „AWB inexistent", deci
  ramura „nu exista" face o a doua citire (`/account/balance`) inainte sa deblocheze registrul.
- ⚠ **`order_id` nu e doar numarul comenzii**: contorul reporneste la #0001 pe magazin, iar SmartShip
  cauta pe CONT. Patru caractere din `businessId` despart doua magazine cu acelasi cont.

---

## Ce ramane deschis, si de ce

1. **`only_byoc` (D-3, nefacut dinadins).** Steagul exista si ar face cotarea mult mai rapida pentru
   comerciantii cu contract propriu, fiindca sare peste conturile SmartShip. Dar **schimba ce vede
   cumparatorul**: raspunsul contine DOAR curierii de pe contractele proprii plus SmartShip Delivery.
   Asta e o hotarare de produs, nu o reparatie, si nu o iau in locul proprietarului.
2. **Forma randului din `/geolocation/easybox` si `/geolocation/fanbox` (D-2).** Singurele doua
   endpointuri din tot API-ul **fara exemplu de raspuns**, reverificat azi. Randul se citeste
   tolerant (sase nume pentru id, cinci pentru oras), iar butonul de Diagnostic din panou arata
   CHEILE REALE. Se inchide la prima cheie de cont, nu inainte.
3. **Nomenclatorul lui `tracking[].event_id` (D-3).** Nepublicat. Istoricul se ARATA omului, dar nu
   se traduce si nu misca nicio comanda. Statusul iese din `awb_status`, care e starea EXPEDIERII,
   nu ultimul eveniment, deci capcana GLS („ultima stare nu e de ajuns") nu se aplica aici.
4. **Pragul de marfa grea (D-3).** Nepublicat; vine ca `min_weight` la codul 422. Cifra din
   interfata (200 kg) e doar pragul de la care ARATAM butonul, si scrie acolo ca e a noastra.
5. **Nedovedit live (D-5).** Zero credentiale, zero expedieri. Tot ce se putea proba fara cont e
   probat; ce ramane are nevoie de o cheie adevarata.

---

## Nota, cinstit

**9,5/10.**

Structura era deja buna, si asta se vede peste tot: cele 28 de coduri de eroare transcrise
endpoint cu endpoint, raspunsul citit de doua ori fiindca documentatia lor nu are coduri HTTP,
cheia de API tinuta departe de browser desi ei o pun chiar intr-un link, zeroul tratat ca status.
Nu e o integrare facuta in graba.

Ce s-a inchis azi sunt trei lucruri de fond, si doua dintre ele blocau chiar emiterea:

1. `601` spunea altceva decat s-a intamplat, pe calea ofertelor de marfa grea;
2. comenzile bucurestene venite din marketplace nu puteau primi AWB deloc;
3. filtrul de curieri stingea tacut livrarea la easybox pentru orice comerciant care il folosea.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live.** Cantareste mai mult decat la altii, fiindca doua necunoscute (forma randului
   de locker, nomenclatorul evenimentelor) se inchid DOAR cu o cheie de cont, si fiindca la ei orice
   emitere e reala si facturata: nu exista mediu de proba in care sa gresesti ieftin.
2. **`only_byoc` e o hotarare de produs**, nu una tehnica, si sta la proprietar.
3. **Reconcilierea rambursului** se vede (`/payouts`, `/payouts/{number}`), dar nu misca
   `payment_status`. La fel ca la Innoship si eColet: mutarea automata a banilor asteapta sa se vada
   pe date reale ce inseamna cifrele. La zero AWB-uri, nu pun masinaria aia.

**Probe:** 27 noi, in trei fisiere. Banc de mutanti **12 din 12**, cu mutantul pe APELANT la toate
trei reparatiile (`apel()`, `pregatesteExpedierea`, `coteazaSmartshipAction`). `tsc` curat, **8.182
de probe verzi**, build OK, fara migratie.
