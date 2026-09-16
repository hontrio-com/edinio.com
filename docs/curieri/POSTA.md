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

## A doua trecere, 16.09.2026: cele sapte confirmate sunt inchise

Proprietarul a cerut sa se repare tot ce se poate repara cu certitudine. Cele sapte constatari
confirmate si nereparate de la prima trecere sunt acum toate inchise. Fiecare are proba si mutant.

### 1. Plafonul de 30 de caractere nu se aplica NICIODATA codului din plaja

`codAwb` e `nvarchar(30)` la ei. Verificarea de lungime din `lipsuriExpediere` masoara corect, dar nu
vede niciodata codul alocat: ea ruleaza INAINTE de alocare, iar codul se injecteaza in corp abia
dupa. Cu un prefix lung, `prefix + cifre` trece de 30.

Si nu e o chichita de schema: Posta ori refuza trimiterea (si atunci codul e pierdut din plaja), ori
TAIE campul, si atunci coletul pleaca sub ALT numar decat cel pe care il avem noi scris pe comanda. A
doua varianta e cea scumpa, fiindca nimic nu se plange.

Oprit acum la CONFIGURARE, in `problemePlaja`, adica inainte ca vreun cod sa fie ars. La emitere ar fi
fost prea tarziu.

### 2. Sonda de conexiune putea da bifa verde pe o resursa PUBLICA

`probaConexiune` intoarce trei verdicte, nu doua, tocmai ca o bifa verde sa nu insemne nimic daca
nomenclatorul e deschis oricui. Dar cele doua drumuri citeau raspunsul cu masuri diferite: cel
autentificat, prin `listaDinRaspuns`, accepta si `{data: […]}`; sonda publica cerea
`Array.isArray(JSON.parse(text))`, adica lista goala.

Daca Posta impacheteaza, si nu stim, formatul nu e documentat pentru niciun nomenclator, sonda spunea
„nu e public" despre exact raspunsul pe care celalalt drum il citeste ca lista. Verdictul iesea
`autentificat`: bifa verde care spune ca utilizatorul si parola sunt bune, cand de fapt nu se
dovedise nimic despre ele. Exact capcana platita la eColet.

