# Meta Pixel, Conversions API si Facebook Catalog: evidenta integrarii

Trecerea din 17.09.2026. Cererea proprietarului: *„Spune mi exact daca e totul perfect 10/10, daca pixelul
Facebook chiar masoara tot si masoara corect si daca avem toate functiile pixelului asa cum are si
woocommerce, shopify, etc...”*

Documentatie citita ca text, cap la cap, pastrata in timpul lucrului:

* Meta Pixel: referinta evenimentelor standard si a parametrilor (`content_ids`, `contents`, `content_type`),
  potrivirea avansata (manuala si automata), cookie-urile `_fbp`/`_fbc`, consimtamantul, conversiile;
* Conversions API: prezentarea, evenimentul de server, parametrii clientului (normalizare si hash),
  `custom_data`, `fbp`/`fbc`, `external_id`, deduplicarea, bune practici, verificarea, integrarea ca
  platforma („Client System User Access Token”, `partner_agent`);
* Catalog: referinta campurilor, variantele (`item_group_id`, `additional_variant_attribute`), categoriile,
  feedurile programate, reclamele de catalog si pixelul (potrivirea ID-urilor), audientele.

---

## Expunerea masurata

Citita din productie inainte de a deschide codul:

| Magazin | Comenzi de vitrina, 90 de zile | din reclame Meta (`fbclid`) | Produse active | cu variante |
| --- | --- | --- | --- | --- |
| `suporti-numar` | 240 | 162 | 52 | 0 |
| `okxi` | 12 | 4 | 1306 | 0 |
| `tonel-beauty` | 10 | 0 | 500 | 1 |
| `bricosmart` | 1 | 0 | 1049 | 0 |
| `esafero-echipamente-protectia-muncii` | 1 | 0 | 3351 | **3047** |
| `yvelle` | 0 | 0 | 14 | 0 |
| `rallsro` | 0 | 0 | 113 | **113** |

* **7 magazine cu pixel, niciunul cu banner de cookie-uri pornit** (pixelul se incarca fara consimtamant);
* **nicio comanda nu avea `_fbp`/`_fbc`**: nu se fotografiau;
* ⚠ **liniile comenzilor de vitrina n-au `variant_title`** (0 din 173 in 30 de zile): varianta e coapta in
  nume, „BOCANCI CREATRON S3S ESD FO (38)”;
* imagini WebP in feed: 1010 produse la `esafe`, 124 la `tonel-beauty`, toate cele 14 la `yvelle`.

---

## Ce ofera Meta si ce foloseam

| Ce | Inainte | Acum |
| --- | --- | --- |
| `PageView` | browser | browser (neschimbat) |
| `ViewContent` | browser, ID-ul produsului | browser + server, ID-ul din catalog, grup pentru produsul cu variante |
| `Search` | **lipsea** | browser + server, cu termenul si primele 10 rezultate |
| `AddToCart` | browser, fara `contents`; blocul din editor nu trimitea nimic | browser + server, cu `contents` si ID-ul variantei |
| `InitiateCheckout` | browser, ID-uri de produs | browser + server, liniile cu varianta ca grup |
| `AddPaymentInfo` | **lipsea** | browser + server, la trimiterea comenzii |
| `Purchase` | browser, ID-uri de produs | browser + **server** (ramburs la creare, card la incasare, „platit” de mana), ID-urile exacte |
| Conversions API | **lipsea** | tokenul comerciantului, criptat; deduplicare pe `event_id` |
| Potrivirea avansata | un `init` al doilea, date in clar in HTML | in `init`-ul de baza, hash-uita pe server |
| `fbp` / `fbc` / IP pe comanda | nu | fotografiate sub acordul de marketing; `fbc` refacut din `fbclid` |
| Catalog: ID-ul variantei | `<produs>-<combinatie>` | la fel, dintr-o singura definitie comuna cu pixelul |
| Catalog: titlul variantei | cu combinatia | numele produsului (ghidul variantelor) |
| Catalog: `link` pe varianta | adresa produsului | adresa care preselecteaza varianta |
| Catalog: imaginile | WebP („JPEG or PNG” cerut) | JPEG de 1024 px, pe alb |
| Catalog: axele necunoscute | puse in `material`/`pattern` | `additional_variant_attribute` |
| Catalog: `google_product_category` | doar de pe produs | si din harta facuta in Google Merchant, ca ID oficial |

