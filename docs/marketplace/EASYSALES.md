# easySales

Integrarea cerută pe 12.10.2026. Comerciantul are deja cont easySales și și-l conectează: comenzile
magazinului pleacă în easySales, unde se fac factura și AWB-ul, iar starea, AWB-ul și factura se
întorc în Edinio. Edinio nu încheie nimic cu easySales (hotărârea proprietarului): relația e a
comerciantului.

Planul întreg, cu fiecare afirmație marcată [A] (documentația lor), [C] (codul și baza noastră) sau
IPOTEZĂ: `docs/marketplace/EASYSALES-PLAN.md`. Fișierul de față spune ce s-a construit și ce
rămâne deschis.

## Sursele

| Ce | Unde |
|---|---|
| Documentația | colecția Postman publică „easySales V2” (6542984/SzfDvj4T) și mediul ei publicat „Production”, descărcate pe 12.10.2026 |
| Originalul | NU intră în depozit: în exemple are ce par a fi credențiale reale și date de cumpărători. sha256 al originalului: `b1073237b09ca80f499428e067839a3bce27b086fc7bc9d0c2f51be7c8868e38` |
| Copia din depozit | `docs/marketplace/easysales-api-schema-2026-10-12.json`: numai numele, metoda, calea, cheile interogării și tabelele de câmpuri (92 de cereri, 57 de tabele), fără exemple și fără valorile variabilelor. sha256 (pe LF) `3828ef3f929da89be4ba2458269c9b30f726f09e7f826da9dd4694644b681024`; o probă cere chiar amprenta |
| Rutele | `src/lib/easysales/rute-colectie.ts` (87), derivate din schemă; `contractul-api.test.ts` cere ca fiecare cerere a codului să fie una dintre ele |
| Gazda | `https://easy-sales.com/api/v2` și `https://easy-sales.com/oauth/token`, constante; `EASYSALES_API_URL` numai pentru probe |

## Ce face fiecare parte la noi

| Parte | Unde |
|---|---|
| Conectarea în două trepte, garda „un cont, un magazin” pe client ȘI pe website, exclusivitatea canalelor | `conectare.ts`, `exclusivitate.ts`, `src/lib/integrari/cont-marketplace-unic.ts` |
| Tokenul (grantul `website`), emis numai sub zăvorul din bază (o emitere revocă tokenul în uz) | `token.ts`, RPC-urile `easysales_ia_emiterea` / `easysales_scrie_tokenul` |
| Clientul HTTP: ritm comun pe contul lor (250/min din 500), termene 20 s / 60 s, 401 și 403, jurnal fără corpuri | `client.ts`, `erori.ts` |
| Ștampila comenzii la inserare și coada (în bază) | migrația 73: `easysales_stampileaza_comanda`, `easysales_marcheaza_comanda`, regula comună `easysales_se_stampileaza` |
| Comanda spre `POST /orders/save`, cu garda sumelor (`reconciliazaComanda`) | `mapare-comanda.ts`, `identitate.ts`, `comenzi.ts` |
| Starea, AWB-ul și factura înapoi, numai înainte, prin `tranzitieComandaMarketplace` | `stari.ts`, `curieri.ts`, `oglinda.ts` |
| Webhook-urile: jetonul din adresă + semnătura, inboxul curățat pe listă albă | `webhook.ts`, `semnatura.ts`, `inbox.ts`, ruta `/api/easysales/webhook` |
| Abonările, sănătatea, notificările | `abonari.ts`, `sanatate.ts`, `notificari.ts` |
| Cronul la minut | `/api/cron/easysales-sync`, `coada.ts` |
| Porțile din Edinio (fără factură și AWB de aici, starea și editarea după trimitere) | `origin.ts` (`procesataInEasySales`), `awb-propriu.ts`, `invoice-auto.actions.ts`, casele de facturare, `order.actions.ts`, `bulk-orders.actions.ts`, `paza.ts`, `cont_anuleaza_comanda` |
| Panoul și pagina comenzii | `/dashboard/features/easysales`, `EasySalesConfigClient.tsx`, `easysales/EasySalesComandaPanel.tsx` |
| Catalogul (E3), oprit în cod până după E0 (`CATALOG_PORNIT`) | migrația 74, ținută în `docs/marketplace/2026-10-13-easysales-catalog.sql` (vezi mai jos de ce nu în `migrations/`) |
| Ce pleacă în catalog și de ce nu: o singură hotărâre, pentru raport, pentru lucrător și pentru pagina produsului | `eligibilitate.ts` |
| Corpul produsului, categoriile (calea, frunza, categoria de rezervă), caracteristicile | `mapare-produs.ts`, `mapare-categorii.ts`, `mapare-caracteristici.ts` |
| Lucrătorul catalogului: categoriile și caracteristicile înaintea produselor, Save pe element până la 50, loturi de 100 cu vinovatul aflat din erori, prețurile pe drumul lor, arhivarea | `catalog.ts`, `catalog-loturi.ts`, `catalog-pas.ts` |
| Verificarea: lista lor, cei doi martori, paza website-ului redenumit, retrimiterea o singură dată | `verificare.ts` |
| Ce face omul: raportul de pregătire, pornirea, oprirea, reluarea, retrimiterea, excluderea, confirmarea prețurilor, setările | `catalog-actiuni.ts`, `easysales/EasySalesCatalog.tsx`, `easysales/EasySalesProdusPanel.tsx` (pagina produsului) |
| Bucla de stoc (E4), oprită în cod până după E0 și M-STOC-1 (`STOC_PORNIT`, `FORMULA_STOC`) | `bucla.ts`: poarta, citirea comenzilor lor înaintea fiecărei împingeri (regula celor 60 de secunde), împingerea pe `/stocks/bulk`, siguranța de masă pe val, deriva, pornirea în umbră, canar sau cu efect, oprirea cu stocul pe 0 întâi |
| Stocul Edinio pe articol și cele două formule (scădere sau rezervare), alese după măsurătoare | `stoc.ts` |
| Vânzările din celelalte canale: clasificarea (canal nativ, onorată de marketplace, anulată la prima vedere, fără linii legate, vânzare pe doi martori), comanda `ES-...` cu date minime, consumul și ajustarea prin funcțiile SQL existente, neschimbate | `vanzari-externe.ts` |
| Panoul stocului | `easysales/EasySalesStoc.tsx` |

