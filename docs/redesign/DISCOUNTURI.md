# Discounturi: ce se reface si in ce ordine

Cerut pe 21.09.2026. Ca la `CLIENTI.md` si `COSURI-ABANDONATE.md`: se bifeaza pe masura ce se
face, si tot ce scrie aici e **masurat**, nu presupus.

---

## Ce am gasit inainte sa incep

### Pe productie: functia exista, dar n-a fost folosita

| | |
|---|---|
| coduri de discount | **14**, in 6 magazine |
| folosite vreodata | **1** |
| comenzi cu cod | **1** |
| bani dati ca discount | **0,00 lei** |

⚠⚠ **Expunerea e aproape zero, si asta ridica pragul de atentie, nu-l coboara.** Singura
folosire e `PRIMA` (transport gratuit) pe comanda `#0003`, livrata. Tot ce se scrie aici merge
pe un drum pe care traficul real nu l-a batut — deci se dovedeste pe demo, si se spune limpede
cand nu se poate dovedi altfel. Aceeasi regula ca la integrarile nerulate.

### Pe demo: destule date cat sa se poata proba

16 coduri, 10 folosite, 67 de comenzi cu cod, **2.359,30 lei** dati, 34 de comenzi cu transport
oferit.

### ⚠⚠ Cifra „Utilizari" raspunde la alta intrebare decat pare

`uses_count` **scade inapoi** cand o comanda se anuleaza (`release_discount_use`). Masurat pe demo:

| Cod | Scrie „Utilizari" | Comenzi adevarate | Anulate/rambursate |
|---|---|---|---|
| BINEAIVENIT10 | 26 | **30** | 4 |
| LUMEN50 | 6 | **7** | 1 |
| CRIS15 | 3 | **5** | 2 |
| FLORI10 | 1 | **2** | 1 |

Niciuna nu e gresita: prima spune **cate utilizari sunt consumate acum** (si e cea corecta
pentru `max_uses`), a doua spune **de cate ori a fost folosit codul**. Dar pe ecran scrie doar
„Utilizari", iar comerciantul nu are de unde sa stie care dintre ele.

**Hotararea lui: se arata amandoua** — „26 folosite · 30 în total", iar a doua parte apare
numai cand difera.

### ⚠ Costul unui cod de transport gratuit nu se poate afla

`discount_amount` e 0 la codurile `free_shipping`: economia sta in `shipping_cost`, care ajunge
0 si nu pastreaza nicaieri cat ar fi fost. Pe demo, `TRANSPORTGRATUIT` arata „0,00 lei costat"
peste 5 comenzi in care transportul chiar a fost oferit. Se poate spune **cate comenzi**, nu
**cati lei**. Scris aici ca sa nu se inventeze o cifra mai tarziu.

### Ce arata ecranul azi

Un titlu, un buton „Cod nou", un tabel cu `Cod · Valoare · Utilizari · Expira · Status`, o
fereastra de adaugare/editare si una de stergere. Fara cifre in cap, fara cautare, fara filtre,
fara sertar.

⚠ **Zero diacritice**: „Sterge", „Utilizari", „Clientii", „Fara", „Anuleaza", „Creeaza",
„Salveaza", „Expira". Masurat: nicio litera cu diacritic in tot ecranul.

---

## ⚠⚠ Regula care nu se incalca niciodata aici

Validarea unui cod e un **endpoint public** (`validateDiscount`). Toate esecurile raspund azi cu
**un singur mesaj**, dinadins: patru mesaje deosebite au fost odata un oracol prin care se
puteau enumera cupoanele magazinului.

**Fiecare regula noua din etapele de mai jos trebuie sa cada in ACELASI mesaj.** Un „codul asta
nu se aplica produselor din cosul tau" ar confirma ca respectivul cod exista, si ar redeschide
oracolul. Ce are comerciantul de spus cumparatorului se scrie pe pagina magazinului, nu ca
raspuns la un cod ghicit.

⚠ Si a doua: utilizarea se revendica **atomic**, in `claim_discount_use`, chiar inaintea
inserarii comenzii. Orice regula noua care margineste cate comenzi pot folosi un cod trebuie sa
intre **in aceeasi instructiune**, nu intr-o citire de dinainte — altfel doua comenzi simultane
trec amandoua.