---

## Defectele gasite si reparate

### 1. ⚠⚠ Fara Conversions API: tot ce pierdea browserul nu ajungea la Meta

Meta recomanda configurarea redundanta: aceleasi evenimente si din browser, si de pe server, deduplicate pe
`event_name` + `event_id`. Tot ce blocheaza iOS, blocantele de reclame sau browserul din aplicatia Facebook
se pierdea. La `suporti-numar`, 162 de comenzi din 240 veneau din reclame Meta.

Reparat, pe tokenul generat de comerciant in Events Manager (optiunea „Client System User Access Token” din
ghidul pentru platforme, fara App Review):

* `src/lib/facebook/capi.ts`: trimiterea (tokenul in CORP, nu in adresa; reusita = `events_received`, nu
  codul HTTP; 190/10/200 recunoscute ca token sau drepturi), verificarea tokenului pe pixel (antet
  `Authorization`), `fbp`/`fbc` doar in forma lor, `fbc` refacut din `fbclid` cu indexul 1;
* `src/app/api/meta/eveniment/route.ts`: capatul public pentru cele 5 evenimente de palnie. Browserul il
  cheama dupa fiecare `fbq('track')` cu ACELASI `eventID`, doar cand magazinul are Conversions API. Primeste
  doar campurile din referinta pixelului, doar de pe paginile ACESTUI magazin, niciodata `Purchase`; IP-ul,
  agentul si cookie-urile se citesc din cerere. Raspunde 204 imediat, trimite dupa raspuns. 240 de cereri pe
  minut pe IP, corp de cel mult 16 KB, magazinul citit o data pe minut;
* `src/lib/orders/meta-comanda.ts`: `Purchase` de pe server, cu `event_id` = id-ul comenzii (acelasi ca in
  browser), datele clientului normalizate dupa documentatie si hash-uite, in aceleasi trei momente ca GA4.
  `meta_comenzi_raportate` o opreste sa plece a doua oara (Meta deduplica doar 48 de ore);
* acordul: fara banner se trimite (pixelul se incarca oricum); cu banner, decizia de marketing fotografiata
  la checkout, iar pentru comenzile fara ea, doar daca exista `_fbp`;
* panoul (`FacebookPixelConfigClient`): tokenul (verificat la Meta inainte de salvare, niciodata intors in
  browser), codul de test, starea ultimei trimiteri si ultima eroare, butonul de eveniment de test (doar cu
  codul de test, ca sa nu intre in datele reale), oprirea;
* ⚠ **tokenul tine minte pixelul pe care a fost verificat.** Schimbarea Pixel ID-ului stinge trimiterea de
  pe server (`facebook_capi_activ`), iar reaprinderea verifica tokenul pe pixelul nou;
* migratia `2027-01-26-meta-conversions-api.sql`: `meta_capi_config` pe `privat.store_settings`, cu
  `access_token` in `privat.campuri_secrete` (criptat in repaus, verificat pe productie: `enc.v1.…` in
  tabel, in clar doar prin vedere), si tabelul `meta_comenzi_raportate`, cu RLS fara politici.

### 2. ⚠⚠ Pixelul si catalogul spuneau ID-uri diferite

Catalogul da fiecarei variante `<produs>-<combinatie>` si le leaga cu `item_group_id = <produs>`. Pixelul
trimitea MEREU ID-ul produsului, cu `content_type: "product"`. Meta: *„For dynamic ads, this ID must exactly
match the content ID for the same item in your Meta Pixel.”* Niciun articol n-avea ID-ul acela, deci
reclamele dinamice nu legau vizitatorul de nimic: 3047 de produse la `esafe`, toate 113 la `rallsro`.

Reparat in `src/lib/facebook/pixel-continut.ts`, o singura definitie folosita de pixel, de server si de feed:
varianta cunoscuta = ID-ul variantei (`product`); produsul cu variante fara varianta aleasa = ID-ul
grupului (`product_group`); un eveniment cu feluri amestecate pleaca FARA `content_type` (Meta potriveste
atunci fiecare ID cu orice tip). ID-ul combinatiei se cauta dupa titlu: la 3222 de combinatii ID-ul nu mai
iese din titlu, fiindca au fost redenumite.

