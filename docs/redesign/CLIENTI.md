# Clienti: ce se reface si in ce ordine

Analiza proprietarului, 21.09.2026. Fisierul asta e planul; se bifeaza pe masura ce se face,
ca `STATISTICI.md` si `COSURI-ABANDONATE.md`.

---

## ⚠ Doua hotarari ale lui, care bat analiza lipita

Analiza lui cere in antet `[Exporta] [Importa] [+ Adauga client]` si are o sectiune intreaga
despre export cu campuri configurabile. **El a spus apoi, direct: „scoatem butonul de Export,
lasam doar buton de Import".** Se face cum a spus direct. Scris aici ca sa nu para uitat si ca
sa se poata intoarce cu o singura vorba.

Si: cardul **„Clienti" ramane numarul TOTAL**, nu unul taiat pe fereastra de timp. Intrebat
anume, a raspuns „numarul total de clienti practic".

---

## Ce am gasit pe productie inainte sa incep

| Magazin | Comenzi | Clienti in pagina | Cheie pe telefon | Cheie pe email |
|---|---|---|---|---|
| Suporti-Numar.ro | 271 | **268** | 271 | 0 |
| VetDepo | 182 | **158** | 140 | **42** |
| Yvelle | 31 | **31** | 0 | **31** |
| INSULA BUCURIEI | 11 | 9 | 11 | 0 |
| MH Tools | 11 | **3** | 11 | 0 |
| mokka | 8 | 2 | 8 | 0 |
| CAIAN TEXTILE | 5 | 5 | 5 | 0 |

⚠ **Greul e in doua magazine, dar sectiunea are date in 20.** Restul au sub zece comenzi, deci
tot ce se face aici trebuie sa arate bine si la cinci randuri, nu doar la trei sute.

⚠ **Contacte importate pe productie: ZERO**, in toate magazinele. Deci despartirea
„cumparatori / contacte importate" (punctul 4 al lui) se face pe un drum care azi n-are trafic:
se construieste cu grija, dar nu se poate dovedi pe date adevarate. Vezi regula despre
integrarile nerulate.

⚠ **Identitatea clientului e o singura cheie, in cascada**: telefon normalizat → `email:<adresa>`
→ `order:<id>`. Masurat: **zero** comenzi cad pe ultima treapta, si **zero** cazuri in care
acelasi om apare de doua ori (o data pe telefon, o data pe email). E o capcana care doarme, nu
o gaura care curge — exact ce spune punctul 5 al lui.

---

## Etapa A - pagina sa spuna adevarul (INTAI, ca la Cosuri)

Toate patru punctele lui dintai sunt despre acelasi lucru: pagina spune azi lucruri pe care nu
le masoara. Se repara inaintea oricarei frumuseti.

- [x] **A1. „Fidel" devine „Recurent".** Azi badge-ul apare la `paid_order_count > 1`, adica
      la a doua comanda. **Doua comenzi nu inseamna fidelitate.** „Recurent" spune exact ce
      masoara. „VIP" ramane pentru mai tarziu, cu reguli (A5).

- [x] **A2. `paidOrderCount` nu numara comenzi platite.** Exclude doar anulate si rambursate,
      deci INCLUDE in asteptare, neplatite, in procesare si refuzate-dar-neanulate. Numele si
      eticheta „Total cheltuit" promit mai mult decat masoara.
      **Se aleg doua marimi, cu nume care nu mint:**
      - **Valoarea comenzilor** = tot ce nu e anulat/rambursat (marimea comerciala);
      - **Total incasat** = doar ce e chiar platit sau livrat, dupa metoda de plata.
      ⚠ Se redenumeste si campul din cod, nu doar eticheta de pe ecran.

- [x] **A3. Numarul de comenzi si suma vorbesc despre multimi diferite.** In lista scrie
      „5 comenzi · 1.240 lei cheltuit", dar cele 5 pot cuprinde doua anulate, pe cand suma le
      scoate. Se arata **„3 comenzi valide · 5 in total"**, iar in fisa desfacut: totale,
      valide, anulate, rambursate.

