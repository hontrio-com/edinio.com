# Posta Romana: evidenta integrarii

> **Ce e fisierul asta.** Evidenta pe care o tinem pentru fiecare curier pana cand integrarea lui e
> 10/10 din toate punctele de vedere: securitate, optimizare, functionalitate, compatibilitate cu
> platforma, si conformitate cu documentatia lor. Se tine la zi ODATA CU codul, in acelasi commit.
>
> Conventia: cate un fisier per curier, in `docs/curieri/`. Al paisprezecelea.

⚠ **NU E UN CURIER, E POSTA.** Nu vine nimeni sa ridice: comerciantul DUCE coletele la oficiu. Se
vede si in API, care n-are nicio metoda de ridicare, spre deosebire de toti ceilalti.

**API-ul real:** `https://awb.posta-romana.ro/api`, autentificare HTTP Basic.

**Referinta autoritara:** `DocumentatieAPIPostaRomana.docx`, md5
`563ac09fe76ae52fcde37235544c486a`, extras integral pe 16.09.2026 (511 randuri de text; restul
fisierului de 1,5 MB sunt capturi de ecran). ⚠ **E acelasi document** pe care s-a scris integrarea,
doar cu alt nume: Anexa 2 are aceleasi 55 de statusuri.

**Cod:** `src/lib/posta/` (`client.ts`, `expediere.ts`, `statusuri.ts`, `unitati.ts`, `plaja.ts`),
`src/lib/actions/posta.actions.ts`, cronul `src/app/api/cron/posta-tracking`, ferestrele
`PostaAwbModal.tsx` si `PostaConfigClient.tsx`.

---

## Expunerea masurata, 16.09.2026

| ce | cat |
| --- | --- |
| Magazine cu Posta configurat | **ZERO** (din 129) |
| AWB-uri emise vreodata | **ZERO** |
| Operatii `posta` in registrul de operatii externe | **ZERO** |

⚠ **Zero curat**, si aici cantareste mai mult decat oriunde: **integrarea a fost scrisa cap-coada
fara sa fi atins vreodata API-ul lor.** Nu exista mediu de test si nu exista cont.

---

## Cum s-a facut trecerea

Un audit pe **sase dimensiuni** (contractul cererii, citirea raspunsurilor si verdictele, plaja de
coduri si idempotenta, statusurile si cronul, securitatea, checkout-ul si oficiile), fiecare cu
documentatia alaturi. Fiecare constatare a trecut apoi prin **trei sceptici independenti**, cu
lentile diferite, instruiti sa o INFIRME.

**17 constatari propuse, 12 confirmate de cel putin doi din trei, 5 respinse.** Fiecare dintre cele
reparate mai jos a fost verificata inca o data de mana, in cod, inainte de a fi atinsa.

---

## ⚠⚠ Firul comun al celor cinci reparatii: o tacere citita ca dovada

Regula pe care e scris tot codul acestei integrari e ca **unde documentatia tace, codul NU
ghiceste**. Sase din sapte endpointuri n-au raspunsul documentat, deci regula e chiar coloana
vertebrala. Toate cele cinci defecte de mai jos o incalca in acelasi fel: o presupunere plauzibila,
ridicata la rang de dovada, exact acolo unde dovada costa un colet sau o vanzare.

### 1. Un `3xx` la emitere era refuz DOVEDIT

Comentariul spunea „un 3xx inseamna **aproape sigur** «nu esti autentificat»", si asta e adevarat.
Dar `eroareRefuz` inseamna pentru registru „dovedit ca nu s-a intamplat nimic acolo, reincercarea e
**LIBERA**".

Documentatia lor nu descrie niciun raspuns la `POST /api/awb` si nu pomeneste nicaieri redirectari.
Daca cererea a ajuns si trimiterea s-a creat, a doua apasare arde inca un cod din plaja si face **al
doilea colet real, facturat**.

