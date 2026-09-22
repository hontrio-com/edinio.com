# Oferte: ce s-a refacut si ce s-a gasit

Inceput pe 22.09.2026, dupa Discounturi. Ca la `CLIENTI.md`, `COSURI-ABANDONATE.md` si
`DISCOUNTURI.md`: tot ce scrie aici e **masurat**, nu presupus.

---

## Ce am gasit inainte sa incep

### Pe productie

| | |
|---|---|
| oferte | **13**, in 4 magazine (cea mai plina vitrina are 7) |
| pornite | **11** |
| cu perioada | **0** din 13 |
| afisari adunate | **405** |
| conversii adunate | **29** |
| venit adus (`revenue_added`) | **970,70 lei** |
| comenzi cu reducere din oferta | **8**, in total **72,30 lei** |

### Pe demo: destule date cat sa se poata proba

9 oferte intr-un magazin, cate una din fiecare stare, 8.417 afisari, 410 conversii,
30.666,70 lei venit adus.

---

## ⚠⚠ Trei defecte, gasite masurand

### 1. Afisarile erau numarate pe JUMATATE, si codul spunea contrariul

Cele doua cifre de pe productie stau una langa alta si nu se pot potrivi:

| tip de oferta | afisari | conversii |
|---|---|---|
| `cross_sell` | 405 | **0** |
| `order_bump` | **0** | 29 |

Baliza din browser (`useAfisariOferte`) avea doi apelanti: `ProductPageClassic` si
`ProductPageDetailed`. Atat. Iar comentariul ei scria, negru pe alb:

> „Tot asa se numara si pe celelalte doua suprafete — acolo lista se cere abia cand se
> deschide sertarul de cos sau formularul de comanda, adica tot cand ajunge pe ecran — deci
> cele trei suprafete raman comparabile intre ele in acelasi contor."

Si `getCheckoutBumps` trimitea cititorul la el: „Balizele browserului le numara pe toate
trei la fel." **Intentia era scrisa. Legatura nu fusese facuta.**

**Reparat**: baliza e legata acum in `OrderBump` (desenata de AMANDOUA formularele de
comanda — `OrderModal` si `CheckoutForm`) si in `CartRecommendations` (sertarul de cos si
cele patru variante de pagina de cos). In amandoua se cheama dinauntru, unde se stie exact
ce ajunge pe ecran dupa filtrare — nu la citire, unde s-ar fi numarat si ce filtrul arunca.

**Regula s-a si schimbat, nu doar s-a extins**: o oferta se numara **o data pe VIZITA**, nu
o data pe montare (`lib/offers/o-data-pe-vizita.ts`). Cine deschide sertarul de cos de trei
ori a avut o singura ocazie sa accepte recomandarea, nu trei; iar conversiile se numara o
data pe comanda, adica cel mult una pe vizita. Numarate pe montare, afisarile ar fi crescut
singure la fiecare redeschidere si rata ar fi scazut fara ca nimic sa se schimbe.

**Probat in browser, pe ruta adevarata**, pe baza demo:

| ce am facut | ce s-a intamplat |
|---|---|
| am deschis formularul de comanda cu doua bump-uri pe ecran | 912 → **913** si 377 → **378** |
| l-am inchis si l-am redeschis, cu aceleasi bump-uri | **neschimbat** (913, 378) |
| am deschis sertarul de cos cu recomandari | un cross-sell 0 → **1** |
| o oferta care nu se potrivea cosului | ramas **0** |

⚠ Cifrele vechi nu se pot reface. De-aia se scrie pe ecran, in explicatia cardului si in
fisa ofertei: afisarile de la checkout si din cos se numara **de pe 22.09.2026**.

### 2. O oferta nu se putea programa, desi tot restul drumului exista

`offers.starts_at` si `offers.ends_at` erau in baza de la inceput, `loadActiveOffers` le
citea si le respecta, iar `OfferFormData` le purta. Dar `OfferForm.tsx` trimitea, scris in
cod:

```ts
starts_at: null,
ends_at: null,
```

Deci nicio oferta nu se putea programa din panou, si orice perioada pusa de mana in baza era
**stearsa la prima salvare**. De-aia zero din 13 oferte de pe productie au perioada.

**Reparat**: formularul are acum „De cand / Pana cand", cu aceeasi asezare ca la coduri, iar
ziua se preface in clipa **pe server** (`perioadaOfertei`), nu in browser. Perioada intoarsa
se refuza. Editarea citeste ziua cu `ziuaClipei`, nu cu `slice(0, 10)` — altfel o oferta care
porneste pe 1 octombrie s-ar fi mutat cu o zi inapoi la fiecare deschidere a formularului.