## Ce NU are API-ul, și ce am făcut cu asta

- **Niciun sandbox.** Colecția nu pomenește unul. Singurul mediu de probă e serverul fals (`fals-easysales.ts`), mai strict decât documentația acolo unde ea tace. Măsurătorile E0 se fac pe contul de probă al comerciantului.
- **Ștergerea clienților și a comenzilor.** Se pot doar suprascrie (`PATCH /customers/{id}`, rutele PUT ale adreselor și ale comenzii). Hotărârea proprietarului: ștergerea de acolo o face comerciantul; Edinio îl anunță la anonimizare (`customer-manage.actions.ts`).
- **Răspunsul lui Save Order.** Exemplul e copiat de la Add. `internal_id` se păstrează când vine, altfel se află din `GET /orders?order_display_id=`.
- **Cheia de potrivire a lui Save** (M-COM-1). De aceea un Save nu se reia orb: după un răspuns pierdut se caută întâi comanda, iar abia după 10 minute și două citiri goale se trimite din nou.
- **Codul HTTP al plafonului de comenzi** (M-COM-6). Mesajul „Orders limit exceeded” se citește înaintea codului.
- **Formula semnăturii** (ce acoperă `$payload`, M-WH-1). Se calculează pe corpul brut și pe subșirul `payload`, niciodată pe o reserializare; modul `masoara` trece singur în `impune` la prima livrare care dovedește formula.
- **Ce comenzi vede un token de website** (M-EXT-1). De el atârnă bucla de stoc (E4).

## Hotărâri

