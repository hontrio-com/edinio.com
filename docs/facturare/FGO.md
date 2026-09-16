# fGO: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare integrare pana cand e 10/10 din
> toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu platforma,
> si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> A treia si ultima casa de facturare. Vezi si `SMARTBILL.md` (unde sta tot traficul) si `OBLIO.md`.

**Cod:** `src/lib/fgo.ts` (clientul), `src/lib/actions/fgo.actions.ts`, `FgoConfigClient.tsx`,
`src/lib/billing/*` (regulile comune celor trei case).

---

## Expunerea masurata, 16.09.2026

| magazin | pornit | mod | serie | facturi | stornouri | comenzi |
| --- | --- | --- | --- | --- | --- | --- |
| `itp-blk` | da | ⚠⚠ **TESTARE (sandbox)** | `VOI` | **3** | **3** | 9 |

Un singur magazin, si e si singurul din platforma cu doua case pornite deodata (are si SmartBill, cu
alte 3 facturi). Toate cele 3 facturi fGO au fost **stornate**, deci azi nu exista niciun document
fGO viu.

⚠ Configurarea lui fGO nu foloseste numele celorlalte case: campurile sunt `cod_unic`,
`private_key`, `serie`, `valuta`, `tip_factura`, `platforma_url` si `sandbox`. **Prima mea
masuratoare a intrebat cu numele de la SmartBill si a iesit „fara cheie, fara serie"**, ceea ce era
fals. Intreaba cheile, nu presupune.

---

## ⚠⚠ Defectul principal: un document de TEST nu se deosebea de unul fiscal

fGO are comutator de sandbox (`api-testuat.fgo.ro`). Cu el pornit, emiterea intoarce un document care
arata **exact** ca unul adevarat: numar, serie, link, PDF valid.