### 3. Tipurile de oferta erau in CINCI liste, una fara niciun cititor

| lista | unde | cate |
|---|---|---|
| `OFFER_TYPES` | `offer.types.ts` | 8 |
| `PHASE1_OFFER_TYPES` | `offer.types.ts` | 3 |
| `OFFER_TYPES_IMPLEMENTATE` | `offer.types.ts` | 4, **zero cititori** |
| `PHASE1` | `OfferForm.tsx` | 4, cu etichete si descrieri |
| `TYPE_LABEL` | `OffersClient.tsx` | 8 etichete |

Se si despartisera: formularul scria „Cumparate impreuna" si lista scria acelasi lucru, dar
fara diacritice. Un tip lipsa din `TYPE_LABEL` ar fi desenat `undefined`; unul lipsa din
`PHASE1` n-ar fi aparut in formular. Amandoua tacute.

**Reparat**: un singur tabel, `DESPRE_TIPUL_OFERTEI`, din care se deriva `OFFER_TYPES`,
`PHASE1_OFFER_TYPES` si `TIPURI_CARE_SE_POT_FACE`. Iconitele stau separat, in panou, fiindca
`lucide-react` n-are ce cauta intr-un fisier pe care il incarca si serverul la fiecare
rezolvare de oferta din vitrina — si o proba cere ca tabelul lor sa aiba exact aceleasi chei.

---

## Ce s-a refacut pe ecran

- **Linia de design**, cea ceruta: `max-w-6xl`, `CardStatistica` sus cu cifre adevarate,
  `EtichetaStare` pe fiecare rand, tabel de la `sm` in sus si carduri sub, filtre si cautare
  care apar abia de la patru oferte, sertar lateral cu fisa, si rasfoire.
- **Patru stari in loc de una.** Era doar un chip cenusiu „Inactiv"; o oferta a carei
  perioada trecuse arata exact ca una care merge. ⚠ **Patru, nu cinci**: la coduri exista si
  „epuizat", fiindca un cod are `max_uses`. O oferta n-are plafon de utilizari.
- **Sertarul spune CARE produse si CARE categorii.** Pana acum lista scria „Apare la 3
  produse" si atat, iar singurul drum catre nume era formularul de editare — adica trebuia
  sa intri intr-un ecran de scris ca sa citesti ceva.
- **Rata de acceptare**, langa „Acceptate". `null` cand n-a vazut-o nimeni, nu 0: „0%" ar fi
  insemnat „au vazut-o si n-au vrut-o". Si nu se taie la 100%, fiindca pe ofertele vechi
  numitorul e mai mic decat ar fi trebuit (vezi defectul 1) — taiata, cifra ar fi ascuns
  tocmai dovada ca e de taiat.
- **Paginare in baza**, cu filtru, sortare si numaratoare in Postgres. Pana acum pagina
  aducea toate ofertele, iar marginea adevarata era plafonul PostgREST: o mie de randuri,
  dupa care lista s-ar fi taiat in tacere.
- **Banda „Functie in BETA" a iesit.** Eticheta Beta fusese deja scoasa din meniu in
  redesignul asta; o banda galbena cat un card, deasupra fiecarei liste, spunea altceva
  decat meniul. Ce era adevarat in ea s-a mutat acolo unde se poate face ceva cu el: in
  explicatia fiecarui card si in fisa fiecarei oferte.

---

## Cele sapte cereri de dupa prima livrare (22.09.2026)

Cerute de el dupa ce a vazut ecranul. Ordinea de aici e a RISCULUI pentru cei care
folosesc functia ACUM, nu a lui: cele care nu pot strica nimic se fac intai.

| # | cererea | stare |
|---|---|---|
| 1 | Eticheta de tip pe un singur rand | **FACUT**. Si data, care se rupea la fel. Aceeasi reparatie la Discounturi. |
| 2 | Are sectiunea paginatie? | **DA**, pusa odata cu redesignul: `offers_page`, 25 pe pagina, filtru si sortare in baza. |
| 7 | Reguli la oferta de checkout | **FACUT** (vezi mai jos). |
| 3 | Amplasarea setului „Cumparate impreuna" | **FACUT** (vezi mai jos). |
| 4 | Cantitate pentru fiecare produs din pachet | **FACUT** (vezi mai jos). |
| 5 | Produse fara stoc: scoase si semnalate | **FACUT** (vezi mai jos). |
| 6 | Recomandari: metoda, excluderi, numar maxim | **FACUT** (vezi mai jos). |