| Hotărârea | Motivul |
|---|---|
| Clientul API și website-ul sunt ale comerciantului, câte unul pe magazin | un token nou îl revocă pe cel vechi [A]; un website pe două magazine le-ar amesteca cataloagele |
| Comenzile cu plată online și transfer pleacă după încasare | o automatizare a lor ar emite AWB sau factură pe bani neîncasați |
| Ridicarea personală, curierul propriu, lockerele, străinătatea, altă monedă decât RON și fișierele de personalizare rămân în Edinio | AWB spre casa unui om care vine la magazin; livrare făcută de magazin; operatorul lor n-ar avea fișierele |
| `order_total` = suma încasată (setarea „Totalul trimis” o poate schimba) | definiția lor („products values + shipment tax”) nu se potrivește cu ce plătește cumpărătorul; M-COM-2 alege |
| `order_source.easysales` se îmbină cu `jsonb_set`, niciodată prin rescrierea lui `order_source` | atribuirea (utm, consimțământ) stă în aceeași coloană |
| Jetonul adresei de webhook se derivă (HMAC) din secretul de semnare, iar în bază stă numai hash-ul lui | abonările se pot reface oricând fără jetonul în clar |
| `EASYSALES_LIVE=false` stinge numai conectările noi; `EASYSALES_PILOT` deschide magazinele pilot | magazinele conectate au comenzi ștampilate: oprirea lor e pauza, nu variabila |
| Catalogul (E3) și bucla de stoc (E4) sunt oprite de constante în cod (`CATALOG_PORNIT`, `STOC_PORNIT`), nu de variabile de mediu | o variabilă s-ar putea porni fără migrația 74, iar codul ar citi tabele care nu există. Constanta se schimbă printr-un commit, iar proba `catalogul-si-migratia-merg-impreuna.test.ts` cere ca același commit să mute migrația în `migrations/` |
| Migrația 74 stă în `docs/marketplace/`, nu în `migrations/` | în `migrations/` intră numai ce e deja în producție (`migrations/CITESTE-INTAI.md`), iar pasul CI „Baseline-ul acoperă toate migrațiile” cade altfel. Planul o aplică pe producție abia la pornirea E3 |
| Raportul de pregătire merge de acum, fără comutator | citește numai tabele care există și pe producție (produsele, categoriile, setările, `easysales_produse`); arată golurile de SKU și de descriere din timp |
| Hotărârile D8, D9, D10, D11, D21, D23, D30 au valorile recomandate din plan, ca setări ale catalogului | SKU generat pentru produsele fără SKU; produsele fără evidența stocului și cele fără descriere nu pleacă (cu bife care le pot trimite); pachetele și produsele cu personalizare servită nu pleacă; ștergerea arhivează; calea categoriei, frunza pe produs, „Fără categorie” ca rezervă; varianta scoasă rămâne pe stoc 0. **De confirmat de proprietar înainte de E3** |
| Siguranța de masă pe prețuri (D22) numără produsele din coadă, nu variația fiecărui preț | variația cerea citirea întregului val înaintea primului preț trimis; regula de aici e mai strictă (întreabă și la o scumpire de 2% pe tot catalogul) |
| Un preț nou pe un articol deja trimis pleacă numai prin `/products/prices/bulk` | Save-ul de conținut poartă prețul trimis ultima oară; altfel o scumpire în masă făcută odată cu o schimbare de descriere ar ocoli siguranța de masă |
| Domeniul, permalinkurile, TVA-ul și setările catalogului intră într-o amprentă a mediului, socotită la fiecare trecere | o amprentă schimbată pune tot catalogul în coadă; prinde și drumurile de mâine, fără chemări scrise de mână în fiecare drum care schimbă adresa |
| Un articol de catalog al cărui SKU propriu e deja al altui articol se oprește (`sku-duplicat`), nu cade pe SKU-ul generat | catalogul poate aștepta omul, o comandă nu (la comenzi, E2, cade pe cel generat). SKU-ul trimis se îngheață: un SKU nou la ei înseamnă un produs nou (M-PROD-1) |
| Un SKU confirmat care dispare la ei nu se recreează singur | arhivarea sau ștergerea de acolo e hotărârea omului; panoul oferă „Retrimite” și „Exclude” |
| Formula stocului e un parametru cu ambele variante scrise (scădere: E - vânzări văzute neconsumate; rezervare: E + rezervările comenzilor consumate în Edinio și încă fără AWB sau factură la ei) | modelul lor de stoc nu e documentat în API; formula greșită scade aceeași bucată de două ori sau învie una vândută (proba `bucla-pur.test.ts` simulează ambele modele). Se alege după M-STOC-1, nu după o presupunere |
| Un Save de conținut nu crește niciodată stocul unui articol deja trimis (pleacă cel mai mic dintre trimis și proaspăt) | creșterile și punerile pe 0 pleacă numai pe drumul stocului, cu siguranța lui de masă și cu citirea comenzilor înainte |
| Siguranța de masă pe stoc se numără pe val (până se golește coada de stoc), nu pe trecere | un feed stricat care pune pe 0 tot catalogul ajunge în coadă ca mii de lucrări, prelucrate câte 100: o regulă pe trecere n-ar opri nimic |
| În canar se consumă numai liniile SKU-urilor alese, la intrare și la recitire; în umbră nu se ajustează nicio linie | altfel recitirea unei comenzi consumate pe jumătate ar consuma retroactiv restul, iar un set gol trimis la ajustare ar elibera tot |
| Comenzile aduse au date personale minime (D6): numele, orașul, județul | telefonul, emailul și strada nu trebuie la nimic în Edinio: comanda se procesează în easySales |
| Oprirea buclei, pauza și deconectarea pun întâi stocul pe 0 la ei, verificat pe SKU (D20); dacă nu reușesc, nu trec mai departe | altfel marfa ar rămâne de vânzare pe marketplace-uri, fără ca vânzările de acolo să mai scadă stocul din Edinio |
| Stingerea comenzilor sau deconectarea mută comenzile netrimise înapoi în Edinio, cu notificare | altfel ar rămâne comenzi ștampilate (fără factură și AWB din Edinio) care nu mai pleacă |