- [x] **A4. Cumparatori ≠ contacte importate.** Cardul „Clienti" ii numara la un loc, deci
      „2.000 clienti" poate insemna 250 de cumparatori si 1.750 de contacte.
      Se despart: **Cumparatori** (macar o comanda), **Contacte importate** (nicio comanda),
      **Total contacte**. In lista raman impreuna, cu badge si filtru.
      ⚠ Azi importatii sunt ZERO pe productie; se construieste pe date demo si se spune asta.

- [x] **A5. Badge-uri pe client**, in locul unuia singur: Nou, Recurent, VIP, Inactiv,
      Importat, Risc ridicat de retur.
      ⚠ Fiecare are nevoie de o REGULA scrisa si de date pe care sa stea. „Risc ridicat de
      retur" cere retururi numarate pe client; daca nu exista, badge-ul nu se pune. Un badge
      care nu se poate aprinde niciodata e mai rau decat lipsa lui.
      ⚠ VIP e configurabil (min. comenzi, min. cheltuit, comanda in ultimele 90 de zile).

- [x] **A6. Capcana identitatii, scrisa si tinuta cu o proba** care cade daca apar chei
      `order:<id>` — semnul ca s-au ivit comenzi fara telefon SI fara email.

## Etapa B - cifrele din cap

- [x] **B1. Selector de perioada** (30 de zile, 90, anul acesta, tot istoricul, personalizat),
      aceeasi forma ca la Statistici si Cosuri. Lista ramane pe tot istoricul; **sumarul spune
      apasat pe ce perioada e**.

- [x] **B2. Alte KPI-uri.** „Venit total" si „Valoare medie comanda" exista deja la Statistici;
      aici sunt mai utile marimile despre RELATIA cu oamenii:
      **Cumparatori · Clienti recurenti · Rata de revenire · Valoare medie per client.**
      ⚠ Cardul **„Clienti" ramane numarul total** (hotararea lui).
      ⚠ Rata de revenire se scrie cu numitorul la vedere: „24% — 86 din 358 de cumparatori au
      comandat din nou". O rata fara numitor nu se poate verifica.

- [x] **B3. Cardurile devin CHIAR `CardStatistica`**, nu `StatCard`-ul local din fisier.
      Aceeasi greseala reparata la Cosuri (F1): doua carduri care SEAMANA diverg la prima
      retusare. Se muta, nu se copiaza.

## Etapa C - lista

- [x] **C1. Tabel compact pe desktop**, card/lista pe telefon:
      `Client · Segment · Comenzi · Ultima comanda · Total · Status`.

- [x] **C2. Filtre**: activitate, valoare, **judet** si **canal**.
      ⚠⚠ **Meniurile de judet si canal se fac DIN DATE**, nu dintr-o lista scrisa in cod
      (`customer_filter_options`). Cele 42 de judete ale tarii, la un magazin care livreaza in
      douasprezece, ar fi insemnat treizeci de alegeri care nu gasesc pe nimeni — adica exact
      filtrul pe care regula de mai jos spune sa nu-l oferim. Fiecare optiune vine cu numarul
      ei: „Cluj (18)".
      ⚠ **Meniul nu apare deloc daca magazinul are o singura valoare**: un meniu cu o
      optiune nu filtreaza nimic, doar il pune pe om sa-l deschida ca sa afle asta.
      ⚠⚠ **Canalul NU e `order_source`**: campul acela are 465 de valori deosebite din 537
      de comenzi (poarta si numarul comenzii de la marketplace, si identificatorul coletului).
      Canalul adevarat sta in cheia `marketplace` dinauntru, iar lipsa ei inseamna „magazin".
      ⚠ **Judetul si canalul intra si in criteriile segmentelor salvate**, odata cu filtrele.
      Adaugate dupa, un segment salvat intre timp ar fi pastrat jumatate de filtru si ar fi
      aratat toata tara sub un nume care spune „Clientii mei din Cluj".
      ⚠ Raman nefacute, fiindca n-au pe ce sta: „accepta marketing" (nu exista consimtamant
      pe client), „tag" (nu exista etichete scrise de comerciant) si filtrul „adaugat manual"
      (exista de azi, dar pe productie are zero randuri — vezi `lib/customers/filtre.ts`).
      ⚠ **Niciun filtru fara date pe care sa cada.** Judetul vine din ultima comanda si nu
      exista peste tot; „accepta marketing" cere consimtamant inregistrat. Ce n-are pe ce sta,
      nu se ofera.