### 7. Portile ofertei de checkout

Nu un constructor de reguli cu SI/SAU, ci **patru porti scrise ca propozitii**, toate
optionale: „cosul trece de X lei", „in cos sunt cel putin N bucati", „in cos se afla",
„in cos NU se afla". Nimic bifat = se arata mereu.

⚠⚠ **Nu poate strica nimic pentru nimeni**: masurat pe productie, ZERO din 13 oferte au
`conditions` pus. Pana nu bifeaza cineva ceva, nu se schimba absolut nimic.

**Stubul exista deja si nu facea nimic.** `trigger.conditions` (`minQty`, `minValue`,
`requiredProductIds`) era parsat de `parseOfferTrigger` si **nu-l citea nimeni** —
scris pentru „Faza 3". Daca un comerciant l-ar fi pus de mana, oferta l-ar fi ignorat
in tacere. Numele vechi s-au pastrat, desi sunt englezesti: redenumite, un rand care
le-ar fi avut ar fi ramas cu porti pe care nu le mai citeste nimeni.

**O SINGURA functie, doua cai.** `lib/offers/porti.ts` raspunde si la „se vede bump-ul?"
(`resolveCartOffers`), si la „are voie pretul?" (`refuzaOferta`). O proba cere ca
amandoua s-o cheme cu aceiasi trei parametri si ca niciuna sa nu-si scrie propria
comparatie pe praguri.

#### ⚠⚠ Gaura gasita la proiectare, inainte sa fie scrisa

La AFISARE, produsul oferit de bump NU e in cos (`resolveCartOffers` il exclude anume).
La COMANDA el E deja linie, fiindca altfel oferta n-ar avea ce revendica.

Deci o cerere mestesugita, cu un cos de 150 de lei si bump-ul de 60, ar fi trecut la
plasare o poarta de „peste 200 de lei" — **cu chiar produsul pe care poarta trebuia
sa-l pazeasca**. De-aia cosul se tine PE PRODUS, nu ca trei numere adunate, iar poarta
se intreaba pe cosul FARA ce aduce oferta. Probat cu numere si cu un mutant.

#### Ce stie fiecare cale, si de ce nu e acelasi lucru

| | afisare | comanda |
|---|---|---|
| cosul vine din | browser | liniile comenzii |
| preturile sunt | cele spuse de browser | cele CHIAR platite |
| ce hotaraste | ce se ARATA | daca pretul are voie |
| daca pica | oferta nu se vede | **comanda se OPRESTE** |

⚠⚠ **Ce vine din browser NU se crede, si nici nu trebuie**: a arata o oferta nu costa
niciun ban. Un client care umfla suma vede bump-ul si i se refuza comanda la plasare,
cand poarta se pune din nou pe liniile adevarate. Pretul se ia mereu din baza.

⚠ **`products.price` NU e pretul de pe ecran** la variante si la produse personalizate
(masurat pe productie: 156,80 de baza fata de 438,00 cu marimea aleasa). De-aia poarta
de la comanda socoteste pe preturile chiar platite, nu pe catalog.

⚠ **Ancora intra separat in cos**: pe calea comenzii directe, produsul din formular nu
e in `items` — acelea sunt doar liniile purtate din cos.

#### Probat

19 probe noi, 2 mutanti pusi si prinsi. Si **in browser, pe ruta adevarata**, pe baza
demo: cu poarta la 5.000 lei pe un cos de 2.050, bump-ul DISPARE; cu poarta la 2.000,
REAPARE. Datele demo au fost puse la loc dupa proba.

### 3. Unde se vede setul „Cumparate impreuna"

Ales de el: **langa pret, sub butoane**, in coloana de cumparare. Implicita ramane
banda lata de azi, deci oferta care exista pe productie nu se muta de unde e.

⚠ Un camp nou in `display`, fara nicio migratie: `offers.display` e deja jsonb.
Lipsa lui, sau o valoare necunoscuta, inseamna „sub produs".

⚠⚠ **Numai setul poate sta langa pret.** O grila de patru carduri de recomandari
n-are ce cauta in caseta de cumparare, iar `cross_sell` se vede pe DOUA suprafete
(pagina si cosul), deci acolo „langa pret" n-ar avea un inteles limpede. Poarta e
in parser, nu doar in formular: un rand scris de mana n-o poate ocoli.

#### ⚠⚠ Partea grea n-a fost desenul, ci BALIZA