## Măsurat pe fir

**Încă nimic pe un cont easySales real.** Contul de probă îl creează comerciantul (Edinio nu creează conturi). Până atunci:

- **Bucla de stoc pe DEMO**, cu baza adevărată și easySales fals (proba din afara depozitului, 8 scenarii): umbra cu toate clasele (vânzare, canal nativ, FBE, alt website, anulată la prima vedere) fără nicio comandă scrisă; efectul cu comanda `ES-...` (date minime, fără ștampilă), consumul o singură dată la recitire și stocul trimis cu rezervarea până la AWB; anularea la ei care eliberează stocul și cantitatea mărită după consum, ajustată; canarul fără consum retroactiv; formula de scădere; siguranța de masă cu confirmarea; deriva (corecția în sus, alarma la a doua observație în jos); oprirea cu tot stocul pe 0 verificat.
- **Catalogul pe DEMO**, cu baza adevărată și easySales fals (proba din afara depozitului, 11 scenarii): încărcarea inițială (categoriile înaintea produselor, fiecare articol eligibil o singură dată, pe stoc 0, cu `parent_id` = rândul părintelui), verificarea completă pe cei doi martori, a doua trecere fără nicio retrimitere (amprenta), declanșatorii cap la cap (descrierea cu Save, prețul cu `prices/bulk`, stocul nimic în E3), variantele (redenumirea fără `uid` păstrează produsul, combinația scoasă rămâne pe 0 sau se arhivează, arhivatul nu mai primește nimic), trecerea simplu -> variante, ștergerea cu arhivare și `blocked` reluat a doua zi, siguranța de masă pe prețuri, website-ul redenumit (nicio retrimitere), SKU-ul duplicat fără majuscule, încărcarea a 260 de produse tăiată după buget și reluată fără dubluri. Plus 14 probe SQL pe declanșatori (REGISTRU, rândul 74).
- **Pe DEMO** (`krycmubsiojipwslxrka`), cu baza adevărată și easySales fals: trimiterea (7 scenarii: prima trimitere, răspuns pierdut cu comanda ajunsă, răspuns pierdut cu comanda neajunsă, plata online, 422 cu întoarcerea la Edinio, plafonul, anularea în timpul apelului), oglinda (procesare, expediere cu AWB și curier, livrare, retur anunțat o singură dată, anulare fără AWB, plasa pe 24 de ore), alocarea articolelor (cursa a doi lucrători), probele SQL ale migrațiilor (REGISTRU, rândurile 72-73).
- **Fără rețea:** maparea pe valori (exemplul Save al lor se reface la zecimală), stările (și în `valori-permise`), contractul cu colecția, termenele, secretele, webhook-ul, abonările, testul fără scrieri.

## Măsurat pe contul real (E0, 14.10.2026)

Primul comerciant conectat (okxi, website-ul „Edinio”), numai cu cereri de citire în afara conectării:

- **Emiterea tokenului** (`grant_type=website`, corp JSON cu `client_id`, `client_secret`, `website_token`, `scope`) merge: tokenul ține un an, iar toate cele 26 de scope-uri cerute sunt acordate. La perechea client-secret greșită: `401 Client authentication failed`.
- **`GET /websites/list`** dă `name`, `url`, `status`, `module_version`. Contul de probă vine cu un website demonstrativ, „Virtual Shop” (fără URL), cu 3 produse demonstrative; poarta „website gol” l-a refuzat corect.
- **`GET /products?website=`** filtrează STRICT (un nume inexistent dă zero, numele exact numai produsele lui) și are `meta.total` (M-PROD-7).
- **`GET /marketplaces/list`** dă tot catalogul lor (178 de canale), nu canalele contului (M-MKT-1): exclusivitatea rămâne pe declarația omului.
- **`GET /webhooks`** e GRUPAT pe tipul de webhook: `{slug, name, group, subscriptions: [{id, url, http_method, secret, details, active}]}`, cu adresa întreagă (query string inclus) și secretul în clar. Secretul trimis sub numele `secret` e preluat la toate abonările (M-WH-1, numele câmpului). `POST /webhooks/{slug}` cu un (slug, adresă) existent: `422 „Câmpul url a fost deja folosit.”`.
  ⚠ Codul citea lista plat: nu găsea nicio abonare, verificarea zilnică le reabona, primea zece 422 și golea `abonari`. Reparat în `abonari-lista.ts`; serverul fals întoarce acum forma reală, iar proba pică pe citirea plată.
