# Planul integrării easySales în Edinio

**Stadiu:** analiză încheiată, 13.10.2026. N-am scris cod, n-am modificat nimic în repo (`main` @ `f6b763c1`), n-am aplicat migrații și n-am făcut niciun apel autentificat către easySales. Planul așteaptă aprobarea și hotărârile din §11.a.

**Cum a fost verificat:** fiecare afirmație despre easySales a fost confruntată cu sursa ei: colecția Postman V2 și mediul ei publicat, ghidurile din 09-10.2026, centrul de ajutor, blogul, termenii și pachetul JavaScript al aplicației. Fiecare afirmație despre Edinio a fost confruntată cu codul de pe `main` și cu baza de producție, numai prin citire. Ce s-a dovedit greșit s-a corectat. Ce n-are sursă a devenit IPOTEZĂ, cu măsurătoarea sau întrebarea care o lămurește.

**Cum se citesc trimiterile**
- **[A: …]**: colecția Postman easySales V2 (dosarul A), cu endpointul sau câmpul. **Dosarul B** strânge sursele publice din afara colecției și probele `curl` fără autentificare făcute pe gazda lor în timpul analizei.
- **(ghid)**, **(centrul de ajutor)**, **(blog)**: surse oficiale easySales din afara colecției, numite de fiecare dată. Sunt oficiale, dar nu sunt contract de API, deci tot ce depinde de ele se măsoară în E0.
- **IPOTEZĂ de confirmat**: nu scrie în dosarul A sau e deducția noastră. Lângă ea stă măsurătoarea care o lămurește (M-…, §9.4) sau întrebarea către easySales (ES-…, §11.b). Codul care depinde de o ipoteză se scrie abia după ce ea e confirmată.
- **[C: …]**: cod sau date Edinio verificate prin citire, cu calea și linia.
- **D…**: hotărâri ale proprietarului (§11.a). **R…**: riscuri (§8). **E0-E6**: etapele (§10).

**Cuprins**
1. Rezumat executiv
2. Ce este easySales și cum funcționează un website „API V2”
3. Modelul de integrare ales
4. Conectarea comerciantului
5. Fluxurile (F1-F7, bugetul de cereri, modul B)
6. Webhook-uri
7. Modificări în Edinio (migrații, fișiere, panou, cron, docs, variabile)
8. Riscuri și capcane
9. Plan de testare (probe automate, Etapa 0 pe cont real, scenarii cap la cap, pilot)
10. Etape de livrare (E0-E6)
11. Întrebări deschise (pentru proprietar și pentru easySales)
12. Anexă: endpointurile easySales folosite, cu scope-ul OAuth

---

## 1. Rezumat executiv

1. **Conectarea:** fiecare magazin Edinio devine, în contul easySales al comerciantului, un website de tip „API V2”. Comerciantul ne dă trei valori (client_id, client_secret, website_token), iar Edinio se conectează prin grantul OAuth „website”, fără parola contului. Că `website_token` e obligatoriu reiese doar dintr-un exemplu, nu dintr-o regulă scrisă: în „Website Grant -> Invalid Data”, cererea fără el primește 400 `invalid_request`, cu `hint: "Check the website_token parameter"` [A: Website Grant]. Textul erorii e cel generic din OAuth și acoperă și o valoare invalidă, deci același 400 poate veni și pentru un token greșit (IPOTEZĂ de confirmat, M-AUTH-4, ES-2). Le trimitem pe toate trei, plus `scope`, ca în exemple; ce se întâmplă fără celelalte e IPOTEZĂ de confirmat (M-AUTH-4, M-AUTH-5). Dacă D3 alege și un Personal Access Token, apare o a patra valoare (punctul 5).
2. **Modelul:** Edinio e sursa catalogului, a prețului de vânzare și a stocului și le trimite în easySales, iar easySales listează pe marketplace-uri și procesează comenzile. Pornim de la fluxul din ghidul easySales pentru magazinele personalizate (09.2026): magazinul trimite catalogul, stocul și comenzile. După ghid, stocul nu se întoarce, iar „ce vine înapoi ține de comenzi”, prin webhook-urile la care se abonează magazinul. Ghidul recomandă abonarea la `order-created`, `order-updated`, `awb-created`, `invoice-created` și `delivery-status-updated`. Dacă `order-created` aduce și comenzile din alte canale nu e documentat (punctul 5). Listarea și procesarea comenzilor le confirmă și pagina lor „Integrare API V2 & easySales”. Restul modelului nu e garantat de ei:
   - Ghidul numește magazinul „sursa de adevăr” numai pentru stoc. Pentru catalog și preț, sursa Edinio e alegerea planului (§3.1).
   - Stocul într-un singur sens e IPOTEZĂ de confirmat (M-STOC-1, M-STOC-2, ES-8), deși ghidul îl afirmă. Același ghid descrie câmpul „Sursă stoc produse” cu „Implicit easySales” și nu îi listează opțiunile. Opțiunea „website” apare la acest câmp în articolul vechi din centrul de ajutor pentru magazinul custom (2024) și în descrierea generală a surselor de stoc. Că o are și formularul API V2 de azi e IPOTEZĂ de confirmat (M-STOC-1, ES-8). Pagina „Integrare API V2” spune, despre direcția datelor: „În ambele sensuri, iar tu decizi”. Pagina pentru Gomag are același răspuns, cu alt nume de platformă. Centrul de ajutor spune că sursa „easySales” „va suprascrie modificările de stoc efectuate în website”. Modelul cere deci „Sursă stoc produse: Website”, aleasă explicit.
   - După centrul de ajutor, prețul vine implicit din magazin, dar prețul ofertei de pe marketplace poate diferi de el: adaos procentual (numai la ofertele noi), decuplare și Autoprice (articolul „Auto Price”). Ofertele au și rute de preț proprii, `PATCH /offers/.../prices` [A: dosarul Offers]. De aici deducem că pe marketplace se vinde la prețul ofertei din easySales, nu direct la al magazinului (IPOTEZĂ de confirmat, ES-32). Dacă `products/prices/bulk` trimis de noi trece în ofertele cuplate și peste prețurile decuplate e ES-32.
3. **E2:** comenzile din magazin intră în easySales lângă cele din marketplace-uri și se procesează acolo (AWB, factură). Starea, AWB-ul și factura se întorc în Edinio și în contul cumpărătorului.
   - Rămân în Edinio, neștampilate (§5.1.1): livrarea la punct de ridicare (D17, ES-9), livrarea în afara României (M-COM-4), comenzile în altă monedă decât RON, ridicarea personală și curierul propriu al magazinului (D27, ES-23). Dacă pleacă și comenzile cu fișiere de personalizare e D31: operatorul easySales nu are fișierele.
   - Ridicarea personală are `courier = 'pickup'` și `delivery_type = 'address'`, iar `address` e adresa cumpărătorului, nu a magazinului [C: `src/lib/cont/livrare.ts:4-8`, `:76-78`]. Neexclusă, ar primi în easySales AWB spre casa unui om care vine la magazin.
   - Retragerea din contract (OUG 18/2026) rămâne în Edinio [C: `src/lib/actions/return.actions.ts:3`, `:180`, tabela `return_requests`]. Pe o comandă procesată în easySales, cererea ajunge numai la noi, stornarea se face la ei, rambursarea cardului prin procesatorul Edinio, iar repunerea în stoc nu e prevăzută nicăieri. Comerciantul primește notificarea „retur pe o comandă procesată în easySales”, cu legătură spre comanda lor. Repunerea în stoc în Edinio și legătura cu `storno-invoice-created.order_return_id` [A] se hotărăsc la D28.
4. **E3:** catalogul Edinio (categorii, caracteristici, produse cu variante, prețuri) ajunge în easySales, gata de mapat și listat, cu stocul pe 0. Un catalog pe stoc 0 nu vinde nimic, deci E3 se construiește numai după ce M-EXT-1 și M-STOC-1 ies pozitive sau după ce se acceptă modul B (§5.9).
5. **E4:** un singur stoc. Vânzările de pe marketplace-uri scad stocul Edinio, iar stocul nou pleacă pe toate canalele.
   - Condiția: tokenul website vede comenzile celorlalte canale. Documentația nu o spune (IPOTEZĂ de confirmat, M-EXT-1, ES-12, ES-26). Ghidul numește Personal Access Token-ul (PAT) „account-wide rather than shop-scoped”, deci tokenul website pare legat de un singur magazin. Un rezultat negativ e cel puțin la fel de probabil.
   - Rezerva e PAT-ul: pe tot contul după ghid, dar neprobat pentru citirea comenzilor (tot M-EXT-1). El schimbă formularul de conectare (al patrulea secret), stocarea, reînnoirea și analiza de securitate. Nu se reîmprospătează și expiră într-un an [A], deci se reintroduce anual, cu amintire. Un token pe tot contul ar vedea datele personale de pe toate canalele. De aceea D3 se hotărăște în E0, înaintea E1, nu în E4.
   - `read-orders` se cere explicit: exemplele din colecție pentru grantul website nu îl conțin [A], dar ghidul oficial îl cere acestui grant. E4 se sprijină numai pe banda de listă, `GET /orders?modified_after=` [A]. `order-created` pentru comenzile de marketplace e nedocumentat și rămâne semnal opțional (IPOTEZĂ de confirmat, M-WH-2, ES-11). Pentru stoc, ghidul e explicit: la un magazin personalizat stocul nu se întoarce, iar ce vine prin webhook ține de comenzi. `product-stock-updated` nu e numit și nici exclus explicit, deci nu îl așteptăm. Dacă vine totuși pentru un website API V2, e cel mult un semnal opțional (IPOTEZĂ de confirmat, M-STOC-2, ES-8).
   - Comenzile onorate de marketplace sau de un 3PL (de pildă FBE la eMAG) nu consumă stocul Edinio, ca în integrarea nativă eMAG [C: `src/lib/emag/orders.ts:1245-1254`, `onoratDeEmag`]. Recunoașterea folosește filtrul `fulfillment_service_id` și `GET /fulfillments/list` [A], cu scope-ul `read-fulfillment-services` (după nume), care lipsește din lista cerută (§4.3), plus canalele FBE din pachetul JavaScript al aplicației lor (absente din documentația API). Cum apare în API o astfel de comandă e IPOTEZĂ de confirmat (M-EXT-1, ES-20).
   - `consuma_stoc_comanda_marketplace` consumă o singură dată. Un storno parțial sau un produs adăugat după consum se ajustează, ca la eMAG și Pepita, cu `ajusteaza_stoc_comanda_marketplace` [C: `src/lib/emag/orders.ts:1484`, `src/lib/pepita/ingest.ts:1382`]. Ce arată API-ul despre liniile modificate e ES-21.
6. **De ce pe etape și cu riscul întâi:** documentația nu spune lucruri de care depind banii și stocul. Nu știm ce suprascrie Save peste o comandă procesată (M-COM-1, ES-4), ce înseamnă `stock` față de `reserved_stock` (M-STOC-1, ES-8, ES-22) și dacă tokenul vede comenzile celorlalte canale (M-EXT-1). Etapa 0 le măsoară pe un cont de probă, înaintea codului care depinde de ele. M-EXT-1 merge primul, fiindcă de el depind D3, E3 și E4. Nu știm dacă la contul de probă se poate lega un marketplace de probă (ES-15). Până la răspuns, vânzarea externă se probează cu o comandă manuală în easySales, iar partea de marketplace din M-EXT-1 cere un cont cu un marketplace legat sau răspunsul scris la ES-12 și ES-26.
7. **Banii:** o ștampilă scrisă la inserarea comenzii fixează un singur emitent de factură și AWB. O comandă ale cărei sume nu se închid nu pleacă. Rambursul pus de easySales pe AWB-ul unei comenzi plătite cu cardul nu e documentat: Generate AWB are doar `advanced_data.order_data.cashValue`, cu nota „Order value” [A]. Se măsoară înaintea primei comenzi reale plătite cu cardul (M-COM-8, ES-9). Până atunci nu ne bazăm pe valoarea lor implicită.
8. **Stocul:** catalogul stă pe 0 până se închide bucla. Stocul pleacă numai după citirea vânzărilor externe, o citire picată nu trimite nimic, iar o golire în masă cere confirmare.
   - Formula rămâne parametru până la M-STOC-1 și ES-22. După centrul de ajutor, easySales rezervă cantitatea pe toate canalele de la intrarea comenzii până la anulare, finalizare sau factură. Tot acolo, generarea AWB-ului finalizează comanda și șterge rezervarea, iar stocul scade efectiv la facturare. Blogul lor (20.11.2025) spune că momentul scăderii se alege: la finalizarea comenzii sau la facturare. Pe un website API V2 cu sursa Website, toate acestea sunt IPOTEZĂ de confirmat (M-STOC-1, ES-22).
   - Dacă easySales își scade copia la vânzare, se trimite `max(0, E - Z_ext)`, unde E e stocul Edinio, iar `Z_ext` sunt vânzările externe văzute și încă neconsumate. Dacă doar rezervă, aceeași formulă scade de două ori fiecare vânzare externă, până la AWB sau factură. Atunci se trimite E plus rezervările lor pentru comenzile deja consumate în Edinio și încă nefinalizate.
   - Regula derivei „numai în jos” se revizuiește după măsurătoare, ca să nu fixeze o sub-numărare produsă chiar de easySales.
9. **Tokenul** se emite rar și sub zăvor. „Testează” nu emite niciodată, fiindcă un token nou îl revocă pe cel vechi [A].
10. **Datele personale:** easySales devine un procesator nou de date personale. D15 acoperă numai documentele juridice. Din plan lipsesc DPA-ul, minimizarea datelor trimise și ștergerea. Documentația API nu are DELETE pe clienți sau pe comanda întreagă [A]. Pârghiile sunt suprascrierile: `PATCH /api/v2/customers/{id}` [A: Update Customer], `PUT` pe adresele de livrare și de facturare și pe comandă [A]. Scope-ul `update-customers` există [A: lista Available Scopes], dar documentația nu îl leagă de această rută, deci legătura e dedusă din nume (IPOTEZĂ de confirmat, M-AUTH-5). Azi nu e cerut (§4.3). Se hotărăsc la D33 și se întreabă la ES-27.
11. **Limitele v1:** v1 cere „Sursă stoc produse: Website”. Comercianții care își țin stocul în easySales, în SmartBill sau într-un ERP legat prin easySales nu au niciun drum cât timp modul B e amânat. Limita se spune explicit la D1 și la D3. Refuzul conectării unui magazin care nu vinde în RON e D29.
12. **Cererea și pilotul:** cererea măsurată e zero. Nu există nicio urmă de easySales în bază, în suport sau în fișierele urmărite din repo; singura e sigla neurmărită `public/integrations/easysales.png` [C: `git grep`, `main` @ `f6b763c1`].
    - Comenzi de marketplace au azi numai două magazine, prin integrările native [C: `orders.order_source`, producție, 12.10.2026]: okxi (157 eMAG și 84 Trendyol, dintre care 115 în ultimele 30 de zile) și yvelle (35 Trendyol, dintre care 10 în ultimele 30 de zile).
    - Alte trei magazine au integrări de marketplace conectate sau active, dar nicio comandă de marketplace [C: configurările de integrare și `trendyol_listings`, producție, 12.10.2026]: tonel-beauty (Trendyol, cu o listare, și OLX), itp-blk (OLX și Pepita) și suporti-numar (Pepita).
    - E nevoie de un comerciant pilot. După centrul de ajutor, ofertele se leagă de produsele unui website, de pildă prin Autolink, după SKU, EAN, nume, ID sau „Product Website ID”. Dacă pilotul vinde deja prin easySales de pe alt website (WooCommerce, Gomag), deducem că ofertele lui sunt legate de produsele acelui website (IPOTEZĂ de confirmat, ES-24). Cum se mută ele pe produsele Edinio, adică pe alt website, nu e descris și e tot ES-24. Regula „doi martori” (id și SKU) nu consumă vânzările de pe website-ul vechi, chiar cu aceleași SKU-uri; dacă ele trebuie să scadă stocul Edinio e D32.
    - `orders` nu are un steag de comandă de test [C: `src/types/database.types.ts`; singurul, `epacket_test`, privește AWB-ul ePacket]. Prima comandă de probă a pilotului poate primi deci la ei factură fiscală și AWB reale. Propunerea: automatizările easySales oprite până la proba cap la cap și o comandă de test marcată, care nu se ștampilează. Procedura o hotărăște proprietarul (§11.a).
    - Până la un flux complet pe trafic real, nota rămâne cel mult 9/10.
## 2. Ce este easySales și cum funcționează un website „API V2”

### 2.1 easySales, pe scurt (surse publice, deci IPOTEZE de confirmat, afară de ce e marcat [A])
- SaaS românesc de gestiune multicanal (SMART IT GLOBAL SRL). Preia catalogul magazinului, îl listează pe marketplace-uri (45 declarate), strânge comenzile tuturor canalelor și emite AWB (40 de curieri) și facturi (26 de programe) prin integrările lui.
- Pagina lor de integrări are la „Magazine online” 18 intrări: 17 platforme cu conector dedicat (între ele Shopify, WooCommerce, PrestaShop, Magento 2, Gomag și MerchantPro) și intrarea generică „API V2” (`/website/api`). Edinio nu e printre cele 17. Pentru o platformă fără integrare, drumul documentat e website-ul de tip API V2, pe care comerciantul îl creează singur, fără plugin (ghidul din 09.2026). Colecția leagă tokenul de acest tip: „In order to generate a website token, you must add a new website of API V2 type” [A: dosarul Website token]. Că nu e nevoie de parteneriat e deducția noastră din „îl poți conecta singur prin API”; documentația nu folosește cuvântul.
- Gomag e listat la „Platforme eCommerce” pe pagina lor de parteneri și are în admin o aplicație nativă easySales. Comerciantul lipește acolo numai tokenul unui website de platformă „Gomag”, fără `client_id` și fără `client_secret` (articolul de suport „Configurare Gomag”, ghidul Gomag din 05.2026, articolul Gomag „EasySales”). Dacă aplicația folosește API V2 cu un client OAuth de partener nu e documentat. E o întrebare (ES-1), nu o premisă a planului.
- Intrarea „Assign partner” se contrazice în colecție. Cererea definită e `POST /api/v2/account/sub-account/login`, același URL ca „Sub-Account Authentication”, cu descrierea „Assign a partner to current user.” [A]. Numai exemplul salvat (10.10.2022) are `POST /api/v2/account/partners`, cu corpul `{"code": "<un UUID>"}` și răspunsul 200 „The partner has been assigned successfully” [A]. Proba curl (dosarul B) arată că ruta există. De unde vine `code`, ce format are și ce efect are pe cont nu e documentat; textele aplicației au doar un câmp „Have a discount/partner code?” la înregistrare (indiciu). Ruta se confirmă cu easySales (ES-1) înainte de orice folosire.
- Abonamentele au un plafon lunar de comenzi (Starter: 300), aplicat și comenzilor venite de pe site. După ghidul „How to find and fix website errors” (29.09.2026), la atingerea plafonului comanda nu e creată în easySales. Ea apare pe pagina Website errors, tabul Fetching orders, cu „Orders limit exceeded.”. Pe acea pagină, ghidul magazinului personalizat descrie un buton Retry, dar ghidul erorilor spune că Retry doar scoate eroarea de pe listă, ca Dismiss, fără să reimporte ceva. După mărirea planului comanda intră „la următoarea sincronizare”; un website API V2 n-are însă citire periodică, deci comanda trebuie retrimisă de Edinio (acțiunea „Reia” din §5.1.6). Termenii spun că plafonul nu poate fi depășit.
- Documentația API nu spune că „Orders limit exceeded.” vine în răspunsul la `POST /api/v2/orders/save`. Codul HTTP, forma corpului și dacă refuzul e sincron sunt nedocumentate și lipsesc și din tabelul de coduri al ghidului (M-COM-6, ES-9). Nu e exclus nici un cod 403, ca la „The website has been deactivated” (deducție), deci refuzul se recunoaște după text, nu după cod (§5.1.6). `GET /api/v2/account` întoarce `max_orders`, `current_orders` și `extra_orders`, fără descriere [A].
- Proba gratuită are 14 zile (durata anunțată; aplicația o tratează ca parametru) și pornește fără card. Site-ul o anunță „pe planul Pro”, dar după textele aplicației contul de probă are limite proprii: 50 de etichete (AWB), 50 de facturi, 50 de transmiteri și 10 listări pe canal, față de 15.000 de comenzi pe lună la Pro. Termenii cer un card adăugat în cont pentru folosirea serviciilor, deci continuarea după 14 zile cere card. Plata de validare de o unitate de monedă apare în textele aplicației (adăugarea și schimbarea cardului, reactivarea abonamentului), nu în termeni. API-ul arată doar `is_trial`, în `GET /api/v2/account` [A].
- Limitele probei pot bloca E0, de exemplu la mai mult de 50 de AWB sau de facturi. Ce sunt „transmiterile” și dacă website-ul API V2 intră la „listări pe canal” se întreabă odată cu ES-29 (un cont de integrator fără aceste limite). Alegerea contului de probă rămâne D16.
- Nu există un marketplace de probă documentat. Colecția nu pomenește niciun mediu sandbox, iar `GET /api/v2/marketplaces/list` arată numai canale reale (18 în exemplu) [A]. Numele „dynamic marketplace” vine doar din depozitul GitHub `easySales/dynamic-marketplace-sandbox-api` (2023, neatins din 17.05.2023). E un server Express local, cu date fixe, care imită API-ul pe care îl expune către easySales un marketplace din clasa „dynamic marketplaces” (o familie de marketplace-uri legate printr-un protocol comun, nu unul numit „Dynamic”); data de 17.05.2023 vine din metadatele GitHub; nu e un canal care se leagă la un cont. Dacă se poate înregistra pe contul de probă un astfel de marketplace, care să cheme un server al nostru, e ES-15. Până la răspuns, vânzările externe se probează cu o comandă manuală în easySales.
- Comenzile trimise duc la easySales datele cumpărătorilor, deci easySales devine un procesator nou de date personale. Politica lor de confidențialitate spune că datele sunt găzduite la „firme specializate din Uniunea Europeana”, iar easy-sales.com rezolvă la o adresă AWS din Frankfurt (dosarul B). N-am găsit un DPA public (dosarul B). API-ul nu are nicio rută de ștergere pentru clienți sau pentru comenzi. Pentru clienți există doar modificarea, `PATCH /api/v2/customers/{id}` (scope `update-customers`, după nume), plus `PUT` pe adresele de livrare și de facturare [A]. DPA-ul, locația datelor și ștergerea la cerere sunt D33 și ES-27.

### 2.2 Website-ul „API V2” în documentație
- `website_token` „grupează produsele, caracteristicile, categoriile și comenzile” website-ului și e „required for add and save endpoints” [A: dosarul Website token]. El apare în corpul a 23 din cele 63 de scrieri `/api/v2` ale colecției: categorii, caracteristici, produse, stocuri, Add, Save și Update Order, Save Return [A].
- Fraza „required on every API v2 write” apare o singură dată, la Archive product (`PATCH /api/v2/products/:id/archive`), nu la Archive products bulk [A]. Colecția însăși o contrazice: 40 din cele 63 de scrieri nu trimit tokenul, iar 29 dintre ele au un exemplu 2xx fără el [A]. Sunt acțiunile pe o comandă existentă (anulare, finalizare, status custom, metadate, AWB, facturi), plus etichetele, webhook-urile, clienții și ofertele. Despre Archive products bulk se poate cita doar că website-ul țintă „is resolved from the request's `website_token`” și că acel corp are `website_token` și `skus` (1-50) [A].
- Tokenul trimis în plus: documentația nu are o regulă pentru câmpurile în plus, iar la 422 spune doar „Validation error” [A]. Pe trei scrieri care nu îl cer, tokenul trimis în plus a primit 200 în exemple: `PATCH /api/v2/offers/{marketplace}/{offer}/prices`, `PUT /api/v2/shipping-address/{id}` și `PUT /api/v2/billing-address/{id}` [A; ultimele două exemple sunt vechi, trimise cu `country_id`/`county_id`].
- Pentru celelalte scrieri fără token (34 numărate: comenzi, metadate, AWB, facturi, webhook-uri, etichete, clienți, oferte în bloc, exporturi) documentația nu spune nimic. Patru dintre ele sunt multipart (Upload AWB, Generate invoice, Upload Invoice, Storno Invoice), iar șase n-au corp. Acolo unde e cerut, un token greșit dă 403, nu 422 [A: Archive product]; dacă e validat și unde nu e cerut nu se spune. De aceea tokenul se trimite numai la scrierile care îl arată în colecție și la cele trei de mai sus. Regula „la orice scriere” rămâne IPOTEZĂ de confirmat în E0, familie cu familie, la M-AUTH-4 (tokenul în plus e ignorat, validat sau refuzat?), și nu se aplică deloc rutelor multipart.
- Website-ul apare în API numai prin nume. `GET /api/v2/websites/list` întoarce `name`, `url`, `module_version`, `status`, fără id și fără token [A]. Valorile lui `status` nu sunt documentate; exemplul arată doar `active` [A]. Filtrele `?website=` de la produse și comenzi primesc numele [A]. Un website redenumit în easySales schimbă deci cheia filtrelor (deducție). Ce întoarce filtrul pentru un nume inexistent (zero rezultate sau totul, dacă e ignorat) nu e documentat (M-PROD-7, M-COM-5).
- Câmpul `website` al comenzii nu e definit nicăieri. Valoarea `"API"` apare de 9 ori, numai în exemple: Add, Save, Update, Update General Data, Get, Complete și Cancel Order, plus payload-urile `order-created` și `order-updated` [A]. Textele explicite înclină spre un nume de website, nu spre un literal [A]: filtrul `website` e „filter by website name”; „API V2” e tipul website-ului; website-urile au nume alese liber, iar cel cu token din exemple se numește „Example”; același câmp are „Acme.com” în List orders.
- Ipoteza de lucru: `website` conține numele website-ului prin care a intrat comanda, iar „API” e numele unui website din contul lor demo (în colecție a rămas variabila de dezvoltare `url` = `http://easy-sales.loc`, dezactivată). Se verifică citind `website` pe o comandă trimisă cu tokenul nostru, din `POST /api/v2/orders/save` sau din `GET /api/v2/orders/{internal_id}` (M-COM-5). Codul nu folosește niciodată literalul „API”; până la măsurare, planul nu identifică nicio comandă după acest câmp.
- Gazda de producție e declarată în mediul publicat „Production” al documentației: `url` = `https://easy-sales.com`, activ [A: metadatele documentației, `environments[0]`]. E singurul mediu publicat și cel încărcat de pagină. `colectie.json` nu conține mediile, de aceea dosarul A se completează cu metadatele (https://documenter.gw.postman.com/view/metadata/SzfDvj4T). În colecție rămâne doar variabila de dezvoltare `url` = `http://easy-sales.loc`, dezactivată.
- Toate cererile sunt `{{url}}/api/v2/...` sau `{{url}}/oauth/token`, deci adresele de producție sunt `https://easy-sales.com/api/v2` și `https://easy-sales.com/oauth/token` [A]. Autorizarea are adresa absolută `https://easy-sales.com/oauth/authorize` [A]. Proba curl din dosarul B a confirmat că gazda răspunde.
- Linkurile de paginare din exemple nu au o formă unică [A]. 7 din cele 12 răspunsuri paginate folosesc `https://easy-sales.com/api/v2/...`, dar la Stocks `links.last` are greșeala `https://esy-sales.com/...`. Categories și Characteristics folosesc `https://easysales.ro/api/v2/...`, iar „Get offers” și țările și județele din General Data folosesc `http://easysales.test/api/v2/...`. De aceea nu urmăm `links.next` sau `meta.path` și nu luăm gazda din răspuns: paginăm cu `?page=N` pe adresa fixă și ne oprim după `meta.last_page` și `meta.total` (deducție; §5.2, §5.4.5).
- Colecția nu e înghețată în 2020: are exemple din 2025-2026, de exemplu un antet din 16.02.2026 și payload-ul `storno-invoice-created`, cu data 28.09.2026 [A]. N-am găsit un changelog sau o politică de versiuni (dosarul B). Cum anunță easySales schimbările de API e ES-28.

### 2.3 Autentificarea
- `POST /oauth/token` are patru valori `grant_type` documentate în corpurile cererilor: `authorization_code`, `website`, `password` și `refresh_token` [A]. Proza (lista „Grants”) numește doar trei fluxuri: authorization code, password și website token [A]. `refresh_token` există doar ca cerere, iar singurul exemplu al lui `authorization_code` e un răspuns al grantului website [A].
- Lista nu e garantat completă. `POST /api/v2/account/sub-account/login` și `POST /api/v2/account/forget-password` cer `Bearer {{client_credentials_access_token}}`, pe care niciun grant documentat nu-l emite [A]. Proba curl (dosarul B) arată că `/oauth/token` recunoaște grantul `client_credentials`, nedocumentat. Pentru Edinio contează doar grantul `website`.
- Corpul documentat al grantului `website` (JSON, cu `Content-Type` și `Accept: application/json`) are `grant_type: "website"`, `client_id`, `client_secret`, `website_token` și `scope`, cu scope-urile separate prin spațiu [A: exemplul Website Grant]. Niciun câmp nu e marcat „required” sau „optional”. Obligativitatea lui `website_token` reiese din exemplul 400 „Invalid Data”, al cărui hint e „Check the `website_token` parameter” [A]; fraza „The website token is required for add and save endpoints” privește rutele de scriere, nu grantul. Proba curl (dosarul B) cu doar `grant_type` a primit hint-ul „Check the `client_id` parameter”, deci `client_id` e cerut în practică.
- Le trimitem pe toate, fiindcă apar în toate exemplele. Ce se întâmplă fără `client_secret` sau cu un `scope` gol ori absent e IPOTEZĂ (M-AUTH-4, M-AUTH-5); colecția trimite chiar `scope` gol la `refresh_token` și la `/oauth/authorize`.
- Răspunsurile documentate au doar `token_type: "Bearer"`, `expires_in: 31536000` (365 de zile), `access_token` și `refresh_token`, fără câmpul `scope` [A: cele 4 exemple 200, toate din 2020 și copiate între granturi]. „For security reasons the access tokens expire after one year” [A]. Tokenurile din exemple sunt tăiate după antet, care arată un JWT RS256 [A].
- Revendicarea `scopes` apare numai în JWT-ul-mostră din variabila de colecție `access_token`, decodat: 31 de scope-uri, fără `read-websites-list` [A]. Proveniența mostrei nu e declarată: `aud` nu e niciun client din colecție, deci poate fi un Personal Access Token. Rămân IPOTEZE (M-AUTH-1): că tokenul grantului website poartă și el `scopes`; că lista arată scope-urile acordate, nu pe cele cerute; că JWT-ul e singurul loc din care se află.
- După RFC 6749 (secțiunile 3.3 și 5.1), la care trimite documentația, lipsa lui `scope` din răspuns înseamnă că s-au acordat exact cele cerute; pentru easySales comportamentul nu e documentat. O revendicare `scopes` lipsă înseamnă deci „necunoscut”, nu „fără drepturi”.
- „Only one token per client can be created, when the new access token is generated the old one is revoked automatically” [A: dosarul Authentication]. Avertismentul nu spune ce e „client”; că e clientul OAuth creat în API Settings e lectura noastră, sprijinită de vocabularul documentației („you must create an API client”) [A]. Dacă revocarea e pe client sau pe perechea client și website nu e documentat (M-AUTH-2). În lectura noastră, regula e pe client: un token nou pe același `client_id` îl revocă pe cel vechi, indiferent de grant, de `website_token` sau de utilizator.
- Documentația nu pomenește utilizatorul sau website-ul în legătură cu revocarea. Nici nu confirmă că implementarea urmează textul: grantul `authorization_code`, gândit pentru mulți utilizatori, n-ar merge cu o revocare strict pe client. Lucrăm pe lectura literală (două magazine pe același client se revocă reciproc). Variantele (client, utilizator) și (client, website) sunt IPOTEZE (M-AUTH-2, ES-1).
- Fără `website_token`, răspunsul e 400 `invalid_request` cu `hint: "Check the website_token parameter"` [A]. E singura eroare de emitere documentată. Client sau secret greșit, scope invalid, grant nesuportat și token de website vechi nu au exemple (M-AUTH-4).
- Grantul `refresh_token` are doar corpul cererii: `grant_type`, `refresh_token`, `client_id`, `client_secret` și `scope: ""` [A]. Descrierea e copiată identic de la grantul website, ambele exemple atașate sunt cereri de grant website, iar în toată colecția nu există niciun răspuns la un refresh [A].
- Efectul refresh-ului nu e totuși complet necunoscut. Regula „un token per client” privește orice token de acces nou, deci și pe cel emis prin refresh: tokenul de acces vechi e de așteptat să fie revocat (de confirmat). Durata refresh tokenului, un an, o dă ghidul din 09.2026, nu colecția. Nedocumentate rămân rotația (vine un `refresh_token` nou? cel vechi mai merge?), forma răspunsului și `expires_in` după refresh, plus efectul lui `scope: ""` (M-AUTH-3, restrâns la rotație și la scope). Butonul „Reîmprospătare Token” din interfață regenerează `website_token` și n-are legătură cu acest grant (§2.7).
- Personal Access Tokens nu se reîmprospătează și țin un an [A]. După ghidul din 09.2026, „acoperă tot contul, nu un singur magazin” și se afișează o singură dată (IPOTEZĂ). De aici se înțelege că tokenul website vede doar website-ul lui. Dacă asta ține și la citirea comenzilor (ale altor canale, ale altor website-uri, cele manuale) se măsoară în M-EXT-1 și se întreabă în ES-26, care completează ES-12.
- Lista oficială are 32 de scope-uri [A]. Legătura dintre endpoint și scope e scrisă explicit doar la câteva rute (anexa, §12).

### 2.4 Operațiile și garanțiile documentate
**Categorii și caracteristici**
- Sunt liste plate `{id, name, *_website_id}`, fără părinte [A]. Save: „created or updated” [A].
- La caracteristici, Save pe un `characteristic_website_id` deja creat a întors același id intern, iar Add pe același id a dat 422 „has already been taken” [A: exemplele Add și Save Characteristic]. La categorii, exemplul de succes al lui Save e copiat de la Add (cererea lui originală e `POST /api/v2/categories`), deci upsert-ul e IPOTEZĂ de confirmat (M-CAT-1). `category_website_id` nu e marcat unic [A: tabelul Add Category].
- Redenumirea are și o cale documentată: `PUT /api/v2/categories/{id}` și `PUT /api/v2/characteristics/{id}`, pe id-ul intern easySales [A].
- O categorie sau o caracteristică atașată nu se poate șterge (422 „Cannot delete attached categories!”, respectiv „Cannot delete attached characteristics!”) [A]. Rutele `DELETE /api/v2/categories/{id}` și `DELETE /api/v2/characteristics/{id}` există, cu `website_token` în corp [A]. Lista de scope-uri nu are însă niciun scope de ștergere pentru ele [A], deci scope-ul cerut e nedocumentat (M-AUTH-5).

**Produse**
- „To attach a characteristic or a category to the product, you must first create that category or characteristic using the proper endpoints” [A: dosarul Products]. Dosarul Categories adaugă: „you must define your product categories before defining your individual products” [A]. Se cere deci doar ca orice categorie și orice caracteristică pe care o referă un produs să existe înaintea lui. Ordinea dintre categorii și caracteristici nu e cerută: sunt nomenclatoare independente, iar obiectul Characteristic nu referă nicio categorie [A].
- Contradicție în A: dosarul Categories spune și „Each time you define a product, you must assign it to one of your product categories”, dar tabelele Add, Save și Update dau `categories` cu Required False, iar corpurile brute ale cererilor trimit `[]` [A]. Exemplele de răspuns salvate (Add Success, Add 422, Save, Update, bulk) au în cererea originală categorii completate, de pildă `[14]` [A]. Dacă un produs fără categorie e primit sau dă 422 e IPOTEZĂ de confirmat (M-PROD-3).
- Există Save și Save bulk [A]. Corpul răspunsului de succes al lui Save e identic cu cel al lui Add (același `data.id`) [A], deci nu arată ce întoarce Save la o actualizare (M-PROD-1). Save bulk întoarce `data: null`, fără rezultat pe element [A]. Add pe un `product_website_id` existent dă 422 [A].
- Variantele sunt produse separate, fiecare cu `sku` și `product_website_id` proprii; nu există un tablou de variante [A]. Tabelul Add/Save/Update definește `type`: `complex` „if the product is a variation”, `simple` „if product doesn't have a parent” [A]. `parent_id` („Numeric”, „Parent internal id”), `parent_name` și `parent_url` sunt opționale [A].
- Exemplele contrazic regula [A]. Chiar corpul Save trimite `simple` cu părinte. La Gomag, un `simple` are ca `parent_id` propriul `product_website_id`. La Shopify apare un `complex` fără părinte. La Shoprenter, `complex` vine cu `parent_id` null și cu `parent_name` egal cu numele variantei. `parent_id` vine și ca șir nenumeric („demo_1”). La trimitere urmăm tabelul; la citire nu ne bazăm nici pe `type`, nici pe `parent_id` (§5.4.4). Dacă serverul verifică legătura dintre `type` și părinte și ce id primește `parent_id` sunt IPOTEZE (M-PROD-3).
- Câmpuri: `product_website_id` și `sku` sunt „True (Unique)” [A]; `sale_price` și `full_price` se trimit „including VAT” [A]; `stock` e obligatoriu, „Product available quantity” [A]; `description` e obligatorie și „Can contain basic HTML tags” [A]; `tax_rate` e obligatoriu [A]; `supplier_sku` și `warehouse_location` sunt opționale [A: tabelul Save]. `categories[]` și `characteristics[].id` primesc `category_website_id`, respectiv `characteristic_website_id`, adică id-urile noastre; nota adaugă totuși „(internal id)” [A: tabelul Save].
- Listarea are filtrele `website`, `sku`, `ean`, `status`, `created_after`, `updated_after`, cu 50 de produse pe pagină și paginare prin `meta.total` și `meta.last_page` [A].
- Arhivarea în bloc acceptă cel mult 50 de SKU și întoarce `archived`, `not_found`, `blocked`. Dezactivează și dezleagă ofertele pe toate canalele. Potrivirea SKU ignoră majusculele și privește numai website-ul tokenului [A]. Produsul „remains restorable from the Archived Products screen in the UI” [A]. Colecția (92 de cereri) nu are nicio rută de restaurare, deci „numai din interfață” e o deducție din absență.
- Centrul de ajutor și ghidul de arhivare adaugă: arhivarea părintelui nu arhivează variantele; termenul de ștergere definitivă și plafonul restaurării diferă între surse: articolul de suport „Arhivare produse” (08.2024) dă 30 de zile și cel mult 50 de produse dezarhivate în masă, iar ghidul „Cum arhivezi produse” (29.09.2026) dă o lună, fără plafon (ES-25); un produs încă activ în site e „reimportat automat” (articolul din 2024), „ca produs nou” (ghidul), ceea ce la un website API s-ar întâmpla doar dacă îi retrimitem SKU-ul cu Save. Plafonul de 50 din colecție e al arhivării în bloc [A]. Că ofertele dezlegate se leagă la loc la restaurare nu e documentat. Ce face un Save pe un SKU arhivat (îl restaurează sau creează un produs nou) e IPOTEZĂ (M-PROD-6, ES-25).

**Stoc și prețuri**
- `PATCH /api/v2/stocks/bulk` acceptă cel mult 100 de SKU [A]. Răspunsul e învelit în `{success: true, message: "Success", data: {...}}` [A: un singur exemplu, „Update Stock Bulk -> Success”]. `data.result.success[]` și `data.result.errors[]` sunt liste de SKU, `data.result.error_messages[{sku, message}]` dă motivul („Product not found”), iar `data.products[{id, sku, ean, stock, reserved_stock, handling_time}]` cuprinde numai SKU-urile reușite [A].
- `success` de la rădăcină e boolean și rămâne `true` chiar când unele SKU eșuează; nu e lista de reușite [A]. Forma e doar exemplificată, nu descrisă. În exemplu, `stock` întors e egal cu cel trimis, cu `reserved_stock` 0 (un singur caz, M-STOC-3). Cererea exemplului trimite și `handling_time`, care nu e în tabel [A].
- `PATCH /api/v2/products/prices/bulk` acceptă cel mult 100, cu ambele prețuri obligatorii, „with vat” [A]. Răspunsul are `data.result.success[]`, cu SKU-urile reușite, și `data.result.errors[]` [A]. Singurul exemplu are numai reușite (`errors: []`, fără `error_messages`). Ce conține un element din `errors[]`, motivul și dacă un eșec parțial dă tot 200 cu `success: true` se știu doar prin analogie cu `stocks/bulk` (IPOTEZĂ, M-PROD-4).
- În același exemplu, `data.products[]` întoarce, pentru 250 și 350 trimise, `"210.0840"` și `"294.1176"`, cu `tax_rate` `"19.00"`, ca șiruri cu 4 zecimale [A]. Că sunt prețuri fără TVA e o deducție aritmetică (250 / 1,19 = 210,0840), nu o semantică documentată. O comparație directă cu prețul trimis ar pica pe fiecare SKU.
- Documentația nu explică ce înseamnă `reserved_stock` și cum se leagă de `stock` [A]. Ce spune centrul de ajutor despre rezervări e în §2.7.

**Comenzi**
- Lista are `per_page` 1-100 și peste 40 de filtre, între care `modified_after`, `order_display_id` („display, marketplace or website order ID”), `product_sku`, `meta_key`/`meta_value`, `website`, `marketplace`, `tags`, `has_tags` și `fulfillment_service_id` [A]. Elementele listei au `updated_at`; exemplul Get Order nu îl are [A].
- Serviciile de fulfilment au lista lor, `GET /api/v2/fulfillments/list` [A]; scope-ul `read-fulfillment-services` („Read Fulfilment List”) i se potrivește după nume, fiindcă dosarul nu declară niciun scope. Cum apare în API o comandă onorată de marketplace (de exemplu eMAG FBE) sau de un 3PL nu e documentat (ES-20).
- Există trei identificatori: `id` („Id of the order in external platform (channel)”), `order_display_id` și `internal_id`. „internal_id should be used on get and update requests” [A].
- Că `order_id` trimis prin Add sau Save e „website order ID”-ul căutat de filtrul `order_display_id` nu e scris nicăieri. Reiese doar din exemple: în toate exemplele dosarului Orders `id` e egal cu `order_display_id` (235, 11385, 21367566, 1134585) [A: exemplu, nu regulă]. Singurul exemplu cu un `id` diferit e webhookul `delivery-status-updated` (`"id": 5`, `"order_display_id": "AB-100425"`); în celelalte payload-uri de webhook, „123412” e `order_id`, alături de „AB-100425” [A]. Filtrul caută după „display, marketplace or website order ID” [A], deci acoperă documentat și id-urile de marketplace ale contului; nedocumentat e doar dacă potrivirea e exactă sau parțială. Un rezultat gol nu dovedește că lipsește comanda (M-COM-5: Add, apoi GET cu și fără `website=` și cu un prefix al lui `order_id`).
- Save: „created or updated” [A]; cheia de potrivire nu e scrisă (ghidul spune `order_id`: IPOTEZĂ, M-COM-1). Exemplul de succes al lui Save are cererea originală `POST /api/v2/orders`, deci e al lui Add: răspunsul real al lui Save, inclusiv `internal_id`, e nedocumentat (M-COM-1). Add pe același `order_id` dă 422 „The order.order id has already been taken.” [A].
- Corpul exemplului Save are și chei care lipsesc din tabelul Order object: `source`, `shipping_method`, `payment_status`, `original_payment_method`, `shipment_has_vat`, `original_data` [A: corpul Save Order]. Sensul lor nu e documentat (ES-9 pentru `payment_status`, ES-11 pentru `source`, ES-23 pentru `shipping_method`).
- Liniile au prețul fără TVA (`price`), totalul fără TVA (`total`) și cota în procente (`tax`, „ex: 19”) [A]. La citire, exemplele dau cota ca fracție (`"0.19"`) și netul cu 4 zecimale, iar `price_with_tax` și `total_with_tax` de pe linie sunt „rounded with 2 decimals” [A]. Transportul (`shipment`), taxele (`fees`) și reducerile negative (`vouchers`, `total_vouchers`) au obiecte proprii [A]. `order_total` e definit „Order total value (products values + shipment tax)” [A]; taxele și reducerile nu apar în definiție (M-COM-2).
- Anularea: `PATCH /orders/{internal_id}/cancel` cu `reason` [A]. Metadatele sunt perechi cheie/valoare de cel mult 191 de caractere [A]. Comenzile mai au statusuri custom (`GET /api/v2/custom-statuses`, `PATCH /orders/{internal_id}/custom-status`) și etichete (`/api/v2/tags`, `/tags/attach`, `/tags/detach`) [A].
- La citire, comanda are `shipments[]` (AWB, curier `{id, name}`, `delivery_status {description, value}`, `awb_tracking_page`, istoric), `invoices[]`, `cancel_request` și `errors[]` [A: Get Order]. `invoices[]` are elemente `{series, number, URL, type}`, iar singura valoare documentată pentru `type` e `"invoice"` [A]. Perechea „invoice/storno” vine doar din filtrul `invoice_type` al listei. Că o stornare apare în `invoices[]` cu `type: "storno"` e IPOTEZĂ (M-INV-1).
- Stornarea se ia din surse documentate: webhookul `storno-invoice-created`, răspunsul la `POST /orders/{internal_id}/invoice/storno` și câmpul plat `invoice_storno_nr`, prezent în exemplul de listă și în `orders[]` din Get customer, dar nu în Get Order [A]. Lista mai are filtrele `storno_invoice_number` și `invoice_type` („invoice/storno”) [A].
- Numai Get Order arată pe linii `product_data {id, sku, ean, images}` și `offer {id, marketplace_id, marketplace_name}` [A: un singur exemplu, cu o linie]. Lista are pe linii `product_website_id` în locul lor, iar payload-urile `order-created` și `order-updated` și răspunsurile Add, Save și Update nu le au deloc [A]. Exemplul e și incoerent: comanda are `website: "API"` și `marketplace: null`, dar linia are oferta PepitaHU (26) [A]. Dacă cele două obiecte sunt mereu prezente și ce conține `offer` pe comenzile de website sau manuale e IPOTEZĂ (M-EXT-1).
- La citire, `payment_status` apare numai în exemplul de listă, ca text („Paid”), nu și în Get Order [A]; mai apare ca întreg (`1`) în corpul cererii Save Order, nedescris în tabelul de câmpuri [A]. Liniile citite nu au câmpuri de istoric, ca o cantitate inițială sau stornată; cum se văd modificările de linii după creare e ES-21.

**AWB, facturi, nomenclatoare**
- AWB-ul se poate genera în easySales, încărca ca fișier sau atașa prin URL, și se poate șterge sau anula: `DELETE /orders/{internal_id}/awb`, scris în colecție cu id-ul cablat (`/orders/38/awb`), cu corpul `{"awbs": [...]}` care alege AWB-urile; exemplul lui de răspuns e copiat de la Upload AWB [A]. Încărcarea (`POST /orders/{internal_id}/awb`, multipart cu `awb_id`, `file`, `courier_name`, `source`) primește curierul doar ca text, în `courier_name`: „Optional field, used for informational purposes” [A].
- Atașarea (`POST /orders/{internal_id}/awb/attach`, JSON cu `url`, `awb_id`, `courier_name`) arată și ea curierul ca text, în exemple, dar n-are tabel de câmpuri: dacă `courier_name` e acolo opțional sau doar informativ nu e documentat. Cum devine textul obiectul `shipments[].courier {id, name}` (de exemplu „Manual”, 13, sau curierul găsit după nume) nu e documentat (M-AWB-1). `PATCH .../delivery-status` merge „only on orders with manually uploaded awb” [A].
- Generate AWB (`POST /orders/{internal_id}/awb/{courier_account_id}`) acceptă obiectul opțional `advanced_data`, care „is used to overwrite default order data” [A]. În el, `order_data.cashValue` e float, Required True în `order_data`, cu nota „Order value”; exemplul îl trimite ca șirul `"120.00"`, iar același câmp există la Generate Return AWB [A].
- Că `cashValue` e suma de ramburs nu e documentat: poate fi și valoarea declarată a coletului. Nici valoarea pusă implicit, nici efectul pe o comandă plătită online nu sunt scrise (M-COM-8). Până la măsurare nu ne bazăm pe valoarea implicită pentru comenzile plătite online.
- Facturile au generare, încărcare, atașare, storno, ștergere, anulare și marcare ca plătită (`POST /orders/{internal_id}/mark-as-paid/{internal_invoice_id}`) [A].
- Nomenclatoare: statusurile de livrare 1-7 (Ready, On Route, Delayed, Delivered, Return, Unknown, Canceled); curierii cu id (2 DPD, 3 UrgentCargus, 4 FanCourier, 5 SameDay, 6 GLS, 13 Manual, 18 DHL, 23 Packeta, 26 UPS etc.); cele 42 de județe ale României cu `iso_code` (B pentru București) [A: `GET /delivery-statuses`, filtrul `courier_id`, `GET /general-data/countries/175/counties`]. În exemplele de comenzi, `courier.id` e mereu 4 [A].

### 2.5 Limite și erori
- Limita e de 500 de cereri pe minut „per user” [A: dosarul Request Limits]. Proza promite antetele `X-RateLimit-Limit`, `X-RateLimit-Remaining` și `X-RateLimit-Reset` [A], dar exemplele arată doar primele două. Limit și Remaining apar în 93 din cele 104 răspunsuri, iar Reset și `Retry-After` în niciunul; un exemplu de 429 nu există [A].
- Pe răspunsurile obișnuite ne putem baza deci doar pe Limit și Remaining. Că Reset și `Retry-After` vin numai pe 429 e IPOTEZĂ: antetul `phpdebugbar-id` (PHP DebugBar, folosit și de laravel-debugbar) și `X-Powered-By: PHP` sugerează Laravel, fără ca vreo sursă s-o spună (deducție), iar limitatorul Laravel se poartă așa (M-LIM-1, ES-13). Ritmul se conduce după Remaining; la 429 folosește Reset sau `Retry-After` dacă vin, altfel o așteptare crescătoare.
- Nici valoarea din Limit nu e mereu 500 [A]. E 60 în cele 33 de exemple din 19.03-08.04.2020, între care toate cele 6 de la `/oauth/token` (de fapt două capturi refolosite). E 500 în cele 60 de exemple de după 19.06.2020, inclusiv 8 din 2020. Ghidul din 09.2026 dă 60 de cereri pe minut la endpointul de token, iar proba curl a văzut 60 pe `/oauth/token` și azi (dosarul B).
- Coduri documentate: 400, 401 („No valid Access token provided”), 403, 404, 405, 422 („Validation error”), 429 și 5xx [A]. La 403, tabelul spune „Authorization will not help and the request SHOULD NOT be repeated” [A], un șablon preluat din RFC 2616.
- La Archive product, aceeași documentație dă însă 403 și când tokenului îi lipsește scope-ul `update-products` sau când `website_token` e invalid [A]: acolo autorizarea ajută. Un 403 nu se repetă neschimbat și automat; după reparare (reemitere cu toate scope-urile, respectiv tokenul website nou), cererea se reia. Definitive rămân 403-urile pentru resursa altui cont sau pentru un status nepermis unui sub-cont [A: Archive product, Update custom status]. Că un `website_token` invalid dă 403 e deci documentat [A]; textul exact „Invalid website token” vine numai din ghid (M-AUTH-4). Clasificatorul e în §4.6 și §5.0.
- Exemplele de eroare sunt 18 din 104 (2 cu 400 la `/oauth/token`, 16 cu 422) și au patru forme, nu trei [A]:
  - validare `{message, errors{câmp: [mesaje]}}`, fără `success`: 12 exemple;
  - business `{success: false, message, data: null}`: 3 exemple, toate 422 (ștergerea unei categorii sau caracteristici atașate, arhivarea unui produs cu comenzi active);
  - OAuth `{success: false, error, error_description, hint, message}`: 2 exemple, același 400 `invalid_request`, copiat și sub Refresh Token, deci fără nicio eroare proprie de refresh;
  - hibrid `{success: false, message, errors{...}}`: un exemplu, 422 la `PATCH /products/archive/bulk`.
- Exemplul general din dosarul Errors e o a cincea formă: `{success: false, message: "The given data was invalid."}`, fără `errors` și fără `data` [A].
- Alte observații din exemple [A]: cheile din `errors` sunt căi cu punct (`category.name`, `product.sku`, `order.order_id`); `message` e de obicei „The given data was invalid.”, dar poate fi chiar mesajul primului câmp (Update custom status); 422 acoperă și refuzuri de business, iar duplicatele („has already been taken”) vin ca validare. Pentru 401, 403, 404, 405, 429 și 5xx nu există niciun corp de exemplu.
- Proba curl fără token (dosarul B) a primit 401 `{"message": "Unauthenticated."}` la rădăcina `/api/v2`, fără antete `X-RateLimit-*`, și 401 `{"success": false, "message": "Unauthenticated."}` pe rutele reale.
- Erorile pe element vin și în răspunsuri 200 cu `success: true` [A]: `data.result.errors[]` și `error_messages[{sku, message}]` la `/stocks/bulk`, `data.blocked` și `data.not_found` la arhivarea în bloc, `errors[{date, action, message}]` pe comandă. Niciun exemplu nu arată `success: false` pe un 200; citirea lui ca refuz e o plasă a noastră, nu [A] (§5.0).
- Parserul (§5.0) clasifică după cheile prezente (`error` sau `error_description`, apoi un obiect `errors`, apoi `message`), niciodată după textul din `message` și nici doar după codul 422. Și plicurile de succes diferă, iar unele exemple nu sunt JSON valid (`"internal_id" => 5`) [A].

### 2.6 Webhook-urile
- Abonarea se face pe eveniment: `POST /api/v2/webhooks/{slug}` cu `url`, `http_method` și secretul, scris `seccret` în exemplu [A]. Exemplul de succes (200) trimite doar `url` [A]. Ce nume de câmp citește easySales pentru secret se măsoară în M-WH-1.
- Mai există listarea, schimbarea adresei (`PUT /api/v2/webhooks/{id}`) și ștergerea [A]. Exemplul de răspuns al lui PUT e copiat de la abonare, iar păstrarea secretului după PUT nu e documentată (M-WH-1). `GET /api/v2/webhooks` arată pe fiecare abonare o livrare: `details.result` (`time`, `success`, `status_code`, `response`, `attempt_nr`, `total_nr_of_attempts: 3`, `next_attempt_at`, `final`), payload-ul, `details.webhook {id, slug}` și `triggered_at` [A]. Că e ultima livrare e o deducție: descrierea spune doar „Retrieves a list of webhooks.”
- `POST /api/v2/webhooks/{user_webhook_id}/trigger` primește id-ul abonării (`data.id` de la abonare), n-are corp și declanșează webhook-ul acelei abonări: „Trigger a webhook. This method may be used for testing.” Răspunsul e 200 `{success: true, message: "Success", data: []}`, același plic ca la DELETE [A].
- Ce payload pleacă la declanșare și dacă se poate deosebi de un eveniment real nu e documentat; niciun marcaj de test nu apare (M-WH-4). Până la măsurare, apelul de probă se tratează ca un eveniment real: semnătura se verifică, prelucrarea e idempotentă și nu schimbă nicio stare pe baza payload-ului. Că 200 arată doar primirea cererii e IPOTEZĂ: nu se spune dacă declanșarea e sincronă sau pusă la coadă, nici dacă `success` privește livrarea. Livrarea se dovedește numai prin rândul din inbox și prin `details.result`.
- Tabelul oficial are 16 evenimente: produse, stoc, categorii, caracteristici, comenzi, AWB, factură, storno, cont suspendat sau activat, cereri de reîmprospătare [A]. Payload-urile de reîmprospătare conțin `website.token` [A].
- `delivery-status-updated` are doar un exemplu de payload [A]. În el, `order.id` are valoarea 5, ca `internal_id` din `order-created`, deci pare id-ul intern. Curierul e text („Sameday”), iar `delivery_status.value` e text („delivered”), nu cifra 1-7 de la Get Order [A: exemplul]. Sensul exact se măsoară în M-WH-3.
- Documentația nu spune dacă evenimentele vin pe cont sau pe website, dacă `order-created` vine și pentru comenzile de marketplace și dacă `product-stock-updated` vine pentru produsele unui website API V2 (M-WH-2, M-STOC-2, ES-8, ES-11). Ghidul din 09.2026 recomandă doar `order-created`, `order-updated`, `awb-created`, `invoice-created` și `delivery-status-updated`.
- Antetul `Signature` = `hash_hmac('sha256', json_encode($payload), $secret)` [A]. Nu se spune dacă `$payload` e tot corpul sau doar cheia `payload` (M-WH-1).
- Livrarea e socotită eșuată la un răspuns non-2xx sau mai lent de 3 secunde. „By default”, a doua încercare vine după 10 s și a treia după încă 100 s [A]. Payload-ul nu are id de eveniment, marcaj de timp sau versiune [A]. `webhook.id` din el pare id-ul abonării: în exemplul `GET /webhooks`, ambele valori sunt 1 [A].

### 2.7 Ce spun ghidurile și centrul de ajutor (IPOTEZE de confirmat, afară de ce e marcat [A])
- „Stocul circulă într-o singură direcție pentru un magazin personalizat: din magazinul tău în easySales. easySales nu trimite stocul înapoi” (ghidul din 09.2026). Afirmația ține cu „Sursă stoc produse” = Website. Setarea trebuie aleasă explicit: implicit e easySales și poate fi și SmartBill sau altă integrare (ghidul, centrul de ajutor).
- La nivel de API, direcția nu e unică [A]. Colecția documentează webhookul `product-stock-updated`, prin care easySales trimite `stock` la adresa abonată, și `GET /api/v2/products/stock/list`, care întoarce `stock` și `reserved_stock`. Pagina API V2 spune chiar „În ambele sensuri”, dar textul e un șablon identic cu pagina Gomag. Dacă `product-stock-updated` vine pentru un website API V2 și la ce evenimente nu e documentat (M-STOC-2, ES-8). Ghidul nu arată deci că stocul nu se poate citi din easySales; consecința pentru modul B e în §3.6.
- La intrarea unei comenzi, easySales REZERVĂ cantitatea pe toate canalele, cât timp comanda nu e anulată, finalizată sau facturată (centrul de ajutor: „Stock sources”, 13.12.2024, și „How does it work?”, 06.08.2026). Stocul total rămâne cel citit din sursă, iar rezervarea e un contor separat; în API, `reserved_stock` e alt câmp decât `stock` [A].
- Ghidul surselor de stoc (12.07.2026) spune „când intră o comandă, easySales scade stocul pe care îl știe”. E adevărat ca efect asupra disponibilului, nu ca mecanism asupra copiei. Dacă `stock` din API e brut sau net de rezervări se măsoară în M-STOC-1.
- Când sursa e chiar website-ul: „Când magazinul însuși e sursa, easySales nu rezervă stoc înapoi în același magazin” (ghidul surselor de stoc), iar centrul de ajutor scrie „We cannot reserve stock on the website when this is the stock source”. Cu sursa Website, easySales nu scrie stocul înapoi în magazin (ghidul din 09.2026), deci stocul din Edinio nu-l scade easySales, nici la factură. Dacă rezervările scad totuși stocul trimis pe canale și dacă se aplică și comenzilor venite prin API de la website e ES-22.
- Rezervarea se șterge la generarea AWB-ului, când comanda devine „finalizată”, inclusiv la sursă, la finalizare, la anulare sau când comanda primește o factură generată (centrul de ajutor). Momentul scăderii efective e o setare a contului, nu o regulă fixă. Din 10.2025 (anunțat pe blogul lor pe 20.11.2025), comerciantul alege „la finalizarea comenzii” sau „la momentul facturării”.
- La facturare, stocul scade numai cu bifa „Scade stocul la emiterea unei facturi noi” (Setări → Setări comenzi → Stocuri), în sursa de stoc definită și numai pe produsele legate (Link). O factură încărcată contează ca emitere (ghidul din 01.10.2026), deci avertismentul vechi („dacă nu se generează factura din platformă, stocul trebuie scăzut manual”) nu mai ține. Pe sursa FBA, stocul nu se scade deloc (centrul de ajutor).
- Fereastra AWB → factură (rezervarea a dispărut, stocul n-a scăzut încă) există numai la setarea „la facturare” (deducție din două texte). Ce face scăderea când sursa e Website, ce valoare are setarea pe contul pilot și ce se întâmplă fără nicio variantă activă nu sunt documentate (M-STOC-1, ES-22). O rezervare peste un stoc pe care Edinio l-a scăzut deja ar număra aceeași bucată de două ori; formula stocului se tratează în §5.5.
- Alte afirmații din ghiduri:
  - SKU e cheia de upsert la produse (unic pe website), iar `order_id` la comenzi;
  - un SKU schimbat creează un produs nou („duplicat”). Preferințele conexiunii „Arhivează automat produsele înlocuite” (arhivează produsul vechi dacă n-are stoc și comenzi active) și „Mută ofertele produsului vechi pe noul SKU” lucrează pe loc. Același SKU trimis cu alt id de produs devine „blocat”, iar easySales nu-i mai preia stocul și prețul (ghidurile de arhivare și de produse blocate);
  - modificările de produs din site se propagă în oferte, mai puțin câmpurile decuplate (centrul de ajutor). Dacă `prices/bulk` urmează aceeași regulă și ce face cu prețurile decuplate e ES-32;
  - un apel în bloc are cel mult 100 de elemente, iar un cont are cel mult 30 de website-uri;
  - secretul de webhook „de cel puțin 24 de caractere” e sugerat doar prin valoarea de exemplu `a-shared-secret-of-at-least-24-characters` (Pasul 8). Nicio frază din ghid și nimic din colecție nu impun un minim sau un 422 pentru un secret scurt. Secretul nici nu apare ca obligatoriu: abonarea din exemplul 200 trimite doar `url`, iar colecția spune că generarea lui e „entirely up to you” [A]. Se măsoară în M-WH-1, cu o abonare cu secret de 23 de caractere și una fără secret;
  - tokenul de website nu expiră: trăiește până la „Reîmprospătare Token” (EN „Refresh Token”) sau până la ștergerea website-ului. Reîmprospătarea îl înlocuiește imediat, iar orice folosește valoarea veche primește 403 din acel moment;
  - textul „Invalid website token” ghidul îl pune pe un 403 cu `website_token` „lipsă sau greșit” la scrieri; că după reîmprospătare vine exact acest text e o deducție. Postman confirmă doar codul 403 pentru un `website_token` invalid, la Archive product, unde 403 vine și din scope lipsă sau din produsul altui cont [A]. La `/oauth/token`, singura eroare documentată pentru `website_token` e 400 `invalid_request`, pentru tokenul lipsă [A]. Răspunsul pentru un token vechi și valabilitatea tokenului de acces emis din el sunt nedocumentate (M-AUTH-4);
  - la un website dezactivat vine 403 „The website has been deactivated”;
  - insigna „Conexiune: reușită” a unui website API nu testează nimic;
  - formularul website-ului are și „Status custom pentru comanda nouă”, „Tip de pachet implicit” și „Serie Facturi”, folosită când payload-ul nu aduce una. Dacă statusul custom inițial se aplică și comenzilor venite prin API e ES-31;
  - țara, limba și valuta website-ului se blochează după creare (de aici D29).
## 3. Modelul de integrare ales

### 3.1 Modelul și de ce
- **Edinio e sursa de adevăr** pentru catalog, prețul produsului și stoc. Le împinge în website-ul „API V2” al magazinului.
  - Prețul de pe marketplace rămâne al ofertei din easySales: adaos, reguli, decuplare, Autoprice (IPOTEZĂ, centrul de ajutor). Prețurile ofertelor au rută proprie în API [A: dosarul Offers], pe care n-o folosim.
  - Pe ofertele cuplate, modificările din website se transmit și în marketplace (centrul de ajutor), deci prețul trimis de noi poate ajunge pe marketplace. Dacă adaosul lor se aplică și peste un preț propagat nu e documentat: pe multe marketplace-uri adaosul e descris „Doar pentru ofertele nou adăugate”. Nici că ruta `prices/bulk` declanșează propagarea nu spune vreo sursă (IPOTEZĂ, ES-32).
- **easySales procesează comenzile vitrinei** (stăpânul implicit, ales de comerciant) și ne dă înapoi starea, AWB-ul și factura. Nu pleacă toate comenzile: excepțiile sunt în §3.5.
- **Vânzările din celelalte canale** se află din lista de comenzi easySales. Ele scad stocul Edinio prin motorul comun al integrărilor native, format din două piese:
  - RPC-ul `consuma_stoc_comanda_marketplace`, care scade stocul [C: baseline 3264];
  - `impingeStoculPeCeleLalteCanale`, care duce stocul pe celelalte canale [C: `src/lib/marketplace/stoc-pe-canale.ts:72`].
  Comenzile onorate din depozitul marketplace-ului sau al unui 3PL nu consumă stoc (§5.6, ES-20). Stocul nou pleacă apoi peste tot. În easySales ajunge prin declanșatorul de pe `products`.

De ce așa:
- urmează fluxul descris de ghidul easySales pentru magazinele personalizate (IPOTEZĂ, ghidul din 09.2026; §2.7):
  - magazinul trimite catalogul, stocul și comenzile. easySales întoarce prin webhook numai ce ține de comenzi: starea, AWB-ul și factura;
  - ghidul numește magazinul „sursa de adevăr” numai pentru stoc. Pentru catalog și preț arată doar că pleacă din magazin;
  - și la stoc formularea e condiționată. Câmpul „Sursă stoc produse” are implicit valoarea easySales. Pagina lor despre API V2 spune că sensul îl alege comerciantul („În ambele sensuri, iar tu decizi”). Centrul de ajutor spune că sursa easySales „va suprascrie modificările de stoc efectuate în website”. Dacă, pe sursa Website, stocul nostru rămâne nesuprascris se măsoară în M-STOC-1 și se întreabă în ES-8;
- păstrează „un singur inventar”, propoziția cu care se vinde Edinio [C: antetul `src/lib/marketplace/stoc-pe-canale.ts:14-16`, care cere ca stocul schimbat de o vânzare să plece și pe celelalte canale]. Aici asta înseamnă un singur scriitor de stoc absolut în `products`: Edinio;
- refolosește tiparul deja probat al integrărilor native:
  - fiecare integrare stă în folderul ei, `src/lib/<canal>/` (emag, aboutyou, trendyol, olx, pepita, google-merchant). Piesele comune stau în `src/lib/marketplace/` [C];
  - `consuma_stoc_comanda_marketplace` e idempotent prin `stoc_marketplace_la` [C: baseline 3264-3318]. Azi îl cheamă `src/lib/emag/orders.ts`, `aboutyou/orders.ts`, `trendyol/orders.ts`, `pepita/ingest.ts` și `emag/rma.ts` [C];
  - `ajusteaza_stoc_comanda_marketplace` tratează liniile schimbate după consum, de exemplu un produs adăugat sau un storno parțial [C: baseline 1220; chemat din `src/lib/emag/orders.ts:1484` și `src/lib/pepita/ingest.ts:1382`]. Consumul se face o singură dată. Fără ajustare, o comandă externă modificată ar lăsa stocul greșit și n-ar apărea niciun semnal. Dacă easySales arată liniile modificate (`initial_qty`, `storno_qty`) sau numai pe cele curente e ES-21;
  - regula FBE de la eMAG: o comandă onorată din depozitul eMAG nu consumă stoc, fiindcă marfa a plecat demult din depozitul comerciantului [C: `src/lib/emag/orders.ts:1245-1254`, `onoratDeEmag` (:675)]. La easySales, centrul de ajutor o spune numai pentru Amazon: când sursa e FBA, easySales nu generează AWB și facturi și nu scade stocul (articolul „Configurare Marketplace Amazon”). Pentru FBE nu există o frază echivalentă (ES-20). Pentru 3PL, recunoașterea folosește filtrul `fulfillment_service_id` și `GET /fulfillments/list` [A]. Pentru eMAG folosește canalele FBE (`EmagROFBE` 41, `EmagHUFBE` 55, `EmagBGFBE` 56), care apar în pachetul JavaScript al aplicației easySales (`static marketplaceIds`), nu în documentația API; că o comandă FBE vine prin API pe unul dintre ele e IPOTEZĂ (§5.6, ES-20). Scope-ul `read-fulfillment-services` [A: lista de scope-uri] se cere din prima (§4.3);
  - `MARKETPLACE_CU_CICLU_PROPRIU` [C: `src/lib/orders/origin.ts:115`] și ieșirea lui `maybeAutoInvoice` pentru cheile de marketplace necunoscute [C: `src/lib/actions/invoice-auto.actions.ts:205`].

**Ce costă și ce rămâne de dovedit:**
- E4 cere ca tokenul website să vadă la citire comenzile celorlalte canale. Documentația API nu spune nimic despre asta (IPOTEZĂ nedocumentată: M-EXT-1, ES-12, ES-26).
  - Ghidul descrie Personal Access Token-ul ca „account-wide rather than shop-scoped”. De aici reiese că tokenul website vede un singur magazin. Rezultatul negativ e deci cel puțin la fel de probabil ca cel pozitiv.
  - Despre comenzile create manual documentația nu spune nimic.
  - Dacă M-EXT-1 iese negativ, rezerva e un PAT. Ghidul îl descrie ca „account-wide”, dar nici el nu e probat pentru citirea comenzilor. Dacă nici PAT-ul nu merge, E4 nu se livrează pe acest drum (§5.6, §3.6).
  - Indiferent de rezultat, `read-orders` se cere explicit (§4.3). Exemplele din colecție pentru grantul website nu-l conțin [A: Website Grant], dar ghidul oficial (pasul 4, EN și RO) îl cere grantului website, alături de `add-products update-products update-stock add-orders update-orders`. E un indiciu documentat că grantul îl acceptă; ce comenzi se văd cu el rămâne M-EXT-1.
- Pentru E4, banda de listă e singurul semnal sigur. Nu e documentat că `order-created` vine pentru comenzile de marketplace și nici că `product-stock-updated` vine pentru un website API V2 (M-WH-2, M-STOC-2). De aceea ele doar grăbesc recitirea.
- Formula stocului trimis depinde de felul în care easySales rezervă și scade stocul, iar colecția nu-l descrie (§3.8, M-STOC-1).
- E3 ține catalogul pe stoc 0, deci singură nu vinde nimic. Partea de catalog din E3 se construiește numai în două cazuri: M-EXT-1 iese pozitivă (cu tokenul website sau, dacă D3 îl alege, cu un PAT) și M-STOC-1 iese pozitivă, ori se acceptă modul B (§5.9). Altfel ar fi muncă degeaba. Raportul de pregătire rămâne livrabil singur (§10). În E0, M-EXT-1 se măsoară primul.
- D3 se hotărăște în E0, înaintea lui E1, nu abia în E4. Un PAT ar schimba mai multe lucruri:
  - formularul de conectare, care ar avea al patrulea secret;
  - stocarea;
  - reamintirea anuală, fiindcă un PAT nu se reîmprospătează [A];
  - analiza de securitate, fiindcă un token pe tot contul vede datele personale de pe toate canalele.
- Pe contul de probă, vânzarea externă se poate proba sigur numai cu o comandă manuală în easySales. Nu e documentat niciun marketplace de probă care să se lege la cont (ES-15). „Dynamic marketplace” pare doar un mock public din 2023 al API-ului pe care un marketplace îl expune către easySales (IPOTEZĂ). Dacă se vede o comandă manuală, nu rezultă că se văd și cele de marketplace (IPOTEZĂ). Deci M-EXT-1 se repetă la pilot, pe o comandă reală de marketplace.
- Colecția se mai schimbă: exemplul `storno-invoice-created` e datat 28.09.2026. Politica lor de versiuni nu e scrisă nicăieri (ES-28).

### 3.2 Fluxurile

```
EDINIO (sursa: catalog, preț, stoc; vitrina)                easySales (website „API V2” al magazinului)

categorii, caracteristici  --E3--> categories/characteristics save[/bulk] -->  nomenclatoare plate
produse și combinații      --E3--> products/save[/bulk], stock 0 până la E4 -->  produse simple / complex
preț                       --E3--> PATCH products/prices/bulk -------------->  sale_price, full_price
stoc (valoare absolută)    --E4--> PATCH stocks/bulk ----------------------->  stock
produs șters               --E3--> PATCH products/archive/bulk ------------->  arhivat
comanda din vitrină        --E2--> POST orders/save + metadata ------------->  comandă pe website
anulare cerută în Edinio   --E2--> PATCH orders/{internal_id}/cancel ------->
                                                                ofertele pe marketplace-uri (ale lor)
starea, AWB, factura       <--E2-- webhook (semnal) + GET orders/{internal_id} + listă modified_after
vânzările altor canale     <--E4-- listă modified_after + GET orders/{internal_id}
    => comandă „ES-...” în Edinio => consuma_stoc_comanda_marketplace => stoc nou => stocks/bulk și celelalte canale
    => linii schimbate după consum => ajusteaza_stoc_comanda_marketplace
    => comandă onorată de marketplace sau de un 3PL => fără consum
```

- Pentru E4, banda de listă e singurul semnal pe care ne bazăm. Webhook-urile doar grăbesc recitirea (§3.1).
- Pe ofertele cuplate, prețul din `prices/bulk` poate ajunge și pe marketplace; dacă trece prin adaosul lor nu e documentat (IPOTEZĂ, ES-32).
- Valoarea trimisă prin `stocks/bulk` urmează formula aleasă după M-STOC-1 (§3.8).

### 3.3 Sursa de adevăr pe fiecare câmp

| Domeniu | Câmp | Sursa de adevăr | Sens | Mecanism | Etapa |
|---|---|---|---|---|---|
| Produs | nume, descriere, imagini, brand, EAN, greutate, URL, categorie, caracteristici | Edinio | E → ES | declanșator pe `products` + coadă, `products/save[/bulk]` | E3 |
| Produs | SKU trimis | tabela de legătură Edinio, înghețat la prima trimitere, generat stabil dacă lipsește | E → ES | `easysales_produse` | E2/E3 |
| Produs | `product_website_id`, `parent_id` | Edinio (surogat numeric din secvență) | E → ES | `easysales_produse` | E2/E3 |
| Produs | preț de vânzare, preț vechi, cotă TVA | Edinio | E → ES | `prices/bulk`, `save` | E3 |
| Ofertă | prețul pe marketplace (adaos, reguli, decuplare, Autoprice) | easySales (IPOTEZĂ, centrul de ajutor) | nu scriem ofertele; pe cele cuplate, prețul produsului ajunge pe marketplace (IPOTEZĂ, ES-32) | - | E3 |
| Stoc | cantitatea disponibilă | Edinio | E → ES, absolut | `stocks/bulk`, valoarea din §5.5, cu formula aleasă după M-STOC-1 (§3.8) | E4 (0 în E3) |
| Stoc | vânzările altor canale | easySales (faptul), Edinio (efectul) | ES → E | comanda externă consumă stocul Edinio, iar liniile schimbate după consum se ajustează (§5.6, ES-21); comenzile onorate de marketplace sau de un 3PL nu consumă (ES-20) | E4 |
| Comandă vitrină | linii, bani, client, adrese, plata | Edinio, fotografiată la plasare | E → ES | outbox + `orders/save` | E2 |
| Comandă vitrină | felul livrării, curierul ales, tariful încasat | Edinio | E → ES, numai ca text | `delivery_notes` [A]; `shipping_method` apare în corpul exemplului Save, fără descriere în tabel [A] (ES-23) | E2 |
| Comandă vitrină | starea de procesare, expedierea, livrarea | easySales, stăpânul fixat prin ștampilă | ES → E | webhook ca semnal + `GET orders/{internal_id}`, tranziția Edinio | E2 |
| Comandă vitrină | anularea | Edinio cât easySales n-a procesat-o; easySales după | E ⇄ ES | „Anulează în easySales”, recitirea | E2 |
| Retragere (OUG 18/2026) | cererea, aprobarea, rambursarea, repunerea în stoc | Edinio, prin `return_requests` [C] | nu ajunge la easySales | notificare către comerciant; stornarea la ei; rambursarea prin procesatorul Edinio; repunerea în stoc în Edinio (D28) | E2 |
| AWB | număr, curier, istoric, urmărire | easySales | ES → E | `shipments[]` | E2 |
| Factură, storno | serie, număr, PDF | easySales | ES → E | `invoices[]`, `storno-invoice-created` (cu `order_return_id` [A]; legătura cu cererea de retur: D28) | E2 |
| Plata online | încasarea și rambursarea | procesatorul din Edinio | nu se sincronizează | metadate + notificări; factura easySales a comenzii: nota de mai jos | E2 |
| Comenzi altor canale | tot ciclul | easySales | ES → E, doar pentru stoc și evidență | comandă „ES-…” cu `marketplace: "easysales"` | E4 |
| Client | datele cumpărătorului din vitrină | Edinio | în comandă | nu există creare de client prin API [A]; nici ștergere (nota de mai jos, D33) | E2 |
| Notificările către cumpărător | o singură parte | după D5 | - | fluxurile de marketing primesc oricum evenimentele vitrinei (§3.8) | E2 |

Note la tabel:
- **Curierul ales.** Alegerea din checkout ajunge la ei numai ca text. Dacă o automatizare easySales alege alt curier, comerciantul plătește alt tarif decât cel încasat. Cum se marchează ridicarea personală și curierul propriu e ES-23.
- **Retragerea din contract.** Funcția obligatorie de retragere cerută de OUG 18/2026 există în Edinio. Are tabela `return_requests`, cererea publică, statusurile nou, aprobat, respins și rambursat și emailul pe suport durabil [C: `src/lib/actions/return.actions.ts:22`, `:126`, `:180`, `:330`; `/dashboard/returns`]. Pe o comandă procesată în easySales, lucrurile se împart așa:
  - cererea ajunge numai în Edinio;
  - stornarea se face la ei;
  - rambursarea cardului se face prin procesatorul Edinio;
  - repunerea în stoc n-o face nimeni. `updateReturnStatus` schimbă doar starea cererii [C: `return.actions.ts:330-348`]. F2 lasă comanda neschimbată la retur (D19). În E4, returul dă `refunded` cu `elibereazaStoc: false` [C: `src/lib/orders/tranzitie-marketplace.ts:67-88`].
  
  Sunt de adăugat trei lucruri:
  - notificarea „retur pe o comandă procesată în easySales”, cu legătură spre comanda lor;
  - repunerea în stoc la un retur aprobat, făcută în Edinio, care e sursa stocului;
  - legătura dintre `order_return_id` din `storno-invoice-created` [A] și cererea de retur.
  
  Cât din toate acestea se automatizează hotărăște D28.
- **Factura unei comenzi plătite cu cardul.** Trimitem `payment_mode: 1` și metadatele, dar nu și `payment_status` (§5.1.3). Dacă factura emisă la ei rămâne neîncasată se măsoară în M-COM-8 și M-INV-1. Ruta `POST /orders/{internal_id}/mark-as-paid/{internal_invoice_id}` („Mark a specific invoice as paid totally or partial” [A]) ar marca-o ca încasată. Id-ul intern al facturii pare să vină în `invoice-created` (IPOTEZĂ). Folosirea rutei se hotărăște după măsurătoare.
- **Ștergerea datelor (GDPR).** easySales devine un procesator nou al datelor cumpărătorilor. API-ul nu are DELETE pe clienți sau pe comanda întreagă [A]; are DELETE numai pe subresurse ale comenzii (metadate, AWB, factură) [A]. Datele personale se pot doar suprascrie, prin `PATCH /customers/{id}`, `PUT /shipping-address/{id}`, `PUT /billing-address/{id}` și rutele PUT ale comenzii [A]. Scope-ul `update-customers` (după nume) lipsește din cele cerute (§4.3). Dacă un scope adăugat mai târziu cere un token nou nu e documentat (IPOTEZĂ, probabil fiindcă scope-urile se fixează la emitere; se verifică în M-AUTH-5), iar un token nou îl revocă pe cel vechi [A]. Calea de ștergere (manuală sau prin `PATCH /customers`) și DPA-ul fac obiectul lui D33. Locația datelor și ștergerea la cerere fac obiectul lui ES-27.
- **Marketingul.** Tranzițiile venite din easySales pe comenzile vitrinei ajung automat în Mailchimp, Brevo sau Klaviyo (§3.8).

### 3.4 Regulile care apără banii și stocul
1. **Webhook-ul e doar un semnal.** Starea se recitește prin API cu tokenul nostru. Un webhook fals sau dublat poate provoca cel mult o recitire.
2. **Edinio nu scrie niciodată în `products` un stoc venit de la easySales.** Din afară vin numai efectele comenzilor externe: consumul, ajustarea liniilor schimbate după consum și eliberarea la anulare. Toate trec prin RPC-urile existente. Dacă omul corectează stocul în easySales, corecția se pierde la următoarea împingere a acelui articol. Corecțiile se fac în Edinio, inclusiv repunerea în stoc după un retur (D28).
3. **Fiecare comandă are un singur stăpân și un singur emitent de documente**, fixați de ștampila scrisă la inserare (§5.1.1). Niciun drum de factură sau AWB din Edinio nu trece peste ea. Comenzile „ES-…” aduse de E4 nu se ștampilează, fiindcă au `marketplace: "easysales"`. Altfel s-ar întoarce la easySales, într-o buclă.
4. **Sumele se închid sau comanda nu pleacă** (§5.1.4).
5. **Stocul real pleacă numai cu bucla închisă** (E4), iar fiecare împingere vine după citirea comenzilor externe. Formula valorii trimise se fixează după M-STOC-1 (§3.8).
6. **Tokenul se emite rar și sub zăvor**; „Testează” nu emite.

### 3.5 Ce nu face v1
- Nu folosește Add (`POST /products`, `/orders`, `/categories`, `/characteristics`), ci numai Save.
- Nu cheamă din Edinio `Generate AWB` sau `Generate invoice`:
  - amândouă creează documente reale în afara easySales: AWB-ul la curier, factura în programul de facturare;
  - colecția nu spune ce face un al doilea apel pe aceeași comandă. Are un singur exemplu de succes, niciun exemplu de eroare și nicio cheie de idempotență [A];
  - `shipments` și `invoices` sunt tablouri; `awb_id` e tablou în exemplele GET și `null` în răspunsurile Add, Save și Update, și există atât pe comandă, cât și pe fiecare element din `shipments` [A]. Codul tratează `null` ca listă goală. O reîncercare poate deci dubla documentul (IPOTEZĂ de confirmat);
  - există rute de anulare: `DELETE /orders/{internal_id}/awb` („Delete/cancel specific awb.”), `POST .../invoice/storno`, `DELETE .../delete-invoice` și `POST .../cancel-invoice` [A]. Ruta de AWB e scrisă în colecție cu id-ul cablat (`/orders/38/awb`) și cere corpul `{"awbs": [...]}`, iar exemplul ei de răspuns e copiat de la Upload AWB; Cancel invoice are aceeași descriere ca Delete invoice [A]. Colecția nu spune ce anulează ele la curier sau în programul de facturare. O stornare e un document fiscal nou, nu o ștergere (IPOTEZĂ). Întrebarea contează numai dacă o extensie din E5 ar chema aceste rute. Atunci se măsoară înainte.
- Nu stabilește rambursul de pe AWB-urile generate în easySales. Câmpul `advanced_data.order_data.cashValue` al lui Generate AWB e descris doar ca „Order value” [A]. Nu e documentat că ar fi suma de ramburs și nici ce pune easySales implicit. Comenzile plătite cu cardul pleacă cu `payment_mode: 1`. Înaintea primei comenzi reale plătite cu cardul, M-COM-8 verifică dacă AWB-ul ei cere ramburs.
- Nu importă produse din easySales și nu scrie ofertele. Prin `prices/bulk` schimbă totuși prețul ofertelor cuplate (IPOTEZĂ, ES-32).
- Arhivează numai la ștergerea produsului din Edinio. Pentru o combinație ștearsă, D30 hotărăște între arhivare și stoc 0.
  - La ei, produsele arhivate se șterg definitiv după un termen pe care sursele îl dau diferit: articolul de suport „Arhivare produse” (08.2024) dă 30 de zile și cel mult 50 de produse dezarhivate în masă, iar ghidul „Cum arhivezi produse” (29.09.2026) dă o lună, fără plafon (ES-25). Plafonul de 50 din colecție e al arhivării în bloc [A].
  - Nu e documentat ce face un Save pe un SKU arhivat (M-PROD-6, ES-25).
  - Rândurile `arhivat` din tabela de legătură nu intră în nicio împingere (stoc, preț, conținut) și nici în potrivirea E4.
- Nu trimite automat:
  - comenzile dinaintea activării;
  - comenzile cu livrare la punct de ridicare (până la ES-9, D17);
  - comenzile cu ridicare personală sau cu curierul propriu al magazinului (D27, ES-23). Ridicarea personală are `delivery_type = 'address'` și `courier = 'pickup'`, iar `address` e adresa cumpărătorului, nu a magazinului [C: `src/lib/cont/livrare.ts:4-8`, `:76-78`; cheile stau în `orders.shipping_address`, baseline 3671, 3674]. Ștampila din §5.1.1 exclude numai punctele (`delivery_type = 'locker'`). Așa, o automatizare easySales ar genera AWB spre casa unui om care vine singur la magazin. Propunerea, până la D27: ștampila le exclude pe amândouă, cu probă SQL (§9.2). Din cele 568 de comenzi din vitrină, 173 au curierul propriu (5 magazine), 12 au ridicare personală (3 magazine) și una are punct de ridicare [C: producție, 12.10.2026]. Pe toate magazinele, E2 ar acoperi deci cel mult 382 din 568 de comenzi (67%);
  - comenzile în altă monedă decât RON. `orders` n-are coloană de monedă [C: `src/types/database.types.ts`]. De aceea ștampila citește `store_settings.currency`, cum face deja Pepita [C: `src/lib/actions/pepita.actions.ts:1056-1057`]. Azi toate cele 146 de magazine sunt în RON [C: producție, 12.10.2026];
  - comenzile cu fișiere de personalizare ale cumpărătorului, până la D31. În easySales ar ajunge doar rezumatul din `observations`, fără fișierele de producție.
- Nu procesează din Edinio comenzile altor canale, adică AWB și factură făcute în Edinio și încărcate apoi la ei. Nici modul hibrid din E5 nu le tratează.
- Nu folosește `refresh_token` până nu i se măsoară efectul.
- Nu face retururi prin API:
  - în singurul exemplu, `POST /api/v2/returns` întoarce `data: []`, fără id-ul returului. Colecția n-are nici rută de citire a retururilor, nici webhook de retur [A];
  - efectul unei reluări nu e documentat. Descrierea („created or updated”) sugerează un upsert pe comandă, ca la Save Order. Pe de altă parte, obiectul n-are cheie proprie, iar scope-ul e doar `add-order-returns` [A]. Ipoteza că o reluare ar dubla returul se măsoară înaintea oricărei extinderi din E5, cu două Save Return identice pe o comandă de test;
  - motivul pentru care v1 nu face retururi: idempotența e nedocumentată, iar răspunsul nu confirmă ce s-a creat;
  - cererile de retragere din Edinio pe comenzile procesate în easySales sunt tratate la §3.3 și în D28.
- Nu sincronizează clienții. Ștergerea la cerere e tratată în nota de la §3.3 și în D33.
- Nu atinge calea checkout-ului: ștampila, outboxul și catalogul se prind prin declanșatori în bază.

### 3.6 Alternative cântărite și respinse
- **Modul B: easySales sursă de stoc, Edinio citește.**
  - Respins pentru v1. `reserved_stock` nu e explicat [A], iar Edinio ar căpăta un al doilea scriitor de stoc absolut. La asta se adaugă ferestrele de mai jos.
  - Ghidul spune că easySales nu trimite stocul înapoi (IPOTEZĂ). Asta nu e un motiv de respingere, fiindcă citirea există în API:
    - `GET /products/stock/list` întoarce `stock` și `reserved_stock`, fără filtru de website [A];
    - `GET /products?website=` le întoarce pe fiecare produs al website-ului [A];
    - webhook-ul `product-stock-updated` poartă `stock` [A], dar nu e documentat dacă vine pentru un website API V2 (M-STOC-2, ES-8).
  - Ferestrele cunoscute:
    - `revendicaStocul` se comite înaintea inserării comenzii [C: `order.actions.ts:2033` față de `:2047`; în coș, `:5054` față de `:5068`];
    - la generarea AWB-ului, comanda devine finalizată și rezervarea se șterge (IPOTEZĂ, centrul de ajutor);
    - din 10.2025, contul alege dacă stocul scade la finalizare sau la facturare. Disponibilul crește temporar între AWB și factură numai cu „la facturare” și numai când AWB-ul vine înaintea facturii (IPOTEZĂ; M-STOC-1, ES-22).
  - Se redeschide numai dacă E0 arată că E4 nu se poate face, numai cu răspunsuri scrise de la easySales și numai cu condițiile din §5.9.
  - Cât modul B e amânat, comercianții cu stocul în SmartBill sau într-un ERP legat prin easySales nu au niciun drum (§3.7).
- **Modelul „hub”** (catalogul importat din easySales, produse minimale dublate în website-ul Edinio, stocul citit din website-ul-sursă). Respins, fiindcă se sprijină pe două lucruri nedocumentate: partajarea stocului și a rezervărilor între website-uri și legarea liniilor pe tot contul. Importul catalogului din easySales rămâne o extensie posibilă (E5), prin conducta de import existentă, cu produsele nepublicate.
- **Alte granturi:**
  - `authorization_code`:
    - n-are exemplu propriu, fiindcă singurul exemplu e copiat de la grantul website. N-are nici înregistrare de `redirect_uri` pentru un integrator cu mulți chiriași [A];
    - fluxul descris e al unui client de dezvoltator, pe care utilizatorul doar îl aprobă. Nu se spune însă dacă un client creat într-un cont poate fi aprobat de utilizatorii altor conturi [A];
    - nu scapă de `website_token`. Scrierile de tip add și save îl cer în corp („required for add and save endpoints” [A]). Colecția nu face excepție pe grant, deci cerința rămâne și aici (deducție);
    - pentru Edinio, tokenul se obține numai adăugând din interfață un website de tip API V2 (au token de website și cele Gomag sau cele cu modul, dar nu ne privesc). Niciun endpoint nu-l întoarce: `websites/list` dă doar `name`, `url`, `module_version` și `status` [A]. Edinio nu-l poate obține singur. După ghid, omul îl copiază din pasul „Configurare” al asistentului sau de pe cardul website-ului;
  - `password`: ne-ar obliga să păstrăm parola contului [A];
  - Personal Access Token:
    - nu se reîmprospătează și ar trebui reintrodus anual [A]. După ghid, acoperă tot contul și se afișează o singură dată (IPOTEZĂ);
    - rămâne rezerva pentru citirea comenzilor, dacă M-EXT-1 iese negativ cu tokenul website. Ar fi al patrulea secret și ar vedea datele personale de pe toate canalele contului;
    - dacă mai multe magazine Edinio de pe același cont ar folosi același PAT, revocarea lui le-ar opri pe toate;
    - hotărârea e D3 și se ia în E0 (§3.1);
  - un client de partener sau de platformă, comun mai multor comercianți:
    - colecția nu documentează niciunul. Nu există un client folosit de mai multe conturi, iar înregistrarea de `redirect_uri` e nedocumentată. Grantul `client_credentials` nu e documentat ca cerere de token, dar nici nu lipsește cu totul: „Sub-Account Authentication” și „Forgot password” cer un `client_credentials_access_token`, iar serverul recunoaște grantul (proba curl). Granturile documentate sunt `authorization_code`, `password`, `website` și `refresh_token` [A];
    - singura regulă e „In your easysales account, you must create an API client by going to Account -> Settings -> API Settings” [A];
    - nicăieri nu scrie că fiecare comerciant își creează propriul client. E alegerea noastră: cu Website Grant, clientul și `website_token` stau în contul comerciantului;
    - alegerea se sprijină pe o deducție din „Only one token per client can be created” [A]. Un client comun s-ar revoca de la un comerciant la altul, dacă revocarea e pe client (ES-1);
    - urmele unui nivel de partener sunt nedocumentate și merg tot la ES-1. Cererea definită pentru „Assign partner” are ruta autentificării de sub-cont. `POST /api/v2/account/partners` cu `{"code": ...}` (un UUID) apare doar în exemplul ei de răspuns, fără originea lui `code` [A]. Pentru tokenul `client_credentials_access_token`, cerut de „Sub-Account Authentication” și „Forgot password”, nu se spune de unde vine [A];
    - Gomag are în adminul lui o aplicație nativă easySales. Comerciantul lipește acolo doar tokenul website-ului (IPOTEZĂ, centrul de ajutor easySales și ghidul „Cum conectezi Gomag cu easySales”). Nu e documentat dacă în spate e un client OAuth de partener (ES-1).
- **Doar sondare, fără webhook-uri:** se poate construi pentru comenzile „updated in easySales” [A: filtrul `modified_after`, cu paginare și `updated_at` pe element]. Rămân IPOTEZE până la M-COM-5 patru lucruri:
  - dacă filtrul prinde AWB-ul, factura și livrarea;
  - în ce fus orar lucrează;
  - dacă „after” include data dată;
  - în ce ordine vine lista.
  
  Webhook-ul aduce viteză. Sondarea rămâne plasa de siguranță, iar pentru E4 e singurul semnal pe care ne bazăm.

### 3.7 Precondiții la comerciant
- cont easySales cu abonament activ;
- un website „API V2” **nou și gol**, creat numai pentru acest magazin, cu următoarele setări:
  - România, RON, RO. Țara, limba și moneda se blochează la creare (IPOTEZĂ, ghid). Moneda website-ului trebuie deci să fie cea din `store_settings.currency`. Propunerea: conectarea se refuză dacă monedele diferă. Dacă moneda magazinului se schimbă după conectare, catalogul și stocul intră automat în pauză (D29);
  - „Sursă stoc produse: Website”. Implicitul lor e easySales (IPOTEZĂ);
  - „Status custom pentru comanda nouă” lăsat gol, dacă ES-10 arată că automatizările se pot opri pe website. După ghidul magazinului personalizat (RO), câmpul e opțional și aduce fiecare comandă importată într-un status al comerciantului. Nu se știe dacă se aplică și comenzilor venite prin API (ES-31). Nu se știe nici dacă atinge `status`, pe care se sprijină maparea din §5.2. Ambele se măsoară odată cu M-COM-3;
  - „Tip de pachet implicit”, ales după coletele magazinului: după ghid, e valoarea implicită folosită la generarea AWB-urilor pentru comenzile website-ului (la AWB, `package_type` e opțional [A]);
  - opțional, seria de facturi;
  - un nume care nu se mai schimbă după conectare. Filtrele `?website=` merg pe nume [A]. O redenumire dă zero rezultate și oprește retrimiterile în masă (§5.4.5);
- un client OAuth de tip „Website Grant”, folosit numai de Edinio și numai pentru acest magazin;
- conturile de curier și de facturare configurate în easySales, fiindcă de acolo vin documentele;
- canalele vândute prin easySales declarate, fără suprapunere cu integrările native din Edinio (§4.9);
- notificările easySales către cumpărători setate după D5;
- dacă ES-10 iese negativ, adică automatizările nu se pot opri pe website, există pârghii documentate pentru a ține comenzile noastre în afara lor: statusul custom inițial de mai sus, `PATCH /orders/{internal_id}/custom-status` și etichetele (`POST /tags/attach`, filtrele `tags` și `has_tags`) [A];
- pe durata pilotului, automatizările easySales pe acest website rămân oprite până la proba cap la cap. `orders` n-are steag de test [C: `src/types/database.types.ts`]. Prima comandă de probă ar putea deci primi la ei o factură fiscală reală și un AWB. Procedura pentru comenzile de test din pilot e o întrebare deschisă pentru proprietar (§11.a);
- la un plătitor de TVA, o cotă legală azi: 21, 11 sau 0. Cota catalogului e `vat_enabled ? vat_rate : 0` (§5.4.4), iar Edinio o verifică la conectare;
- relația cu easySales ca procesator al datelor cumpărătorilor, lămurită înainte: DPA, locația datelor, ștergerea la cerere (D33, ES-27). În sursele publice n-am găsit nici termenii aplicației, nici un DPA (IPOTEZĂ).

**Cine nu se potrivește azi:**
- comerciantul care își ține stocul în SmartBill sau într-un ERP legat prin easySales. Precondiția „Sursă stoc produse: Website” îl exclude, iar cu modul B amânat nu are alt drum. E o limită de produs și trebuie spusă explicit la D1 și D3;
- comerciantul care vinde deja prin easySales de pe alt website (WooCommerce, Gomag):
  - ofertele lui sunt legate de produsele acelui website, poate cu stoc comun pe SKU;
  - nu e descris cum se mută ofertele pe produsele Edinio și nici de produsele cărui website le leagă Autolink (ES-24);
  - vânzările de pe website-ul vechi cu aceleași SKU nu trec de regula celor doi martori (§5.6), deci nu scad stocul Edinio. Dacă ar trebui să-l scadă hotărăște D32.

### 3.8 Ce am îndreptat față de variantele analizate
- **TVA pe linii:** cota fiecărei linii vine din `planulCotelor(...).cotaLiniei`, iar reducerile se împart pe grupe cu `peGrupe`, fiecare cu `tax` explicit. Garda sumelor e `reconciliazaComanda`, aceeași ca la SmartBill, Oblio și fGO. Nu mai punem `.tax = orders.vat_rate` cu o toleranță fixă.
- **„Completed” nu înseamnă expediat:** fără AWB, comanda devine `processing`, cu steag. Numai Completed cu AWB devine `shipped`, ca „finalizată” la eMAG [C: `src/lib/emag/orders.ts:101`, în `statusEdinio` (:57): starea 4 „finalizată” dă `shipped`, starea 3 „pregătită” dă `processing`; proba `src/lib/emag/livrare.test.ts:26`]. Și la easySales o comandă poate fi Completed fără AWB: exemplul Complete Order are `"status": "Completed"` cu `"awb_id": null` [A].
- **Fără re-Save automat:** retrimiterea se face numai după un GET proaspăt care arată New sau Incomplete, fără AWB și fără factură.
- **Întoarcerea la Edinio** a unei comenzi refuzate se face numai după ce `GET ?order_display_id=` dovedește că easySales n-o are.
- **Ștampila stă în `order_source` și o scrie un BEFORE INSERT.** Outboxul trimite numai comenzi ștampilate. Plasa pentru comenzile fără rând rulează la 10 minute, nu zilnic. `deriveOrigin` ignoră cheia nouă; altfel „Magazin online” ar deveni „Direct”. Ștampila nu se pune pe ridicarea personală și pe curierul propriu (§3.5, D27) și nici pe comenzile „ES-…” din E4 (§3.4).
- **Porțile acoperă toate intrările de factură**, inclusiv cele manuale și lotul, cu probă de recensământ:
  - `generateOrderInvoice` și `convertEstimateToInvoice` [C: `src/lib/actions/smartbill.actions.ts:834`, `:971`];
  - `generateOblioInvoice` [C: `src/lib/actions/oblio.actions.ts:722`];
  - `generateFgoInvoice` [C: `src/lib/actions/fgo.actions.ts:499`];
  - `bulkGenerateInvoices` [C: `src/lib/actions/bulk-orders.actions.ts:314`];
  - factura automată [C: `src/lib/actions/invoice-auto.actions.ts`].
- **Anularea din contul cumpărătorului** se oprește chiar în funcția SQL `cont_anuleaza_comanda`, nu doar în TypeScript.
- **Tranzițiile nu trimit emailuri tranzacționale.**
  - `aplica_tranzitia_comenzii` nu cheamă nimic în afară [C: verificat în producție].
  - `updateOrder` cheamă explicit, după RPC, `raporteazaRambursareaGa4` și emailul [C: `order.actions.ts:2696`, `:2775`, `:2790`]. `tranzitieComandaMarketplace` cheamă doar RPC-ul [C: `tranzitie-marketplace.ts:182`].
  - La noi, rambursarea GA4 se cheamă explicit, iar emailul numai după D5.
  - **Marketingul pleacă însă singur.** Declanșatorul `email_marketing_la_schimbare` (AFTER UPDATE OF status, payment_status pe `orders`) pune evenimente în `email_marketing_coada`: plătită, expediată, livrată, anulată și rambursată. O face pentru magazinele cu Mailchimp, Brevo sau Klaviyo pornite. Sare numai peste comenzile cu `order_source.marketplace` nevid [C: baseline 7310-7392, 13902].
  - Tranzițiile venite din easySales pe comenzile vitrinei ajung deci acolo, ca azi cele făcute de mână. Comenzile „ES-…” din E4 nu ajung.
  - Un flux al comerciantului din acele programe poate scrie cumpărătorului la aceste evenimente. De aceea D5 îl numără printre notificări.
- **Declanșatorul de pe `products`** prinde INSERT, UPDATE și DELETE și are bloc de excepție, fiindcă stă pe drumul checkout-ului. Modelul About You (AFTER UPDATE OF, fără excepție) nu ajunge.
- **Zăvorul de emitere** ține cont de versiunea văzută (`p_versiune_vazuta`), nu doar de faptul că zăvorul e liber.
- **Stocul trimis** are două formule scrise dinainte. E înseamnă stocul din Edinio. M-STOC-1 alege formula potrivită:
  - (a) dacă easySales își scade copia la o comandă: max(0, E - Z_ext). `Z_ext` sunt vânzările externe văzute și încă neconsumate în Edinio;
  - (b) dacă easySales doar rezervă: E plus rezervările lor pentru comenzile deja consumate în Edinio și încă nefinalizate la ei. Edinio le știe din `easysales_comenzi`.
  
  Centrul de ajutor descrie modelul (b) (IPOTEZĂ):
  - la intrarea unei comenzi, easySales rezervă cantitatea pe toate canalele, cât timp comanda nu e anulată, finalizată sau facturată;
  - rezervarea dispare la finalizare (generarea AWB-ului finalizează comanda) sau la factură;
  - scăderea efectivă se face „la finalizare” sau „la facturare”, după o setare introdusă în 10.2025, plus bifa „Scade stocul la emiterea unei facturi noi”.
  
  De ce contează alegerea:
  - formula (a) aplicată pe un model cu rezervare scade aceeași bucată de două ori. Înainte de consum, Edinio trimite E-1, iar rezervarea mai scade 1, deci ofertele văd E-2. După consum, E-2 rămâne până la AWB sau factură, la fiecare vânzare externă. Fără `Z_ext`, rezervarea singură dă exact E-1 până la consum;
  - M-STOC-1 măsoară separat comanda de vitrină trimisă prin API și comanda de marketplace, sub ambele setări de scădere (ES-22);
  - împingerea vine după citirea comenzilor externe;
  - regula derivei („numai în jos, niciodată în sus fără explicație”) se revizuiește după măsurătoare. Dacă easySales își scade copia la finalizare sau la factură, regula poate fixa o sub-numărare produsă chiar de easySales.
- **Comenzile externe modificate sau onorate de alții:** liniile schimbate după consum se ajustează cu `ajusteaza_stoc_comanda_marketplace`, ca la eMAG și Pepita. Comenzile onorate de marketplace sau de un 3PL nu consumă, ca FBE la eMAG (§3.1, ES-20, ES-21).
- **Citirile țintite și deriva** merg pe `GET /products?website=&sku=`, nu pe `/products/stock/list`, care n-are filtru de website [A].
- **La 401:** cel mult o reemitere automată la 10 minute. Două revocări neexplicate în 24 de ore duc la `needs_reconnect`. Evităm astfel atât tokenul mort fără reacție, cât și ping-pongul.
- **Webhook-uri:** nu se deduplică definitiv după conținut. Evenimentul cu jeton bun și semnătură rea se păstrează, cu alarmă. Comenzile nu se recunosc niciodată după câmpul `website`.
- **Atribuiri corectate:**
  - dovada de upsert vine de la caracteristici, nu de la categorii;
  - 422 la duplicat e documentat la produse, caracteristici și comenzi, nu și la categorii;
  - documentația cere ca orice categorie și orice caracteristică referite de un produs să existe înaintea lui: „To attach a characteristic or a category to the product, you must first create that category or characteristic using the proper endpoints” [A: dosarul Products]. Ordinea dintre categorii și caracteristici nu e cerută. „Întâi categoriile, apoi caracteristicile” (§5.4.5) e alegerea noastră;
  - documentația se contrazice la categoria obligatorie. Dosarul Categories cere ca fiecare produs să fie atașat unei categorii: „Each time you define a product, you must assign it to one of your product categories” [A]. Tabelele Add, Save și Update dau însă `categories` cu Required False, iar corpurile brute ale cererilor trimit `"categories": []`; exemplele de răspuns salvate au în cerere `[14]` [A]. Nu e documentat ce răspunde API-ul la un produs fără categorie sau cu o categorie inexistentă: 422 sau ignorare. Se măsoară în M-PROD-3. Ordinea rămâne o practică sigură, nu o cerință absolută;
  - `supplier_sku` e în tabelul Save;
  - răspunsul cu SKU eșuate e exemplificat la două rute, amândouă pe HTTP 200: `/stocks/bulk` (`errors` și `error_messages`) și `/products/archive/bulk` (`not_found` și `blocked`). La `/products/prices/bulk`, exemplul are `errors` gol, deci acolo eșecul pe SKU e nedocumentat;
  - asimetria brut/net nu e scrisă în text. Documentația spune doar că prețurile trimise sunt cu TVA („including VAT”, „with vat” [A]). O susțin însă toate exemplele care arată prețul [A]:
    - la Add, Save și Update, 150 trimis apare „126.05”, adică 150 / 1,19;
    - exemplul Update Prices Bulk corespunde integral cererii: 250 devine „210.0840”, la `tax_rate` „19.00”;
    - o parte din exemplele GET dau un net care, înmulțit cu (1 + cotă), dă un brut rotund (20,00 și 1.999,00 la 19%; 189.990,00 și 1,00 la 27%); altele nu (19,12 sau 125,20 la 19%), iar la 0% netul e chiar brutul, deci nu dovedește nimic.
    
    Nepotrivirile din exemple (categorii, caracteristici, `acquisition_price`) nu ating prețurile. M-PROD-4 confirmă mai ales rotunjirea (2 zecimale la Add, Save și Update, 4 la Prices Bulk și GET, văzute numai în exemple, nescrise ca regulă) și cota 0;
  - `read-offers` intră în lista de scope-uri;
  - încărcarea AWB primește curierul doar ca text, în `courier_name`: „Optional field, used for informational purposes” [A]. Atașarea îl arată tot ca text în `courier_name`, dar numai în exemple. N-are tabel de câmpuri, deci acolo nu e documentat nici că e opțional, nici că e informativ. La atașare îl trimitem mereu. M-AWB-1 măsoară ce `shipments[].courier {id, name}` rezultă din text. Exemplele arată doar FanCourier (4); că un AWB încărcat apare drept „Manual” (13, valoare din lista filtrului `courier_id`) e IPOTEZĂ.
- **Exclusivitatea canalelor** începe din E2, în ambele sensuri, nu abia din E4.
- **Datele minime** ale comenzilor externe nu pun niciodată `null` pe o coloană NOT NULL [C: `information_schema.columns`, producție]:
  - `customer_name` și `customer_phone` sunt text NOT NULL, fără valoare implicită, deci primesc `''`;
  - `shipping_address` e jsonb NOT NULL, deci primește un obiect (`{}` sau unul cu cheile goale), nu un șir;
  - `customer_email` și `billing_company` acceptă `null`; o coloană `billing_address` nu există.
  
  O inserare respinsă devine o vânzare blocată și semnalată, niciodată una sărită fără urmă.
- **WebP:** conversia existentă `imaginiPentruEmag` [C: `src/lib/emag/imagini.ts:192`, chemată azi din `src/lib/emag/trimite.ts:701`] se cheamă așa cum e, fără mutarea modulului eMAG. Ea nu produce WebP, ci îl transformă:
  - convertește WebP, și orice format pe care eMAG nu-l primește, în JPEG, sau în PNG când imaginea are transparență;
  - urcă derivatul pe R2 [C: antetul fișierului, r. 4; r. 175];
  - păstrează ordinea pozelor, iar ce nu reușește iese în `nereusite`.
  
  Dacă easySales primește WebP direct se măsoară în M-PROD-5 și se întreabă în ES-17.
- **Ipotezele sunt declarate ca atare:** independența dintre E2 și E3 (M-COM-9), posibilitatea E4 (M-EXT-1) și, odată cu ea, rostul lui E3 (§3.1), plus modelul de stoc al easySales (M-STOC-1).
## 4. Conectarea comerciantului

### 4.1 Pașii în easySales (căile din ghid, IPOTEZĂ; capturile se fac în E0)
1. Integrări → Magazine (în interfața engleză, Integrations → Websites) → Conectare Website. Se completează formularul:
   - nume „Edinio <magazin>” și adresa magazinului;
   - România / RON / RO. Țara, limba și valuta nu se mai pot schimba după creare;
   - TVA și TVA transport ca în magazin (0 la neplătitori). Țara stabilește cotele permise;
   - „Status custom pentru comanda nouă”: gol. Planul se sprijină pe statusurile New și Incomplete (§5.1.5, §5.3). Dacă statusul custom inițial se aplică și comenzilor venite prin API, și ce schimbă, e întrebarea ES-31;
   - „Sursă stoc produse: Website” (implicitul lor e easySales);
   - „Tip de pachet implicit”, folosit la generarea AWB-urilor în easySales;
   - seria de facturi, folosită când comanda nu aduce una.

   Apoi se alege blocul API → „API V2”. Pasul „Configurare” arată **website token-ul** (60 de caractere în exemple [A]), iar „Salvare” creează website-ul. Tokenul rămâne apoi pe cardul website-ului (ghid).
2. Setări → Setări API (`https://easy-sales.com/api-settings` [A]; așa în ghidul din 09.2026, articolul vechi spunea Cont → Setări → butonul „API”) → client nou de tip „Website Grant”, numit „Edinio <magazin>”. Se copiază **ID Client** (UUID de 36 de caractere în exemple [A]) și **Secretul** (40 de caractere [A]).
3. Notificările către cumpărători și fluxurile automate pentru acest canal se setează după D5 și ES-10. La pilot, fluxurile automate de factură și AWB rămân oprite până la proba cap la cap. Dacă ES-10 arată că ele nu se pot opri pe website, rezerva sunt pârghiile documentate:
   - `PATCH /api/v2/orders/{internal_id}/custom-status` [A: cere `update-orders`];
   - etichetele: `POST /api/v2/tags/attach` și filtrele de comenzi `tags` și `has_tags` [A];
   - statusul custom inițial din formular, după răspunsul la ES-31.

**Limita de produs:** precondiția „Sursă stoc produse: Website” îi exclude pe comercianții care își țin stocul în alt sistem legat de easySales (SmartBill, Oblio, un ERP). Cu modul B amânat, ei nu au niciun drum în v1. De spus explicit la D1 și D3.

### 4.2 Pașii în Edinio: o acțiune în două trepte
**Treapta A, „Verifică datele”**
1. Garda de proprietar, plafonul durabil `consuma_limita` [C: prin `consumaLimita`, `src/lib/utils/limita-durabila.ts:36`] și întrerupătorul `EASYSALES_LIVE` (administratorii trec).
   - Nu există o gardă comună. Fiecare fișier `*.actions.ts` are propria `async function guard(businessId)`, locală, neexportată și cu alt tip întors: `{supabase, userId, biz}` la marketplace-uri, `{ok: true}` la `gpsr` și `cont-client`, `{userId}` la `woot-lot` [C: în `src/lib/actions/`, `trendyol.actions.ts:61`, `emag.actions.ts:98`, `aboutyou.actions.ts:64`, `gpsr.actions.ts:15`, `cont-client.actions.ts:36`, `woot-lot.actions.ts:99`].
   - `easysales.actions.ts` își scrie garda după modelul Trendyol [C: `trendyol.actions.ts:61-68`]. O gardă comună ar fi o lucrare separată.
2. Verificarea formei câmpurilor (lungimile din exemple dau doar avertisment) și a precondițiilor magazinului, înaintea oricărui apel către easySales:
   - moneda magazinului e RON [C: `store_settings.currency`, citită deja la Pepita, `src/lib/actions/pepita.actions.ts:1055-1057`]; altfel conectarea se refuză (propunerea pentru D29). Moneda website-ului nu se poate citi din API: `websites/list` n-o are, iar `GET /account` are doar `preferred_currency`, la nivel de cont [A]. Rămâne bifa din Treapta B;
   - la un plătitor de TVA (`vat_enabled`), `vat_rate` e o cotă legală azi: 21, 11 sau 0. Altfel conectarea se refuză, cu trimitere la Setări, fiindcă cota pleacă pe fiecare produs (§5.4.4). Ce cote acceptă un website RO măsoară M-PROD-4 (ES-7).
3. Garda „un cont, un magazin”, înaintea emiterii.
   - De ce: un client API folosit de două magazine s-ar revoca reciproc. Documentația spune „one token per client” [A]. Dacă regula se aplică și pe perechea client-website, măsoară M-AUTH-2 (ES-1). Un website legat de două magazine ar amesteca două cataloage.
   - Conflictul există dacă **oricare** dintre cele două identități e deja la alt magazin conectat: `client_id` sau amprenta `website_token`. O cheie compusă ar prinde numai potrivirea pe amândouă.
   - `refuzaContFolositDeAltMagazin` se extinde, dar nu printr-un simplu adaos de configurare. Garda compară identități normalizate; o amprentă propriu-zisă există azi doar pentru cheia About You [C: `src/lib/integrari/cont-marketplace-unic.ts:41-43`, `:75-76`]. Se lărgesc tipul închis `Marketplace` (`:27`), înregistrările `NUME` (`:29-31`) și `SELECTII` (`:90-98`) și mesajul, care azi vorbește de un „cont de vânzător” (`:33-35`).
   - Pentru două identități se schimbă și forma parametrului `identitate`, care duce azi un singur `id` și o `tara` opțională (`:110`), și `identitateNormalizata` (`:46-55`), care compune o cheie doar la eMAG (`id@tara`).
   - `SELECTII` citește numai configurările cu `->>connected = 'true'` (`:120`), deci `easysales_config` are câmpul `connected` (§4.4). Garda cade închis la eroare de citire (`:104-105`, `:122-128`).
4. Înainte de apăsare, omul vede avertismentul: „Dacă acest client API e folosit de alt program, acela va fi deconectat.”
5. Emiterea sub zăvor (§4.5), cu lista de scope-uri din §4.3. Documentat e numai cazul `website_token` lipsă: 400 `invalid_request`, cu `hint` „Check the `website_token` parameter” [A]. Mesajul se traduce pe câmpul vinovat; celelalte forme de eroare, după M-AUTH-4.
6. `GET /api/v2/account` [A: răspunsul are `company_name`, `vat_id`, `has_active_subscription`, `is_trial`, `expire_date`, `current_orders`, `max_orders`].
   - Ce primește un token al grantului website e nedocumentat (IPOTEZĂ, M-AUTH-5). Endpointul n-are descriere și nici scope documentat. Lista n-are un scope de citire a contului, doar `update-account`, iar singurul exemplu e un 200 [A].
   - De aceea `/account` nu e o condiție a conectării. Un 401 sau un 403 aici se tratează la fel, fără să presupunem care apare: datele contului rămân „necunoscute” în panou, iar pasul 7 arată dacă tokenul merge.
   - `vat_id` se compară cu CUI-ul magazinului, după normalizare (fără prefixul RO și fără spații). CUI-ul stă numai în `businesses.cui`; `store_settings` n-are coloană de CUI. E completat la 23 din 146 de magazine (19 din cele 77 publicate), cu formă mixtă: 7 au prefixul RO, iar 2 nu sunt simple cifre, cu sau fără RO [C: producție, 12.10.2026]. Avertismentul are deci trei forme: potrivire, nepotrivire și „CUI lipsă în Edinio, comparația nu se poate face”.
7. `GET /api/v2/websites/list` [A: o frază de descriere, „Retrieve a list of user websites.”, și scope-ul `read-websites-list`; câmpurile apar numai în exemplu]. Întoarce pentru fiecare website `name`, `url`, `module_version` și `status`. În singurul exemplu, ambele intrări au `"status": "active"`, inclusiv una fără adresă și fără modul.
   - IPOTEZE, măsurate în E0 (dezactivezi website-ul de probă și citești lista): ce înseamnă `status` (oglindește comutatorul Activ?), ce alte valori are și dacă un website dezactivat rămâne în listă cu altă valoare sau dispare.
   - Până atunci, numai numele nostru prezent cu `status` exact `"active"` înseamnă „activ”. Orice altceva (numele lipsește, altă valoare, câmpul lipsește) e „neconfirmat activ”, nu „dezactivat” sau „șters”: numele e singura cheie, iar lipsa lui poate fi o redenumire. Semnalul de dezactivare rămâne 403 „The website has been deactivated” (IPOTEZĂ, ghid).
   - Tot aici, proba de contract: lista din `GET /api/v2/delivery-statuses` [A] se compară cu enumul 1-7 cablat în `stari.ts` (§5.2). O diferență nu oprește conectarea; se notează în jurnal și apare în panou.
8. Secretele și tokenul se salvează cu `connected: false`, prin `jsonb_merge_config` (§4.4), iar omul primește lista tuturor numelor, cu `status`-ul lor.

**Treapta B, „Alege website-ul și conectează”**
1. Poarta „website gol”.
   - Întâi proba filtrului: `GET /api/v2/products?website=<un nume sigur inexistent>` trebuie să întoarcă zero produse. Dacă nu, filtrul e ignorat sau parțial, iar poarta nu mai spune nimic (un filtru ignorat ar refuza pe oricine). Conectarea se oprește atunci cu mesajul „Nu putem verifica website-ul; scrie-ne la suport”.
   - Apoi `GET /api/v2/products?website=<nume>` trebuie să întoarcă zero produse. Filtrul după nume e documentat [A], dar strictețea lui nu (IPOTEZĂ, M-PROD-7). Răspunsul se refiltrează oricum local, cu egalitate exactă pe `website.name` [A: câmpul apare în exemplul List products]. Partea despre `?website=` din M-PROD-7 se măsoară în E0, nu în E3, fiindcă poarta stă în E1.
   - Excepție face reconectarea la același website: toate produsele găsite sunt ale noastre, după doi martori (`product_website_id` și `sku`) din `easysales_produse`. Amprenta `website_token`, păstrată după deconectare, e doar un indiciu, fiindcă „Reîmprospătare Token” o schimbă.
   - Altfel, refuz: „Folosește un website API V2 nou, creat numai pentru Edinio.”
2. Declarația canalelor vândute prin easySales și poarta de exclusivitate (§4.9).
3. Bifele: „Sursa de stoc a website-ului e Website”, „Clientul API e folosit numai de Edinio”, „Website-ul e creat în RON” (moneda nu se poate citi din API) și „«Status custom pentru comanda nouă» e gol”.
4. Garda din pasul A3 se rulează din nou, fiindcă între trepte rândul nostru are `connected: false` și nu e văzut de garda altui magazin. Apoi `website_nume` și `connected: true` se scriu într-o singură îmbinare.
5. Abonarea webhook-urilor și evenimentul de probă (§6.7). Un eșec aici nu anulează conectarea, dar apare în panou.
6. Nu pornește nimic automat: comenzile, catalogul și stocul au fiecare comutatorul lor, stins.

**Ce urmează din alegerea numelui**
- `website_nume` e singura cheie a website-ului la citire, în filtrele `?website=` [A: `websites/list` n-are id și nici token]; la scriere, website-ul țintă îl alege `website_token` din corp [A]. Din listă se vede că numele lipsește, dar nu se poate deosebi un website redenumit de unul șters (nici `url` nu e o cheie sigură: poate fi `null` [A]). Legătura dintre `website_token` și numele ales nu se poate dovedi la conectare; o confirmă prima potrivire din verificarea catalogului (§5.4.5).
- O redenumire în easySales rupe filtrele `?website=`. Verificarea zilnică o vede ca „neconfirmat activ”, iar omul alege din nou numele în panou, fără reemitere. Orice retrimitere în masă (catalog, stoc) începe cu verificarea că `website_nume` e încă în `websites/list`; altfel, pauză și notificare.
- Un comerciant care vinde deja prin easySales de pe alt website (WooCommerce, Gomag) are ofertele legate de produsele acelui website. Cum se mută ele pe produsele Edinio nu e documentat (ES-24). Vânzările de pe website-ul vechi cu aceleași SKU-uri nu trec de regula „doi martori” (§5.6), deci nu scad stocul Edinio; ce facem cu ele hotărăște D32.

### 4.3 Grantul și scope-urile
- **Grantul `website`** nu cere redirect și nici parola contului [A: Website Grant]. Tokenul se reemite fără om, din trei valori păstrate: `client_id`, `client_secret` și `website_token` [A: corpul Website Grant].
  - Reemiterea merge numai cât toate trei sunt valabile: clientul există, cu același secret, iar website-ul există și tokenul lui n-a fost reîmprospătat. După ghid, website token-ul nu expiră și ține până la apăsarea butonului „Reîmprospătare Token” sau până la ștergerea website-ului (IPOTEZĂ). După oricare dintre aceste două acțiuni, omul lipește tokenul nou (§4.6).
  - „Oricând” are două limite. Endpointul de token primește 60 de cereri pe minut (ghidul și proba curl, §2.5; antetele exemplelor din 2020 nu sunt dovadă, fiindcă aceeași valoare 60 apare atunci pe toate rutele [A]). Fiecare reemitere revocă tokenul în uz [A], deci reemiterile se fac numai pe rând, sub zăvor (§4.5).
  - Efectul asupra grantului al unui website dezactivat, al unui cont suspendat sau fără abonament și al ștergerii clientului nu e documentat (M-AUTH-4).
- **Toate scope-urile se cer din prima.**
  - Documentat: există un singur token pe client, iar un token nou îl revocă automat pe cel vechi [A: dosarul Authentication]. Că regula se aplică oricare ar fi motivul (un scope nou, o reemitere cu aceleași scope-uri, un refresh, două emiteri concurente) e lectura noastră, nescrisă de ei. Planul o tratează ca adevărată, fiindcă e varianta prudentă (M-AUTH-1, M-AUTH-3).
  - Dedus, nedocumentat: scope-urile se trimit numai la emitere și niciun endpoint nu le schimbă pe un token existent. Deci un scope în plus cere, probabil, un token nou.
  - Lista oficială are 32 de scope-uri [A: Available Scopes]. Legătura dintre rută și scope e scrisă explicit numai la câteva rute: `update-products` la arhivare, `update-orders` la statusul custom, `read-orders` la lista statusurilor custom [A]. Restul se potrivește „după nume” (§12).
  - Lista cerută, pe roluri:
    - catalog (E3): `read-products add-products update-products read-categories add-categories update-categories read-characteristics add-characteristics update-characteristics`;
    - comenzi (E2, E4): `read-orders add-orders update-orders`. `read-orders` se cere anume: exemplele de pe `/oauth/token` nu-l conțin, dar ghidul oficial îl cere grantului website, iar exemplul de login pe sub-cont îl are în `scope` [A];
    - stoc (E4): `update-stock` și `read-fulfillment-services`, pentru `GET /api/v2/fulfillments/list`, ca o comandă onorată de marketplace sau de un 3PL să nu consume stocul Edinio (§5.6, ES-20);
    - conexiune și sănătate (E1): `manage-webhooks read-websites-list read-marketplaces-list read-couriers read-billing-software`;
    - etichete: `read-tags add-tags attach-tags detach-tags`, pentru o etichetă „Edinio” sau „plătită online” în filtrele automatizărilor lor (rezerva de la ES-10, §4.1);
    - extinderile (E5): `read-offers update-delivery-status add-order-returns`;
    - numai dacă D33 alege ștergerea prin API: `read-customers update-customers`. API-ul n-are DELETE pe clienți sau pe comanda întreagă [A], deci datele se pot doar suprascrie: `PATCH /api/v2/customers/{id}`, plus rutele `PUT` ale adreselor și ale comenzii, al căror scope nu e declarat (M-AUTH-5).
  - Lista e o constantă versionată în `constante.ts`. Dacă o etapă ulterioară o lărgește, cronul face o singură reemitere planificată, sub zăvor (§4.5). Un 403 nu declanșează niciodată reemiterea (§4.6).
- **Ce acceptă grantul website** e IPOTEZĂ (M-AUTH-5), mai ales pentru `manage-webhooks`.
  - Lista „Available Scopes” e una singură, fără nicio restricție pe grant. Toate exemplele de emitere (website, password, authorization code) cer numai scope-uri add- și update-. Rutele `/api/v2/webhooks` nu declară nici măcar că cer `manage-webhooks` [A].
  - Proba din E0: emiterea cu lista completă, decodarea JWT-ului și `GET /api/v2/webhooks`. Lista finală se fixează după ea, înaintea codului E1.
  - Dacă grantul refuză `manage-webhooks`, abonările nu se pot face cu tokenul nostru: un al doilea token pe același client l-ar revoca pe primul [A]. Rămân un client API separat pentru webhook-uri, cu alt grant, de hotărât atunci, sau sondarea fără webhook-uri (§3.6).
- **Scope-urile acordate.** Răspunsul documentat al `POST /oauth/token` are numai `token_type`, `expires_in`, `access_token` și `refresh_token`, fără `scope` [A: toate exemplele 200, din 2020, copiate între granturi].
  - Revendicarea `scopes` apare numai în JWT-ul-mostră din variabila de colecție `access_token`, decodat [A: 31 de scope-uri, fără `read-websites-list`]. Proveniența mostrei nu e declarată: `aud`-ul ei nu e niciun client din colecție, deci poate fi un Personal Access Token. Tokenurile din răspunsurile de emitere sunt tăiate după antet.
  - IPOTEZE (M-AUTH-1): tokenul grantului website poartă și el `scopes`; lista e cea acordată, nu cea cerută; JWT-ul e singurul loc din care se află.
  - După RFC 6749 (§3.3, §5.1), lipsa lui `scope` din răspuns înseamnă că s-au acordat exact scope-urile cerute. Pentru easySales asta nu e documentat.
  - De aceea revendicarea se citește fără verificare criptografică, numai ca informație afișată, alături de lista cerută. Lipsa ei înseamnă „necunoscut”, nu „fără drepturi”. Stabilitatea formatului e întrebarea ES-2.

### 4.4 Stocarea
- **Coloana:** `privat.store_settings.easysales_config jsonb not null default '{}'`, ca la `trendyol_config`, `emag_config`, `olx_config`, `aboutyou_config` și `pepita_config` [C: producție, `information_schema.columns`, 12.10.2026; aceeași formă în `migrations/2026-09-23-conturi-clienti-setarea.sql:17-18`].
  - Nu după modelul e-packet: `migrations/2026-10-07-epacket-curier.sql:66-67` creează coloana nulabilă și fără valoare implicită, ca la majoritatea curierilor și a programelor de facturare. Din migrația e-packet se copiază numai înscrierea în `privat.campuri_secrete` (`:75-77`) și regenerarea vederilor (`:79-80`).
  - `connected` e obligatoriu în obiect: garda „un cont, un magazin” citește numai configurările cu `->>connected = 'true'` [C: `src/lib/integrari/cont-marketplace-unic.ts:120`].
- **Secretele** se trec în `privat.campuri_secrete` și se criptează `enc.v1.`: `client_secret`, `website_token`, `access_token`, `refresh_token`, `webhook_secret` și, numai după D3, `pat` (§4.10). `access_token` e un JWT de ~1.731 de caractere în exemplu [A]. Lungimea variază (în exemplu, scope-urile stau în payload, alături de `jti`, `aud` și celelalte revendicări; deducție din structură), deci se ține ca text, fără o limită dimensionată după exemplu.
- **În clar:**
  - identitate: `client_id`, amprenta `website_token`, `website_nume`;
  - token: `token_versiune`, `token_emis_la`, `token_expira_la`, `emitere_pana`, `emitere_incercata_la`, `revocari_neexplicate`, `scopuri_cerute` (lista trimisă la emitere, cu versiunea ei, §4.3), `scopuri` (revendicarea din JWT; lipsa ei înseamnă „necunoscut”), `jwt_sub` (IPOTEZĂ, M-AUTH-1; dacă lipsește, cheia ritmului trece pe `client_id`, §5.0);
  - cont: firma, `vat_id`-ul easySales și rezultatul comparației cu CUI-ul (§4.2, pasul 6), abonamentul, proba, expirarea;
  - webhook: hash-ul jetonului din URL, `abonari{slug: id}`, modul semnăturii (`masoara`/`impune`), varianta potrivită;
  - stări: `connected`, `needs_reconnect`, `motiv_reconectare`, `pauza`;
  - comutatoarele `comenzi_active`, `catalog_activ`, `stoc_activ`, citite și de declanșatori;
  - setările din §7.4 și marcajele cronului.
- **După migrație, trei pași** [C: `migrations/2026-09-23-conturi-clienti-setarea.sql:7-15`, `:23-24`, `:42`]: `privat.reconstruieste_store_settings()`, `privat.reconstruieste_store_settings_upd()` și `notify pgrst`.
  - Fără primul, coloana nu se vede prin vederea `public.store_settings`, deci niciun cod nu o poate citi.
  - Fără al doilea, după comentariul din cod, declanșatorul INSTEAD OF rescrie rândul cu lista veche de coloane, iar valoarea coloanei noi se pierde tăcut la fiecare salvare a altei setări. Coloanele vechi se scriu în continuare. Dacă nepotrivirea numărului de coloane dă eroare sau trece tăcut nu s-a probat: verificarea a fost numai citire.
  - Migrația își dovedește singură că vederea poartă coloana, cu blocul `do $$ ... raise exception` din `2026-09-23-conturi-clienti-setarea.sql:31-40`.
  - **Efect secundar:** șablonul din `privat.reconstruieste_store_settings_upd()` nu conține apelul `privat.pazeste_secretele` [C: producție, `pg_get_functiondef`, 12.10.2026]. Fiecare rulare rescrie declanșatorul fără paza legată de `migrations/2026-09-28-paza-secretelor.sql:140-142`; au făcut-o deja migrațiile curiera (29.09) și e-packet (07.10). Migrația easySales nu agravează nimic, fiindcă paza lipsește deja, iar easySales nu scrie prin vedere. Refacerea pazei în șablon privește toate integrările și e o lucrare separată, de propus proprietarului.
- **Citirea:** secretele se citesc numai cu `createAdminClient()`, după garda din §4.2, pasul 1. `loadEasySalesConfig` aruncă la eroare de citire și nu întoarce `{}` [C: tiparul din `src/lib/actions/trendyol.actions.ts:102-109`].
- **Scrierea:** numai prin `jsonb_merge_config`, din panou, din cron și din webhook (în cod, `patchEasySalesConfig`; tokenul, prin `easysales_scrie_tokenul`, §4.5).
  - Funcția încuie rândul de bază (`for update`), îmbină peticul și criptează căile secrete: `null` scris anume pe un secret îl șterge, șirul gol îl păstrează [C: `migrations/2027-01-06-null-pe-un-secret-inseamna-sterge.sql:62-94`].
  - Hărțile se scriu întregi, fiindcă îmbinarea lucrează doar pe primul nivel (`v_curent || p_patch`, `:71`).
  - **Niciodată prin `update` pe vedere.** Vederea criptează (`cripteaza_rand`), dar în producție nu mai păzește secretele: `privat.store_settings_upd` nu mai cheamă `privat.pazeste_secretele` [C: producție, `pg_get_functiondef`, 12.10.2026; `migrations/2027-01-16-paza-secretelor-nu-mai-e-deschisa-tuturor.sql:31-34` o numește cod mort]. Un secret trimis gol prin vedere suprascrie credențiala existentă, cum ar face un `saveConfig` care scrie obiectul întreg [C: tiparul din `trendyol.actions.ts:111-123`]. Paza („șirul gol păstrează, `null` șterge”) există azi numai în `jsonb_merge_config`.
- **Browserul** nu primește niciodată configurarea, ci un obiect de stare construit pe server [C: tiparul `getTrendyolStatus`, `trendyol.actions.ts:183`, cu `maskSecret`, `:212`]. Câmpurile de secret folosesc componenta `Input` cu `type="password"`, care pune singură `autoComplete="new-password"` [C: `src/components/ui/input.tsx:37`].

### 4.5 Emiterea tokenului: zăvorul se pune înainte
Orice emitere pe același client revocă tokenul în uz, deci și pe cel folosit de alt fir [A: „Only one token per client can be created, when the new access token is generated the old one is revoked automatically”]. Un compare-and-set la scriere nu ajunge.
- La OLX, `olx_roteste_tokenul` încuie rândul (`for update`) abia la scriere, după apelul extern. Compară martorul `token_updated_at` cu valoarea văzută de fir înainte de apel și scrie prin `jsonb_merge_config` numai dacă martorul nu s-a mișcat; altfel întoarce `false`, iar pierzătorul recitește [C: `migrations/2026-12-21-olx-rotatia-tokenului-are-un-singur-castigator.sql:32-67`]. Tokenul nu se compară, fiindcă e criptat (`:19-23`).
- La easySales asta nu ajunge: două fire care emit în paralel se revocă reciproc chiar dacă scrierea are un singur câștigător, iar tokenul scris poate fi tocmai cel revocat. De aceea zăvorul se ia înaintea apelului:
  - `easysales_ia_emiterea(p_business, p_versiune_vazuta, p_lease_sec)` ia `for update` pe rândul de configurare. Reușește numai dacă `token_versiune` e cea văzută de apelant și zăvorul e liber sau expirat. Pune `emitere_pana = now() + 30 s` și `emitere_incercata_la`.
  - Numai câștigătorul cheamă `/oauth/token`, cu termen de 20 s.
  - `easysales_scrie_tokenul(p_business, p_versiune_vazuta, p_patch)` scrie tokenul și `scopuri_cerute` prin `jsonb_merge_config`, mărește `token_versiune` și golește zăvorul. Întoarce `false` dacă versiunea s-a mișcat; atunci se scrie un jurnal critic.
  - Pierzătorii așteaptă cel mult 10 secunde și recitesc. Cache-ul din proces se cheie cu `cheieToken([client_id, website_nume], [client_secret, website_token, token_versiune])` [C: `src/lib/integrari/cheie-token.ts:44`].
- Zăvorul stă pe rândul magazinului. El ține loc de zăvor pe `client_id` numai fiindcă garda „un cont, un magazin” (§4.2, pasul 3) nu lasă același client pe două magazine.
- Dacă emitentul moare după apel, tokenul nou rămâne la ei. Următorul refuz de autentificare (401, după M-AUTH-1) se explică prin `emitere_incercata_la` recentă și duce la o reemitere care nu se numără ca revocare din afară.
- Proba: două fire concurente fac exact o cerere la `/oauth/token`, numărată de serverul fals (§9.2).

### 4.6 Reînnoire, refuzuri, revocare
- **Reînnoirea:** un cron zilnic reemite tokenul prin grantul website, sub zăvor, când mai sunt cel mult 30 de zile până la `token_expira_la` (tokenul ține un an [A]). Reemiterea cere website token-ul încă valabil (§4.3). Omul e anunțat (la 30 și la 7 zile) numai dacă reînnoirea automată a eșuat.
- **401:**
  - Documentat e doar rândul generic „401 | Unauthorized | No valid Access token provided.” [A]. Colecția n-are niciun exemplu 401, deci nici corp. Că un token revocat prin emiterea altuia primește 401 e IPOTEZĂ (M-AUTH-1: emiți tokenul A, apoi B pe același client, apoi faci o cerere cu A), sprijinită de tabelul ghidului („401: token de acces greșit sau expirat”). La 401, tokenul se tratează ca invalid, fără să se presupună forma corpului. Dacă M-AUTH-1 arată alt cod, regulile de mai jos se mută pe el;
  - dacă tokenul folosit era mai vechi decât cel din configurare, cererea se reia cu cel nou, fără emitere;
  - altfel se face cel mult o reemitere sub zăvor la 10 minute pe magazin, urmată de o singură reluare;
  - o revocare neexplicată (fără emitere proprie în ultimele 10 minute) se notează. A doua în 24 de ore pune `needs_reconnect`, cu mesajul „Clientul API e folosit și de alt program; creează în easySales un client dedicat Edinio”;
  - un refuz de credențiale la emitere pune `needs_reconnect` și trimite o notificare. Numai formele recunoscute din M-AUTH-4 duc acolo (secret greșit, website token reîmprospătat sau șters, client șters). Un 400 venit dintr-o greșeală a noastră nu trimite omul să reconecteze: e lecția OLX, unde numai `invalid_grant` duce la reconectare [C: `src/lib/olx/ce-a-reusit-la-ei-se-scrie-si-la-noi.test.ts:106-115`];
  - o pană a noastră (bază, rețea, 5xx) sau o cursă pierdută nu pune niciodată `needs_reconnect`. Azi regula e probată numai la OLX: cursa pierdută și martorul necitibil nu declară sesiunea moartă [C: `src/lib/olx/ce-a-reusit-la-ei-se-scrie-si-la-noi.test.ts:117-153`, `src/lib/olx/ce-se-intampla-cand-numai-jumatate-reuseste.test.ts:239-275`]. Pentru easySales se scrie o probă proprie, pe bază, rețea, 5xx și cursă;
  - `refuzul-tokenului-ramane-refuz.test.ts` probează altă regulă: la FedEx, UPS și Shipo, un refuz de autentificare dă `esuat` în registrul de operații, iar o cădere de rețea pe cererea propriu-zisă dă `necunoscut` [C: `src/lib/integrari/refuzul-tokenului-ramane-refuz.test.ts:90-117`]. Fișierul nu pomenește `needs_reconnect`.
- **403:**
  - Tabelul generic spune: „Authorization will not help and the request SHOULD NOT be repeated” [A, șablon preluat din RFC 2616]. Aceeași documentație dă însă 403 și când tokenului îi lipsește scope-ul `update-products` sau când `website_token` e invalid [A: Archive product]. Ghidul declară 403 „Invalid website token” pentru orice scriere; scope-ul lipsă e scris numai la Archive product. În aceste cazuri, o autorizare nouă ajută.
  - Regula noastră: un 403 nu se repetă neschimbat și automat. Cererea se reia numai după ce cauza e reparată. Niciun 403 nu declanșează o reemitere: ea ar revoca tokenul în uz [A], iar 403-ul are și alte cauze.
  - Clasificarea se face după textul mesajului, în ordinea:
    1. „Orders limit exceeded.” (IPOTEZĂ, ghid): documentat doar pe pagina Website errors, cu codul HTTP nedocumentat, care poate fi chiar 403. Duce la starea `blocata_plafon` din §5.1.6, fără fluxul de token;
    2. „The website has been deactivated” (IPOTEZĂ, ghid): pauză, cu notificare;
    3. „Invalid website token”: `needs_reconnect`, iar omul lipește doar website token-ul nou. Codul 403 pentru un `website_token` invalid e documentat [A: Archive product]; textul vine din ghid (IPOTEZĂ). Că exact el apare după „Reîmprospătare Token” (în engleză, Refresh Token; eticheta reală se vede în capturile din E0) e o deducție: ghidul spune doar că valoarea veche primește 403. La `POST /oauth/token`, un website token vechi are un răspuns nedocumentat (singura eroare documentată e 400, pentru tokenul lipsă [A]). Schimbul de token se tratează deci separat (M-AUTH-4), inclusiv dacă tokenul de acces emis din valoarea veche mai merge;
    4. scope lipsă (textul, din M-AUTH-4): operația rămâne în coadă. Dacă tokenul salvat a fost emis cu o listă mai veche decât cea din cod, o repară reemiterea planificată din §4.3. Altfel e definitiv, cu jurnal critic (M-AUTH-5);
    5. orice alt 403: definitiv pe element, cu jurnal și mesaj după text, fără să fie prezentat ca „parolă greșită”. Aici intră resursa altui cont și statusul nepermis unui sub-cont [A: Archive product, respectiv Update custom status; fiecare e scris la o singură rută].
  - Textele exacte vin din M-AUTH-4. Clasificatorul se probează pe textele reale strânse în E0, fără nicio reemitere la 403.
- **Revocarea:** colecția nu documentează niciun endpoint de revocare [A: dosarul Authentication are numai `POST /oauth/token`, cu patru granturi, și `POST /api/v2/account/sub-account/login`; dosarul „Personal Access Tokens” n-are nicio cerere].
  - Pentru tokenul de acces, singura revocare documentată e implicită: un token nou îl revocă pe cel vechi, dar rămâne el viu, deci nu deconectează [A]. Pentru website token, ghidul descrie și o invalidare explicită: după „Reîmprospătare Token”, valoarea veche primește 403. Interfața mai are o etichetă „Revoke”, cu efect nedescris.
  - Că pe server n-ar exista o rută de revocare nu scrie nicăieri (IPOTEZĂ, ES-2).
  - La deconectare, Edinio șterge local tokenul, `refresh_token`-ul, secretul și website token-ul (§4.8). Omului i se cere să șteargă clientul sau să apese „Revoke” în Setări API. Și asta e IPOTEZĂ: colecția nu spune ce face ștergerea clientului, iar eticheta „Revoke”, lângă „Authorized Applications”, apare numai în textele interfeței easySales, nu în dosarul A.
- **Contul easySales:** `GET /account` rulează zilnic, dacă tokenul nostru îl poate citi (M-AUTH-5). `has_active_subscription: false` sau un `expire_date` apropiat aduc banner și notificare [A: câmpurile]. `account-suspended` pune pauză (cozile se opresc, dar nu se golesc), iar `account-activated` reia lucrul numai după o recitire reușită, fiindcă webhook-ul e doar un semnal (§3.4). Payload-urile lor nu au exemple [A]; ce întoarce API-ul unui cont suspendat se află din M-ACC-1 și ES-14.

### 4.7 „Testează conexiunea”
- **Nu emite token**, fiindcă orice emitere revocă tokenul în uz [A]. Folosește tokenul salvat și verifică:
  - `GET /account`, dacă tokenul nostru îl poate citi (M-AUTH-5);
  - `GET /websites/list`: numele nostru e prezent, cu `status` exact `"active"`. Orice altceva se arată ca „neconfirmat activ”, nu ca „dezactivat” sau „șters” (§4.2, pasul 7);
  - `GET /webhooks` (pe fiecare abonare, `details.result.success`, `status_code`, `attempt_nr` [A]);
  - ultimul eveniment primit în inbox.
- Verdictul se citește „pe dos”: eșec numai la un refuz de autentificare dovedit (401, după M-AUTH-1). Un 403 se explică după clasificarea din §4.6, iar rețeaua sau 5xx înseamnă „nu am putut verifica acum”.
- **„Trimite un eveniment de probă”** cheamă `POST /api/v2/webhooks/{id}/trigger` [A], cu id-ul abonării (`data.id` salvat la abonare, nu slug-ul) și fără corp. Documentația spune doar „Trigger a webhook. This method may be used for testing.”, iar exemplul de răspuns e 200 `{success: true, message: "Success", data: []}`, același plic ca la DELETE [A].
  - Că 200 arată doar primirea cererii e IPOTEZĂ: nu se spune dacă declanșarea e sincronă sau pusă la coadă, nici dacă `success` privește livrarea. Livrarea se dovedește numai prin rândul din inbox, așteptat până la 30 de secunde, și prin `details.result` din `GET /webhooks`.
  - Ce payload pleacă și dacă se deosebește de un eveniment real e nedocumentat (M-WH-4); niciun marcaj de test nu e documentat. Până la măsurare, receptorul tratează apelul ca pe un eveniment real: verifică semnătura, e idempotent și nu schimbă nicio stare pe baza payload-ului. Proba: evenimentul de probă produce o singură recitire și nimic altceva.
  - Panoul arată și varianta de semnătură recunoscută (§6.3, §6.7).
- **Testul nu scrie nimic** în baza noastră: nici `needs_reconnect`, nici un marcaj de verificare.
  - Proba existentă nu dovedește asta. `proba-conexiune-nu-scrie.test.ts` verifică static că niciun panou `*ConfigClient.tsx` nu salvează configurarea înaintea testului [C: `src/lib/integrari/proba-conexiune-nu-scrie.test.ts:54-91`]. Nu verifică la rulare ce scrie acțiunea de test de pe server.
  - Proba citește numai `src/components/dashboard/*ConfigClient.tsx`, fără subdosare [C: `:28`, `:50-52`]. Panoul easySales stă în `src/components/dashboard/easysales/` (§7.2), deci proba nu-l vede.
  - Probe noi: acțiunea de test nu cheamă niciodată `/oauth/token` (recensământ, §9.2); rulată pe o bază falsă, acțiunea de test nu face nicio scriere; panoul easySales intră în proba statică, fie cu un nume `*ConfigClient.tsx` în `src/components/dashboard/`, fie cu proba lărgită la subdosar.

### 4.8 Pauza, deconectarea, reconectarea
- **Pauza pe magazin**, fără redeploy: nimic nu mai pleacă spre easySales; citirile și inboxul continuă.
  - Pauza pusă de om sau de schimbarea monedei pune întâi stocul pe 0 la ei, dacă bucla de stoc (E4) e activă (bifă implicită). Altfel marketplace-urile ar vinde pe stocul vechi. Pauzele venite de la ei (website dezactivat, cont suspendat) urmează regula opririlor neplanificate (§5.5).
  - Schimbarea monedei magazinului după conectare pune automat în pauză catalogul și stocul, cu notificare: moneda website-ului se blochează la creare (IPOTEZĂ, ghid), iar un catalog în altă monedă ar pleca într-un website în RON. Moneda se verifică la fiecare trecere a cronului, înaintea împingerilor.
  - Comenzile ștampilate așteaptă în coadă și pleacă la reluare. Panoul și notificarea pauzei le numără, cu butonul „Preia în Edinio”.
  - Pentru toate magazinele există o acțiune de admin care pune `pauza` pe toate configurările, prin aceeași îmbinare atomică. `EASYSALES_LIVE` rămâne comutatorul de lansare.
- **Comutatoarele:** stingerea lui `comenzi_active`, fără deconectare, oprește ștampila pentru comenzile noi. Comenzile deja ștampilate și netrimise trec la Edinio, ca la deconectare (pasul 5), cu notificare; cele trimise rămân la easySales.
- **Deconectarea:**
  1. Dacă E4 e activă, bifa „Pune stocul pe 0 în easySales înainte” e pusă implicit: `/stocks/bulk` cu 0 pe toate SKU-urile confirmate, verificat pe fiecare SKU.
  2. `DELETE /api/v2/webhooks/{id}` pentru fiecare abonare salvată, plus orice abonare din `GET /webhooks` al cărei `url` e adresa acestui magazin: ruta noastră și `businessId`-ul lui [A: `GET /webhooks` întoarce `url`]. Potrivirea numai pe domeniul nostru ar șterge abonările altui magazin Edinio de pe același cont. Proba cere ca această curățenie să șteargă numai adresa exactă a magazinului. Dacă M-WH-5 arată o singură abonare pe slug și cont, împărțită de magazinele Edinio ale contului, ea nu se șterge cât timp alt magazin de pe cont e conectat.
  3. Secretele devin `null` prin `jsonb_merge_config`, unde `null` scris anume șterge calea [C: `migrations/2027-01-06-null-pe-un-secret-inseamna-sterge.sql:82-86`], iar `connected` devine `false`.
  4. Tabelele de legătură rămân; altfel reconectarea ar naște id-uri noi și dubluri la ei.
  5. Comenzile ștampilate netrimise trec la Edinio (`stapan: "edinio"`), cu notificare. Cele trimise rămân blocate pentru factură și AWB din Edinio; deblocarea se face pe comandă, cu confirmarea omului („am verificat în easySales: comanda nu are factură și nici AWB”).
  6. Mesajul către om:
     - șterge clientul API din easySales sau apasă „Revoke” în Setări API (efectul nu e documentat, §4.6);
     - dacă ai dat și un Personal Access Token (§4.10), șterge-l, dacă niciun alt magazin Edinio de pe cont nu-l mai folosește;
     - produsele rămân acolo și se arhivează din interfața lor, dacă vrei;
     - datele cumpărătorilor trimise rămân în easySales; ștergerea lor urmează D33.
- **Reconectarea:**
  - pe același website: legăturile se refolosesc, iar poarta „website gol” lasă trecerea pe cei doi martori (§4.2, Treapta B);
  - pe alt website: articolele vii trec înapoi în starea `nou`, id-urile se refolosesc (sunt unice global), iar produsele de pe website-ul vechi rămân la ei;
  - rândurile `arhivat` nu se retrimit niciodată automat. La ei, produsele arhivate se șterg definitiv: articolul de suport „Arhivare produse” (08.2024) dă 30 de zile și cel mult 50 de produse dezarhivate în masă, iar ghidul „Cum arhivezi produse” (29.09.2026) dă o lună, fără plafon (ES-25). Ce face un Save pe un SKU arhivat sau deja șters e nedocumentat (ES-25, M-PROD-6).

### 4.9 Exclusivitatea canalelor (din E2)
- Un canal se vinde fie prin integrarea nativă Edinio, fie prin easySales, niciodată pe ambele. Altfel aceeași comandă ar intra pe două drumuri: s-ar procesa de două ori (factură, AWB), iar din E4 aceeași vânzare s-ar consuma de două ori din stocul Edinio (deducție, riscul R12).
  - Precedentul cel mai apropiat e descris în antetul `cont-marketplace-unic.ts`, scris pe 25.09.2026 [C: `src/lib/integrari/cont-marketplace-unic.ts:5-14`]. Pe 11.09.2026, Okxi și VetDepo, conturi Edinio diferite, aveau aceleași chei Trendyol: cele 24 de comenzi au intrat în ambele magazine, iar stocul se împingea din două cataloage care se suprascriau reciproc.
  - Antetul nu spune că stocul s-a consumat de două ori. Spune că o comandă poate pleca de două ori și că împingerile se calcă reciproc.
- **Canalele, pe țară.** Colecția easySales arată explicit doar:
  - eMAG: `Emag` (1), `EmagHU` (6), `EmagBG` (7) [A: `GET /marketplaces/list`]. Că `Emag` e România se deduce din numele fără sufix și din adresa emag.ro;
  - OLX: `Olx` (11), `OlxBG` (13) [A];
  - Pepita, numai pentru Ungaria: `PepitaHU` (26) [A: o comandă exemplu și cheia `pepita_hu` din `/stats`].
  - Trendyol și About You nu apar nicăieri în colecție (IPOTEZĂ la nivel de API). Pentru Trendyol, blogul easySales din 09.2026 numește România, Cehia, Slovacia, Grecia și Bulgaria (articolul de ajutor spune doar „toate țările”). Pentru About You, centrul de ajutor (actualizat 28.07.2026) spune Austria și Germania, dar blogul din 08.2026 anunță About You în 22 de țări, inclusiv România.
  - Variantele FBE (`EmagROFBE` 41, `EmagHUFBE` 55, `EmagBGFBE` 56) apar în pachetul JavaScript al aplicației easySales (`static marketplaceIds`), nu în colecție. Ele intră în aceeași poartă cu eMAG-ul țării (IPOTEZĂ: același cont eMAG). Integrarea nativă preia deja comenzile FBE ale contului, fără consum de stoc [C: `src/lib/emag/orders.ts:1244-1254`, `onoratDeEmag` de la `:675`].
  - Numele și id-urile pentru Trendyol, About You și Pepita în afara Ungariei nu se presupun. Se citesc din `GET /marketplaces/list` pe un cont real (M-MKT-1), fiindcă lista din exemplu e incompletă: lipsește `PepitaHU` (26), iar colecția folosește și `marketplace_id` 40.
  - Potrivirea cu integrările native se face pe canal **și** pe țară. About You prin easySales poate acoperi acum și România, deci poarta îl compară cu țările integrării native About You; țările reale vin din `GET /marketplaces/list` (M-MKT-1).
- La conectare și la pornirea E4, comerciantul declară canalele vândute prin easySales, pe țară. Dacă `GET /marketplaces/list` se dovedește a arăta canalele contului (M-MKT-1), lista se precompletează; altfel rămâne o declarație.
- Poarta merge în ambele sensuri:
  - refuză declararea unui canal deja conectat nativ;
  - refuză conectarea nativă a unui canal declarat la easySales: `connectEmag` [C: `src/lib/actions/emag.actions.ts:480`], `connectTrendyol` [C: `trendyol.actions.ts:297`], `connectAboutYou` [C: `aboutyou.actions.ts:228`], callback-ul OAuth OLX [C: `src/app/api/olx/oauth/callback/route.ts`, lângă garda de cont de la `:87`] și `activeazaPepita` [C: `pepita.actions.ts:251`];
  - din E4, refuză și conectarea nativă a unui canal din care easySales a adus comenzi în ultimele 60 de zile.
- Detecția din E4: o comandă externă de pe un canal conectat nativ nu se consumă niciodată și produce notificarea urgentă „canal pe două drumuri” (harta canalelor, §5.6).
- Feedurile de stoc rămân permise în acest model: scriu stocul Edinio, care pleacă la easySales prin declanșator.
  - Feedul scrie stocul absolut primit de la furnizor [C: `src/lib/import/stock-feed/applier.ts:159-169` în `products.stock_quantity`, `:92` în combinații]. O vânzare externă consumată între două rulări se pierde deci la rularea următoare. Garda citește-modifică-scrie [C: `applier.ts:184-200`] apără numai vânzarea care aterizează chiar în timpul scrierii.
  - Azi, feedul împinge stocul astfel suprascris la eMAG, Trendyol și About You [C: `src/lib/import/stock-feed/committer.ts:263-268`]. Cu easySales se întâmplă la fel, iar panoul o spune.

### 4.10 Al patrulea secret: Personal Access Token (numai după D3)
- **Când:** numai dacă M-EXT-1 arată că tokenul website nu vede comenzile celorlalte canale, iar D3 acceptă un Personal Access Token ca al doilea secret, numai pentru citirea comenzilor (§5.6). Rezultatul negativ e cel puțin la fel de probabil ca cel pozitiv: ghidul spune că PAT-ul „autentifică întregul cont, nu un singur magazin”, ceea ce sugerează că tokenul website e legat de website-ul lui (IPOTEZĂ; întrebarea ES-26, care completează ES-12).
- **D3 se hotărăște în E0, înaintea E1, nu în E4**, fiindcă PAT-ul schimbă patru lucruri ale conectării:
  1. **Formularul:** un al patrulea câmp de secret, cu pașii lui din easySales. PAT-ul se generează din interfață [A] și se afișează o singură dată (IPOTEZĂ, ghid).
  2. **Stocarea:** `pat` intră în `privat.campuri_secrete` și se criptează (§4.4). În clar stau data introducerii și data expirării: din `exp`, dacă PAT-ul e un JWT (IPOTEZĂ), altfel data introducerii plus un an.
  3. **Reînnoirea:** PAT-ul nu se poate reîmprospăta și expiră într-un an [A]. Nu există reînnoire automată, ca la tokenul website: omul e anunțat mereu, la 30 și la 7 zile. Expirarea e o oprire planificată, deci urmează regula din §5.5: dacă PAT-ul n-a fost înlocuit, stocul se pune întâi pe 0.
  4. **Securitatea:** un token pe tot contul vede datele personale de pe toate canalele. Se folosește numai pentru `GET /api/v2/orders` și `GET /api/v2/orders/{internal_id}`, niciodată pentru scrieri. Comenzile externe se păstrează cu date minime (D6), iar DPA-ul și ștergerea țin de D33 și ES-27.
- **Mai multe magazine Edinio pe același cont:** PAT-ul acoperă tot contul (IPOTEZĂ), deci același PAT poate servi mai multe magazine, iar garda „un cont, un magazin” nu i se aplică. Revocarea lui oprește citirea pentru toate. Fiecare magazin își alege din comenzile contului numai pe cele cu produsele lui (doi martori, §5.6).
- Dacă un PAT nou îl revocă pe cel vechi, ca regula „un token per client”, nu e documentat. Se vede odată cu M-EXT-1.
## 5. Fluxurile

### 5.0 Clientul HTTP comun (`src/lib/easysales/client.ts`)
- **Adrese:** `https://easy-sales.com/api/v2` și `https://easy-sales.com/oauth/token`, ca constante. Se pot suprascrie numai din `EASYSALES_API_URL`, pentru probe (tiparul `trendyolBaseUrl`); gazda nu vine niciodată din configurare.
- **Antete:** `Accept` și `Content-Type: application/json`, `Authorization: Bearer` [A: așa arată 69 din cele 92 de cereri; regula reiese numai din exemple]. `POST /oauth/token` are în exemple doar `Content-Type` și `Accept` [A].
- **`website_token`** se adaugă la rădăcina corpului la orice scriere JSON (IPOTEZĂ de confirmat, M-AUTH-4: colecția însăși nu îl trimite la 40 din 63 de scrieri, iar fraza „required on every API v2 write” apare la Archive product [A]). Nu se pune în corpurile multipart (urcarea de AWB și factură, E5). La `DELETE` cu corp, corpul se trimite explicit.
- **Termene:** 20 s la cererile simple și 60 s la cele în bloc. Le apără o probă nouă, `src/lib/easysales/termene.test.ts`. Proba existentă `src/lib/integrari/curierii-au-termen-la-cerere.test.ts` cere doar ca fiecare `fetch` al unui curier să aibă `signal:`, nu durate anume, și nu acoperă integrările de marketplace [C].
- **Parser tolerant:**
  - formele de eroare (cel puțin patru în exemple: validare `{message, errors{...}}`, business `{success:false, message, data:null}`, OAuth `{success:false, error, error_description, hint, message}` și altele [A]) se aduc la `{status, mesaj, campuri[]}`;
  - erorile pe element vin pe HTTP 200, în `data.result` (`errors[]`, `error_messages[]`, `not_found`, `blocked`) [A: `/stocks/bulk`, Archive products bulk] și se citesc pe fiecare SKU;
  - un HTTP 200 cu `success: false` se tratează tot ca refuz, ca plasă a noastră, și se jurnalizează ca anomalie: documentația pune `success: false` numai pe 400 și 422 (IPOTEZĂ fără sursă);
  - sumele vin uneori ca număr, alteori ca șir zecimal cu număr variabil de zecimale (`value`, `total_value`) și se citesc tolerant [A: exemplele de comenzi];
  - un corp necitibil se păstrează în `raspuns_brut`, pe rândul entității, numai la stările-problemă.

| Răspuns | Verdict |
|---|---|
| 2xx | reușit; la cererile în bloc se citește rezultatul pe fiecare SKU |
| rețea sau timeout fără răspuns | la citire, trecătoare; la scriere, `necunoscut`, nu `esuat` |
| 429, 500, 502, 503, 504 | trecătoare, fără să consume încercări |
| 401 | fluxul de token (§4.6) |
| 403 | clasificat după textul mesajului, în ordinea: plafon de comenzi („Orders limit exceeded”, al cărui cod HTTP e IPOTEZĂ, M-COM-6), website dezactivat, token website invalid, scope lipsă (se repară printr-o singură reemitere cu scope-urile corecte, cerută de om), alt 403 (definitiv, cu motivul). Nicio reemitere automată la un 403 nerecunoscut. „SHOULD NOT be repeated” [A] se aplică cererii, nu tokenului |
| 404, 405 | definitiv (405 e un defect al nostru, jurnal `error`) |
| 422 | refuz de date **sau de regulă** (ex. arhivarea unui produs cu comenzi active, ștergerea unei categorii atașate [A]), definitiv pe element |
| 400 „Invalid json” (IPOTEZĂ, ghid) | defect al nostru, alarmă critică |

- **Ritmul:**
  - jetonul e împărțit (`src/lib/marketplace/ritm-impartit.ts`) pe cheia contului easySales, `easysales:<jwt_sub>`, cu `client_id` ca rezervă (ce identifică `sub` e IPOTEZĂ, M-LIM-1);
  - bugetul nostru e de 250 de cereri pe minut din cele 500 [A], comun tuturor magazinelor Edinio de pe același cont;
  - sub 50 de cereri rămase în `X-RateLimit-Remaining`, se face pauză până la minutul următor;
  - la 429 se așteaptă 30, 60, apoi 120 s, sau cât cer antetele, dacă vin;
  - dacă baza nu răspunde, cererea pleacă oricum [C].
- **Jurnalul:** `easysales_request_log`, după modelul `emag_request_log` [C: scris de `src/lib/emag/jurnal-scriere.ts:72`]. Jetonul webhook-ului (§6.2) nu se scrie niciodată în jurnal. Păstrează 30 de zile toate scrierile și orice eșec, fără corpuri, antete sau date personale.

### 5.1 F1: comanda din vitrină pleacă în easySales (E2)

#### 5.1.1 Ștampila și ce comenzi pleacă
- **Declanșatorul `easysales_stampileaza_comanda`, BEFORE INSERT pe `orders`.** Azi nu există niciun BEFORE INSERT pe `orders`; singurul declanșator pe INSERT e AFTER (`email_marketing_la_creare`), iar cel nou rulează în aceeași tranzacție cu el [C: baseline 13901-13903]. Ștampila se pune numai dacă:
  - magazinul are `comenzi_active`;
  - comanda nu e de marketplace. Regula e aceeași ca în `email_marketing_pune_la_coada`, un șir nevid în `marketplace` [C: baseline 7324-7331], scrisă cu `coalesce`, fiindcă 64 de comenzi au `order_source` NULL [C]. Comenzile „ES-…” aduse de E4 au `marketplace: "easysales"`, deci nu se ștampilează (altfel ar face o buclă);
  - moneda magazinului e RON. `orders` nu are coloană de monedă, deci declanșatorul citește `store_settings.currency`, cum face deja Pepita [C: `src/lib/actions/pepita.actions.ts:1056-1057`]. La conectare se refuză un magazin care nu e în RON (D29);
  - livrarea e la adresă, prin curier. Felul livrării stă în cheile `shipping_address` (`delivery_type`, `courier`, `courier_label`), nu în coloane [C: `cont_comanda_mea`, baseline 3671-3675]. Rămân în Edinio:
    - `delivery_type = 'locker'`: punctul de ridicare, până la ES-9 (D17);
    - `courier = 'pickup'`: ridicarea personală. Are `delivery_type = 'address'`, iar `address` e adresa cumpărătorului, nu a magazinului [C: `src/lib/cont/livrare.ts:4-8`, `:76-78`]. Trimisă, ar primi în easySales AWB spre casa unui om care vine la magazin (D27, ES-23);
    - `courier = 'own'`: curierul magazinului (D27, ES-23);
  - țara de livrare e România (până la M-COM-4);
  - comanda nu e de test. `orders` nu are niciun steag de test [C: `src/types/database.types.ts`], deci în pilot comenzile de probă se fac cu automatizările easySales oprite până la proba cap la cap (§9.6), ca să nu primească factură fiscală reală și AWB.
- Declanșatorul scrie `order_source.easysales = {stapan: "easysales", factura: "easysales", awb: "easysales", v: 1}`, fără să atingă celelalte chei. Cheia `easysales` o scrie numai el: dacă vine din altă parte la inserare, e înlocuită sau scoasă. Are `exception when others then raise warning; return new`, deci nu poate strica o comandă.
- De ce aici:
  - `maybeAutoInvoice` citește deja `order_source` [C: `invoice-auto.actions.ts:33`];
  - poarta AWB îl citește prin `COLOANE_POARTA` [C: `src/lib/orders/poarta-awb.ts:78-84`], cade închis la eroare (`:110-117`) și cheamă regula pură (`:129`);
  - lotul îl citește [C: `bulk-orders.actions.ts:1413`];
  - ștampila e o fotografie pe comandă și există înaintea oricărei facturări automate la plată;
  - browserul n-o poate scrie (lista albă `CHEI_ATRIBUIRE` [C: `order.actions.ts:608`]), iar codul TypeScript nu rescrie `order_source` după inserare. Singura rescriere e anonimizarea clientului (`customer_anonymize` → `privat.sursa_anonimizata`), care scoate numai cheile de urmărire din lista ei neagră (`gclid`, `fbp`, `user_agent`, `ip` etc.) și păstrează restul, deci și cheia `easysales` [C: baseline 511-531, citit direct]. Ștampila nu conține date personale, ca să nu ceară curățare;
  - prin RLS, proprietarul magazinului poate rescrie `order_source` din bază [C: măsurat pe 13.10.2026, `has_column_privilege('authenticated', 'public.orders', 'order_source', 'UPDATE')` = true, politica „Owners can view and update orders” pe ALL]. Ștampila nu e deci o barieră de securitate față de el, ci o regulă de lucru; porțile citesc și `easysales_comenzi` (comanda trimisă), care nu se poate scrie din client.
- **`deriveOrigin` trebuie să ignore cheia nouă.** Azi socotește „fără atribuire” doar comenzile care nu au alte chei decât `user_agent` [C: `origin.ts:286`]. Cu `easysales` în plus, comenzile fără atribuire ar trece din „Magazin online” în „Direct”.
- **Outboxul, `easysales_marcheaza_comanda`, AFTER INSERT OR UPDATE OF status, payment_status**, lucrează **numai pe comenzile ștampilate** și citește ștampila din rândul nou, nu configurarea a doua oară. Are și el bloc de excepție.
  - la inserare creează rândul din `easysales_comenzi`, cu `es_order_id` înghețat, în starea `de_trimis` (ramburs) sau `asteapta_plata` (plată online);
  - la `payment_status → paid` trece rândul în `de_trimis`;
  - la anulare înainte de trimitere trece rândul în `anulata_inainte`;
  - la anulare după trimitere, pe un drum care a ocolit porțile, pune în coadă operația `comanda_anuleaza`.
- **Invariantul „trimisă ⇒ ștampilată”** ține prin construcție, fiindcă lucrătorul trimite numai comenzi ștampilate. Dacă ștampila a căzut, comanda rămâne una Edinio obișnuită și nu pleacă. Dacă outboxul a căzut, **plasa la 10 minute** găsește comenzile ștampilate mai vechi de 5 minute fără rând în `easysales_comenzi` și le pune în coadă.
- **Comenzile dinaintea activării** pleacă numai prin acțiunea explicită „Trimite comenzile deschise din ultimele N zile”. Acțiunea arată câte sunt și ștampilează numai comenzile fără factură și fără AWB Edinio, aflate în stările `pending`, `confirmed` sau `processing`. Avertizează și despre plafonul de comenzi easySales și despre fluxurile lor automate.

#### 5.1.2 Când pleacă și cum
- Comenzile cu ramburs pleacă imediat. Cele cu plată online (Stripe, Netopia, Revolut, iPay, Klarna) și cele cu transfer bancar pleacă după `payment_status = paid` (D24), ca o automatizare easySales să nu emită AWB sau factură pe bani neîncasați. O comandă anulată înainte de trimitere nu pleacă.
- Lucrătorul e cronul la minut (§7.5), plus o încercare imediată prin `dupaRaspuns` după plasare. La trimitere se citește starea curentă a comenzii, nu cea de la punerea în coadă, iar rezultatul se scrie cu CAS pe generație [C: `src/lib/marketplace/coada-cas.ts`].
- **Endpoint:** `POST /api/v2/orders/save`, cu corpul `{website_token, source: "api", order: {...}}` [A]. Rolul lui `source` e nedocumentat (IPOTEZĂ, M-WH-2); îl trimitem ca în exemple. După reușită urmează `POST /api/v2/orders/{internal_id}/metadata` cu `edinio_order_id` (uuid), `edinio_order_number`, `edinio_plata` și `edinio_magazin`, fiecare de cel mult 191 de caractere [A].
- Toate comenzile pleacă cu `status: 1` (New) [A: enum 0-6]. Valoarea `2` (Received) pentru cele plătite se folosește numai dacă M-COM-3 arată că e mai bună. Efectul statusului inițial asupra fluxurilor automate nu e documentat în API; după centrul de ajutor, rezervarea de stoc ține cât comanda nu e anulată, finalizată sau facturată (IPOTEZĂ, M-COM-3, ES-22).
- **Automatizările easySales** (factură, AWB, SMS, email) pe comenzile venite prin API: dacă ES-10 arată că nu se pot opri sau limita pe website, pârghiile documentate rămân:
  - câmpul „Status custom pentru comanda nouă” din formularul website-ului (IPOTEZĂ dacă se aplică și comenzilor API, ES-31);
  - `PATCH /api/v2/orders/{internal_id}/custom-status` [A];
  - etichetele: `POST /api/v2/tags/attach` și filtrele `tags`, `has_tags` ale listei [A], de exemplu o etichetă „Edinio, plătită online”, pe care comerciantul își filtrează automatizările. În acest caz, scope-urile de etichete (`read-tags`, `add-tags`, `attach-tags`) se cer din prima (§4.3).
- **Metodele de plată, măsurate:** în date apar azi `cash_on_delivery` (508), `netopia` (52), `stripe` (7), `revolut` (1) și cele de marketplace, `emag` (157) și `trendyol` (119) [C: 13.10.2026, 844 de comenzi]. `ipay`, `klarna` și `bank_transfer` există numai în cod [C: `src/lib/actions/ipay.actions.ts`, cronul `klarna-reconcile`, baseline 3405]; harta din §5.1.3 le acoperă oricum.

#### 5.1.3 Maparea câmp cu câmp

| Câmp easySales [A: Save Order și obiectele Customer, Address, Order product, Shipment, Fee, Voucher] | Din Edinio [C] | Regula |
|---|---|---|
| `website_token` (rădăcină) | configurarea, decriptată cu service role | la orice scriere [A] |
| `source` (rădăcină) | `"api"` | nedocumentat, apare în exemple (IPOTEZĂ) |
| `order.order_id` | `easysales_comenzi.es_order_id`, înghețat | obligatoriu și unic: 422 „The order.order id field is required.” și „…has already been taken.” [A]; „Numeric” în tabel, dar exemplele îl întorc ca șir, iar interval sau lungime nu sunt documentate [A]; forma după M-ID-1 (§5.1.5) |
| `order.order_date` | `orders.created_at`, convertit cu `Intl` în Europe/Bucharest, „YYYY-mm-dd HH:ii:ss” | formatul [A]; fusul orar e IPOTEZĂ (M-COM-5); `TZ` nu se poate seta pe Vercel [C: `docs/redesign/REGISTRU.md:464`] |
| `order.invoice_series` | seria aleasă în setări sau `""` | marcat obligatoriu, dar trimis gol în exemplul Save [A]; seria implicită a website-ului e IPOTEZĂ (ghid) |
| `order.currency` | `RON` (numai comenzile în lei se ștampilează) | cod de 3 litere, opțional [A] |
| `order.status` | `1` | enum 0-6 [A] |
| `order.payment_mode` | `cash_on_delivery`/`ramburs` → 2; `stripe`, `netopia`, `revolut`, `ipay`, `klarna` → 1; `bank_transfer` → 3 | enum 1-3 [A]; `ramburs` e aliasul din `cont_anuleaza_comanda` [C: baseline 3405] |
| `order.payment_status` | nu se trimite | apare doar în exemplul Save, fără enum [A]; M-COM-8 |
| `order.order_total` | suma brută a liniilor + transportul (varianta documentată) sau `orders.total` (varianta „ce plătește cumpărătorul”) | definit „Order total value (products values + shipment tax)” [A], adică fără `fees` și fără `vouchers`. Care variantă se trimite e IPOTEZĂ până la M-COM-2 (§5.1.4); singurul exemplu coerent e Save din 2025, cu două linii și fără transport, taxe sau reduceri (279,00 + 15,90 = 294,90) [A] |
| `order.shipment` | `{tax: cota, price_with_tax: shipping_cost}`; la regim fără TVA, `price_without_tax` | obiectul Shipment [A]; `shipment_tax` nu se trimite (exemplul le are pe amândouă, cu valori diferite [A]) |
| `order.fees[]` | `cod_fee_amount` („Taxă ramburs”) și liniile `extra_<id>` (`esteIdExtra` [C: `src/lib/orders/extras.ts:12`]) | obiectul Fee, cu `tax` și preț cu sau fără TVA [A] |
| `order.vouchers[]`, `order.total_vouchers` | `discount_amount`, `card_discount_amount`, `cod_discount_amount`, negative, împărțite pe cote; `total_vouchers` = suma lor, sau 0 când comanda n-are reduceri | tabelul îl marchează obligatoriu, „Must be a negative number” [A], dar exemplele Add și Update trimit 0 sau „0”, iar Save nu îl trimite deloc [A]; **fără** `offer_discount_amount` (§5.1.4) |
| `order.observations` | `notes` decodat cu `detaliileDeLaCheckout` (câmpurile `cf_` cu etichetele din `checkout_config`, ca exportul: `src/lib/orders/export-comenzi.ts`, `tabelulExportului` [C]) și rezumatul personalizărilor | „Order extra details.” [A]. Fișierele de producție ale cumpărătorului nu ajung la operatorul easySales: dacă pleacă și comenzile cu fișiere (linkuri semnate în observații) sau rămân în Edinio e D31 |
| `order.delivery_notes` | `shipping_address->>'courier_label'` și `->>'delivery_type'` (chei în jsonb, nu coloane [C: baseline 3671-3675]) | câmp prezent în tabelul Save [A]. Curierul ales de cumpărător ajunge doar ca text: dacă automatizarea easySales alege alt curier, comerciantul plătește alt tarif decât a încasat. Câmpul `shipping_method` apare în exemplul Save, nedocumentat (ES-23) |
| `customer.legal_entity` | 1 dacă există `billing_company`, altfel 0 | [A] |
| `customer.name` | `customer_name` | obligatoriu la persoana fizică [A] |
| `customer.company_name`, `vat_id`, `registration_number`, `vat_payer` | `billing_company.company_name`, `.cui`, `.reg_com`, `.vat_payer` (jsonb cu 9 chei, definit în `src/lib/billing/company.ts:14` [C]) | `vat_id` = „company registration code” [A]. Azi `billing_company` e NULL la toate cele 844 de comenzi [C: 13.10.2026], deci ramura PJ se probează pe cazuri construite |
| `customer.phone` | `customer_phone`, normalizat cu `src/lib/utils/phone.ts:20` | obligatoriu în tabel [A]; ghidul easySales „Cum găsești și rezolvi erorile website” (29.09.2026) spune că numele, telefonul și emailul nu sunt obligatorii la comenzile importate (IPOTEZĂ până la M-COM-4, documentația se contrazice); mai există două funcții `normalizePhone` cu alte rezultate (`customers.ts:147`, `marketing-config.ts:115`) [C] |
| `customer.email` | `customer_email`, dacă există | obligatoriu în tabel [A], opțional după același ghid (IPOTEZĂ, M-COM-4); lipsește la 95 din 568 de comenzi din vitrină [C]; nu se inventează adrese |
| `customer.bank`, `iban`, `fax`, `identification_number` | nu se trimit | Edinio nu le are [C] |
| `shipping_address.*` | `name` și `phone` ale clientului; `country` ISO2 (implicit RO); `county` cod; `city`; `street` = `liniaAdresei` [C: `src/lib/orders/adresa.ts:87`]; `postal_code` | „County ISO Code”, „ISO alpha-2” [A] |
| `billing_address.*` | persoană fizică: adresa de livrare; firmă: adresa din `billing_company` | [A] |
| `order_products[].product_website_id` | `easysales_produse.id` al articolului | „Numeric… Product id”, obligatoriu [A] |
| `order_products[].sku`, `name`, `quantity` | `sku_trimis`; numele și cantitatea liniei | obligatorii [A] |
| `order_products[].price` | net pe bucată, cel puțin 4 zecimale | „fără TVA” [A] (§5.1.4) |
| `order_products[].total` | net pe linie, 6 zecimale | „tax excluded, price * quantity” [A]; exemplul Save are `'230.578512'` [A] |
| `order_products[].tax` | `planulCotelor(items, cotaDocumentului).cotaLiniei(linie)` | procent întreg, ex. 19 [A]; 0 la neplătitor |

- **Județul** se obține cu `codAutoAlJudetului(potrivesteJudet(...))` [C: `src/lib/ro/judete.ts:93`, `:161`]. Pentru București: `county: "B"` (codul ISO din `GET /general-data/countries/175/counties`, unde id 11 are `iso_code` „B”) și orașul „Bucuresti”, ca în toate exemplele [A]; sectorul în stradă e IPOTEZĂ (M-COM-4), la fel ca un județ trimis ca nume. O probă cere ca cele 42 de coduri ale noastre să fie exact lista din `general-data/countries/175/counties` [A].
- **Liniile:**
  - cele din vitrină au doar `{product_id, name, price, quantity}`, plus personalizarea [C];
  - varianta se reconstituie întâi din `stoc_rezervat.variante` [C: `src/lib/orders/stoc-rezervat.ts:26`], care e sursa sigură. Sufixul „(titlu)” din nume, scris de `pretulLiniei` de pe server [C: `src/lib/orders/variant-guard.ts:39-67`; nu omonima din `src/lib/storefront/cart/pret-linie.ts:112`], e doar rezervă: numele produsului poate conține el însuși paranteze, iar `desparteTitlu` [C: `src/lib/storefront/variante-identitate.ts:111`] primește un titlu deja izolat, nu desparte sufixul. Extragerea sufixului e o funcție nouă, cu probă, iar o potrivire nesigură lasă linia „nelegată” (mai jos);
  - adresa: `liniaAdresei` [C: `src/lib/orders/adresa.ts:87`] preferă câmpul liber `address` (singurul scris de editarea din panou, poate conține adresa întreagă) și cade pe stradă și număr doar când acela lipsește [C];
  - articolul se caută în `easysales_produse` sau se alocă acum, cu același id și același SKU pe care le va folosi catalogul;
  - o linie fără produs sau variantă găsită (27 din 813 duc la produse șterse [C]) pleacă pe identitatea produsului, cu nota „linie nelegată” în observații;
  - liniile `extra_<id>` merg în `fees[]`.
- **Pachete:** linia pleacă cu SKU-ul pachetului, care nu e în catalog. Dacă M-COM-9 arată că un SKU necunoscut e refuzat, comenzile cu pachete nu se ștampilează (D11).

#### 5.1.4 Banii
- Regimul de TVA se ia cu `invoiceVat(order, store)` [C: `src/lib/billing/invoice-vat.ts:68`], niciodată din setarea de azi a magazinului. Motivul: 247 de comenzi din vitrină au `prices_include_vat` NULL, iar 137 din 146 de magazine au `vat_enabled = false` cu `vat_rate = 19` rămas implicit [C].
- Cota fiecărei linii vine din `planulCotelor(items, cotaDocumentului).cotaLiniei` [C: `src/lib/billing/cote-pe-linii.ts:251`], care pune 0 pe toate liniile la un neplătitor. Reducerile și taxele se împart pe grupe de cotă cu `peGrupe` și pleacă fiecare cu `tax` explicit.
- Pentru comenzile din vitrină există azi o singură cotă, prin construcție [C: antetul `cote-pe-linii.ts`], dar regula rămâne una singură. O comandă din vitrină cu cote amestecate nu se trimite și se semnalează, fiindcă transportul easySales e un singur obiect [A].
- Prețul pornește din `orders.items[].price`, unitar și nerotunjit, astfel încât preț × cantitate dă subtotalul [C: `src/lib/billing/reconcile.ts:50-53`]. Netul = brut / (1 + cotă/100), cu cel puțin 4 zecimale; totalul net al liniei se trimite cu 6.
- `offer_discount_amount` nu devine voucher, fiindcă e deja inclus în prețul liniilor [C: comentariul din `cont_comanda_mea`, „reducerea din oferte e deja scazuta in pretul liniilor”].
- **Garda sumelor** refolosește `reconciliazaComanda` [C: `reconcile.ts:172`], cu care se apără deja facturile SmartBill, Oblio și fGO. Rotunjirea se modelează pe cantitate, iar cotele amestecate trec prin `tvaContinutInTotal`. Un adaptor transformă liniile easySales în liniile gărzii, cu `liniiNete: true`.
  - La `refuz`, comanda nu pleacă: trece în starea `respinsa_local`, cu jurnal critic și notificare cu diferența.
  - Rotunjirea e documentată doar în parte: la Add Order, `price_with_tax` (pe bucată) și `total_with_tax` (pe linie) sunt câmpuri calculate, „rounded with 2 decimals” [A]. Dacă easySales își recalculează totalurile, cum rotunjește netul trimis cu 4 zecimale și dacă verifică liniile față de `order_total` nu e documentat (IPOTEZĂ, M-COM-2, ES-9).
- **`order_total`:** documentația îl definește „products values + shipment tax”, fără taxe și reduceri [A], pe când `orders.total` le include. Până la M-COM-2 trimiterea rămâne parametru, cu două variante scrise dinainte: (a) suma brută a liniilor + transportul, ca în definiție; (b) `orders.total`. În ambele, garda cere ca linii + transport + taxe + reduceri să dea `orders.total` la ban. M-COM-2 alege varianta după totalul afișat de easySales și după factura emisă de ei, pe o comandă cu taxă de ramburs, extraopțiune și cupon.
- **Cazurile de margine pe care M-COM-2 trebuie să le acopere:** multe bucăți la preț mic; cotele de 21% și 11%; ramburs, extraopțiune și cupon în aceeași comandă. Riscul: suma încasată cu cardul diferă cu un ban de factura easySales.

#### 5.1.5 Identificatori și idempotență
- **`order_id` = `es_order_id`**, înghețat în `easysales_comenzi` înaintea primului apel. Implicit e un număr din secvența globală `easysales_id_seq`, pornită de la 1.000.000.000; încape în int32 și e unic între magazine prin construcție. E însă numărul pe care îl vede operatorul easySales, iar exemplele oficiale trimit și șiruri [A]. Dacă M-ID-1 confirmă că șirurile sunt acceptate și unicitatea e pe website, preferăm forma lizibilă „cod magazin + număr comandă Edinio”.
- Răspunsul Save Order nu e documentat: exemplul lui e copiat de la Add, unde `data` are `id`, `internal_id` și `order_display_id` [A: Add Order]. Ce vine se păstrează; dacă `internal_id` lipsește, se află prin recuperarea de mai jos, care devine calea principală. `internal_id` e obligatoriu pe toate rutele `/orders/{id}/...` [A].
- **Timeout sau 5xx după trimitere: starea `necunoscut`.** Recuperarea se face în ordine:
  1. `GET /orders?order_display_id=<es_order_id>`: filtrul caută după „display, marketplace or website order ID” [A]; că `order_id`-ul nostru e acel „website order ID” reiese doar din exemple [A: Add și Save Order]. Rezultatul se acceptă numai dacă `id`-ul comenzii găsite, comparat ca șir, e `es_order_id`, iar comanda nu e de marketplace: filtrul potrivește și id-uri de marketplace ale altor comenzi;
  2. webhook-ul `order-created`, ca semnal: că `id` din payload e `order_id`-ul trimis e IPOTEZĂ (documentat doar la răspunsul Add, ca șir; în `delivery-status-updated`, `order.id` e id-ul intern) [A];
  3. un rezultat gol nu dovedește lipsa comenzii. Abia dacă nu o găsim nici după 10 minute, la două citiri, urmează un nou Save.
  Save e „created or updated” [A], dar cheia lui e IPOTEZĂ (M-COM-1); de aceea GET-ul vine întâi.
- **Fără re-Save automat** după ce `internal_id` e cunoscut. Butonul „Retrimite” face întâi `GET /orders/{internal_id}` și trimite numai dacă starea e New sau Incomplete și nu există AWB sau factură, fiindcă nu știm ce suprascrie Save peste o comandă procesată (M-COM-1, ES-4).
- **Fără registrul de operații externe:** e o sincronizare idempotentă, nu un efect unic. La Trendyol, About You și OLX, registrul pus pe sincronizarea repetabilă ar fi înghețat prețul și stocul; verificarea adversarială a prins defectul înaintea traficului real, iar cablarea a fost scoasă [C: commit `a0724b3`].

#### 5.1.6 Erori și reîncercări

| Răspuns | Ce face Edinio |
|---|---|
| 2xx | `trimisa`; metadatele; SKU-urile intră în citirea de control |
| 422 de validare | `refuzata`, cu mesajele aplatizate; apoi întoarcerea la Edinio (mai jos) |
| „Orders limit exceeded” (IPOTEZĂ, ghid: comanda nu se creează și apare pe pagina „Website errors”, tabul „Fetching orders”; codul HTTP e necunoscut, poate 403, M-COM-6) | `blocata_plafon`, cu notificare; omul alege „Preia în Edinio” sau „Reia” după mărirea planului; amintire zilnică |
| 401, 403 | fluxul de token (§4.6); comanda rămâne `de_trimis`, fără să consume încercări |
| 429, 5xx, rețea | reluare la 1, 2, 5, 10, 30 de minute, apoi din oră în oră, 48 de ore; notificare după ~2 ore; la 48 de ore, `abandonata` și întoarcerea la Edinio |

**Întoarcerea la Edinio** a unei comenzi refuzate sau abandonate se face numai după ce `GET /orders?order_display_id=` dovedește că easySales nu o are. Dacă o are, comanda rămâne ștampilată și apare ca „conflict” în panou. La întoarcere:
- ștampila devine `stapan: "edinio"`, prin îmbinarea cheii, niciodată prin rescrierea întregului `order_source`;
- se cheamă o dată `maybeAutoInvoice`, ca o comandă plătită să-și primească factura pe drumul obișnuit;
- pleacă notificarea „Comanda #X se procesează din Edinio”.

**Limita de rată:** o comandă înseamnă un Save, metadatele și uneori un GET. Vârful măsurat pe platformă e de 37 de comenzi pe zi la un magazin (okxi, 27.08.2026, toate eMAG); din vitrină, 36 la jhbijuterii pe 12.10, zi neîncheiată la măsurare [C: 13.10.2026]. Consumul e neglijabil.
- **Comenzile ștampilate și netrimise când `comenzi_active` se stinge** (fără deconectare) rămân în coadă, oprite, iar panoul le arată cu două butoane: „Trimite totuși” sau „Preia în Edinio”. Nu pleacă și nu trec singure la Edinio.

### 5.2 F2: starea, AWB-ul și factura se întorc în Edinio (E2)
**Declanșatori**
- webhook-urile `order-updated`, `awb-created`, `invoice-created`, `storno-invoice-created` și `delivery-status-updated` (dacă abonarea reușește, M-WH-3), toate tratate ca semnal [A];
- banda de listă, la 5 minute: `GET /api/v2/orders?modified_after=<marcaj − 3 h>&per_page=100` [A]:
  - marcajul se mută cu `marcajUrmator` [C: `src/lib/marketplace/marcaj.ts:31`]: după o trecere completă (`meta.total`, `meta.last_page` [A]), la sfârșitul ferestrei citite cu adevărat (`min(runStartMs, fereastraSfarsitMs)`), nu la „acum”; după o trecere tăiată (plafon de pagini, timp), la cursorul atins plus suprapunere; fără cursor, rămâne pe loc [C];
  - suprapunerea de 3 ore acoperă fusul orar nedocumentat;
  - filtrul `website=` se folosește numai dacă M-COM-5 arată că prinde comenzile noastre; altfel ale noastre se aleg după `internal_id`;
- plasa pe comandă: o dată pe oră, comenzile trimise, neterminale și fără nicio veste de 24 de ore se recitesc pe rând. Ea acoperă cazul în care `modified_after` nu se mișcă la AWB, factură sau livrare (M-COM-5).

**Recitirea și identificarea**
- Starea se citește cu `GET /api/v2/orders/{internal_id}` [A]. Ceasul `es_updated_at` vine din banda de listă, singura care are `updated_at` [A]; pe drumul webhook, garda e monotonia.
- Evenimentele de comandă au `internal_id`, iar `awb-created` și `invoice-created` au `order_id` și `order_display_id` [A]. Căutarea în `easysales_comenzi` merge întâi după `es_internal_id`, apoi după `es_order_id` și `es_display_id`.
- O comandă necunoscută e a altui canal (semnal pentru E4) sau se ignoră. Comenzile cu `stapan: "edinio"` nu mai primesc nimic de la easySales.

**Maparea stărilor** (numai înainte, niciodată înapoi; funcția intră în `valori-permise.test.ts`)

| La easySales [A: `status`, `shipments[]`, `delivery_status.value`] | În Edinio | Efecte |
|---|---|---|
| New (1), Received (2), Incomplete (5) | neschimbat | insigna cu eticheta lor |
| Processing (4) | `processing`, dacă Edinio e `pending` sau `confirmed` | |
| AWB neanulat cu livrarea 2 (On Route) sau 3 (Delayed) | `shipped` | se scriu AWB-ul și curierul |
| Completed (3) cu AWB neanulat | `shipped` | ca la eMAG, unde „finalizată” înseamnă predată [C: `src/lib/emag/orders.ts:84-101`]; momentul în care apare Completed e IPOTEZĂ (M-AWB-1) |
| AWB nou cu livrarea 1 (Ready) sau 6 (Unknown), stare diferită de Completed | `processing`, dacă era sub | se scriu AWB-ul și curierul |
| livrarea 4 (Delivered) | `delivered` | |
| Completed (3) fără niciun AWB | `processing`, cu steagul „finalizată în easySales fără AWB” | niciodată `shipped` |
| livrarea 7 (Canceled) pe AWB-ul scris de noi | AWB-ul se scoate | starea nu coboară |
| Canceled (0), fără AWB | `cancelled`, cu eliberarea stocului | GA4; notificare dacă e plătită online („banii nu s-au întors automat”); email după D5 |
| Canceled (0), cu AWB | neschimbat | notificare „probabil retur” |
| Return (6) sau livrarea 5 | neschimbat | notificare (D19); `refunded` ar stinge plasa „marfa a plecat fără bani” [C: `src/lib/orders/marfa-a-plecat-fara-bani.ts`] și ar scoate comanda din venituri |
| `cancel_request` nenul | neschimbat | notificare „clientul cere anularea” |
| `errors[]` (ex. `create_awb`) | neschimbat | afișat în panou, cu notificare |
| `total_value` diferit de `orders.total` | neschimbat | steagul „modificată în easySales”; banii comenzii nu se rescriu |

- Etichetele vin ca text și în forme diferite: filtrul `status` al listei scrie „0 -> Canceled” și „6 -> Return”, tabelele de cerere „Cancelled” și „Returned”, iar în răspunsuri e documentat doar „Canceled”, într-un singur exemplu [A]. Se citește întâi codul numeric; textul e doar rezervă, cu parsare tolerantă. O valoare necunoscută nu schimbă nimic și se numără.
- **Tranzițiile** trec numai prin `tranzitieComandaMarketplace` [C: `src/lib/orders/tranzitie-marketplace.ts:48`], cu rezultatele `ok`, `reincearca`, `definitiv`. Nu se face niciodată un `update` direct pe `status`.
  - Înainte de orice scriere, tranziția recitește expedierea dată (`p.expediere`): dacă s-a schimbat, întoarce `definitiv`; dacă citirea pică, `reincearca`; în ambele cazuri nu scrie nimic [C: `:123-158`].
  - Funcția doar transportă starea și steagul `elibereazaStoc` [C: `:88`, `:191`]. Apelantul easySales îl scrie **explicit** (anulare: `true`; retur: `false`), după modelul `src/lib/emag/orders.ts:906`, `src/lib/trendyol/orders.ts:374` și `src/lib/aboutyou/orders.ts:601`. Fără steag explicit, și returul ar elibera stocul.
- **Ce nu face tranziția:** ea scrie doar câmpurile auxiliare și cheamă `aplica_tranzitia_comenzii`, iar `sendOrderStatusToCustomer` e chemat numai din `order.actions.ts:2790` și din `src/lib/cont/anulare.ts:51` [C]. Prin urmare:
  - la anulare se cheamă explicit `raporteazaRambursareaGa4(orderId)` [C: `src/lib/orders/ga4-comanda.ts:143`], ca în `dupaAnulareaDinCont` [C: `src/lib/cont/anulare.ts:35`];
  - emailul către cumpărător pleacă numai dacă D5 alege „Edinio anunță”. Atunci bugetul se extrage din `poateInstiintaStarea` într-un modul comun și se recheiază pe magazin și pe comandă. Azi funcția e privată, într-un fișier „use server”, și e cheiată pe utilizator (`stare-mesaj:${userId}` [C: `order.actions.ts:2610-2611`]);
  - implicit, ca la cronurile de curier de azi, tranzițiile nu trimit nimic.
- `maybeAutoInvoice` nu se cheamă; oricum ar ieși pe ștampilă.

**Documentele**
- Se păstrează în `easysales_comenzi.awb` și `.facturi` (jsonb), nu în coloane noi pe `orders`. Pentru AWB: numerele (listă), curierul `{id, name}`, `awb_url`, `awb_tracking_page` și istoricul livrării. Pentru facturi: `series`, `number`, `URL`, `type`; singura valoare documentată pentru `type` e „invoice” [A]. Că o stornare apare în `invoices[]` nu e documentat, deci payload-ul `storno-invoice-created` se păstrează ca dată, nu doar ca semnal: el leagă stornarea de factura corectată (`corrected_invoice`) și de retur (`order_return_id`) [A].
- **Factura easySales a unei comenzi plătite online** rămâne, la ei, neîncasată. `POST /api/v2/orders/{internal_id}/mark-as-paid/{internal_invoice_id}` o marchează plătită [A]. Id-ul intern al facturii pare să vină în `invoice-created` (IPOTEZĂ, M-INV-1). Chemarea se face o singură dată pe factură, cu marcaj în `easysales_comenzi`, numai după M-INV-1 și numai pe comenzile cu `payment_status = paid` în Edinio (E2, opțional, D26).
- Panoul comenzii le arată pe toate. Adresele easySales se arată cumpărătorului numai dacă M-AWB-1 și M-INV-1 arată că sunt publice; factura trece și prin `esteChiarPdf` [C: `src/lib/billing/factura-comenzii.ts:84`].
- **Contul cumpărătorului:**
  - `cont_comanda_mea` primește o ramură nouă în alegerea AWB-ului, din `easysales_comenzi` [C: lista curierilor din baseline 3716-3750]. Corpul se copiază din producție, cu md5 verificat înainte, ca la migrațiile 68 și 70.
  - `urmareste()` [C: `src/lib/cont/urmarire.ts:106`] primește curierul canonic dintr-o hartă pe `courier.id`: 2 DPD, 3 UrgentCargus → Cargus, 4 FanCourier, 5 SameDay, 6 GLS, 18 DHL, 23 Packeta, 26 UPS. Lista vine din filtrul `courier_id` al listei de comenzi [A]; că `shipments[].courier.id` folosește aceleași id-uri e confirmat numai pentru 4 FanCourier, în exemplul Get Order (IPOTEZĂ pentru rest, M-AWB-1). AWB-urile încărcate manual la ei apar cu curierul „Manual” (13) și nu primesc link de urmărire.
  - Harta merge pe id, nu pe nume, fiindcă `curierulReal` potrivește primul cuvânt și nu recunoaște „UrgentCargus” [C: `urmarire.ts:32-54`]. Un id necunoscut nu primește link.

| easySales [A: Get Order, List orders] | În Edinio | Regula |
|---|---|---|
| `shipments[]`: `awb_id[]`, `courier{id, name}`, `delivery_status`, `awb_url`, `awb_tracking_page`, `delivery_history` | `easysales_comenzi.awb`; AWB-ul viu (cel mai nou, neanulat) ajunge în ramura din `cont_comanda_mea` | numai AWB-urile cu livrarea diferită de 7 |
| `invoices[]`: `series`, `number`, `URL`, `type` (documentat doar „invoice”) | `easysales_comenzi.facturi` | stornarea se ia din payload-ul `storno-invoice-created`, păstrat ca dată, și se leagă de factura corectată prin `corrected_invoice` [A] |
| `status`, `custom_status{id, name, color}` | `es_status_cod`, `es_status_text`, `es_custom_status` | insigna din panou |
| `cancel_request`, `errors[]` | `cancel_request`, `erori` | notificare |
| `updated_at` (numai în listă) | `es_updated_at` | ceasul pentru „un eveniment vechi nu rescrie unul nou” |
| `total_value` | comparat cu `orders.total` | steag la diferență |

**Idempotență, erori, ritm**
- Recitirea aplică starea absolută. O tranziție spre aceeași stare nu schimbă nimic (`aplica_tranzitia_comenzii` întoarce `status_schimbat` [C: folosit în `order.actions.ts:2711-2729`]). Documentele se scriu pe cheia lor (numărul AWB, seria și numărul facturii), deci o recitire repetată nu dublează nimic.
- Erori:
  - 404 la recitire: comanda a dispărut la ei, deci notificare, fără tranziție;
  - 401 și 403: §4.6;
  - rețea, 429, 5xx: operația `comanda_citeste` rămâne în coadă și se reia fără să consume încercări;
  - rezultatul `reincearca` al tranziției nu avansează marcajul benzii, iar `definitiv` îl avansează, cu jurnal [C: `tranzitie-marketplace.ts:28-46`].
- Ritm: ~5 citiri pe ciclul unei comenzi, plus banda de listă (o cerere la 5 minute pe magazin, mai multe doar când sunt mai multe pagini). Recitirile se comasează pe comandă.

### 5.3 F3: anulările și editările cerute din Edinio (E2)
- **Selectorul de stare** al unei comenzi ștampilate și trimise e blocat, cu un mesaj care spune unde se face schimbarea. Tiparul e o pereche: `marketplaceCareTineComanda` decide [C: `origin.ts:144`], iar `deCeNuDeAici` dă doar textul refuzului [C: `origin.ts:156`]. Paza stă pe server: în `updateOrder` [C: `order.actions.ts:2630`, lângă paza `:2671-2675`] și în lot [C: `bulkUpdateOrderStatus`, `bulk-orders.actions.ts:1384`; citirea originilor la `:1412-1414`, setul la `:1416-1420`, excluderea la `:1421`], unde comenzile ținute de alt sistem se sar, fără să se refuze tot lotul.
- **„Anulează în easySales”** e singura excepție:
  1. `GET /orders/{internal_id}`;
  2. dacă starea e New sau Received și nu există AWB, `PATCH /orders/{internal_id}/cancel` cu motivul [A];
  3. abia apoi vin tranziția locală (`cancelled`, cu eliberarea stocului), GA4 și emailul după D5. Înainte de tranziție se scrie `es_anulata_la`, ca outboxul să nu trimită anularea a doua oară.
  Dacă easySales refuză sau comanda e deja în procesare, nu se schimbă nimic local și se arată motivul. Ordinea „întâi calea oficială, apoi blocarea” e regula de la Trendyol [C: `origin.ts:100-108`].
- **Anularea din contul cumpărătorului** se oprește chiar în funcția SQL `cont_anuleaza_comanda` [C: baseline 3362-3421], nu doar în `src/lib/cont/anulare.ts`. Azi funcția anulează comenzile `pending`, neplătite, cu ramburs sau transfer, numai dacă sunt legate de contul clientului cu vederea „întreagă” [C: `:3370-3377`] și numai dacă nu sunt de marketplace [C: `:3391-3393`]; stocul se eliberează prin `aplica_tranzitia_comenzii(p_order, 'cancelled', null, p_business, true)`, nu direct în funcție [C: citit pe 13.10.2026]. Noua ramură intră înaintea acestei chemări, lângă refuzul `marketplace`. Pentru o comandă cu `stapan: "easysales"` va întoarce un motiv nou (`procesata-extern`), afișat în cont prin `src/lib/cont/date.ts`. Comerciantul primește notificarea „Clientul a cerut anularea comenzii #X; anuleaz-o din easySales sau cu butonul din Edinio”.
- **Retragerea din contract (OUG 18/2026)** rămâne în Edinio [C: `src/lib/actions/return.actions.ts`, tabela `return_requests`, `/dashboard/returns`]. Pe o comandă procesată în easySales, cererea ajunge numai la noi, stornarea se face la ei, rambursarea cardului prin procesatorul Edinio, iar repunerea în stoc nu o face nimeni (E4 pune `refunded` cu `elibereazaStoc: false`). De aceea:
  - comerciantul primește notificarea „retur pe o comandă procesată în easySales”, cu legătura spre comanda lor;
  - repunerea în stoc la un retur aprobat se face în Edinio, care e sursa stocului, și pleacă apoi pe toate canalele;
  - legătura dintre `storno-invoice-created.order_return_id` [A] și cererea de retur se hotărăște la D28.
- **Editarea** liniilor sau a adresei (`updateOrderDetails` [C: `:3069`]) și ștergerea (`deleteOrder` [C: `:3962`]) se refuză după trimitere. Notele rămân libere și nu se propagă.
- **Rambursarea prin procesator** în Edinio, pe o comandă trimisă, produce notificarea „anulează și stornează și în easySales”.
- **„Preia în Edinio”:** comanda netrimisă trece imediat. Cea trimisă cere confirmare, se anulează întâi în easySales (numai dacă e New sau Received și fără AWB), apoi primește `stapan: "edinio"`, iar recitirile de la easySales se opresc pentru ea.
- **Erori:** răspunsul la un `cancel` refuzat nu e documentat: colecția are numai exemplul 200 „Cancel Order -> Success”, cu `data.status` „Canceled” [A]. Prin analogie cu refuzurile documentate la alte resurse, așteptăm 422 sau `success: false` (IPOTEZĂ, M-COM-7). Orice răspuns care nu arată „Canceled” nu schimbă nimic local și arată motivul. Un timeout lasă anularea „necunoscută”, iar înaintea oricărei reluări se recitește comanda (cum se poartă un `cancel` repetat măsoară M-COM-7). Volumul e neglijabil.

### 5.4 F4: catalogul pleacă în easySales (E3)
**Endpointuri:** `POST /api/v2/categories/save[/bulk]`, `POST /api/v2/characteristics/save[/bulk]`, `POST /api/v2/products/save[/bulk]`, `PATCH /api/v2/products/prices/bulk`, `PATCH /api/v2/products/archive/bulk`; verificarea se face prin `GET /api/v2/products?website=<nume>&page=N` [A]. Documentația cere ca o categorie sau o caracteristică să existe înaintea produsului care le folosește („you must first create that category or characteristic” [A: dosarul Products]; „define your product categories before defining your individual products” [A: dosarul Categories]); ordinea categorii → caracteristici → produse e alegerea noastră, care satisface ambele.

#### 5.4.1 Raportul de pregătire
Un singur modul, `eligibilitate.ts`, e folosit de raport, de coadă și de cron. Numerele se arată pe segmente (simple, variante) înainte de „Trimite catalogul”.

| Situația (număr pe producție [C]) | Regula |
|---|---|
| produs simplu activ cu SKU unic | pleacă |
| combinație activă (`combinatiiActiveUnice` [C: `src/lib/storefront/variants.ts:106`]) | pleacă ca produs `complex` |
| fără SKU: 2.836 de SKU vândabile, 48% din cele din afara esafero | SKU generat stabil, ținut numai în tabela de legătură (D8) |
| SKU duplicat fără majuscule, pe unitățile vândabile (produse simple active și combinații active, `lower(btrim(sku))`): 22 de SKU, 59 de unități, 4 magazine (caian-textile 13/41, esafero 7/14, jhbijuterii 1/2, royal-aoleu 1/2) [C: 13.10.2026] | blocat cu motiv. SKU-ul e unic pe website [A]; potrivirea fără majuscule e documentată numai la arhivarea în bloc [A], iar la unicitate e IPOTEZĂ (M-PROD-1), deci alegem varianta sigură |
| combinații active cu SKU-ul părintelui: 193 (191 pe produse active; 382 în datele brute, cu cele dezactivate) [C] | blocat |
| pachete: 22 | excluse (disponibilitatea vine din componente) |
| preț dependent de alegeri (`pretulDepindeDeAlegeri` [C: `src/lib/customization/pret.ts:512`]), din cele ~30 de produse personalizate efectiv (79 au `customization.enabled`, dar 49 dintre ele au câmpurile goale, deci codul nu le tratează ca personalizate) [C] | excluse |
| variante fără stoc pe combinație (stoc comun) | excluse: date fiecărei variante, s-ar vinde de N ori |
| `track_inventory = false` | D9 |
| fără descriere: 1.111 active | D10 (descrierea e obligatorie [A]) |
| fără imagine: 271 active (273 pe toate) [C] | pleacă, cu avertisment |
| categorie ambiguă / orfană / lipsă, pe produsele active: 16 / 6 / 560 (pe toate: 16 / 14 / 570) [C] | pleacă în categoria de rezervă „Fără categorie”, creată de noi, cu motivul. Documentația se contrazice: dosarul Categories cere o categorie pe fiecare produs, iar tabelul produsului o marchează opțională [A]. Nu ne bazăm pe „opțional” (M-PROD-3) |
| GTIN invalid (`isValidGtin` [C: `src/lib/gtin.ts:19`]) | pleacă fără EAN |
| preț 0 | blocat |

#### 5.4.2 Identificatori și idempotență
- **`easysales_produse`** are un rând pe unitate vândută, plus un rând `parinte` pe fiecare produs cu variante.
  - `id` vine din `easysales_id_seq` și devine `product_website_id` (respectiv `parent_id`).
  - Cheia e `(business_id, product_uuid, identitate)`, cu `identitate` = `''` (simplu), `'#parinte'` sau `identitateCombinatie(combo)` [C: `src/lib/storefront/variante-identitate.ts:52`].
  - `product_id` are `on delete set null`, iar `product_uuid` e o copie, ca rândul să rămână piatră de mormânt după ștergere.
- **SKU-ul trimis se îngheață** la prima trimitere, cu index unic pe `(business_id, lower(sku_trimis))`. O schimbare de SKU în Edinio nu se propagă. Motivul e documentat în ghidul easySales „Cum rezolvi produsele blocate și duplicate”: la un SKU schimbat, easySales creează un produs nou; preferințele contului „Arhivează automat produsele înlocuite” și „Mută ofertele” hotărăsc dacă produsul vechi se arhivează și dacă ofertele trec pe cel nou (ghid; comportamentul exact, IPOTEZĂ de confirmat, M-PROD-1). Cu prima preferință pornită, un SKU schimbat ar arhiva produsul vechi chiar în E3. Panoul arată „în easySales rămâne SKU-ul X”, iar migrarea voită e o acțiune explicită (E5).
- **SKU-ul generat:** `EDN-` + primele 10 caractere base32 din `sha256(product_uuid | identitate)`. E determinist și nu se scrie în produs; copierea în produse se face numai la cererea omului.
- **Numai Save.** Add dă 422 la duplicat pentru produse [A] (la categorii nu există exemplu), deci o reîncercare după timeout ar arăta ca un eșec.
- **`es_product_id`** (id-ul intern) se ia din citirea de verificare (`GET /products?website=&sku=`). `data.id` din răspunsul Save pe element e doar rezervă: exemplul lui e copiat identic de la Add, iar documentația nu spune ce e `data.id` [A]. Operațiile noastre ulterioare merg pe SKU.

#### 5.4.3 Categorii și caracteristici
- **Categorii:**
  - `category_website_id` vine din secvență și se ține în `easysales_categorii`;
  - fiecare nod pleacă cu numele căii („Femei > Rochii”), iar produsul primește doar frunza (D23);
  - categoria produsului se rezolvă de la numele din `products.category`, cu potrivire unică pe `(business_id, name)`: pe produsele active, 6.754 de potriviri unice, 16 ambigue, 6 orfane și 560 fără categorie [C]. Altfel produsul pleacă în categoria de rezervă „Fără categorie” (§5.4.1);
  - `data.id` (id-ul intern) al fiecărei categorii se păstrează în `easysales_categorii`;
  - redenumirea: Save cu același `category_website_id` e „created or updated” [A], dar câmpul nu e marcat unic la categorii, iar că un nume nou redenumește aceeași categorie e IPOTEZĂ (M-CAT-1). Calea documentată e `PUT /api/v2/categories/{id}` pe id-ul intern [A], folosită dacă M-CAT-1 arată că Save face duplicat;
  - ștergerea nu se propagă implicit: o categorie atașată dă 422 „Cannot delete attached categories!” [A]. Rutele `DELETE /categories/{id}` și `DELETE /characteristics/{id}` există, deși lista de scope-uri n-are unul de ștergere [A]; curățenia categoriilor goale e o hotărâre (E5), nu o imposibilitate.
- **Caracteristici:**
  - vin din axele variantelor (`page_sections.variants.options[].name`), din `page_sections.specifications` și din `page_sections.google` (`color`, `size`, `material`, `gender`, `age_group`);
  - cheia se normalizează: fără diacritice, cu litere mici, cu spațiile strânse („Mărime ” și „MARIME” devin una);
  - valorile pe combinație se scot cu `desparteTitlu` [C: `variante-identitate.ts:111`], nu cu `split(" / ")`, fiindcă unele valori conțin separatorul;
  - pe produs se trimit ca `[{id, value}]` [A]. Mai multe valori ca intrări repetate cu același id și valorile neescapate HTML sunt IPOTEZE (M-PROD-3).
- Pe produs, `categories[]` primește `category_website_id`, iar `characteristics[].id` primește `characteristic_website_id`, adică id-urile **noastre** („Category/Characteristic id used in your app” [A: tabelele Add, Save și Update product]). Save bulk n-are tabel propriu, dar trimite același obiect, cu id-urile noastre [A].

#### 5.4.4 Produsul, câmp cu câmp

| Câmp easySales [A: Save product] | Din Edinio [C] | Regula |
|---|---|---|
| `product_website_id` | `easysales_produse.id` | „Numeric, True (Unique)” [A]; număr sau șir după M-ID-1 |
| `sku` | `sku_trimis`, înghețat | obligatoriu, unic [A] |
| `name` | `products.name`; la variantă, `name (titlu)` | aceeași formă ca pe linia de comandă (`pretulLiniei` de pe server [C: `src/lib/orders/variant-guard.ts:39-67`]) |
| `type` | `simple`, sau `complex` pentru fiecare combinație | [A] |
| `parent_id`, `parent_name`, `parent_url` | rândul `parinte`, `products.name`, adresa produsului | „Parent internal id” [A]; dacă părintele se trimite separat e IPOTEZĂ (M-PROD-3) |
| `description` | `products.description`, HTML deja curățat | obligatorie [A]; fără un curățitor nou scris de noi; D10 la lipsă |
| `sale_price` | `products.price` sau `comboUnitPrice` [C: `variants.ts:273`], înmulțit cu (1 + cotă/100) dacă magazinul are TVA și prețuri fără TVA (`vat_enabled`, `vat_rate`, `prices_include_vat` stau în `store_settings`, nu în `businesses` [C]) | „including VAT” [A] |
| `full_price` | `pretVechiDeTaiat` [C: `src/lib/products/compare-at.ts:32`] sau `comboCompareAtPrice` [C: `variants.ts:288`], altfel egal cu `sale_price` | `/prices/bulk` cere ambele [A] |
| `tax_rate` | `vat_enabled ? vat_rate : 0`, din `store_settings` [C] | obligatoriu [A]; dacă 0 e o cotă validă pentru RO: M-PROD-4. La conectare, la un plătitor de TVA, se verifică că `vat_rate` e o cotă legală azi (21, 11 sau 0); o cotă nelegală oprește catalogul cu motiv. La neplătitori, `vat_rate = 19` e doar implicitul rămas (137 din 146 de magazine au `vat_enabled = false` cu 19 [C]) și se trimite 0 |
| `stock` | E3: 0; E4: `stocDeTrimis` (§5.5) | obligatoriu [A] |
| `weight` | `weight_grams / 1000`, dacă există (lipsește la 4.480 din 7.364 [C]) | kg [A] |
| `images` | `products.images`, cu `combo.image` primul, trecute prin `imaginiPentruEmag` [C: `src/lib/emag/imagini.ts:192`] | listă de adrese [A]; eMAG ignoră WebP fără eroare [C: antetul `imagini.ts`]; dacă easySales acceptă WebP: M-PROD-5 |
| `categories` | `[id-ul frunzei]` sau `[]` | opțional [A] |
| `characteristics` | axele (pe variantă), specificațiile și atributele Google (pe produs) | `[{id, value}]` [A] |
| `brand` | `page_sections.google.brand` | opțional [A] |
| `ean` | `page_sections.google.gtin` sau `combo.gtin`, validat | opțional [A]; GTIN-ul produsului nu coboară pe variante |
| `url` | `hrefProdus(storeBaseUrl(biz), slug sau id, prefix)` [C: `src/lib/storefront/permalinkuri.ts:231`, `src/lib/seo.ts:38`]; la variantă `adresaCuVarianta` [C: `src/lib/storefront/varianta-din-adresa.ts:21`] | opțional [A] |
| `handling_time` | setare pe magazin | opțional, în zile [A] |
| `supplier_sku`, `warehouse_location` | nu se trimit | opționale în tabelul Save [A] |
| `acquisition_price`, `height`, `meta_fields` | nu se trimit | apar doar în corpul exemplului, nedocumentate [A] |

Conversia imaginilor se cheamă așa cum e. Cheia e deterministă, deci copiile făcute pentru eMAG se refolosesc, iar comportamentul eMAG nu se schimbă. Documentația spune doar că prețurile **trimise** sunt cu TVA („Seller product sale price including VAT” [A]); ce întorc citirile nu e spus. Că se citesc înapoi nete (150 trimis apare „126.05” în exemple) e o deducție din exemple (IPOTEZĂ, M-PROD-4). Orice comparație se face cu toleranță de rotunjire.

#### 5.4.5 Încărcarea inițială
1. Întâi categoriile, apoi caracteristicile, prin `save/bulk`, câte cel mult 100. Rutele `save/bulk` n-au descriere în colecție; limita de 100 pe apel apare numai în ghidul oficial „Conectează un magazin personalizat” (IPOTEZĂ, M-PROD-2, ES-5).
2. Apoi produsele, prin `products/save/bulk`, câte cel mult 100 și sub ~1 MB pe corp. Un produs pleacă numai când imaginile lui sunt gata. Ce face un lot cu un element invalid nu e documentat: 422 pe tot lotul sau 200 cu prelucrare parțială tăcută (IPOTEZĂ, M-PROD-2). Dacă vine 422, lotul se înjumătățește recursiv până la elementul vinovat, iar acela se trimite cu Save pe element, ca să-i aflăm eroarea. Prelucrarea parțială tăcută o prinde verificarea de la pasul 3.
3. **Un lot terminat nu înseamnă reușită** (`data: null` [A]).
   - Verificarea citește `GET /products?website=<nume>&page=N` (50 pe pagină) și leagă pe doi martori, `product_website_id` și `sku`, cu completitudinea pe `meta.total` și `meta.last_page` [A].
   - Ce lipsește după 15 minute se retrimite o dată, cu Save pe element, apoi apare în „Probleme”.
   - Prima potrivire confirmă și legătura dintre token și numele website-ului.
   - **Paza website-ului redenumit:** `?website=<nume>` filtrează după nume [A]. Dacă omul redenumește website-ul în easySales, citirea dă zero și verificarea ar retrimite tot catalogul element cu element (zeci de mii de Save-uri la esafero). Înaintea oricărei retrimiteri în masă se confirmă că numele e încă în `GET /websites/list`; altfel, pauză pe catalog și notificare „Website-ul a fost redenumit în easySales”.
   - Dacă filtrul `?website=` e strict, ignorat sau parțial nu e documentat (IPOTEZĂ, M-PROD-7). Poarta „zero produse” din Treapta B (§4.2) se validează întâi cu un nume inexistent: dacă filtrul e ignorat, poarta ar refuza pe oricine; dacă e parțial, ar lăsa să treacă greșit.
4. Ordinul de mărime la esafero (37.010 SKU vândabile [C]): ~371 de cereri `save/bulk` și ~741 de pagini de verificare, deci ~1.100 de cereri, adică ~4,5 minute la 250 pe minut. Imaginile pot întinde încărcarea pe ore. Totul e un job reluabil (`easysales_joburi`), pe mai multe treceri ale cronului.

#### 5.4.6 Actualizările
- **Declanșatorul `easysales_marcheaza_produsul`, AFTER INSERT OR DELETE OR UPDATE OF** `name, description, price, compare_at_price, images, category, sku, weight_grams, page_sections, is_active, track_inventory, stock_quantity, slug, is_bundle` pe `products`, numai pentru magazinele cu `catalog_activ`.
  - Spre deosebire de `aboutyou_marcheaza_modificarea`, care e AFTER UPDATE OF, fără INSERT, fără DELETE și fără bloc de excepție [C: baseline 845-892, 13905], prinde și produsele noi, și ștergerile.
  - Are `exception when others then raise warning; return`, fiindcă stă pe drumul checkout-ului (`revendica_stoc_complet` scrie în `products`).
  - Face o singură inserare comasată în coadă.
- **Clasificarea modificării:**
  - preț → `articol_pret`;
  - stoc (`stock_quantity`, stocul combinațiilor, `track_inventory`) → `articol_stoc`;
  - restul, cu `page_sections` comparat fără cheile de stoc (`easysales_fara_stoc`) → `articol_continut`;
  - ștergere → `articol_sterge`.
  Așa se acoperă cele ~33 de locuri care scriu produse (18 în cod și 15 funcții SQL, multe pe drumurile de stoc ale comenzilor și marketplace-urilor) [C: 13.10.2026], fără chemări scrise de mână.
- **Schimbarea domeniului sau a permalinkurilor** nu atinge `products`, deci declanșatorul nu o vede, iar `url` și `parent_url` ar rămâne vechi la easySales. Salvarea acestor setări pune în coadă `articol_continut` pentru tot catalogul magazinului.
- **Procesarea:**
  - prețul merge prin `/products/prices/bulk`, câte cel mult 100;
  - pentru conținut se calculează amprenta fiecărui articol, fără stoc, și pleacă numai articolele schimbate: cu Save pe element până la 50, altfel în bloc, cu verificare;
  - stocul urmează §5.5.
- Pe `categories`, declanșatorul `easysales_marcheaza_categoria` prinde redenumirile și mutările.
- **Erori și ritm:**
  - un 422 pe element face articolul `respins`, cu mesajul aplatizat, în „Probleme”;
  - 429 și 5xx se reiau din coadă fără să consume încercări;
  - un 403 oprește catalogul magazinului (§4.6);
  - loturile de câte 100 și paginile de câte 50 trec prin jetonul comun (§5.0), iar încărcarea inițială rulează pe felii.

#### 5.4.7 Inactivare, ștergere, ecou
- **Inactivarea** (`is_active = false` sau `page_sections.stock_status = out_of_stock`) înseamnă stoc 0, care e reversibil. Nu se arhivează, fiindcă arhivarea dezactivează și dezleagă ofertele pe toate canalele [A], iar API-ul n-are nicio rută de restaurare (că restaurarea se face numai din interfață e o deducție din această absență; după centrul de ajutor, câte cel mult 50 pe cerere).
- **Variantele** (D30):
  - o combinație dezactivată sau ștearsă trece pe stoc 0 (implicit) sau se arhivează, după D30;
  - un produs simplu care primește variante: rândul `''` (produsul simplu) trece pe 0 și urmează aceeași regulă ca o combinație ștearsă, iar combinațiile pleacă drept produse noi; cazul invers se tratează simetric;
  - identitatea e stabilă numai când combinația are `uid`; altfel e amprenta titlului [C: `src/lib/storefront/variante-identitate.ts:52-54`]. Redenumirea unei combinații fără `uid` ar produce o identitate nouă, apoi un SKU generat nou, apoi un produs nou la easySales. Înainte de a aloca o identitate nouă pe un produs care are deja rânduri, se caută potrivirea după SKU-ul trimis; o potrivire nesigură apare în „Probleme”. Câte combinații n-au `uid` se măsoară înainte de E3;
  - la citire nu ne bazăm pe `type` sau `parent_id`: exemplele contrazic regula documentată [A].
- **Ștergerea:**
  - stocul trece pe 0 imediat (din E4), apoi urmează `archive/bulk` (setare implicit pornită, D21), cu rezultatele `archived`, `not_found`, `blocked` [A];
  - `blocked` (comenzi active) se reia zilnic timp de 14 zile, apoi pleacă o notificare;
  - rândul de legătură rămâne, cu starea `arhivat`;
  - rândurile `arhivat` sunt excluse explicit din orice împingere (stoc, preț, conținut) și din potrivirea vânzărilor externe (§5.6);
  - după articolul de suport din 08.2024, produsele arhivate se șterg definitiv după 30 de zile; ghidul din 29.09.2026 spune o lună (ES-25). Ce face un Save pe un SKU arhivat sau purjat nu e documentat (ES-25); reconectarea după 30 de zile trece rândurile `arhivat` în starea `nou`, iar retrimiterea lor e o acțiune a omului.
- **Un SKU confirmat care dispare la ei** (arhivat de om din interfața lor sau, IPOTEZĂ, „Product not found” la stoc: ce răspunde `/stocks/bulk` pentru un SKU arhivat nu e documentat) nu se recreează automat. Apare în „Probleme”, cu „Retrimite” sau „Exclude”, ca integrarea să nu schimbe ce a hotărât omul (lecția „integrarea nu schimbă magazinul”, din proiectul-frate).
- **Ecoul:** nu ne abonăm la `product-*`, `category-*`, `characteristic-*`, fiindcă sursa suntem noi.

#### 5.4.8 Stocul în E3
Toate produsele pleacă cu `stock: 0`. Comerciantul își poate mapa categoriile și crea oferte, dar nimic nu se vinde. După ghid, legarea unei oferte de marketplace de un produs al website-ului îi sincronizează stocul cu al produsului, iar ofertele nelegate rămân neatinse. Autolink leagă ofertele de produsele magazinului după SKU, EAN, nume, ID sau „Product Website ID” (centrul de ajutor); e o acțiune manuală, cu plafon de 100 (ghid). Avertisment explicit în panou: „Nu lega (manual sau prin Autolink) ofertele active de produsele Edinio până la pornirea stocului: ar trece pe 0.”

### 5.5 F5: prețul (din E3) și stocul (din E4) spre easySales
**Prețul:** `PATCH /products/prices/bulk`, cu `sale_price` și `full_price` brute [A]. Rezultatul vine sub `data.result` (`success[]`, `errors[]`) și se citește pe SKU, deși singurul exemplu arată doar reușite [A].
- **Prețul de pe marketplace:** după centrul de ajutor, prețul ofertei poate diferi de al produsului (adaos procentual, decuplare, Autoprice), iar ofertele au rute de preț proprii [A: dosarul Offers]. Dacă `prices/bulk` se propagă imediat la ofertele cuplate (cu adaosul și cu Autoprice peste el) și dacă trece peste prețurile decuplate nu e documentat (ES-32). Panoul spune că o schimbare de preț în Edinio poate ajunge pe marketplace; conversia pentru piețele în HUF, BGN sau EUR rămâne a easySales (IPOTEZĂ). **Siguranța de masă pe preț:** dacă o trecere ar schimba cu mai mult de 20% prețul la peste 30% din articole sau la peste 200 de articole, se oprește și cere confirmare (pragurile, D22).

**Stocul:** `PATCH /api/v2/stocks/bulk`, cel mult 100 de SKU pe cerere [A]. Valoarea e absolută și o calculează în clipa trimiterii o singură funcție, `stocDeTrimis`, folosită și de derivă.
- **Valoarea pe articol:**
  - produs simplu cu stoc urmărit: `stock_quantity`; combinație: `stock_quantity` din `page_sections.variants.combinations[]`, citit tolerant, fiindcă 1.094 de combinații îl țin ca șir (1.066 pe produse active) [C: 13.10.2026];
  - inactiv, `out_of_stock` sau șters: 0; stoc neurmărit: după D9; variante cu stoc comun: nu se trimit, rămân pe 0;
  - rândurile `arhivat` nu se trimit niciodată (§5.4.7).
- **Modelul de stoc al easySales** cu „Sursă stoc produse: Website” nu e documentat în API. Centrul de ajutor descrie: la intrarea unei comenzi, easySales **rezervă** cantitatea (în API, `reserved_stock`, alt câmp decât `stock`), nu scade copia; rezervarea dispare la finalizare (generarea AWB-ului finalizează comanda) sau la factură; scăderea efectivă se face „la finalizare” sau „la facturare”, după o setare a contului introdusă în 10.2025, cu bifa „Scade stocul la emiterea unei facturi noi” (IPOTEZĂ, M-STOC-1, ES-8, ES-22).
- De aceea `stocDeTrimis` e un **parametru cu două variante scrise dinainte**, alese după M-STOC-1:
  - **(a) model cu scăderea copiei:** trimis = max(0, E − Z_ext), unde Z_ext sunt vânzările externe văzute la easySales și încă neconsumate în Edinio. Fără scădere, o împingere făcută între vânzarea pe marketplace și consumul ei în Edinio ar învia bucata;
  - **(b) model cu rezervare:** trimis = E + R_consumate, unde R_consumate sunt rezervările easySales pentru comenzile (externe sau ale vitrinei) deja consumate în Edinio și încă nefinalizate la ei; Edinio le știe din `easysales_comenzi`. Fără adaos, aceeași bucată s-ar scădea de două ori, o dată în Edinio prin consum și o dată prin rezervare, până la AWB sau factură, la fiecare vânzare;
  - M-STOC-1 măsoară separat comanda de vitrină trimisă prin API și comanda de marketplace (sau manuală), sub ambele setări de scădere. Până atunci nu pleacă stoc real (E4 nu pornește).
- **Ordinea:** înaintea fiecărui lot de împingeri al unui magazin, aceeași trecere de cron citește lista de comenzi externe (§5.6), dacă ultima citire e mai veche de 60 de secunde; în modelul (b) citește și rezervările comenzilor consumate. La fel se procedează la `stock-refresh-requested` și `account-activated`, care retrimit tot stocul.
- **Gărzi:**
  - o citire picată din baza noastră, sau una cu mai puține rânduri decât s-au cerut, nu trimite nimic;
  - **siguranța de masă:** dacă o trecere ar pune pe 0 peste 30% din SKU-urile active care aveau stoc, sau peste 200 de astfel de SKU, se oprește și cere confirmare (D22);
  - `products[].stock` din răspuns trebuie să fie valoarea trimisă, iar `errors[]` și `error_messages[]` se citesc pe fiecare SKU [A].
- **Deriva** se verifică pe o felie zilnică, citită cu `GET /products?website=<nume>&page=N` sau țintit cu `?sku=` [A]. Nu se folosește niciodată `/products/stock/list`, care nu are filtru de website și pare sortată după stoc [A].
  - dacă stocul lor e mai mare decât `stocDeTrimis`, se trimite valoarea noastră (direcția sigură);
  - dacă e mai mic, **nu se trimite nimic**. Se recitesc comenzile pe acel SKU (`GET /orders?product_sku=<sku>&modified_after=…` [A]); dacă o comandă nevăzută explică diferența, se consumă. Dacă nu, după două observații la rând pornește alarma „diferență neexplicată”. Cauzele posibile: sursa de stoc greșit setată, o editare în interfața lor, comenzi invizibile pentru token sau, în modelul (b), chiar rezervarea lor;
  - regula „numai în jos” se revizuiește după M-STOC-1: dacă easySales își scade copia la finalizare sau la factură, o valoare mai mică la ei poate fi corectă, iar regula ar fixa o sub-numărare produsă chiar de easySales.
- **Verificarea de comportament a sursei:** tiparul măsurat în M-STOC-1 și M-STOC-2 devine o verificare automată, după prima vânzare externă și apoi pe un eșantion zilnic. O abatere trimite „Verifică «Sursă stoc produse» în easySales”.
- **Rezervările:** `reserved_stock` se afișează în panou. Varianta (b) e chiar corecția pentru rezervările comenzilor deja consumate de noi; fără ea, sub-numărarea ar apărea la fiecare vânzare, nu doar temporar. Care variantă se aplică hotărăște M-STOC-1, nu o presupunere.
- **Opririle:** cele planificate (deconectarea, pauza buclei, abonamentul Edinio care expiră, D12) pun întâi stocul pe 0, verificat pe SKU. Cele neplanificate (token mort, cont suspendat) trimit o notificare urgentă și o alertă de admin, fiindcă atunci nu mai putem scrie.
- **Identificatori și idempotență:** stocul și prețul merg pe SKU-ul înghețat [A: `/stocks/bulk` și `/prices/bulk` lucrează pe SKU]. Valoarea e absolută, deci o împingere repetată cu aceeași valoare nu strică nimic, iar coada comasează pe articol.
- **Erori:**
  - un SKU din `errors[]` cu „Product not found” ajunge în „Probleme”, fără recreare automată (§5.4.7);
  - 429 și 5xx se reiau fără să consume încercări;
  - un lot cu răspuns necitibil se recitește țintit (`?sku=`) înainte să fie socotit trimis.
- **Latența țintă:** o vânzare din vitrină ajunge în easySales în 1-2 minute (coada rulează la minut).

### 5.6 F6: vânzările din celelalte canale scad stocul Edinio (E4)
**Precondiția (M-EXT-1, M-EXT-2):** tokenul website vede în listă comenzile marketplace-urilor și pe cele manuale, iar liniile lor poartă `products[].product_data.id` și `sku`. Documentația API nu spune ce comenzi vede un token website (IPOTEZĂ, ES-12, ES-26), iar ghidul numește Personal Access Token-ul „account-wide rather than shop-scoped”, ceea ce sugerează că tokenul website e legat de un singur magazin: un rezultat negativ e cel puțin la fel de probabil. De aceea M-EXT-1 merge primul în E0, iar D3 se hotărăște înainte de E1. `product_data` și `offer` apar pe linii numai în Get Order (lista are pe linii `product_website_id`), iar ce e `product_data.id` nu e definit (IPOTEZĂ, M-EXT-2) [A].
- Dacă nu le vede, se măsoară același lucru cu un Personal Access Token (care, după ghid, acoperă tot contul: IPOTEZĂ). Tokenul s-ar păstra ca al doilea secret, numai pentru citirea comenzilor (D3).
- Dacă nici așa nu merge, E4 nu se livrează: catalogul rămâne pe 0 sau se retrage, iar modul B se discută numai cu răspunsuri scrise (§5.9).

**Semnalele:**
- banda de listă, din E4 la 1-2 minute: `GET /orders?modified_after=<marcaj − 3 h>&per_page=100` [A]; aceeași citire servește și F2. E **singurul semnal sigur** pentru E4;
- webhook-urile `order-created` și `order-updated`, ca semnale opționale: dacă `order-created` vine și pentru comenzile de marketplace nu e documentat, iar singurul exemplu e o comandă API (IPOTEZĂ, M-WH-2, ES-11);
- `product-stock-updated`, cel mult ca semnal opțional de recitire a comenzilor, niciodată de stoc: documentația nu spune când se trimite, iar ghidul pentru magazinul personalizat spune că stocul nu se întoarce (IPOTEZĂ, probabil falsă pentru un website API V2; M-STOC-2, ES-8).

**Clasificarea fiecărei comenzi** (citită cu `GET /orders/{internal_id}`)

| Cazul | Cum se recunoaște | Ce facem |
|---|---|---|
| comanda noastră | `es_internal_id` sau `es_order_id` în `easysales_comenzi`, direcția „ieșire” | F2 |
| canal conectat nativ în Edinio | harta explicită `marketplace_name` → canal. Documentația arată pe linia comenzii un singur exemplu, „PepitaHU” (`marketplace_id` 26), iar numele „Emag” (1), „EmagHU” (6), „EmagBG” (7) vin din `GET /marketplaces/list` [A]; harta se completează din M-MKT-1 | nu se consumă niciodată; notificare urgentă „canal pe două drumuri” |
| onorată de marketplace sau de un 3PL (ex. FBE la eMAG) | filtrul documentat `fulfillment_service_id` și `GET /fulfillments/list` [A] (scope `read-fulfillment-services`, după nume), plus canalele FBE văzute în aplicația lor (`EmagROFBE` 41, `EmagHUFBE` 55, `EmagBGFBE` 56, IPOTEZĂ); cum apare în API o astfel de comandă e ES-20 | nu se consumă: marfa e deja la ei, ca la integrarea nativă eMAG [C: `onoratDeEmag`, `src/lib/emag/orders.ts:1245-1254`]; centrul de ajutor spune la fel pentru FBA |
| vânzare a produselor noastre | linii cu `product_data.id` egal cu `es_product_id` al unui articol **și** SKU egal: doi martori | se consumă |
| linii fără pereche | inclusiv produsele altor website-uri ale contului, chiar cu același SKU | nu se consumă; raportul „nelegate” spune că ofertele nu sunt legate de produsele Edinio. Dacă vânzările de pe alt website al contului, cu același SKU, trebuie să consume stocul Edinio (comerciantul care vine de pe WooCommerce sau Gomag, cu ofertele încă legate acolo) e D32, iar mutarea ofertelor e ES-24 |

**Momentul:** consumul se face la prima vedere a comenzii vii. O comandă văzută prima dată deja anulată sau returnată nu consumă [C: regula `seConsumaLaIntrare`, `src/lib/emag/orders.ts:135-138`, cu explicația la `:107-134`, aplicată la `:1254`].

**Modificările de linii după consum.** `consuma_stoc_comanda_marketplace` consumă o singură dată, pe marcajul `stoc_marketplace_la`. Un storno parțial sau un produs adăugat pe o comandă deja consumată ar lăsa stocul greșit, fără niciun semn. La fiecare recitire a unei comenzi externe deja consumate, liniile se compară cu cele consumate, iar diferența trece prin `ajusteaza_stoc_comanda_marketplace`, ca la eMAG și Pepita [C: `src/lib/emag/orders.ts:1484`, `src/lib/pepita/ingest.ts:1382`]. Ce arată API-ul despre liniile modificate (cantitatea inițială, stornarea) e ES-21; proba urmează modelul Pepita.

**Înregistrarea**, pe modelul ingestiei eMAG și Pepita

| Edinio (`orders`) | Din easySales [A: Get Order] | Regula |
|---|---|---|
| `order_number` | `ES-<internal_id>` | unic pe magazin [C: `orders_order_number_business_unique`] |
| `order_source` | `{marketplace: "easysales", canal: <marketplace_name>, easysales_internal_id}`, plus `currency` dacă nu e RON | scris numai pe server, fără `ga_client_id`. Scoate comanda din Meta, TikTok, email marketing și conturi [C]. La GA4 excluderea se sprijină doar pe faptul că ingestia nu cheamă raportarea: o comandă cu plată marcată de mână ar putea pleca în GA4 dacă bannerul magazinului e oprit sau dacă `order_source` are `ga_client_id` [C]. De aceea ingestia nu scrie niciodată această cheie, iar o probă o cere |
| `status` | maparea din F2, aplicată și aici, cu `elibereazaStoc` scris explicit (§5.2) | intră în `orders_status_check` [C: baseline 13201] |
| `payment_method`, `payment_status` | `"easysales"`; `paid` dacă `payment_status` e „Paid”, altfel `unpaid` | cheia apare cu „Paid” într-un singur exemplu, al listei; Get Order n-o are [A]. Se citește deci din banda de listă, iar lipsa cheii nu înseamnă „neplătit”: se lasă `unpaid`, cu steagul „plată necunoscută”, fără efecte. Semantica lui „Paid” e IPOTEZĂ (M-COM-8); `easysales` nu e procesator, deci nu intră în `marfaAPlecatFaraBani` [C] |
| `items[]` | `product_id`, `variant_title`, `name`, `quantity`, preț brut pe bucată = total net × (1 + cotă) / cantitate, `vat_rate` = `tax` × 100 | în răspunsuri `price` și `total` sunt nete, iar `tax` e fracție, „0.19” [A] |
| `subtotal`, `shipping_cost`, `total`, `vat_amount` | din linii, din `charges[]` (`type`: shipping, fee, discount), din `total_value` și `tax` | ce înseamnă `value` față de `total_value` e IPOTEZĂ (exemplele nu se adună [A]); banii sunt o fotografie, nu se resocotesc |
| `prices_include_vat` | `true` | ca la eMAG [C: `emag/orders.ts:1086`] |
| `customer_name`, `customer_phone`, `shipping_address` | după D6: minim (nume, oraș, județ) sau complet | coloane NOT NULL [C: baseline 12158 și următoarele]: se scrie șir gol sau obiect minimal, niciodată `null`. La eMAG și Trendyol, un 23502 face comanda „sărită” și parcată [C: `src/lib/emag/orders.ts:1130-1191`, `src/lib/trendyol/orders.ts:564`], adică o vânzare fără consum de stoc; la easySales, orice inserare respinsă devine `blocata`, cu notificare (mai jos) |
| `customer_email` | `null` | ca la eMAG [C: `emag/orders.ts:1066`] |

- **Consumul:** `consuma_stoc_comanda_marketplace` [C: baseline 3264], idempotent prin `stoc_marketplace_la`. Plafonarea la zero se face în `consuma_stoc_marketplace` [C: baseline 3321, cu plafonul la 3341 și 3348], chemată la 3308; funcția întoarce lista `lipsa` [C: 3316], iar `stoc_rezervat` primește ce s-a consumat, nu ce s-a cerut [C: 3311]. O `lipsa` nevidă devine **notificare urgentă de posibilă supravânzare** („cerut X, disponibil Y”).
- **Propagarea:** `impingeStoculPeCeleLalteCanale(businessId, ids, "easysales")` [C: `stoc-pe-canale.ts:72`] duce noul stoc pe canalele native rămase și pe Google Merchant. `CanalVanzator` primește `"easysales"`, dar `Canal` nu, fiindcă împingerea spre easySales o face declanșatorul de pe `products`.
- **Ciclul comenzii:**
  - `MARKETPLACE_CU_CICLU_PROPRIU` primește `easysales` [C: `origin.ts:115`], deci `updateOrder` refuză schimbarea stării;
  - `cineTineComanda` [C: `origin.ts:187-199`] primește ramura „AWB-ul și factura se fac în easySales”; textul implicit de azi spune „se fac de aici”;
  - `maybeAutoInvoice` iese deja pentru cheia necunoscută [C: `invoice-auto.actions.ts:205`];
  - AWB-ul propriu și facturile manuale se refuză (§7.3);
  - anularea dă `cancelled`, cu eliberarea stocului și propagare; returul dă `refunded`, cu `elibereazaStoc: false`. Maparea o scrie apelantul easySales, explicit, după modelul `src/lib/emag/orders.ts:906`, `src/lib/trendyol/orders.ts:374` și `src/lib/aboutyou/orders.ts:601`; `tranzitieComandaMarketplace` doar transportă steagul [C: `:88`, `:191`]. Completed și livrarea urmează maparea din F2.
- **Idempotența are trei paze:** unicitatea `(business_id, "intrare", es_order_id)` în `easysales_comenzi`, unicitatea `order_number` și `stoc_marketplace_la`.
  - O citire picată a legăturii întoarce `failed` (marcajul nu avansează), nu `skipped`.
  - Orice inserare eșuată pe date devine `blocata`, cu notificarea urgentă „vânzare externă neînregistrată: stocul nu s-a scăzut”.
- **Pornirea simetrică:** la pornirea buclei se listează comenzile externe deschise (nefinalizate, neanulate) cu SKU-uri Edinio, iar omul alege dacă le consumă (recomandat, dacă stocul din Edinio e cel fizic).
- **Umbra și canarul:**
  - Dacă există deja vânzări pe aceleași SKU-uri (un comerciant care vinde azi prin easySales din altă sursă), E4a rulează în umbră cel puțin 14 zile sau 30 de comenzi. Clasifică și scrie „ce aș consuma”, fără efect.
  - Umbra probează citirea comenzilor și potrivirea pe SKU, dar nu și legarea pe id, fiindcă produsele altei surse au alt id.
  - De aceea E4b pornește întâi pe un canar de 5-20 de SKU-uri alese de om, cu stoc real și consum real, comparat zilnic, apoi pe tot catalogul. Fără trafic preexistent, se trece direct la canar.

### 5.7 F7: sănătatea, contul, reîmprospătările (din E1)
- Zilnic se verifică:
  - tokenul (§4.6);
  - `GET /account`: abonamentul, proba, cota de comenzi `current_orders`/`max_orders` [A];
  - `GET /websites/list`: website-ul nostru apare încă, cu `status` „active” (singura valoare văzută în exemplu; ce înseamnă și ce alte valori are e IPOTEZĂ, M-AUTH-4) [A];
  - `GET /webhooks`: abonările există și ultima livrare a reușit.
- „Liniște suspectă”: un magazin cu comenzi trimise și fără niciun webhook în 24 de ore primește notificare.
- `products-refresh-requested` și `stock-refresh-requested` [A] se tratează numai dacă amprenta `website.token` din payload e a noastră (comparată în timp constant, niciodată scrisă în jurnal). Documentația le dă doar numele, slug-ul și payload-ul `{website: {url, name, token}}`, fără să spună ce le declanșează și ce se așteaptă [A]. Că cer retrimiterea catalogului, respectiv a stocului, e o deducție din nume (IPOTEZĂ, M-WH-4); le tratăm așa, cel mult o dată pe oră, prin gărzile din §5.5.
- **Abonamentul Edinio:** dacă planul magazinului expiră (okxi are `plan_expires_at` 11.10.2026 și primește comenzi [C]), bucla nu se oprește tăcut. D12 hotărăște perioada de grație, după care stocul se pune pe 0 și integrarea intră în pauză.

### 5.8 Bugetul de cereri

| Flux | Volum măsurat [C] | Cereri |
|---|---|---|
| comenzi trimise | vârful pe platformă: 37 pe zi la un magazin (okxi, eMAG); din vitrină, 36 | ~3 pe comandă |
| recitiri de comenzi (F2) | ~5 pe ciclul unei comenzi | plus banda de listă: 288 pe zi la 5 minute, 1.440 pe zi la un minut (din E4) |
| vânzări externe (E4) | okxi: 57 de comenzi eMAG în ultimele 30 de zile (13.10.2026) | o citire pe comandă |
| catalogul inițial esafero | 37.010 articole | ~1.100 (~4,5 minute) |
| actualizare în masă la esafero | 45.322 de rânduri easySales (20.09) | ~454 de cereri de stoc sau de preț, ~2 minute |
| derivă la esafero | 741 de pagini | o trecere pe zi, pe felii |
| token, cont, abonări | | ~10 pe zi |

Plafonul nostru e de 250 de cereri pe minut pe contul easySales, adaptat după `X-RateLimit-Remaining`. Numai încărcările mari se apropie de el, iar ele rulează pe felii.

### 5.9 Modul B: condițiile fără de care nu se pornește
Modul B se pornește numai dacă E4 se dovedește imposibilă și easySales confirmă în scris semantica stocului. Atunci sunt obligatorii:
- umbră de cel puțin 14 zile („ce aș scrie”, calculat și jurnalizat), apoi faza „doar scăderi”, apoi cea completă, la decizia omului;
- formula cu comenzile Edinio „în zbor” calculată din `orders`, nu din tabela de legătură, inclusiv comenzile refuzate, blocate sau neștampilate, plus pornirea simetrică (stocul de pornire include comenzile deschise);
- scăderile se aplică imediat, iar creșterile se amână 2 minute după o scriere străină pe produs (`updated_at`, ținut de `set_products_updated_at` [C: baseline 13909]), din cauza ferestrei `revendicaStocul` → inserare;
- un articol e „dispărut” abia după două treceri complete la rând (`meta.total`); o trecere care ar pune pe 0 peste 20% cere confirmare;
- stoc doar-citire și pe server pentru unitățile oglindite, feedurile de stoc oprite și o politică de stoc la orice oprire;
- o gardă pentru intervalul dintre finalizare (AWB) și factură, când rezervarea a dispărut, iar stocul încă n-a scăzut. Momentul scăderii efective e o setare a contului easySales din 10.2025 („la finalizarea comenzii” sau „la facturare”, cu bifa „Scade stocul la emiterea unei facturi noi”), nu o regulă fixă (IPOTEZĂ, centrul de ajutor; M-STOC-1).

## 6. Webhook-uri

### 6.1 Evenimentele
Webhook-urile grăbesc lucrurile, dar niciun flux nu depinde de ele. Banda de listă și plasa orară (§5.2, §5.6) aduc oricum starea comenzilor și vânzările externe. Fără webhook-uri se pierd numai legătura pe id storno-factură (§6.6) și cererile lor de reîmprospătare.

| Slug [A] | Abonat din | Ce face Edinio |
|---|---|---|
| `order-updated` | E2 | comanda noastră: recitire (F2). Altă comandă: din E4, semnal opțional de recitire, numai dacă M-WH-2 arată că vin și comenzile altor canale |
| `awb-created`, `invoice-created` | E2 | recitirea comenzii |
| `storno-invoice-created` | E2 | recitirea comenzii; datele stornării se păstrează ca date, nu doar ca semnal (§6.6) |
| `delivery-status-updated` | E2, dacă abonarea reușește (M-WH-3) | recitirea comenzii |
| `order-created` | E2 | comanda noastră în starea `necunoscut`: grăbește `GET /orders?order_display_id=<es_order_id>` (§5.1.5). Din E4, semnal opțional pentru vânzările externe, numai dacă M-WH-2 confirmă că vine și pentru comenzile de marketplace |
| `product-stock-updated` | E4, numai dacă M-STOC-2 îl arată util | semnal de recitire a comenzilor, niciodată scriere de stoc |
| `products-refresh-requested`, `stock-refresh-requested` | E1 (prelucrate din E3, respectiv E4) | §5.7 |
| `account-suspended`, `account-activated` | E1 | pauză sau reluare, cu notificare (§4.6), după recitirea `GET /account` |
| `product-created`, `product-updated`, `category-*`, `characteristic-*` | niciodată | sursa suntem noi |

Evenimentele primite înaintea etapei care le prelucrează se marchează „ignorate” în inbox.

**Precizări pe evenimente**
- **`delivery-status-updated`.** Evenimentul există: are un exemplu de payload, cu `webhook.id` 15 [A]. Ghidul din 09.2026 îl trece printre evenimentele recomandate pentru abonare, câte o abonare pe eveniment (IPOTEZĂ, ghid). Slug-ul lipsește însă din tabelul oficial „List of supported webhook events and slugs” și nu are niciun exemplu de abonare [A]. Dacă abonarea reușește, se măsoară în M-WH-3 și se întreabă la ES-11. Un refuz nu oprește celelalte abonări (§6.7), iar E2 nu depinde de el.
- **`order-created` pe comenzile noastre.** Că `id` din payload e `es_order_id` e IPOTEZĂ (M-WH-2), nu [A]. Exemplul nu e legat de nicio cerere. Iar în `delivery-status-updated`, `order.id` pare `internal_id`, dar documentația nu spune ce e: e o deducție din exemple. Acolo `order.id` e numărul `5`, aceeași valoare ca `internal_id` din exemplele `order-created` și `order-updated` [A]. Și `value` e tot `"964.15"`, ca la `order-created` [A]. În exemplele de comandă, `id` e un șir (`"26666433"`, `"5241398"`) [A]. Că `id` nu înseamnă peste tot același lucru e deci IPOTEZĂ de confirmat (M-WH-3), bine sprijinită de valori și de tipuri. Rezultatul `necunoscut` se confirmă așadar pe răspunsul GET-ului, nu pe payload. Forma lui `id` când `order_id` e un șir prefixat se află în M-ID-1. Evenimentul vine pentru comenzile noastre numai dacă propriile scrieri se întorc la noi (ecoul, §6.8).
- **Semnalele pentru E4 sunt opționale.** Singurul semnal sigur e banda de listă `GET /orders?modified_after=…` (§5.6).
  - Pentru ce comenzi se emite `order-created` nu e documentat. Tabelul are doar „Order created”, iar singurul exemplu e o comandă de website API, cu `website: "API"` și `marketplace: null` [A] (M-WH-2, ES-11).
  - Când se trimite `product-stock-updated` nu e documentat [A]. Ghidul pentru magazinul personalizat spune că stocul nu se întoarce și nu-l trece printre evenimentele la care te abonezi. Ipoteza că vine la o vânzare pe alt canal e deci probabil falsă (IPOTEZĂ, ghid; M-STOC-2, ES-8). În M-STOC-2 se face o abonare de probă. Evenimentul intră în producție numai dacă sosește la o vânzare pe alt canal și nu se întoarce la fiecare `/stocks/bulk` al nostru (M-WH-2). Altfel, o actualizare în masă ar aduce zeci de mii de livrări fără folos.
- **Reîmprospătările.** Documentația dă numai numele, slug-ul și payload-ul `website {url, name, token}` [A]. Ce le declanșează și ce așteaptă de la noi nu e descris, deci reacția din §5.7 e alegerea noastră.
- **Evenimentele de cont** nu au exemplu de payload [A] (M-ACC-1). Ca un eveniment fals să nu poată opri integrarea, pauza se pune numai după recitirea `GET /account`. Dacă recitirea arată contul în regulă, rămâne doar notificarea. Ce răspunde API-ul unui cont suspendat se află în M-ACC-1 și ES-14.
- **Lista se poate schimba.** `storno-invoice-created` pare adăugat de curând: exemplul lui are data 28.09.2026 [A], iar blogul lor l-a anunțat în 09.2026. Cum anunță easySales schimbările de API e ES-28. O livrare cu slug neașteptat se păstrează în inbox, fără prelucrare, și se numără în panou.

**Cum se găsește comanda din eveniment.** Tipurile diferă între exemple: `order_id` e șir la `invoice-created` și număr la `storno-invoice-created` [A]. De aceea toate comparațiile se fac pe text.

| Eveniment | Identificatorii din payload [A] | Căutarea în `easysales_comenzi` |
|---|---|---|
| `order-created`, `order-updated` | `order.internal_id`, `order.id`; fără `order_display_id` | `es_internal_id`, apoi `es_order_id` |
| `awb-created`, `invoice-created` | `order_id`, `order_display_id` (sub `awb`, respectiv `invoice`); fără `internal_id` | `es_display_id`, apoi `es_order_id`; ce e `order_id` aici nu e definit (M-AWB-1, M-INV-1) |
| `storno-invoice-created` | `storno_invoice.order_id`, `storno_invoice.order_display_id` | ca la factură |
| `delivery-status-updated` | `order.id`, `order.order_display_id` | `es_display_id`; `order.id` se încearcă numai pe `es_internal_id`, niciodată pe `es_order_id` (IPOTEZĂ, M-WH-3) |

O comandă negăsită e a altui canal (semnal pentru E4) sau se ignoră (§5.2).

### 6.2 Ruta și adresa
- Ruta e `src/app/api/easysales/webhook/route.ts` și exportă numai `POST`.
- Adresa e `/api/easysales/webhook?businessId=<uuid>&t=<jeton>`. Se construiește numai cu `adresaPublica()` [C: `src/lib/adresa-publica.ts:30`], care urcă singură apexul la `www` (`:42`).
- **De ce `www`.** Apexul `edinio.com` răspunde 308 către `www` și la POST [C: măsurat pe 12.10.2026, `POST https://edinio.com/api/nu-exista-proba` → 308 spre `https://www.edinio.com/api/nu-exista-proba`]. Nu știm dacă expeditorul lor urmează redirectările; pe `www` întrebarea nu se mai pune.
  - Redirectarea vine din setarea de domeniu din panoul Vercel, nu din depozit. În `src/proxy.ts`, cererile `/api/` ies devreme (`:188-193`), înaintea ramurii apex → `www` (`:233-240`). `vercel.json` nu are redirectări, iar `redirects()` din `next.config.ts` nu se ocupă de apex. Codul singur ar lăsa deci `/api` să treacă pe apex.
  - Comentariul din `src/proxy.ts:216-221` (măsurat pe 04.09) spune încă 307, deci e învechit.
- **Jetonul** are 32 de octeți aleatori, e diferit pe fiecare magazin și se păstrează ca hash.
  - Stă în query string, deci ajunge în jurnalele de cereri ale platformei. Poate să-l arate și easySales: `GET /webhooks` întoarce `url`-ul abonării [A]. Exemplul are însă o adresă fără query string [A]. Că `url` se întoarce întreg, cu query string și deci cu jetonul, e IPOTEZĂ de confirmat (M-WH-1, citind `GET /webhooks` după o abonare pe adresa noastră). De ea depinde și recunoașterea abonării noastre după `businessId` (§6.7). E o încuietoare de intrare, nu un secret de durată.
  - De aceea codul nostru nu scrie niciodată adresa întreagă în jurnal, iar modul `impune` al semnăturii (§6.3) se atinge cât mai repede.
- **Poarta MFA.** Cererile lor vin fără cookie. `/api/` iese devreme spre `poartaMfaApi` [C: `src/proxy.ts:192`], care lasă să treacă orice cerere fără cookie de sesiune [C: `src/lib/auth/poarta-mfa.ts:122`]. Ca la celelalte webhook-uri de integrări, calea intră și în `API_FARA_POARTA` [C: `poarta-mfa.ts:214`, rândurile 237-243].

### 6.3 Autentificarea: două încuietori
1. **Jetonul din URL**, comparat în timp constant cu hash-ul păstrat.
2. **Antetul `Signature`.**
   - Formula e `hash_hmac('sha256', json_encode($payload), $secret)` [A: „How signing requests works”]. Ieșirea în hex e implicitul lui `hash_hmac`. `json_encode` fără opțiuni scrie `\/` și `\uXXXX`, fără spații. Acestea țin de PHP, nu de documentație.
   - Semnătura se calculează deci peste **octeții bruți** ai corpului, niciodată peste un `JSON.stringify`, care ar da alt șir.
   - IPOTEZĂ de confirmat (M-WH-1, ES-11): ce acoperă `$payload` și ce octeți pleacă. Documentația nu spune dacă `$payload` e tot corpul `{payload, webhook}` sau numai valoarea cheii `payload`. Nu spune nici că șirul semnat e chiar corpul trimis. Textul lor despre semnare și reîncercări e copiat aproape literal din README-ul pachetului `spatie/laravel-webhook-server`, fără să-l numească. Propoziția de acolo care leagă corpul de șirul semnat („The body of the request will be JSON encoded version of the array passed to `payload`”) n-a fost preluată.
   - Se calculează deci două variante, amândouă fără reserializare: (a) pe tot corpul; (b) pe subșirul brut al valorii `payload` din corp. Se adaugă un control, (c): tot corpul, cu cheia goală. O potrivire pe (c) nu înseamnă semnătură bună, ci „secret nepreluat”: secretul n-a ajuns la ei sub numele trimis (§6.7).
   - Exemplele din documentație nu sunt corpuri brute. Sunt indentate, au `/` neescapat, iar cele de comandă au `=>` din PHP [A]. Nu servesc drept fixturi: fixturile vin din corpurile reale prinse în E0 (§9.4).

**Cum se aplică, pe fiecare magazin**
- **`masoara`** (din E1). O livrare cu jeton bun se prelucrează oricare ar fi semnătura, fiindcă duce doar la o recitire. Varianta potrivită se notează pe rând. Prima potrivire se notează și în configurare, o singură dată și fără secret, după tiparul `cercetareSemnatura` de la About You [C: `src/app/api/aboutyou/webhook/route.ts:142-158`]. O livrare care nu se potrivește pe nicio variantă pornește alarma, dar tot se prelucrează.
- **Trecerea în `impune`** e automată și trebuie să vină repede. Condiția: varianta e confirmată de M-WH-1, iar o livrare a magazinului se potrivește pe ea și are în corp `/` sau caractere non-ASCII, unde s-ar vedea o reserializare. Contează și evenimentul de probă, dacă îndeplinește condiția. Până atunci singura încuietoare e jetonul, care ajunge în jurnale (§6.2).
- **`impune`.** O livrare cu jeton bun și cu semnătura nepotrivită sau lipsă nu se aruncă. Se păstrează în inbox cu `semnatura_ok = false`, nu se prelucrează și pornește alarma. Răspunsul e tot 200, fiindcă o reîncercare n-ar schimba nimic. Altfel un secret greșit sau o formulă schimbată la ei ar arunca tăcut toate evenimentele.
- **„Secret nepreluat”** (potrivire pe cheia goală sau niciun antet), în oricare mod: alarmă și refacerea abonărilor (§6.7). În `impune`, livrarea nu se prelucrează.
- **Ce poate face un eveniment fals cu jeton bun.** Payload-ul nu schimbă direct starea comenzilor, stocul, banii sau starea integrării. Fiecare eveniment duce la o recitire prin API, cu tokenul nostru (§3.4). Singura excepție sunt datele de storno, păstrate numai ca informație afișată (§6.6). Un eveniment fals poate provoca deci cel mult o recitire sau o stornare afișată „anunțată de webhook”.
- **Proba nouă:** o semnătură calculată cu cheia goală iese „secret nepreluat”, nu „semnătură bună”. Celelalte probe de semnătură sunt în §9.1.

### 6.4 Răspunsul, în sub 3 secunde
O livrare e socotită eșuată la un răspuns non-2xx sau mai lent de 3 secunde. Urmează încă două încercări, după 10 s și după 100 s [A]. Ghidul din 09.2026 recomandă la fel: „confirmă întâi și procesează după”.
1. Corpul brut se citește o singură dată, cu plafon în octeți.
2. Un `businessId` neformat sau inexistent primește 200, cu jurnal strangulat, fără 5xx.
3. Configurarea se citește cu service role. Dacă citirea pică, răspunsul e 503, iar ei reîncearcă.
4. Un jeton greșit primește 200, cu jurnal strangulat prin `consumaLimita` [C: `src/lib/utils/limita-durabila.ts:36`, peste RPC-ul `consuma_limita`], pe magazin și IP. Adresa întreagă nu intră în jurnal (§6.2).
5. Se evaluează semnătura (§6.3), apoi evenimentul se scrie în `easysales_webhook_inbox`, cu `semnatura_ok` și varianta. Un corp care nu e JSON valid nu se aruncă: rândul se scrie fără corp, cu motivul, și pornește alarma. Dacă scrierea pică, răspunsul e 503, singurul alt caz de 503.
6. Răspunsul 200 pleacă imediat, inclusiv pentru o livrare oprită în `impune`. Prelucrarea rulează în `dupaRaspuns` [C: `src/lib/marketplace/dupa-raspuns.ts:39`], adică în `after` din Next. Ruta își declară `maxDuration`, fiindcă `after` lucrează în aceeași fereastră. Ce rămâne neprelucrat reia cronul.

**Față de About You** [C: `src/app/api/aboutyou/webhook/route.ts`]
- Se preia inboxul scris înaintea oricărei prelucrări (`:181-187`), cu aceleași două cazuri de 503: citirea configurării (`:59-64`) și scrierea în inbox (`:188-199`). Tot de acolo vine regula că, după inbox, o prelucrare picată lasă rândul pentru cron, iar răspunsul rămâne 200 (`:201-244`).
- Nu se preia prelucrarea pe loc. Acolo `await prelucreazaEveniment(...)` (`:203`) rulează în cerere, iar răspunsul pleacă abia după ea, sub `maxDuration = 30` (`:31`). La easySales, prelucrarea e o recitire prin API, cu termen de 20 s (§5.0), deci ar trece de cele 3 secunde.
- Nu se preia nici ieșirea pe un corp necitibil, care acolo răspunde 200 fără rând (`:161`).

### 6.5 Idempotența
- Payload-ul nu are id de eveniment, marcaj de timp sau versiune [A]. Nu se deduplică definitiv după conținut, fiindcă două evenimente legitime pot fi identice (stocul 5 → 6 → 5). Fiecare livrare se păstrează, cu amprenta sha256 pentru diagnostic.
- Prelucrarea transformă evenimentul într-o recitire, comasată în coadă pe `(magazin, operație, entitate)`. O livrare reluată de ei costă cel mult o citire în plus.
- Documentația nu garantează ordinea livrărilor [A], dar ordinea nici nu contează: se aplică starea citită atunci, numai înainte.
- Datele de storno se scriu pe cheia stornării (seria și numărul), deci o livrare repetată nu dublează nimic.

### 6.6 Ce păstrăm
Curățarea e o listă albă, aplicată înainte de scriere: rămân numai câmpurile de mai jos. Un câmp nou adăugat de ei se pierde, nu se scurge (ES-28).
- pe orice livrare: slug-ul, amprenta, rezultatul semnăturii cu varianta și momentele;
- la comenzi: `internal_id`, `id` sau `order_id`, `order_display_id`, `marketplace` și SKU-urile; la AWB și la factură, și `id`-ul documentului;
- la `storno-invoice-created`: tot obiectul `storno_invoice` [A: un singur exemplu, fără schemă], adică `id`, `invoice_nr`, `invoice_series`, `date`, `value`, `correction_kind`, `url`, `order_id`, `order_display_id`, `order_return_id`, `order_return_display_id` și `corrected_invoice {id, invoice_nr, invoice_series, url}`.

Datele personale (`customer`, adresele, numele, telefoanele) și `website.token` nu se scriu. Tokenul se compară în timp constant (§5.7), apoi se aruncă. Rândurile se păstrează 30 de zile, iar nimic din corp nu ajunge în `error_logs`.

**Stornarea: aici payload-ul e sursă de date, nu doar semnal**
- La citire lipsește legătura explicită, pe id, dintre stornare și factura corectată. `invoices[]` are doar `series`, `number`, `URL` și `type`, fără id, iar un element de tip storno nu e documentat [A] (M-INV-1). Lista de comenzi dă doar o legătură slabă, prin numere: pe aceeași comandă stau `invoice_series`, `invoice_nr` și `invoice_storno_nr` [A]. Fără id-uri, ea e ambiguă când comanda are mai multe facturi sau stornări. Legătura pe id vine numai din `storno-invoice-created` (`corrected_invoice`) și din răspunsul la `POST .../invoice/storno` (`data.id` și `data.storno.invoice_storno_id`) [A]. Răspunsul îl primim doar când stornează Edinio (E5).
- Câmpurile stornării se copiază, după recitire, în `easysales_comenzi.facturi`, care nu se curăță la 30 de zile. Se scriu numai pe o comandă găsită în `easysales_comenzi`.
- Factura corectată se găsește după `invoice_series` și `invoice_nr` față de `series` și `number`, nu după id.
- Datele stornării sunt informație afișată. Nu schimbă starea comenzii, nu pornesc rambursări și nu mișcă stocul. Cât recitirea nu arată stornarea (în `invoices[]` sau în `invoice_storno_nr` din listă [A]), ea apare „anunțată de webhook”.
- `order_return_id` și `order_return_display_id` leagă stornarea de un retur. Legătura cu cererea de retragere din Edinio (OUG 18/2026) o hotărăște D28.
- Că o livrare pierdută după toate încercările nu se mai poate reface din API e IPOTEZĂ de confirmat (M-WH-4, ES-11). O stornare văzută doar la citire apare atunci „fără factură legată”. Starea comenzii se reconciliază oricum din `GET /orders` (§5.2), chiar dacă evenimentul nu se reface.
  - Nicio cale de retrimitere nu e documentată [A]. Există însă `POST /webhooks/{id}/trigger`, descris ca metodă care „may be used for testing” [A]. Nu se spune ce payload trimite: ultimul, unul de probă sau altul.
  - `GET /webhooks` arată în `details` o livrare, cu payload-ul ei [A]. Că e ultima e o deducție (§6.9).
  - Nici numărul de încercări nu e sigur. Trei reiese din textul despre valorile implicite („By default”) și din exemplu (`total_nr_of_attempts: 3`) [A]. Numărul real se măsoară în M-WH-4.

**Datele personale.** Inboxul nu le are, prin construcție, deci ștergerea la cerere (D33) nu are ce căuta aici. Proba: corpurile `order-created` și `order-updated` din exemple, trecute prin curățare, nu lasă niciun câmp din `customer`, `billing_address` sau `shipping_address`, iar `stock-refresh-requested` nu lasă `website.token`.

### 6.7 Ciclul abonărilor
Un eșec aici nu anulează conectarea (§4.2, treapta B, pasul 5), dar apare în panou.
- **Abonarea noastră** e cea a cărei adresă are calea noastră și `businessId`-ul acestui magazin, oricare ar fi jetonul. Potrivirea doar pe prefixul rutei e prea largă: ar prinde și alt magazin Edinio de pe același cont. Abonările altor integrări nu se ating niciodată.
- **La conectare și apoi zilnic:**
  - `GET /api/v2/webhooks` [A], apoi, pe fiecare slug: dacă lipsește abonarea noastră, `POST /api/v2/webhooks/{slug}` [A] cu `url`, `http_method: "post"` [A] și secretul; dacă există, dar pe un jeton vechi, schimbarea adresei (mai jos);
  - fiecare slug e independent: un refuz la unul (ne-2xx sau `success: false`) nu le oprește pe celelalte și apare în panou, mai ales la `delivery-status-updated`, care lipsește din tabelul oficial [A];
  - id-ul abonării (`data.id` [A]) se salvează în `abonari{slug: id}`. Răspunsul întoarce `data.id` și `data.url`, plus `success` și `message`, dar nu slug-ul, `http_method` sau secretul [A], deci abonarea se citește înapoi din `GET /webhooks`;
  - o abonare a noastră dispărută fără un DELETE de la noi se reface o singură dată. A doua dispariție în 7 zile oprește refacerea și trimite notificarea „abonarea e înlocuită de alt program de pe cont”. Fără paza asta, dacă M-WH-5 arată o singură abonare pe slug, două magazine Edinio de pe același cont s-ar înlocui reciproc zilnic (§6.8).
- **Secretul:** 48 de caractere alfanumerice aleatorii, unul pe magazin, pentru toate abonările lui.
  - Minimul de 24 e doar sugerat, de valoarea din exemplul ghidului: `a-shared-secret-of-at-least-24-characters` (IPOTEZĂ, ghid; M-WH-1). Nicio frază din ghid sau din colecție nu impune un minim și nu e documentat niciun 422 pentru un secret scurt [A].
  - Nici obligativitatea secretului nu e documentată: exemplul de abonare reușită trimite doar `url`, iar colecția spune că generarea lui e „entirely up to you” [A]. Cele 48 de caractere respectă oricum sugestia.
- **Numele câmpului: IPOTEZĂ de confirmat (M-WH-1, ES-11).** Singurul exemplu din colecție scrie `seccret` [A], ghidul scrie `secret` (IPOTEZĂ, ghid), iar descrierea spune doar „Secret”. Nu e documentat nici ce se întâmplă fără secret: textul descrie antetul `Signature` ca pus mereu. Un nume greșit poate da livrări fără antet, un antet calculat cu cheia goală sau nicio livrare. În pachetul din care e copiat textul, un apel fără secret pare refuzat dacă semnarea nu e oprită anume; e o observație din afara documentației lor, pe care M-WH-1 o lămurește.
  - M-WH-1, înaintea codului: abonări separate cu `secret`, cu `seccret`, fără secret și cu un secret de 23 de caractere, fiecare urmată de `POST /webhooks/{id}/trigger` spre un receptor de test. Contează potrivirea semnăturii cu secretul trimis, nu prezența antetului. `GET /webhooks` nu întoarce secretul [A], deci numai livrarea arată ce a reținut serverul.
  - Codul trimite numele confirmat. Dacă prima livrare a unui magazin iese „secret nepreluat” (§6.3), abonările lui se refac o dată cu celălalt nume, iar rezultatul se notează. Oricum ar ieși, în `impune` o livrare fără `Signature` valid nu se prelucrează.
- **Proba:** `POST /webhooks/{id}/trigger` [A] și așteptarea rândului în inbox, cel mult 30 de secunde (§4.7).
  - Ce payload trimite declanșarea nu e documentat (M-WH-4). Răspunsul `{success: true, data: []}` e același plic ca la DELETE [A]. Că el arată doar primirea cererii, nu și livrarea, e tot IPOTEZĂ (M-WH-4). Dovada e rândul din inbox și `details.result` din `GET /webhooks`.
  - Evenimentul de probă se tratează ca unul real: semnătura se verifică, iar prelucrarea lui face cel mult o recitire. Proba: un eveniment de probă produce o singură recitire și nu schimbă nicio stare pe baza payload-ului.
- **Schimbarea adresei** (domeniul platformei sau jetonul): `PUT /webhooks/{id}` cu noul `url` [A: corpul cererii]. Singurul exemplu de răspuns e copiat de la abonare, iar ce face PUT cu secretul și cu `http_method` nu e documentat (se verifică în M-WH-1, cu un PUT de probă). După PUT, prima livrare sau un trigger trebuie să se potrivească pe secretul nostru; altfel, DELETE și abonare nouă.
- **Rotirea secretului:** DELETE și abonare nouă, fiindcă corpul PUT nu documentează secretul [A].
- **Deconectarea:** DELETE [A] pe id-urile din `abonari` și pe orice altă abonare a noastră din `GET /webhooks`, în sensul de mai sus. Proba: curățenia șterge numai abonările acestui magazin, nu și pe ale altui magazin Edinio sau ale altor integrări de pe cont.
- **Scope-ul:** `manage-webhooks`. Colecția îl listează explicit: „manage-webhooks: Manage Webhooks” [A: „Available Scopes”]. Că rutele `/webhooks` îl cer efectiv e IPOTEZĂ de confirmat (M-AUTH-5): în colecție, nicio rută nu are scope-ul atașat [A]. Exemplul de scope din ghid nici nu-l conține, deși același ghid face abonări (IPOTEZĂ, ghid). Dacă grantul website nu-l primește, abonările sunt refuzate, iar integrarea merge numai pe benzile de listă.

### 6.8 Filtrarea
- **Pe cont sau pe website:** nu e documentat [A]. Abonarea nu primește `website_token` [A]. Ghidul spune că PAT-ul e „account-wide rather than shop-scoped” (IPOTEZĂ, ghid), deci o abonare făcută cu tokenul website ar putea primi numai evenimentele website-ului. M-WH-2 măsoară întâi pe o comandă manuală din contul de probă, apoi pe o comandă de marketplace reală a pilotului. Se face o dată cu abonarea prin tokenul website și o dată prin PAT, dacă D3 îl acceptă.
- Comenzile noastre se recunosc numai după id-urile din `easysales_comenzi` (§6.1), **niciodată după câmpul `website`**, care are literalul `"API"` în exemple [A].
- **Ecoul propriilor scrieri: IPOTEZĂ (M-WH-2, ES-11).** Nu e documentat dacă un Save sau un `/stocks/bulk` de-al nostru se întoarce la noi ca eveniment.
  - Singurul indiciu: la Upload AWB (`POST /orders/{internal_id}/awb`), câmpul opțional `source` e „used for webhook triggering logic” [A], cu efect nedescris. La comenzi, `source: "api"` apare numai în corpurile-exemplu [A].
  - În E0 se fac scrieri cu și fără `source` (o comandă prin `/orders/save`, un AWB urcat) și se urmăresc `order-created`, `order-updated` și `awb-created` pe abonarea noastră.
  - Designul rezistă oricum: un ecou duce la o recitire comasată, iar la `product-created`, `product-updated`, `category-*` și `characteristic-*` nu ne abonăm. `product-stock-updated` e singurul eveniment de produs abonabil și rămâne numai fără ecou (§6.1).
- **Mai multe magazine Edinio pe același cont** (website-uri și clienți diferiți): fiecare are abonările lui, cu adresa lui, și filtrează la fel.
  - Că easySales acceptă două abonări pe același slug, cu adrese diferite, nu e documentat: IPOTEZĂ M-WH-5, măsurată în E2. Proba: al doilea `POST /webhooks/{slug}` cu altă adresă. `GET /webhooks` trebuie să arate două rânduri cu id-uri diferite, iar un trigger sau un eveniment real trebuie să ajungă la amândouă.
  - Dacă al doilea POST e refuzat sau înlocuiește adresa primului (care ar rămâne fără niciun semn), rezerva e o singură abonare pe cont. Edinio îi împarte evenimentele între magazine după tabelele de legătură. Rezerva se proiectează numai dacă M-WH-5 iese negativ.
  - Magazinul destinatar se recunoaște după adresă, nu după payload. Ce e `webhook.id` din payload nu e documentat [A]. Că ar fi id-ul tipului de eveniment, nu al abonării, e IPOTEZĂ de confirmat (M-WH-5: `webhook.id` din cele două livrări, față de id-urile celor două abonări). Din exemple nu reiese. `product-created` are id 1 în payload și în `details` din `GET /webhooks`, dar în același `GET` și abonarea are id 1 [A], deci exemplul nu le deosebește. Abonarea care a primit `data.id` 3 vine din alt exemplu, cu altă adresă (`example.test/callback`, nu adresa pipedream din `GET`) [A], deci nu e cea din `GET` sau din payload.

### 6.9 Sănătatea
- Panoul arată, pe fiecare slug, livrarea raportată de ei în `details` (`result.success`, `result.status_code`, `result.attempt_nr`, `result.final`, `triggered_at` [A]) și ultima primire la noi.
  - Că `details` e ultima livrare e o deducție: exemplul are un singur `details` pe abonare (M-WH-4). Poate lipsi pe o abonare încă nedeclanșată, iar codul tolerează lipsa.
- Cronul orar trimite notificarea de tăcere (§5.7) și avertizează la `success: false`. Un `success: false` cu `final: true` înseamnă o livrare pierdută după toate încercările. La `storno-invoice-created`, odată cu ea se pierde și legătura pe id storno-factură, dacă livrarea nu se poate reface (§6.6).
- Contoarele din panou: livrări cu semnătură potrivită, nepotrivită sau „secret nepreluat”, corpuri necitibile și slug-uri neașteptate.
## 7. Modificări în Edinio

### 7.1 Migrațiile
Sunt trei migrații, cu data reală în nume (ultimele două, `2026-10-07-*`, o poartă [C]). Fiecare primește un rând în `docs/redesign/REGISTRU.md` (72, 73 și 74, în ordinea aplicării), scris chiar când se aplică pe DEMO.

**`easysales-fundatia` (E1)**
- `privat.store_settings.easysales_config`, căile secrete din §4.4 în `privat.campuri_secrete` și cele două funcții de reconstruire [C: `migrations/000-schema-baseline.sql:420`, `:447`]:
  - rândurile din `privat.campuri_secrete` se inserează **înaintea** reconstruirii. `privat.reconstruieste_store_settings()` reface vederea `public.store_settings` și decriptează numai căile pe care le găsește acolo (:429);
  - `privat.reconstruieste_store_settings_upd()` nu privește secretele. Ea reface declanșatorul de scriere prin vedere, `privat.store_settings_upd()`, cu lista coloanelor (:455-463);
  - amândouă se cheamă după adăugarea **oricărei** coloane în `privat.store_settings`, nu doar a uneia secrete. Altfel vederea și scrierea prin vedere nu văd coloana nouă;
  - verificările stau în migrație, ca la 70: vederea are coloana, declanșatorul o scrie, secretele sunt trecute [C: `migrations/2026-10-07-epacket-curier.sql:75-80`, `:263-294`].
- Dacă D3 alege un Personal Access Token pentru citirea comenzilor (ES-26), calea lui secretă intră tot în această migrație. De aceea D3 se hotărăște în E0, înainte de E1, nu în E4. PAT-ul schimbă formularul (un al patrulea câmp, secret), stocarea, amintirea anuală (nu se reîmprospătează [A]) și analiza de securitate: un token pe tot contul (după ghid, IPOTEZĂ) ar vedea datele personale de pe toate canalele.
- `easysales_request_log`: magazin, metodă, cale-șablon, status, durată, rata rămasă, cod, mesaj scurt, moment; index pe magazin și moment.
- `easysales_webhook_inbox`: slug, amprentă, corp curățat, `semnatura_ok`, varianta, primit_la, prelucrat_la, încercări, următoarea încercare, eroare; index parțial pe evenimentele neprelucrate.
- `easysales_sync_queue`, în forma comună a cozilor (`revendicat_pana`, `next_retry_at`, `abandonat_la`, `prioritate smallint default 5`, `generation bigint default 1`, `trg_generatie`):
  - coloanele `op`, `cheie`, `incercari`, `ultima_eroare`, cu check pe `op`: `comanda_trimite`, `comanda_anuleaza`, `comanda_citeste`, `extern_citeste`, `articol_continut`, `articol_pret`, `articol_stoc`, `articol_sterge`, `categorie`, `caracteristica`;
  - unicitate pe `(business_id, op, cheie)` cât rândul nu e abandonat, ceea ce face comasarea;
  - numele cozii intră în `v_permise` din `revendica_din_coada`, prin `create or replace` cu corpul copiat din producție și aceeași semnătură [C: baseline 9314-9321]. Md5-ul corpului se măsoară înainte, ca la `cont_comanda_mea` (mai jos).
- `easysales_id_seq` (de la 1.000.000.000) și `easysales_produse` (§5.4.2), fiindcă le folosesc și comenzile, și catalogul.
- RPC-urile `easysales_ia_emiterea` și `easysales_scrie_tokenul`.

**`easysales-comenzi` (E2)**
- `easysales_comenzi`, cu coloanele:
  - legătura: `business_id` (cascade), `order_id` (`set null`) cu copia `order_uuid`, `directie` (`iesire`/`intrare`);
  - identificatorii: `es_order_id` (unic pe `(business_id, directie, es_order_id)`), `es_internal_id` (unic pe magazin, unde nu e NULL), `es_display_id`;
  - starea noastră: `stapan`, `stare` (check), `motiv`, `incercari`, `next_retry_at`;
  - starea lor: `es_status_cod`, `es_status_text`, `es_custom_status`, `es_livrare_cod`, `es_updated_at`, `es_anulata_la`;
  - documentele și semnalele: `awb`, `facturi`, `erori`, `cancel_request`, `canal`, `efect` (`umbra`/`aplicat`). La fiecare stornare, `facturi` păstrează și `order_return_id` și `order_return_display_id` din `storno-invoice-created` [A: exemplul payload-ului], ca dată de legătură, nu ca stare. Ele leagă stornarea de returul din easySales; legătura cu cererea de retur din Edinio se hotărăște la D28;
  - `raspuns_brut` (numai la stările-problemă), `trimisa_la`, `citita_la`, `ultima_veste_la`.
- **Datele personale (D33, ES-27).** Dintre datele noi, coloana `raspuns_brut` e locul care le poate ține: inboxul păstrează corpul curățat (§6.6), iar jurnalul nu are corpuri (§5.0).
  - Ștergerea datelor unui cumpărător trece azi prin `customer_anonymize`, într-o singură tranzacție [C: baseline 6186, chemată din `src/lib/actions/customer-manage.actions.ts:138`]. Funcția nu știe de tabelele noi.
  - `raspuns_brut` al comenzilor lui se golește pe același drum: în corpul funcției (`create or replace`, cu corpul din producție și același tip întors) sau imediat după chemare.
  - Ce se șterge și la easySales hotărăște D33. API-ul n-are DELETE pe clienți sau pe comanda întreagă [A]. Pârghiile sunt suprascrierile: `PATCH /api/v2/customers/{id}` (scope-ul `update-customers`, după nume), `PUT /api/v2/shipping-address/{id}`, `PUT /api/v2/billing-address/{id}` și rutele PUT ale comenzii [A].
- Declanșatorii de pe `orders`: BEFORE INSERT `easysales_stampileaza_comanda` și AFTER INSERT OR UPDATE OF status, payment_status `easysales_marcheaza_comanda`, ambii cu bloc de excepție.
- **Ce nu ștampilează declanșatorul**, pe lângă cazurile din §5.1.1 (proba SQL pe ștampilă acoperă fiecare caz, §9.2):
  - ridicarea personală și curierul propriu. Ridicarea are `shipping_address.courier = 'pickup'` cu `delivery_type = 'address'`, iar `address` e adresa cumpărătorului, nu a magazinului; curierul magazinului are `courier = 'own'` [C: `src/lib/cont/livrare.ts:4-8`, `:76-78`; `src/lib/actions/shipping.actions.ts:136`, `:346`]. Trimise în easySales, o automatizare sau operatorul ar genera un AWB de curier: la ridicare, spre casa unui om care vine la magazin; la curierul propriu, pentru o livrare pe care magazinul o face singur. Pe producție, din cele 568 de comenzi din vitrină, 173 au curier propriu (5 magazine), 12 ridicare personală (3 magazine) și 1 punct de ridicare [C: producție, 12.10.2026]. Rămân în Edinio până la D27 și ES-23, cum rămân punctele de ridicare până la D17;
  - o monedă alta decât RON. `orders` n-are o coloană pentru moneda comenzii (doar `dhl_currency`, `fedex_currency`, `ups_currency`, ale expedierii) [C: producție, 12.10.2026]. Declanșatorul citește deci `currency` din `privat.store_settings`, rândul din care citește deja `easysales_config`, ca la Pepita [C: `src/lib/actions/pepita.actions.ts:1055-1057`]. Azi toate cele 146 de magazine sunt în RON [C: producție, 12.10.2026] (D29);
  - comenzile „ES-…” aduse de E4. Ele poartă `marketplace: "easysales"`, deci regula de marketplace le prinde deja. Proba o cere explicit, fiindcă o scăpare ar face o buclă;
  - după D31, comenzile cu fișiere de personalizare;
  - comenzile de probă din pilot. Azi nu se pot recunoaște: `orders` n-are niciun steag de comandă de test (`epacket_test` privește doar AWB-ul e-packet) [C: producție, 12.10.2026]. Marcajul vine cu procedura de pilot pentru comenzile de test (§11.a).
- `cont_comanda_mea` (ramura AWB din `easysales_comenzi`): `create or replace`, cu corpul copiat din producție.
  - Precedentul sunt migrațiile 68 și 70, care au atins numai această funcție [C: `migrations/2026-09-29-curiera-curier.sql:110`, `migrations/2026-10-07-epacket-curier.sql:115`].
  - Md5-ul corpului se măsoară înainte pe DEMO și pe producție și se scrie în `docs/redesign/REGISTRU.md`, nu în migrație, ca la 68 și 70 [C: `REGISTRU.md:175`, `:177`].
  - Azi, pe producție, md5-ul e `fd740fbfc0a12f1e4dabb77c0937678b`, cu rândurile `curiera` și `epacket` [C: producție, 12.10.2026].
- `cont_anuleaza_comanda` (refuzul pentru comenzile procesate în easySales, cu motivul `procesata-extern`): același tipar, dar **fără precedent**, fiindcă 68 și 70 n-au atins-o [C]. Md5-ul de azi, pe producție: `418c13dc8df2cf414350852b3552789b`. Funcția întoarce `TABLE(ok boolean, motiv text)`, deci motivul nou nu schimbă tipul [C: producție, 12.10.2026].
- La amândouă, semnătura și tipul întors rămân neschimbate. Drepturile se refac și se verifică în migrație, ca la 70 [C: `migrations/2026-10-07-epacket-curier.sql:256-257`, `:287-293`]; azi `cont_anuleaza_comanda` o poate chema numai `service_role` [C: `has_function_privilege` pe producție].
- **Nicio coloană nouă pe `orders`.**
  - Riscul 42703 nu vine din adăugarea unei coloane în bază: o coloană în plus nu strică niciun select.
  - Vine din cod. Un select comun care numește o coloană încă inexistentă (de exemplu cel din `deleteOrder` [C: `order.actions.ts:3978`]) rupe toată interogarea, dacă ajunge în producție înaintea migrației sau rulează pe o bază nemigrată, ca DEMO [C: antetul `migrations/2026-10-07-epacket-curier.sql:6-10`].
  - Aici niciun select comun nu numește o coloană nouă de pe `orders`. O citire a tabelelor noi pe un drum comun (pagina comenzii, contul cumpărătorului) ar cădea însă la fel, deci regula rămâne R23: migrația înaintea codului.

**`easysales-catalog` (E3)**
- `easysales_categorii`; `easysales_caracteristici` (unic pe `(business_id, cheie_normalizata)`); `easysales_joburi` pentru încărcare, verificare și derivă (pagină, ultima pagină, total, `trecere_id`, contoare, stare).
- `easysales_fara_stoc(jsonb)` (immutable) și declanșatorii `easysales_marcheaza_produsul` pe `products` și `easysales_marcheaza_categoria` pe `categories`.
- Schimbarea domeniului sau a permalinkurilor nu atinge `products`, deci nu pornește declanșatorul. Drumurile care le schimbă pun ele conținutul în coadă (§7.3).
- Se aplică pe producție numai când pornește E3. E3 așteaptă M-EXT-1 și M-STOC-1 pozitive, sau modul B, fiindcă un catalog ținut pe stoc 0 nu vinde nimic (§10).

**E4** nu cere migrație. `consuma_stoc_comanda_marketplace` [C: baseline 3264] se folosește fără nicio schimbare în SQL, cum o cheamă deja eMAG, Trendyol, About You și Pepita [C: `src/lib/emag/orders.ts:1532`, `src/lib/trendyol/orders.ts:111`, `src/lib/aboutyou/orders.ts:250`, `src/lib/pepita/ingest.ts:895`]. Pe producție o poate chema numai `service_role` (md5 `172876f432173ec5e07b23c30d856a0a`) [C: producție, 12.10.2026]. Limitele ei devin reguli ale apelantului:
- se cheamă numai după ce comanda „ES-…” e inserată în `orders`, cu service role; fără rând, întoarce `gasit: false` [C: baseline 3300];
- apelantul refuză consumul când o linie nu are `product_id` legat. Chemată cu liste goale, funcția pune `stoc_marketplace_la`, iar comanda rămâne „consumată” pentru totdeauna [C: `src/lib/aboutyou/orders.ts:381-387`];
- variantele se potrivesc după titlu: `variant_title` trebuie să fie egal cu `title` al unei combinații active [C: `scade_variante_raportat`, baseline 9804]. Titlul se ia deci din combinația de azi a produsului, găsită prin `easysales_produse`;
- a doua chemare răspunde `deja: true` fără să compare liniile [C: baseline 3304-3306]. Liniile schimbate după consum (produs adăugat, storno parțial) trec prin `ajusteaza_stoc_comanda_marketplace` [C: baseline 1220, tot numai `service_role`], ca la eMAG și Pepita [C: `src/lib/emag/orders.ts:1452-1490`, `src/lib/pepita/ingest.ts:1215-1233`]. Setul trimis e autoritar: ce lipsește din el se eliberează, deci pleacă toate liniile legate. Drumul de ajustare rulează la fiecare recitire a unei comenzi externe deja consumate, cu probă după modelul Pepita (ES-21);
- anulările și retururile parțiale n-au o pereche idempotentă [C: `src/lib/emag/rma.ts:32-35`, `src/lib/aboutyou/anulare-partiala.test.ts:15-22`]. Ele produc o notificare, nu o eliberare automată;
- comenzile onorate de marketplace sau de un 3PL nu consumă deloc, fiindcă marfa e deja la ei. E regula eMAG pentru FBE (`onoratDeEmag` [C: `src/lib/emag/orders.ts:675`], aplicată la `:1245-1254`). Se recunosc după filtrul `fulfillment_service_id` al listei de comenzi și după `GET /api/v2/fulfillments/list` [A]. Canalele FBE din aplicația easySales (`EmagROFBE` 41, `EmagHUFBE` 55, `EmagBGFBE` 56) și forma în care apare o astfel de comandă în API sunt IPOTEZE de confirmat (ES-20).

**E5** cere o migrație numai dacă se urcă documente din Edinio: `easysales` intră în `operatii_externe_furnizor_check`, cu lista copiată din producție.

**Reguli pentru toate migrațiile:**
- RLS pornit, cu o singură politică SELECT pentru proprietar, cu `(select auth.uid())`; scrierile se fac numai cu service role.
- Cheile străine spre `businesses` au cascade; cele spre `products`, `orders` și `categories` au `set null`, plus copia de uuid. Fiecare cheie străină are index.
- Funcțiile `security definer` au `search_path` setat și sunt urmate de `revoke ... from public, anon, authenticated` și `grant ... to service_role`, verificate cu `has_function_privilege` în `do $$ ... raise exception`. Nicio funcție nu numește o tabelă în semnătură. La final, `notify pgrst`.
- În același commit: `bash scripts/schema-baseline.sh` (și `--check`), `npm run tipuri-db` (completat aditiv în `src/types/database.types.ts`) și `npm run verifica:coloane`.
- Fiecare migrație merge întâi pe DEMO (`krycmubsiojipwslxrka`), apoi pe producție **înaintea codului și numai cu acordul tău explicit**.

### 7.2 Fișiere noi
- `src/lib/easysales/`, fără un `src/lib/easysales.ts` alături. E o preferință de claritate, nu o capcană a uneltei. Încărcătorul de probe încearcă pe rând calea, `.ts`, `.tsx` și `index.ts`, cu `isFile()` [C: `scripts/tests/ts-resolve.mjs:27-29`, `:55-56`]. `src/lib` are deja șase perechi fișier și dosar (`customers`, `email`, `fancourier`, `smartbill`, `utils`, `woot`) [C]. Cu un fișier alături, `@/lib/easysales` s-ar rezolva la fișier, nu la `easysales/index.ts`, la fel ca în TypeScript. Dosarul cuprinde:
  - fundație: `constante.ts` (adrese, scope-uri, limite, fiecare cu sursa și data), `tipuri.ts`, `config.ts`, `token.ts` (și Personal Access Token-ul, dacă D3 îl alege), `client.ts`, `erori.ts`, `ritm.ts`, `jurnal.ts`, `numere.ts`;
  - lista de scope-uri din `constante.ts` se închide înainte de E1, fiindcă un scope adăugat mai târziu cere, după toate probabilitățile, un token nou, care îl revocă pe cel vechi (IPOTEZĂ: colecția nu spune ce se întâmplă cu un token existent când se adaugă un scope; M-AUTH-5, §4.3). Pe lângă cele 21 din §4.3 intră `read-fulfillment-services` (E4, ES-20), scope-urile de etichete, ca rezervă pentru ES-10, și `update-customers`, dacă D33 alege ștergerea prin API. Toate sunt în lista Available Scopes [A]. Nicio rută de etichete nu-și declară scope-ul; după nume, `/tags/attach` cere `attach-tags`, iar `/tags/detach` cere `detach-tags` (de confirmat în M-AUTH-5);
  - catalog: `eligibilitate.ts`, `identitate.ts` (alocarea, SKU-ul generat și înghețat), `mapare-categorii.ts`, `mapare-caracteristici.ts`, `mapare-produs.ts`, `catalog.ts`. O combinație fără `uid` are ca identitate amprenta titlului [C: `src/lib/storefront/variante-identitate.ts:52-53`]: redenumită, ar primi o identitate nouă, deci un SKU generat nou și un produs nou la easySales. Câte combinații n-au `uid` se măsoară înainte de E3;
  - comenzi: `mapare-comanda.ts` (cu garda sumelor), `stari.ts` (maparea din F2, pură), `curieri.ts` (harta pe `courier.id`), `comenzi.ts` (trimitere, recuperare, anulare, metadate), `comenzi-oglinda.ts` (benzile F2). Id-urile hărții vin din nomenclatorul curierilor [A]. În exemplele de comenzi apare însă doar id-ul 4 (FanCourier), iar webhookul `delivery-status-updated` dă curierul ca text („Sameday”) [A]. Că un AWB încărcat sau atașat apare drept „Manual” (13) e IPOTEZĂ, deci harta pe `shipments[].courier.id` se confirmă în M-AWB-1;
  - stoc:
    - `stoc.ts`: `stocDeTrimis`, cu formula ca parametru până la M-STOC-1 și ES-22. Varianta (a), model cu scădere: E - Z_ext. Varianta (b), model cu rezervare: E plus rezervările easySales ale comenzilor deja consumate în Edinio și încă nefinalizate la ei, aflate din `easysales_comenzi`. Centrul de ajutor descrie amândouă: rezervarea (articolul „Surse de stoc”) și scăderea la facturare, cu ștergerea rezervării la AWB (articolele despre facturare și „Generare AWB”); ce combinație se aplică unui website API V2 cu sursa Website nu e documentat (§5.5); cu rezervare, varianta (a) ar scădea de două ori aceeași bucată. Tot aici stau siguranța de masă și deriva. Regula derivei („numai în jos”) se revizuiește după M-STOC-1, ca să nu fixeze o sub-numărare produsă chiar de easySales;
    - `vanzari-externe.ts`: clasificarea, umbra, înregistrarea. Clasificarea lasă fără consum comenzile onorate de marketplace sau de un 3PL (§7.1, E4). Vânzările de pe alte website-uri ale aceluiași cont, cu același SKU, urmează D32 (ES-24). La fiecare recitire a unei comenzi externe deja consumate, liniile citite se compară cu cele înregistrate, iar diferența trece prin `ajusteaza_stoc_comanda_marketplace` (§7.1, ES-21);
    - rândurile `arhivat` din `easysales_produse` nu intră în nicio împingere (stoc, preț, conținut) și nici în potrivirea E4. easySales șterge definitiv produsele arhivate: articolul de suport „Arhivare produse” (08.2024) dă 30 de zile și cel mult 50 de produse dezarhivate în masă, iar ghidul „Cum arhivezi produse” (29.09.2026) dă o lună, fără plafon (ES-25). Ce face un Save pe un SKU arhivat, deci și regula pentru reconectarea de după purjare, se află din ES-25;
  - webhook-uri și supraveghere: `webhook.ts` (semnătura, curățarea, dirijarea), `inbox.ts`, `abonari.ts`, `exclusivitate.ts`, `sanatate.ts`, `notificari.ts`. Curățenia din `abonari.ts` șterge numai adresa exactă a magazinului, cu `businessId`, ca să nu atingă abonările altui magazin Edinio de pe același cont sau ale altor integrări;
  - `fals-easysales.ts`, folosit numai de probe. E singurul mediu de probă pe care ne sprijinim:
    - colecția nu pomenește niciun sandbox, staging sau marketplace de probă, iar `GET /api/v2/marketplaces/list` arată în exemplu numai canale reale [A];
    - depozitul public `easySales/dynamic-marketplace-sandbox-api` (GitHub, 2023) e un server local cu date fixe. Imită API-ul pe care un marketplace de tip „Dynamic” îl expune către easySales, nu API-ul V2, deci nu înlocuiește serverul fals;
    - dacă un marketplace de probă se poate lega la contul de probă e nedocumentat (ES-15, ES-29). Până atunci, vânzările externe se probează cu o comandă manuală în easySales (§9.4).
- `src/lib/actions/easysales.actions.ts`, în care fiecare export e async (lecția `use-server-expune-fiecare-export`) și începe cu garda magazinului.
  - `guard()` nu e o funcție comună. Doar 12 din cele 99 de fișiere `*.actions.ts` își scriu local `async function guard(businessId)`; în celelalte apar alte gărzi (`proprietar`, `requireOwned`, `guardedAuth`, `poarta`, `guardBusiness`) [C].
  - Garda se copiază din `emag.actions.ts:98` sau `aboutyou.actions.ts:64` și întoarce `{ supabase, userId, biz }` sau `{ error }` [C].
  - Acțiunile: starea, cele două trepte de conectare (Treapta A refuză un magazin care nu e în RON, D29), testul, evenimentul de probă, deconectarea, pauza, setările, verificarea abonărilor, „Retrimite”, „Anulează în easySales”, „Preia în Edinio”, trimiterea comenzilor deschise, raportul de pregătire, pornirea catalogului, a umbrei, a canarului și a buclei, confirmările siguranței de masă.
- `src/app/api/easysales/webhook/route.ts` și `src/app/api/cron/easysales-sync/route.ts`.
- `src/app/(dashboard)/dashboard/features/easysales/page.tsx` și `src/components/dashboard/easysales/` (`EasySalesClient.tsx`, `EasySalesStare.tsx`, `EasySalesComenzi.tsx`, `EasySalesCatalog.tsx`, `EasySalesStoc.tsx`, `EasySalesProbleme.tsx`, `EasySalesJurnal.tsx`, `EasySalesComandaPanou.tsx`). Subdosarul are precedent în `src/components/dashboard/pepita/`; componentele eMAG stau direct în `src/components/dashboard/` [C].
- `docs/marketplace/EASYSALES.md`, `docs/marketplace/easysales-api-schema-<data>.json` (§7.7) și `public/integrations/easysales-mic.webp`.

### 7.3 Fișiere existente atinse (se adaugă, nu se rescrie)

| Fișier [C] | Ce se schimbă | Etapa |
|---|---|---|
| `public/integrations/easysales.png` | `git add` înaintea oricărei alte schimbări (azi e neurmărit) | E1 |
| `src/lib/orders/origin.ts` | `deriveOrigin` (:281-329) ignoră cheia `easysales` la testul „fără atribuire” (:286; ramura de marketplace e la :290-299); funcțiile noi `procesataInEasySales` (ștampila sau `marketplace: "easysales"`) și `deCeNuDeAiciEasySales`; din E4, `MARKETPLACE_ORIGINI` (:32), `MARKETPLACE_CU_CICLU_PROPRIU` (:115) și o ramură nouă în `cineTineComanda` (:187). Azi singura ramură proprie e Trendyol (:191), iar restul primesc textul implicit de la :199, „AWB-ul și factura se fac de aici.”, fals pentru easySales | E2, E4 |
| `src/lib/orders/awb-propriu.ts` | motivul nou în `deCeNuSePoateAwbPropriu` (:240), regula pură folosită de ecran și de poarta de pe server | E2 |
| `src/lib/orders/poarta-awb.ts` | nimic: `poartaCuBaza` (:94) citește deja `order_source` și cheamă regula pură (:129); doar probele | E2 |
| `src/lib/actions/invoice-auto.actions.ts` | ieșire devreme pe ștampilă, după selectul de la :33 | E2 |
| `src/lib/actions/smartbill.actions.ts`, `oblio.actions.ts`, `fgo.actions.ts` | refuz cu motiv în `generateOrderInvoice` (:834), `convertEstimateToInvoice` (:971), `generateOblioInvoice` (:722), `generateFgoInvoice` (:499) | E2 |
| `src/lib/actions/bulk-orders.actions.ts` | `bulkGenerateInvoices` (:314; `order_source` în selectul de la :348; sare ca la :356); `bulkGenerateAwbs` (:395), prin regula pură; `bulkUpdateOrderStatus` (:1384), al cărui filtru ocupă :1412-1421 (citirea :1412-1413, mulțimea `tinuteDeEi` :1416-1420, excluderea :1421; numărul sărit e raportat la :1484). Filtrul cheamă `marketplaceCareTineComanda`, care citește numai `marketplace` [C: `origin.ts:144-147`]: comenzile „ES-…” le prinde odată cu `MARKETPLACE_CU_CICLU_PROPRIU`, iar pe cele ștampilate numai dacă filtrul cheamă și `procesataInEasySales` | E2 |
| `src/lib/actions/order.actions.ts` | `updateOrder` (:2630), `updateOrderDetails` (:3069), `deleteOrder` (:3962); `placeOrder` și `placeCartOrder` nu se ating | E2 |
| `src/lib/cont/date.ts` | motivul nou `procesata-extern` în `mesajulAnularii` (:101), lângă `prea-tarziu`, `marketplace`, `platita`, `plata-online` și `negasita`; `anuleazaComanda` (:86) cheamă deja `cont_anuleaza_comanda` | E2 |
| `src/lib/cont/urmarire.ts` | n-are motive de refuz: construiește legătura de urmărire după curier (`urmareste` :106, `curierulReal` :32). Aici intră harta easySales `courier.id` → curier | E2 |
| `src/lib/actions/return.actions.ts` (`submitReturnRequest` :180, `updateReturnStatus` :330), `src/app/(dashboard)/dashboard/returns/page.tsx` | funcția de retragere din OUG 18/2026 pe o comandă procesată în easySales: notificarea „retur pe o comandă procesată în easySales”, cu legătura spre comanda lor; după D28, repunerea în stoc la retur aprobat, în Edinio, care e sursa stocului (azi `updateReturnStatus` schimbă doar starea), și legătura cu stornarea lor (`order_return_id`) | E2 |
| `src/lib/actions/customer-manage.actions.ts` (:138) | ștergerea datelor unui cumpărător golește și `raspuns_brut` din `easysales_comenzi`, dacă golirea nu se face chiar în `customer_anonymize` (§7.1); propagarea la easySales, după D33 | E2 |
| `src/lib/integrari/cont-marketplace-unic.ts` | `Marketplace` (:27) și `SELECTII` (:90) cu `easysales`; a doua identitate, `client_id` | E1 |
| `src/lib/marketplace/coada-cas.ts`, `rotatie.ts`, `toate-cozile-cas.test.ts` | `NumeCoada`, `COZI_CU_GENERATIE`; în `rotatie.ts`, parametrul `coloana` al lui `magazineConectate` (:52) e azi o uniune închisă de patru coloane (`trendyol_config`, `aboutyou_config`, `emag_config`, `olx_config`) și se lărgește cu `easysales_config`, altfel nu compilează | E1 |
| `src/app/api/cron/semnalarea-ajunge-la-om.test.ts` | azi acoperă numai cronurile `*-tracking` (`cronuriDeUrmarire`, :32-34); se lărgește ca să prindă `easysales-sync` (§7.5) | E1 |
| `src/lib/marketplace/stoc-pe-canale.ts` și proba lui | `CanalVanzator` (:51) primește `easysales` | E4 |
| `src/lib/orders/valori-permise.test.ts` | înrolarea funcțiilor de mapare (nu se înrolează singure) | E2, E4 |
| acțiunile de conectare eMAG, Trendyol, About You, callback-ul OLX, `activeazaPepita` | poarta de exclusivitate (§4.9) | E2 |
| `src/lib/actions/permalinkuri.actions.ts` (`salveazaPermalinkurile` :27), `src/app/api/domains/connect/route.ts` (scrie `custom_domain` la conectare și la deconectare) | adresa magazinului se schimbă fără să atingă `products`, deci declanșatorul nu pornește. Aceste drumuri pun în coadă conținutul tuturor articolelor; altfel `url` și `parent_url` rămân vechi la easySales. Lista completă a drumurilor care schimbă adresa se face înainte de E3 | E3 |
| `src/components/dashboard/OrderDetailClient.tsx`, `OrdersClient.tsx`, `orders/page.tsx` | panoul easySales pe comandă și butoanele stinse cu motiv; eticheta și filtrul în listă. Ancorele din `OrderDetailClient.tsx`: steagurile pe marketplace și logica de stare (:520-539: `isTrendyol`, `isEmag`, `cineTine`, `tinutaDeEi`, `memento`), factura (:2199-2201: `renderSmartbill`, `renderOblio`, `renderFgo`) și alegerea panoului de expediere (:2206-2209). `cineTine` vine din `marketplaceCareTineComanda` (:531), deci comenzile ștampilate cer și `procesataInEasySales` | E2 |
| `src/components/dashboard/ProductsClient.tsx`, `ProductForm.tsx` | starea pe produs (confirmat, blocat cu motiv, SKU-ul trimis) | E3 |
| hubul, antetul, catalogul public, siglele, ajutorul | §7.6 | E1, lansare |
| `vercel.json`, `docs/README.md`, `docs/redesign/REGISTRU.md`, `src/types/database.types.ts` | cronul, documentul, migrațiile, tipurile (aditiv) | toate |

**Nu se ating:**
- checkout-ul (`placeOrder`, `placeCartOrder`);
- cheile liniilor de comandă: `CHEI_DE_LINIE_SIMPLA` rămâne neschimbat [C: `src/lib/orders/edit-pricing.ts:219`];
- cronurile curierilor și `aplica_tranzitia_comenzii`;
- `tranzitieComandaMarketplace`: un parametru pentru plată e o hotărâre pentru E5 (D26);
- modulul `src/lib/emag/imagini.ts`: `imaginiPentruEmag` se cheamă așa cum e.

### 7.4 Interfața din panou (`features/easysales`, pe toată lățimea)
- **Conexiune:** cele trei câmpuri (plus al patrulea, Personal Access Token, numai dacă D3 îl alege), pașii din easySales cu capturi, avertismentele (client dedicat, website nou și gol, „Sursă stoc: Website”) și cele două trepte. Un magazin care nu e în RON e refuzat (D29).
- **Stare:**
  - firma și CUI-ul (cu avertisment la nepotrivire), abonamentul easySales și cota de comenzi;
  - tokenul (expiră la, ultima reînnoire); Personal Access Token-ul, dacă D3 îl alege, cu data expirării, fiindcă nu se reîmprospătează [A];
  - webhook-urile (abonate, ultima livrare la ei, ultima primire la noi, semnături nepotrivite);
  - bugetul de cereri și erorile din ultimele 24 de ore;
  - butoanele Testează, Trimite eveniment de probă, Reconectează (numai cu motiv), Pauză/Reia, Deconectează (cu bifa „stoc 0 înainte”).
- **Comenzi (E2):**
  - comutatorul „Trimite comenzile magazinului în easySales”, cu urmările scrise: factura și AWB-ul se fac din easySales, iar butoanele Edinio se închid pe acele comenzi. Cererile de retragere (OUG 18/2026) rămân în Edinio, la `/dashboard/returns`; ce urmează după ele hotărăște D28;
  - ce rămâne în Edinio, cu numărul lor: punctele de ridicare (D17), ridicarea personală și curierul propriu (D27). Pe producție, acestea sunt 186 din cele 568 de comenzi din vitrină [C: producție, 12.10.2026];
  - „Cine anunță clientul” (D5) și „Trimite comenzile deschise din ultimele N zile”;
  - contoarele trimise, refuzate, blocate, necunoscute, cu „Retrimite” și „Preia în Edinio”;
  - comenzile reale plătite online pleacă abia după M-COM-8 (§10, E2). În Generate AWB, obiectul opțional `advanced_data` „is used to overwrite default order data”, iar `order_data.cashValue` are doar nota „Order value” (float, obligatoriu numai în interiorul lui `order_data`, trimis ca șirul „120.00” în exemplu) [A]. Documentația nu spune că e suma de ramburs (poate fi și valoarea declarată), nici ce pune easySales implicit, nici ce face la `payment_mode` 1. Sensul de ramburs e IPOTEZĂ de confirmat (M-COM-8); până atunci nu ne bazăm pe valoarea lor implicită (R10);
  - stingerea comutatorului fără deconectare: comenzile ștampilate și netrimise n-au azi nicio regulă. Regula se scrie înainte de E2; cea mai apropiată e cea de la deconectare (trec la Edinio, cu notificare, §4.8 pasul 5).
- **Catalog (E3):**
  - raportul de pregătire pe motive, cu liste;
  - setările: SKU generat, descriere din nume, stoc fix pentru produsele fără evidență, arhivare la ștergere, combinația ștearsă sau dezactivată (arhivare sau stoc 0, D30);
  - „Trimite catalogul” cu progresul încărcării, și „Retrimite tot”. Înaintea oricărei retrimiteri în masă, numele website-ului se confirmă în `websites/list`. Dacă lipsește (de exemplu, website redenumit), urmează pauză și notificare, nu retrimiterea întregului catalog.
- **Stoc (E4):**
  - declarația canalelor;
  - „Pornește în umbră” și raportul umbrei;
  - „Pornește canarul” și „Pornește bucla de stoc”, active numai când condițiile din E4 sunt îndeplinite;
  - formula activă, (a) sau (b), după M-STOC-1;
  - siguranța de masă cu confirmările ei, deriva și corecțiile din ultimele 24 de ore.
- **Probleme și Jurnal** (după modelul `src/components/dashboard/EmagProbleme.tsx` și `EmagJurnal.tsx` [C]): comenzi respinse cu motivul în română, produse blocate, vânzări externe nelegate, canale pe două drumuri, semnături greșite, diferențe neexplicate, comenzi externe modificate după consum (ajustate sau, la retur parțial, neeliberate).
- **Pagina comenzii:** panoul easySales arată starea la ei, statusul personalizat, AWB-ul, factura și erorile, cu butoanele „Anulează în easySales” și „Preia în Edinio”. Butoanele de AWB, factură și stare apar stinse, cu motivul scris.
- **Notificările** (clopoțelul, prin `proprietariiMagazinelor` și cu garda `stareaSaSchimbat` [C: `src/lib/orders/semnalarea-ajunge-la-om.ts:40`, `:67`]):
  - conexiune și cont: reconectare, website dezactivat, website redenumit sau lipsă din `websites/list`, cont suspendat, abonament, plafon de comenzi, moneda magazinului schimbată (catalogul și stocul intră în pauză, D29), expirarea Personal Access Token-ului (dacă D3 îl alege);
  - comenzi: comenzi refuzate, blocate sau necunoscute, anulări cerute de clienți, retururi, cereri de retragere OUG 18/2026 pe comenzi procesate în easySales (cu legătura spre comanda lor, D28), `cancel_request`, erori de AWB la ei;
  - stoc: „canal pe două drumuri”, posibilă supravânzare, vânzare externă neînregistrată, siguranța de masă, anulare sau retur parțial pe o comandă externă deja consumată (fără eliberare automată);
  - tăcerea webhook-urilor.
- Textele văzute de comerciant au diacritice, n-au linii de dialog, numesc butonul adevărat și spun unde se face fiecare lucru.

### 7.5 Cronul
- Ruta e `src/app/api/cron/easysales-sync/route.ts`, programată `* * * * *` în `vercel.json`, cu `verificaCron` [C: `src/lib/cron-auth.ts:35`] și `maxDuration = 60`, cu un buget intern de ~50 s.
- Magazinele vin din `magazineConectate(admin, "easysales_config")` [C: `src/lib/marketplace/rotatie.ts:52`, cu tipul lărgit, §7.3] și se aleg cu `alegeInRotatie` [C: `rotatie.ts:18`]. Eroarea unui magazin nu oprește trecerea pentru celelalte.
- **La fiecare minut:** inboxul rămas, apoi coada, în ordinea priorităților: comenzi și anulări, vânzări externe, stoc, preț, conținut, ștergeri. Comenzile primesc bugetul întâi.
- **La 5 minute (la 1-2 minute din E4):** banda de listă a comenzilor. Pentru E4 e singurul semnal sigur: `order-created` pentru comenzile de marketplace și `product-stock-updated` pentru un website API V2 sunt nedocumentate și rămân semnale opționale (M-WH-2, M-STOC-2).
- **La 10 minute:** plasa pentru comenzile ștampilate fără rând.
- **Orar:** sănătatea și recitirea pe comandă a celor fără veste de 24 de ore.
- **Zilnic:** tokenul, contul, website-ul (numele e încă în `websites/list`), abonările, moneda magazinului (D29), amintirea pentru Personal Access Token (dacă D3 îl alege), felia de derivă, reîncercarea arhivărilor `blocked` și curățenia (jurnalul și inboxul la 30 de zile).
- Tot ce cere o hotărâre a omului ajunge în `notifications`. Proba `src/app/api/cron/semnalarea-ajunge-la-om.test.ts` nu prinde însă acest cron: `cronuriDeUrmarire()` păstrează numai dosarele `*-tracking` [C: :32-34]. Proba se lărgește cu o listă care numește `easysales-sync`, sau cronul primește o probă proprie după același tipar. După desfășurare se verifică faptul că ruta răspunde 401 fără secret.

### 7.6 Hub, catalogul public, pagina publică, sigla, ajutorul
- **Sigla:** primul pas e `git add public/integrations/easysales.png`, azi neurmărită [C]. Apoi se creează `easysales-mic.webp`, fișier nou, de 400 px pe latura lungă, și se trece în `src/lib/website/logos.ts` (`PROVIDER_LOGOS`) cu raportul cutiei și cerneala măsurate: cutia ~4,23, cerneala ~4,59, doar 5,6% albă, deci fără `invert` [C]. Cheia din `PROVIDER_LOGOS` e obligatorie: `cheie` din catalogul public are tipul `LogoKey = keyof typeof PROVIDER_LOGOS` [C: `logos.ts:308`], deci intrarea din catalog nu compilează fără ea.
- **Hubul** (`src/app/(dashboard)/dashboard/features/page.tsx`):
  - cardul intră în rubrica Marketplace, după Pepita (:197), printre integrările livrate și înaintea celor „În curând” (regula din `src/lib/website/ordinea-integrarilor.test.ts`);
  - se adaugă steagul global, lângă cele de la :282-292 (de la `gmcAvailable` la `emagAvailable`), și `easysalesActive`, lângă `emagActive` și `pepitaActive` (declarate la :333-334, atribuite la :480 și :483-484);
  - se completează lanțurile `isUnlocked`, `isActive`, `href` (:539-541);
  - până la lansare, pagina e accesibilă numai administratorilor (D13).
- **Antetul:** `LOGOS.easysales` în `src/components/dashboard/IntegrationHeader.tsx`, cu cheia egală cu id-ul paginii.
- **Catalogul public** (`src/lib/website/integrari-catalog.ts`, rubrica marketplace, :345-407):
  - intrarea primește textul tău (30-110 semne, punct la final, diacritice, fără superlative), cu propunerile din D13;
  - numărătorile din `integrari-catalog.test.ts` (:203-205: azi 24 „în curând” și 43 active) se mișcă odată cu starea;
  - sinonimele se pun numai pentru capabilități reale și niciunul cât integrarea e „în curând”;
  - pagina publică `src/app/(website)/integrari/page.tsx` nu citește ea catalogul: randează `<BibliotecaIntegrari />` (:73), care importă `INTEGRARI` [C: `src/components/website/sections/integrations/BibliotecaIntegrari.tsx:7-15`]. Intrarea nouă apare deci fără nicio schimbare în pagină, dar cere cheia din `PROVIDER_LOGOS`.
- **Ajutorul:** ghidul „Cum conectezi easySales”, în `src/lib/website/ajutor-categorii/marketplace.ts`, cu capturi (`docs/ajutor/CAPTURI-AJUTOR*`, `npm run capturi -- --lista`).

### 7.7 docs/
- `docs/marketplace/EASYSALES.md`, după modelul `docs/curieri/EPACKET.md`, are secțiunile: surse (adresa colecției, data descărcării, sha256-ul originalului), căile folosite, ce nu are API-ul, „Măsurat pe fir” (E0, apoi pilotul), hotărârile cu motivul lor, ce rămâne deschis și nota cinstită. În `docs/README.md` se adaugă un rând nou.
  - La „ce nu are API-ul” intră, între altele, ștergerea clienților și a comenzilor: se pot doar suprascrie, prin `PATCH /api/v2/customers/{id}`, rutele PUT ale adreselor și ale comenzii [A] (D33, ES-27).
  - La fiecare descărcare nouă a colecției, schema derivată se reface și se compară cu cea din repo. Cum anunță easySales schimbările de API e întrebarea ES-28; de exemplu, evenimentul `storno-invoice-created` are în exemplu data 28.09.2026 [A].
- Colecția nu intră în repo ca atare, fiindcă conține ce par a fi credențiale reale și date care par ale unor cumpărători [A]. Intră un derivat, `easysales-api-schema-<data>.json`, cu numele, metoda, calea și tabelele de câmpuri ale fiecărei cereri, fără exemple și fără valorile variabilelor. Amprenta lui o cere proba de contract.

### 7.8 Variabile de mediu
- `EASYSALES_LIVE`: comutatorul de lansare, pornit implicit, ca la eMAG și Trendyol.
- `EASYSALES_API_URL`: numai pentru probe, cu adresa serverului fals (§7.2).

Niciuna nu intră în `CHEI_OBLIGATORII` [C: `next.config.ts:56`]. Personal Access Token-ul, dacă D3 îl alege, e al comerciantului și stă criptat în `easysales_config`, nu în mediu.

Nu există credențiale de platformă, fiindcă documentația nu descrie un client de platformă:
- Colecția nu documentează niciun client OAuth de partener sau de platformă. Lipsesc înregistrarea unui client folosit de mai multe conturi și înregistrarea de `redirect_uri`. Grantul `client_credentials` nu e documentat ca cerere de token, deși colecția folosește un `client_credentials_access_token` (vezi mai jos) și serverul recunoaște grantul (proba curl). Granturile documentate sunt doar `authorization_code`, `password`, `website` și `refresh_token` [A: Authentication]. Singura regulă generală e „In your easysales account, you must create an API client by going to Account -> Settings -> API Settings” [A].
- Clientul creat de fiecare comerciant în contul lui e alegerea noastră, nu o regulă scrisă. Cu grantul website, clientul și `website_token` stau oricum în contul comerciantului. Alegerea se sprijină pe o deducție din „Only one token per client can be created” [A]: un client comun s-ar revoca de la un comerciant la altul, dacă revocarea e pe client (IPOTEZĂ, M-AUTH-2, ES-1).
- Fluxul `authorization_code` descris de ei pune clientul la dezvoltator, iar utilizatorul doar aprobă [A: „Redirecting For Authorization”]. Nu se spune dacă un client creat într-un cont poate fi aprobat de utilizatorii altor conturi (ES-1).
- Două urme ale unui nivel de partener sunt nedocumentate. Merg la ES-1, iar integrarea nu le folosește:
  - „Assign partner” se contrazice singură. Cererea definită e `POST /api/v2/account/sub-account/login`, același URL ca „Sub-Account Authentication”, cu un corp de autentificare și cu descrierea „Assign a partner to current user”. Numai exemplul salvat „Assign partner → Success” (răspuns din 10.10.2022) are `POST /api/v2/account/partners` cu `{"code": "<uuid>"}` și răspunsul 200 „The partner has been assigned successfully” [A]. Nu se spune de unde vine `code`, ce format are, ce înseamnă „partner” și ce efect are pe cont. Câmpul „Have a discount/partner code?” din aplicația lor sugerează un cod de recomandare, dar nimic nu-l leagă de `code` (IPOTEZĂ);
  - tokenul `client_credentials_access_token`, cerut de „Sub-Account Authentication” și de „Forgot password”, fără să se spună cum se obține [A].
- Nici Gomag nu dovedește un client de platformă. În adminul Gomag există o aplicație easySales (Apps → Canale de Vânzări → easySales). Comerciantul lipește în ea numai tokenul unui website de platformă „Gomag” (nu „API V2”), fără `client_id` și `client_secret` (IPOTEZĂ: articolul de suport easySales „Configurare Gomag”, ghidul „Cum conectezi Gomag cu easySales”, articolul Gomag „EasySales” și pagina Parteneri). Nu e scris dacă aplicația folosește API V2 și grantul website cu un client OAuth al Gomag (ES-1).
- Dacă programul de parteneri aduce totuși un client de platformă (ES-1, D14), el intră în Vercel ca variabilă nouă, înainte de push.
## 8. Riscuri și capcane

| # | Riscul | Unde mușcă | Apărarea | Lecția din memorie |
|---|---|---|---|---|
| R1 | Un token nou îl revocă pe cel viu | emitere concurentă, „Testează”, client folosit de alt program sau de alt magazin | zăvor cu versiunea văzută; „Testează” fără emitere, cu probă; client dedicat și unic pe magazin; două revocări neexplicate în 24 h → `needs_reconnect` | rotația OLX cu un singur câștigător; `refuzul-tokenului-ramane-refuz`; `proba-conexiune-neautentificata` |
| R2 | Token mort, iar marketplace-urile vând pe ultimul stoc | E4 | o reemitere automată limitată; notificare urgentă; opririle planificate pun stocul pe 0 | `integrarea-care-n-a-rulat-niciodata`, `semnalarea-care-nu-ajunge-la-om` |
| R3 | Factură sau AWB dublu | toate intrările de factură și AWB | ștampila la inserare; porți în factura automată, manuală, în lot și la AWB; recensământ; detector zilnic (factură Edinio și easySales pe aceeași comandă) | `smartbill-audit-2026-07`, `documentul-de-test-arata-ca-unul-fiscal`, un singur AWB viu pe comandă (`registru-operatii-externe`) |
| R4 | Ștampila și outboxul se despart | comenzi trimise neștampilate sau ștampilate netrimise | outboxul trimite numai ștampilate; plasa la 10 minute | `zero-randuri-nu-e-succes`, `acelasi-lucru-in-doua-copii` |
| R5 | Cheia nouă schimbă originea comenzilor | „Magazin online” devine „Direct” în rapoarte | `deriveOrigin` ignoră cheia, cu probă | `order-source-a-devenit-camp-de-bani` |
| R6 | Comandă pe care n-o procesează nimeni | refuz sau abandon | întoarcerea la Edinio după GET, `maybeAutoInvoice`, notificare | `semnalarea-care-nu-ajunge-la-om` |
| R7 | Save rescrie o comandă procesată | „Retrimite”, recuperarea după timeout | GET întâi; numai New sau Incomplete, fără documente | `netopia-specul-lor-nu-e-o-masuratoare` |
| R8 | Anularea din contul cumpărătorului lasă comanda vie la ei | `cont_anuleaza_comanda` | refuz în funcția SQL și notificare | `verifica-propriile-modificari` |
| R9 | Bani greșiți | TVA inventat, reducerea de ofertă scăzută de două ori, rotunjiri, regim schimbat | `invoiceVat`, `planulCotelor`, `reconciliazaComanda`; fără `offer_discount_amount` | `cote-de-tva-pe-linii`, `regimul-de-pret-inghetat-pe-comanda`, `pretul-autoritar-are-doua-forme`, `pretul-pe-bucata-din-cos-nu-e-lineunit` |
| R10 | Ramburs cerut la ușă pe o comandă plătită cu cardul | AWB generat în easySales | `payment_mode` 1; M-COM-8 înaintea primei comenzi reale | `rambursul-cotat-fara-extraoptiuni` |
| R11 | Stoc „înviat” de o împingere | împingeri înaintea citirii vânzărilor externe, derivă | `Z_ext`, citirea înaintea împingerii, deriva numai în jos | `trendyol-cont-comun-si-epuizate-2026-09-11` |
| R12 | Aceeași vânzare consumată de două ori | canal pe două drumuri, ecou | exclusivitate în ambele sensuri; canalul nativ nu se consumă; trei paze | `trendyol-cont-comun-si-epuizate-2026-09-11` |
| R13 | Golire în masă | citire picată, defect | o citire picată nu trimite nimic; siguranța de masă | `zero-randuri-nu-e-succes`, `jurnalul-care-masoara-defectul-poate-fi-el-stricat` |
| R14 | Vânzare externă neconsumată tăcut | inserare respinsă pe NOT NULL | șir gol în loc de `null`; `blocata` cu notificare | `zero-randuri-nu-e-succes` |
| R15 | Sursa de stoc greșit setată la ei | E4 | bifă la conectare, verificare de comportament, alarmă la diferențe neexplicate | `copia-locala-nu-e-dovada` |
| R16 | SKU lipsă, duplicat sau schimbat | produse „blocate” sau „duplicate” la ei | SKU generat determinist, înghețat, index `lower()`, raport | `identificator-nou-semanat-din-cel-vechi` |
| R17 | Reconectare cu identități noi | dubluri la ei | tabelele de legătură rămân, id-uri globale | deconectarea eMAG și Trendyol șterge azi tabelul de legătură (`emag_offers`, `trendyol_listings`), deci o reconectare cu identități generate de noi naște dubluri |
| R18 | Semnătura verificată greșit | toate webhook-urile tăcute | octeți bruți, două variante, „măsoară” apoi „impune”, păstrare cu `semnatura_ok = false` | `probele-semneaza-cu-cheia-goala`, `eticheta-gresita-poate-amuti-o-plasa` |
| R19 | Webhook pierdut | 3 încercări în ~2 minute | inbox, 200 imediat, benzile de listă și pe comandă, alarma de tăcere | `semnalarea-care-nu-ajunge-la-om`, `webhookul-se-poate-lega-pe-fiecare-mesaj` |
| R20 | Câmpul `website` sau un website redenumit | filtre care întorc zero | comenzile se recunosc după id; alarmă „zero rezultate deși există comenzi trimise” | `zero-randuri-nu-e-succes` |
| R21 | Arhivarea e ireversibilă | ștergeri | numai la ștergere; niciodată recreare automată | „integrarea nu schimbă magazinul” (proiectul-frate) |
| R22 | Un declanșator rupe checkout-ul | `orders`, `products`. Ștampila e primul BEFORE INSERT pe `orders` și rulează în aceeași tranzacție cu `email_marketing_la_creare` (AFTER INSERT) [C] | bloc de excepție, ieșire rapidă, probă cu eroare forțată | `callbackul-de-tranzitie-prinde-caderea` |
| R23 | Cod împins înaintea migrației | 42703 apare numai când codul cere o coloană care încă nu există; select-urile comune pe `orders` (lista și detaliul comenzii) folosesc `select("*")` [C] | nicio coloană nouă pe `orders`; migrația înaintea codului | `coloana-lipsa-rupe-toata-interogarea`, `migratii-si-cod-impreuna` |
| R24 | Funcții definer chemate de `anon` | migrații | revoke, grant, `has_function_privilege` în migrație | `revoke-de-la-public` |
| R25 | Plafoanele PostgREST | tabelele noi de legătură: `easysales_produse` ar avea ~37.000 de rânduri la esafero, câte unul pe unitate vândabilă; azi esafero are 3.351 de produse [C: 13.10.2026] | `fetchAllRows`, `bucatiDeIduri` câte 200 | `postgrest-1000-row-cap`, `limita-in-postgrest-adresa` |
| R26 | Limita de rată împărțită | 429 la noi sau la celelalte integrări ale lui | buget 250, antetele, cheia pe cont | `ritm-impartit.ts` [C] |
| R27 | Fusul orar | `order_date`, `modified_after` | `Intl` cu Europe/Bucharest, suprapunere de 3 ore, M-COM-5 | `docs/redesign/REGISTRU.md:464` (`TZ` nu se poate seta pe Vercel) |
| R28 | Date personale și `website.token` în payload | inbox, jurnale | curățare înainte de scriere, 30 de zile, date minime la comenzile externe | `criptare-credentiale-vedere`, `managerul-de-parole-completeaza-campurile-de-secret` |
| R29 | Documentație care minte | parsare, mapare | parsare tolerantă, schema nu din exemple, E0 | `netopia-specul-lor-nu-e-o-masuratoare`, `copia-locala-nu-e-dovada` |
| R30 | Punctul de ridicare și Bucureștiul | AWB la adresa greșită | comenzile cu punct nu se ștampilează până la ES-9; județul cu codul „B” | `sameday-audit-2026-07`, `epacket-integrare` |
| R31 | Imagini WebP ignorate de eMAG | catalog | conversia existentă | antetul `src/lib/emag/imagini.ts` |
| R32 | Plafonul de comenzi, abonament expirat, cont suspendat | comenzi refuzate | stare dedicată, verificare zilnică, evenimentele de cont | `semnalarea-care-nu-ajunge-la-om` |
| R33 | Notificări duble către cumpărător | expediere | D5 și instrucțiunea din pașii de conectare | - |
| R34 | Probe care trec fără să apere | toate | mutanți pe apelant, server fals strict, probe pe element | `proba-apara-regula-nu-cablarea`, `baza-falsa-mai-darnica-decat-cea-adevarata`, `proba-pe-fisier-trece-proba-pe-element-prinde` |
| R35 | Comentarii și măsurători care rămân în urma codului | întreținere | măsurătorile în docs, cu dată; constantele cu sursa | `comentariul-fals-e-o-invitatie`, `masuratoarea-scrisa-in-cod-ramane-in-urma` |
| R36 | Ridicarea personală sau curierul propriu trimise ca livrări la adresă | AWB spre casa unui cumpărător care vine la magazin | ștampila exclude `shipping_address->>'courier'` `pickup` și `own` și `delivery_type = 'locker'`, cu probă SQL (§5.1.1, D27) | `src/lib/cont/livrare.ts` (12 ridicări personale pe producție) |
| R37 | Aceeași bucată scăzută de două ori: consumul în Edinio plus rezervarea easySales | ofertele văd E-2 la fiecare vânzare externă | `stocDeTrimis` parametru, cu variantele (a) și (b) scrise dinainte, alese după M-STOC-1 (§5.5) | `netopia-specul-lor-nu-e-o-masuratoare` |
| R38 | O comandă onorată de marketplace sau de un 3PL consumă stocul Edinio | E4 | filtrul `fulfillment_service_id`, canalele FBE (§5.6) | `onoratDeEmag`, `src/lib/emag/orders.ts:1245-1254` |
| R39 | Linii modificate după consum | storno parțial sau produs adăugat, stoc greșit fără semn | `ajusteaza_stoc_comanda_marketplace` la fiecare recitire (§5.6) | eMAG și Pepita |
| R40 | Retragerea din contract (OUG 18/2026) pe o comandă procesată în easySales | stornarea la ei, rambursarea și stocul la noi | notificare, repunere în stoc în Edinio, D28 (§5.3) | `notificare-garantie-legala` |
| R41 | Un procesator de date nou, fără cale de ștergere | GDPR | DPA cu easySales, date minime, ștergerea prin `PATCH /customers/{id}` sau manual (D33, ES-27) | `criptare-credentiale-vedere` |
| R42 | Moneda magazinului diferită de a website-ului | catalog și comenzi în altă monedă | refuz la conectare, pauză dacă se schimbă (D29) | - |
| R43 | Website redenumit în easySales | retrimiterea întregului catalog | numele confirmat în `websites/list` înaintea oricărei retrimiteri în masă (§5.4.5) | `zero-randuri-nu-e-succes` |
| R44 | Produsele arhivate se purjează după 30 de zile sau o lună (sursele diferă) | împingeri spre SKU-uri dispărute, reconectare | rândurile `arhivat` excluse din toate împingerile și din potrivirea E4 (§5.4.7, ES-25) | - |
| R45 | Comanda de probă din pilot primește factură fiscală reală și AWB | pilot | automatizările easySales oprite până la proba cap la cap (§9.6) | `documentul-de-test-arata-ca-unul-fiscal` |

## 9. Plan de testare

### 9.1 Probe automate pe funcții pure
- **Maparea comenzii**, pe cazuri construite din formele reale (anonimizate, de pe DEMO): ramburs cu taxă, card, cupon, reducere la card și la ramburs, extraopțiuni, neplătitor de TVA, prețuri fără TVA, pachet, personalizare (după D31), persoană juridică, linie nelegată. Se adaugă cazurile de bani pe care le măsoară M-COM-2: multe bucăți la preț mic, cotele de 21% și 11%, ramburs cu extraopțiuni și voucher în aceeași comandă.
  - Garda sumelor trebuie să cadă pe un caz construit greșit.
  - Pe fiecare linie, netul × (1 + cotă), rotunjit, trebuie să dea brutul.
  - easySales rotunjește brutul la 2 zecimale pe bucată (`price_with_tax`) și pe linie (`total_with_tax`) [A: tabelul Order product, numai la Add Order]. Ordinea calculului e IPOTEZĂ (M-COM-2), deci proba compară ban cu ban ambele ordini cu suma încasată pe card.
  - `total_vouchers` pleacă mereu ca număr: 0 fără reduceri, negativ cu reduceri. Tabelul cere „Must be a negative number”, dar exemplele Add și Update trimit 0 [A].
  - Forma lui `order_total` rămâne parametru, cu variantele (a) și (b) din §5.1.4, până la M-COM-2 și ES-9. Definiția scrisă e „products values + shipment tax” [A] și nu pomenește `fees` și `vouchers`; singurul exemplu coerent (Save, 2025) dă valoarea produselor cu TVA (279,00 + 15,90 = 294,90) [A]. Proba acoperă ambele variante.
  - Telefonul și emailul lipsă se omit și nu se inventează. Referința le cere [A], iar ghidul de erori din 29.09.2026 spune că nu sunt obligatorii (IPOTEZĂ, M-COM-4).
- `order_date` se convertește cu `Intl` în Europe/Bucharest, inclusiv în zilele de schimbare a orei (ultima duminică din martie și din octombrie).
- Cele 42 de coduri de județ = lista `general-data/countries/175/counties` [A]; Bucureștiul și sectoarele.
- Verificarea de la conectare: la un plătitor de TVA, cota magazinului e una legală azi (21, 11 sau 0), fiindcă catalogul trimite `vat_enabled ? vat_rate : 0`.
- **`stari.ts`** pe fiecare rând al tabelului din F2, inclusiv „nu coboară”, „Completed fără AWB” și o etichetă necunoscută, care nu schimbă nimic și se numără.
  - Funcția se înrolează în `valori-permise.test.ts`, lângă `statusEdinio` și `platitLaEi`. Proba nu primește valori scrise de mână: citește mulțimile din CHECK-urile din baseline și cere ca orice ieșire, inclusiv pentru coduri necunoscute, să încapă în ele [C: `src/lib/orders/valori-permise.test.ts:43-73`]. Azi, `orders_status_check` are cancelled, confirmed, delivered, pending, processing, refunded, shipped, iar `orders_payment_status_check` are paid, refunded, unpaid.
  - O stare nouă în Edinio cere întâi o migrație pe CHECK și actualizarea asertiei `deepEqual` din testul „proba știe să citească regulile din baseline”.
  - Tot acolo se înrolează maparea plății comenzilor E4. Lipsa cheii `payment_status` e un caz separat, nu un `unpaid` tăcut: la citire, cheia apare numai în exemplul de listă, ca text („Paid”), nu și în Get Order [A] (M-EXT-1, ES-9).
- **Clasificarea erorilor**, după cheile prezente, niciodată după textul din `message`:
  - exemplele au patru forme [A]: validare `{message, errors}`, business `{success: false, message, data: null}`, OAuth `{success: false, error, error_description, hint, message}` și hibridul `{success: false, message, errors}` (422 la `archive/bulk`). Exemplul general din secțiunea Errors e a cincea: `{success: false, message}`;
  - 422 înseamnă validare (cu `errors`) sau refuz de business (fără `errors`, cu motivul în `message`);
  - un corp fără aceste chei, sau care nu e JSON, ajunge în `raspuns_brut`;
  - lipsa cheii `success` pe un 200 nu e eroare: 31 din cele 86 de răspunsuri 200 nu o au [A];
  - `success: false` pe un 200 e un caz construit de noi, nu o formă documentată. Plasa îl tratează ca refuz și îl jurnalizează ca anomalie (IPOTEZĂ fără sursă);
  - refuzurile reale dintr-un 200 sunt pe element: `data.result.errors[]` și `data.result.error_messages[{sku, message}]` la `/stocks/bulk`, `not_found` și `blocked` la `archive/bulk` [A]. La `prices/bulk` exemplul are doar `errors: []`, deci forma eșecului e nedocumentată.
- **Clasificatorul de 403 și al plafonului**, pe textele strânse în M-AUTH-4, M-AUTH-5 și M-COM-6. Forma corpului se citește după chei, dar motivul unui 403 nu are alt semn decât textul. Ordinea: plafonul de comenzi, website dezactivat, `website_token` invalid, scope lipsă, alt 403.
  - „Orders limit exceeded” se verifică înaintea ramurilor 401/403 și 422, fiindcă codul lui HTTP e nedocumentat (IPOTEZĂ, ghid).
  - Un 403 de scope lipsă duce pe fluxul de token (reemitere cu toate scope-urile), nu la „definitiv”. Documentația dă 403 și pentru scope lipsă, și pentru `website_token` invalid [A: Archive product].
  - Un 403 nerecunoscut nu duce niciodată la o reemitere automată, fiindcă ea ar revoca tokenul în uz.
  - La 401, tokenul se tratează ca invalid, fără nicio presupunere despre corp: colecția nu are niciun exemplu 401.
- **Citirea JWT-ului:** lipsa revendicării `scopes` înseamnă „necunoscut”, nu „fără drepturi”. Cu `sub` lipsă sau gol, cheia de ritm trece pe rezerva `client_id`. Revendicările sunt văzute numai în exemplul din colecție (M-AUTH-1).
- **Semnătura:**
  - un fixture cu `\/` și `\u0103` (litera ă scrisă ca escapare), produs exact ca de PHP, trece;
  - recalcularea din `JSON.stringify` cade;
  - se probează ambele variante (corpul, `payload`);
  - o semnătură calculată cu cheia goală e recunoscută ca „secret nepreluat”: detecția verifică potrivirea, nu prezența antetului (M-WH-1);
  - proba își pune singură cheia (lecția `probele-semneaza-cu-cheia-goala`).
- **`stocDeTrimis`** (stoc ca șir, stoc comun, inactiv, neurmărit, `Z_ext`), în ambele variante scrise dinainte. Varianta activă e un parametru până la M-STOC-1 și ES-22:
  - (a) modelul cu scăderea copiei: max(0, E - Z_ext);
  - (b) modelul cu rezervare: E plus rezervările easySales pentru comenzile deja consumate în Edinio și încă nefinalizate la ei (din `easysales_comenzi`). Cu varianta (a) peste acest model, aceeași bucată ar scădea de două ori: o dată prin `Z_ext`, o dată prin rezervarea lor (IPOTEZĂ, centrul de ajutor).
- Siguranța de masă (stoc și preț) și regula derivei „numai în jos”. Proba acoperă și diferența produsă de rezervarea lor: deriva nu fixează o sub-numărare făcută de easySales. Regula se revizuiește după M-STOC-1.
- Rândurile `arhivat` sunt excluse din orice împingere (stoc, preț, conținut) și din potrivirea E4. Produsele arhivate se șterg definitiv la ei: articolul de suport „Arhivare produse” (08.2024) dă 30 de zile și cel mult 50 de produse dezarhivate în masă, iar ghidul „Cum arhivezi produse” (29.09.2026) dă o lună, fără plafon (ES-25).
- Garda pe răspunsul `/stocks/bulk` citește `data.result.*` și `data.products[]`, care cuprinde numai SKU-urile reușite [A: un singur exemplu].
- **Citirile de produse nu depind de filtrele nedocumentate** (M-PROD-7):
  - răspunsul `GET /products` se refiltrează local după `website.name` și după egalitatea `sku`, cu o regulă de majuscule aleasă explicit;
  - citirile țintite trimit mereu `website` și `sku` împreună, niciodată `sku` singur;
  - `updated_after` se tratează ca dată fără oră, cu o suprapunere de cel puțin o zi.
- Id-urile citite (`*_website_id`, `parent_id`, `id`, `order_display_id`) se compară ca text, normalizate cu `String(...)`: tipul lor nu e constant în exemple (numere și șiruri; un 51 trimis revine număr la Add product, iar `order_display_id` și `parent_id` apar doar ca șir) [A].
- **Clasificarea vânzărilor externe:** cele patru cazuri, cei doi martori, canalul nativ, plus:
  - comanda onorată de marketplace sau de un 3PL nu consumă stoc, ca la eMAG [C: `onoratDeEmag`, `src/lib/emag/orders.ts:675`, folosită la `:1254`]. Se recunoaște după `fulfillment_service_id` [A: filtrul din List orders] și după canalele FBE `EmagROFBE` 41, `EmagHUFBE` 55, `EmagBGFBE` 56 (văzute în aplicația easySales, nu în documentație). Forma reală vine din M-EXT-3 și ES-20;
  - harta canalelor e cheiată pe `marketplace_id`, nu pe nume. Un id necunoscut cade pe „canal necunoscut: nu se consumă, se semnalează”;
  - vânzarea de pe alt website al contului, cu același SKU, urmează D32.
- **Identitatea combinației**, SKU-ul generat și înghețat, bisecția loturilor:
  - redenumirea unei combinații cu `uid` și fără. Fără `uid`, identitatea e amprenta titlului [C: `src/lib/storefront/variante-identitate.ts:52-54`], deci redenumirea naște un SKU generat nou și un produs nou la ei;
  - combinația ștearsă: arhivare sau stoc 0, după D30;
  - trecerea de la produs simplu la produs cu variante și invers: rândul `''` nu rămâne la ei cu stocul vechi.
- **Harta curierilor pe id**, cu id-urile filtrului `courier_id` [A]. Că `shipments[].courier.id` folosește aceleași id-uri e IPOTEZĂ: în exemple apare doar perechea 4 FanCourier (M-AWB-1). Id-ul 13 (Manual) și un id necunoscut nu primesc link.

### 9.2 Probe fără cont real
- **Serverul fals strict** (`fals-easysales.ts`) e mai strict decât cel real:
  - fiecare emitere revocă tokenul precedent [A]. Răspunsul la tokenul revocat e configurabil (401, dedus din tabelul generic, sau 403), fiindcă nu e documentat;
  - `/oauth/token` primește cel mult 60 de cereri pe minut (ghidul și proba curl; antetele exemplelor din 2020 nu deosebesc ruta, fiindcă 60 era atunci valoarea de pe toate rutele);
  - Add respinge duplicatele (documentat la produse, caracteristici și comenzi [A]; la categorii, mai strict decât documentația), iar Save bulk întoarce `data: null` [A];
  - răspunsul Save Order vine cu și fără `data.internal_id`, fiindcă exemplul lui e copiat de la Add;
  - `/stocks/bulk` întoarce 200 cu `success: true` și erorile pe SKU, în plicul documentat (`data.result`, `data.products[]`); `archive/bulk` întoarce `archived`, `not_found`, `blocked` [A];
  - cere `website_token` la rădăcina scrierilor JSON care îl arată în colecție. Pe cele 4 rute multipart (încărcarea AWB-ului; încărcarea, generarea și stornarea facturii) nu-l așteaptă într-un corp JSON. Dacă un `website_token` în plus dă 422 e configurabil (M-AUTH-6);
  - respectă limitele de 100 (stoc și prețuri [A]; Save bulk, din ghid) și 50 (arhivarea în bloc [A]); pagina de produse are 50 [A];
  - dă din când în când 429 și timeout;
  - comportamentele nedocumentate ale filtrelor sunt configurabile: `?website=` strict, parțial sau ignorat; `?sku=` cu sau fără majuscule; `updated_after` la produse doar cu data sau și cu ora (filtrele `website`, `sku`, `updated_after` sunt documentate [A], formatul cu oră nu); `?order_display_id=` exact sau parțial (că acoperă și id-urile de marketplace și de website e documentat [A]);
  - ține stocul în ambele modele: rezervarea (`reserved_stock`, ștearsă la AWB sau la factură) și scăderea copiei (la finalizare sau la facturare);
  - trimite webhook-uri semnate cu escaparea din PHP. Semnătura e configurabilă (cu secretul primit, cu cheia goală sau fără antet), fiindcă nu e documentat ce face un secret trimis sub alt nume decât cel așteptat (`secret` sau `seccret`);
  - evenimentul de la `trigger` arată ca unul real, fiindcă payload-ul lui e nedocumentat.
  Comportamentele marcate IPOTEZĂ sunt configurabile și se probează în toate variantele.
- **Se rulează chiar rutele și cronul**, nu o simulare:
  - jeton greșit → 200, fără rând;
  - citirea configurării pică → 503;
  - eveniment valid → rând și 200;
  - același eveniment de două ori → două rânduri și o singură recitire;
  - jeton bun și semnătură rea → rând cu `semnatura_ok = false` și alarmă;
  - evenimentul de probă (`trigger`) → o singură recitire, nicio stare schimbată pe baza payload-ului;
  - două fire care emit în paralel → exact o cerere la `/oauth/token`, numărată de serverul fals;
  - deconectarea șterge numai abonările cu URL-ul exact al magazinului (cu `businessId`), nu pe ale altui magazin Edinio de pe același cont sau ale altor integrări;
  - un website redenumit (`?website=<nume>` dă zero) nu pornește retrimiterea în masă: întâi se caută numele în `websites/list`, altfel pauză și notificare;
  - poarta „zero produse” din Treapta B se probează în cele trei moduri ale filtrului `?website=`. Întâi întreabă un nume sigur inexistent; verdictul ei contează numai dacă acela dă zero;
  - E4 cu webhook-urile oprite: banda de listă singură aduce vânzările externe. `order-created` pentru comenzile de marketplace și `product-stock-updated` sunt semnale opționale;
  - o vânzare externă deja consumată, recitită cu un storno parțial sau cu un produs adăugat, ajustează stocul o singură dată, prin `ajusteaza_stoc_comanda_marketplace` [C: baseline 1220]. Modelul e proba reprocesării Pepita [C: `src/lib/pepita/ingest.test.ts`];
  - încărcarea inițială esafero, cu latență reală: jobul se reia după tăierea la 60 de secunde, fără dubluri.
- **Rularea pe comenzile istorice:** toate comenzile din vitrină (pe DEMO sau pe o copie anonimizată) trec prin maparea comenzii și prin `reconciliazaComanda`. Raportul spune câte ar fi refuzate și de ce; cazurile construite nu ajung.
- **Contractul pe fir.** Proba OLX dă numai mecanismul [C: `src/lib/olx/contractul-api-olx.test.ts`, 8 teste pe 10 funcții din `./client`]. `prinde()` înlocuiește `globalThis.fetch`, iar fiecare test afirmă ruta, verbul și corpul unei funcții, scrise de mână din documentația OLX. Nu derivă nicio schemă și nu oprește căile din afara ei, deci o funcție nouă rămâne neacoperită până i se scrie un test. Proba easySales adaugă:
  - fiecare cerere prinsă are perechea (metodă, cale-șablon) în schema derivată `easysales-api-schema-<data>.json` (§7.7), cu câmpurile documentate plus cele măsurate în E0. Amprenta schemei e verificată, iar o schemă nouă se citește înaintea schimbării amprentei (ES-28);
  - un recensământ: fiecare funcție exportată din clientul easySales are cel puțin un test de contract;
  - corpurile Save poartă `website_token`, iar cererile multipart nu-l primesc într-un corp JSON;
  - `GET /delivery-statuses` [A] se compară la conectare cu enumul 1-7 cablat în `stari.ts`. O valoare nouă se semnalează și nu schimbă nicio stare.
- **SQL pe DEMO** (baza de probă: §9.4), prin clientul real și în `do $$ ... raise exception 'GATA:%' $$`:
  - ștampila: comanda din vitrină e ștampilată, cea de marketplace nu, cea cu `order_source` NULL da, iar cheia `easysales` venită din afară e înlocuită;
  - ștampila nu se pune:
    - pe ridicarea personală: `shipping_address.courier = 'pickup'`, cu `delivery_type = 'address'` și cu adresa cumpărătorului, nu a magazinului [C: `src/lib/cont/livrare.ts:4-8`, `:76-78`] (D27);
    - pe curierul propriu, `courier = 'own'` (D27), și pe punctul de ridicare (D17);
    - pe un magazin a cărui monedă nu e RON. Moneda se citește din `store_settings.currency`, fiindcă `orders` n-are coloana `currency` [C: `src/types/database.types.ts`] (D29);
    - pe comenzile „ES-…” importate de E4, care altfel ar face o buclă;
  - anonimizarea: `customer_anonymize` rescrie `order_source` întreg, după inserare, prin `privat.sursa_anonimizata` [C: baseline 6323 și 511-531]. Funcția scoate o listă neagră de chei și le păstrează pe celelalte. Proba cere ca ștampila `easysales`, care nu poartă date personale, să iasă neschimbată;
  - după anonimizarea unui cumpărător cu o comandă trimisă nu rămân date personale în `easysales_webhook_inbox`, `easysales_request_log` și `easysales_comenzi.raspuns_brut` (D33);
  - outboxul lucrează numai pe comenzile ștampilate;
  - o eroare forțată în declanșatorii de pe `orders` nu oprește inserarea comenzii;
  - o eroare forțată în declanșatorul de pe `products` nu face să cadă niciun RPC care scrie stocul:
    - `revendica_stoc_complet` nu e un pas al bazei la INSERT. Îl cheamă aplicația înaintea inserării, din `revendicaStocul` [C: `order.actions.ts:836-853`], pe drumurile de la `:2033`, `:3763` și `:5054`. Dacă pică, comanda e refuzată, deci un declanșator stricat ar opri vânzarea;
    - ingestul marketplace-urilor nu trece pe acolo, așa că proba acoperă și `consuma_stoc_comanda_marketplace`, `ajusteaza_stoc_comanda_marketplace` și eliberarea din `aplica_tranzitia_comenzii`;
  - declanșatorul pe produse prinde INSERT, UPDATE și DELETE;
  - `cont_anuleaza_comanda` refuză comanda ștampilată;
  - `consuma_stoc_comanda_marketplace` chemat de două ori întoarce `deja: true`;
  - drepturile funcțiilor: `anon` nu poate chema nimic.
- **Mutanți pe apelant:** fiecare dintre aceste modificări trebuie să facă o probă să cadă:
  - scoaterea porții din `maybeAutoInvoice`, din `generateOrderInvoice` sau din `bulkGenerateInvoices`;
  - scoaterea regulii din `deCeNuSePoateAwbPropriu`;
  - scoaterea `coalesce` din ștampilă, sau a excluderilor `pickup` și `own`;
  - scoaterea ignorării din `deriveOrigin`;
  - scoaterea chemării explicite `raporteazaRambursareaGa4`, sau a notificării, de pe anularea venită din easySales. `tranzitieComandaMarketplace` nu le face singură [C: `src/lib/orders/tranzitie-marketplace.ts`, nicio chemare GA4 sau de notificare];
  - scoaterea filtrului FBE și 3PL din clasificarea E4;
  - scoaterea excluderii rândurilor `arhivat` din împingeri.
- **Probe de recensământ noi:**
  - acțiunea de test nu cheamă `/oauth/token`;
  - nicio cale de prelucrare nu scrie stare din payload;
  - orice acțiune care emite factură (`generate*Invoice`, `convertEstimateToInvoice`, `bulkGenerateInvoices`) și orice emitere de AWB trec prin `procesataInEasySales`. Recensământul merge pe fiecare funcție exportată, nu pe fișier: tiparul din `src/lib/billing/cote-pe-linii.test.ts:131-158` verifică pe fișier, iar acolo o funcție neapărată ar trece lângă una apărată (R34);
  - scrierile lui `order_source` sunt numai cele știute:
    - în cod, câmpul se scrie azi doar la `.insert()` [C: `order.actions.ts:2231` și `:5252` (`buildOrderSource`), `emag/orders.ts:1091`, `trendyol/orders.ts:516`, `aboutyou/orders.ts:757`, `pepita/ingest.ts:752`];
    - în bază, singura rescriere după inserare e `customer_anonymize` [C: baseline 6323];
    - proba cade la orice `.update()` sau funcție SQL nouă care atinge `order_source`, în afara îmbinării cheii `easysales` (întoarcerea la Edinio, §5.1.6; deconectarea, §4.8);
    - îmbinarea se scrie explicit, cu `jsonb_set` sau `coalesce(order_source, '{}') || ...`, fiindcă 64 de comenzi au `order_source` NULL [C];
  - declanșatorul easySales există în baseline pe INSERT, UPDATE și DELETE.

### 9.3 Probe existente de completat
- De mână: `valori-permise` (se înrolează funcțiile de mapare noi, nu valori noi), `toate-cozile-cas`, `stoc-pe-canale` (lista `CAI`), `cont-marketplace-unic`, `credentiale-nu-pleaca-in-browser`, `ordinea-integrarilor`, `integrari-catalog`, `ciclu-marketplace`, `poarta-awb`, `numarul-de-urmarire`, `auditul-conturilor`.
- Se înrolează singure sau scanează codul: `coloanele-scrise-exista`, `semnalarea-ajunge-la-om`, `definer-fara-revoke`, `rls-tabele`, `chei-straine-indexate`, `baza-se-poate-reface`, `use-server-exporta-doar-functii-async`, `scrierile-din-actiuni-poarta-magazinul`, `managerul-de-parole-nu-completeaza-integrarile`, `proba-conexiune-nu-scrie`, `refuzul-tokenului-ramane-refuz`, `cheia-de-token-contine-secretul`, `poarta-cronului-nu-se-deschide`, `poarta-cronului-e-in-sensul-bun`, `bugetul-cronurilor-nu-poate-fi-zero`, `gazda-configurabila`, `curierii-au-termen-la-cerere`.
- Porțile înainte de push: `npm run typecheck` (`tsc --noEmit`), `npm test`, `npm run build`, `npm run lint:prag -- --check`, `npm run tipuri-db -- --check`, `bash scripts/schema-baseline.sh --check`, `npm run verifica:coloane` (`scripts/tests/coloane-cerute-exista.mjs`). `--check` nu e în `package.json`: îl citesc scripturile [C: `scripts/lint-prag.mjs:46`, `scripts/verifica-tipuri-db.mjs:161`], de aceea trece după `--`.

### 9.4 Proba cu cont real: Etapa 0
**Pregătirea**
- Contul de probă îl creezi tu sau ni-l dai (D16). Valorile din colecția publică nu se folosesc.
- Ce știm despre probă vine din surse publice (IPOTEZĂ):
  - durează 14 zile (durata anunțată; aplicația o tratează ca parametru) și pornește fără card;
  - site-ul o anunță „pe planul Pro”, dar textele aplicației îi dau limite proprii, mult sub planul Pro: 50 de etichete (AWB), 50 de facturi, 50 de „transmiteri” și 10 listări pe canal;
  - Termenii cer un card în cont ca să folosești serviciile, deci continuarea după 14 zile cere card, cu o plată de validare de 1 unitate de monedă;
  - documentația API arată despre probă doar câmpul `is_trial` din `GET /account` [A].
- Limitele pot opri E0, de exemplu la M-PROD-2 (101 produse) sau la al 51-lea AWB. Înainte de pornire, la D16, se întreabă easySales dacă website-ul API V2 intră la „listări pe canal” și ce înseamnă „transmiteri”. Altfel se cere un cont de integrator fără aceste limite (ES-29, care completează ES-15). Scripturile își numără consumul.
- În cont se configurează:
  - website-ul „Edinio Test” (API V2), cu „Sursă stoc produse” pusă pe website-ul însuși (eticheta exactă a opțiunii în formularul API V2 nu e documentată; implicit e easySales) și cu „Status custom pentru comanda nouă” lăsat gol (câmp din ghid; altfel atinge stările New și Incomplete pe care se sprijină planul), plus un client „Website Grant”;
  - un al doilea website API V2, „Edinio Test 2”, pentru M-AUTH-2, M-ID-2, M-PROD-7 și M-EXT-1;
  - facturarea „easySales Billing” sau „Manual” și un curier „Manual”;
  - pentru vânzările externe, o comandă manuală în easySales. Un marketplace de probă nu e documentat nicăieri. Există doar mock-ul public `easySales/dynamic-marketplace-sandbox-api` (GitHub, neatins din 17.05.2023): un server Express local care imită API-ul expus către easySales de un marketplace de tip „Dynamic”. Se folosește numai dacă easySales confirmă că îl poate înregistra pe contul de probă (ES-15).
- Scripturile stau în scratchpad, nu în repo.
- Webhook-urile se prind printr-un tunel către `npm run dev`. `next dev` scrie în baza DEMO (`krycmubsiojipwslxrka`) numai prin `.env.development.local`, care se încarcă înaintea lui `.env.local`. `.env.local` singur duce la producție (`rtefdpioqmowkdiybwrr`) [C]. Înainte de fiecare sesiune se verifică ce `NEXT_PUBLIC_SUPABASE_URL` a încărcat serverul.
- Baza DEMO se șterge la închiderea redesignului [C: `demo-seed/LA-FINAL.md:21`, în afara repo-ului]. Probele care vin după aceea își stabilesc întâi cu tine baza de probă.
- **Niciodată printr-un preview Vercel.** Un preview scrie în producție pe orice ramură, cu excepția `conturi-clienti` și `redesign-dashboard`, care au chei Supabase proprii, către DEMO [C: variabilele proiectului Vercel `edinio-com`].
- Corpurile brute, anonimizate, devin fixture-urile probelor de semnătură. Rezultatele intră în secțiunea „Măsurat pe fir”.

**Ordinea**
- M-EXT-1 se face primul, cu tokenul din prima emitere (M-AUTH-1). De el depind:
  - D3, care se hotărăște în E0, înaintea E1. Un Personal Access Token ar fi al patrulea secret, cu formular, stocare, reamintire anuală și analiză de securitate proprii: un token pe tot contul vede datele personale de pe toate canalele;
  - rostul lui E3. Un catalog ținut pe stoc 0 nu vinde nimic, deci E3 așteaptă M-EXT-1 și M-STOC-1 pozitive, sau modul B.
- Urmează M-STOC-1, apoi M-AUTH-2, 4, 5, 6 și M-LIM-1, apoi restul.

| Cod | Ce măsurăm | Ce hotărăște | Așteaptă |
|---|---|---|---|
| M-AUTH-1 | emiterea cu grantul website și revendicările JWT-ului emis așa. Exemplul din colecție are `aud` (după convenția Passport, id-ul clientului), `jti`, `iat`, `nbf`, `exp` (= `iat` + 31536000), `sub` („1”) și `scopes` [A: variabila `access_token` decodată; JWT-ul n-are `iss`, stă lângă variabila dezactivată `url` = `easy-sales.loc`, iar grantul nu e declarat]. Pentru grantul website nu e documentat nimic: răspunsurile taie tokenul după antet. `scopes` are scope-urile acordate sau pe cele cerute? După a doua emitere pe același client, codul și corpul primite cu primul token (401 e doar dedus din tabelul generic) | zăvorul, cheia ritmului (cu rezerva `client_id`), citirea `scopes`, fluxul de 401 | E1 |
| M-AUTH-2 | același client pe două website-uri (se revocă reciproc? tokenul emis cu A scrie cu `website_token` B?); al doilea client pe același website | „un client pe magazin” | E1 |
| M-AUTH-3 | grantul `refresh_token`: rotește, revocă tokenul de acces? | reînnoirea | E5 |
| M-AUTH-4 | corpurile pentru secret greșit, `website_token` greșit, al altui cont sau reîmprospătat în interfață, website dezactivat (și ce arată atunci `websites/list`: numele, `status`), client șters sau revocat din interfață (un buton „Revoke” în Setări API e IPOTEZĂ, de verificat; documentată e doar revocarea automată a tokenului vechi la emiterea unuia nou), scope lipsă; 401, 403, 404, 422, 429 | `erori.ts`, textele clasificatorului de 403 | E1 |
| M-AUTH-5 | grantul website acceptă toate scope-urile? Mai ales `manage-webhooks`, plus `read-fulfillment-services` (E4), cele de etichete (planul B la ES-10) și, după D33, `update-customers` [A: lista Available Scopes]. Ce scope cer `/account`, Save, Save bulk, `/couriers`, `/billing-software`, `delivery-status` (legătura e „după nume”): o cerere cu un token emis fără acel scope dă 403, cu ce text? | lista de scope-uri, ramura „scope lipsă” | E1 |
| M-AUTH-6 | un `website_token` în plus la rădăcina scrierilor JSON ale căror exemple nu-l au, pe fiecare familie (comenzi, metadate, webhook-uri): 200, 422 sau 403? Pe cele 4 rute multipart nu se trimite în JSON | regula „la orice scriere” din `client.ts` (§2.2, §5.0) | E1 |
| M-LIM-1 | `X-RateLimit-*` pe cereri autentificate; limita e pe cont sau pe client; corpul 429; `Retry-After`; limita de 60 pe minut la `/oauth/token` | cheia și bugetul ritmului, ritmul emiterilor | E1 |
| M-ID-1 | `order_id` ca șir prefixat („EDN-0042”) și ca număr de ordinul 1.000.000.000 (începutul secvenței) sau peste 2^31. Exemplele Add Order și Update Order trimit chiar șiruri (`"order-TEST-RO-004"`, respectiv `"order-s4fssdffffddssdssdssf"`), dar exemplele de succes au în cererea originală `order_id` numeric (1134585), deci niciun succes nu e pereche cu forma de șir [A]. `*_website_id` și `parent_id` ca șir și ca număr mare; citirile le întorc când ca număr, când ca șir [A]. Lungimea maximă (nedocumentată). Ce `id` și ce `order_display_id` revin la un `order_id` prefixat | forma identificatorilor | E2 |
| M-ID-2 | același `product_website_id`, `category_website_id` și `characteristic_website_id` pe cele două website-uri API V2 ale contului: acceptat sau 422 „has already been taken”? La categorii, câmpul nici nu e marcat unic [A] | secvența globală, alegerea sigură până atunci | E2 |
| M-CAT-1 | Save(14, „A”), apoi Save(14, „B”), apoi `GET /categories`: un singur rând, același id intern, numele „B”? Add pe un `category_website_id` existent: 422? Limita și atomicitatea `save/bulk`; `GET /categories` e limitat la website? Redenumirea prin `PUT /categories/{id intern}` [A], ca rezervă | categoriile | E3 |
| M-PROD-1 | cheia de upsert la `/products/save`: același SKU cu alt id și invers; „blocat”, „duplicat”. `data.id` din Save pe element, la creare și la actualizare: e egal cu `id` din `GET /products?sku=` și cu `product_data.id` de pe comenzi, iar `PATCH /products/{data.id}/stock` nimerește produsul? (corpul exemplului Save e identic cu al lui Add, deși e o înregistrare separată) SKU schimbat, cu preferințele „Arhivează automat produsele înlocuite” și „Mută ofertele” pornite și oprite (ghid) | înghețarea SKU, sursa lui `es_product_id` | E3 |
| M-PROD-2 | `products/save/bulk` cu 101 elemente și cu un element invalid; mărimea corpului; erorile | loturile | E3 |
| M-PROD-3 | variantele: părintele separat? `parent_id`; valori multiple; escapare HTML. Pe produs pleacă id-urile noastre în `categories[]` și `characteristics[].id` [A: tabelele Add și Save product]; se citesc înapoi doar ca confirmare. Un produs care referă o categorie inexistentă: 422 sau ignorare? | modelarea variantelor | E3 |
| M-PROD-4 | `tax_rate` 0, 11, 19, 21 pe un website RO; preț brut trimis, citit înapoi; rotunjirea | TVA, neplătitorii | E3 |
| M-PROD-5 | WebP; descriere goală; HTML; Save fără imagini sau categorii șterge ce exista? Save și save/bulk cu `categories: []` și fără cheie, pe un produs nou și pe unul existent: tabelul spune opțional, dosarul Categories cere o categorie [A]. easySales redescarcă imaginile la fiecare Save? (ES-30) | imaginile, conținutul, categoria de rezervă | E3 |
| M-PROD-6 | arhivare urmată de Save cu același SKU: restaurare, produs nou sau 422? Arhivare repetată; `blocked`. Purjarea (30 de zile sau o lună, după sursă) nu se vede într-o probă de 14 zile (ES-25) | ștergerea, rândurile `arhivat` | E3 |
| M-PROD-7 | `?website=` cu un nume sigur inexistent (zero sau tot catalogul?) și cu un prefix (potrivire parțială?); `?sku=` cu altă majusculă, singur și cu `website=`, pe două website-uri; `updated_after` cu oră (filtrele `website`, `sku`, `updated_after` sunt documentate la produse, dar exemplul are doar data; formatul cu oră „YYYY-MM-DD HH:MM:SS” e documentat la filtrele de dată ale comenzilor, unde echivalentul e `modified_after` [A]); `per_page`; ordinea paginării | poarta din Treapta B, citirile, deriva | E1 (poarta), E3 |
| M-STOC-1 | cu „Sursă stoc: Website”: `/stocks/bulk` cu 5, apoi, separat, o comandă API de 1 pe website-ul nostru și una de pe alt canal (pe probă, manuală). Se citesc `stock` și `reserved_stock` imediat, după factură, după AWB „Manual”, după `complete` și după `cancel`, cu întârzierea fiecăruia. Totul sub ambele setări de scădere („la finalizare” și „la facturare”, după blogul lor din 11.2025, cu bifa „Scade stocul la emiterea unei facturi noi” din Setări → Setări comenzi → Stocuri, după ghidul „Cum încarci propria factură”), cu AWB-ul și factura încărcate prin API și generate. Apoi la fel cu sursa „easySales”, ca să recunoaștem greșeala de configurare (ES-22) | varianta formulei (a sau b), regula derivei, verificarea sursei | E3, E4 |
| M-STOC-2 | o vânzare pe alt canal (sau comandă manuală) pe un produs al nostru: ce fac `stock`, `reserved_stock`, ofertele; vine `product-stock-updated`, pe o abonare de probă? vine `order-created`? | `Z_ext`, semnalele; `product-stock-updated` iese din §6.1 dacă nu vine | E4 |
| M-STOC-3 | răspunsul `/stocks/bulk`: `data.products[].stock` egal cu valoarea trimisă, și cu rezervări active (singurul exemplu n-are niciuna); SKU necunoscut (`data.result.errors`, `error_messages`); comportamentul cu sursa easySales | gărzile | E4 |
| M-COM-1 | Save repetat pe același `order_id` (același `internal_id`?); răspunsul Save are `data.internal_id`? (exemplul e copiat de la Add); Save după ce starea s-a schimbat la ei; ce se suprascrie (stare, linii, AWB, factură); Add duplicat → 422 | idempotența, „Retrimite”, recuperarea | E2 |
| M-COM-2 | payload-ul complet, pe cazurile din §9.1 (multe bucăți la preț mic, 21% și 11%, ramburs cu extraopțiuni și voucher). Sumele afișate și factura easySales trebuie să fie egale, ban cu ban, cu Edinio și cu încasarea pe card. Se notează ordinea rotunjirii, netul păstrat cu 4 zecimale și ce face un `order_total` care nu se închide. Pe ce definiție merge `order_total`: „products values + shipment tax” [A] sau totalul brut, cu taxe și vouchere? `total_vouchers` 0 și negativ, și legătura lui cu `vouchers[]` | maparea banilor | E2 |
| M-COM-3 | statusul 1, 2 și 5 la creare: efectul pe fluxurile automate, rezervări, procesare. „Status custom pentru comanda nouă” se aplică și comenzilor API? (ES-31) Dacă ES-10 iese negativ: o etichetă pusă cu `POST /tags/attach` sau un `PATCH /orders/{internal_id}/custom-status` [A] pot ține comanda în afara automatizărilor? | statusul trimis, planul B pentru automatizări | E2 |
| M-COM-4 | județe (B și sectoarele), străinătate, fără email, fără telefon (și pe adrese), județ ca nume; `shipping_method`: valori, efect, cum se marchează ridicarea personală și curierul propriu (ES-23) | pre-verificările, ștampila | E2 |
| M-COM-5 | valoarea câmpului `website` pe comenzile noastre; filtrul `?website=` pe comenzi; `?order_display_id=` cu și fără `website=`, cu o valoare-prefix (potrivire parțială?) și cu un id care e și id de marketplace; `modified_after` se mișcă la AWB, factură, livrare, status personalizat, metadate? fusul orar al `order_date` și al filtrelor | benzile F2, recuperarea | E2 |
| M-COM-6 | plafonul de comenzi, dacă se poate provoca: codul HTTP (poate fi 403), corpul, textul și dacă refuzul e sincron | starea `blocata_plafon`, ordinea clasificatorului | E2 |
| M-COM-7 | `cancel` repetat; `cancel` după AWB; `cancel` pe o comandă în procesare; `complete` repetat; corpul unui `cancel` refuzat (colecția are doar exemplul 200) | anularea | E2 |
| M-COM-8 | AWB generat cu `advanced_data: {}` pe o comandă cu `payment_mode` 1 și pe una cu 2. Rambursul se citește de pe etichetă sau din contul curierului: `shipments[]` n-are câmp de ramburs. `cashValue` e documentat doar ca „Order value” [A], deci se măsoară și: cu `cashValue: 0` trimis explicit, AWB-ul comenzii plătite cu cardul n-are ramburs? pe comanda cu ramburs, rambursul e egal cu `cashValue` și cu totalul de încasat? merge o suprascriere parțială a lui `order_data`? Apoi `payment_status` (și dacă Get Order îl întoarce), `original_payment_method`. Cere un curier care emite etichete: dacă proba n-are unul, se face pe contul pilotului, pe comenzi de test, cu AWB-ul anulat apoi | siguranța banilor (R10); până la rezultat, AWB-urile generate din interfață sau de automatizări nu sunt acoperite | înaintea primei comenzi reale, cu card sau cu ramburs |
| M-COM-9 | comandă cu SKU necunoscut pe website; cu `product_website_id` necunoscut | ordinea E2/E3, pachetele | E2 |
| M-COM-10 | metadate: POST pe o cheie existentă; PUT; filtrul `meta_key`/`meta_value` | metadatele | E2 |
| M-AWB-1 | AWB „Manual”, încărcat sau atașat cu `courier_name` → `awb-created`; ce `shipments[].courier {id, name}` rezultă (13?); `shipments[]`; când apare Completed; `awb_tracking_page` e public? La pilot, pe AWB-uri reale, `courier.id` față de id-urile filtrului `courier_id` | maparea stărilor, contul cumpărătorului, harta curierilor | E2 |
| M-INV-1 | factură în easySales → `invoice-created`; `invoices[]`; adresa e publică? O stornare apare în `invoices[]`, și cu ce `type`? Exemplul arată doar „invoice”, dar filtrul `invoice_type` al listei documentează „invoice/storno” [A]. Payload-ul `storno-invoice-created`, cu `corrected_invoice` și `order_return_id` [A: exemplu]. `invoice.id` din `invoice-created` e id-ul intern cerut de `mark-as-paid` [A]? Factura unei comenzi trimise cu `payment_mode` 1 apare încasată? | documentele, legătura cu retururile (D28), comenzile plătite cu cardul | E2 |
| M-WH-1 | trei abonări: cu `secret`, cu `seccret` și fără secret. După fiecare, `trigger`: `Signature` se potrivește cu HMAC-ul calculat cu secretul trimis, cu o cheie goală, sau lipsește? Pe tot corpul sau pe `payload`; hex | semnătura, „secret nepreluat” | E1-E2 |
| M-WH-2 | evenimente pe cont sau pe website. Ecoul propriilor scrieri, cu și fără `source`: o comandă prin `/orders/save` și un AWB urcat prin `POST /orders/{internal_id}/awb`, unde `source` e „used for webhook triggering logic” [A: Upload AWB], cu efect nedescris. Ce `id` poartă `order-created`: `order_id`-ul nostru sau `internal_id`? `order-created` pentru comenzile de marketplace, cu abonarea făcută de tokenul website, apoi de un PAT (la pilot) | filtrarea, recuperarea, E4 | E2 |
| M-WH-3 | abonarea la `delivery-status-updated`; valorile text; `GET /delivery-statuses` față de enumul 1-7 | F2 | E2 |
| M-WH-4 | `trigger`: ce payload trimite și dacă se poate deosebi de un eveniment real; reîncercări reale (răspundem 500 dinadins); antete; IP-uri | inboxul, evenimentul de probă | E1 |
| M-WH-5 | două abonări pe același slug, cu adrese diferite; `PUT /webhooks/{id}` cu alt `url`: secretul se păstrează? (răspunsul PUT e copiat de la abonare) | mai multe magazine pe un cont, schimbarea domeniului | E2 |
| M-EXT-1 | **prima măsurătoare.** Cu tokenul website, lista vede comenzile altor canale, ale celuilalt website și pe cele manuale? Au `product_data.id` și `offer.marketplace_name`/`marketplace_id`? Dacă nu, același test cu un Personal Access Token (după ghid, „account-wide rather than shop-scoped”). Comenzile reale de marketplace se văd la pilot (ES-12, ES-26) | D3, rostul lui E3, dacă E4 e posibilă | D3 (înaintea E1), E3, E4 |
| M-EXT-2 | `product_data.id` = id-ul intern al produselor noastre (din Save); SKU egal; `marketplace_name` folosește numele din `/marketplaces/list`? | cei doi martori, harta canalelor | E4 |
| M-EXT-3 | o comandă onorată de marketplace sau de un 3PL: `fulfillment_service_id` [A: filtrul de listă] și `GET /fulfillments/list` [A], cu scope-ul `read-fulfillment-services`. Dacă nu se poate provoca pe probă, rămâne ES-20 | clasificarea E4: nu consumă | E4 |
| M-EXT-4 | o comandă externă (pe probă, manuală) modificată după creare: storno parțial, produs adăugat. Ce arată API-ul pe linii la un storno parțial nu e documentat: apar câmpuri de cantitate inițială sau stornată (de pildă `initial_qty`/`storno_qty`, IPOTEZĂ) sau numai liniile curente? Se mișcă `modified_after`? (ES-21) | ajustarea stocului după consum | E4 |
| M-MKT-1 | `GET /marketplaces/list` arată catalogul global sau canalele contului? | precompletarea canalelor | E2 |
| M-ACC-1 | comportamentul API la abonament expirat sau la sfârșitul probei, dacă se poate; la atingerea unei limite a probei; payload-ul `account-suspended` | pauza | E1 |
| M-CLI-1 | dacă D33 alege `PATCH /customers/{id}` [A]: ce câmpuri se pot goli, se propagă în comenzile clientului, cere scope-ul `update-customers`? | ștergerea datelor la easySales (D33) | înaintea primei comenzi reale |

**Ce nu se probează în E0**
- Clientul de partener și `POST /api/v2/account/partners` (ES-1):
  - conectorul Gomag e descris în surse publice ca o aplicație din adminul Gomag, în care comerciantul lipește doar tokenul unui website de platformă „Gomag” (nu API V2), fără client_id sau client_secret. Un client OAuth de platformă nu e o premisă a planului;
  - ruta `/account/partners` cu `{code}` apare numai în exemplul salvat „Assign partner → Success”, iar cererea definită are URL-ul de la „Sub-Account Authentication” [A: documentație contradictorie]. Originea lui `code` și efectul pe cont sunt nedocumentate, deci ruta nu se cheamă înaintea răspunsului la ES-1.
- Ce cere un canal real, un curier real sau mai mult timp decât proba se trece în „Măsurat pe fir” ca „nemăsurabil pe probă”, cu etapa și întrebarea care îl așteaptă:
  - `order-created` și lista de comenzi pentru comenzile reale de marketplace (M-WH-2, M-EXT-1: la pilot);
  - comenzile onorate de marketplace sau de un 3PL (M-EXT-3, ES-20);
  - rambursul de pe AWB (M-COM-8: cere un curier care emite etichete);
  - mutarea ofertelor de pe alt website pe produsele Edinio (ES-24);
  - purjarea produselor arhivate, după 30 de zile sau o lună (ES-25);
  - propagarea `prices/bulk` la ofertele cuplate (ES-32).

**Pe datele Edinio, tot în E0** (doar citire, scripturi în scratchpad)
- ponderea comenzilor din vitrină cu punct de ridicare, ridicare personală sau curier propriu: arată cât din trafic acoperă de fapt E2;
- câte combinații n-au `uid`: la ele, o redenumire schimbă identitatea (pentru E3 și D30).

### 9.5 Scenariile cap la cap
Scenariile 1-16 se rulează după E2 (pe contul de probă, apoi la pilot) și după E4. Celelalte au etapa trecută în paranteză.
1. Conectare reală cu o singură emitere; „Testează” nu emite; evenimentul de probă ajunge, cu varianta de semnătură recunoscută, și produce o singură recitire, fără nicio stare schimbată pe baza payload-ului.
2. Comandă cu ramburs: apare în easySales cu aceleași sume, același județ și metadatele.
3. Comandă cu card: pleacă abia după plată; `maybeAutoInvoice` nu emite, iar jurnalul o spune. Se notează dacă factura easySales apare încasată (M-INV-1).
4. AWB „Manual” în easySales: apare în Edinio și în contul cumpărătorului, cu starea după regulă. Cu `courier.id` 13 sau necunoscut, fără link de urmărire.
5. Factură în easySales: apare în Edinio; nu se emite nicio factură Edinio; butoanele de factură refuză.
6. Anulare în easySales, pe o comandă fără AWB:
   - `tranzitieComandaMarketplace` o duce în `cancelled`, iar `aplica_tranzitia_comenzii` eliberează stocul (eliberarea e implicită [C: `src/lib/orders/tranzitie-marketplace.ts:182-191`; în baseline, `coalesce(p_elibereaza_stoc, true)`]);
   - helperul nu trimite nici GA4, nici notificări [C], deci drumul easySales le cheamă explicit;
   - `raporteazaRambursareaGa4` trimite un `refund` numai dacă achiziția a fost raportată înainte; altfel întoarce `fara-achizitie`, și așa e corect [C: `src/lib/orders/ga4-comanda.ts:143`];
   - comerciantul primește notificarea în clopoțel numai dacă comanda era plătită online („banii nu s-au întors automat”);
   - emailul de stare către cumpărător pleacă numai dacă D5 alege „Edinio anunță”.
   Pe o comandă cu AWB, starea rămâne, iar notificarea spune „probabil retur”.
7. „Anulează în easySales” din Edinio, pe o comandă New: comanda e anulată întâi la ei, apoi local, cu GA4 chemat explicit, ca la 6. Reușită înseamnă numai un 2xx cu `success: true` și starea „Canceled”.
8. Anulare din contul cumpărătorului pe o comandă ștampilată: refuz și notificarea comerciantului.
9. Comandă refuzată (422): `GET /orders?order_display_id=<es_order_id>`, cu `website=` după M-COM-5, nu găsește nicio comandă cu `website` al nostru și cu `id` egal cu `es_order_id`. Comanda se întoarce la Edinio, cu `maybeAutoInvoice`. Un rezultat al altui website sau cu alt `id` nu contează ca „găsită”.
10. Timeout simulat la Save: starea `necunoscut`; recuperarea prin filtrul easySales `?order_display_id=<es_order_id>`, fără dublură.
    - Recuperarea nu se sprijină pe răspunsul Save (nedocumentat) și nici pe `order-created.id` (IPOTEZĂ, M-WH-2).
    - Un GET gol imediat după timeout nu dovedește lipsa: un nou Save vine abia după cele 10 minute din §5.1.5.
    - `order_display_id` e un câmp easySales, păstrat în `easysales_comenzi.es_display_id`. Tabela `orders` nu are o asemenea coloană; numărul afișat al comenzii Edinio e `orders.order_number` [C].
11. Catalog: produs simplu, produs cu variante, ștergere (stoc 0 și arhivare), redenumire de categorie (Save cu același id; dacă M-CAT-1 arată un duplicat, `PUT` pe id-ul intern), produs fără categorie (după M-PROD-5), combinație ștearsă (după D30).
12. Stoc (E4), cu webhook-urile oprite: o vânzare în vitrină ajunge în easySales ca stoc nou în 1-2 minute; o vânzare externă devine comandă „ES-…”, cu consum și împingere, iar canalele văd stocul după varianta aleasă în M-STOC-1, fără o a doua scădere; o anulare externă eliberează stocul.
13. Webhook oprit (abonare ștearsă): reconcilierea aduce starea, iar alarma de tăcere pornește.
14. Token revocat din afară, printr-o emitere din alt script pe același client: o reemitere; a doua revocare în 24 de ore duce la `needs_reconnect`.
15. Website token reîmprospătat în interfața lor: `needs_reconnect`, cu mesajul potrivit, fără reemiteri în buclă (după ghid, valoarea veche primește 403; că și grantul o refuză e o deducție, iar răspunsul lui e nedocumentat, M-AUTH-4).
16. Deconectare (cu stoc 0) și reconectare: nicio dublură la ei; abonările altor magazine sau integrări de pe cont rămân.
17. Ridicare personală (`courier = 'pickup'`), curier propriu (`own`) și punct de ridicare: comenzile nu pleacă în easySales, iar butoanele Edinio de factură și AWB rămân deschise (D27, D17). (E2)
18. Cerere de retragere (OUG 18/2026) pe o comandă procesată în easySales: cererea ajunge numai în Edinio, iar comerciantul primește notificarea „retur pe o comandă procesată în easySales”, cu legătura spre comanda lor. După D28 vin repunerea în stoc la aprobare și legătura cu stornarea prin `storno-invoice-created.order_return_id` [A: exemplu]. (E2; repunerea în stoc, E4)
19. Anonimizarea unui cumpărător cu o comandă trimisă: ștampila rămâne, iar în tabelele `easysales_*` nu rămân date personale. La easySales, ștergerea urmează D33 și ES-27. (E2)
20. Vânzare externă modificată după consum (storno parțial, produs adăugat): stocul Edinio se ajustează o singură dată (M-EXT-4, ES-21). (E4)
21. Comandă onorată de marketplace sau de un 3PL: nu consumă stoc (M-EXT-3, ES-20), dacă se poate provoca. (E4)
22. Website redenumit în easySales: nicio retrimitere în masă; pauză și notificare. (E3)
23. Moneda: un magazin care nu e în RON nu se poate conecta (D29), iar o schimbare de monedă după conectare pune catalogul și stocul în pauză. (E1, E3)

### 9.6 Pilotul
- **Înaintea primei comenzi:** procedura pentru comenzile de test (hotărâre a proprietarului, §11.a).
  - `orders` nu are o coloană care să marcheze comanda de test (`epacket_test` privește numai AWB-ul ePacket) [C: `src/types/database.types.ts`]. Prima comandă de probă a comerciantului poate primi deci în easySales factură fiscală reală și AWB.
  - Propunerea: fluxurile automate easySales (factură, AWB, SMS, email) stau oprite pe website-ul Edinio până trece proba cap la cap, iar comenzile marcate ca test nu se ștampilează.
  - M-COM-8 se face înaintea primei comenzi reale, iar semnătura trece în modul `impune` (după M-WH-1).
- E2: primele 20 de comenzi reale se compară câmp cu câmp, cu sumele ban cu ban față de încasarea pe card; prima factură și primul AWB emise la ei trebuie să apară în Edinio.
- E3, numai după M-EXT-1 și M-STOC-1 pozitive (sau modul B): citirea înapoi a catalogului dă 100% potrivire de SKU, preț și număr de variante. Până la pornirea stocului nu se leagă nicio ofertă activă de produsele Edinio: Autolink potrivește pe SKU, EAN, nume, ID sau „Product Website ID” (centrul de ajutor, articolul „Link Produs-Oferta / Autolink”).
- Un pilot care vine de pe alt website easySales are ofertele legate de produsele aceluia, poate și stoc comun pe SKU. Mutarea ofertelor pe produsele Edinio (ES-24) și vânzările de pe website-ul vechi cu aceleași SKU (D32) se lămuresc înainte de E4.
- E4: umbra sau canarul, apoi 30 de zile de urmărire a derivei și a supravânzărilor.

### 9.7 Ce măsurăm după lansare
- Comenzi, pe magazin: trimise, refuzate, blocate, necunoscute; timpul până la trimitere (p95); timpul până la AWB vizibil în Edinio (p95 sub 5 minute); documente duble (ținta e zero, urmărită cu detectorul zilnic); diferențele de sumă dintre încasarea pe card și factura easySales (ținta e zero).
- Comenzile din vitrină care nu pleacă în easySales, pe motiv: ridicare personală, curier propriu, punct de ridicare, altă monedă, refuz la mapare.
- Webhook-uri primite, cu și fără semnătură validă; tăceri; emiteri de token și `needs_reconnect`.
- Stoc: împingeri, opriri ale siguranței de masă, diferențe neexplicate, vânzări externe consumate, ajustate după consum sau neconsumate (FBE, 3PL, canal necunoscut), evenimente `lipsa` (supravânzări posibile), latența de la vânzarea externă la scăderea în Edinio (p95 sub 5 minute).
- Retururile OUG 18 pe comenzile procesate în easySales: notificate și, după D28, repuse în stoc.
- Bugetul de cereri folosit; rutele cu zero reușite în `easysales_request_log`; `error_logs` și Sentry (care prinde doar erorile neprinse).
- Nota rămâne cel mult 9/10 până la un flux cap la cap pe trafic real: comandă din vitrină, procesare în easySales, AWB, factură, livrare și stocul corect pe marketplace.
## 10. Etape de livrare
**Reguli pentru toate etapele:**
- commit local des, push o singură dată, când spui tu;
- porțile verzi înainte de push;
- fiecare migrație primește un rând în secțiunea B a `docs/redesign/REGISTRU.md`, scris în clipa în care se face schimbarea, nu abia la aplicare [C: regula, r. 11; secțiunea B, r. 70; tabelul, r. 86]. E registrul redesignului, nu o listă a migrațiilor aplicate pe DEMO: fiecare rând are câte o coloană DA/NU pentru DEMO și pentru PRODUCȚIE, deci acolo intră și o migrație încă neaplicată pe DEMO (rândurile 30 și 31 au azi DEMO = NU);
- migrația se aplică întâi pe DEMO, apoi pe producție înaintea codului, cu acordul tău; cele două coloane ale rândului se țin la zi;
- baza DEMO (`krycmubsiojipwslxrka`) ține de redesign și se șterge la închiderea lui [C: `docs/redesign/REGISTRU.md:14`, care trimite la `demo-seed/LA-FINAL.md`, în afara repo-ului]. O etapă care pornește după aceea își stabilește întâi cu tine baza de probă;
- zero liniuțe de dialog în diff;
- după push: SHA-ul local egal cu `origin/main`, CI citit prin `check-runs`, desfășurarea READY, Sentry fără erori noi.

Fiecare etapă se poate opri pe magazin, fără redeploy. Ordinea dintre E2 și E3 o hotărăsc pilotul și M-COM-9 (D2). E3 are în plus o condiție proprie: catalogul pleacă numai dacă E4 se dovedește posibilă (M-EXT-1, M-STOC-1) sau dacă modul B e acceptat, fiindcă un catalog ținut pe stoc 0 nu vinde nimic.

### E0: Măsurătoarea (fără cod în repo)
- **Conținut:**
  - contul de probă și măsurătorile din §9.4;
  - **M-EXT-1 merge prima**, împreună cu ES-12 și ES-26. De ea depind D3, deci forma lui E1, și rostul lui E3. Pe probă se face cu o comandă manuală și cu una de pe un al doilea website al contului; comanda reală de marketplace se vede abia la pilot. Urmează M-STOC-1, în forma lărgită din E4;
  - vânzările externe se probează cu o comandă manuală în easySales. Documentația nu pomenește niciun marketplace de probă, niciun mediu sandbox și nicio legare a unui marketplace la un cont de probă. `GET /marketplaces/list` arată doar canale reale [A: exemplul de răspuns, 18 canale];
  - „dynamic marketplace” e numai depozitul GitHub easySales `dynamic-marketplace-sandbox-api`, din 2023, neatins din 17.05.2023. E un server Express local, cu date fixe, care imită API-ul expus către easySales de un marketplace de tip „Dynamic”. Ar fi de folos numai dacă easySales l-ar înregistra pe cont, lucru nedocumentat. De aceea ES-15 se pune așa: „Puteți înregistra pe contul de probă un marketplace de tip Dynamic care să cheme un server al nostru?”;
  - întrebările ES trimise la api.support@easysales.ro, inclusiv ES-20..ES-32;
  - hotărârile D1-D6. **D3 se hotărăște aici, înaintea E1**, nu în E4: un Personal Access Token schimbă formularul de conectare, stocarea, amintirile și analiza de securitate (vezi E1);
  - la alegerea pilotului (D1), stocul lui trebuie să fie în Edinio. Un comerciant cu stocul în SmartBill sau într-un ERP legat prin easySales nu are drum în v1, cât timp modul B e amânat. E o limită de produs, spusă la D1 și la D3;
  - numărătorile din baza Edinio, doar citire: ponderea comenzilor din vitrină cu punct de ridicare, ridicare personală sau curier propriu, care arată cât din trafic acoperă de fapt E2; câte combinații n-au `uid` (pentru E3 și D30);
  - fișa „Măsurat pe fir”, care intră în repo în E1.
- **Limitele probei:** după textele aplicației, contul de probă are limite proprii, mult sub planul Pro: 50 de etichete (probabil AWB), 50 de facturi, 50 de transmiteri și 10 listări pe canal (IPOTEZĂ de confirmat; D16, ES-29). Sursa e numai fișierul de traduceri al aplicației; nicio pagină publică și nicio documentație nu le confirmă. Limitele pot opri măsurătorile, de exemplu o încărcare de catalog sau a 51-a etichetă. Scripturile își numără consumul.
- **Gata când:** M-EXT-1, M-AUTH-1, 2, 4, 5 și M-LIM-1 sunt făcute, iar D3 e hotărât. Restul sunt măsurate sau marcate „nemăsurabil pe probă”, cu etapa care le așteaptă.
- **De confirmat înainte:** D16 (cine creează contul și când pornește fereastra de 14 zile), cu limitele probei lămurite: dacă „etichetele” sunt AWB-urile, ce înseamnă „transmiteri” și dacă website-ul API V2 intră la „listări pe canal”, sau un cont de integrator fără ele (ES-29). Scripturile se pregătesc dinainte.
- **Întoarcere:** nu e nimic de întors.

### E1: Fundația, invizibilă
- **Conținut:**
  - migrația fundației; clientul, tokenul, ritmul, jurnalul, configurarea;
  - conectarea în două trepte, testul, evenimentul de probă, deconectarea, pauza;
  - două verificări noi la conectare:
    - refuz dacă moneda magazinului nu e RON (D29), fiindcă website-ul se creează în RON (§3.7), iar țara, limba și moneda lui nu se mai pot schimba după creare (ghid: „Country, Language and Currency are locked once the website exists”). Moneda magazinului se citește din `store_settings.currency` [C: citită deja la Pepita, `src/lib/actions/pepita.actions.ts:1056-1057`];
    - la un plătitor de TVA, cota magazinului trebuie să fie una legală azi (21, 11 sau 0). Catalogul trimite `vat_enabled ? vat_rate : 0`, deci o cotă greșită ar pleca pe tot catalogul;
  - dacă D3 alege Personal Access Token-ul:
    - un al patrulea secret în formular, criptat ca celelalte;
    - amintirea de a-l reintroduce înainte de expirare, fiindcă nu se reîmprospătează [A]; azi amintirea există numai pentru tokenul website;
    - analiza de securitate. După ghid, un PAT acoperă tot contul (IPOTEZĂ), deci vede datele personale de pe toate canalele, e același pentru toate magazinele Edinio de pe cont, iar revocarea lui le oprește pe toate;
  - ruta de webhook (doar inbox, semnătura în modul `masoara`);
  - cronul (sănătate, token, abonări, curățenie). La deconectare, curățenia abonărilor potrivește URL-ul exact, cu `businessId`, ca să nu șteargă abonările altui magazin Edinio sau ale altor integrări de pe același cont;
  - pagina numai pentru administratori, sigla în git și documentul.
- **Gata când:**
  - conectarea reală la contul de probă, din producție, face exact o emitere;
  - „Testează” nu emite;
  - evenimentul de probă și unul real ajung, cu varianta de semnătură recunoscută;
  - nu apare niciun `needs_reconnect` neașteptat în 7 zile;
  - porțile CI sunt verzi;
  - trec probele noi ale fundației (§9):
    - zăvorul: două fire concurente fac exact o cerere la `/oauth/token`, numărată de serverul fals;
    - clasificatorul de 403, pe textele reale strânse în E0, recunoaște după mesaj, în ordine: plafonul de comenzi, website-ul dezactivat, tokenul website invalid, scope-ul lipsă, alt 403. Numai două mesaje de 403 sunt documentate: „The website has been deactivated” și „Invalid website token” (ghid). Scope-ul lipsă dă 403 [A: Archive product], dar fără un mesaj documentat (M-AUTH-4). „Orders limit exceeded” apare în ghidul erorilor de website ca eroare a importului comenzii, fără cod HTTP. Că vine ca 403 e IPOTEZĂ de confirmat (M-COM-6). Numai scope-ul lipsă se repară printr-o reemitere cu toate scope-urile. Un 403 nerecunoscut nu duce niciodată la o reemitere automată;
    - o semnătură calculată cu cheie goală e recunoscută ca „secret nepreluat”;
    - evenimentul de probă, cerut prin `POST /api/v2/webhooks/{user_webhook_id}/trigger` [A: Triggering webhooks], produce o singură recitire și nu schimbă nicio stare pe baza payload-ului. `trigger` e endpointul care declanșează un abonament existent, nu numele unui eveniment. Ce slug și ce payload poartă livrarea de probă nu e documentat (M-WH-4);
    - curățenia abonărilor șterge numai URL-ul exact al magazinului;
    - contractul: corpurile Save poartă `website_token`, iar corpurile multipart nu.
- **De confirmat înainte:**
  - M-AUTH-1, 2, 4, 5 (M-AUTH-3 așteaptă E5), M-LIM-1, M-WH-1, M-WH-4 și M-ACC-1;
  - D3 și D29; acordul pentru migrație;
  - lista de scope-uri, închisă înaintea primei emiteri reale. Emiterea unui token nou îl revocă pe cel vechi [A: Authentication]. Că un scope adăugat mai târziu cere o emitere nouă e o deducție: scope-urile se trimit numai în cererile de emitere [A], iar dacă `refresh_token` poate cere scope-uri în plus nu e documentat (IPOTEZĂ de confirmat, M-AUTH-3). Pe lângă cele 21 din §4.3 intră cele de care au nevoie etapele următoare:
    - `read-fulfillment-services`, pentru E4 [A: lista Available Scopes];
    - `update-customers`, dacă D33 alege ștergerea prin `PATCH /customers/{id}` [A: Update Customer]. Scope-ul e în lista Available Scopes [A], dar nicăieri nu scrie că ruta îl cere; legătura e dedusă din nume (IPOTEZĂ de confirmat, M-AUTH-5);
    - `read-tags`, `add-tags` și `attach-tags`, dacă E2 folosește etichetele (planul B la ES-10);
    - că grantul website le acceptă se vede tot în M-AUTH-5;
  - partea din M-PROD-7 de care depinde Treapta B: `?website=` se încearcă întâi cu un nume sigur inexistent. Dacă nu întoarce zero, filtrul e ignorat sau parțial, iar poarta „zero produse” nu are valoare: fie refuză pe oricine, fie lasă să treacă greșit.
- **Întoarcere:** se șterge configurarea contului de probă; nimic altceva nu depinde de E1.

### E2: Comenzile magazinului se procesează în easySales
- **Conținut:**
  - migrația comenzilor; ștampila, outboxul, plasa;
  - ștampila exclude, pe lângă punctele de ridicare (`delivery_type = locker`), ridicarea personală și curierul propriu, până la D27 și ES-23:
    - ridicarea personală are `courier = 'pickup'` și `delivery_type = 'address'`, iar acolo `address` e adresa cumpărătorului, nu a magazinului [C: `src/lib/cont/livrare.ts:4-8`, `:76-78`];
    - curierul propriu are `courier = 'own'` [C: același loc];
    - altfel o automatizare easySales sau operatorul ar genera AWB spre casa unui cumpărător care voia să vină la magazin;
  - ștampila citește moneda din `store_settings.currency`, fiindcă `orders` n-are coloană de monedă [C: `src/types/database.types.ts`];
  - trimiterea, recuperarea, metadatele; F2 cu benzile; F3;
  - porțile: factura automată, manuală și în lot, AWB-ul, starea, editarea, ștergerea, contul cumpărătorului;
  - exclusivitatea canalelor, panoul comenzii și ramura din contul cumpărătorului;
  - retragerea din contract (OUG 18/2026) pe o comandă procesată în easySales. Azi cererea ajunge numai în Edinio (`return_requests`, cu statusurile nou, aprobat, respins, rambursat [C: `src/lib/actions/return.actions.ts:22`; fișierul nu atinge stocul]). Stornarea se face în easySales, rambursarea cardului prin procesatorul Edinio, iar stocul nu-l repune nimeni. Intră, după D28:
    - notificarea „retur pe o comandă procesată în easySales”, cu legătura spre comanda lor;
    - legătura dintre `storno-invoice-created.order_return_id` [A] și cererea de retur;
    - repunerea în stoc la retur aprobat, în Edinio, care e sursa stocului;
  - planul B, dacă ES-10 iese negativ (automatizările easySales nu se pot opri pe website). Pârghiile pe care planul nu le folosea:
    - statusul custom inițial din formularul website-ului, „Status custom pentru comanda nouă” (ghid), dacă ES-31 confirmă că se aplică și comenzilor venite prin API;
    - `PATCH /orders/{internal_id}/custom-status` [A];
    - o etichetă „Edinio” sau „plătită online” pusă pe comandă (`POST /tags/attach`, filtrele `tags` și `has_tags` ale listei [A]). Dacă automatizările lor pot filtra după etichetă se află odată cu ES-10.
- **Gata când:**
  - scenariile 1-10 și 13-16 din §9.5 trec pe contul de probă;
  - trec probele noi (§9):
    - proba SQL pe ștampilă: nu se pune pe `courier` `pickup` sau `own`, pe locker și nici pe o monedă diferită de RON citită din `store_settings.currency`;
    - toate comenzile istorice din vitrină (pe DEMO sau pe o copie anonimizată) trec prin mapare și prin `reconciliazaComanda`, cu numărul și motivul celor refuzate. Până acum planul avea doar cazuri construite;
    - rotunjirile la 21% și la 11%, comparate ban cu ban cu încasarea pe card;
    - `order_date` în zilele de schimbare a orei (ultima duminică din martie și din octombrie);
    - după o ștergere GDPR nu rămân date personale în inbox, în jurnal sau în `raspuns_brut`;
  - semnătura webhook-urilor e în modul `impune` (după M-WH-1) înaintea primei comenzi reale. Jetonul din URL ajunge în jurnalele de cereri, deci nu poate rămâne singura încuietoare;
  - la pilot, 20 de comenzi reale trec fără nicio abatere: zero dubluri la ei, zero diferențe de sumă, AWB vizibil în Edinio la p95 sub 5 minute, zero documente duble;
  - mutanții cad.
- **De confirmat înainte:**
  - măsurătorile: M-ID-1, M-ID-2, M-COM-1..5, 7, 9, 10 (și M-COM-6, dacă plafonul se poate provoca pe probă), M-AWB-1, M-INV-1, M-WH-1..3 și M-WH-5. Dacă M-WH-5 arată o singură abonare pe slug, două magazine Edinio pe același cont au nevoie de o rezervă: o abonare pe cont, împărțită de Edinio între magazine;
  - M-COM-2 acoperă în plus:
    - multe bucăți la preț mic, cotele de 21% și 11%, iar ramburs, extraopțiuni și voucher în aceeași comandă. Rotunjirea e documentată doar în parte: la Add Order, `price_with_tax` și `total_with_tax` sunt „rounded with 2 decimals” [A]. Riscul: suma încasată cu cardul diferă cu un ban de factura easySales;
    - ce `order_total` așteaptă easySales. E definit „products values + shipment tax” [A], fără să pomenească `fees` și `vouchers`; singurul exemplu coerent dă produsele cu TVA. Planul ține trimiterea ca parametru, cu variantele (a) și (b) din §5.1.4, iar M-COM-2 alege (ES-9);
    - `total_vouchers` trimis 0 la comenzile fără reduceri: tabelul cere „Must be a negative number”, dar exemplele Add și Update trimit 0 [A];
  - M-INV-1 arată și dacă `invoice.id` din `invoice-created` [A] e id-ul intern cerut de `POST /orders/{internal_id}/mark-as-paid/{internal_invoice_id}` [A]. Fără această rută, facturile easySales ale comenzilor plătite cu cardul rămân neîncasate la ei;
  - M-COM-8, înaintea primei comenzi reale, cu card sau cu ramburs:
    - Generate AWB acceptă obiectul opțional `advanced_data`, care „is used to overwrite default order data”. În el stă `order_data.cashValue`, float, cu nota „Order value” [A]. Exemplul îl trimite ca șirul `"120.00"`;
    - documentația nu spune că `cashValue` e rambursul încasat de curier (poate fi, de pildă, valoarea declarată). Nu spune nici ce pune easySales implicit, nici ce face pe o comandă cu `payment_mode` 1. Valoarea 1 e metoda de plată „Online” [A], nu starea „plătită”. Starea plății e câmpul separat `payment_status` [A], deci o comandă cu `payment_mode` 1 nu e neapărat încasată. Sensul de ramburs e IPOTEZĂ;
    - se verifică: pe o comandă plătită cu cardul, cu `cashValue` = 0 trimis explicit și apoi fără `advanced_data`, AWB-ul nu are ramburs; pe o comandă cu ramburs, rambursul de pe AWB e egal cu `cashValue` și cu totalul de încasat;
    - până atunci nu ne bazăm pe valoarea implicită a easySales la comenzile plătite online. Dacă AWB-ul generat fără `advanced_data` pune ramburs pe o comandă plătită online, acele comenzi nu se ștampilează până la răspunsul ES-9;
  - hotărârile:
    - D4, D5, D17, D18, D19, D24, D25, D27, D28;
    - D31: comenzile cu fișiere de personalizare. Operatorul easySales ar primi doar rezumatul din `observations`, fără fișierele de producție;
    - D15 (documentele juridice) și D33 (DPA-ul cu easySales, ștergerea datelor, de mână sau prin `PATCH /customers/{id}`, și minimizarea datelor trimise), înaintea primei comenzi reale. Colecția nu are DELETE pe clienți sau pe comenzi [A];
  - întrebările: ES-10, ES-23, ES-27, ES-31. La ES-23: curierul ales în checkout ajunge doar ca text în `delivery_notes`; dacă automatizarea alege alt curier, comerciantul plătește alt tarif decât a încasat;
  - pilotul ales (D1), cu procedura lui: automatizările easySales stinse pe canalul Edinio până la proba cap la cap, iar comenzile de probă ale comerciantului marcate ca test și neștampilate. `orders` n-are o coloană care să marcheze comanda de test [C: `src/types/database.types.ts`; `epacket_test` privește numai AWB-ul e-packet], deci prima comandă de probă ar putea primi la ei factură fiscală reală și AWB.
- **Întoarcere:** comutatorul se stinge, iar comenzile noi rămân la Edinio. Cele trimise rămân la easySales; după deconectare, se deblochează pe comandă, cu confirmare. Comenzile ștampilate și încă netrimise (`de_trimis`, `asteapta_plata`) n-au azi nicio regulă când comutatorul se stinge fără deconectare: ar rămâne blocate pentru factură și AWB din Edinio, fără să le trimită nimeni. Propunerea: trec la Edinio, cu notificare, ca la deconectare (§4.8, pasul 5).
- **Se livrează singură:** da.

### E3: Catalogul, cu stocul pe 0
- **Conținut:**
  - migrația catalogului;
  - raportul de pregătire, livrabil și singur, fiindcă arată golurile de SKU și de descriere;
  - F4: categorii, caracteristici, produse, prețuri, verificare, arhivare la ștergere;
  - stările pe produs și stocul pe 0;
  - rândurile `arhivat` sunt excluse explicit din orice împingere (stoc, preț, conținut). După ghidul easySales „Arhivează și restaurează produse”, un produs arhivat se poate restaura timp de o lună, apoi e șters definitiv. Din interfață, restaurarea merge și în masă, cu „Selectează tot”, fără o limită spusă. Limita de 50 e a arhivării prin API: `PATCH /products/archive/bulk` primește 1-50 SKU-uri [A]. Ce face un Save pe un SKU arhivat e documentat doar indirect: un produs arhivat, dar încă activ pe site, e reimportat la următoarea sincronizare ca produs nou, fără oferte legate (același ghid). Comportamentul exact al `POST /products/save` pe un SKU arhivat nu e documentat (M-PROD-6, ES-25), deci reconectarea după o lună are nevoie de o regulă proprie;
  - înaintea oricărei retrimiteri în masă, numele website-ului se confirmă în `websites/list`. Lista de produse se filtrează după numele website-ului, cu `?website=<nume>` [A: List products]. Ce întoarce filtrul cu numele vechi, după o redenumire în easySales, nu e documentat. Dacă întoarce zero (IPOTEZĂ de confirmat, M-PROD-7), verificarea din §5.4.5, pasul 3, ar retrimite tot catalogul element cu element (la esafero, zeci de mii de Save-uri). Dacă numele lipsește: pauză și notificare;
  - dacă moneda magazinului se schimbă după conectare, catalogul și stocul intră automat în pauză (D29);
  - tranzițiile variantelor: o combinație dezactivată sau ștearsă se arhivează sau rămâne cu stoc 0 (D30); un produs simplu care primește variante lasă la easySales rândul `''` cu stocul vechi, iar cazul invers nu e tratat nici el;
  - citirea ofertelor, dacă ES-19 lămurește segmentul (vezi E5): `GET /api/v2/offers/{segment}` cu filtrele `linked` și `product_id` [A] arată ofertele legate prematur de produsele pe stoc 0 și pregătește raportul „nelegate” din E4.
- **Gata când:** catalogul pilotului, citit înapoi, se potrivește 100% (SKU, preț, variante); nu rămâne niciun produs nevăzut; cererile consumate sunt cele estimate; nimic nu se poate vinde. Trec și probele noi (§9):
  - variantele: redenumire cu `uid` și fără, combinație ștearsă, trecerea de la produs simplu la produs cu variante;
  - rândurile `arhivat` sunt excluse din toate împingerile;
  - un website redenumit nu declanșează retrimiterea în masă;
  - încărcarea inițială esafero, pe serverul fals și cu latență reală, se reia după tăierea la 60 de secunde, fără dubluri.
- **De confirmat înainte:**
  - M-EXT-1 și M-STOC-1 cu rezultat pozitiv, sau modul B acceptat (§5.9). M-STOC-1 e pozitiv când easySales se poartă după una dintre cele două variante ale formulei din E4. Fără ele, trimiterea catalogului se construiește degeaba; raportul de pregătire nu le așteaptă;
  - M-CAT-1, M-PROD-1..7;
  - numărul combinațiilor fără `uid`, măsurat în E0. La ele identitatea e amprenta titlului [C: `src/lib/storefront/variante-identitate.ts:52-54`], deci o redenumire produce o identitate nouă, apoi un SKU generat nou, apoi un produs nou la easySales;
  - D8, D9, D10, D11, D21, D22, D23, D30;
  - ES-25; ES-30 (imaginile: costul încărcării inițiale la esafero și al fiecărui Save); ES-32. Până la ES-32, „nu atingem ofertele” nu e garantat. După centrul de ajutor, modificările din site se propagă în oferte, mai puțin câmpurile decuplate. Deci `PATCH /products/prices/bulk` [A] poate schimba și prețul de pe marketplace, eventual cu Autoprice peste el (IPOTEZĂ de confirmat, ES-32). Cât de repede nu e documentat. Adaosul procentual e îndoielnic aici: după centrul de ajutor, el se pune doar la ofertele noi. Prețul ofertei are un endpoint separat, `PATCH /offers/{segment}/prices/bulk` [A] (vezi E5). Nici conversia pentru piețele în HUF, BGN sau EUR nu e încă discutată.
- **Întoarcere:** comutatorul se stinge. Produsele rămân la ei pe 0 și se arhivează din interfața lor, dacă vrea comerciantul.

### E4: Bucla de stoc (umbră sau canar, apoi efect)
- **Conținut:**
  - F5 pentru stoc: formula, ordinea, gărzile, deriva, verificarea sursei;
  - formula rămâne parametru până la M-STOC-1, cu două variante scrise dinainte:
    - (a) model cu scădere a copiei: `max(0, E - Z_ext)`, ca în §5.5;
    - (b) model cu rezervare: E plus rezervările easySales pentru comenzile deja consumate în Edinio și încă nefinalizate la ei. Edinio le știe din `easysales_comenzi`;
  - de ce două variante: centrul de ajutor descrie un model cu rezervare. La intrarea unei comenzi, easySales rezervă cantitatea pe toate canalele, fără să scadă copia. Rezervarea dispare la finalizare (generarea AWB-ului finalizează comanda) sau la factură. Scăderea efectivă se face la facturare, numai pe produsele legate (Link); fără o factură generată din platformă, stocul se scade de mână. Din octombrie 2025 se poate alege între scăderea la finalizarea comenzii și cea la facturare, după blogul lor („Product updates Octombrie 2025”, easy-sales.com/blog/ro/product-updates-octombrie-2025, 20.11.2025). Bifa „Scade stocul la emiterea unei facturi noi” (Setări → Setări comenzi, tabul Stocuri) apare în ghidul „Încarcă propria factură pe o comandă” (easy-sales.com/ro/guides/cum-incarci-propria-factura, 01.10.2026). Că modelul se aplică și unui website API V2 cu sursa Website e IPOTEZĂ de confirmat (ES-22, M-STOC-1);
  - dacă modelul e acesta, varianta (a) scade de două ori aceeași bucată. Înainte de consum, Edinio trimite E - 1, rezervarea mai scade 1, iar ofertele văd E - 2. După consum, E - 2 rămâne până la AWB sau factură, la fiecare vânzare externă. Fără `Z_ext`, rezervarea singură ar da exact E - 1 până la consum;
  - regula derivei („numai în jos, niciodată în sus fără explicație”) se revizuiește după M-STOC-1. Dacă easySales își scade copia la finalizare sau la factură, ea poate fixa o sub-numărare produsă chiar de ei;
  - F6: clasificarea, înregistrarea, consumul, ciclul, propagarea;
  - comenzile onorate de marketplace sau de un 3PL nu consumă stocul Edinio, fiindcă marfa e deja la ei. Integrarea nativă eMAG are regula pentru FBE [C: `onoratDeEmag`, `src/lib/emag/orders.ts:675`, aplicată la `:1245-1254`], iar centrul de ajutor spune, numai pentru Amazon, că la sursa FBA easySales nu scade stocul (articolul „Configurare Marketplace Amazon”). Clasificarea folosește filtrul `fulfillment_service_id` și `GET /fulfillments/list` [A], plus canalele FBE din pachetul JavaScript al aplicației easySales, absente din documentația API (`EmagROFBE` 41, `EmagHUFBE` 55, `EmagBGFBE` 56), până la ES-20;
  - ajustarea după consum. `consuma_stoc_comanda_marketplace` consumă o singură dată, pe `stoc_marketplace_la`, deci un storno parțial sau un produs adăugat pe o comandă deja consumată lasă stocul greșit, fără niciun semn. La fiecare recitire a unei comenzi externe deja consumate, liniile se compară, iar diferența trece prin `ajusteaza_stoc_comanda_marketplace` [C: baseline 1220], ca la eMAG (`src/lib/emag/orders.ts:1484`) și la Pepita (`src/lib/pepita/ingest.ts:1382`). Ce câmpuri arată modificarea la easySales întreabă ES-21;
  - rândurile `arhivat` nu intră în potrivirea vânzărilor externe;
  - semnalele: banda de listă e singurul semnal sigur. `order-created` pentru comenzile de marketplace și `product-stock-updated` pentru un website API V2 sunt nedocumentate, iar ghidul spune că stocul nu se întoarce. Rămân semnale opționale de recitire (M-WH-2, M-STOC-2);
  - paza la conectarea nativă și politica de oprire;
  - umbra sau canarul și pornirea simetrică.
- **Gata când:**
  - umbra (dacă se poate) a rulat 14 zile sau 30 de comenzi, cu 100% clasificare corectă pe eșantionul verificat de mână;
  - canarul a rulat 7 zile curat;
  - apoi tot catalogul a rulat 30 de zile cu zero consumuri duble, zero supravânzări și o latență vânzare externă → scădere în Edinio sub 5 minute la p95;
  - trec probele noi (§9):
    - comenzile FBE și 3PL nu consumă stoc;
    - un storno parțial și un produs adăugat ajustează stocul, după modelul probei Pepita;
    - vânzarea de pe alt website al contului urmează D32;
    - stocul, pe serverul fals, în ambele modele (rezervare și scădere a copiei), cu AWB și factură; deriva nu fixează o sub-numărare produsă de easySales;
    - ștampila nu se pune pe comenzile „ES-...” importate, care altfel ar face o buclă.
- **De confirmat înainte:**
  - M-STOC-1..3, M-EXT-1 și M-EXT-2, cu rezultat pozitiv. M-STOC-1 măsoară separat comanda de vitrină trimisă prin API și comanda de pe alt canal, sub ambele setări de scădere („la finalizare” și „la facturare”). Pe probă, comanda de pe alt canal e una manuală (E0); comanda reală de marketplace se vede la pilot;
  - M-MKT-1, numai pentru precompletarea canalelor; dacă iese negativ, declarația rămâne manuală (§4.9);
  - D3 (hotărât în E0), D6, D7, D12, D20, D32;
  - ES-20, ES-21, ES-22, ES-24. Un pilot care vinde deja prin easySales poate avea ofertele legate de produsele altui website (WooCommerce, Gomag) și stoc comun pe SKU. Planul cere un website nou și gol, dar nu spune încă cum se mută ofertele pe produsele Edinio (ES-24). Regula „doi martori” respinge vânzările de pe website-ul vechi cu aceleași SKU-uri, deci stocul comun din Edinio nu scade (D32);
  - dacă M-EXT-1 iese negativ și nu există o alternativă acceptată, E4 nu se livrează (§5.6).
- **Întoarcere:** „Oprește bucla” pune întâi stocul pe 0 la ei, apoi oprește consumul.

### E5: Extinderile (fiecare cu probele ei)
- **Modul hibrid:** Edinio emite AWB-ul sau factura și le încarcă la ei: `POST /orders/{internal_id}/awb` cu PDF, `/invoice`, `/invoice/storno`, iar `PATCH /delivery-status` numai pe un AWB încărcat manual [A]. Încărcarea trece prin `cuRegistru` [C: `src/lib/operatii/registru.ts:180`], cu `esteChiarPdf` și `eDocumentDeTest` înainte și cu recitirea comenzii înaintea fiecărei urcări. E util, de exemplu, pentru Woot, care nu apare printre cei 40 de curieri de pe pagina lor de integrări (IPOTEZĂ, sursă publică citită pe 12.10.2026; se vede în contul de probă). Modul privește numai comenzile vitrinei. Procesarea în Edinio a comenzilor de marketplace venite prin easySales (AWB cu curierii Edinio, factura Edinio, apoi încărcarea la easySales) e o extindere separată, încă nediscutată.
- Celelalte extinderi:
  - retururile (`POST /returns`), numai după probe dedicate;
  - vizualizarea ofertelor, dacă n-a intrat în E3:
    - ruta e `GET /api/v2/offers/{segment}` [A], nu `/offers/40`. 40 e doar valoarea folosită în colecție, iar exemplele de răspuns au 1 și 2. Același segment apare în `PATCH /api/v2/offers/40/6/prices` și în `PATCH /api/v2/offers/40/prices/bulk` [A];
    - textul nu explică segmentul, dar colecția îl numește indirect `marketplace_id` [A]. Singurele ei variabile active sunt `marketplace_id` = 40 și `offer_id` = 6, exact `/offers/40/6/prices`. Același 40 apare la `/general-data/marketplace-cancellation-reasons/40` („Marketplace specific cancellation reasons”), iar Export Offers trimite câmpul `marketplace_id`;
    - deci segmentul e, cel mai probabil, id-ul marketplace-ului: IPOTEZĂ susținută de variabilele colecției, nu o afirmație explicită. Exemplele se bat cap în cap: `/marketplace-cancellation-reasons/40` întoarce motivele eMAG, deși Emag are id 1 în `GET /marketplaces/list`, unde 40 nu apare;
    - ES-19 se îngustează: segmentul e id-ul global din `/marketplaces/list` sau id-ul conexiunii contului? Cum îl aflăm pentru canalele comerciantului?
  - schimbarea voită a SKU-ului;
  - importul catalogului din easySales, nepublicat;
  - plata ramburs încasată la ei (D26);
  - refresh-ul tokenului (M-AUTH-3);
  - modul B, numai cu condițiile din §5.9;
  - parteneriatul (D14, ES-1). Documentația nu-l sprijină încă:
    - la „Account / Assign partner”, cererea definită e `POST /api/v2/account/sub-account/login`, același URL ca „Sub-Account Authentication”, cu corpul `{client_id, client_secret, username, password, scope}` și descrierea „Assign a partner to current user.” [A];
    - numai exemplul salvat „Assign partner -> Success”, cu răspunsul din 10.10.2022, are cererea originală `POST /api/v2/account/partners`, cu corpul `{code}` (în exemplu, un UUID), și răspunsul 200 „The partner has been assigned successfully” [A]. Calea `/partners` apare o singură dată în toată colecția;
    - nu sunt documentate originea și formatul lui `code`, dacă e obligatoriu, ce înseamnă „partner” și ce efect are pe cont. Ruta e dedusă dintr-un singur exemplu, peste o documentație contradictorie, și se confirmă cu easySales (ES-1) înainte de orice folosire. Textele aplicației au la înregistrare câmpul „Have a discount/partner code?”, deci pare un cod de partener sau de recomandare, dar nimic nu-l leagă documentat de `code`;
    - Gomag nu dovedește un client OAuth de partener. După articolul de suport easySales „Configurare Gomag”, ghidul „Cum conectezi Gomag cu easySales”, articolul Gomag „EasySales” și pagina Parteneri (surse publice), Gomag are în admin o aplicație easySales, iar comerciantul lipește acolo doar tokenul website-ului, fără client_id sau client_secret. Dacă aplicația folosește API V2 cu un client propriu nu e documentat: rămâne întrebarea ES-1, nu o premisă a planului.

### E6: Lansarea publică
- **Conținut:** catalogul public cu textul tău, sigla mică, ajutorul cu capturi, `EASYSALES_LIVE` pentru toți, documentul final.
- **Gata când:** pilotul a trecut E2, iar dacă se promite stocul unic, și E4.
- **De confirmat înainte:** D12 (pe ce planuri e disponibilă integrarea), D13 (textul și momentul), ES-28 (politica de versiuni și cum anunță easySales schimbările de API). Colecția n-are changelog. Data 28.09.2026 din exemplul evenimentului de storno [A] e a facturii din exemplu, nu a lansării. Că evenimentul e nou din 09.2026 o spune blogul lor: „Product updates Septembrie 2026” (easy-sales.com/blog/ro/product-updates-septembrie-2026, 03.10.2026) îl numește „un eveniment nou de webhook”.
- **Mărimi relative:** E1 medie, E2 mare, E3 mare (imagini, variante), E4 mare, E5 pe bucăți, E6 mică. Durata lui E0 depinde de cât de repede răspunde easySales și de limitele probei.
## 11. Întrebări deschise

### 11.a Pentru proprietar
- **D1. Cererea și pilotul.** Ai un comerciant concret care folosește easySales? Ce vrea întâi: comenzile magazinului procesate în easySales (E2), catalogul Edinio pe marketplace-uri prin easySales (E3-E4) sau amândouă?
  - Limita de produs, spusă de la început: integrarea cere stocul în Edinio („Sursă stoc produse: Website”, §3.7). Un comerciant care își ține stocul în SmartBill sau într-un ERP legat prin easySales nu are niciun drum cât modul B e amânat (D3), decât dacă mută sursa stocului în Edinio.
  - Procedura pentru comenzile de test din pilot: `orders` nu are un steag general de test [C: `src/types/database.types.ts`; singura coloană de acest fel, `epacket_test`, marchează un AWB e-packet emis cu cheia de test]. Prima comandă de probă a comerciantului poate primi deci în easySales factură fiscală reală și AWB. Propunerea: fluxurile automate easySales stau oprite până la proba cap la cap, iar comanda de test e marcată ca test și nu se ștampilează. De acord?
- **D2. Ordinea dintre E2 și E3**, după nevoia pilotului și după M-COM-9. Un catalog ținut pe stoc 0 nu vinde nimic, deci E3 n-are valoare fără E4. Propunerea: E3 pornește numai după ce M-EXT-1 și M-STOC-1 ies pozitive sau după ce se acceptă modul B (§5.9); altfel se construiește degeaba. De acord?
- **D3. Modelul.** Confirmi că Edinio rămâne sursa stocului și că modul B se amână?
  - Se hotărăște în E0, înainte de E1, nu abia înaintea E4. De aceea M-EXT-1 se măsoară primul în E0.
  - Dacă M-EXT-1 iese negativ, accepți un Personal Access Token ca al doilea secret, numai pentru citirea comenzilor, sau oprim E4? PAT-ul schimbă lucruri încă din E1: formularul de conectare (un al patrulea secret), stocarea, o reamintire anuală nouă (PAT-ul nu se reîmprospătează și expiră într-un an [A], pe când tokenul website se reemite automat, §4.6) și analiza de securitate. După ghid, un PAT autentifică tot contul (IPOTEZĂ de confirmat, M-EXT-1, ES-26). Dacă vede comenzile tuturor canalelor, vede și datele personale ale cumpărătorilor de pe ele.
  - Cât modul B e amânat, comercianții cu stocul în altă sursă (SmartBill, un ERP legat prin easySales) rămân fără drum. E o limită de produs și se spune explicit (D1).
  - Formula stocului trimis: o lăsăm parametru până la M-STOC-1 (recomandat), în loc să acceptăm dinainte o sub-numărare? Centrul de ajutor descrie un model cu rezervare: la intrarea comenzii, easySales rezervă cantitatea pe canale, iar rezervarea dispare la AWB sau la factură (IPOTEZĂ de confirmat, M-STOC-1, ES-22). În acest model, `max(0, E - Z_ext)` scade de două ori aceeași bucată la fiecare vânzare externă, nu doar temporar la comenzile noastre. Cele două variante, scrise dinainte:
    - (a) model cu scăderea copiei: `E - Z_ext`;
    - (b) model cu rezervare: `E` plus rezervările easySales pentru comenzile deja consumate în Edinio și încă nefinalizate la ei (Edinio le știe din `easysales_comenzi`).
- **D4. Stăpânul comenzilor trimise.** În E2 e easySales: AWB-ul și factura vin de acolo, iar butoanele Edinio se închid pe acele comenzi. Varianta „Edinio procesează, easySales doar vede” vine în E5. De acord?
- **D5. Cine anunță cumpărătorul** la expediere, livrare și anulare? Regula rămâne: un singur canal pentru fiecare anunț, niciodată două.
  - Implicit (recomandat), Edinio nu trimite emailul său de stare la tranzițiile venite din easySales, ca azi la cronurile de curier [C: `src/app/api/cron/sameday-tracking/route.ts:41-46`, „NU TRIMITE NIMIC CLIENTULUI”; la fel celelalte cronuri de urmărire]. Comerciantul pornește notificările easySales pentru canalul Edinio (ES-10). Varianta „Edinio trimite” e un comportament nou, cu buget pe magazin și pe comandă.
  - Azi, la cronurile de curier, cumpărătorul poate primi totuși ceva pe alte două căi [C]:
    - factura pe email: 17 din cele 19 cronuri `*-tracking` cheamă `maybeAutoInvoice` (de exemplu `src/app/api/cron/sameday-tracking/route.ts:366`), iar SmartBill (`trySendDocEmail`, `src/lib/actions/smartbill.actions.ts:1391`) și Oblio (`sendEmail: 1`, `src/lib/actions/oblio.actions.ts:551`) o trimit cumpărătorului când `send_email` e pornit;
    - coada de email marketing: declanșatorul `email_marketing_la_schimbare` (AFTER UPDATE OF status, payment_status pe `orders`, baseline 13902) pune în coadă, pentru Mailchimp, Brevo sau Klaviyo, expedierea, livrarea, anularea și rambursarea (baseline 7339-7344). De acolo, fluxurile comerciantului pot scrie cumpărătorului.
  - Pe comenzile procesate în easySales, factura Edinio nu mai pleacă, fiindcă `maybeAutoInvoice` va ieși pe ștampilă (§5.1.1, §7.3). Coada de email marketing rămâne însă deschisă. Ea ocolește numai comenzile cu `marketplace` nevid (baseline 7324-7331), iar ștampila scrie cheia `easysales`. De hotărât și: o lăsăm, iar comerciantul alege un singur canal (fluxurile ESP sau notificările easySales), sau o oprim pe comenzile ștampilate?
- **D6. Comenzile din celelalte canale (E4)** în Edinio: cu date personale minime (recomandat: nume, oraș, județ și sumele) sau complete?
- **D7. Același canal pe două drumuri:** refuz la configurare (recomandat) sau doar avertisment?
- **D8. Produsele fără SKU:** SKU generat numai în tabela de legătură (recomandat) sau îi cerem comerciantului să-l completeze?
- **D9. Produsele cu stoc neurmărit:** excluse (recomandat) sau trimise cu un stoc fix (ca la Trendyol, 100)?
- **D10. Descrierea lipsă** (1.111 produse active): le blocăm sau folosim numele ca descriere, cu bifă?
- **D11. Pachetele (22) și produsele personalizate** se exclud din catalog.
  - Personalizate: 79 de produse au `customization.enabled = true`, dar numai 68 sunt active. Dintre cele active, numai 30 au și câmpuri definite (`customization.fields` nevid); cele 11 inactive n-au niciun câmp [C: producție, `products.page_sections->'customization'`]. Excluderea privește deci 68 de produse, sau 30 dacă se numără doar cele cu câmpuri, nu 79. Pe care le excludem: toate cele 68 active, numai cele 30 cu câmpuri sau numai cele cu preț dependent de alegeri (rândul lor din §5.4.1)?
  - În comenzi, linia pachetului pleacă cu SKU-ul lui (dacă M-COM-9 o acceptă) sau comenzile cu pachete rămân la Edinio?
  - Comenzile cu fișiere de personalizare: D31.
- **D12. Planurile Edinio.**
  - Pe ce planuri e disponibilă integrarea? Azi hubul nu leagă integrările de plan. `isUnlocked` e o constantă locală în `src/app/(dashboard)/dashboard/features/page.tsx:539`: un lanț de comparații pe id, scris de mână, plus patru steaguri de disponibilitate (`gmcAvailable`, `aboutyouAvailable`, `trendyolAvailable`, `emagAvailable`, :282-292). Ea pune numai lacătul pe card, iar un id lipsă înseamnă lacăt [C: antetul `src/lib/dashboard/hub-integrari-fara-lacat.test.ts:13-19`]. Restrângerea pe plan trebuie deci construită sau găsită în alt mecanism; trecerea lui `easysales` în lanț nu o face.
  - Ce se întâmplă când abonamentul Edinio expiră: perioadă de grație, apoi stoc 0 și pauză (recomandat)?
- **D13. Catalogul public:** ce text (propuneri: „Trimite catalogul și comenzile magazinului în easySales, iar vânzările de pe marketplace-uri scad stocul din magazin.” sau „Catalogul tău merge în easySales, iar stocul vândut pe marketplace-uri se întoarce în magazin.”) și din ce moment: „în curând” de acum sau direct activ după pilot?
- **D14. Programul de parteneri easySales:** aplicăm (pagina „Edinio” la ei, comision, poate o conectare de platformă)? La Gomag, platformă din pagina Parteneri easySales, comerciantul lipește doar tokenul website-ului într-o aplicație easySales din admin-ul Gomag (centrul de ajutor). Dacă în spate stă un client OAuth al Gomag nu e documentat (ES-1).
- **D15. Documentele juridice:** trecem easySales ca destinatar opțional, ales de comerciant (găzduit în UE: IPOTEZĂ de confirmat, ES-27)? DPA-ul și ștergerea datelor: D33.
- **D16. Contul de probă:** cine îl creează (email, firmă) și când pornim fereastra de 14 zile? Proba are limite proprii, mult sub planul Pro: 50 de etichete (AWB), 50 de facturi, 50 de transmiteri și 10 listări pe canal, după textele aplicației (IPOTEZĂ de confirmat, ES-29). Ele pot bloca E0, de exemplu la încărcarea catalogului. Termenii cer, în general, cardul bancar în cont pentru folosirea Serviciilor plătite și nu pomenesc proba. Site-ul spune doar că proba de 14 zile nu cere card. Ce se întâmplă la capătul probei nu e documentat. Că atunci continuarea cere card e doar o deducție din termeni (IPOTEZĂ de confirmat, ES-14). Cerem întâi un cont fără aceste limite (ES-29)?
- **D17. Comenzile cu livrare la punct de ridicare** rămân la Edinio până aflăm câmpul potrivit (recomandat; ES-9, ES-23)? Ridicarea personală și curierul propriu: D27.
- **D18. Anularea din contul cumpărătorului** pe comenzile procesate în easySales: refuz și notificarea comerciantului (recomandat) sau o anulare încercată la easySales?
- **D19. Returul venit din easySales** (starea 6, livrarea 5): doar notificare (recomandat) sau `refunded`? Cererile de retragere făcute în Edinio pe aceste comenzi: D28.
- **D20. Deconectarea și pauza buclei** pun întâi stocul pe 0 (bifă implicită): de acord?
- **D21. Ștergerea unui produs din Edinio** îl arhivează în easySales (implicit da)? Un produs arhivat se poate restaura din interfață [A], apoi se șterge definitiv. Articolul de suport din 2024 dă 30 de zile și cel mult 50 de produse dezarhivate deodată; ghidul din 29.09.2026 dă o lună și nu pomenește vreo limită (IPOTEZĂ de confirmat, ES-25). Limita de 50 din colecție e alta: a arhivării în bloc [A]. Dacă așa e, arhivarea devine definitivă după o lună.
- **D22. Pragurile siguranței de masă:** stoc (30% sau 200 de SKU) și preț (30% sau 200 de articole, cu variație de peste 20%)?
- **D23. Categoriile:** numele cu calea și doar frunza pe produs (recomandat) sau și strămoșii? Și, dacă M-PROD-5 arată că un produs fără categorie e refuzat (ES-4): produsele fără categorie primesc o categorie de rezervă creată de noi (de exemplu „Fără categorie”) sau se blochează cu motiv?
- **D24. Comenzile cu plată online** pleacă după plată (recomandat)?
- **D25. Comenzile dinaintea activării** pleacă numai prin acțiunea explicită (recomandat)?
- **D26. Rambursul încasat în easySales:** îl reflectăm în Edinio (`payment_status`) după M-COM-8, cu un parametru nou în `tranzitieComandaMarketplace` (o cale care merge azi), în E5, sau rămâne marcat de mână?
- **D27. Ridicarea personală și curierul propriu.** Comenzile cu ridicare personală sau cu curierul propriu al magazinului rămân în Edinio (recomandat, ca punctele de ridicare de la D17, până la ES-23)?
  - Ștampila din §5.1.1 exclude doar livrarea la punct (`delivery_type = locker`). Ridicarea personală are însă `courier = 'pickup'` cu `delivery_type = 'address'`, iar `address` e adresa cumpărătorului, nu a magazinului. Curierul propriu are `courier = 'own'` [C: `shipping_address->>'courier'` și `->>'delivery_type'`, baseline 3671-3674; `src/lib/cont/livrare.ts:4-8`, `:76-78`; `src/lib/actions/shipping.actions.ts:136`, `:345-346`, `:1339-1343`]. Comentariul din cod numără 12 ridicări personale pe producție.
  - Fără excludere, o automatizare easySales sau operatorul ar genera AWB spre casa unui cumpărător care vine la magazin.
- **D28. Retragerea din contract (OUG 18/2026) pe comenzile procesate în easySales.** Cererile primesc doar notificare, sau și repunere în stoc și legătură cu stornarea (recomandat)?
  - Edinio are funcția obligatorie de retragere: tabela `return_requests`, cererea publică, stările nou, aprobat, respins și rambursat, plus confirmarea pe suport durabil [C: `src/lib/actions/return.actions.ts:3`, `:22`, `:126`, `:180`, `:330`; pagina `/dashboard/returns`].
  - Pe o comandă procesată în easySales, cererea ajunge numai în Edinio. Stornarea se face în easySales, iar rambursarea cardului, prin procesatorul Edinio. Repunerea în stoc n-o face nimeni: schimbarea stării cererii nu atinge stocul [C: `updateReturnStatus`, `return.actions.ts:330`], iar returul venit din easySales dă doar notificare (D19).
  - Propunerea: notificarea „retur pe o comandă procesată în easySales”, cu legătura spre comanda lor; repunerea în stoc la retur aprobat, în Edinio, care e sursa stocului; legătura dintre cerere și stornare prin `order_return_id` din `storno-invoice-created` [A: câmpul există în payload-ul exemplu, cu `null`; sensul lui nu e documentat].
- **D29. Moneda magazinului.** Refuzăm conectarea unui magazin care nu e în RON (recomandat)?
  - Moneda stă în `store_settings.currency`, citită deja la Pepita [C: `src/lib/actions/pepita.actions.ts:1055-1057`]. `orders` nu are coloană de monedă [C: `src/types/database.types.ts`], deci ștampila trebuie să citească setarea.
  - Website-ul se creează în RON (§3.7), iar planul filtrează moneda numai la ștampilă. Catalogul unui magazin în EUR ar pleca deci într-un website în RON. `GET /websites/list` nu întoarce moneda website-ului [A].
  - Propunerea: refuz la conectare dacă magazinul nu e în RON și pauză automată pe catalog și stoc dacă moneda magazinului se schimbă după conectare.
- **D30. Combinațiile.** O combinație ștearsă sau dezactivată se arhivează la easySales sau rămâne cu stoc 0? §5.4.7 tratează numai produsul întreg: inactivarea dă stoc 0, ștergerea dă stoc 0 și arhivare (D21). Aceeași hotărâre trebuie la trecerile de formă: un produs simplu care primește variante lasă la easySales rândul simplu cu stocul vechi, iar trecerea inversă nu e tratată deloc.
- **D31. Comenzile cu fișiere de personalizare** pleacă în easySales? Comanda pleacă numai cu un rezumat în `observations` (§5.1.3), deci operatorul din easySales n-are fișierele de producție. Fișierele de pe comandă se șterg la 6 luni de la ultima atingere a comenzii [C: `src/app/api/cron/curata-fisiere/reguli.ts:17`, `:76`]. Variantele: linkuri semnate în observații sau comenzile cu fișiere rămân în Edinio, ca pachetele de la D11.
- **D32. Vânzările de pe alte website-uri ale contului**, cu același SKU, consumă stocul Edinio? Un pilot care vinde deja prin easySales poate avea ofertele legate de produsele altui website (WooCommerce, Gomag) și stoc comun pe SKU. Planul cere un website nou și gol (§3.7), dar nu spune cum se mută ofertele (ES-24). Regula „doi martori” (§5.6) respinge vânzările de pe website-ul vechi cu aceleași SKU-uri, deci stocul comun din Edinio nu scade.
- **D33. Datele personale (GDPR).** easySales devine un procesator nou al datelor cumpărătorilor, iar D15 acoperă numai documentele juridice. Încheiem un DPA cu easySales (ES-27)? Ștergerea la cerere se face manual sau prin `PATCH /customers/{id}`? API-ul nu are DELETE pe clienți sau pe comenzi [A: colecția are DELETE numai pe categorii, caracteristici, metadate, AWB, facturi, webhook-uri și etichete]. Datele se pot doar suprascrie: `PATCH /customers/{id}` [A], cu scope-ul `update-customers` (după nume), pe care §4.3 nu-l cere, plus rutele `PUT` ale adreselor de livrare și de facturare și ale comenzii [A]. Ce date minimizăm la trimitere?

### 11.b Pentru easySales (api.support@easysales.ro) și pentru comerciantul pilot
**easySales**
- **ES-1. Tokenul pe client și parteneriatul.**
  - „Un token per client” se aplică pe client, pe (client, utilizator) sau pe (client, website)?
  - Există un client OAuth de partener pentru platforme? La Gomag, sursele publice nu arată unul. Gomag are în admin o aplicație easySales (Apps → Canale de Vânzări → easySales), în care comerciantul lipește doar tokenul unui website de platformă „Gomag”, nu „API V2”, fără client_id și fără client_secret. Sursele: articolul de suport easySales „Configurare Gomag”, ghidul „Cum conectezi Gomag cu easySales”, articolul Gomag „EasySales” și pagina Parteneri. Folosește aplicația aceea API V2, cu un client OAuth propriu al Gomag? Ce ar primi Edinio ca partener (D14)?
  - „Assign partner”: documentația se contrazice. Cererea definită are `POST /api/v2/account/sub-account/login`, același URL ca „Sub-Account Authentication”, corpul `{client_id, client_secret, username, password, scope}` și descrierea „Assign a partner to current user.” [A]. Numai exemplul salvat „Assign partner → Success” (răspuns din 10.10.2022) are `POST /api/v2/account/partners`, cu `Bearer {{access_token}}`, corpul `{"code": "<un UUID>"}` și răspunsul 200 „The partner has been assigned successfully” [A]. Calea apare o singură dată în toată colecția. Care e ruta reală? De unde vine `code`, ce format are, e obligatoriu, ce înseamnă „partener” și ce efect are pe cont? Textele aplicației au eticheta „Have a discount/partner code?” (cheia `have_discount`), lângă cele ale formularului de înregistrare (`confirm_password`, `have_account`). E același cod? Eticheta e doar un indiciu, nu vine din API: câmpul nu a fost văzut în formular. Până la răspuns, ruta nu se folosește.
- **ES-2.** Grantul website acceptă toate scope-urile, inclusiv `manage-webhooks`? Ce erori dă pentru client, secret sau `website_token` greșite? Refresh-ul rotește sau revocă tokenul?
  - Există un endpoint de revocare? Colecția nu documentează niciunul; singura revocare documentată e cea implicită, la emiterea unui token nou [A]. Eticheta „Revoke”, lângă „Authorized Applications”, apare numai în traducerile interfeței. Ce revocă ea și ce face ștergerea clientului?
  - Tokenul emis prin grantul website poartă revendicarea `scopes`, cu scope-urile acordate, și e stabilă? Singurul JWT complet din colecție e variabila `access_token`, cu grant nedeclarat (poate un PAT): payload-ul are `scopes` și `"sub": "1"`, dar nicio revendicare de grant [A]. Toate cele patru exemple de răspuns cu token taie tokenul după antet, nu doar cele ale grantului website: Authorization Code și Refresh (ale căror exemple poartă tot eticheta „Website Grant”), Website Grant și Password Grant [A]. Până la răspuns, lipsa revendicării înseamnă „necunoscut”, nu „fără drepturi”.
- **ES-3.** `product_website_id`, `parent_id`, `category_website_id`, `characteristic_website_id` și `order_id` acceptă șiruri? Tabelele de comenzi declară `order_id` și `product_website_id` ca Numeric, dar exemplele trimit șiruri [A]. Add Order trimite `order_id` „order-TEST-RO-004” și, pe linie, `product_website_id` „91”, un șir de cifre. Update Order trimite `order_id` „order-s4fssdffffddssdssdssf” și `product_website_id` „DZ-CI113” [A]. Amândouă au un exemplu „Success”, dar el nu e perechea cererii: vine dintr-o cerere cu `order_id` 1134585 și `product_website_id` 28, numerice [A]. Ce lungime maximă au? Unicitatea e pe website sau pe cont?
- **ES-4.** Save la produse și la comenzi: care e cheia de potrivire și ce câmpuri suprascrie? Ce face peste o comandă cu AWB sau factură? Listele lipsă (imagini, categorii) șterg ce exista? Un produs fără categorie e acceptat? Dosarul Categories cere o categorie pe fiecare produs, iar tabelul Save o dă opțională [A].
- **ES-5.** Save bulk: ce limită are, e atomic, cum aflăm erorile pe element și se numără ca o singură cerere la limita de rată?
- **ES-6.** Variantele: se trimite și părintele? Cum se marchează axa? Ce id primesc `categories[]` și `characteristics[].id` pe produs nu mai e o întrebare: id-urile noastre, `category_website_id` și `characteristic_website_id` [A: tabelele Add, Save și Update product].
- **ES-7.** Ce cote de TVA sunt valide pentru un website RO (0, 11, 19, 21)? Cum stocați și cum rotunjiți prețurile? Documentația spune doar că `price_with_tax` („The price with VAT”) și `total_with_tax` (valoarea liniei cu TVA) sunt „[Read-only]” și „rounded with 2 decimals” [A: Add Order]. Deci le calculează easySales; noi nu le trimitem. Apar numai în tabelul Add Order; pe linia de produs de la Save, Update și Update General Data nu sunt listate [A]. Că `price_with_tax` e pe bucată e doar o deducție. Rotunjiți pe bucată și apoi înmulțiți cu cantitatea, sau pe linie? Care dintre valori intră în factura emisă de voi?
- **ES-8.** Cu „Sursă stoc = Website”: `stock` e totalul sau disponibilul? `reserved_stock` include comenzile website-ului nostru? Ce se întâmplă cu stocul la o comandă de pe alt canal? `product-stock-updated` se trimite pentru un website API V2? Ghidul magazinului personalizat spune că stocul nu se întoarce: circulă numai din magazin în easySales. Despre drumul înapoi, ghidul spune că ce vine ține de comenzi (schimbări de status, AWB-uri și facturi) și recomandă cinci evenimente: `order-created`, `order-updated`, `awb-created`, `invoice-created` și `delivery-status-updated`. E o recomandare, nu o restricție: colecția listează în plus `product-stock-updated`, `stock-refresh-requested` și altele [A]. Ce face `/stocks/bulk` când sursa e „easySales”? (Completată de ES-22.)
- **ES-9. Comenzile.**
  - Datele: emailul și telefonul sunt obligatorii? Referința le cere [A], iar ghidul de erori din 29.09.2026 spune că nu sunt (IPOTEZĂ de confirmat, M-COM-4). Aceeași întrebare pentru `shipping_address.phone` și `billing_address.phone`. Județul trebuie trimis ca cod, și cum se trimite Bucureștiul cu sectoare? În ce câmp se trimite punctul de ridicare (easybox, FANbox)? Ce face `invoice_series` gol?
  - Plata: ce valori și ce efect are `payment_status`? La scriere, exemplul Save trimite `1`; la citire, „Paid” apare numai în exemplul de listă, nu și în Get Order [A]. O comandă trimisă cu `payment_mode` 1 își primește factura ca încasată, sau trebuie marcată cu `POST /orders/{internal_id}/mark-as-paid/{internal_invoice_id}` [A]?
  - Rambursul: ce ramburs pune easySales pe AWB-ul unei comenzi cu `payment_mode` 1 când AWB-ul se generează fără `advanced_data`? La Generate AWB, `advanced_data` e opțional și „used to overwrite default order data”, iar `order_data.cashValue` are doar nota „Order value” (float; exemplul trimite șirul „120.00”). Același câmp există și la Generate Return AWB [A]. E suma încasată de curier sau valoarea declarată a coletului? Documentația nu spune (IPOTEZĂ de confirmat, M-COM-8). Până atunci nu ne bazăm pe valoarea implicită la comenzile plătite online.
  - Totalurile: `order_total` e definit „products values + shipment tax” [A]. Include și taxele (`fees`) și reducerile (`vouchers`)? Verificați suma liniilor față de el?
  - Plafonul: ce cod HTTP și ce corp întoarce `orders/save` la plafonul de comenzi, și e un refuz sincron? Ghidul de erori arată numai mesajul „Orders limit exceeded.” pe pagina Website errors (IPOTEZĂ de confirmat, M-COM-6).
- **ES-10.** Fluxurile automate (factură, AWB, SMS, email) pe comenzile venite prin API se pot opri sau limita pe website? Dacă nu, fluxurile se pot filtra după statusul custom sau după etichete? Documentația are `PATCH /orders/{internal_id}/custom-status` (cu scope-ul `update-orders`) și etichetele: `/tags/attach`, `/tags/detach` și filtrele `tags` și `has_tags` pe lista de comenzi [A]. Statusul custom inițial din formularul website-ului e ES-31.
- **ES-11. Webhook-urile.**
  - Vin pe cont sau pe website? `order-created` vine și pentru comenzile de marketplace? Scrierile noastre declanșează webhook-uri înapoi? Ce rol are `source`?
  - Ce intră exact în HMAC și cu ce opțiuni `json_encode`? Câmpul e `secret` sau `seccret`? Fără secret, livrările vin fără antet, cu antet calculat pe cheie goală sau deloc? `PUT /webhooks/{id}` păstrează secretul (corpul lui nu-l documentează [A])?
  - Ce payload trimite `POST /webhooks/{id}/trigger` și se poate deosebi de un eveniment real?
  - Livrările pleacă de pe IP-uri fixe? Ordinea e garantată și există re-livrare manuală? Ne putem abona la `delivery-status-updated`?
- **ES-12.** Cu un token website, lista de comenzi vede tot contul (vezi ES-26)? Ce valoare are câmpul `website` pe comenzile API? În ce fus orar sunt datele și filtrele? `updated_at` se schimbă la AWB, factură și livrare?
- **ES-13.** Ce corp au 401, 403, 404, 405, 429 și 5xx? Colecția nu are niciun exemplu pentru ele [A]. Ce primește o cerere făcută cu un token revocat de o emitere nouă? Ce texte exacte au refuzurile 403: scope lipsă și `website_token` invalid (amândouă dau 403 la „Archive product” [A]), website dezactivat și, dacă vine tot cu 403, plafonul de comenzi? Ce conțin `X-RateLimit-Reset` și `Retry-After`? Limita de 500 se aplică pe cont? `/oauth/token` are o limită proprie de 60 pe minut? Exemplele din martie-aprilie 2020, inclusiv toate cele de la `/oauth/token`, arată 60, iar cele de după 19.06.2020 arată 500 [A]; proba curl din dosarul B a văzut 60 la `/oauth/token`.
- **ES-14.** Ce face API-ul la abonament expirat, la sfârșitul probei și la cont suspendat, și cu ce cod?
- **ES-15.** Există un mediu de test sau un cont de integrator cu valabilitate mai lungă (ES-29)? Puteți înregistra pe contul de probă un marketplace de tip „Dynamic” care să cheme un server găzduit de noi, de exemplu mock-ul public `dynamic-marketplace-sandbox-api`?
  - Ce știm: documentația API nu pomenește niciun marketplace de probă, niciun sandbox și nicio legare a unui marketplace la un cont de probă. `GET /marketplaces/list` arată în exemplu numai 18 canale reale [A].
  - Numele „dynamic marketplace” vine numai din depozitul GitHub `easySales/dynamic-marketplace-sandbox-api`, din 2023, neatins din 17.05.2023. E un server Express local (portul 30001), cu date fixe, care imită API-ul pe care un marketplace de tip „Dynamic” (tipul 2 în aplicație, față de „Static”, 1) îl expune către easySales. Îi folosește celui care construiește un marketplace, nu unui website ca Edinio. Nu știm dacă se poate lega la un cont.
  - Până la răspuns, vânzările externe se probează cu o comandă manuală în easySales (§9.4).
- **ES-16.** `awb_tracking_page` și adresele facturilor sunt publice și permanente?
- **ES-17.** Acceptați WebP la imagini și îl convertiți pentru eMAG?
- **ES-18.** Cum se dezactivează un produs fără arhivare? (Arhivarea și purjarea ei: ES-25.)
- **ES-19.** Segmentul din `GET /offers/{segment}` (40 în colecție) pare id-ul marketplace-ului: variabilele colecției au `marketplace_id` = 40 și `offer_id` = 6, exact ca în `/offers/40/6/prices` [A]. E o IPOTEZĂ, nu o afirmație explicită. E id-ul global din `/marketplaces/list` (Emag = 1) sau id-ul conexiunii contului (ofertele au și un `marketplace_account_id` [A])? Cum îl aflăm pentru canalele comerciantului? Ce întoarce `GET /marketplaces/list`: catalogul global sau canalele contului (M-MKT-1)?
- **ES-20.** Cum apare în API o comandă onorată de marketplace (eMAG FBE) sau de un 3PL, unde marfa e deja la ei și nu trebuie să consume stocul Edinio? Documentația are filtrul `fulfillment_service_id` pe lista de comenzi și `GET /fulfillments/list` [A], cu scope-ul `read-fulfillment-services` (după nume, lipsește din lista cerută la §4.3), dar nu spune ce câmp poartă comanda. Canalele FBE (`EmagROFBE` 41, `EmagHUFBE` 55, `EmagBGFBE` 56) apar numai în codul aplicației easySales, nu în documentație. Integrarea nativă eMAG nu consumă stoc la FBE [C: `onoratDeEmag`, `src/lib/emag/orders.ts:675`, `:1245-1254`].
- **ES-21.** Când o comandă de pe alt canal se schimbă după ce am consumat-o (storno parțial, produs adăugat), API-ul arată pe linie cantitatea inițială și pe cea stornată, ca `initial_qty` și `storno_qty` la eMAG, sau numai liniile curente? Colecția nu are astfel de câmpuri [A]. Se mișcă `updated_at` la o astfel de schimbare? Edinio ajustează deja stocul în acest caz la eMAG și la Pepita, cu `ajusteaza_stoc_comanda_marketplace` [C: baseline 1220; `src/lib/emag/orders.ts:1484`; `src/lib/pepita/ingest.ts:1382`].
- **ES-22.** Cu „Sursă stoc produse: Website”, rezervările scad stocul trimis pe canale? Se aplică și comenzilor venite prin API de la website-ul nostru? Ghidul surselor de stoc spune că easySales „does not reserve stock back into that same store”: ce înseamnă exact? Ce face scăderea „la finalizare” sau „la facturare” (setarea din 10.2025, cu bifa „Scade stocul la emiterea unei facturi noi”) când sursa e Website, și ce se întâmplă când nu e aleasă nicio variantă? Răspunsul alege formula din D3 (M-STOC-1). (Completează ES-8.)
- **ES-23.** Ce valori și ce efect are `shipping_method`? Apare cu `null` în corpul exemplului Save Order și ca filtru al listei („filter by shipping methods”), fără valori documentate [A]. Cum marcăm ridicarea personală și curierul propriu al magazinului (D27)? Se poate transmite curierul ales de cumpărător, ca AWB-ul să nu plece cu alt curier, cu alt tarif decât cel încasat? Azi alegerea ajunge numai ca text în `delivery_notes` (§5.1.3).
- **ES-24.** Cum se mută ofertele de pe produsele altui website al contului pe produsele Edinio? Autolink leagă de produsele cărui website? După centrul de ajutor, Autolink potrivește după un identificator comun: SKU, EAN, nume, ID sau „Product Website ID”. Se pornește din Marketplace → Autolink; că pornirea e numai manuală doar se subînțelege. Limita de 100 de oferte asociate automat vine dintr-un articol de blog easySales (noutățile din august-noiembrie 2024), nu din centrul de ajutor, iar utilizatorul o poate elimina. Articolul cu noutățile din ianuarie-aprilie 2026 adaugă „Product Website ID” ca al patrulea identificator la Autolink prin Excel, lângă SKU, Product Name și EAN. Preferințele „Arhivează automat produsele înlocuite” și „Mută ofertele produsului vechi pe noul SKU” vin din ghidul „Produse blocate și duplicate” (Integrări → Magazine → Preferințe → Sincronizare); a doua cere activarea primei. Există aceste preferințe și la un website API V2? (D32)
- **ES-25.** Ce face un Save pe SKU-ul unui produs arhivat: îl restaurează, creează un produs nou sau dă 422 (M-PROD-6)? La restaurare, sursele dau cifre diferite. Articolul de suport „Arhivare produse” (actualizat la 28.08.2024): cel mult 50 de produse dezarhivate deodată și ștergere după 30 de zile. Ghidul „Cum arhivezi și restaurezi produse” (29.09.2026): restaurare timp de o lună, apoi ștergere definitivă; la dezarhivarea în masă nu pomenește vreo limită. Colecția spune doar că produsul „remains restorable from the Archived Products screen in the UI”, fără termen; limita ei de 50 e a arhivării în bloc (`PATCH /products/archive/bulk`), nu a restaurării [A]. Ce termen și ce limită de restaurare se aplică azi? Ce se întâmplă după purjare cu SKU-ul lui? (D21)
- **ES-26.** Un token website vede la citire numai comenzile website-ului său? Ghidul descrie PAT-ul ca „account-wide rather than shop-scoped”, deci tokenul website pare legat de un singur magazin (IPOTEZĂ de confirmat, M-EXT-1). Răspunsul hotărăște D3. (Completează ES-12.)
- **ES-27.** Ce DPA oferiți, unde stau datele (în UE?) și cum se șterg la cerere datele unui cumpărător, dacă API-ul nu are DELETE pe clienți sau pe comanda întreagă, ci numai suprascrieri (`PATCH /customers/{id}`, `PUT` pe adrese și pe comandă) [A]? (D15, D33)
- **ES-28.** Ce politică de versiuni are API V2 și cum anunțați schimbările? Colecția nu e înghețată: exemplul `storno-invoice-created` e din 28.09.2026 [A].
- **ES-29.** Ne puteți da un cont de integrator fără limitele probei? După textele aplicației, proba are 50 de etichete (AWB), 50 de facturi, 50 de transmiteri și 10 listări pe canal. Website-ul API V2 intră la „listări pe canal”? Ce înseamnă „transmiteri”? (Completează ES-15; D16.)
- **ES-30.** easySales redescarcă imaginile la fiecare Save, chiar dacă adresele nu s-au schimbat? Contează la încărcarea inițială și la actualizările unui catalog mare (§5.4.5).
- **ES-31.** „Status custom pentru comanda nouă” din formularul website-ului („Aduce fiecare comandă importată într-unul dintre statusurile tale”) se aplică și comenzilor venite prin API? Poate atinge regulile planului bazate pe stările New, Received și Incomplete (§5.1.5, §5.3).
- **ES-32.** `PATCH /products/prices/bulk` se propagă la ofertele cuplate la produs, cu adaosul și cu Autoprice peste el? Trece peste prețurile ofertelor decuplate? De răspuns depinde regula „nu atingem ofertele” (§3.3).

**Comerciantul pilot**
- Pe ce canale vinzi prin easySales și ce „Sursă stoc” folosești azi? Dacă stocul nu stă pe website, unde stă: în easySales, în SmartBill sau într-un ERP legat de easySales (D1, D3)?
- Vinzi prin eMAG FBE sau printr-un depozit 3PL (ES-20)?
- Ofertele tale sunt legate de produsele cărui website? Ai accepta să le legi de produsele Edinio abia la pornirea stocului?
- Ce curieri și ce program de facturare ai în easySales? Ai fluxuri automate pe comenzile noi? Accepți să stea oprite până la proba cap la cap (D1)?
- La tine stocul scade „la finalizare” sau „la facturare”, și e bifată „Scade stocul la emiterea unei facturi noi” (ES-22)?
- Câte comenzi ai pe lună și ce plan easySales (cu ce plafon de comenzi)?
- SKU-urile din Edinio sunt aceleași cu cele din easySales? Ai pornite „Arhivează automat produsele înlocuite” sau „Mută ofertele” (ES-24)?
- Folosești adaosuri sau Autoprice pe oferte, iar ofertele sunt cuplate la prețul produsului (ES-32)?
- Ce notificări către cumpărători ai pornite în easySales? Ai fluxuri Mailchimp, Brevo sau Klaviyo legate de Edinio care scriu cumpărătorului la expediere sau la livrare (D5)?
- Ai fi de acord cu un website „Edinio” nou și gol și cu un client API dedicat?
## 12. Anexă: endpointurile easySales folosite, cu scope-ul OAuth

Căile sunt relative la `https://easy-sales.com`, valoarea lui `{{url}}` în mediul publicat „Production” al documentației [A]. Anexa descrie colecția descărcată la 12.10.2026, cu 92 de cereri [A].

Scope-ul e marcat „[A]” numai acolo unde dosarul A îl leagă explicit de rută. „După nume” înseamnă potrivire cu lista de scope-uri, nedocumentată pe rută (IPOTEZĂ, M-AUTH-5). „Nedocumentat” singur înseamnă că nici ruta, nici lista nu indică un scope; urmat de „după nume”, dă candidații din listă.

- **Legăturile explicite sunt patru** [A]:
  - `PATCH /api/v2/products/:id/archive` și `PATCH /api/v2/products/archive/bulk`: „Required scope: `update-products`.”;
  - `PATCH /api/v2/orders/{internal_id}/custom-status`: „Requires the `update-orders` scope.”;
  - `GET /api/v2/custom-statuses`: „Requires the `read-orders` scope.”.

  În tabelul rutelor folosite, singurul [A] e deci arhivarea în bloc. Restul vine din potrivirea dintre eticheta scope-ului și numele cererii.
- **Proba (M-AUTH-5):** ruta se cheamă cu un token emis fără scope-ul presupus. Un 403 confirmă legătura. Forma e documentată la Archive product: 403 când „the token is missing the `update-products` scope” [A].
  - La `delivery-status`, tokenul de probă are `update-orders`, dar nu `update-delivery-status`, fiindcă `update-orders` e scope-ul cerut explicit la `/custom-status`.
  - La `/couriers` și `/billing-software`, tokenul de probă nu are `read-couriers`, respectiv `read-billing-software`.
- **Ce schimbă eticheta:** gradul de certitudine, nu comportamentul. §4.3 cere oricum toate scope-urile din prima. Asta ține numai dacă grantul website le acceptă pe toate (M-AUTH-5, ES-2).
- **Colecția se schimbă:** payload-ul de exemplu al `storno-invoice-created` poartă data 28.09.2026 [A]. La fiecare etapă, colecția se descarcă din nou și se compară cu amprenta sha256 din `docs/marketplace/EASYSALES.md` (§7.7). Politica lor de versiuni și felul în care anunță schimbările sunt întrebarea ES-28.

**Rutele folosite**

| Endpoint | La ce îl folosim | Etapa | Scope |
|---|---|---|---|
| `POST /oauth/token` (grant `website`) | emitere, reînnoire | E1 | nu se aplică |
| `GET /api/v2/account` | conectare, „Testează”, verificarea zilnică | E1 | nedocumentat (lista are numai `update-account`, niciun scope de citire a contului [A]) |
| `GET /api/v2/websites/list` | conectare, sănătate | E1 | `read-websites-list` (după nume) |
| `GET`, `POST /api/v2/webhooks[/{slug}]`, `PUT`, `DELETE /api/v2/webhooks/{id}`, `POST /api/v2/webhooks/{id}/trigger` | abonări, schimbarea adresei, deconectarea, probă | E1 | `manage-webhooks` (după nume) |
| `GET /api/v2/marketplaces/list` | precompletarea canalelor (dacă M-MKT-1) | E2 | `read-marketplaces-list` (după nume) |
| `POST /api/v2/orders/save` | trimiterea comenzii | E2 | nedocumentat; `add-orders`, `update-orders` (după nume) |
| `POST`, `PUT /api/v2/orders/{internal_id}/metadata` | metadatele Edinio | E2 | nedocumentat |
| `GET /api/v2/orders` | recuperarea după timeout (`order_display_id`), benzile din F2 și E4 (`modified_after`), deriva (`product_sku`), comenzile onorate de un depozit de fulfilment (`fulfillment_service_id`) | E2, E4 | `read-orders` (după nume) |
| `GET /api/v2/orders/{internal_id}` | recitirea comenzii; liniile cu `product_data` și `offer`, pentru vânzările externe | E2, E4 | `read-orders` (după nume) |
| `PATCH /api/v2/orders/{internal_id}/cancel` | „Anulează în easySales”, „Preia în Edinio” | E2 | `update-orders` (după nume) |
| `GET /api/v2/couriers`, `GET /api/v2/billing-software` | informativ, în panou | E2 | `read-couriers`, `read-billing-software` (după nume) |
| `GET /api/v2/general-data/countries/175/counties` | fixture-ul de județe al probei | E2 | nedocumentat |
| `POST /api/v2/categories/save[/bulk]`, `GET /api/v2/categories` | categoriile | E3 | nedocumentat; `add-`, `update-`, `read-categories` (după nume) |
| `POST /api/v2/characteristics/save[/bulk]`, `GET /api/v2/characteristics` | caracteristicile | E3 | nedocumentat; `add-`, `update-`, `read-characteristics` (după nume) |
| `POST /api/v2/products/save[/bulk]`, `GET /api/v2/products` | poarta „website gol” la conectare (§4.2), produsele, verificarea, deriva | E1, E3, E4 | nedocumentat; `add-`, `update-`, `read-products` (după nume) |
| `PATCH /api/v2/products/prices/bulk` | prețurile | E3 | nedocumentat; `update-products` (după nume) |
| `PATCH /api/v2/products/archive/bulk` | arhivarea la ștergere | E3 | `update-products` [A] |
| `PATCH /api/v2/stocks/bulk` | stocul | E4 | nedocumentat; `update-stock` (după nume) |
| `GET /api/v2/fulfillments/list` | id-urile pentru filtrul `fulfillment_service_id`: comenzile onorate de un depozit de fulfilment (3PL) nu consumă stocul Edinio | E4 | `read-fulfillment-services` (după nume); lipsește din lista din §4.3 |
| `POST /api/v2/orders/{internal_id}/awb`, `/awb/attach`, `DELETE /api/v2/orders/{internal_id}/awb` | modul hibrid | E5 | nedocumentat |
| `PATCH /api/v2/orders/{internal_id}/delivery-status` | modul hibrid, numai pe AWB încărcat manual [A] | E5 | `update-delivery-status` (după nume) |
| `PATCH /api/v2/orders/{internal_id}/complete` | modul hibrid | E5 | `update-orders` (după nume) |
| `POST /api/v2/orders/{internal_id}/invoice`, `/invoice/attach`, `/invoice/storno` | modul hibrid | E5 | nedocumentat |
| `GET /api/v2/offers/{segment}` (în colecție, literal `/offers/40`), cu filtrele `linked`, `product_id`, `product_sku` [A] | vizualizarea ofertelor; din E3, ofertele legate prea devreme de produsele Edinio și raportul „nelegate” | E5; din E3 după ES-19 | `read-offers` (după nume) |
| `POST /api/v2/returns` | retururile, numai după probe dedicate | E5 | `add-order-returns` (după nume) |

**Note la rutele folosite**
- **`read-couriers`, `read-billing-software`, `update-delivery-status`.** Toate trei există în lista Available Scopes, cu etichetele „List Couriers Accounts”, „List Billing Software Accounts” și „Update Delivery Status” [A]. Fiecare apare o singură dată în colecție, numai în această listă. Rutele există și ele [A: dosarele AWB și Invoices], dar nu pomenesc niciun scope. Că `delivery-status` cere `update-delivery-status`, și nu `update-orders`, e o deducție după nume (IPOTEZĂ, M-AUTH-5).
- **Citirea comenzilor în E4.**
  - Ce vede tokenul website (comenzile altor canale, ale altor website-uri, cele manuale) e nedocumentat: IPOTEZĂ (M-EXT-1, ES-12, ES-26). După ghid, PAT-ul e „account-wide rather than shop-scoped”, deci un rezultat negativ e cel puțin la fel de probabil.
  - Rezerva e un Personal Access Token, numai pentru citirea comenzilor (D3, de hotărât în E0, înainte de E1). Dosarul „Personal Access Tokens” nu are nicio cerere și nu spune ce scope-uri poartă un PAT [A].
  - `product_data` și `offer` apar numai în exemplul Get Order, nu în listă și nici în webhook-uri [A]. Fiecare vânzare externă cere deci un GET pe comandă.
  - Filtrul `fulfillment_service_id` e documentat, cu id-urile din `GET /fulfillments/list` [A]. Exemplul listei are 7 servicii (Altexpress, Simplify, Packman, Fulfillment by FHB Group, Huboxx, Fulfill.ro, HelpShip) [A]. Dacă lista e catalogul global sau serviciile contului nu se spune. Obiectul comenzii nu are niciun câmp de fulfilment în exemple [A].
  - Numele de canal `EmagROFBE` (41), `EmagHUFBE` (55) și `EmagBGFBE` (56) nu apar nici în colecție, inclusiv în exemplul `/marketplaces/list` [A], nici în centrul de ajutor. Apar numai în codul aplicației easySales, în lista ei internă de marketplace-uri. Că o comandă FBE vine prin API pe unul dintre aceste canale e IPOTEZĂ (ES-20).
  - FBE e documentat în centrul de ajutor („Conectare eMAG Fulfilment”), dar ca serviciu de fulfilment, nu ca un canal. Se conectează din Integrări → Fulfillment, iar comenzile se trimit către el manual sau printr-un flux. O comandă FBE s-ar putea recunoaște deci și după `fulfillment_service_id`, deși FBE nu e printre cele 7 servicii din exemplul listei (IPOTEZĂ, ES-20).
  - Centrul de ajutor („Configurare Marketplace Amazon”) spune că, atunci când metoda de fulfillment a marketplace-ului Amazon e FBA, easySales nu generează AWB sau factură și nu scade stocul. FBA e o setare a conexiunii Amazon, nu o sursă de stoc. Regula e scrisă numai pentru Amazon FBA, nu și pentru FBE.
  - Cum apare în API o comandă onorată de marketplace sau de un 3PL e întrebarea ES-20.
  - Cum se văd liniile unei comenzi modificate după consum (storno parțial, produs adăugat) e întrebarea ES-21.
- **`GET /api/v2/marketplaces/list`.**
  - Răspunsul e `{data: [{id, name}]}`, fără paginare și fără parametri [A]. Dacă e catalogul global sau canalele contului se măsoară în M-MKT-1 (ES-19).
  - Lista din exemplu e incompletă: o linie din Get Order are `offer.marketplace_id` 26 („PepitaHU”), absent din listă [A].
  - Exemplul are 18 canale reale și niciun marketplace de probă. Cuvintele „sandbox”, „staging” și „dynamic” nu apar în colecție [A].
  - Numele „dynamic marketplace” vine numai din depozitul public easySales/dynamic-marketplace-sandbox-api (GitHub, creat în 2023, neatins din 17.05.2023). E un server Express local, cu date fixe, care imită API-ul pe care un marketplace de tip „Dynamic” îl expune către easySales. Îi folosește celui care construiește un marketplace, nu unui website ca Edinio. Nu e confirmat că se poate lega la vreun cont.
  - Dacă easySales poate înregistra pe contul de probă un marketplace de tip Dynamic care să cheme un server al nostru e ES-15. Un cont de integrator fără limitele probei e ES-29. Până la răspuns, vânzările externe se probează cu o comandă manuală în easySales.
- **`PATCH /api/v2/products/prices/bulk`.** Dacă prețul trimis se propagă la ofertele cuplate de produs și dacă trece peste prețurile decuplate nu e documentat (ES-32). Dacă se propagă, „nu atingem ofertele” (§3.3) nu mai ține pentru ofertele cuplate, iar adaosul și Autoprice se aplică peste prețul nostru (IPOTEZĂ).
- **`PATCH /api/v2/products/archive/bulk`.**
  - Arhivarea dezactivează și dezleagă ofertele pe toate canalele [A]. Restaurarea nu are rută: documentația spune doar că produsele arhivate „stay restorable from the UI” [A].
  - În interfață, restaurarea se face cu Dezarhivează sau Dezarhivare în masă. Termenul și plafonul ei vin din surse publice care nu se potrivesc între ele (IPOTEZĂ, ES-25):
    - ghidul „Cum arhivezi și restaurezi produse” (29.09.2026) dă termenul de o lună, apoi produsul arhivat se șterge definitiv; nu pomenește un plafon, iar „Selectează tot” ia toate produsele arhivate ale magazinului;
    - articolul mai vechi din centrul de ajutor („Arhivare produse”, 08.2024) spune 30 de zile și cel mult 50 de produse la o dezarhivare în masă.
  - Plafonul de 50 din colecție e al arhivării în bloc, nu al restaurării [A: Archive products bulk].
  - Ce face un Save pe un SKU arhivat (restaurare, produs nou sau 422) nu e documentat (M-PROD-6, ES-25). De aceea, un SKU arhivat nu se mai trimite automat pe nicio rută de scriere (§5.4.7).
  - O combinație ștearsă se arhivează sau rămâne cu stoc 0: D30.
- **`POST /api/v2/returns`.** Singurul exemplu întoarce `data: []`, fără id [A]. Colecția nu are nici rută de citire a retururilor, nici webhook de retur. Id-ul returului apare doar ca `order_return_id` în `storno-invoice-created` [A]. Efectul unei reluări e nedocumentat (IPOTEZĂ, de măsurat în probele E5 cu două Save Return identice). Legătura dintre `order_return_id` și cererile de retragere din Edinio ține de D28.
- **Rutele multipart din modul hibrid.** Încărcarea AWB (`/awb`), încărcarea facturii (`/invoice`) și stornarea (`/invoice/storno`) sunt `multipart/form-data` [A]. Colecția nu arată `website_token` pe ele, deci clientul nu îl pune acolo. Dacă trebuie trimis ca un câmp de formular e IPOTEZĂ, de probat în E5. `/awb/attach` și `/invoice/attach` primesc JSON [A].
- **Ruta ofertelor.**
  - Colecția scrie segmentul literal: `GET /api/v2/offers/40` [A]. Pe `/offers/40` sunt trei cereri, un GET și două PATCH de prețuri, iar dosarul Offers mai are `POST /offers/export` [A]. Variabila `marketplace_id` are valoarea 40 și e activă, dar niciun URL n-o folosește [A]. `{segment}` e notația noastră, o deducție: documentația nu descrie segmentul ca parametru, iar paginarea din exemple trimite la `/offers/1` și `/offers/2` [A].
  - Segmentul e, cel mai probabil, id-ul marketplace-ului (IPOTEZĂ). Același 40 apare la `/general-data/marketplace-cancellation-reasons/40` („Marketplace specific”), dar lipsește din `/marketplaces/list`, unde eMAG are id 1 [A]. Ofertele au și un `marketplace_account_id` propriu (58 în exemplu) [A].
  - ES-19 se îngustează: segmentul e id-ul global din `/marketplaces/list` sau id-ul conexiunii contului? Cum îl aflăm pentru canalele comerciantului?

**Rute încă nefolosite, cu rolul propus**

| Endpoint | Rolul propus | Etapa și condiția | Scope |
|---|---|---|---|
| `GET /api/v2/delivery-statuses` | probă de contract la conectare: enumul 1-7 din `stari.ts` se compară cu lista lor [A] | E2 | nedocumentat |
| `GET /api/v2/custom-statuses`, `PATCH /api/v2/orders/{internal_id}/custom-status` | un status personalizat pe comenzile noastre, de care să țină cont fluxurile lor automate | E2, numai dacă ES-10 iese negativ | `read-orders`, respectiv `update-orders` [A] |
| `GET`, `POST /api/v2/tags`, `POST /api/v2/tags/attach`, `/tags/detach` | aceeași rezervă, prin etichete („Edinio”, „plătită online”); lista de comenzi are filtrele `tags` și `has_tags` [A] | E2, numai dacă ES-10 iese negativ | `read-tags`, `add-tags`, `attach-tags`, `detach-tags` (după nume); lipsesc din §4.3 |
| `POST /api/v2/orders/{internal_id}/mark-as-paid/{internal_invoice_id}` | factura easySales a unei comenzi plătite cu cardul, marcată încasată; azi rămâne neîncasată la ei | E2, după M-INV-1 | nedocumentat |
| `PUT /api/v2/orders/{internal_id}/general-data` | notele adăugate după trimitere (azi nu se propagă, §5.3) | E2, după ce o probă arată ce suprascrie | nedocumentat; `update-orders` (după nume) |
| `PUT /api/v2/categories/{id}`, `PUT /api/v2/characteristics/{id}` | redenumirea pe id-ul intern easySales, singura documentată; cere păstrarea `data.id` | E3, dacă M-CAT-1 arată că Save nu redenumește | nedocumentat; `update-categories`, `update-characteristics` (după nume) |
| `DELETE /api/v2/categories/{id}`, `DELETE /api/v2/characteristics/{id}` | curățenia categoriilor și caracteristicilor rămase fără produse | E3, dacă se hotărăște (§5.4.3) | nedocumentat; lista n-are scope de ștergere pentru categorii sau caracteristici, ci numai `delete-tags` [A] |
| `PATCH /api/v2/customers/{id}` | ștergerea GDPR: rescrierea datelor clientului | după D33 | `update-customers` (după nume); lipsește din §4.3 |
| `GET /api/v2/general-data/currencies` | cursul comenzilor E4 în HUF, EUR sau BGN, dacă se raportează în RON | E4, dacă se hotărăște | nedocumentat |

**Note la rezerve**
- **Statusul personalizat și etichetele.** Că fluxurile automate easySales se pot condiționa de un status personalizat sau de o etichetă nu e documentat (ES-10). Dacă „Status custom pentru comanda nouă” din formularul website-ului se aplică și comenzilor venite prin API e întrebarea ES-31. La `custom-status`, cheia `custom_status_id` trebuie să fie mereu prezentă; lipsa ei sau un id al altui cont dau 422 [A]. La etichete, ce id primește `entity_id` (cu `entity_type: "order"`) nu e documentat (IPOTEZĂ).
- **`mark-as-paid`.** Corpul e `{details: {paid_value, paid_at, currency}}`, iar plata poate fi totală sau parțială [A]. Id-ul intern al facturii pare să fie `invoice.id` din `invoice-created`: în exemple, același 245623 e și `corrected_invoice.id` în `storno-invoice-created` [A]. Legătura e IPOTEZĂ, de măsurat odată cu M-INV-1. Răspunsul are starea `partially_paid` și lista `details.paid[]` [A], deci o reluare poate înregistra a doua plată (IPOTEZĂ).
- **`general-data`.** Corpul din colecție are doar `order.invoice_series`, `notes` și `package`. Tabelul descrie însă comanda întreagă, iar răspunsul e copiat de la Add Order [A]. Ce suprascrie e IPOTEZĂ.
- **Redenumirea categoriilor.** Corpul e `{website_token, category: {name}}`, pe id-ul intern [A]. Save spune doar „created or updated”, fără cheia de potrivire, iar `category_website_id` nu e marcat unic la categorii [A]. De aici rezerva (M-CAT-1).
- **Ștergerea categoriilor și caracteristicilor.** O categorie atașată dă 422 „Cannot delete attached categories!”, iar o caracteristică atașată, „Cannot delete attached characteristics!” [A]. Corpul DELETE din colecție are `{"website_token"}` [A]. Ce scope cer rutele nu se știe. Lista are un singur scope de ștergere, `delete-tags`; la categorii și caracteristici are numai `read-`, `add-` și `update-` [A].
- **GDPR.** API-ul nu are DELETE pe clienți sau pe comenzi [A], iar `customer.id` vine în Get Order [A]. `PUT /shipping-address/{id}` și `PUT /billing-address/{id}` cer un id de adresă pe care nicio citire documentată nu îl arată; îl întorc doar răspunsurile lor [A]. Dacă rescrierea clientului ajunge și la datele copiate pe comenzi e IPOTEZĂ. DPA-ul, locația datelor și ștergerea la cerere sunt întrebarea ES-27.
- **Cursul.** `value` pare cursul în lei: `1.000000` la RON, `4.911500` la EUR în exemplu [A]. Data cursului și frecvența actualizării nu sunt documentate (IPOTEZĂ).

**Scope-urile, pe scurt**
- Lista oficială are 32 de scope-uri [A]. §4.3 cere 21 dintre ele.
- Rutele folosite mai cer unul: `read-fulfillment-services` (E4). Rezervele cer, numai dacă se adoptă, `update-customers` (D33) și `read-tags`, `add-tags`, `attach-tags`, `detach-tags`. Statusurile personalizate merg pe `read-orders` și `update-orders` [A], deja cerute.
- Lista se închide înainte de E1. Un scope adăugat mai târziu cere o emitere nouă, care revocă tokenul viu [A] (§4.3, §4.5).
- Rămân necerute: `update-offers` (nu atingem ofertele), `update-account`, `read-customers`, `update-tags`, `delete-tags`.

**Nu se folosesc:**
- Add (`POST /products`, `/orders`, `/categories`, `/characteristics`): numai Save (§3.5).
- Actualizările pe id-ul intern easySales, `PUT /products/{id}` și `PUT /orders/{id}`: produsele și comenzile se scriu numai prin Save, pe id-urile noastre.
- Stocul pe un singur produs (`PATCH /products/{id}/stock`) și arhivarea unui singur produs (`PATCH /products/:id/archive`): stocul și arhivarea merg în bloc, pe SKU.
- Rutele PUT folosite sunt doar `PUT .../metadata` și `PUT /webhooks/{id}`. `PUT /categories/{id}`, `PUT /characteristics/{id}` și `PUT /orders/{id}/general-data` sunt rezerve (tabelul de mai sus).
- `Generate AWB` (`POST /orders/{internal_id}/awb/{courier_account_id}`), `Generate Return AWB` (`POST /returns/{internal_order_id}/awb/{courier_account_id}`) și `Generate invoice` (`POST /orders/{internal_id}/invoice/{billing_software_account_id}`). Edinio nu le cheamă.
  - Creează documente reale la curier sau în programul de facturare. Colecția are câte un singur exemplu de succes, niciun exemplu de eroare și nicio cheie de idempotență [A]. În exemplele de comandă, `awb_id`, `shipments` și `invoices` sunt tablouri [A]. Numai `awb_id` apare cu mai multe elemente (într-un exemplu, trei AWB-uri pe o comandă); în exemplele fără AWB e `null`, nu un tablou gol [A]. `shipments` și `invoices` au în exemple câte un singur element, deci mai multe facturi pe o comandă se deduc din tip, nu sunt arătate. Modelul are în paralel și câmpuri pentru o singură factură sau un singur AWB (`invoice_series`, `invoice_nr`, `invoice_url`, `awb_url`) [A], iar documentația nu spune pe care să ne bazăm. O reîncercare poate deci dubla documentul (IPOTEZĂ).
  - Rutele de anulare există: `DELETE .../awb`, `/invoice/storno`, `/delete-invoice`, `/cancel-invoice` [A]. Ce anulează ele la curier sau în programul de facturare nu e documentat (IPOTEZĂ). Stornarea, în plus, emite un document fiscal nou.
  - AWB-ul comenzilor noastre îl generează totuși operatorul sau o automatizare easySales, din datele implicite ale comenzii. `advanced_data` e opțional și „is used to overwrite default order data” [A]. În el, `order_data.cashValue` e float, obligatoriu în interiorul `order_data`, cu nota „Order value” [A]. Exemplul îl trimite ca șirul `"120.00"`, iar același câmp există la Generate Return AWB.
  - Că `cashValue` e suma de ramburs încasată de curier nu scrie nicăieri; ar putea fi și valoarea declarată sau asigurată. Nu se spune nici ce pune easySales implicit, nici ce face pe o comandă plătită online (`payment_mode` 1). Sensul de ramburs e IPOTEZĂ și se măsoară în M-COM-8, înaintea primei comenzi reale:
    - pe o comandă plătită cu cardul, `cashValue` 0 trimis explicit trebuie să dea un AWB fără ramburs;
    - pe o comandă cu ramburs, rambursul de pe AWB trebuie să fie egal cu `cashValue` și cu totalul de încasat;
    - fără `advanced_data`, se notează ce pune easySales.

    Până atunci nu ne bazăm pe valoarea implicită pentru comenzile plătite online.
- `/products/stock/list`: n-are filtru de website și pare sortată după stoc [A] (§5.5).
- Prețurile ofertelor, `PATCH /offers/40/6/prices` și `PATCH /offers/40/prices/bulk` (`update-offers`, după nume): nu atingem ofertele (§3.3). Colecția le scrie cu valori literale, fără parametri de cale [A]; forma cu `{segment}` și `{offer_id}` ar fi deducția noastră. Ce înseamnă 40 nu e documentat (ES-19). Că 6 e `offer_id` se deduce din corpul exemplului bulk (`"offer_id": 6`) și din variabila de colecție `offer_id`, cu valoarea 6, pe care niciun URL n-o folosește [A].
- Exporturile (`POST /orders/export`, `POST /offers/export`), statisticile (`GET /stats`), adresele (`PUT /shipping-address/{id}`, `/billing-address/{id}`), listarea și citirea clienților, ștergerea metadatelor, nomenclatoarele de țări, limbi și motive de anulare, `POST /account/forget-password`.
- Granturile `password` și `authorization_code`, autentificarea de sub-cont (`POST /account/sub-account/login`) și, până la M-AUTH-3, `refresh_token` (§3.5, §3.6).

**Parteneriatul (ES-1, D14)**
- **„Assign partner” nu se folosește.** Documentația se contrazice.
  - Cererea definită e `POST /api/v2/account/sub-account/login`, același URL ca „Sub-Account Authentication”, cu corpul `{client_id, client_secret, username, password, scope}` și descrierea „Assign a partner to current user.” [A].
  - Numai exemplul salvat „Assign partner -> Success”, din 10.10.2022, are cererea originală `POST /api/v2/account/partners`, cu corpul `{"code": "<UUID>"}`, și răspunsul 200 „The partner has been assigned successfully” [A]. Calea `/partners` apare o singură dată în toată colecția.
  - De unde vine `code`, ce format are, dacă e obligatoriu și ce efect are pe cont nu e documentat. Textele interfeței au câmpul „Have a discount/partner code?” la înregistrare, deci poate fi un cod de partener sau de recomandare (IPOTEZĂ).
  - Ruta e dedusă dintr-un singur exemplu și se confirmă cu easySales înainte de orice folosire (ES-1).
- **Exemplul Gomag nu dovedește un client OAuth de partener.**
  - În adminul Gomag există o aplicație easySales nativă (Apps → Canale de Vânzări → easySales). Comerciantul lipește în ea tokenul unui website de platformă „Gomag”, iar datele circulă în ambele sensuri (IPOTEZĂ; surse publice: articolul de suport easySales „Configurare Gomag”, ghidul „Cum conectezi Gomag cu easySales”, articolul Gomag „EasySales” și pagina Parteneri easySales).
  - Sursele arată doar pasul comerciantului: singura credențială pe care o lipește e tokenul website-ului. Că legătura merge fără client_id și client_secret nu e documentat (IPOTEZĂ, ES-1); dosarul B notează cazul ca neclar.
  - Dacă aplicația folosește API V2 și grantul website cu un client OAuth propriu al Gomag nu scrie nicăieri. Rămâne întrebare pentru easySales (ES-1), nu premisă a planului.

**Ce nu are API-ul V2** (căutat în cele 92 de cereri [A])
- Revocarea tokenului: nicio rută. Singura revocare documentată e implicită: un token nou îl revocă pe cel vechi [A]. „Revoke” apare doar în textele interfeței, iar ce face ștergerea clientului nu e documentat (IPOTEZĂ, ES-2).
- Crearea și ștergerea clienților, ștergerea comenzilor (D33, ES-27).
- Restaurarea produselor arhivate (ES-25).
- Dezactivarea unui produs fără arhivare: `status` (`active`/`inactive`) apare la citire și ca filtru [A], dar nu în tabelul Save (ES-18).
- Legarea ofertelor de produse. Dosarul Offers are doar citirea (cu filtrul `linked`), prețurile și exportul [A]. Centrul de ajutor descrie trei căi, toate în interfață: Autolink, legarea prin Excel și legarea individuală. Autolink potrivește după SKU, EAN, nume sau ID. La legarea prin Excel, identificatorii produsului sunt SKU, nume, EAN și, după blogul lor din 05.2026, „Product Website ID” (IPOTEZĂ, ES-24).
- Citirea retururilor.