---

## Etapa A - pagina sa spuna adevarul (INTAI)

- [ ] **A1. „Utilizari" arata amandoua cifrele**: „26 folosite · 30 în total", a doua numai cand
      difera. Hotararea lui.
- [ ] **A2. Diacritice peste tot.** Azi nu e niciuna.
- [ ] **A3. Starea codului cu `EtichetaStare`**, nu text colorat de mana. Starile adevarate sunt
      cinci, si azi se vad doua: **activ · oprit · expirat · epuizat · programat** (ultima apare
      odata cu etapa E).

## Etapa B - cifrele din cap

- [ ] **B1. `CardStatistica`**, chiar cel de la Clienti, Statistici si Cosuri — nu unul local
      care seamana. Aceeasi linie de design peste tot, cum a cerut.
- [ ] **B2. Ce se arata**: coduri active · comenzi aduse de coduri · bani dati ca discount ·
      valoarea comenzilor cu cod. ⚠ Cu fereastra de timp (`PERIOADE`), ca la Clienti si Cosuri.

## Etapa C - lista

- [ ] **C1. Tabel pe desktop, carduri pe telefon** — tiparul de la Clienti, masurat acolo: un
      tabel de cinci coloane taia ultimele doua pe un telefon de 390px.
- [ ] **C2. Cautare dupa cod** si **filtre pe stare** (toate · active · oprite · expirate ·
      epuizate · programate). ⚠ Niciun filtru fara date pe care sa cada.
- [ ] **C3. Sortare** dupa cele folosite, cele mai noi, si dupa cat au costat.

## Etapa D - fisa unui cod

- [ ] **D1. Sertar lateral**, ca la Clienti (`cosuri/SertarCos.tsx` e tiparul), nu fereastra in
      mijloc: lista ramane vizibila si se trece repede de la un cod la altul.
- [ ] **D2. Inauntru**: regulile codului, cate comenzi a adus, cati bani a costat, si **lista
      comenzilor** pe care s-a folosit.

## Etapa E - programare: de cand pana cand ✅ GATA (21.09.2026)

> Ceruta de el.

- [x] **E1. `starts_at`**, pe langa `expires_at` care exista deja.
- [x] **E2. Starea „programat"** pe ecran. Era deja scrisa in `stare.ts` si in filtru, dar nu se
      putea aprinde niciodata: coloana nu exista.
- [x] **E3. Regula intra si in `validateDiscount`, si in `claim_discount_use`**, si cade in
      acelasi mesaj unic.

### ⚠⚠ Ce am gasit pe drum, si n-am cautat

**1. Ziua scrisa de comerciant nu era o zi.** Formularul trimitea „2026-08-31", `TimeZone` al
bazei e UTC, deci in coloana ajungea `2026-08-31 00:00:00+00` — ora 03:00 dimineata, ora
Romaniei, in CHIAR ziua aceea. Cine scria „tine pana pe 31 august" pierdea 21 de ore din ultima
zi, si codul murea in somn. `starts_at` ar fi mostenit capcana pe dos.
Reparat in `src/lib/discounts/perioada.ts`: ziua romaneasca se preface o singura data in clipa
exacta (00:00:00,000 si 23:59:59,999), cu ora de vara citita din chiar fus. Probat si pe un
proces pornit pe UTC si pe unul pe America/New_York, fiindca aici, pe un calculator romanesc,
defectul nu se vedea niciodata.
⚠ Masurat pe productie inainte de atins: 14 coduri, doua cu data, unul singur viu.

**2. Revendicarea nu verifica decat plafonul.** Un cod stins de comerciant, expirat sau (de azi)
inca programat se revendica oricum, fiindca toate celelalte reguli stau in `validateDiscount`,
adica intr-o citire de acum cateva sute de milisecunde. Acum cele patru conditii sunt in CHIAR
`update`-ul care scrie.

**3. `increment_discount_uses` era o a doua usa catre acelasi contor**, fara nicio conditie,
`security definer`, data lui `service_role`. Zero apelanti masurati, oriunde. Stearsa.