- **Livrările webhook:** semnătura se potrivește pe corpul brut (varianta „corp”, M-WH-1). Antetele lor includ `Website-Token` și `EasySales-User-Uuid`, iar evenimentul de probă are payload-ul `[]`. ⚠ **Nelămurit:** evenimentul lor de probă (payload `[]`) e notat **eșuat** (`success: false` cu `status_code: 200`) și reîncercat după 10 s, 100 s și 1000 s, deși ruta răspunde, cap la cap, în 0,25-0,5 secunde, iar documentația cere numai „2xx în sub 3 secunde”. Am trecut răspunsul pe `{"success":true}`, ca în exemplul lor de livrare reușită (`corpulRaspunsului`, cu probă pe textul rutei), dar verdictul pe proba lor a rămas același: corpul nu e cauza. Ipoteza e că logica lor cade pe payload-ul gol; se confirmă sau se infirmă pe prima livrare reală. Dacă și aceea iese eșuată, se întreabă suportul easySales. Reîncercările nu strică nimic: proba se ignoră, iar o livrare reală duce doar la o recitire comasată.
- **Produsele:** `products/save` primește și fără imagini, categorii sau caracteristici. Prețul trimis e cu TVA, iar ei îl păstrează net (1 cu 21% devine 0,8264). `stocks/bulk` scrie `stock` și întoarce `reserved_stock`.
- **Limita:** 500 de cereri pe minut (`x-ratelimit-remaining`).

## Ce rămâne deschis

- **E0, pe contul de probă:** JWT-ul decodat, 401 vs 403 la tokenul revocat, Save Order pe exemplul nostru (M-COM-1..9), formula semnăturii (M-WH-1, la prima livrare), ce comenzi vede tokenul de website (M-EXT-1), modelul de stoc (M-STOC-1).
- **E3 (catalogul) e construit și oprit.** Pornește numai după E0 (M-EXT-1, M-STOC-1, plus M-CAT-1 și M-PROD-1..7) și după hotărârile D8-D11, D21-D23, D30. În ziua pornirii, în ordinea asta: migrația 74 se mută în `migrations/`, se aplică pe producție înaintea codului (cu acordul proprietarului), `CATALOG_PORNIT = true`, baseline-ul se regenerează, totul în același push.
- **E4 (bucla de stoc) e construită și oprită.** Pornește după E3, după M-EXT-1 și M-EXT-2 (ce comenzi vede tokenul de website, ce e `product_data.id`) și după M-STOC-1, care alege `FORMULA_STOC`. Ordinea pe magazin: umbra cel puțin 14 zile sau 30 de comenzi, apoi canarul 7 zile, apoi tot catalogul. Rămân deschise: harta exactă a canalelor (M-MKT-1), forma comenzilor FBE (ES-20), câmpurile unei comenzi modificate (ES-21), vânzările de pe alte website-uri ale contului (D32), abonamentul Edinio expirat (D12) și verificarea automată a sursei stocului după primele măsurători.
- **Producția:** migrațiile 72 și 73 sunt aplicate (13.10.2026), iar integrarea e deschisă tuturor (`EASYSALES_LIVE=true`).
- **Textul din catalogul public** și ghidurile din centrul de ajutor sunt ciorne care așteaptă textul proprietarului.

## Nota cinstită

Integrarea e construită pe documentație și pe un server fals, iar primul cont real s-a conectat pe 14.10.2026. Prima zi a contrazis deja o presupunere (forma listei de webhook-uri, mai sus). Tot ce e marcat IPOTEZĂ în plan și nu apare la „Măsurat” rămâne ipoteză, iar codul e scris să cadă în siguranță acolo unde documentația tace: comanda care nu pleacă se întoarce în Edinio, nu se pierde.
