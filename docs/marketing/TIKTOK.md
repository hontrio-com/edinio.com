# TikTok Pixel si Events API: evidenta integrarii

Trecerea din 18.09.2026. Cererea proprietarului: *„continua cu TikTok Pixel, si aici trebuie sa avem totul
complet”*.

Documentatie citita ca text, cap la cap (portalul lor e o aplicatie care isi aduce paginile din JS, deci s-au
citit prin browser, nu descarcate):

* Events API 2.0: `Setup guide for Web`, `Parameters` (top-level, `user`, `properties`, `contents`, `page`),
  `Supported events` (Web Standard Events), `Event Deduplication`, `Responses and errors`, `Send TikTok
  Click ID (ttclid)`, `Appendix - Return codes`;
* Pixel: `Supported Pixel events` (cele 18 evenimente web), `Advanced Matching`;
* centrul de ajutor: „Standard Events and Parameters”, actualizat in aprilie 2026.

---

## Expunerea masurata

Citita din productie inainte de a deschide codul:

| Magazin | Comenzi de vitrina, 90 de zile | cu `ttclid` | Produse active |
| --- | --- | --- | --- |
| `suporti-numar` | 245 | 2 | 52 |
| `tonel-beauty` | 10 | 0 | 500 |
| `mokka` | 5 | 0 | 38 |
| `yvelle` | 0 | 0 | 14 |

* **4 magazine cu pixel TikTok, niciunul cu banner de cookie-uri** pornit;
* **niciunul cu Events API**: nu exista nici macar posibilitatea;
* nicio comanda nu pastra cookie-ul `_ttp`.

---

## Ce ofera TikTok si ce foloseam

| Ce | Inainte | Acum |
| --- | --- | --- |
| `PageView` | browser | browser (neschimbat) |
| `ViewContent` | browser, ID-ul produsului, `content_type` in `contents` | browser + server, ID-ul din catalog, felul langa eveniment |
| `Search` | **lipsea** | browser + server |
| `AddToCart` | browser, fara `content_ids` | browser + server, cu `content_ids` si ID-ul variantei |
| `InitiateCheckout` | browser | browser + server |
| `AddPaymentInfo` | **lipsea** | browser + server |
| achizitia | `PlaceAnOrder` **si** `CompletePayment`, amandoua scoase din lista lor | un singur `Purchase`, si de pe server |
| Events API 2.0 | **lipsea** | tokenul comerciantului, criptat; deduplicare pe `event_source_id` + `event` + `event_id` |
| Potrivirea avansata | `identify` cu emailul si telefonul **in clar** | hash-uite pe server, in codul de baza, inaintea evenimentelor |
| `ttclid` / `_ttp` | doar `ttclid` din adresa | amandoua, din cookie-urile pixelului, sub acordul de marketing |
| Coduri de raspuns | 40100 tratat ca refuz definitiv | 40100 si 40133 = limitare, deci se reincearca; 40105 = tokenul |

---

## Defectele gasite si reparate

### 1. ⚠⚠ Achizitia pleca de DOUA ori, sub nume care nu mai exista

Se trimiteau `PlaceAnOrder` SI `CompletePayment` pentru aceeasi comanda. Lista de azi („Supported Pixel
events”, 18 evenimente web, si „Supported events” pentru Events API) n-are niciunul din cele doua nume:
plata incheiata e `Purchase`, cu acelasi obiectiv de optimizare (`SHOPPING`) pe care il aveau inainte.

Reparat in `FbPurchaseEvent`: un singur `Purchase`, cu `event_id` = id-ul comenzii.

### 2. ⚠⚠ Nu exista Events API: tot ce pierdea browserul se pierdea

Documentatia lor: *„we recommend advertisers set up both TikTok Pixel SDK and Events API to ensure maximum
data coverage”*, cu deduplicare pe `event_source_id` + `event` + `event_id`.

Reparat, pe tokenul generat de comerciant („Alternatively, you can Generate access token from pixel >
Settings”), fara aplicatie TikTok si fara OAuth:

* `src/lib/tiktok/capi.ts`: trimiterea (`POST /open_api/v1.3/event/track/`, tokenul in antetul
  `Access-Token`), verdictul dupa `code`, nu dupa codul HTTP, si impartirea corecta a erorilor;
* `src/app/api/tiktok/eveniment/route.ts`: capatul public pentru cele 5 evenimente de palnie, cu ACELASI
  `event_id` ca pixelul. Primeste doar campurile din documentatie, doar de pe paginile ACESTUI magazin,
  niciodata `Purchase`. IP-ul, agentul si cookie-urile (`ttclid`, `_ttp`) se citesc din cerere;
* `src/lib/orders/tiktok-comanda.ts`: `Purchase` de pe server, in aceleasi trei momente ca la GA4 si Meta,
  cu `tiktok_comenzi_raportate` ca sa nu plece de doua ori;
* panoul: tokenul (niciodata intors in browser), starea ultimei trimiteri, ultima eroare, oprirea;
* ⚠ **tokenul tine minte pixelul**: schimbarea Pixel ID-ului stinge trimiterea de pe server;
* migratia `2027-01-27-tiktok-events-api.sql`: `tiktok_capi_config` pe tabelul privat, cu `access_token`
  criptat (verificat pe productie: `enc.v1.…` in tabel, in clar doar prin vedere).

### 3. ⚠ `content_type` statea unde TikTok nu-l citeste