- [x] **C3. Telefonul intr-o singura forma.** Masurat in lista de azi: `0753 639 611`,
      `+40 755 588 107` si `+359 88 412 3309`, unul sub altul.

- [x] **C4. Starea ultimei comenzi cu `EtichetaStare`**, nu text gri.

## Etapa D - fisa clientului

- [x] **D1. Sertar lateral pe desktop**, nu fereastra in mijloc: lista ramane vizibila, se
      trece repede de la un client la altul, si e mai multa inaltime. Pe telefon ramane peste
      tot ecranul. Exista deja tiparul: `cosuri/SertarCos.tsx`.

- [x] **D2. File inauntru**: Prezentare · Comenzi · Activitate · Date si preferinte.

- [x] **D3. Statistici desfacute**, cu numele de la A2/A3: comenzi totale, valide, total
      comandat, total incasat, valoare medie, ultima comanda, retururi.

- [x] **D4. Filtrul si pozitia se pastreaza la inchiderea fisei.** Adresa poarta cautarea,
      pagina, sortarea, perioada, segmentul, treapta de valoare, judetul si canalul; fisa e in
      stare, deci deschiderea si inchiderea ei nu ating adresa.
      ⚠ **Si pozitia de derulare se pastreaza** — masurat, nu presupus: 800px inainte de
      deschidere, 800 cu fisa deschisa, 800 dupa inchidere, iar `body` nu primeste blocare de
      derulare. A rezolvat-o **D1**: sertarul lateral nu navigheaza nicaieri, deci n-are ce
      sa piarda. Fereastra din mijloc, care era inainte, ar fi cerut o reparatie anume.

## Etapa E - terminologie si texte

- [x] **E1. Diacritice peste tot**: „Clienți", „Clienți recurenți", „Valoare medie comandă",
      „Activitate recentă", „Caută după nume, telefon sau email".