**4. Un cod PROGRAMAT putea pleca azi in emailul de cos abandonat.** Lista din automatizari se
filtra pe loc, doar pe `expires_at`; pana ieri `is_active` tinea loc de restul, de azi nu mai
tine. Iar auto-aplicarea din linkul `?code=` inghite orice esec fara sa arate un cuvant: omul ar
fi platit intreg dupa ce i s-a promis o reducere in scris. Acum lista intreaba `sePoateFolosi`,
cronul reciteste codul la trimitere, si capcana din panou spune adevarul.

**5. `validateDiscount` si `claim_discount_use` n-aveau NICIO proba** — nici una singura, desi
tin regula anti-enumerare si atomicitatea contorului. Scrise acum, si probate cu mutanti: 6 din
6 si 5 din 5 prinse.

**6. Mesajul de la revendicare era al lui**, nu cel unic: „Codul a atins limita maxima de
utilizari", pe un drum public (`placeOrder` e `"use server"`). De azi e si neadevarat, fiindca
trei din cele patru motive nu mai sunt plafonul. Cade in `ESEC_CUPON`; motivul adevarat pleaca
in `error_logs`. ⚠ Si vitrina scoate singura cuponul cand chiar el a oprit comanda, altfel omul
ramanea blocat: mesajul unic nu mai are voie sa-i spuna ce sa faca.

## Etapa F - o data per client ✅ GATA (21.09.2026)

> Ceruta de el.

- [x] **F1. `per_customer_limit`** (implicit: fara limita).
- [x] **F2. Cine e „acelasi client" e CHEIA facuta la sectiunea Clienti**, socotita IN SQL
      (`discount_customer_key`) — nu in TypeScript, unde exista DOUA functii `normalizePhone`
      care dau raspunsuri deosebite.
- [x] **F3. Verificarea sta in revendicare**, nu intr-o citire de dinainte.

### ⚠⚠ Dar NU asa cum scria aici

Planul spunea „in aceeasi instructiune cu incrementul". **Nu se poate**, si nu din lene:

1. La clipa revendicarii **comanda inca nu exista** (`order.actions.ts:1887` fata de `:1914`),
   deci o numaratoare peste `orders` numara zero de fiecare data.
2. Chiar daca ar exista: zavorul e randul din `discounts`. Sub READ COMMITTED a doua tranzactie
   asteapta lacatul si RECITESTE randul incuiat — dar subinterogarea peste `orders` se citeste
   mai departe pe instantaneul de la inceputul instructiunii. **Adevarul nu sta in randul
   zavorat.**

De-aia utilizarea **nu se numara, se REZERVA**: un rand intr-un registru al ei
(`discount_customer_uses`), cu index UNIC pe `(discount_id, customer_key, ordinal)`. Indexul
unic e singurul lucru care serializeaza doua tranzactii care nu ating acelasi rand deja
existent.

**Probat cu cursa adevarata**, nu prin rationament: cereri paralele catre baza demo —
10 deodata pe limita 1 → **1**; 12 pe limita 3 → **3**; 25 pe limita 1 → **1**;
5 pe limita 5 → **5** (deci reluarea nu refuza pe nedrept).

### ⚠⚠ Si NU in `validateDiscount`

Hotarare de securitate, nu o scapare. `validateDiscount` e un capat public. Daca raspunsul lui
ar tine seama de cine e omul, atunci „valid" ar insemna **„numarul asta n-a cumparat niciodata
de aici"**, iar „nu e valid" ar insemna „a cumparat" — si oricine ar putea cerne telefoane pe
rand, cu un cod anuntat pe pagina magazinului. Oracolul nu e in TEXT, e in bitul valid/nevalid:
mesajul unic nu-l poate inchide. Pe o farmacie, pe un magazin veterinar sau pe unul de produse
intime, asta inseamna „numarul 07xx a cumparat de acolo".

Deci limita se judeca abia la apasarea pe „Trimite comanda" — iar acolo cuponul se scoate
singur din cos (etapa E), ca omul sa poata trimite comanda mai departe.

### ⚠⚠ O reparatie de temelie, gasita pe drum

`normalize_phone` **nu era idempotenta**: taia un singur zero din fata, deci `0722…`,
`00722…` si `000722…` erau trei oameni deosebiti din acelasi telefon adevarat — iar comanda
ajungea tot la el. „O data per client" se trecea adaugand un zero.