Exemplul lor il pune langa eveniment: `ttq.track('AddToCart', { contents: [...], content_type: 'product',
value, currency })`. Noi il puneam in fiecare articol din `contents`. In plus lipsea `content_ids`, pe care
documentatia il cere pentru Video Shopping Ads.

### 4. ⚠ ID-urile nu erau cele din catalog

Ca la Meta inainte de 17.09: pentru un produs cu variante pleca ID-ul produsului. TikTok cere exact invers:
*„We recommend using `sku_id` or `item_group_id` that matches the ... catalog”*. Acum ID-urile vin din
aceeasi definitie ca feedul (`idArticolMeta`): varianta cunoscuta = articol, produsul cu variante fara
varianta aleasa = grup, amestecul pleaca fara fel.

### 5. ⚠ Potrivirea avansata trimitea datele omului in clar

`ttq.identify` primea emailul si telefonul nehashate (documentatia permite, pixelul le hash-uieste in
browser), dar pentru asta trebuiau puse in clar in HTML-ul paginii de confirmare. Acum se hash-uiesc pe
server, dupa regulile LOR, si intra in `ttq.identify` din codul de baza, inaintea oricarui eveniment.

⚠ Regulile lor NU sunt ale Meta, si se ratau usor: telefonul se hash-uieste in forma E.164 **cu `+`**
(deci acelasi telefon are alt hash decat la Meta), iar orasul, judetul si tara **nu se hash-uiesc**, desi
codul postal da.

### 6. Lipseau `Search` si `AddPaymentInfo`

Amandoua sunt in lista lor de evenimente standard (`ON_WEB_SEARCH`, `ADD_BILLING`). Acum pleaca din aceleasi
locuri ca la Meta.

### 7. ⚠ Semnalele de potrivire nu se pastrau

`ttclid` se lua doar din adresa paginii de intrare. Acum se iau si cookie-urile puse chiar de pixelul lor
(`ttclid` si `_ttp`), la checkout, doar de la cine n-a refuzat marketingul, iar IP-ul il scrie serverul.

### 8. ⚠ Integrarea NOASTRA arunca evenimentele la o limitare de rata

Gasit citind „Appendix - Return codes”: `trimite-tiktok.ts` (pixelul PLATFORMEI, nu al comerciantilor) trata
`40100` drept refuz definitiv, crezand ca inseamna „fara drept”. In lista lor, `40100` si `40133` inseamna
*„Requests made too frequently”*, iar tokenul rau e `40105`. Deci o rafala de conversii ale platformei putea
fi aruncata in loc sa fie reincercata.

---

## Probele

* `src/lib/tiktok/tiktok-conform-documentatiei.test.ts`: continutul (felul langa eveniment, ID-urile din
  catalog, gruparea), normalizarea si hash-urile **pe exemplele din documentatia lor** (email, telefon E.164
  cu `+`, prenume, cod postal US si canadian), trimiterea si codurile, capatul de evenimente, achizitia de pe
  server cu o baza de proba, si cablarea din paginile care cer un browser.
* `src/lib/tiktok/tiktok-ruta-si-browser.test.ts`: **ruleaza chiar `POST /api/tiktok/eveniment`** cu un
  PostgREST de proba si un Events API de proba, si runtime-ul `ttqTrack` cu un `window` si un `ttq` de proba.
* `src/lib/actions/tiktok-capi-actiuni.test.ts`: **actiunile din panou rulate chiar ele**.
* Bancul de mutanti: **105 stricaciuni, toate prinse**. Prima rulare a lasat 9 sa scape, si toate au
  intarit probele: cantitatea, emailul nevalidat, felul continutului din enumerarea lor, adresa paginii,
  produsul cu variante fara combinatie gasita, si trei probe pe sursa care se potriveau pe comentariu sau
  taiau prea larg.

Suita intreaga (8933), `tsc`, poarta de lint (57 de erori, niciuna noua) si buildul: verzi.

---

## Verificat pe productie

(se completeaza dupa desfasurare)

## Ce tine de comercianti

1. **Events API porneste doar cu tokenul lor**: Events Manager -> pixelul -> Settings -> Generate access
   token, lipit in panou.
2. Catalogul de produse pentru Video Shopping Ads se face in TikTok cu acelasi feed ca al Meta
   (`/facebook-catalog.xml`, format Google Shopping), pe care TikTok il accepta ca sursa de fisier.

## Ce ramane

1. **TikTok n-are cod de test pentru Events API.** Documentatia parametrilor enumera exact trei campuri de
   nivel intai (`event_source`, `event_source_id`, `data`); Meta are `test_event_code`, TikTok nu. Deci nu
   exista buton „trimite un eveniment de test”: verificarea se face in Events Manager, unde sursa apare cu
   „Connection Method: Server”.
2. **Tokenul nu se poate verifica deplin la salvare.** `/user/info/` raspunde sigur doar cand tokenul e rau
   (`40105`); un token din Events Manager poate primi `40001` acolo fara sa fie gresit. De aceea se salveaza,
   cu avertisment, iar adevarul se vede la prima trimitere, in panou.
3. `PageView` pleaca doar din browser.
4. `InitiateCheckout` si `AddPaymentInfo` din cos anunta liniile cu varianta drept GRUP (linia de cos tine
   titlul, nu ID-ul combinatiei). `ViewContent`, `AddToCart` si `Purchase` trimit ID-ul exact.
5. `external_id` nu se trimite (vitrinele n-au conturi de client), iar deduplicarea merge pe `event_id`.
6. **Nevazut pe trafic real**: trimiterea de pe server, pana cand primul comerciant isi pune tokenul.