Setul mutat sus si recomandarile ramase jos sunt doua bucati de ecran, deci doua
balize. Daca lista care se DESENEAZA si lista care se NUMARA nu sunt aceeasi, o
oferta e numarata de doua ori sau deloc — exact defectul inchis azi in contor.

Acum le imparte o singura functie (`imparteOferteleDupaAmplasare`), cu ACELASI
predicat pe care il foloseste si `ProductOffers` cand deseneaza. Ce nu e desenabil
nu intra in nicio lista: un inveliz cu `ref` care nu deseneaza nimic e un `<div>`
de zero pixeli pe care observatorul il poate socoti intrat in ecran.

⚠⚠ **Si mutarea SCHIMBA INTELESUL cifrei, nu doar locul cardului.** Jos, „vazut"
insemna „a derulat pana acolo"; langa pret inseamna aproape „a deschis pagina".
Scris pe ecran, in formular, sub alegere.

⚠ Gasit de adversar si inchis: o scriere de forma `TABEL[type].ceva` in parser ar
fi ARUNCAT pe un tip nerecunoscut — iar functia aia e chemata pe drumul fiecarei
incarcari de pagina de produs. Vitrina ar fi iesit alba.

**Probat in browser**: setul apare in coloana de cumparare, cu butonul stins la fel
ca cel principal cand produsul cere o varianta; banda de jos are doar
recomandarile, fara dublura; si contorul a crescut o singura data.

### 4. Cantitate pentru fiecare produs din pachet

„2 becuri + 1 lustra", nu doar cate una din fiecare. Un camp nou si optional,
`config.cantitati`, fara migratie.

⚠⚠ **PROBA DE TEMELIE nu e ca merg cantitatile, ci ca o oferta FARA ele da exact
pretul de ieri, la bit.** Cazul LIVE de la BricoSmart, cu cifrele lui, e rulat din
nou si da aceleasi patru numere: `[30.85, 29.02, 24.72, 17.09]`.

⚠ Si parsarea scrie in jsonb **doar ce trece de o bucata**: un set cu toate
produsele intr-o bucata produce acelasi rand ca pana azi, deci nicio salvare din
panou nu schimba o oferta care exista.

#### Cele patru socoteli care presupuneau „o bucata din fiecare"

| unde | ce s-a schimbat |
|---|---|
| `pretulSetului` | `compareAt` pe VALOAREA liniei (pret x bucati) |
| `imparteEconomiaCompanionilor` | cotele pe VALOARE, rezultatul ramane UNITAR |
| `aplicaPretPeBucati` (nou) | ieftineste cate bucati cere setul; `aplicaBumpPeOBucata` ramane cazul `bucati = 1` |
| `fbtInCos` | linia din cos care n-are destule bucati primeste restul prin `companioniNoi` |

⚠⚠ **Unitar, nu pe linie**, si amandoua conteaza: pe valoare, fiindca un companion
luat in doua bucati trage de doua ori mai mult din economie; unitar, fiindca
numarul se scrie pe LINIA de comanda, care isi are deja cantitatea — intors ca
valoare de linie, s-ar fi inmultit a doua oara.

⚠ **Venitul se socoteste PE BUCATI.** Ramas unitar, aceeasi comanda ar fi scris
doua numere care se contrazic: `orders.offer_discount_amount` pe doua bucati si
`offers.revenue_added` pe una. Gasit de adversar.

⚠ **Stocul trebuie sa ajunga pentru cate cere setul.** Un set de 2 becuri pe un
stoc de 1 nu se arata: aratat, butonul ar fi dus la o comanda pe care rezervarea
de stoc o refuza la ultimul pas, dupa ce omul si-a scris toate datele.

⚠ **NU s-a facut** ce cerea planul la un moment dat: sa se treaca cantitatea prin
verificarea `schimbat` din `setulOfertei`. Ar fi transformat un filtru de AFISARE
intr-o poarta care OPRESTE comanda, si s-ar fi aprins pe un produs care nici macar
nu face parte din setul aratat. Gasit de adversar.

**Probat in browser, pe ruta adevarata**: cu 2 lumanari in set, cardul scrie
**371,20 lei** fata de 387 (= 229 + 71,10 x 2 fata de 229 + 79 x 2), iar formularul
de comanda duce mai departe `+ Lumanare … 142,20 lei` si un total de 1.182,19 — la
banut, aceeasi socoteala. 18 probe noi, 5 mutanti pusi si toti prinsi.

⚠ Si o tacere inchisa odata cu mutarea: formularul punea ancora la O bucata in
fluxul „cumpara impreuna", aruncand cantitatea de pe pagina. Pana azi butonul
setului statea cu ~1200px mai jos decat selectorul, deci nimeni nu tinea minte; de
cand poate sta chiar langa el, scrie „setul merge cu o bucata".

