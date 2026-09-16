# FAN Courier: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al unsprezecelea, si ultimul dintre cei
> care aveau munca facuta fara fisa: FAN a trecut prin trei valuri de audit intre 07 si 13.09.2026
> si a ramas singurul fara nota scrisa.

**API-ul real:** `https://api.fancourier.ro`, autentificare cu token de la `POST /login` (valabil
24h, il tinem 23h in proces).

**Referinta autoritara:** `RO_FANCourier_API-2.0-100523.pdf`, 47 de pagini, md5
`844c28526d69fa75fb812b651c4c3f23`, adus de proprietar si citit pe 16.09.2026.

**Cod:** `src/lib/fancourier.ts`, `src/lib/fancourier/statusuri.ts`,
`src/lib/actions/fancourier.actions.ts`, cronurile `fancourier-tracking` si
`fancourier-settlements`, ferestrele `FanCourierAwbModal.tsx`, `FanCourierPickupModal.tsx` si
`FanCourierConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu FAN configurat | **3** |
| AWB-uri emise vreodata | **ZERO** |
| Comenzi cu punct de ridicare FAN | **ZERO** |
| Decontari FAN in `courier_settlements` | **ZERO** |

⚠ **Neschimbat fata de masuratoarea din 13.09.** Trei comercianti au acreditari complete si niciunul
n-a emis nimic. Ca la GLS: nu e zero curat, sunt oameni cu butonul apasat.

---

## ⚠ Ce am reverificat azi, si ce a iesit

Proprietarul isi amintea integrarea ca fiind deja 10/10. Verificarea confirma **cea mai mare parte**
din asta, si gaseste un singur lucru real.

### Cele trei P1 pe care auditul extern le lasase deschise

| constatare (09.09) | starea azi |
| --- | --- |
| „o ridicare ramasa `necunoscut` blocheaza ziua definitiv, fiindca supapa filtreaza pe `order_id`, iar ridicarile au `order_id NULL`" | **inchisa**: `registru.ts` are cazul scris pe fata, iar mesajul trimite la `/api/admin/operatii`, ruta care exista tocmai pentru randurile fara comanda, in loc sa-l trimita in pagina comenzii unde n-avea ce gasi |
| „nu exista «Detaseaza AWB», deci un DELETE refuzat de curier ingheata comanda pentru totdeauna" | **inchisa**: butonul exista in `OrderEditModal`, si e chiar deosebit de „Anuleaza AWB" (`manualOnly`) |
| „starea contului nu e verificata pe niciun drum FAN, deci un magazin suspendat emite in continuare" | ⚠ **nu e actionabila**: cautat in toate cele 47 de pagini, API-ul lor are **26 de endpointuri si niciunul de stare a contului**. `S49 „Activitate suspendata"` exista, dar e un cod de eveniment pe AWB, nu o stare de cont. Constatarea cerea un apel care nu exista. |

### Ce am confirmat ca facut, din valul de pe 13.09

Cele trei functionalitati mari, urmarirea pe COD (nu pe text, fiindca FAN publica un tabel stabil),
decontarile prin `GET /reports/bank-transfers` cu cursor pe zile, TVA-ul care nu se mai aplica de
doua ori peste un tarif care vine deja cu TVA, asigurarea socotita pe `subtotal`, programul punctului
aratat DOAR cand toate cele sapte intervale sunt identice. Toate au probe, si cele mai multe au
mutanti pe apelant.

---

## ⚠⚠ Singurul lucru gasit: proba care lipsea, si pe care un comentariu o cita ca existenta

`src/lib/integrari/secret-server.ts`, randul 34, scria:

> „Ce a costat, probat pe FAN: compusa cu un cache de token cheiat fara secret, o singura cerere
> neautentificata scotea contul altui comerciant, denumire, persoana de contact, ambele telefoane,
> emailul si IBAN-ul din `reports/branches`. **Vezi proba din `fancourier.token.test.ts`.**"

**Fisierul acela nu exista in depozit.** Adica exact locul unde s-a inchis cea mai lata gaura de
securitate a platformei isi trimitea cititorul la o dovada care nu e nicaieri, iar cine venea sa
refactorizeze pleca linistit.

