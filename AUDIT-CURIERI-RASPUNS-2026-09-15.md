# Raspuns la re-auditul extern din 15.09.2026

Documentul asta insoteste codul actualizat. E impartit in ce am reparat, unde auditul are dreptate,
unde greseste pe fapte, unde are dreptate pe cod dar gresit pe scara, ce a ratat, si ce NU am facut
si de ce.

Regula pe care am tinut-o peste tot: **nicio constatare nu se inchide cu un comentariu, cu un
rezultat de build sau cu argumentul „nu se foloseste".** Fiecare afirmatie de mai jos are fie o
rulare de cod, fie o interogare in productie.

---

## 1. Cele doua constatari noi: amandoua sunt ADEVARATE, amandoua erau scaparile mele

### NEW-15-P1-01, forma de cinci bucati

Adevarata, si o recunosc fara rezerve. Pe 15.09 am inasprit formele de 2, 3 si 6 bucati si am
lasat-o pe a cincea permisiva, socotind-o o forma pe moarte fiindca `signShippingQuote` nu o mai
emite. Rationamentul era slab din doua pricini:

* comparatia stricta nu costa NIMIC acolo (gol cu gol trece), deci lasasem un jocher deschis fara
  niciun castig;
* „nu se mai emite" nu e o garantie: la o desfasurare in valuri sau la o intoarcere la versiunea
  veche, forma poate fi emisa din nou, iar validatorul nu are nici versiune, nici termen.

Si proba mea spunea in comentariu „patru forme" si acoperea trei. Auditul a rulat toate patru si a
gasit exact ce spune.

**Reparat.** Comparatia e stricta si pe forma de cinci. S-a adaugat o **matrice comportamentala
peste toate cele patru forme acceptate**, cu premisa verificata pentru fiecare token (tokenul de
cinci bucati e compus de mana, fiindca functia nu il mai emite, si proba cere intai ca el sa fie
valid, altfel afirmatia n-ar dovedi nimic).

Banc de mutanti: **9 din 9 prinsi**, inclusiv mutantul care pune gaura inapoi exact cum a gasit-o
auditul.

### NEW-15-P1-02, Shipo: JSON parsabil nu inseamna raspuns contractual

Adevarata. Marcajul „corpul a fost JSON" deosebea raspunsul lor de o pagina HTML, dar un gateway,
un WAF sau un balansor pot raspunde JSON. Exemplul din audit trecea.

**Reparat, dar nu asa cum cere auditul, si spun de ce.** Auditul cere „HTTP 200 + `success:false` +
mesaj/cod normalizat EXACT la valoarea documentata". Am pus primele doua conditii si am lasat
tiparul de text asa cum e:

* **statusul 200 se poate DOVEDI din cod**: `apel` arunca pe un 2xx numai cand `esteRefuz(date)` e
  adevarat, adica numai cand corpul lor poarta `success: false`. Deci „status 200 + eroare aruncata"
  inseamna deja raspunsul de afaceri al lor. Orice 4xx sau 5xx, cu orice fel de corp, ramane eroare;
* **sirul exact NU se poate dovedi fara sandbox.** Un sir gresit ar refuza anularea cinstita si ar
  lasa comerciantul cu un AWB mort pe comanda, fara niciun buton care sa-l scoata. Acela e un defect
  pe care platforma l-a trait deja la Packeta. Intre „poate accept prea mult" si „sigur blochez omul
  cu un AWB mort", am ales sa nu adaug al doilea.

**Si mi-am retras o proba.** Aveam un test care cerea ca „404 cu corpul lor in JSON" sa insemne
anulata. Il adaugasem pe rationamentul meu, nu pe documentatie, deci largisem contractul dincolo de
ce pot dovedi. Auditul are dreptate. Testul cere acum sa se arunce.

Banc de mutanti: **7 din 8**, iar al optulea nu e un esec (vezi 3.3).

---

## 2. Unde auditul greseste pe FAPTE

Astea nu sunt pareri deosebite; sunt lucruri verificabile in depozit.

**2.1. `src/lib/shipping/registru.ts` nu exista.** Functia citata e in `src/lib/operatii/registru.ts`.
Randurile citate nimeresc corect din intamplare. Constatarea ramane valabila, referinta nu.

**2.2. Doua din cele patru randuri citate ca revocari sunt GRANTURI.**
`migrations/000-schema-baseline.sql:11160` este
`grant execute on function public.rezerva_operatie_externa(...) to service_role;`, iar `:11176` este
acelasi lucru pentru `sterge_comanda`. Doar `:11333` si `:11337` sunt `revoke`. Concluzia despre
restore ramane in picioare; dovada citata, pe jumatate, nu.

**2.3. „ESLint esuat: 83 erori" e o greseala de categorie.** Nu e o poarta rosie: e un CLICHET cu
prag comis in depozit (`scripts/lint-prag.json`, `{"erori":83}`), iar `npm run lint:prag` iese **0**.
Pragul exista ca sa nu CREASCA numarul, si e verificat in CI. A-l numi esec inseamna a citi o poarta
asumata si versionata drept o scapare.