### 3. ⚠⚠ Achizitia de pe vitrina ar fi plecat fara varianta

Liniile de vitrina n-au `variant_title` (0 din 173). Serverul scrie varianta in nume,
`${produs.name} (${titlu})`, si numai cu o combinatie activa. `titluDinNumeleLiniei` o citeste de acolo
(„ (titlu)” la coada numelui, deci „S” nu se confunda cu „XS”). Pe productie: 3 din 3 linii recente se
rezolva; cele 2 din iulie, dinaintea garzii de variante, pleaca drept grup, cum e corect.
`continutComanda` e aceeasi pentru achizitia din browser si pentru cea de pe server.

### 4. ⚠ Potrivirea avansata nu era luata drept potrivire manuala

Se trimitea printr-un `fbq('init')` al doilea. Documentatia: valorile trebuie date in `init`-ul codului de
baza, altfel *„will not be treated as manual advanced matching”*. In plus, emailul, telefonul si numele
stateau in clar in HTML-ul paginii de confirmare. Acum pagina de confirmare scrie `window.__edinioAM` cu
valorile deja hash-uite pe server (SHA-256, normalizate dupa documentatie, verificate pe exemplele lor), iar
`FacebookPixel` il da in `init`.

### 5. ⚠ `AddToCart` fara `contents`, iar blocul din editor nu trimitea nimic

*„Required for Advantage+ catalog ads: `contents`”*. Se trimiteau doar ID-urile. Butonul de cos din paginile
facute in editor nu trimitea niciun eveniment. Reparat in `trackAddToCart`, chemat acum si din bloc.

### 6. Lipseau `Search` si `AddPaymentInfo`

`UrmaCautarePixel` trimite `Search` pe pagina de cautare (termenul si primele 10 rezultate, fara
`content_type`: rezultatele amesteca produse si grupuri). `AddPaymentInfo` pleaca la trimiterea comenzii, cu
metoda de plata aleasa, in checkout-ul pe pagina si in modal.

### 7. ⚠ Catalogul trimitea imagini WebP

*„Images must be in JPEG or PNG format, at least 500 x 500 pixels”*. `/api/img?…&f=jpg` face o singura data
un JPEG de 1024 px (poza mai mica nu se mareste), cu transparenta asezata pe alb (altfel iesea neagra), si
trimite la el. Numai pentru surse WebP/AVIF; un JPEG cantareste dublu in plafonul de variante.

### 8. Variantele din catalog nu urmau ghidul

* titlul purta combinatia; ghidul: *„The name of the product and the `item_group_id` fields match”*;
* toate variantele aveau acelasi `link`; acum `?varianta=`, pe care pagina il preselecteaza (aceeasi adresa
  ca Google Merchant si datele structurate);
* o axa necunoscuta („Aroma”) ocupa `material` sau `pattern`; acum merge in `additional_variant_attribute`;
* entitatile HTML din descriere se inlocuiau cu spatiu; acum se decodeaza.

### 9. Categoria Google lipsea unde comerciantul o pusese doar in Google Merchant

Feedul citeste acum si harta de categorii din Google Merchant (doar cheia hartii, nu configurarea cu token),
tradusa in ID oficial (5 cai vechi nu existau in taxonomie). Categoria de pe produs castiga.

### 10. Datele pentru potrivire nu se pastrau pe comanda

`_fbp` si `_fbc` se fotografiaza la checkout, doar daca marketingul nu e refuzat. IP-ul il scrie numai
serverul, si numai cand comanda are un semn Meta (`fbp`, `fbc` sau `fbclid`).

---

## Probele

* `src/lib/facebook/meta-conform-documentatiei.test.ts`: ID-urile (feed = pixel), felul continutului,
  varianta din numele liniei, normalizarea si hash-urile pe exemplele din documentatie, trimiterea si
  verificarea tokenului, capatul de evenimente, achizitia de pe server cu o baza de proba (o singura data,
  acord, marketplace, card neincasat, semnal stins, codul de test, dupa incasare), catalogul, cablarea din
  paginile care cer un browser.