Si nu era o formalitate. Gaura avea DOUA jumatati, si amandoua reparatiile sunt **ordine si forma**,
nu purtare noua:

1. In `secretDinConfig`, scurtatura `if (dinFormular) return dinFormular` statea INAINTEA lui
   `getUser`. Toti cei **19 apelanti**, din **17 fisiere de actiuni**, se bazau pe ea ca pe o poarta
   si nu mai verificau nimic ei insisi. Cine trimitea o parola nevida sarea peste tot restul.
2. Cache-ul de token era cheiat doar dupa partea PUBLICA (`username` la FAN), deci dupa un login
   reusit orice cerere cu acelasi username si un secret gresit primea tokenul valid din cache.

O mutare de trei randuri desface prima; un argument scapat o desface pe a doua. Nimic nu cadea.

**Ce s-a scris:** `src/lib/fancourier.token.test.ts`, cu numele exact pe care comentariul il cita
deja, si trei grupe de afirmatii:

- **cheia se schimba odata cu secretul**, secretul nu ajunge in clar in ea, si partile nu se pot
  lipi una in alta (fara separator, `["ab","c"]` si `["a","bc"]` ar da acelasi hash);
- ⚠ **un CENS peste toata platforma**, nu doar peste FAN: fiecare fisier care tine token in proces e
  pe una din doua cai declarate (prin ajutorul comun `cheieToken`, sau cu secretul chiar in cheie, ca
  la cele doua OAuth-uri Google), iar un cache nou care nu e in nicio lista **cade**. A noua
  integrare care apare maine e cea care il va cheia iar dupa username;
- **ordinea din `secretDinConfig`**: sesiunea si proprietatea magazinului se cer INAINTEA scurtaturii
  din formular, citirea cu service role sta dupa amandoua, si orice esec iese ca sir gol (nu `null`,
  nu exceptie), fiindca asa il citesc toti apelantii.

⚠ **Cele doua OAuth-uri Google sunt trecute in cens pe fata, nu ascunse.** Ele pun jetonul de
reimprospatare direct in cheie: secretul E acolo, deci regula se respecta, dar in clar. E mai slab
decat ajutorul comun (cheia poate ajunge in diagnostice) si sta scris ca atare, ca sa fie o hotarare
vizibila, nu o scapare.

---

## Acoperirea documentatiei: 13 din 26 de endpointuri

| folosite | |
| --- | --- |
| `login` · `intern-awb` · `extern-awb` · `awb` (GET, DELETE) · `awb/label` · `order` | emitere, anulare, eticheta, ridicare |
| `reports/awb/internal-tariff` | cotare |
| `reports/awb/tracking` · `reports/awb-events` | urmarire, pe COD |
| `reports/bank-transfers` | decontari |
| `reports/branches` · `reports/pickup-points` | datele contului, cele trei retele de puncte |

**Nefolosite, si de ce:**

- ⚠ **`reports/services` si `reports/service-options`** (catalogul de servicii al contractului).
  Serviciul se alege azi dupa REGULA: `Standard` acasa fara ramburs, `Cont Colector` cu ramburs, si
  serviciile proprii ale celor trei retele de puncte. Merge, dar **un comerciant al carui contract
  n-are „Cont Colector" afla abia la primul AWB cu ramburs**, dintr-un mesaj de la FAN. Cu o citire
  la configurare i s-ar putea spune dinainte. E diagnostic, nu reparatie, si e prima pe lista cand
  se atinge iar FAN.