Masurat pe productie inainte: se schimba **doua chei din 541 de comenzi** (un numar german si
telefonul-fantoma `0000000000` al unei comenzi eMAG) si **zero** din cele 1.592 de randuri
`customers`. ⚠ `customers.key` e coloana GENERATA **STORED** cu aceeasi formula, iar Postgres
NU o recalculeaza la schimbarea functiei — migratia isi dovedeste singura premisa si se
OPRESTE daca vreun rand ar capata alta cheie.

### Ce s-a hotarat pe fata, fiindca raspunsul nu era evident

- **Anularea da inapoi si dreptul OMULUI**, nu doar pe al campaniei. Nedat inapoi, un cumparator
  cinstit caruia i-a picat cardul ar fi ramas blocat pe veci, cu un mesaj care nu-i poate
  explica nimic. O singura regula pentru amandoua contoarele.
- **Limita pusa pe un cod deja folosit numara doar de acum incolo.** Registrul s-a nascut azi.
  Umplut din comenzile vechi, ar fi blocat dintr-odata toti clientii care folosisera deja codul.
  Se scrie pe ecran.
- **Desfacerea unei anulari** (`reclaim_order_discount`) trece prin aceeasi rezervare, dar
  **fara portile de calendar**: comanda exista deja si a fost platita.
- **Fara telefon si fara email**, un cod cu limita se REFUZA. Masurat: zero comenzi din 541 sunt
  in situatia asta.

## Etapa G - discount pe anumite produse si categorii ✅ GATA (21.09.2026)

> Ceruta de el.

- [x] **G1. Produse pe ID, categorii pe NUME** — si NU asa cum scria planul. Vezi mai jos.
- [x] **G2. Socoteala**, cu cele trei reguli de mai jos.
- [x] **G3. Regula intra in validare SI in socoteala comenzii**, si cade in acelasi mesaj unic.

### ⚠⚠ G1 s-a facut PE DOS fata de plan, si iata de ce

Planul cerea „legaturi, nu nume: un produs redenumit nu are voie sa iasa din campanie".
**Nu se poate, si nici n-ar fi bine.** `products` poarta `category text` — un singur NUME — si
nu exista nicio tabela de legatura produs-categorie. Un id de categorie ar fi trebuit oricum
desfacut in nume ca sa se poata potrivi cu produsul.

Mai mult: sistemul de OFERTE raspunde DEJA, in acelasi checkout si pe aceeasi comanda, la
intrebarea „e produsul asta in categoria asta?" — pe nume, recursiv pe tot subarborele
(`extindeCategoriile`). Doua raspunsuri deosebite la aceeasi intrebare, in aceeasi plasare de
comanda, ar fi fost cel mai urat fel de defect: fiecare in parte pare corect, iar comerciantul
vede doar ca „uneori nu se aplica". **Deci se cheama chiar functia lor.**

Urmarile se scriu pe ecran, langa camp, ca sa nu para scapari:
- o categorie **redenumita** scoate produsele din campanie, in tacere;
- doua categorii ale aceluiasi magazin pot purta **acelasi nume** sub parinti deosebiti
  (unicitatea e pe `business_id, parent_id, name`), deci codul le prinde pe amandoua.

⚠ **Produsele** se tin pe ID, acolo unde se putea: acolo redenumirea chiar nu strica nimic.

### ⚠⚠ Cum se socoteste

- **procent** → NUMAI pe liniile potrivite. Altfel „10% la Imbracaminte" ar reduce si
  televizorul din acelasi cos.
- **suma fixa** → plafonata la valoarea liniilor potrivite. „50 de lei la Accesorii" intr-un cos
  cu accesorii de 30 de lei scade 30, nu 50.
- **transport gratuit** → cere macar o linie potrivita.
- **nimic potrivit = REFUZ**, nu „reducere zero". Ecranul punea transportul pe zero doar din
  TIPUL cuponului, deci un `free_shipping` „valid cu 0 lei" l-ar fi dat gratuit oricum.