**2.4. „8 curieri fara compare-and-set la anulare" SUBNUMARA.** Masurat pe cod: **15 din 17**. Lipsesc
din lista auditului colete, gls, pallex, posta, packeta, dhl si ecolet. Constatarea e reala si e mai
grava decat o da auditul; numarul lui greseste in favoarea codului.

**2.5. „308 din 595 de fisiere de proba citesc sursa ca text" e corect ca numar si gresit ca
concluzie.** Masurat de noi pe aceleasi fisiere: din cele 308, **190 cheama si cod real** (import din
proiect plus rulare), si doar **118 sunt pur structurale**. Iar cele 118 sunt in majoritate clichete
unde sursa CHIAR e subiectul: bugetul cronurilor care nu poate fi zero, semnul lung care nu are voie
pe ecran, grilele fara prag de telefon, harta aprinderilor fara stingere. Un clichet pe sursa nu e o
proba slaba de purtare; e alt fel de unealta, cu alt scop.

**2.6. Scorurile pe furnizori se misca pe fisiere identice binar.** Auditul da `+0,1` la FedEx, UPS,
DHL, Colete, Woot, eColet, SmartShip si Innoship, si spune tot el, in aceeasi pagina, ca „niciun
client provider-specific, cu exceptia Shipo, nu a fost modificat". Cele doua nu pot fi amandoua
temeiuri pentru aceeasi cifra. Nu contestam directia, ci faptul ca zecimile astea nu sunt masuratori.

---

## 3. Unde auditul are dreptate pe COD, dar gresit pe SCARA

Auditul nu a avut acces la baza. Noi am avut, si am masurat inainte de a repara. Cifrele astea nu
sunt un argument ca „nu se foloseste, deci nu se repara"; sunt un argument despre ORDINEA lucrarilor.

| Ce | Masurat in productie, 15.09.2026 |
| --- | --- |
| Magazine | 129 |
| Cu macar un curier configurat | 10 |
| Cu prag de livrare gratuita | 14 |
| Cu curier SI prag | 7 |
| Cu cotare LIVE pornita (`auto_price`) | 3 perechi magazin-curier: fan-courier 1, sameday 1, pickup 1 |
| Comenzi, total | 456 (436 in ultimele 90 de zile) |
| Comenzi Woot | 226, toate pe pret FIX de zona, nu pe cotatie live |
| Comenzi la toti ceilalti curieri, la un loc | 15 |
| Lockere alese prin checkoutul nostru | 6 (restul de 96 vin din marketplace) |
| Integrari cu ZERO magazine configurate | **11 din 17**: UPS, DHL, FedEx, Shipo, Innoship, SmartShip, Packeta, eColet, Pall-Ex, Posta, Colete |

**3.1.** Auditul scade nota pentru fiecare din cele 17 integrari si cere certificare sandbox pentru
toate. Unsprezece dintre ele nu au niciun utilizator. O nota care le cantareste egal cu Woot, care
are 226 de comenzi, nu masoara riscul platformei.

**3.2.** Cei sase curieri care consuma un plan de expediere (Shipo, UPS, DHL, FedEx, SmartShip,
Innoship) au **zero** magazine configurate si **zero** zone pornite. Gaura pe care am inchis-o azi
era reala si completa in cod, dar nu avea nicio instanta vie. S-a inchis inainte ca cineva sa
porneasca acei curieri, ceea ce e momentul potrivit, nu o urgenta ratata.

**3.3. Un scor de banc nu e o nota.** La Shipo, patru mutanti pe marcajul „corpul a fost JSON" au
scapat, si i-am scos din lista in loc sa-i raportez ca esecuri: de cand se cere statusul 200, acel
marcaj nu mai schimba nicio purtare pe drumurile de azi, fiindca 200 se ataseaza DOAR pe ramura unde
corpul e parsat prin constructie. Un mutant care nu schimba nimic nu masoara nimic. Marcajul NU e
insa cod mort: am pus un mutant pentru schimbarea viitoare care l-ar face iar purtator de sarcina
(un status atasat si pe corpul necitibil), si acela e **prins** de o proba noua.

---

## 4. Ce a ratat auditul

Gasite in verificarea noastra, absente din toate cele trei audituri externe.

**4.1. Valoarea declarata la DHL, si e singurul drum ramas prin care cosul misca bani fara poarta.**
`valoareMarfii = min(subtotal din browser, podeaDinCatalog)` pleaca drept `declaredValue` in cererea
de tarif DHL. Subdeclarata, tariful iese mai mic, se semneaza si se accepta; la emitere pleaca
valoarea REALA a comenzii, iar DHL factureaza dupa ea. Diferenta o plateste comerciantul. Zero
instante vii azi (zero configuratii DHL, zero zone DHL pornite).

