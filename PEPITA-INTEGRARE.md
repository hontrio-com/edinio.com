# Pepita: cum e legata, ce poate si ce nu poate

Scris la livrare, 08.09.2026. Documentatia oficiala a fost citita in ziua aceea; daca ce urmeaza
difera de ea, ea are dreptate, iar fisierul asta trebuie corectat.

## Ce spune documentatia lor

| Ce | Unde |
|---|---|
| Formatul feedurilor XML (produse si stoc) | `https://pepita.hu/partners/xml-format?lang=en` |
| Comanda impinsa spre noi | `https://pepita.com/assets/partner_registration/pepita_api_order_send_en.pdf` |
| Ce se trimite la activare, si cat de des citesc | `https://sellercenter.pepita.com/en/feed-and-api-connections/` |
| Confirmarea comenzii, in panoul lor | `https://sellercenter.pepita.com/en/order-processing-and-confirmation/` |

## Limitarea de fond, si de ce imbraca tot restul

Pepita are **exact doua cai**, si numai doua:

```
Edinio -> Pepita   doua feeduri XML, pe care le CITESC ei
                   stocul de obicei o data pe ora, pretul si descrierea o data pe zi
Pepita -> Edinio   comanda, IMPINSA pe o adresa a noastra
```

Documentul lor spune raspicat directia: „Direction of communication: Pepita -> Partner store
(push)". **Nu exista drum inapoi pentru comenzi**: nici confirmare, nici anulare, nici status, nici
AWB, nici urmarire, nici retur, nici ramburs, nici decontari, nici stare de aprobare a produsului,
nici API de categorii, nici OAuth. Iar Seller Center-ul lor cere confirmarea comenzii **in panoul
lor, in cel mult o zi**.

De aici curg trei reguli pe care nimeni n-are voie sa le calce mai tarziu:

1. **Niciun buton care sa para ca trimite ceva la ei.** Un buton „Confirmă la Pepita" ar fi mai rau
   decat lipsa lui: comerciantul ar apasa, ar crede ca a confirmat, si ar pierde termenul de o zi.
   `src/lib/pepita/poarta-si-panou.test.ts` scaneaza panoul dupa asemenea texte.
2. **Nicaieri nu scrie „Conectat la Pepita".** Nu avem cum sa aflam ca au acceptat conexiunea. Ce
   putem spune cinstit e „Configurat în Edinio" si, daca au citit vreun feed, „Pepita citește feedul".
3. **Comanda ramane administrabila din Edinio.** Pepita NU e in `MARKETPLACE_CU_CICLU_PROPRIU`:
   acolo sunt eMAG si Trendyol, unde butoanele noastre se inchid fiindca exista o cale oficiala
   alternativa. Aici nu exista niciuna, deci inchise ar fi lasat comerciantul fara nicio cale de a-si
   duce comanda la capat. In schimb, comanda poarta un memento (`MEMENTO_LA_MARKETPLACE`).

## De ce variantele pleaca APLATIZATE

Feedul lor **cunoaste** variatii (`<Variations>`, cu `PrimaryAttribute` / `SecondaryAttribute` /
`TertiaryAttribute`), dar **nu da niciun identificator pe variatie**: doar valorile atributelor. Iar
comanda ne trimite inapoi un `sku` pe linie.

Pentru un produs trimis cu variatii, n-am avea deci nicio cale sigura sa aflam CE combinatie s-a
vandut, si am scadea stocul de pe alta marime.

Deci fiecare combinatie activa pleaca drept `<Product>` de sine statator:

```
<Id>  = <uuid produs>--<amprenta titlului combinatiei>     ex.  3f2504e0-...--1a2b3c4d5e6f7a8b
nume  = "Tricou (S / Roșu)"
```

Amprenta e FNV-1a pe 64 de biti (doua treceri pe 32), scrisa de mana in `identitate.ts` ca sa fie
pura: se cheama si din feed, si din panou. **Nu e o functie de securitate si nu apara nimic**; da
doar un nume scurt si constant aceleiasi combinatii.

Castigul, dincolo de potrivirea exacta: dispare si capcana lor, „Ha egy termék egyszer variációsként
lett átadva, azon változtatni nem szabad" (odata trimis ca produs cu variatii, structura nu se mai
schimba). Un articol aplatizat nu are structura de variatii, deci n-are ce sa se strice.

