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

Cele doua capete ale promisiunii — textul catre ei si ce emite chiar serializatorul — sunt legate de
`promisiunea-fara-variatii.test.ts`. Traiau despartite, iar o reparatie care ar fi inceput sa emita
`<Variations>` ar fi trecut de toate probele, si prima care ar fi aflat ar fi fost Pepita.

Documentatia lor, asa cum a fost descarcata pe 08.09.2026, e pastrata in `docs/pepita/`, cu
propozitia despre variatii citabila la fata locului. Pana atunci copiile traiau doar in dosarul
temporar al unei sesiuni, deci verificarea afirmatiei cerea recuperare din transcrieri.

### Articolele orfane, si ce NU se vede

Un articol trimis candva si care azi nu mai e generat de feed ramane la ei, cu ultimul pret si
ultimul stoc, si se poate vinde in continuare. Feedul n-are cum sa spuna „scoate produsul asta",
si nu exista niciun API: singurul lucru cinstit e sa-l ARATAM. Panoul o face, din evidenta
`pepita_articole`.

⚠ **Cu o gaura stiuta:** `pepita_articole.product_id` are `on delete cascade`. Cand comerciantul
STERGE produsul de tot (nu il dezactiveaza), randul de evidenta piere odata cu el, deci tocmai
orfanul PERMANENT — cel pe care nimeni nu-l mai poate afla altfel — nu se mai poate arata. O
varianta redenumita se vede, un produs sters nu. Repararea cere o migratie (`on delete set null`,
cu numele produsului copiat la scriere), care se livreaza impreuna cu baseline-ul regenerat.

### Cum se socoteste `<LastMod>`

Cel mai tarziu dintre: data produsului, data listarii lui (`pepita_listari.actualizat_la`), data
magazinului, data celei mai recent atinse categorii, si o **stampila a configurarii**.

⚠ Stampila NU e `store_settings.updated_at`, si asta a fost prima incercare, gresita: coloana
aceea urca la FIECARE COMANDA, fiindca numerotarea secventiala face `update store_settings set
order_counter = ...`, iar pe tabela din spatele vederii sta un declansator care pune `updated_at`
neconditionat. `LastMod` ar fi fost „acum" in fiecare zi, pe tot catalogul: corect, dar fara
nicio informatie.

In loc, feedul socoteste o **amprenta** a campurilor care chiar ajung in XML (TVA, moneda,
strategia de pret, stocul de siguranta, transportul, garantia, piata, modul de includere) si,
cand difera de cea pastrata in `pepita_config`, scrie una noua impreuna cu clipa de acum. Deci
stampila e clipa in care s-a OBSERVAT schimbarea: mereu mai tarziu decat schimbarea, niciodata
mai devreme, deci nu poate ingheta un pret vechi.

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

