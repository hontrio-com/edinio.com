# theMarketer

Integrarea theMarketer (email, SMS, push, recomandări, coș abandonat, fidelitate, recenzii), livrată în cod pe
18.11.2026. Pagina din panou: **Integrări > TheMarketer** (`/dashboard/features/themarketer`).

## Sursele

- **Specul autoritar:** `developers.themarketer.com` (ReadMe; `llms.txt` și câte un `.md` pe pagină). Pagina publică
  `themarketer.com/ro/resources/api` e în urma lui:
  - **Tipurile rapoartelor:** scrie `total_subscribed_emails`, dar API-ul cere `total-subscribed-emails`
    (măsurat: cu `_` răspunde 401 „The selected type is invalid.”).
  - **Data dezabonaților:** spune timestamp Unix, specul spune zi `YYYY-MM-DD`.
  - **Feedul de comenzi:** publicul nu spune că e paginat; specul cere `page`, maximum 50 pe pagină.
- **Pluginul lor oficial de WooCommerce** (`plugins.svn.wordpress.org/themarketer/trunk`), citit pentru ce lipsește
  din documentație:
  - **Fără GTM:** dataLayer fără Google Tag Manager.
  - **Codurile:** forma lor (`MKTR-` + 10 caractere, o singură folosire).
  - **Notificările push:** fișierele de la rădăcina site-ului.
  - **Stocul negestionat:** disponibilitate 2, stoc 0.
  - **Recenziile:** `review_email` în XML.

## Măsurat pe fir (18.11.2026, chei inventate, nimic scris)

| Cerere | Răspuns |
| --- | --- |
| orice rută, Customer ID inexistent | `404 {"message":"Customer not found."}` (unele rute: pagină HTML 404) |
| `add_subscriber` fără email | `401 {"message":"The email field is required."}`: **401 nu înseamnă mereu cheie greșită** |
| `update_order_status` cu POST | `405` (e GET) |
| `save_order` incomplet | `422 ... required attributes is empty` (din spec) |
| `t/j/<cheie inventată>` | `404`: așa se verifică Tracking Key-ul |
| `t/j/<cheie REALĂ>`, cerut fără domeniul ei (de pe server sau direct în browser) | `403`, pagina Laravel „Forbidden”. Pe site-ul clientului, același script: `200`, apoi `__sm__tracking_loaded` și `fetch` spre `t/r`. **Scriptul se dă NUMAI pe domeniile contului** (primar + „Extra domains”). Măsurat cu cheia publică a unui client theMarketer. |

## Ce face

| Funcție theMarketer | În Edinio |
| --- | --- |
| Script + evenimente `__sm__*` | `TheMarketerTracking` sub `ConsentGate` „marketing”; evenimentele prin coada din `lib/marketing.ts` (`mktrEvent`): acasă, categorie (ierarhie completă), brand, produs, coș +/−, checkout, comandă, căutare, set_email |
| Coșul, în theMarketer | theMarketer ține coșul din evenimente, deci orice schimbare pleacă drept DIFERENȚĂ din `CartProvider` (`trackCantitateTM`): ștergere, +/−, editarea liniei. Adăugarea de pe pagina produsului o spune `trackAddToCart`. |
| Captarea emailului din checkout | `mktrCapteazaEmailul`, modul `captura_email` (oprit implicit) |
| Save Order + statusuri | coada `email_marketing_coada` (furnizorul `themarketer`): ramburs la creare, card la plată, apoi Shipped/Delivered/Cancelled/Refunded |
| `__sm__order` pe pagina de mulțumire | partea fără date personale de la server, datele omului din `sessionStorage` (`comanda-browser.ts`), niciodată în HTML |
| Add subscriber | checkout (bifa de newsletter), blocul Newsletter, formularele bifate; numai `channels=email` |
| Feeduri produse / categorii / branduri | `/api/themarketer/<cheie>/produse.xml` etc., în flux (limita de 4,5 MB a Vercel) |
| Feedul de comenzi (import) | `/api/themarketer/<cheie>/comenzi.json?page=N`, 50/pagină, ultimii 3 ani, fără marketplace și fără plăți online neîncasate; modul `export_comenzi` (oprit implicit) |
| Generatorul de coduri | `/api/themarketer/<cheie>/cod-reducere?key=<REST>&value=&type=&expiration_date=`; `discounts.generat_de = 'themarketer'`. Ascunse din lista de coduri, din cifrele de lângă filtre și din numărul codurilor (nu și din banii aduși) cât timp nu se caută; pagina Discounturi spune unde sunt („Arată-le”). Scoase din alegerea codului la coșul abandonat și din verificarea lui în cron |
| Dezabonați | webhookuri (`/webhook/dezabonat`, `/respins`, `/spam`) + cronul orar (`unsubscribed_emails`) → `recovery_optout` |
| Anonimizare | anonimizarea unui client în Edinio cheamă `anonymize-email` și șterge recenziile lui |
| Recenzii (Feedback) | cronul orar (`product_reviews`) → `recenzii_produse`; sub produs + `aggregateRating`; ascunse din panou |
| Fidelitate | `loyalty_info` + `get_available_coupons` în contul cumpărătorului (adresele verificate) |
| Push | `/firebase-messaging-sw.js` și `/firebase-config.js`, numai pe domeniul propriu, numai cu modulul pornit |