Acum: pe CITIRE ramane refuz (o citire reincercata nu strica nimic, iar sfatul „verifica datele de
acces" e cel folositor); pe SCRIERE iese `necunoscut`, care blocheaza randul si scoate cazul la om.

### 2. Cand stiam codul, nu-l foloseam ca sa lamurim o emitere nesigura

In modul plaja numarul il alegem NOI inainte de apel, iar documentatia (2.3) da o citire pura pe
chiar acel numar. **Planul era scris in comentariul alocarii si nu se facea**: `awbExista` exista in
client si nu o chema nimeni de pe drumul emiterii.

Ce costa: un timeout la `POST /api/awb` iesea `necunoscut`, codul alocat traia doar intr-o variabila
locala si se pierdea odata cu exceptia. Randul din registru nu primea nici referinta, nici detalii;
comanda ramanea fara AWB; iar la Posta putea sa existe un colet real pe care nimic din aplicatie
nu-l mai putea lega de comanda. Mesajul ii cerea omului sa caute ceva ce nu stia cum se cheama.

Acum, pe verdict nesigur si cu cod alocat, se citeste `GET /api/awb/{cod}`. ⚠ **Trei raspunsuri, si
toate trei conteaza:** exista → e chiar AWB-ul comenzii; nu exista → refuz DOVEDIT, randul se
elibereaza si se poate reincerca (mai pierdem un cod, nu un colet); nu stim → se propaga
nesiguranta, dar **cu codul in mesaj**.

### 3. Masura nomenclatorului apara denumirea, iar lista o taie localitatea

Nomenclatorul de oficii n-are raspuns documentat, deci numele campurilor sunt GHICITE si butonul
Diagnostic e singura sonda. El numara oficiile fara DENUMIRE, care e tocmai campul **cu plasa**:
cand lipseste, numele se compune din localitate sau din id, si oficiul tot poate fi ales.

Localitatea n-are nicio plasa, si ea e cea dupa care checkout-ul filtreaza: `cityMatches` pe un
`city` gol face `"".includes(...)` pe toate cele trei ramuri, adica **fals pentru orice localitate
ceruta**. Un nomenclator care numeste localitatea altfel decat ghicim noi lasa fiecare cumparator cu
„nu s-au gasit oficii in localitatea ta", **post-restantul e mort pentru toata lumea**, si
Diagnosticul raspunde vesel „toate cu denumire".

Acum se masoara si localitatea, iar panoul spune limpede ce inseamna.

### 4. Cursorul plajei se rescria dintr-o citire veche

`posta_aloca_cod()` e un `update … returning` **atomic**, tocmai ca alocarea sa nu se poata pierde.
Dar salvarea configurarii citea `urmator` si il scria inapoi. Intre citire si scriere poate rula un
lot de AWB-uri: RPC-ul muta cursorul pe 501, salvarea il pune la loc pe 500, iar urmatoarea comanda
din lot primeste **acelasi cod**. Doua trimiteri reale sub acelasi numar, la un furnizor care n-are
metoda de anulare.

⚠ Comentariul de deasupra functiei promitea deja regula („`urmator` NU se poate cobori dintr-o
salvare obisnuita"); implementarea o incalca prin chiar rescrierea lui. Acum, pe acelasi interval,
coloana ramane **neatinsa**.

### 5. O citire picata a plajei trecea drept „magazinul n-are plaja"

Amandoua raspundeau `plaja: null`, iar pagina randa comutatorul stins si campurile goale.
Comerciantul, venit pentru altceva, apasa „Salveaza" si **stergea randul cu tot cu cursor**.
Reintrodus apoi intervalul din contract, cursorul pornea de la capat si redadea coduri deja
folosite.

---

## Ce am verificat si era deja bine

| ce cere documentatia | ce e in cod |
| --- | --- |
| Anexa 2, **55 de statusuri** | comparate mecanic: 55 in document, 55 in cod, **zero lipsa, zero in plus** |
| `valoare` obligatorie si **minim 20 lei** la orice trimitere cu ramburs | `VALOARE_MINIMA_CU_RAMBURS = 20` |
| post-restant **incompatibil** cu mana proprie si factaj livrare | verificat local, inainte de apel |
| 22 de lungimi `nvarchar`, inclusiv `email 32` | toate in tabelul `LUNGIMI`, cu valorile exacte |
| tipurile se iau din EXEMPLE, nu din proza (siruri, nu numere) | camp cu camp in `expediere.ts` |
| `tipAchitareRamburs`: proza lor **se termina cu o liniuta** | se trimite doar cand e completat, cu motivul scris |
| steagul lor `statusFinal` | ⚠ NU se crede pe 56 „Anulat" (final la noi), 10 „Pierdut" (nu e final: exista 18 „Regasit") si 71 „Predat (Pachetomat)" |

---

## Ce ramane deschis, si de ce

1. **Nedovedit live (D-5).** Zero magazine, zero AWB-uri, si niciun cont pe care sa probam. Butonul
   Diagnostic e scris tocmai ca prima cheie de cont sa scurteze presupunerile la adevar in cateva
   secunde.
2. ⚠ **Sapte constatari confirmate, nereparate**, toate mici sau medii, si toate scrise aici ca sa
   nu se piarda: plafonul de 30 de caractere pentru `codAwb` nu se aplica codului din plaja (care se
   injecteaza dupa validare); proba de conexiune poate iesi verde daca nomenclatorul public vine
   impachetat in `{data: […]}`; marcajul cronului poate rescrie codul vechi peste un AWB reemis intre
   timp; semnalarea citeste doar ultimul eveniment, desi statusul se ia din tot istoricul; galeata
   „autentificare" din cron aduna si timeout-urile; istoricul din panou se rastoarna mecanic. Niciuna
   nu poate produce un colet in plus; toate merita facute cand integrarea are trafic.
3. **Nu exista, la ei:** eticheta tiparibila, anularea AWB, prezentarea borderoului, tarif, mediu de
   test, formatul erorilor. Fiecare lipsa e tratata pe fata in interfata, nu ascunsa.

---

## Nota, cinstit

**9,5/10.**

Integrarea era scrisa cu o disciplina pe care putine o au: tipurile luate din exemple, nu din proza;
steagul lor de status refuzat in trei locuri anume; alocarea codului **inauntrul** registrului, ca o
apasare respinsa sa nu arda un cod; si regula „unde documentatia tace, codul nu ghiceste" scrisa
peste tot.

Ce s-a inchis azi sunt cinci locuri in care chiar acea regula era incalcata. Trei dintre ele n-ar fi
iesit la iveala decat la prima emitere reala, si atunci ar fi costat un colet.

⚠ **Ce lipseste, si de ce nu e 10:**

1. **Nimic n-a atins vreodata API-ul lor.** Aici asta nu e o formalitate: sase din sapte
   endpointuri au raspunsul nedocumentat, deci forma adevarata ramane o presupunere pana la prima
   cheie de cont.
2. **Sapte constatari confirmate raman nereparate**, enumerate mai sus. Le las scrise, nu tacute.
3. **Doua dintre ele nu se pot inchide fara date reale**: ce nume au campurile nomenclatorului, si
   in ce ordine vine istoricul de statusuri.

**Probe:** 13 noi. Banc de mutanti **14 din 14**. `tsc` curat, **8.248 de probe verzi**, build OK,
fara migratie.

**Auditul:** 57 de agenti, sase dimensiuni de cautare si trei sceptici per constatare.