⚠ **Fara restrangere, socoteala ramane litera cu litera cea de pana acum** — si se sprijina pe
`subtotal`, nu pe suma liniilor: liniile pot sa nu acopere tot (extraoptiuni, rotunjiri), iar o
schimbare acolo ar fi mutat bani pe TOATE codurile existente.

### Ce s-a mai reparat pe drum

**1. Re-validarea tacuta asculta doar TOTALUL.** Gasit de trei adversari, independent.
Cumparatorul scoate produsul potrivit si pune altul, nepotrivit, la acelasi pret: totalul nu se
schimba, efectul nu porneste, iar ecranul pastreaza reducerea pe un cos care nu mai indeplineste
restrangerea. Acum dependinta e o **amprenta a continutului**, in amandoua oglinzile.

**2. Transportul gratuit se hotara pe client din `type`.** Cu un cod de transport restrans,
ecranul ar fi scris „Gratuit" iar serverul ar fi incasat transportul — tiparul „ecranul scria
350, curierul incasa 500". Acum serverul intoarce un **steag** (`transportGratuit`) si ecranul
il asculta.

**3. Bannerul cuponului minte la un cod restrans.** Scria „20% reducere" din valoarea BRUTA a
cuponului, in timp ce randul de totaluri arata o suma socotita pe o parte din cos. Acum spune si
„socotită pe X din coș".

**4. `cartItems` NU contine produsul principal.** Pe calea comenzii directe, liniile aduse din
cos sunt una, iar produsul formularului alta. Cine ar fi pasat variabila care se nimereste in
scop ar fi facut ca un cod restrans CHIAR la produsul acela, folosit de pe pagina lui, sa nu
gaseasca nicio linie — si comanda s-ar fi oprit taman pe drumul pentru care a fost facuta
campania. Lista se construieste anume (`liniiPentruCupon`).

**5. Categoriile NU se primesc de la browser.** Cosul din vitrina nici nu le stie, si daca
le-ar sti tot n-ar trebui crezut: cineva ar trimite o linie inventata din categoria potrivita
si ar primi „valid". Browserul spune doar CE produse si CAT fac; raspunsul la „in ce categorie e
produsul asta" il da baza, la fel pe amandoua drumurile.

### ⚠⚠ Datorie scrisa: factura si cotele de TVA

Pe factura, o suma fara cota proprie se imparte **PROPORTIONAL** peste toate cotele comenzii
(`imparteProportional`, chemata de SmartBill, Oblio si fGO). Presupunerea de acolo e scrisa pe
fata: o reducere obisnuita micsoreaza baza FIECAREI cote. **Cu un cod restrans nu mai e
adevarata**: o reducere legata de liniile de 11% ar fi facturata ca si cum ar fi atins si
liniile de 21%. Totalul pare corect, defalcarea de TVA e gresita, si nici garda de reconciliere
n-o vede — fiindca si ea foloseste aceeasi impartire.

⚠ **Masurat pe productie (21.09.2026): ZERO comenzi din 541 poarta cota pe linie**, deci
`amestecate` e mereu fals si impartirea proportionala nu ruleaza niciodata. Defectul e real dar
**inca neexpus**.

Ce s-a facut: comanda pastreaza de pe acum **pe ce s-a socotit** cuponul, in `orders.discount_base`
(`{baza, peCote}`), fiindca dupa aceea nu se mai poate afla — preturile se schimba, categoriile
se redenumesc, produsele se sterg.

Ce **NU** s-a facut, si e o datorie scrisa, nu o scapare: **facturarea inca nu citeste coloana
aia**. Cand prima comanda cu cote amestecate va purta un cod restrans, adevarul va fi deja
pastrat, dar `peGrupe` trebuie invatata sa-l foloseasca.

## Etapa H - doar la prima comanda ✅ GATA (21.09.2026)

> „Sa avem mai multe optiuni de discount." Intrebat care, dintre trei candidati, **a ales unul
> singur: „doar la prima comanda"**. Ceilalti doi raman nefacuti, si se scrie aici de ce, ca sa
> nu para uitati:
>
> - **de la N bucati in sus** — treptele exista deja la produse
>   (`order-modal-quantity-tiers`), deci motorul se imprumuta. Se leaga firesc cu G: „de la 3
>   bucati din categoria asta".
> - **cumperi X, primesti Y** — cel mai scump: atinge liniile comenzii, stocul produsului daruit
>   si factura. ⚠ Si se apropie mult de ce fac deja **Ofertele** (`order_bump`,
>   `frequently_bought`): inainte de a-l face, merita intrebat daca nu se suprapun.