- [x] **E2. Descrierea paginii**, azi prea tehnica („grupați automat după numărul de telefon").
      Devine: „Gestionează cumpărătorii, istoricul comenzilor și segmentele magazinului", iar
      explicatia despre grupare intra intr-un „Cum identificăm clienții?".

## Etapa F - segmente (valoarea comerciala cea mai mare, dupa el)

- [x] **F1. Trei file in pagina**: Toti clientii · Segmente · Importuri. **Fara** intrare noua
      in meniu. Fila sta in ADRESA (se poate trimite prin legatura), spre deosebire de filele
      din fisa clientului, care stau in stare.

- [x] **F2. Segmente implicite** (cele noua, fiecare cu numarul lui) **si segmente proprii**,
      salvate din filtrele alese, cu numele si criteriile la vedere.
      ⚠⚠ **Un segment pastreaza CRITERIILE, nu oamenii.** Salvat ca lista, ar fi inghetat in
      ziua salvarii, iar comerciantul ar fi trimis campanii unei liste moarte.
      ⚠⚠ **Regula „cine intra in segment" a fost MUTATA intr-un singur loc**
      (`customer_in_segment`), fiindca numarul de pe placa si lista de sub ea trebuie sa fie
      socotite la fel. Verificat pe demo: aceleasi zece cifre inainte si dupa mutare.
      ⚠ **Numarul se da numai segmentelor salvate care sunt CHIAR un segment**, fara alte
      filtre: al celorlalte ar fi cerut cate o trecere prin tot istoricul, la fiecare
      deschidere. Mai bine fara cifra decat cu una scumpa.
      ⚠ **Unicitatea numelui se apara in INDEX, nu in cod.** Prima scriere se bizuia pe
      curatarea din TypeScript; probat pe demo, „  vip DE valoare Medie  " intra pe langa
      „VIP de valoare medie".

- [ ] **F3. Legarea lor** de discount, email, SMS, automatizari, audiente. **NEFACUTA, si nu
      din lipsa de timp.** Campaniile SMS au vocabularul LOR de filtre (`SmsFilters`: fereastra
      de comenzi, suma minima), care nu se suprapune peste criteriile unui segment. O potrivire
      pe jumatate — una care scapa tacut treapta de valoare, de pilda — ar trimite o campanie
      **platita** altei liste de oameni decat cea de pe ecran. Legarea isi are locul la **G5**,
      impreuna cu consimtamantul, dezabonarea si lista de suprimare.

### F4 (nu era in plan, a iesit pe drum) - istoricul importurilor

- [x] Pana azi importul **nu lasa nicio urma**: se termina cu un mesaj pe ecran, iar peste o
      saptamana nimeni nu mai stia cand s-a facut, din ce fisier si cati au intrat. Acum se
      scrie un rand, iar fila „Importuri" il arata.
      ⚠ **Scrierea urmei nu are voie sa strice importul**: clientii sunt deja in baza, iar o
      eroare aici l-ar face pe om sa creada ca n-a mers si sa reimporte. E prinsa si jurnalizata.
      ⚠ **Istoricul incepe de AZI**, si fila o spune: importurile de dinainte n-au lasat nimic
      si nu se pot naste acum din nimic.
      ⚠ **Carduri pe telefon, tabel pe desktop.** Masurat: tabelul celor cinci coloane cere
      600px intr-o cutie cu `overflow-hidden`, deci pe un telefon de 390px ultimele doua
      coloane erau pur si simplu de neajuns.

## Etapa G - gestionarea clientilor

- [x] **G1. Adaugare manuala de client** (comenzi telefonice, magazin fizic, lead-uri).
      ⚠ **Judecata e in baza** (`customer_add_manual`), fiindca acolo se naste cheia
      clientului. Facuta in TypeScript, ar fi cerut a treia copie a lui `normalize_phone`.
      ⚠ **Trei feluri de „nu", cu trei mesaje**: fara contact / exista deja un contact /
      **omul are deja comenzi**. Ultimele doua nu sunt acelasi lucru: la al doilea,
      comerciantul se uita la un cumparator, care n-are rand in `customers` si nu se sterge.
      ⚠ **Numai „adaugat" inchide fereastra.** Inchisa oricum, omul ar fi ramas cu impresia
      ca s-a scris ceva.

- [x] **G4. Stergerea unui contact**, doar pentru cei fara comenzi.
      ⚠⚠ **Paza e in CHIAR instructiunea care sterge** (`delete ... where not exists`), nu
      intr-o citire de dinainte: intre cele doua incape chiar comanda omului, plasata in
      secunda aceea. `gestionarea-clientilor.test.ts` cade daca paza se muta afara (probat).
      ⚠ **Zero randuri nu e izbanda**: „gata, l-am sters" peste zero randuri l-ar lasa pe
      comerciant sa creada ca a facut curat.
      ⚠ Butonul se arata si cand nu se poate, dar **stins, cu motivul scris**. Ascuns, omul
      l-ar fi cautat prin toate filele si apoi prin Setari.

### ⚠⚠ Ce a iesit la iveala in aceeasi zi: o eticheta care a inceput sa minta

Badge-ul **„Importat"** se punea dupa `orderCount === 0` — adevarat exact cat timp importul
era singurul drum catre un contact fara comenzi. In chiar ziua in care s-a scris adaugarea de
mana, un om luat la telefon a aparut in lista scris **„Importat"**: nicio eroare, nicio proba
cazuta, doar o propozitie falsa despre el.

Reparat citind **chiar insusirea** (`customers.source`, dus pana la ecran), nu una din care se
ghiceste ea. Eticheta s-a despartit in „Importat" si „Adaugat manual".

⚠ Plasa veche a facut exact ce trebuia: proba care cerea „sase etichete, fiecare cu explicatia
ei" a picat in clipa in care au devenit sapte.

- [x] **G3. Anonimizare.** Cerut apoi anume: „trebuie sa avem posibilitatea de stergere a
      utilizatorului". Intrebat ce inseamna pentru cineva care ARE comenzi, a ales
      **anonimizarea**, nu stergerea.
      ⚠⚠ **Listele de dezabonare NU se ating.** Omul care cere sa fie sters e, de cele mai
      multe ori, chiar cel care ceruse sa nu mai primeasca mesaje. Sters si randul acela,
      prima campanie de a doua zi l-ar gasi din nou — adica „stergerea" ar avea ca urmare
      exact lucrul de care fugea. `recovery_optout` si `sms_optout` raman.
      ⚠⚠ **Adresa se curata cu LISTA ALBA, sursa cu LISTA NEAGRA**, si asta nu e o
      nepotrivire: in `shipping_address` partea personala creste singura (fiecare curier isi
      scrie cheile lui), pe cand in `order_source` partea personala e scrisa de codul nostru
      si e inchisa, iar cheile de BANI se inmultesc cu fiecare marketplace. Partea care creste
      fara stirea noastra nu are voie sa fie cea pe care o ghicim.
      ⚠⚠ **Emailul anonim e un uuid, nu un hash**: un hash de telefon se sparge in zece
      cifre. Si trebuie sa EXISTE, acelasi pe toate comenzile omului — lasate goale, cheia ar
      fi cazut pe `order:<id>` si fiecare comanda ar fi devenit un „client" al ei, deci
      numarul de clienti ar fi CRESCUT dupa o stergere.
      ⚠ **Masurat pe demo, cu rollback**, pe un om cu 3 comenzi: venitul NESCHIMBAT
      (118.875,72 inainte si dupa), toate cele 393 de comenzi raman, 358 de clienti inainte si
      358 dupa — un singur rand „Client șters", nu trei. Zero date personale ramase in adresa,
      zero identificatori de urmarire.
      ⚠ Butonul din fisa face **doua lucruri dupa cum e omul**: un contact fara comenzi se
      sterge de tot, un cumparator se anonimizeaza.

- [ ] **G2. Arhivare**, fara sa atinga comenzile. **Nefacuta.** Cere un loc unde sa stea
      steagul si pentru un CUMPARATOR, care n-are rand in `customers`. Dupa anonimizare e si
      mai putin urgenta: cine trebuie scos din lista se poate scoate de-a binelea.
- [ ] **G5. Actiuni rapide** din fisa, fiecare respectand consimtamantul, dezabonarea si lista
      de suprimare — la fel ca trimiterea de mana din Cosuri abandonate. **Nefacuta**: nu
      exista azi un trimitator catre un singur client, iar consimtamantul nu se tine pe om.

## Etapa I - selectie in masa (ceruta pe 21.09.2026, dupa prima livrare)

> „Trebuie sa avem posibilitatea de selectare in masa si de a face anumite actiuni in masa."

- [x] **I1. Bife pe randuri**, cu una in cap care le ia pe toate de pe pagina.
      ⚠⚠ **Bifele se tin pe CHEIE, nu pe pozitie.** Pe pozitie, o sortare schimbata sau un
      client nou intrat ar muta bifele pe ALTI oameni — iar butonul de sub ele sterge date
      fara intoarcere. Nimeni n-ar vedea nimic: lista arata la fel.
      ⚠ **Se golesc la orice navigare**, si ce pleaca la actiune se taie pe pagina de acum.
      Altfel bara ar fi aratat „63 selectați" intr-o lista de cincizeci.
      ⚠ Bifa sta IN AFARA butonului de rand: un `<input>` intr-un `<button>` e HTML nevalid,
      iar apasarea pe ea ar fi deschis fisa in loc s-o bifeze.

- [x] **I2. Sterge / anonimizeaza in masa**, cu aceeasi regula ca la unul singur.
      ⚠ Bara spune CE AMESTECI inainte sa apesi: „1 contact se șterge de tot · 2 cumpărători
      își pierd datele, dar comenzile rămân". „Ștergi 12 clienți" ar fi fost fals pentru zece.

- [x] **I3. Descarcarea celor bifati (CSV).**
      ⚠⚠ A scos la iveala o **gaura de securitate in cod deja livrat**: exportul de cosuri
      abandonate nu oprea formulele Excel. Un cumparator care isi scrie la checkout numele
      `=HYPERLINK("http://site-rau","Factura")` se EXECUTA in fisierul pe care il deschide
      comerciantul. Regulile de CSV s-au mutat in `lib/csv.ts` si acum apara amandoua
      exporturile.
      ⚠ Butonul de Export GENERAL ramane scos, cum a cerut; se descarca doar cei bifati.

- [x] **I4. Al doilea fel de segment: cu LISTA FIXA.**
      ⚠⚠ I-am spus cand a ales ca nu se potriveste cu felul in care sunt facute segmentele.
      A ales-o oricum, deci se face — dar deosebirea e scrisa pe ecran de doua ori: inainte de
      salvare, si sub numele fiecarei liste, cu data ei. Un segment cu lista NU se mai schimba
      singur: cine cumpara maine nu intra, iar cine se dezaboneaza ramane.

## Etapa H - performanta (problema tehnica de fond)

- [ ] **H1. Profil persistent de client**, actualizat la comanda, la schimbarea de status, la
      anulare, rambursare, import si la modificarea datelor. Azi `customers_aggregate` si
      `customers_summary` parcurg TOT istoricul de comenzi la fiecare deschidere, cu `array_agg`
      pentru cele mai recente date.
      ⚠ Plus o reconciliere periodica, pentru diferentele care apar oricum.
- [ ] **H2. Paginare pe cursor** in locul celei pe pozitie, cand se ajunge la zeci de mii.

### ⚠ Ce s-a schimbat la H pe parcurs, si de ce NU se face acum

Scria aici ca H „se hotaraste inainte sa se scrie filtrele si segmentele, care s-ar sprijini pe
ea". **Nu s-a adeverit, si e bine ca nu s-a adeverit.**

Mutand regula segmentului intr-un singur loc (etapa F), toata pagina a ajuns sa citeasca printr-o
**singura usa**: `customers_merged(bid)`. Lista, numaratoarea pe segmente, filtrele de judet si
canal, meniurile — toate trec pe acolo. H1 inseamna acum sa se schimbe CORPUL acelei functii,
ca sa citeasca dintr-un tabel de profiluri in loc sa parcurga comenzile. Nimic de deasupra nu
se atinge. Din „cere mutat din temelie" a devenit un singur fisier.

**Cat costa azi, masurat pe demo (393 de comenzi → 359 de clienti):**

| | |
|---|---|
| `customers_aggregate`, o pagina de 50 | **28 ms**, 1.504 pagini de buffer |
| `customer_segment_counts`, toate zece | **71 ms**, 1.330 pagini de buffer |

Adica vreo **3,8 pagini de buffer pe comanda**, si creste liniar: la 100.000 de comenzi ar
insemna sute de mii de pagini citite la fiecare deschidere, deci secunde, nu milisecunde.

⚠ **Dar cel mai mare magazin de pe platforma are 271 de comenzi.** Un tabel de profiluri cere
declansatoare la comanda, la schimbarea de status, la anulare, la rambursare si la import, plus
o reconciliere periodica pentru diferentele care apar oricum — adica cinci drumuri noi care pot
sa se desincronizeze, pentru un castig care azi nu se vede. Se face cand cifrele o cer, si atunci
se va sti exact unde: in corpul lui `customers_merged`.

⚠ **H2 (paginare pe cursor) nu are inteles fara H1**: parcurgerea intregului istoric se face
oricum, indiferent cum se taie pagina.

---

## Cum se desenează (cerinta lui, 21.09.2026)

> „FOARTE IMPORTANT, FA DESIGN PREMIUM ASA CUM AM FACUT SI IN DASHBOARD, FARA ELEMENTE VIBE
> CODED"

Ce inseamna, concret, in codul asta:
- **Piesele existente, nu unele noi care seamana**: `CardStatistica`, `EtichetaStare`, `Panel`,
  tiparul de sertar din `cosuri/SertarCos.tsx`, `PERIOADE` din `lib/vanzari.ts`.
- **Fara culori scrise de mana** in componente: numai jetoanele temei.
- **Fara ornamente** care nu spun nimic: gradienti, umbre colorate, iconite decorative.
- Cifra mare, eticheta mica, comparatia dedesubt — ca la Statistici.

## Ce NU se face acum

- **Exportul**, scos la cererea lui (vezi sus).
- **Unirea si separarea de mana a profilurilor.** Cer identitate stabila, adica H1 intai.
