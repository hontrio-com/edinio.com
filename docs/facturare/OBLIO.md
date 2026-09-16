# Oblio: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare integrare pana cand e 10/10 din
> toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu platforma,
> si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> A doua casa de facturare. Prima e `SMARTBILL.md`, si acolo sta tot traficul.

**Referinta autoritara:** <https://www.oblio.eu/api>, citita pe 16.09.2026.

**Cod:** `src/lib/oblio.ts` (clientul), `src/lib/actions/oblio.actions.ts` (actiunile si calea
automata), `src/lib/oblio-stare.ts`, `src/lib/billing/*` (regulile comune celor trei case),
`OblioConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| magazin | pornit | CIF + client_id | serie factura | serie proforma | auto | facturi | proforme | stornouri | comenzi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `okxi` | da | da | `DRA` | lipsa | nu | **0** | 0 | 0 | 162 |
| `ciprian-piese-auto-brasov` | da | da | `CABV` | `PROF` | lipsa | **0** | 0 | 0 | 0 |
| `teoshop` | da | da | `FACTURA` | `PROFORMA` | nu | **0** | 0 | 0 | 0 |

⚠⚠ **Trei magazine complet configurate si ZERO documente emise vreodata.** Merita spus de ce, ca sa
nu se caute un defect care nu exista: la toate trei facturarea automata e **stinsa**, deci un
document se emite doar din buton, iar nimeni n-a apasat. `okxi` are 162 de comenzi, dar nici SmartBill
pornit, deci nu e o chestiune de dispecer care alege alta casa.

Consecinta pentru tot ce urmeaza: **nimic din integrarea asta n-a fost umblat de un client.** Spre
deosebire de SmartBill (240 de facturi), aici suntem in situatia curierilor.

---

## Ce am reparat

### 1. ⚠⚠ Un raspuns fara `status` trecea drept SUCCES

Oblio isi pune statusul in CORP, nu in HTTP: raspunsul e `200` si cand refuza. Clientul il citea de
acolo, si asa e corect. Dar il citea ca `number` **fara sa verifice ca chiar e unul**:

```ts
const json = await res.json() as { status: number; … };
if (json.status < 200 || json.status >= 300) { … }
return json.data;
```

Lipsa lui face AMANDOUA comparatiile false (`undefined < 200` e `false`, si `undefined >= 300` la
fel), deci poarta nu se aprinde si se intoarce `json.data`, adica `undefined`, drept succes.
Apelantul il ia ca document creat si cade abia la `rezultat.seriesName`, cu „Cannot read properties
of undefined" in loc de motivul adevarat.

Pe acolo puteau trece: un raspuns care nu vine de la ei (proxy, pagina de mentenanta care se
nimereste JSON) si un **429** de la limita lor de cereri.

Acum: status numeric in corp, il credem pe el; altfel, cel HTTP. Iar un `2xx` **fara `data`** nu mai
e succes, e „nu stim", fiindca intors ca succes ar fi scris un document cu numar GOL pe comanda,
adica exact valoarea care dezarmeaza garda anti-duplicat.

### ⚠⚠ Si bancul de mutanti a gasit o slabiciune in chiar reparatia asta

Prima varianta cerea `typeof json.status === "number"`. Un mutant care o slabea la
`Number(json.status)` a **supravietuit**, iar asta m-a trimis inapoi la documentatia lor: **Oblio isi
stringifica numerele.** Chiar raspunsul lor de autentificare da `"expires_in": "3600"`, iar codul
nostru il trece deja prin `Number()` de ani de zile.

Deci daca statusul ar veni ca `"400"`, varianta stricta l-ar fi refuzat, ar fi cazut pe statusul HTTP
(care la ei e `200` si cand refuza), si **un REFUZ ar fi iesit SUCCES**. Adica exact defectul reparat,
pe alta usa. Se accepta acum si numarul, si sirul numeric.

### 2. ⚠⚠ La marketplace putea pleca o pagina de login drept factura (toate trei casele)

Urcarea facturii la eMAG si Trendyol aduce documentul cu `fetch(f.url)` **fara nicio acreditare** si
il pune in R2 cu `contentType: "application/pdf"`. Daca adresa salvata de la casa de facturare cere
autentificare, raspunsul nu e o eroare: e `200` cu pagina de login. `res.ok` e adevarat,
`arrayBuffer()` intoarce HTML, si la marketplace ajunge o pagina de login etichetata document fiscal.

⚠ Nu e o grija inchipuita:
* la **SmartBill** raspunsul are doua adrese, `documentViewUrl` (publica) si `documentUrl` („cere
  autentificare"), si chiar azi era gata sa se pastreze cea gresita;
* la **Oblio**, `link` are forma unei adrese cu jeton (`?it=<32 hex>`), deci PARE publica, dar
  **documentatia lor nu spune**, iar zero facturi emise inseamna ca nimeni n-a probat-o.

Deci nu se mai raspunde la intrebarea „e publica adresa?" pentru fiecare casa in parte. Se verifica
**ce a venit**, la toate trei deodata: un PDF incepe cu `%PDF-`, si nimic altceva nu incepe asa.
Garda sta INAINTE de `uploadToR2` (altfel am fi gazduit noi pagina de login sub o cheie care poarta
numarul facturii) si INAUNTRUL registrului (altfel urcarea ar fi ramas „in curs" pentru totdeauna).

### 3. Calea automata nu mai inghite defectele noastre, la niciuna din trei

`maybeAutoGenerateInvoice` se incheia cu `catch { return false; }` la Oblio si la fGO (la SmartBill
s-a reparat azi dimineata). `return false` e CORECT si ramane: facturarea n-are voie sa rupa
actualizarea comenzii. Ce lipsea era urma. Un `catch` fara corp inghite si defectele NOASTRE, iar
simptomul e identic cu al unui magazin fara facturare automata: nimic.

⚠ Proba e **una singura, peste toate trei**, nu in dosarul vreuneia: o regula care se aplica la trei
furnizori n-are ce cauta in fisierul unuia. Cade si daca apare a patra casa scrisa la fel.

⚠ Refuzul VENIT DE LA FURNIZOR era deja strigat la Oblio si fGO (`oblio.autoInvoiceEsuat`), si abia
azi si la SmartBill. Proba comuna il cere acum de la toate trei.

---

## Ce am verificat si era deja bine

| ce cere documentatia | ce e in cod |
| --- | --- |
| `POST /api/authorize/token`, token 1 ora | cache cu `expiresAt` din `request_time + expires_in`, reinnoit cu 60s inainte |
| cheia de cache | ⚠ `client_id` **plus secretul hasuit**: cheiata doar pe id, harta intorcea tokenul valid si pentru un secret GRESIT, iar `client_id` vine din FORMULAR |
| statusul e in CORP, nu in HTTP | citit de acolo, cu 4xx = refuz dovedit si 5xx = nesigur |
| `idempotencyKey` | trimis, si discriminat prin slotul de refacturare, ca reemiterea dupa storno sa nu intoarca factura stornata |
| required: `cif`, `client.name`, `seriesName`, `products[].name+price` | toate compuse in `buildInvoiceData` |
| `collect` (incasare la emitere) | doar cand `baniiAuIntrat(order)`, si fara `value`, ca Oblio sa incaseze exact totalul facturii |
| `useStock` | trimis DOAR cand comerciantul cere `no_stock`; altfel implicitul lor |
| cote de TVA pe linii | fiecare linie isi poarta cota, cu impartirea proportionala a transportului si reducerilor |
| `link`-ul documentului | citit si salvat la toate trei felurile (factura, proforma, storno) |
| securitate | proprietar verificat, token citit cu service-role abia dupa |

---

## ⚠ Ce ramane deschis, si de ce NU s-a atins

1. ⚠⚠ **Limita lor de cereri nu e respectata de lotul de facturi.** Documentatia spune, verbatim:
   *„30 de cereri la 100 de secunde pentru cererile care genereaza documente"*. `bulkGenerateInvoices`
   merge strict serial (`INVOICE_CONCURRENCY = 1`), dar are un buget de **210 secunde**, deci poate
   incerca peste o suta de documente intr-o rulare. Al 31-lea ar fi refuzat.
   ⚠ **De ce n-am construit un ritm:** ar insemna ori somn lung intr-o functie serverless cu plafon
   de 300s, ori un plafon per-furnizor intr-o functie generica, pentru o casa cu **zero** documente
   emise. Iar caderea e azi onesta: dupa reparatia 1, un `429` iese `esuat`, deci reincercarea e
   libera, si lotul spune per comanda ce n-a mers. Se construieste cand exista trafic.
2. **Trimiterea pe email nu exista DELOC la Oblio.** Documentatia lor o da printr-un singur camp
   (`sendEmail: 1`), iar SmartBill o are. ⚠ N-am adaugat-o: ar porni emailuri catre cumparatorii a
   trei magazine care azi nu primesc niciunul, adica o schimbare de purtare vizibila clientilor lor,
   nu o reparatie. **E de cerut, nu de presupus.**
3. **`link`-ul lor: public sau nu, nu stim.** Forma cu jeton sugereaza public, documentatia tace, si
   n-avem nicio factura pe care s-o probam. Reparatia 2 face intrebarea nedureroasa: daca nu e
   public, urcarea se opreste cu un mesaj limpede in loc sa trimita o pagina de login.
4. **Nimic n-a fost umblat de un client.** Zero documente din trei magazine configurate.

---

## Nota, cinstit

**9/10.**

Clientul era scris cu grija inca dinainte: cheia de cache cu secretul hasuit (o reparatie de
securitate reala), statusul citit din corp cu clasificarea corecta refuz/nesigur, `idempotencyKey`
trimis si discriminat pe slot, cote pe linii, `collect` legat de „au intrat banii" si nu de metoda de
plata. Cele trei reparatii de azi inchid o poarta care lasa `undefined` sa treaca drept document, o
capcana care ar fi trimis o pagina de login la marketplace, si tacerea caii automate.

⚠ **De ce nu e mai mult:**

1. **Zero documente emise, din trei magazine configurate.** Nimic nu e dovedit live, si aici
   cantareste mai mult decat la curieri: un document fiscal gresit nu se retrage, se storneaza.
2. **Limita lor de cereri e cunoscuta si neacoperita** in lot (punctul 1 de mai sus).
3. **Emailul lipseste cu totul**, desi documentatia il da printr-un camp.
4. Spre deosebire de SmartBill, unde prima factura reala a confirmat reparatia in 16 minute, **aici
   nu exista nicio bucla de confirmare**: prima factura Oblio va fi si prima proba.

**Probe:** 11 noi la clientul Oblio, 14 comune celor trei case, 11 la garda de PDF. Banc de mutanti:
**5 prinsi**, doi **echivalenti** (nu schimbau purtarea) si unul care a gasit o slabiciune in chiar
reparatia mea, si a schimbat-o. `tsc` curat, suita verde, build OK, fara migratie.