- [x] **H1. `doar_prima_comanda`**, un comutator pe cod.
- [x] **H2. Se judeca la REVENDICARE**, nu la aplicarea codului — acelasi motiv ca la F.
- [x] **H3. Implica o singura folosire per client**, si asta inchide o cursa.

### ⚠⚠ „Prima comanda" inseamna de la sine O SINGURA DATA

Fara asta ramanea o cursa: doua comenzi trimise deodata la primul cumparat ar fi vazut amandoua
zero comenzi de dinainte, si ar fi trecut amandoua. De-aia limita LUCRATOARE cade pe 1 chiar
cand `per_customer_limit` e gol — si atunci indexul unic de la F serializeaza cererile.

In formular, campul „de cate ori il poate folosi un client" se STINGE cand comutatorul e pornit,
si arata 1. Stins, nu ascuns: omul vede ce valoare are codul lui si de ce nu o poate schimba.

### Ce s-a hotarat pe fata

- **Se numara ORICE comanda de dinainte, si cele anulate.** Comerciantul spune „pentru clienti
  noi"; cineva care a comandat si a anulat nu mai e nou. Scris pe ecran, langa comutator.
- **Intrebarea despre trecut se pune INAINTE de orice scriere.** Raspunsul ei nu depinde de ce
  facem acum, deci refuzul nu lasa nimic de compensat. Pusa dupa rezervare, un cod de bun venit
  refuzat ar fi lasat randul de registru scris, si omul n-ar mai fi putut folosi codul niciodata
  desi nu i s-a dat nimic.
- **Desfacerea unei anulari NU reintreaba.** Acolo omul ARE deja comanda — chiar pe cea readusa
  la viata — deci intrebarea n-ar mai avea raspuns bun niciodata.
- **Are un index sub ea.** Fara `idx_orders_business_customer_key`, „are omul asta vreo
  comanda?" ar fi fost o parcurgere a intregii tabele de comenzi la FIECARE plasare cu un cod de
  bun venit, adica pe drumul cel mai cald al magazinului.

### ⚠ Si o capcana de dosar, gasita de proba

Migratia se numeste `2026-09-22-…`, cu data zilei URMATOARE, si e dinadins: ea rescrie
`claim_discount_use`, deci trebuie sa se aseze DUPA `2026-09-21-discounturi-un-om-o-data.sql`.
Dosarul n-are numere de ordine — in aceeasi zi ordinea o da numele — iar „prima-comanda" s-ar fi
asezat inaintea lui „un-om-o-data" si, pe o baza refacuta din dosar, regula ar fi fost stearsa
in tacere de migratia de dinaintea ei. Aceeasi capcana m-a prins deja o data azi, la F.

---

## Paginare: lista se cere din baza ✅ GATA (22.09.2026)

> Cerut de el, dupa ce a intrebat daca sectiunea are paginare: „trebuie rezolvat de acum pentru
> viitor in caz ca un magazin o sa aiba mult mai multe coduri".

Pana atunci pagina aducea TOATE codurile magazinului intr-o singura citire, fara `limit` si fara
`range`, iar cautarea, filtrele si sortarea lucrau in memoria browserului. Era o alegere scrisa
pe fata si masurata: 14 coduri in 6 magazine, cel mai incarcat are 5, media 2,3.

⚠⚠ **Marginea de sus nu era insa numarul acela, ci plafonul PostgREST — o mie de randuri.** Un
magazin cu peste o mie de coduri (o campanie cu coduri unice) ar fi vazut lista **taiata in
tacere**, fara nicio eroare, iar cifrele din cap ar fi fost socotite pe ce s-a nimerit sa incapa.

### Ce s-a facut

- `discounts_page(bid, search, stare, sort, limit, offset)` — o pagina, filtrata si sortata in
  Postgres, cu `count(*) over ()` pentru totalul multimii filtrate **in acelasi drum**. Fiecare
  rand isi poarta si cifrele codului, deci nu mai e nevoie de o a doua citire peste tot
  magazinul.