- ⚠ **`reports/localities` / `counties` / `streets`** (nomenclatorul de adrese). Azi localitatea
  pleaca asa cum a scris-o cumparatorul, iar `intern-awb` intoarce motivul real („localitate
  gresita"). Aceeasi clasa cu codul postal de la GLS: se poate inchide inainte, cu un nomenclator
  cachat. Nu s-a facut, si la zero AWB-uri n-are cui folosi inca.
- `reports/orders`, `reports/order-events`, `reports/orders/tracking`: urmarirea COMENZILOR de
  ridicare (nu a AWB-urilor). Le cream (`POST /order`) si le anulam, dar nu le urmarim.
- `reports/awb` (raport de AWB-uri), `reports/awb/external-tariff`, `reports/countries`,
  `reports/external-counties`, `reports/external-localities`: extern si rapoarte, nefolosite.

---

## Ce ramane deschis, si de ce

1. **Nedovedit live (D-5).** Trei magazine cu acreditari complete, zero AWB-uri. Ca la GLS,
   cantareste mai mult decat la curierii cu zero magazine: prima emitere reala se poate intampla
   maine.
2. **Alegerea serviciului si nomenclatorul de adrese** (vezi tabelul de mai sus): amandoua ar muta
   erori de la „primul AWB" la „configurare". Nefacute.
3. **Cele patru medii ramase de la 13.09**, fara hotarare luata: plicul, FANbox nereglabil din panou,
   si ferestrele panoului care nu sunt de AWB si inca arata a dialog fara sa fie.
4. ⚠ **Ferestrele de AWB n-au proba de PURTARE**, doar de structura: depozitul n-are `jsdom`, si nu
   l-am adaugat fara sa mi se ceara. Proba spune ca sunt cablate corect, nu ca focusul chiar se
   plimba cum trebuie.

---

## Nota, cinstit

**9,5/10.**

Amintirea proprietarului e aproape exacta: valul din 13.09 a fost temeinic, si tot ce am verificat
azi punct cu punct a iesit facut. Doua din cele trei P1 ramase din auditul extern sunt inchise, iar
a treia cerea un apel care nu exista in API-ul lor.

Ce s-a inchis azi nu e un defect de purtare, ci ceva mai neplacut: **regula care a oprit cea mai lata
gaura de securitate a platformei nu avea niciun aparator, iar un comentariu spunea ca are.** O
mutare de trei randuri o desfacea in tacere, pe 19 apelanti deodata.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nedovedit live**, cu trei magazine armate.
2. **Doua citiri care ar muta erorile de la primul AWB la configurare** (serviciile contractului,
   nomenclatorul de localitati) sunt reale si nefacute.
3. **Ferestrele n-au proba de purtare**, fiindca depozitul n-are DOM in probe. E o datorie scrisa pe
   fata inca din 13.09, si ramane.

**Probe:** 13 noi, intr-un fisier care pana azi era doar citat. Banc de mutanti **9 din 9**, printre
care chiar defectul din 09.09 reintrodus in amandoua formele lui. `tsc` curat, **8.216 de probe
verzi**, build OK, fara migratie.

---

## ✅ A doua trecere, 16.09.2026: nimic de reparat

Dupa ce trei defecte au fost gasite in aceeasi zi la FedEx, UPS si Shipo, am cautat aceleasi
tipare si la FAN — care are **3 magazine configurate si ZERO AWB-uri**, deci e printre cei la care
cade urmatorul colet real. **N-am gasit niciunul**, si merita spus de ce.

| tiparul cautat | ce am gasit la FAN |
| --- | --- |
| refuzul autentificarii rescris ca „nu stim” pe o scriere | **curat.** `eroareDeTermen` s-a NASCUT aici, si intoarce neatinsa orice eroare care nu e termen (`if (!abort) return e as Error`). Deci `eroareRefuz` de la login supravietuieste intact prin drumul de emitere. |
| localitatea punctului suprascrie gol localitatea omului | **nu e cazul.** `pickupPointId` hotaraste destinatia, ca la DPD, iar localitatea ramane a cumparatorului. Iar lotul foloseste deja ajutorul comun pentru strada, cu nota scrisa: „prin ajutorul comun, nu prin `??`: acela nu cade pe SIRUL GOL”. |
| coduri de status lipsa din harta | **34 in documentatie, 34 in cod, zero lipsa, zero in plus.** ⚠ Comparatia a scos intai un `S92` „lipsa”; e un fals pozitiv al regexului meu: in `EN_FANCourier_API_130825-1.pdf`, pagina 30, `S92` e o valoare `pickupLocationId` dintr-un exemplu JSON, nu un cod de status. |

⚠ Un rezultat de „nimic de reparat” se scrie la fel de apasat ca unul cu reparatii: altfel
urmatoarea trecere reface aceleasi trei verificari fara sa stie ca s-au facut.