* `src/lib/facebook/meta-ruta-si-browser.test.ts`: **ruleaza chiar `POST /api/meta/eveniment`** cu un
  PostgREST de proba si un Graph API de proba (acelasi `event_id`, campuri straine aruncate, pagina altui
  site refuzata, limita de rata, corpul mare, cache-ul, codul de test), **chiar `GET` din feedul de
  catalog** (harta Merchant, ID-ul variantei, linkul, JPEG-ul) si runtime-ul `fbTrack` cu un `window` si un
  `fbq` de proba (pixelul si serverul primesc acelasi `eventID`, nimic inainte de acord, `Purchase` niciodata
  din browser spre server).
* `src/lib/actions/meta-capi-actiuni.test.ts`: **actiunile din panou rulate chiar ele**: tokenul refuzat nu
  ajunge in baza, tokenul nu iese in browser, alt magazin, schimbarea pixelului, evenimentul de test.
* `src/app/api/img/format-jpg-catalog.test.ts`: JPEG-ul cu `sharp` adevarat (format, latime, transparenta
  pe alb, perechile care raman WebP).
* Bancul de mutanti: **135 de stricaciuni, toate prinse**. Prima rulare a lasat 24 sa scape: 11 reguli pure
  fara proba (cantitatea, codul postal cu cratima, moneda, gazda straina, IP-ul, corpul, rata, codul de test
  pe doua drumuri, achizitia dupa incasare, tokenul verificat), cablarea din paginile care cer un browser, si
  achizitia din browser calculata separat de cea de pe server (acum aceeasi functie).

Suita intreaga (8891), `tsc`, poarta de lint (57 de erori, niciuna noua) si buildul: verzi.

⚠ **Gasit pe drum, nelegat de Meta:** jobul CI „tipurile DB nu raman in urma schemei” cadea de la commit-ul
GA4 (`55302367`): tabelul `ga4_comenzi_raportate` nu intrase in `database.types.ts`. Reparat aici.

---

## Verificat pe productie

(se completeaza dupa desfasurare)

## Ce tine de comercianti

1. **Conversions API porneste doar cu tokenul lor.** Events Manager -> pixelul -> Setari -> Conversions API ->
   Genereaza tokenul, lipit in panou. Pana atunci evenimentele pleaca doar din browser, ca inainte.
2. Feedul `https://<magazin>/facebook-catalog.xml` adaugat in Commerce Manager ca sursa programata, pe
   catalogul legat de ACELASI pixel.
3. Bannerul de cookie-uri, daca vand in UE si vor sa respecte GDPR: fara el pixelul se incarca fara acord.

## Ce ramane

1. **Nicio aplicatie Meta cu App Review**: nu exista „Conecteaza-te cu Facebook” care sa creeze singur
   tokenul, pixelul si catalogul (cum au Shopify si WooCommerce prin aplicatiile oficiale). Comerciantul
   lipeste tokenul si adauga feedul de mana.
2. **Catalogul e un feed programat**, nu Catalog Batch API: o schimbare de pret sau stoc ajunge la Meta la
   urmatoarea citire a feedului, nu in cateva minute.
3. `PageView` pleaca doar din browser.
4. `InitiateCheckout` si `AddPaymentInfo` din cos anunta liniile cu varianta drept GRUP: linia de cos tine
   titlul, nu ID-ul combinatiei. `ViewContent`, `AddToCart` si `Purchase` trimit ID-ul exact.
5. `external_id` nu se trimite: vitrinele n-au conturi de client si nici un identificator propriu de
   vizitator; deduplicarea merge pe `event_id` (plus `fbp`), cum accepta documentatia.
6. `unit_price` (pretul pe unitate) nu se trimite in feedul Meta.
7. Conversia WebP -> JPEG are plafonul rutei de imagini (600 de variante pe ora pe IP, un JPEG = 2): prima
   citire a feedului de la `esafe` (1010 imagini WebP) se poate intinde pe mai multe ore; dupa aceea
   JPEG-urile sunt gata.
8. **Nevazut pe trafic real**: trimiterea de pe server, pana cand primul comerciant isi pune tokenul.