- `discount_state_counts(bid, search)` — cifrele de langa filtre, numarate **peste cautare**.
- `discount_totaluri(bid)` — cele patru carduri din cap, socotite pe **tot magazinul**. Adunate
  din lista adusa, cum erau pana atunci, ar fi SCAZUT cu fiecare pagina rasfoita.
- Cautarea, filtrul, sortarea si pagina vin din **adresa**, ca la Clienti: un filtru pus se poate
  trimite prin legatura, iar „inapoi" din browser se intoarce la ce vedeai.
- Index pe `(business_id, created_at desc)`, fiindca sortarea implicita e „cele mai noi".

### ⚠⚠ Si asta a adus regula de stare in DOUA copii

Filtrul trebuie sa aleaga randurile in baza, iar eticheta trebuie desenata pe ecran. Deci
`public.discount_state` si `stareaCodului` spun acum acelasi lucru in doua locuri — exact lucrul
pe care sectiunea il ocolise dinadins pana atunci.

Doua copii se despart, iar cand se vor desparti filtrul „Expirate" va arata alte coduri decat
cele scrise „Expirat" in tabel, fara nicio eroare. De-aia exista
`starea-e-aceeasi-si-in-baza.test.ts`, care compara **ordinea** si **conditiile** din corpul
functiei SQL cu cele din TypeScript. ⚠ Ordinea de pe ecran nu e scrisa de mana in proba: se
AFLA, punand `stareaCodului` in fata unui cod care are toate pricinile deodata si scotandu-le pe
rand — altfel proba ar fi fost a treia copie a aceleiasi reguli.

⚠ `asezate()` si `catePeStare()` au fost **sterse** din `filtre.ts`. Lasate, ar fi fost o a doua
socoteala pe langa cea din baza.

### Ce s-a mai ales pe drum

- **Cautarea escapeaza `%` si `_`.** Sunt metacaractere in `like`: fara asta, cine scria `%`
  primea toate codurile. (La `validateDiscount` aceeasi scapare era o gaura de bani.)
- **Asezarea alfabetica e cea a casei** (`public.ro_numeric`, ICU `ro-RO-u-kn-true`), aceeasi pe
  care o folosesc catalogul si categoriile. ⚠ E o asezare CU NUMERE: „VARA2" vine inaintea lui
  „VARA10", nu dupa — altceva decat facea `localeCompare` pe ecran, si mai bine.
- **Golul spune de ce e gol**, si sunt doua goluri deosebite: magazin fara niciun cod (invitatia
  de a face primul) si cautare fara rezultat (bara de filtre ramane, ca omul sa se poata
  intoarce).
- **Rasfoirea apare numai cand chiar sunt mai multe pagini**, aceeasi regula ca bara de filtre.

**Probat pe demo cu 161 de coduri**, facute anume: pagina 1 arata „1–25 din 161 de coduri" si
„1 / 7"; „Inainte" duce la `?page=2` si la „26–50"; `?stare=epuizat&sort=alfabetic` arata
„Epuizate (25)" si 25 de randuri, toate scrise „Epuizat" in tabel.

## Cum se deseneaza

> „Sa faci aceeasi linie de design ca pana acum cum ai facut la Clienti si Cosuri abandonate,
> pastram peste tot aceeasi linie de design" (21.09.2026)

Concret, in codul asta: `CardStatistica`, `EtichetaStare`, `Panel`, tiparul de sertar din
`cosuri/SertarCos.tsx`, `PERIOADE` din `lib/perioade.ts`. Fara culori scrise de mana, fara
ornamente. Cifra mare, eticheta mica. O coloana pe telefon la carduri — masurat la Clienti de ce.

## Ce NU se face acum

- **„Cat m-a costat fiecare cod" ca sectiune de rapoarte.** Am masurat-o si datele exista
  (ANAHOME20: 612,92 lei dati, 2.581,83 lei adusi), dar nu a fost ceruta. Cifrele intra in
  cardurile de la B si in fisa de la D, nu intr-un raport separat.
- **Coduri unice generate in masa.** Oferita, nealeasa.