Ce se trimite, pe scurt: `Id`, `LastMod` (cel mai tarziu dintre `products.updated_at`,
`pepita_listari.actualizat_la` si un prag al magazinului; vezi nota lunga din `feed.ts`), `StructuredId` (EAN validat cu cifra de
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
| `payment_mode: cod` **si** livrare care NU e a Pepitei | `payment_method: cash_on_delivery` | Banii ii incaseaza CURIERUL comerciantului. `dhl.actions.ts` verifica textual valoarea asta. |
| `payment_mode: cod` **si** `delivery_mod: gls` sau `gls_parcelshop` | `payment_method: pepita`, plus `order_source.incaseaza_marketplace: true` | ⚠ La Pepita Delivery **rambursul ajunge la Pepita**, scrie pe pagina lor pentru Romania. Precompletat pe un AWB propriu, clientul ar fi platit A DOUA OARA. |
| `payment_mode: transfer` | `payment_method: pepita`, neincasat la usa | Transferul „nu ajunge la Pepita, ci direct la voi", tot pagina lor. |
| `payment_mode` altul sau necunoscut | `payment_method: pepita` | Un necunoscut NU devine ramburs: curierul ar cere a doua oara banii deja platiti. |
| `payment_status` | `paid` / `unpaid` | Lipsa se deduce din modul de plata: cardul e „paid" de obicei, scrie la ei. |
| `delivery_mod` | hotaraste CINE incaseaza rambursul; curierul il alege comerciantul | Lista lor e a pietei UNGARE. La `gls_parcelshop` nu primim identificatorul punctului, iar traducerea lor maghiara ii spune „csomagautomata", adica **automat de colet**, nu parcel shop: eticheta din panou spunea gresit. |
| `currency` pe linii | `order_source.currency` | Trebuie sa fie UNA singura: doua monede resping comanda, fiindca totalul s-ar aduna din mere si pere. Alta decat a magazinului duce comanda in carantina. |
| `vat` pe linie | `orders.items[].vat_rate` | ⚠ Cota ramane PE LINIE. `orders.vat_rate` e cota liniei cu valoarea cea mai mare, nu maximul cotelor. |
| `status` | mereu `pending` | Campul lor e negarantat, cu valori convenite de la caz la caz. Nu exista lista de tradus. |
| `tax_number` | `orders.billing_company` | Numai daca trece verificarea de CUI. `verified: false`, fiindca NU intrebam ANAF pe calea de ingest. Prefixul „RO" e martorul pentru `vat_payer`. |

⚠ `order_source.incaseaza_marketplace` e cheia de care atarna rambursul, si e ADEVARATA doar cand
banii chiar sunt la altcineva: ramburs dus de GLS-ul Pepitei, sau card/transfer **confirmat platit**.
Un transfer nefacut nu goleste rambursul, fiindca banii nu-i are nici Pepita, nici curierul.

Campul e **obligatoriu** in `ComandaCuRamburs`, tocmai ca `tsc` sa numeasca fiecare din cele
douazeci si unu de locuri care cheama `rambursDeIncasat`: unsprezece dintre ele pasau un obiect
ingustat, iar o verificare pusa doar in functie le-ar fi lasat pe toate deschise, tacut. Cel mai
periculos era generarea in MASA de AWB, unde `select`-ul nici nu cerea `order_source`.

⚠ Si `order_source` nu se mai scrie cu ce trimite browserul. Pe comenzile din magazin se facea
`{ ...source }` dintr-o actiune publica, deci un cumparator putea trimite
`incaseaza_marketplace: true` si primea un colet cu ramburs 0,00. Lista e alba acum: vezi
`CHEI_ATRIBUIRE` in `order.actions.ts`.

**Totalurile vin de la ei si nu se recalculeaza niciodata** din preturile noastre de azi: comanda e o
tranzactie istorica.

### Carantina: patru motive, si toate se aduna

Comanda **se scrie oricum**. Ce se schimba e ca randul din `pepita_comenzi` trece pe `carantina` cu
motivul scris, nota interna a comenzii il spune, si panoul o ridica.

| Motivul | Cand | Se repara |
|---|---|---|
| `Coduri fără corespondent în Edinio: …` | `sku`-ul primit nu se leaga de niciun produs | comerciantul creeaza produsul, apoi „Reprocesează" |
| `Nu se poate expedia: lipsesc …` | curier propriu, si lipsesc numele, telefonul, judetul, localitatea sau strada | se completeaza din „Editează comanda", apoi „Reprocesează" |
| `Comandă în altă monedă decât magazinul.` | `order_source.currency` difera de `store_settings.currency` | numai cu mana: suma se converteste inainte de AWB si de factura |
| `Stocul nu s-a putut scădea.` | RPC-ul de consum a picat | cronul `pepita-stoc`, la fiecare zece minute, fara sa depinda de nimeni |

⚠ **Motivele se leaga, nu se inlocuiesc.** Pana pe 08.09.2026 esecul de stoc scria peste motivul
dinainte, iar cronul scoate din carantina randurile al caror motiv e chiar al lui: o comanda cu doua
probleme ar fi iesit din carantina cu prima nerezolvata.

⚠ **La livrarea Pepitei nu se cere nimic.** Coletul e dus de GLS-ul contractat de ei, cu eticheta lor,
deci o adresa incompleta nu opreste nimic si nu produce carantina.

⚠ **Stocul se scade oricum**, si pentru comenzile in carantina: marfa e vanduta la ei, iar nescazuta
se supravinde pe celelalte cinci canale.

**„Reprocesează"** (panou, langa fiecare comanda cu probleme) leaga din nou liniile, completeaza
`orders.items`, duce stocul la capat si recalculeaza motivele. Aceeasi socoteala o foloseste si
retrimiterea lor, ca sa nu existe doua adevaruri despre aceeasi comanda. Pe o comanda anulata nu
atinge stocul; iar cand `orders.items` nu mai corespunde cu ce ne-au trimis ei (o linie adaugata de
mana din panou) REFUZA in loc sa ghiceasca: setul trimis functiei de ajustare e autoritar, iar ce
lipseste din el s-ar elibera inapoi pe raft cu marfa plecata.

Raspunsul catre ei este `isError: false`, cu codul lipsa in `messages`. **E o hotarare, nu o
scapare:** comanda E salvata, iar o retrimitere n-are cum sa repare un cod care nu exista in catalog.
Un `isError: true` ar fi produs reincercari fara capat sau i-ar fi facut sa creada ca n-avem comanda.

`isError: true` se trimite numai cand comanda **nu s-a scris** (503, ca sa reincerce) sau cand
sarcina utila e nevalida (400).

## Facturarea

Comutator in setari, **stins din start**. Documentatia publica Pepita nu spune cine emite factura
catre clientul final, si nu exista nicio cale prin care sa i-o trimitem sau sa aflam ce a emis ea. O
factura emisa degeaba nu se retrage, se storneaza. Aceeasi socoteala ca la Trendyol.

⚠ **TVA-ul ramane pe fiecare linie**, in `orders.items[].vat_rate`. `orders.vat_rate` nu mai e
`max(cote)` — care gresea in aceeasi directie pe fiecare linie, deci o comanda cu hrana la 11% si o
jucarie la 21% iesea integral cu 21% — ci cota liniei cu valoarea cea mai mare.

⚠ Si **facturarea automata se opreste** cand cotele difera, cu motivul scris in jurnal si in nota
interna a comenzii, ca omul sa afle inainte sa apese, nu dupa ce a iesit documentul. Limitarea
ramane: Edinio trimite o singura cota catre SmartBill, Oblio si fGO. Rescrierea facturarii pe cote
per linie atinge TOTI comerciantii, nu doar pe cei cu Pepita, si e o lucrare de sine statatoare.

## GDPR

Comenzile Pepita poarta datele unor cumparatori ai marketplace-ului, iar emailul poate fi un **alias**
Pepita.

- Ingestul **nu scrie in `customers`** (tabela aia e scrisa numai de importul de clienti).
- Ingestul **nu trimite niciun email** si nu porneste nicio automatizare de marketing.
- `pepita_comenzi.rezumat` e o tabela de DIAGNOSTIC si **nu tine date personale**: nici nume, nici
  telefon, nici email, nici adresa. Doar linii, sume, tara si judetul de livrare.
- Sarcina utila BRUTA nu se pastreaza nicaieri.
- ⚠ **Marketingul comerciantului nu primeste cumparatori de marketplace.** `clientDeMarketplace`
  (in `src/lib/orders/`) opreste Brevo, Mailchimp si Klaviyo pe ORICE comanda cu
  `order_source.marketplace`, deci si eMAG, Trendyol, About You. Poarta sta acolo unde se citeste
  comanda, nu la apelant: sunt sase cai catre marcarea „platit", si una pusa la apelant ar fi pazit
  o singura cale. Se opresc si cele trei butoane „Sincronizeaza clientii existenti", si potrivirea
  avansata Meta/TikTok de pe pagina de confirmare.
- **Ce NU se opreste:** automatizarile OPERATIONALE. Factura, AWB-ul, instiintarea de expediere si
  SMS-ul de stare tin de executarea contractului. Conversia GA4 ramane si ea: nu duce nicio data
  personala, iar venitul de marketplace se numara dinadins.

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
  carantina.ts       motivele carantinei, si ce lipseste ca sa expediezi  (pur)
  includere-in-masa.ts  „include toate produsele", pana la capat          (server-only)

src/app/api/pepita/{produse,stoc}/[cheie]/route.ts
src/app/api/pepita/comenzi/{route.ts,[cheie]/route.ts}
src/app/(dashboard)/dashboard/features/pepita/page.tsx
src/components/dashboard/PepitaClient.tsx
src/app/api/cron/pepita-stoc/route.ts        reincercarea consumului de stoc, la 10 minute
src/lib/orders/client-de-marketplace.ts      poarta marketingului, pentru TOATE marketplace-urile
src/lib/actions/pepita.actions.ts
migrations/2026-12-28-pepita-marketplace.sql
migrations/2026-12-29-pepita-articole-exportate.sql
docs/pepita/                                 documentatia lor oficiala, cu data descarcarii
```

## Cum se depaneaza

| Simptom | Unde se uita |
|---|---|
| „Nu se intampla nimic dupa ce am trimis adresele" | Panou → Conexiune. Daca scrie „Configurat în Edinio", ei n-au citit inca niciun feed: `pepita_chei.ultima_folosire` e gol. Activarea o fac ei. |
| „Produsele mele nu apar la ei" | Panou → „Verifică produsele". Aceleasi reguli ca feedul, deci ce scrie acolo e ce pleaca. |
| „O comanda n-a intrat" | `pepita_comenzi` pe magazin. ⚠ Randul exista de la prima citire REUSITA a sarcinii: un refuz mai devreme (cheie gresita 401, corp peste 512 KB 413, JSON stricat 400, plafon de cereri 429) nu lasa niciun rand, si atunci se cauta numai in `error_logs`, cu `action` care incepe cu `pepita/`. |
| „Stocul nu s-a scazut" | `orders.stoc_marketplace_la` gol inseamna ca scaderea n-a apucat sa se faca. Cronul `pepita-stoc` o reia la fiecare zece minute, fara sa depinda de nimeni; butonul „Reprocesează" din panou face acelasi lucru pe loc. Un rand ramas in carantina cu motivul de stoc inseamna ca reincercarea inca n-a reusit. |
| „O comanda a ramas cu probleme desi am reparat catalogul" | Panou → comenzile cu probleme → „Reprocesează". Daca raspunde ca liniile nu mai corespund, cineva a adaugat o linie de mana pe comanda: se scoate, apoi se reia. |
| „Feedul da 404" | Cheia e revocata (rotire sau deconectare), sau integrarea e oprita din panou. |
| „Feedul se taie" | Se cauta in `error_logs` `pepita/feed`. XML-ul neinchis e comportamentul CORECT la o cadere. |

## Ce trebuie confirmat cu Pepita

Lista de intrebari deschise, in ordinea in care conteaza:

> Documentatia lor, asa cum a fost descarcata pe 08.09.2026, e pastrata in `docs/pepita/`.
> Intrebarile de mai jos sunt exact ce NU scrie acolo.

1. **In `products[].sku` al comenzii pe care ne-o impingeti, ce camp din feedul nostru puneti:
   `<Id>`, `<ProductNumber>` sau `<StructuredId>`?** Documentatia spune doar „stock-keeping unit
   code of the product (given by the partner)". Noi presupunem `<Id>`. Daca trimiteti altceva,
   potrivirea cade pe plasa de rezerva (SKU-ul produsului) si restul ajunge in carantina.
   *Se poate afla si fara ei, cu o singura cumparatura reala dintr-un produs cu variante:
   `select rezumat from pepita_comenzi where external_order_id = '<id>'` pastreaza `sku`-ul primit.*
2. **Ce se intampla cu un articol al carui `<Id>` nu mai apare intr-o citire ulterioara a
   feedului?** Ramane publicat cu ultimele date, sau il scoateti de la vanzare, si dupa cate zile?
   De raspuns atarna cat de grav e un articol orfan lasat dupa o redenumire de varianta.
3. **Trimitem fiecare varianta ca `<Product>` de sine statator, cu `<Id>` propriu, dar cu
   `<ProductNumber>` (MPN) IDENTIC pe toate variantele aceluiasi produs. Dedupleaza sistemul
   vostru dupa `<ProductNumber>`?** Daca da, variantele s-ar putea contopi la ei.
4. **Cine emite factura catre clientul final** pe piata din Romania?
5. **Lista de `delivery_mod` pentru Romania.** Cea publicata (`shipping`, `gls`, `gls_parcelshop`,
   `mpl`) e a pietei ungare.
6. **`ShippingDelay`**: zile lucratoare, confirmat in documentatie. Se cere confirmarea ca se
   masoara de la primirea comenzii.
7. **Blocurile repetate din exemplul lor de XML** (`<Prices>...</Prices><Prices>...</Prices>`) sunt
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