⚠ **La activare li se spune ca feedul NU contine produse cu variatii.** Sablonul din `activare.ts` o
scrie. Crezand altceva, ar astepta structura `<Variations>` si ar putea grupa gresit articolele.

## Adresele, si cheile lor

```
https://www.edinio.com/api/pepita/produse/<cheie-feed>.xml
https://www.edinio.com/api/pepita/stoc/<cheie-feed>.xml
https://www.edinio.com/api/pepita/comenzi/<cheie-comenzi>
```

- **Pe domeniul platformei**, nu pe cel al magazinului: domeniul propriu se poate schimba sau pierde,
  iar adresele date odata catre Pepita ar muri atunci in tacere.
- **Cheia e in CALE**, nu in interogare. Adresa de comenzi accepta si `?apikey=`, fiindca asa arata
  exemplul lor, dar noi dam forma cu cale.
- **Doua chei, doua feluri.** Cea de feed ajunge in mesaje si se afiseaza pe ecran; daca ar deschide
  si adresa care creeaza comenzi, orice copie a mesajului ar fi o cale de a inventa comenzi.
- **In baza sta numai amprenta SHA-256** (`pepita_chei`), indexata unic. Valoarea in clar sta o
  singura data, criptata, in `store_settings.pepita_config` (`privat.campuri_secrete`), fiindca omul
  trebuie sa si-o poata copia. O scurgere a tabelei de amprente nu da nimanui nicio cheie.
- **Rotirea:** cheie noua → scrisa in configurare → abia apoi se sting cele vechi. Invers, o pana
  intre pasi ar fi lasat magazinul cu adresa veche moarta si cea noua pierduta.
- **Deconectarea** revoca toate cheile si sterge valorile din configurare. Comenzile, facturile si
  AWB-urile raman: ele descriu vanzari care chiar s-au facut.

## Feedurile

`src/lib/pepita/feed.ts`, scris **in flux**, pagina cu pagina de cate 500 de produse.

⚠ **De ce in flux:** Vercel refuza raspunsurile peste **4,5 MB**, cu 413, inainte sa ruleze vreun
rand din cod (`/docs/functions/limitations`). Un catalog mare trece de prag. Documentatia lor spune
ca raspunsurile in flux n-au limita asta.

⚠ **`</Catalog>` se scrie NUMAI pe calea de succes.** Asta e atomicitatea: un feed rupt la mijloc
ramane XML neinchis, deci invalid, deci Pepita il respinge intreg si pastreaza ce avea. Inchis
intr-un `finally`, ar fi devenit un feed VALID cu jumatate de catalog, adica jumatate de magazin scos
de la vanzare fara ca nimeni sa afle. **Generatorul nu are voie sa capete `try/finally` in jurul
buclei.**

⚠ **Integrarea oprita da 404, nu un feed gol.** Un `<Catalog>` gol le-ar spune „nu mai am niciun
produs", si ar scoate tot de la vanzare.

Ce se trimite, pe scurt: `Id`, `LastMod` (din `updated_at`), `StructuredId` (EAN validat cu cifra de
control), `ProductNumber`, `Descriptions` (text simplu, fara marcaj), `Prices` (brut, cu
`VatPercent` din setarile magazinului, `DiscountedPrice` doar cand exista reducere reala),
`Warranty`, `Categories` (de la parinte la copil, cu id-urile NOASTRE, cum permit ei),
`Photos` (numai `https`), `ProductUrl`, `Availability`, `Attributes` (axele combinatiei),
`VolumeDimensions` (cm si **kg**, convertite din grame).

## Comenzile

`src/lib/pepita/ruta-comenzi.ts` → `comanda-forma.ts` (citire) → `ingest.ts` (scriere).

⚠ **Exemplul lor de JSON nu e JSON valid** (`"payment_mode":cod` fara ghilimele, virgula lipsa,
virgule la coada). Din asta nu urmeaza ca acceptam orice: urmeaza doar ca schema nu se poate construi
copiind exemplul. Campurile necunoscute nu opresc nimic; cele critice lipsa opresc.

⚠ **Campul de livrare se numeste `delivery_mod`** in documentatia lor, si in definitie, si in
exemplu. Citim amandoua scrierile.