### 5. Produsele fara stoc: scoase, si spuse

⚠⚠ **ASTA SI 6 SUNT SINGURELE DIN CELE SAPTE CARE POT SCHIMBA CE VEDE UN
CUMPARATOR AZI.** De-aia implicitele reproduc purtarea de acum, si de-aia proba
de temelie e tot „un rand fara campurile noi se poarta ca ieri".

#### Ce era, masurat in cod

| unde | ce facea |
|---|---|
| set (FBT) | arunca deja companionii epuizati |
| oferta de checkout | alege primul produs cumparabil din lista |
| recomandari, in cos | **arunca** produsele epuizate (in browser) |
| recomandari, pe pagina de produs | **le ARATA**, cu eticheta „Epuizat" si butonul stins |

Deci cele doua suprafete de recomandare se poarta DEOSEBIT, si asta ramane
implicita. Bifa noua („nu arata produsele fara stoc") le uniformizeaza, si scrie
pe ecran ce face. Uniformizata in tacere, una din cele doua s-ar fi schimbat
pentru toate cele cinci recomandari care ruleaza.

⚠ Adversarul a prins ca „ramura de cross_sell" pe care se sprijinea planul **nu
exista**: ternarul deserveste si FBT, si bump. Mutat acolo, filtrul ar fi atins
tipurile cu bani.

#### Semnul pe ecran: TREI stari, nu doua

| stare | ce inseamna |
|---|---|
| intreaga | toate produsele se pot cumpara |
| **ciuntita** | i-a cazut ceva, dar **inca se vede** — „cand ai timp" |
| **moarta** | n-a mai ramas niciun produs, deci **nu se mai arata deloc** — „acum" |

⚠⚠ Si a patra, `necunoscut`, care **NU e „e bine"**: ofertele automate si cele de
cantitate n-au lista fixa de produse, deci nu se poate spune nimic despre ele.
Scrise ca „intreaga", ar fi fost o liniste pe care n-a verificat-o nimeni.

Eticheta sta LANGA starea ofertei, nu in locul ei: o oferta poate fi „Activa" si
totusi fara stoc — chiar cazul care se ascundea.

#### Notificarea, fara sa devina zgomot

Cron zilnic (`/api/cron/oferte-fara-stoc`), care scrie in clopotel.

⚠⚠ **Se anunta DOAR ce a murit de tot.** O oferta careia i-a cazut unul din patru
inca vinde; un rand in clopotel pentru ea ar fi transformat notificarea in zgomot
— si atunci nici cea adevarata n-ar mai fi citita. Pierderile mici se vad pe ecran.

⚠⚠ **Si se spune O SINGURA DATA**: `offers.fara_stoc_anuntat_la` tine minte cand
s-a spus, iar urma se STERGE cand oferta se intregeste. Fara drumul inapoi,
notificarea ar fi functionat exact o data pe oferta, pe viata.

⚠ **Se scrie INTAI urma, apoi notificarea.** Invers, o notificare reusita cu urma
nescrisa ar fi repetat vestea zilnic. Asa, cel mai rau caz e o veste pierduta, pe
care ecranul o arata oricum.

⚠ **Ce nu poate sti**: `offer_stoc` numara STOCUL, nu „se poate lua dintr-o
apasare". Un produs cu variante sau cu personalizare e aruncat din set de vitrina,
iar steagul ala sta in `products.page_sections`, un jsonb pe care SQL nu-l
citeste. Deci exista oferte moarte pe ecran pe care cronul nu le vede.

**Probat pe ruta adevarata**, pe baza demo: poarta cronului raspunde 401 fara
secret (fail-closed); prima rulare `anuntate: 1` cu randul in clopotel si numele
ofertei in el; a doua `anuntate: 0`; dupa ce stocul s-a intors, `uitate: 1`.
Si pe ecran, randul a aratat „Activa" **si** „Produse lipsa", una langa alta.

### 6. Recomandari: metoda, excluderi, numar maxim

Trei metode, cu numele lor pe ecran:

| metoda | ce face |
|---|---|
| `manual` | lista aleasa de comerciant — ce fac azi toate cele 5 |
| `categorie_noi` | cele mai noi din categorie — **purtarea care exista deja** sub `autoByCategory` |
| `categorie_vandute` | **NOUA**: cele mai vandute in ultimele 90 de zile |

⚠⚠ **Metoda se DERIVA cand campul lipseste**: `autoByCategory` fals inseamna
`manual`, adevarat inseamna `categorie_noi`. Asa cele cinci recomandari de pe
productie (toate cu `autoByCategory: false`) se poarta litera cu litera la fel.
Si la SCRIERE se tin amandoua in pas, ca o cale ramasa in urma sa nu aleaga alt
bazin.

⚠ **`categorie_vandute` cade inapoi pe cele mai noi** cand n-a vandut nimic inca.
Un magazin nou n-are vanzari, iar o lista goala ar fi facut recomandarea sa
dispara cu totul, fara ca nimeni sa afle de ce.

⚠⚠ **NU EXISTA TABELA DE LINII DE COMANDA**: liniile stau in `orders.items`, un
tablou jsonb. Deci „cele mai vandute" e o desfacere de JSON peste comenzi.
Masurat pe productie: 544 de comenzi in toata platforma, 679 de linii, 276 la cel
mai mare magazin — la scara asta e nimic. **Unde se rupe e scris in migratie**:
peste cateva zeci de mii de comenzi pe magazin, asta trebuie sa devina un tabel
tinut la zi de un cron. NU s-a facut cache acum, dinadins: un agregat n-ar fi
putut deosebi „zero vanzari" de „inca n-am socotit".

⚠⚠ **Numarul maxim EXISTA de mult si era CABLAT.** `config.maxProducts` era
respectat de vitrina, dar formularul trimitea mereu 4: optiunea era acolo si nu se
putea atinge. Acum se scrie. Implicita ramane 4.

⚠ **Si sertarul de cos taia in tacere la SASE**, scris in cod — deci ar fi retezat
tocmai numarul scris de comerciant, si cu doua recomandari pe acelasi cos, si mai
devreme. Plafonul e acum al ofertelor, nu unul inventat acolo.

⚠ **Pe calea automata, taierea e in BAZA** (`.limit(...)`), deci un filtru pus in
JavaScript n-are din ce sa completeze raftul: se cere o rezerva. Gasit de
adversar.

⚠ **„Exclude produsele deja in cos" NU s-a facut pe pagina de produs**, si nu din
lipsa de timp: acolo serverul NU stie cosul — el traieste in browser. In cos
functioneaza deja (`exclude` are id-urile din cos). Mutata in client, filtrarea ar
fi taiat dupa ce serverul a taiat, si raftul ar fi iesit mai scurt decat numarul
cerut, fara sa spuna nimeni de ce.

## Ce ramane de spus limpede

⚠⚠ **`impressions`, `conversions` si `revenue_added` sunt contoare care DOAR CRESC.** Nu
scad cand o comanda se anuleaza, si nici n-au de unde: `orders` nu pastreaza nicio legatura
catre oferta folosita, doar o suma totala in `offer_discount_amount`. Scris pe ecran in
explicatia fiecarui card si in fisa; iar cand magazinul chiar are comenzi anulate cu
reducere din oferta, apare un rand care spune cate si cat.

⚠ **Nu s-a verificat pe telefon adevarat.** Asezarea de sub `sm` e oglinda celei de la
Discounturi, care a fost vazuta pe telefon; dar ecranul asta nu. De cerut o privire.

⚠ **`post_purchase` si `spend_reward` raman nefacute.** Sunt in schema si in tabel, cu
`sePoateFace: false` si cu explicatia care spune pe fata ca nu se pot face inca — o proba
cere ca fiecare din ele s-o spuna. (`bogo` si `gift` s-au facut pe 24.09, vezi mai jos.)

---

# Trei tipuri noi: upgrade, „cumperi X primesti Y", cadou     (24.09.2026)

Cerute de el. Toate trei se bifeaza in FORMULARUL DE COMANDA, ca bump-ul, si merg prin
aceeasi cale probata: produsul intra ca LINIE (`additional_items`) plus id-ul ofertei, iar
serverul re-judeca tot si rescrie pretul liniei.

## De ce toate trei in formular, si nu pe pagina de produs

⚠⚠ **O oferta nu poate ieftini decat o LINIE.** Produsul din formularul de comanda directa
NU e linie: pretul lui se socoteste separat, inainte de oferte (`placeOrder`, rd. ~1519), iar
`offer_discount_amount` doar consemneaza. Deci o oferta care ar vrea sa schimbe pretul
produsului de pe pagina n-are unde sa scrie. Cosul, in schimb, e numai linii.

## Ce s-a facut

**UPGRADE** — „Treci la varianta de 100 ml pentru +30 lei." Randul arata DIFERENTA fata de
ce iese din cos, nu pretul: cumparatorul compara cu ce are deja. Bifat, produsul mic iese din
comanda si cel mare intra la pretul de schimb.

⚠⚠ **Ce costa schimbul, spus pe fata si in formular**: la schimb, produsul care aprinde
oferta nu mai e in comanda — chiar oferta l-a scos — deci declansatorul nu se mai poate cere
la plasare. Pretul de schimb il poate lua oricine trimite id-ul ofertei cu produsul mare in
comanda. Expunerea e MARGINITA: o bucata pe comanda. Se strange cu portile.

**CUMPERI X, PRIMESTI Y** — se numara BUCATILE din cos, din produsele declansatoare, si se
dau Y bucati din produsul oferit la beneficiu (Gratuit / −% / −suma / pret fix, pe bucata).

⚠⚠ **Produsul primit trebuie sa fie ALTUL.** Oferta adauga o linie, iar produsul deja in cos
nu se mai poate oferi. Pentru „2 la pretul de 1" din ACELASI produs exista deja „Reducere
cantitate", si e mai buna: scade pretul pe bucata si se aplica pe toate caile. Scris in
formular si refuzat la salvare.

⚠⚠ **Bucatile daruite NU se numara in X**, altfel oferta s-ar hrani singura: la un
declansator „toate produsele", un „cumperi 2" s-ar fi implinit din chiar bucata primita
gratis.

**CADOU LA COMANDA** — portile sunt CHIAR oferta („coșul trece de 300 lei"). Cu „clientul
alege cadoul", se arata toate cadourile si cumparatorul apasa pe unul.

⚠⚠ **Reconstituirea cadoului la alegere are ramura ei.** Regula bump-ului („primul care se
poate da") ar fi refuzat in tacere orice cadou in afara de primul: omul bifa al treilea si
primea factura fara el. Fereastra `maxProducts` ramane, ca un magazin cu zece cadouri si trei
aratate sa nu-l lase pe client sa-l ceara pe al zecelea.

## Doua defecte adevarate, prinse pe ruta adevarata

⚠⚠ **Cosul trimis pentru porti era socotit pe PRETUL DE CATALOG.** `checkout-core.ts` trimitea
`i.price` — instantaneul din localStorage — in loc de pretul chiar incasat. Masurat in
magazinul demo: cos cu o lumanare de 49, doua becuri de 39 (treapta la 2 buc: 70,20) si o vaza
de 175. Subtotalul adevarat: 294,20. Cel trimis: 302. Un cadou cu poarta la 300 se ARATA, se
bifa, si la trimitere comanda era OPRITA. Checkout mort, cu un mesaj care nu spune de ce.
⚠ `lineUnit` NU e raspunsul, desi asa pare dupa nume: el tine varianta si personalizarea, dar
NU treptele. Raspunsul e `lineTotal / cantitate`, exact ce facea deja `OrderModal`.

⚠⚠ **Lista de oferte se recerea pe cosul DEJA SCHIMBAT.** Un upgrade bifat scoate produsul
din comanda; cerute pe cosul de dupa scoatere, ofertele se recereau fara chiar produsul care
le aprinde, serverul nu mai gasea declansatorul, si oferta DISPAREA in clipa bifarii — cosul
scadea cu 49 si nu crestea cu 69. Ce se OFERA se hotaraste pe cosul pe care il are omul; ce
se SCOATE e urmarea bifei.

## Probat pe ruta adevarata

Comanda **#1356** in magazinul demo: bec 2 x 35,10, vaza 175, **lumanare mare 69** (pretul de
schimb), **set suporturi 0** (gratis). `subtotal` 314,20, `offer_discount_amount` 55
(10 + 45), total 324,19 — exact ce scria pe ecran. Contoarele: upgrade 1 acceptare / 69 lei
venit, bogo 1 acceptare / 0 lei (e gratis, deci nu aduce venit, dar bucata e in comanda).
Amandoua caile probate: si din cos, si din „Comanda acum" de pe pagina de produs.

## Auditul final: pe toate sabloanele, si doua lucruri gasite pe drum

**Toate ecranele, verificate pe rand.** Ofertele se deseneaza intr-un singur loc
(`OferteDinFormular`), iar el e randat de `CheckoutForm` — pe care il folosesc AMANDOUA
modelele de checkout (`classic`, adica fereastra, si `page_two_col`, pagina cu rezumat
lateral) — plus `OrderModal` de pe pagina de produs. Probat cu toate cele patru modele de
cos (`classic` sertar, `page_split`, `page_wide`, `page_compact`): din fiecare, drumul catre
formular arata cele trei oferte.

⚠⚠ **LA 390px NUMELE PRODUSULUI RAMANEA CU 46 DE PIXELI.** Cardul are 253px, din care bifa,
miniatura si distantele iau 116; cu pretul tinut in dreapta, numelui ii ramanea „Lumâna…" —
adica exact produsul pe care oferta il vinde nu se putea citi. Pretul COBOARA acum sub nume
pana la `sm`, si sta in dreapta de la `sm` in sus. **Acelasi bloc, desenat in doua locuri**,
nu doua forme scrise separat. Verificat la 320, 360, 390, 430, 640, 700 si pe desktop.

⚠⚠ **DOUA COMENTARII CARE SPUNEAU PE DOS.** Amandoua sustineau ca `lineUnit` /
`pretBucataCos` „are treptele de cantitate". Nu are, si nici nu trebuie: `CartProvider` il
defineste dinadins ca „o bucata INAINTE de trepte", fiindca eticheta „N buc x P" trebuie sa
se inmulteasca la totalul liniei. Afirmatia asta m-a trimis pe drum gresit chiar in ziua
aia, la repararea portilor. Cele doua comentarii sunt indreptate, iar **instantaneul cosului
abandonat** — care le credea — salveaza acum pretul chiar incasat (`lineTotal / cantitate`)
in amandoua formularele. Conteaza: din numerele alea se face „Valoare cosuri abandonate" si
pragul „trimite doar peste 300 de lei". ⚠ Plasa care pinuia `price: lineUnit(i)` a cazut la
o schimbare care facea numarul MAI BUN — semn ca apara forma, nu regula; e rescrisa pe sursa
numarului.

⚠ **Si instantaneul ia cosul INTREG**, nu pe cel de dupa scoaterea facuta de un upgrade: aia
e o proiectie a formularului, iar recuperarea i-ar fi trimis clientului inapoi un cos fara
produsul pe care tocmai il avea.

## Ce NU s-a facut

⚠⚠ **O linie de 0 lei n-a fost niciodata facturata din platforma asta.** Formularul refuza
pana acum pretul fix zero, deci cadourile sunt primele linii gratuite care pot ajunge la o
casa de facturare. `docs/facturare/SMARTBILL.md` o spune limpede: din 241 de documente,
**zero reduceri promotionale**. Nu stim daca SmartBill accepta `price: 0` pe o linie de
produs, si nu se poate afla fara sa trimitem un document adevarat.

⚠ CE SE INTAMPLA DACA NU — verificat in cod, nu presupus:
* Facturarea automata e „fire-and-forget", pornita pe schimbarea de STARE, nu pe drumul
  comenzii (`order.actions.ts`, rd. ~2810). Deci **comanda intra oricum**; ce cade e
  emiterea.
* Esecul NU e mut: emiterea trece prin `emiteFacturaSubRegistru`, adica prin registrul de
  operatii externe, unde `esuat` e altceva decat `necunoscut`. Masurat pe 16.09.2026: din
  240 de facturi, un esec chiar e inregistrat acolo („Autentificare esuata"). Iar un refuz
  de reconciliere se scrie in `error_logs` cu `severity: "critical"`.

Deci cel mai rau caz e o factura neemisa, VAZUTA in registru, pe o comanda care a intrat
normal. ⚠ Tot merita o proforma de proba inainte ca cineva sa porneasca un cadou intr-un
magazin care factureaza automat.

⚠ SmartBill are si linii de REDUCERE (`discountValue` negativ, cu `numberOfItems`
obligatoriu — vezi `docs/facturare/SMARTBILL.md`). Daca pretul zero chiar e refuzat, acolo e
drumul: cadoul ar merge ca linie la pret intreg plus o linie de reducere egala. N-am facut-o,
fiindca ar fi o schimbare pe calea facturarii pentru un defect nedovedit.

⚠ **Liniile pentru CUPON si cele pentru PIXELI folosesc tot `lineUnit`** (pretul dinainte de
trepte). E purtarea de dinainte si n-am atins-o: sunt alte cai de bani, fiecare cu auditul
ei. De trecut prin ele separat.

⚠ **Upgrade-ul nu apare pe pagina de produs** cand produsul de schimbat nu e o linie de cos.
Vezi mai sus de ce: produsul principal al unei comenzi directe nu se poate ieftini.

⚠ **Cadoul cu poarta pe lei nu se arata daca pragul se atinge DOAR cu ce aduc alte oferte
bifate.** Poarta se judeca pe cosul de dinainte de bifari. E directia sigura (se arata mai
putin, nu mai mult), dar e o ocazie pierduta.