⚠ `poartaLista` raspunde acum la intrebarea SONDEI („poarta o lista?"), separat de `listaDinRaspuns`
(„care e lista?"): pentru sonda, o lista GOALA si un raspuns care nu e lista inseamna lucruri opuse,
iar `listaDinRaspuns(r).length` le confunda. Cheile sunt intr-un singur loc, `CHEI_LISTA`, ca sa nu
divergeze iar la prima cheie noua.

### 3. ⚠⚠ Refuzul se pierdea sub un eveniment administrativ

Cronul tinea minte UN SINGUR cod si striga numai daca ULTIMA stare cerea atentie si era alta decat
cea retinuta. Comentariul de atunci spunea, linistit, ca se pierde „al doilea din doua evenimente
care cer atentie", si ca la ritmul postei cazul e rar.

Masurat, pierderea era alta si mai mare: daca dupa „Refuz destinatar" (21) intra un eveniment
administrativ („Redirectionat" 35, „Reexpediat" 36, o scanare de tranzit), atunci ultima stare NU
cere atentie si refuzul nu se striga NICIODATA. Nu „al doilea": nimic.

Si nu e un caz rar. Refuzul la usa si redirectarea catre oficiu se inregistreaza in aceeasi tura a
factorului, deci ajung impreuna in acelasi raspuns. Tocmai evenimentul care cere o decizie omeneasca
e cel mai probabil urmat de unul administrativ.

Leacul e cel de la GLS, din 31.08: se tine minte CE am spus, nu CE am vazut ultima data. Coloana noua
`posta_evenimente_semnalate` (migratia `2027-01-21`, aplicata), cheia `<cod>|<data>` in forma lor.
`NULL` inseamna „prima vedere", si atunci se striga doar starea curenta, ca sa nu iasa zeci de
notificari despre lucruri incheiate la prima rulare de dupa migratie.

⚠ Regula e scoasa in `evenimenteDeSemnalat` si `spuseleDeTinutMinte`, ca sa poata fi probata direct;
cronul o cheama, si proba cade daca isi face iar una a lui.

### 4. Memoria semnalarilor nu se golea la dezlegarea AWB-ului, la Posta SI la GLS

Lista ramanea pe comanda, deci coletul urmator pornea cu ea: `primaVedere` iesea fals si un eveniment
al lui cu acelasi cod si aceeasi data era socotit „deja spus". Un retur pierdut asa nu lasa nicio
urma. Acum se pune `null` pe amandoua, adica exact starea in care comanda chiar se afla.

### 5. Istoricul din panou se rastoarna mecanic

`stari.map(…).reverse()` presupunea ca API-ul da evenimentele de la vechi la nou. Documentatia nu
spune asta nicaieri, iar codul nostru nu-i da crezare in alta parte: `ultimaStare` sorteaza dupa
datele lor tocmai fiindca ordinea nu e garantata. Venit deja de la nou la vechi, istoricul se arata
pe dos si ultima stare a coletului se citea ca prima; la un refuz sau un retur, comerciantul se uita
la ecran si trage concluzia opusa.

`istoricDeLaNouLaVechi` aseaza dupa date, cu cadere pe `.reverse()` cand fie si o singura data nu se
poate citi. Nu fiindca ar fi buna, ci fiindca e aceeasi presupunere pe care o face si `ultimaStare`,
iar doua presupuneri opuse in acelasi modul ar fi mai rele decat una singura, scrisa pe fata.

### 6 si 7. Reparate mai devreme, in aceeasi zi

- **Marcajul cronului rescria codul vechi peste un AWB reemis intre timp.** Tiparul era in noua
  locuri, la OPT cronuri; un defect copiat de opt ori nu se repara intr-un fisier. Acum starea se
  scrie doar cand exista un cod nou, iar marcajul de rotatie ramane neconditionat (sarit, o trimitere
  care pica mereu ar ramane in capul cozii la fiecare rulare si ar infometa restul platformei).
- **Galeata „autentificare" aduna si timeout-urile.** `if (status === 404) … else { autentificare++ }`
  prindea tot: retea cazuta, 500 la ei. Trei astfel de esecuri ridicau o alarma CRITICA prin care
  comerciantului i se spunea sa-si verifice utilizatorul si parola, cand de fapt Posta era cazuta. Omul
  schimba atunci o parola BUNA, nu se repara nimic, si data viitoare nu mai crede alarma. Doua galeti
  acum, doua mesaje diferite, si severitati diferite.

---

## Ce ramane deschis, si de ce

1. **Nedovedit live.** Zero magazine, zero AWB-uri, si niciun cont pe care sa probam. Butonul
   Diagnostic e scris tocmai ca prima cheie de cont sa scurteze presupunerile la adevar in cateva
   secunde.
2. **Doua lucruri nu se pot inchide fara date reale**: ce nume au campurile nomenclatorului de
   unitati, si in ce ordine vine istoricul de statusuri. Amandoua sunt tratate acum cu purtare
   definita in ambele cazuri, nu cu o presupunere tacuta.
3. **Nu exista, la ei:** eticheta tiparibila, anularea AWB, prezentarea borderoului, tarif, mediu de
   test, formatul erorilor. Fiecare lipsa e tratata pe fata in interfata, nu ascunsa.

---

## Nota, cinstit

**9,5/10.**

Integrarea era scrisa cu o disciplina pe care putine o au: tipurile luate din exemple, nu din proza;
steagul lor de status refuzat in trei locuri anume; alocarea codului **inauntrul** registrului, ca o
apasare respinsa sa nu arda un cod; si regula „unde documentatia tace, codul nu ghiceste" scrisa
peste tot.

Cele douasprezece reparatii ale zilei inchid tot ce se putea inchide fara date reale, inclusiv toate
cele sapte care ramasesera scrise si nefacute.

⚠ **De ce tot nu e 10:**

1. **Nimic n-a atins vreodata API-ul lor.** Aici asta nu e o formalitate: sase din sapte endpointuri
   au raspunsul nedocumentat, deci forma adevarata ramane o presupunere pana la prima cheie de cont.
   Nota nu poate urca peste asta, oricat de curat ar fi codul.
2. Purtarea la ordinea necunoscuta a istoricului si la numele campurilor nomenclatorului e ALEASA si
   scrisa, dar tot o alegere ramane, nu o masuratoare.

**Probe:** 13 la prima trecere + 26 la a doua. Banc de mutanti **18 din 18**. `tsc` curat, **8.415 de
probe verzi**, build OK, **o migratie** (`2027-01-21-posta-tine-minte-ce-a-semnalat.sql`, aplicata in
productie, aditiva si nullabila, deci se putea aplica inainte de deploy).

**Auditul:** 57 de agenti la prima trecere. A doua s-a facut de mana, in cod si in documentatie, la
cererea proprietarului.