## Probat în vitrină (local, pe baza DEMO, 18.11.2026)

- **Acordul:** fără acord pentru marketing, scriptul nu se încarcă. Panoul de cookie-uri al unui magazin doar cu
  theMarketer arată rubrica „Marketing (theMarketer)”.
- **După acord:** `mktr_key`, scriptul și evenimentele pleacă: `view_homepage`, `view_product`, `add_to_cart`,
  `remove_from_cart`, `initiate_checkout`, `set_email`. În dezvoltare, evenimentele din efecte apar de două
  ori: e modul strict al React, nu codul.
- **Rutele:** generatorul de coduri, webhookul și cronul au fost chemate pe server.
- **Feedurile, pe date reale** (casa-lumen, doar citire): XML valid. Au intrat 62 de produse din 83; lipsesc
  19 produse demo ale temei și 2 fără poză.
- **Găsite și reparate la probă:**
  - **Scăderea cantității** nu anunța theMarketer: rămânea o bucată fantomă și putea pleca email de coș
    abandonat.
  - **Fereastra de comandă** deschisă din sertarul paginilor fără catalog nu trimitea niciun eveniment de
    început de comandă (nici Meta, TikTok sau GA4).
- **Nevăzută în browser:** pagina din panou. Sesiunea locală expirase, iar parola nu se introduce de aici.

## Ce NU face, și de ce

- **Wishlist, Add Review:** platforma n-are listă de favorite sau recenzii proprii de trimis.
- **Emailuri și SMS tranzacționale prin theMarketer:**
  - **Cost:** sunt facturate separat.
  - **Dublură:** ar dubla emailurile și SMS-urile pe care Edinio le trimite deja.
- **Sync products/brands/categories API:** feedurile le acoperă; theMarketer le recitește singur.
- **Server-side events (`/t/r`):** scriptul și `save_order` le acoperă.
- **Rapoartele:** forma răspunsului (`period`, `total_period`, `evolution`) e în spec, dar n-a putut fi măsurată
  fără un cont real. Se pot adăuga în panou după prima conectare reală.

## Domeniul magazinului

theMarketer dă scriptul numai pe domeniile trecute în cont (Settings, Technical Integration: domeniul principal
și „Extra domains”). Pe alt domeniu răspunde 403 și nu urmărește nimic, fără nicio eroare în Edinio.

- **Proba de conexiune** primește 403 la orice cheie bună (cererea de pe server n-are domeniu), deci îl ia drept
  „cheie cunoscută”. Doar 404 înseamnă cheie greșită. Domeniul nu se poate verifica de pe server fără un
  `Referer` mințit, așa că nu se verifică.
- **Panoul** arată domeniul exact pe care merge vitrina (`custom_domain`, canonic, fără `www.`; altfel
  `www.edinio.com`) și cere să fie adăugat la „Extra domains” dacă în theMarketer e altul.

## Securitate

- **Secretele:**
  - **Ce e criptat:** `rest_key` și `cheie_feed` (`privat.campuri_secrete`); pagina le primește mascate.
  - **Ce poate ajunge în browser:** numai `tracking_key` (e publică), plus comutatoarele, citite prin cale JSON (`tm_*`).
- **Adresele (feeduri, coduri, webhookuri):**
  - **Cheia:** o cheie a noastră în CALE, căutată după amprentă (`themarketer_chei`).
  - **Răspunsurile:** 404 identic pentru cheie greșită, revocată sau modul oprit; 503 la o pană de bază.
  - **Rotirea:** se face din panou.
- **Generatorul de coduri:** cere în plus cheia REST în `key`, comparată în timp constant. Plafoane: 100% și 5000 lei.
- **Tabelele noi:** RLS pornit, fără drepturi pentru `anon` și `authenticated`.

## Livrarea

1. Migrația `migrations/2027-02-07-themarketer.sql` a fost aplicată în producție pe 18.11.2026, ÎNAINTEA
   pushului, după verificarea amprentelor md5 ale celor șase funcții atinse. Fără ea:
   - **Vitrina:** antetul cere `tm_*`. O coloană lipsă rupe toată interogarea, iar antetul ar fi căzut la
     fiecare vizită pe citirea de rezervă, fără theMarketer.
   - **Coada:** triggerul citește `themarketer_config`.
   - **Coșul abandonat:** alegerea codului și cronul filtrează pe `discounts.generat_de`. Fără coloană, citirea
     cade, iar emailurile de recuperare ar pleca FĂRĂ cod.
   Aplicată deja pe DEMO și verificată (criptare, RLS, drepturi, amprenta funcțiilor rescrise).
2. După aplicare: mutată în `migrations/`, scoasă din `IN_ASTEPTARE` (`scripts/verifica-tipuri-db.mjs`),
   baseline regenerat.
3. Probe: `src/lib/themarketer/*.test.ts` (client, forme, rulare cu PostgREST de probă, legături).