Masurat: `itp-blk` are `sandbox: true` si a emis trei facturi, **toate cu link pe `testuat.fgo.ro`**.
Pe randul comenzii ele sunt indistinctibile de niste facturi fiscale: acelasi `fgo_invoice_number`,
aceeasi serie, acelasi fel de link. Pana azi, **nimic nicaieri nu spunea ca sunt de proba**: nici
ecranul la emitere (scria acelasi „generata" verde), nici randul comenzii, nici calea automata.

**Unde costa cu adevarat:** `facturaComenzii()` le-ar fi dat drept factura a comenzii, iar urcarea la
eMAG sau Trendyol ar fi trimis un document de TEST pe post de document fiscal.

⚠⚠ **Si garda pusa mai devreme azi (`esteChiarPdf`) NU-l prinde**, fiindca un document de sandbox e
un PDF perfect valid. Sunt doua verificari diferite, pe axe diferite: una intreaba „e un document?",
cealalta „e din mediul bun?".

**Ce s-a facut**, in trei locuri, fara nicio migratie:

1. **Nu pleaca la marketplace.** `eDocumentDeTest(url)` in modulul comun, chemat in amandoua
   urcarile, INAINTE de a aduce PDF-ul (n-are rost sa descarcam si sa rehostam ceva ce refuzam) si
   INAUNTRUL registrului (altfel urcarea ar ramane „in curs" pe veci). Se intoarce `esec`, **nu**
   `fara_factura`: a doua ar insemna „inca nu s-a emis", iar cronul ar reincerca la nesfarsit, tacut.
2. **Omul afla la EMITERE.** Ecranul da acum un avertisment de 20 de secunde in loc de succesul verde.
3. **Si calea automata o spune.** Acolo nu e niciun om in fata: fara randul scris, un magazin ar
   aduna luni de „facturi" de test fara ca nimeni sa se uite. ⚠ **Nu se OPRESTE**: sandbox-ul exista
   si ca sa se poata proba drumul automat, iar un refuz l-ar face de neprobat.

⚠ **Se citeste din LINK, nu din configurare.** Configurarea spune ce e ACUM; documentul a fost emis
candva. Un comerciant care iese din modul de testare nu preface retroactiv in documente fiscale
facturile emise cat timp era in el.

⚠ Lista de gazde de test contine **doar** ce am masurat sau ce scrie in codul nostru
(`api-testuat.fgo.ro` din `TEST_BASE`). SmartBill si Oblio n-au comutator de sandbox in configurarea
noastra; pusi acolo pe ghicite, ar taia documente bune.

---

## O proba de-a mea care nu apara nimic, prinsa de banc

Prima varianta a probei pentru avertismentul din panou cerea doar ca sirurile (`testuat.fgo.ro`,
`toast.warning`, `MODUL DE TESTARE`) sa **existe in fisier**. Un mutant care inlocuia `if (eTest)` cu
`if (false)` a **TRECUT**: textele ramaneau acolo, doar ca nu le mai ajungea nimeni.

Proba pinuieste acum CONDITIA si ce atarna de fiecare ramura: avertismentul pe ramura de test (cu
durata lui), succesul pe cealalta. Cu asta, si mutantul conditiei, si cel al duratei cad.

---

## Ce am verificat si era deja bine

| ce | ce e in cod |
| --- | --- |
| cheia privata | **nu se trimite niciodata in clar**: `Hash` = SHA1(`cod_unic` + `private_key` + …), majuscule |
| idempotenta | `IdExtern` trimis la emitere; fGO raspunde **409** cand documentul exista deja |
| ⚠ ce inseamna 409 | `eroareNesigura`, DESI e un 4xx: acolo furnizorul nu spune „n-am facut nimic", spune „exista deja ceva" (poate fi al nostru, poate un conflict de numerotare). Mesajul ii spune omului sa se uite in cont INAINTE sa reincerce |
| celelalte statusuri | `eroareCuStatus` (4xx = refuz dovedit, 5xx/408 = nesigur), iar erorile lor de business = `eroareRefuz` |
| registrul | `cuRegistru` + `verdictFurnizor` la emitere si stornare |
| sonda de conexiune | e un **GET public**: nu trimite `cod_unic`, nu trimite `private_key`, nu semneaza |
| corpul cererii | JSON brut cu `Content-Type: application/json`; documentatia lor avertizeaza explicit contra `x-www-form-urlencoded`, fiindca `Client` si `Continut` sunt obiect/array imbricate |
| calea automata | refuzul furnizorului era deja strigat (`fgo.autoInvoiceEsuat`) |
| `catch {}` gol | reparat azi, cu proba comuna celor trei case |

---

## Ce ramane deschis, si de ce

1. **Anularea (`/factura/anulare`) nu e legata de niciun buton** si n-a rulat niciodata in productie.
   E scrisa, cu un comentariu care spune de ce e lasata asa. Nu se atinge fara o cerere.
2. **Trei facturi, toate de test si toate stornate.** Nimic din integrarea asta n-a produs vreodata
   un document fiscal adevarat. Ca la Oblio, si spre deosebire de SmartBill.
3. ⚠ **Nu exista o oprire a facturarii automate in sandbox**, si e deliberat: proprietarul a
   confirmat hotararea pe 16.09.2026. Sandbox-ul trebuie sa ramana probabil, inclusiv pe drumul
   automat; un refuz l-ar face de neprobat. In schimb **se vede acum in trei locuri**, fiindca un
   rand in jurnal nu se citeste:
   * un panou de avertizare in configurare, cat timp comutatorul e pornit, care spune CONSECINTA
     („nu sunt documente fiscale"), nu doar ce server se foloseste;
   * chiar sub comutator, in descrierea lui;
   * **pe pagina comenzii**, langa fiecare factura emisa asa, fiindca avertismentul de la emitere
     tine douazeci de secunde, iar documentul ramane luni. Pe calea automata nu exista niciun toast.
   ⚠ Si acolo se citeste din LINK, nu din configurarea de acum: cine iese din modul de testare nu
   preface retroactiv in documente fiscale facturile emise cat timp era in el.

---

## Nota, cinstit

**9/10.**

Clientul era scris cu grija: cheia hasuita si netrimisa, `IdExtern` pentru idempotenta, 409 clasat
`nesigur` cu argumentul scris alaturi (si e chiar clasarea grea, fiindca 409 e un 4xx), sonda de
conexiune care nu trimite nimic secret. Reparatia de azi inchide singurul lucru care putea trimite
un document nefiscal la marketplace, pe o axa pe care garda de PDF n-o acopera.

⚠ **De ce nu e mai mult:**

1. **Zero documente fiscale emise vreodata.** Trei facturi, toate de test, toate stornate.
2. **Anularea e cod scris si nechemat.**
3. Ca la celelalte doua case, nimic nu e dovedit pe serverul lor de productie.

**Probe:** 13 noi (documentul de test), plus cele 14 comune celor trei case si 11 la garda de PDF.
Banc de mutanti: **6 prinsi**, dintre care unul a gasit ca o proba de-a mea nu apara nimic si a
schimbat-o. `tsc` curat, suita verde, build OK, fara migratie.
