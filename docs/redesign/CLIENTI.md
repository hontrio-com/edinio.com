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

- [x] **C2. Filtre.** (activitate + valoare; judet, canal, „accepta marketing” si tag raman la etapele lor) Dupa activitate (toti, noi, recurenti, VIP, fara comenzi, inactivi
      30/90/180 de zile), dupa valoare (praguri + interval propriu), dupa comenzi (1, 2-5,
      peste 5, cu retururi, cu anulari), plus judet, sursa, canal, importat/manual/checkout,
      accepta marketing, are email, are telefon.
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

- [x] **D4. Filtrul se pastreaza la inchiderea fisei**: adresa poarta acum si perioada, si segmentul, si treapta de valoare; fisa e in stare, deci inchiderea nu atinge adresa. Ce mai lipseste e pozitia de scroll.: aceeasi cautare, pagina, sortare si
      pozitie de scroll. Adresa tine deja o parte.

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

- [ ] **G1. Adaugare manuala de client** (comenzi telefonice, magazin fizic, lead-uri).
- [ ] **G2. Arhivare**, fara sa atinga comenzile.
- [ ] **G3. Anonimizare**, pastrand ce trebuie pastrat comercial.
- [ ] **G4. Stergerea unui contact importat**, doar pentru cei fara comenzi.
      ⚠ **NU se sterge un cumparator impreuna cu comenzile, facturile si documentele lui.**
- [ ] **G5. Actiuni rapide** din fisa, fiecare respectand consimtamantul, dezabonarea si lista
      de suprimare — la fel ca trimiterea de mana din Cosuri abandonate.

## Etapa H - performanta (problema tehnica de fond)

- [ ] **H1. Profil persistent de client**, actualizat la comanda, la schimbarea de status, la
      anulare, rambursare, import si la modificarea datelor. Azi `customers_aggregate` si
      `customers_summary` parcurg TOT istoricul de comenzi la fiecare deschidere, cu `array_agg`
      pentru cele mai recente date.
      ⚠ Plus o reconciliere periodica, pentru diferentele care apar oricum.
- [ ] **H2. Paginare pe cursor** in locul celei pe pozitie, cand se ajunge la zeci de mii.

⚠ **H nu e urgenta AZI**: cel mai mare magazin are 271 de comenzi. Dar e singura care nu se
poate adauga peste, ci cere mutat din temelie — deci se hotaraste inainte sa se scrie filtrele
si segmentele, care s-ar sprijini pe ea.

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