**4.2. Plafonul de cereri era parghia atacatorului**, nu doar plafonul de 25 de secunde pe care il
numeste auditul. 61 de cotatii dintr-un singur IP treceau tot magazinul pe tarife fixe, adica pe
tokene fara plan: starea vulnerabila se putea **provoca**, nu doar astepta. Regula noua o inchide;
plafonul insusi nu s-a atins, fiindca e o paza adevarata impotriva abuzului.

**4.3. Paza de retea a lockerului, promisa de comentariul nostru si inexistenta.** `quote-token.ts`
explica de ce punctul nu se poate semna la cotare si spune ca verificarea se face „la emitere". Nu
exista, nici la plasare, nici la emitere. Sameday cere doar curier si tip si `id > 0`; DPD
suprascrie localitatea din siruri nevalidate din browser. Sase comenzi vii.

**4.4. Poarta de schema din CI iesea `exit 0` in tacere** cand lipsea cheia Supabase, deci jobul era
verde si cand nu comparase nimic. Reparata pe 15.09 (acum iese 1). ⚠ Urmarea, spusa pe fata: daca
secretul nu e configurat in depozit, jobul acela va iesi ROSU.

---

## 5. Ce NU am facut, si de ce

Fiecare din punctele astea e o hotarare, nu o scapare.

**5.1. `npm audit`.** Singurul „high" e familia `@tiptap/core`, iar `npm audit fix` cere `--force` si
instaleaza `@tiptap/extension-image@3.31.3`, „outside the stated dependency range". Acela e editorul
de blog, nu sistemul de curierat. O ridicare in afara intervalului declarat, strecurata intr-un lot
de livrare, e chiar felul de schimbare care strica ceva pentru utilizatori vii. Se face separat, cu
probele ei.

**5.2. Lint la zero.** 83 de erori in 94 de fisiere, aproape toate `react-hooks/*` in panouri fara
legatura cu livrarea. E un val propriu, cu risc propriu, nu o nota de subsol intr-un lot de curieri.
Pragul comis impiedica deja cresterea.

**5.3. `shipment_generation_id`.** E reparatia corecta pentru anulare si urmarire, si o sustinem. Dar
cere o migratie pe un tabel viu si atinge toti cei 17 curieri. Nu se face nedeclarat, intr-un lot
despre altceva.

**5.4. Versiune, key ID si cutoff pe token.** Suntem de acord ca ar trebui. E insa o schimbare de
FORMAT: facuta gresit, arunca 24 de ore de cotatii aflate in circulatie pe `max(suma ceruta, tarif
implicit)`, adica omul vede 0,00 pe ecran si plateste intre 18 si 45 de lei. Cere planul ei.

**5.5. Certificare sandbox/live pentru cei 17 furnizori.** Nu avem credentiale. Nici auditul nu are,
si o spune la „Limitari". Nicio cantitate de cod nu produce dovada asta.

---

## 6. De ce „10/10" nu e atins, cinstit

Definition of Done din audit cere, printre altele: certificare contractuala sandbox/live pentru
toate cele 17 integrari, probe de concurenta pe Supabase real, reconciliere financiara cu facturi si
deconturi reale, si alerte demonstrate prin fault injection. Niciuna nu se poate produce din cod.

Ce se putea face, si s-a facut: fiecare constatare a fost **verificata**, cele reale au fost reparate
cu proba de purtare si banc de mutanti, iar cele gresite sunt aratate cu dovada, nu respinse.

Un scor onest pentru starea de azi nu e nici 6,8, nici 10. Cifra conteaza mai putin decat lista de
mai jos, care e scurta si numita.

**Ramane deschis, in ordinea pe care o recomandam:**

1. token fail-open la semnatura invalida (hotarare deliberata azi, cu motivul scris in cod);
2. paza de retea a lockerului la emitere (6 comenzi vii);
3. valoarea declarata la DHL (zero instante vii, usa deschisa);
4. `shipment_generation_id` pentru anulare, urmarire si efecte;
5. webhook Innoship v2 si stergerea fail-closed;
6. ACL executabil pentru restore Supabase;
7. contracte provider-specifice (FedEx commodities, DPD pickup, Posta plaja, multiparcel, tracking);
8. lint la zero si dependentele.

---

## 7. Porti, pe octetii comisi

| Poarta | Rezultat |
| --- | --- |
| Suita de probe | 7817 trecute din 7817, 0 cazute |
| TypeScript | curat |
| Build | curat, 654 pagini |
| Clichet de lint | neschimbat: 83 erori, 129 avertismente, iesire 0 |
| Baseline de schema | fara deriva fata de productie |
| Banc de mutanti, regula planului | 9 din 9 |
| Banc de mutanti, anularea Shipo | 7 din 8, al optulea dovedit ca nu schimba nicio purtare |

Fiecare banc a masurat **intai** linia de plecare pe cod bun (cu proba rosie, orice mutant ar iesi
„prins" si scorul n-ar insemna nimic) si a asezat fisierele la loc octet cu octet dupa fiecare
mutant.