⚠ **Data NU se converteste.** Formatul lor („2018-05-21 10:23:41") n-are fus orar si documentatia nu
spune in ce fus e. Se pastreaza sirul in `order_source.pepita_date`; `orders.created_at` ramane clipa
in care am primit-o noi.

### Idempotenta, si de ce are doua paze

Panoul lor are **„Resend order"**. Aceeasi comanda poate sosi de zece ori, si de doua ori deodata.

1. `pepita_comenzi` are cheia unica `(business_id, external_order_id)`. Doua cereri concurente pot
   amandoua sa citeasca „nu exista", dar numai una poate castiga indexul.
2. `orders.order_number` e unic pe magazin, si comanda se scrie ca `PEP-<id extern>`.
3. Scaderea stocului trece prin `consuma_stoc_comanda_marketplace`, idempotenta prin marcajul
   `orders.stoc_marketplace_la`, pus in aceeasi instructiune cu scaderea.

Paguba cea mai grea nu e o comanda dubla, ci o comanda **unica** cu stocul scazut de doua ori: marfa
inexistenta continua sa se vanda pe celelalte cinci canale. `ingest.test.ts` probeaza zece trimiteri
secventiale si zece concurente.

### Ce se mapeaza si cum

| Pepita | Edinio | De ce |
|---|---|---|
| `payment_mode: cod` | `payment_method: cash_on_delivery` | Banii ii incaseaza CURIERUL comerciantului, nu marketplace-ul. `dhl.actions.ts` verifica textual valoarea asta. |
| `payment_mode` altul sau necunoscut | `payment_method: pepita` | Un necunoscut NU devine ramburs: curierul ar cere a doua oara banii deja platiti. |
| `payment_status` | `paid` / `unpaid` | Lipsa se deduce din modul de plata: cardul e „paid" de obicei, scrie la ei. |
| `delivery_mod` | nimic automat | Lista lor e a pietei UNGARE, si la `gls_parcelshop` nu primim identificatorul punctului. Valoarea se ARATA, comerciantul alege curierul. |
| `status` | mereu `pending` | Campul lor e negarantat, cu valori convenite de la caz la caz. Nu exista lista de tradus. |
| `tax_number` | `orders.billing_company` | Numai daca trece verificarea de CUI. `verified: false`, fiindca NU intrebam ANAF pe calea de ingest. Prefixul „RO" e martorul pentru `vat_payer`. |

**Totalurile vin de la ei si nu se recalculeaza niciodata** din preturile noastre de azi: comanda e o
tranzactie istorica.

### Ce se intampla cand o linie nu se poate lega

Comanda **se scrie oricum**, cu linia pe ea (`product_id: null`), randul din `pepita_comenzi` trece
pe `carantina` cu motivul, nota interna a comenzii o spune, si panoul o ridica. Stocul se scade numai
pentru liniile legate.

Raspunsul catre ei este `isError: false`, cu codul lipsa in `messages`. **E o hotarare, nu o
scapare:** comanda E salvata, iar o retrimitere n-are cum sa repare un cod care nu exista in catalog.
Un `isError: true` ar fi produs reincercari fara capat sau i-ar fi facut sa creada ca n-avem comanda.

`isError: true` se trimite numai cand comanda **nu s-a scris** (503, ca sa reincerce) sau cand
sarcina utila e nevalida (400).

## Facturarea

Comutator in setari, **stins din start**. Documentatia publica Pepita nu spune cine emite factura
catre clientul final, si nu exista nicio cale prin care sa i-o trimitem sau sa aflam ce a emis ea. O
factura emisa degeaba nu se retrage, se storneaza. Aceeasi socoteala ca la Trendyol.

## GDPR

Comenzile Pepita poarta datele unor cumparatori ai marketplace-ului, iar emailul poate fi un **alias**
Pepita.

- Ingestul **nu scrie in `customers`** (tabela aia e scrisa numai de importul de clienti).
- Ingestul **nu trimite niciun email** si nu porneste nicio automatizare de marketing.
- `pepita_comenzi.rezumat` e o tabela de DIAGNOSTIC si **nu tine date personale**: nici nume, nici
  telefon, nici email, nici adresa. Doar linii, sume, tara si judetul de livrare.
- Sarcina utila BRUTA nu se pastreaza nicaieri.

## Fisierele

```
src/lib/pepita/
  types.ts           formele si constantele; piata si moneda, intr-un singur loc
  config.ts          citirea configurarii; forma fara chei, pentru browser
  chei.ts            generare, amprenta, cautare, rotire, adrese          (server-only)
  identitate.ts      `<Id>`-ul si drumul inapoi de la el                  (pur)
  categorii.ts       calea categoriei, de la parinte la copil             (pur)
  pret.ts            strategia de pret, TVA, pretul brut                  (pur)
  stoc.ts            stocul de siguranta si disponibilitatea              (pur)
  articole.ts        hotararea „ce pleaca si de ce nu", si aplatizarea    (pur)
  xml.ts             escapare, elemente, antet, incheiere                 (pur)
  serializare.ts     articolul, scris ca `<Product>`                      (pur)
  feed.ts            citirile si generatorul in flux                      (server-only)
  ruta-feed.ts       trunchiul comun al celor doua rute de feed           (server-only)
  comanda-forma.ts   sarcina lor utila, citita cu neincredere             (pur)
  mapare.ts          plata, livrarea, statusul                            (pur)
  ingest.ts          scrierea comenzii, o singura data                    (server-only)
  ruta-comenzi.ts    autentificare, plafoane, raspunsul in forma lor      (server-only)
  activare.ts        mesajul pe care il trimite comerciantul catre Pepita (pur)

src/app/api/pepita/{produse,stoc}/[cheie]/route.ts
src/app/api/pepita/comenzi/{route.ts,[cheie]/route.ts}
src/app/(dashboard)/dashboard/features/pepita/page.tsx
src/components/dashboard/PepitaClient.tsx
src/lib/actions/pepita.actions.ts
migrations/2026-12-28-pepita-marketplace.sql
```

## Cum se depaneaza

| Simptom | Unde se uita |
|---|---|
| „Nu se intampla nimic dupa ce am trimis adresele" | Panou → Conexiune. Daca scrie „Configurat în Edinio", ei n-au citit inca niciun feed: `pepita_chei.ultima_folosire` e gol. Activarea o fac ei. |
| „Produsele mele nu apar la ei" | Panou → „Verifică produsele". Aceleasi reguli ca feedul, deci ce scrie acolo e ce pleaca. |
| „O comanda n-a intrat" | `pepita_comenzi` pe magazin: randul exista mereu, chiar si cand prelucrarea a picat. `stare` si `motiv` spun de ce. Plus `error_logs` cu `action` care incepe cu `pepita/`. |
| „Stocul nu s-a scazut" | `orders.stoc_marketplace_la` gol inseamna ca scaderea n-a apucat sa se faca. O retrimitere din panoul lor o duce la capat. |
| „Feedul da 404" | Cheia e revocata (rotire sau deconectare), sau integrarea e oprita din panou. |
| „Feedul se taie" | Se cauta in `error_logs` `pepita/feed`. XML-ul neinchis e comportamentul CORECT la o cadere. |

## Ce trebuie confirmat cu Pepita

Lista de intrebari deschise, in ordinea in care conteaza:

1. **Ce pune Pepita in `sku` la comanda?** Presupunem `<Id>`-ul din feedul nostru, fiindca e singurul
   identificator dat de partener pe care il au. Daca trimit `ProductNumber` sau altceva, potrivirea
   cade pe plasa de rezerva (SKU-ul produsului) si restul ajunge in carantina.
2. **Daca un magazin trimite totusi produse cu `<Variations>`, ce `sku` intorc pentru o linie?**
   Raspunsul hotaraste daca modul nativ merita construit vreodata.
3. **Cine emite factura catre clientul final** pe piata din Romania?
4. **Lista de `delivery_mod` pentru Romania.** Cea publicata (`shipping`, `gls`, `gls_parcelshop`,
   `mpl`) e a pietei ungare.
5. **`ShippingDelay`**: zile lucratoare, confirmat in documentatie. Se cere confirmarea ca se
   masoara de la primirea comenzii.
6. **Blocurile repetate din exemplul lor de XML** (`<Prices>...</Prices><Prices>...</Prices>`) sunt
   marcaje de colapsare ale paginii lor sau chiar mai multe blocuri, pentru mai multe monede? Noi
   trimitem cate unul singur, ceea ce e sigur in orice caz.

## Ce ramane de facut in Pepita, cu mana

Lucruri care nu se pot automatiza fiindca nu exista API pentru ele:

- **activarea conexiunii**, dupa ce comerciantul trimite adresele;
- **confirmarea fiecarei comenzi**, in cel mult o zi, din „Pending orders";
- **statusul si data predarii catre curier**;
- **anularea si anularea partiala**;
- **rambursarile**;
- **oprirea conexiunii**, cand comerciantul deconecteaza integrarea din Edinio.
