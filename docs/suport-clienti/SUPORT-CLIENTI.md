# Suport clienți: chatul din magazin (Tidio, tawk.to, Intercom, Zendesk)

Cele patru integrări de la **Integrări > Suport clienți**, scrise și probate local pe 22-23.11.2026 și livrate pe
24.11.2026. Paginile din panou: `/dashboard/features/tidio`, `/tawkto`, `/intercom`, `/zendesk`. Planul aprobat e în
`PLAN.md`; aici e ce s-a construit, ce spune documentația lor, ce s-a măsurat și ce a rămas.

**În producție din 24.11.2026.** Migrația (`migrations/2027-02-10-suport-clienti.sql`) a fost aplicată înaintea
codului. ⚠ Zendesk a fost livrat fără nicio rulare cu un cont adevărat (hotărârea proprietarului, la întrebarea cu
variante); celelalte trei au fost probate cu conturile lui. Vezi „Starea”.

## Pe scurt

- Comerciantul lipește un identificator public, pornește chatul, iar în magazin apare un buton de contact.
- Conversațiile se poartă în aplicația furnizorului. Edinio pune chatul în magazin și îi spune operatorului ce pagină
  privește clientul, ce a comandat și, pentru clientul cu cont, cine e (semnat pe server).
- Un singur furnizor pornit o dată.
- Magazinele fără chat nu descarcă nimic din codul lui (măsurat, vezi „Viteza”).

## Sursele

- **Tidio:** `developers.tidio.com` (`llms.txt` și câte un `.md` pe pagină): „Widget SDK” (evenimente, metode,
  identificarea vizitatorului).
- **tawk.to:** `developer.tawk.to/jsapi` (pagină statică; nu au API REST public).
- **Intercom:** `developers.intercom.com` (instalarea pentru web, metodele Messengerului, identitatea cu JWT).
- **Zendesk:** `developer.zendesk.com` (widgetul de mesagerie: comenzile de bază, evenimentele, autentificarea).
- **Scriptul lor adevărat**, citit unde documentația tace: `static.zdassets.com/ekr/snippet.js` (vezi mai jos).

Ce contează din ele, pe furnizor:

| | Tidio | tawk.to | Intercom | Zendesk |
| --- | --- | --- | --- | --- |
| Scriptul | `code.tidio.co/<cheie>.js` | `embed.tawk.to/<property>/<widget>` | `widget.intercom.io/widget/<id>` | `static.zdassets.com/ekr/snippet.js?key=<cheie>` |
| „A pornit” | evenimentul `tidioChat-ready` | `Tawk_API.onLoad` | `Intercom('ready', f)`, numai la o pornire reușită | `zE('messenger:get','config',f)`, chemată când vine configurarea |
| Butonul lor, ascuns | `hide()`, și înainte de încărcare | `hideWidget()`, din `onBeforeLoad` | `hide_default_launcher` la `boot` | `zE('messenger','hide')`, pus în coadă înainte de pornire |
| Deschis | `show()` apoi `open()` | `showWidget()` apoi `maximize()` | `show` / `showNewMessage` | `show` apoi `open` (după `hide`, `open` singur nu arată nimic) |
| Mesaj precompletat | nu | `setChatInputMessage` | `showNewMessage` | nu |
| Mesaj necitit | `messageFromOperator` | `onChatMessageAgent` | `onUnreadCountChange` | `unreadMessages` |
| Identitatea | `tidioIdentify`, fără semnătură | `login`, cu HMAC-SHA256(userId, cheia API) | JWT HS256 în `intercom_user_jwt` | JWT HS256 cu `kid`, prin `loginUser` |
| Comanda | etichetă pe vizitator + `track` | `addEvent` + atribut | `trackEvent` | `conversationMetadata` + `conversationTags` |
| Acord retras | `close` + `hide` | `minimize` + `hideWidget` | `shutdown` + cookie-urile șterse | `cookies: none` (își șterge stocarea) |

⚠ **Zendesk, citit în scriptul lor:** după ce se încarcă `snippet.js`, `window.zE` e doar o coadă care adună comenzile
și le redă când pornește widgetul. Deci „există `zE`” nu înseamnă „a pornit”. Pornirea se așteaptă cu
`messenger:get config`, 12 secunde; dacă nu vine (cheie ștearsă, widget blocat, widget clasic), cumpărătorul vede
„Chatul nu s-a putut deschide”.

## Măsurat pe fir (22.11.2026, identificatori inventați, nimic scris)

- `code.tidio.co/<cheie>.js`: 404 la o cheie inexistentă.
- `embed.tawk.to/<property>/<widget>`: 404.
- `ekr.zdassets.com/compose/<cheie>`: 404 („No product configs exist”). ⚠ `snippet.js?key=` dă 200 la orice.
- Intercom: `widget.intercom.io/widget/<id>` dă 200 la orice, deci nu verifică nimic; `POST
  api-iam.intercom.io/messenger/web/ping` dă 404 („App Not Found”) la un ID inexistent și 403 la unul adevărat.
  ⚠ 403 NU înseamnă „mesageria e oprită” (corectat pe 23.11.2026, cu un spațiu adevărat): aceeași cerere, făcută de
  Messenger din browser, primește 200 și fereastra se deschide. De pe server se află doar că spațiul există.

Pe ele stă butonul „Verifică” din panou: un identificator pe care furnizorul nu îl cunoaște nu se salvează; „nu a
răspuns” nu e „greșit” (se salvează cu un avertisment).

## Ce vede comerciantul

- Patru carduri la Integrări > Suport clienți; cel pornit poartă „Activ”.
- Pagina furnizorului: pasul 1 leagă contul (poate lipi și tot codul de instalare), pasul 2 alege cum apare butonul
  (al magazinului sau al furnizorului, partea, textul, telefonul, pagina de comandă, când se încarcă), pasul 3 alege ce
  știe operatorul (pagina și produsul, comanda, numele și emailul clientului cu cont, cu cheia de semnare).
- În dreapta: lista de configurare, „Unde răspunzi”, paragraful pentru Politica de confidențialitate, ghidul.
- Setări > Banner cookies arată categoria „Funcționale”, cu numele furnizorului.
- În editor: la „Butoane flotante” scrie că WhatsApp și apelul stau în același buton cu chatul, iar previzualizarea
  arată butonul desenat (acolo nu se încarcă scripturi).
- Ajutor: „Cum adaugi chat în magazin” și câte un ghid pe furnizor.

## Ce vede cumpărătorul

- Un buton rotund, în culoarea magazinului, jos, pe toate paginile. Cu WhatsApp sau telefon alături: un singur buton
  „Contact”, care se desface în „Chat”, „WhatsApp”, „Telefon”.
- La prima apăsare: fereastra de chat, dacă a acceptat cookie-urile funcționale (sau bannerul e oprit); altfel un
  cartonaș scurt („Chatul este oferit de Tidio si foloseste cookie-uri.”), cu „Deschide chatul” și „Nu acum”.
- Butonul stă deasupra barei de cumpărare, a barei coșului, a barei de comandă a coșului compact și a barei de
  cookie-uri; se dă la o parte cât e deschis coșul sau fereastra de comandă.
- Un răspuns primit cu fereastra închisă: bulină pe buton și „Mesaj nou”.
- După o comandă: „Ai o intrebare despre comanda?”, iar la tawk.to și Intercom mesajul e pregătit.
- Dacă își retrage acordul din „Setari cookie-uri”, chatul iese din pagină pe loc.
- Nu apare în zona de cont, într-un magazin oprit, în previzualizarea din editor și pentru roboți.

## Cum e construit

| Ce | Unde |
| --- | --- |
| Forma configurării, validările, ce ajunge în vitrină | `src/lib/suport/config.ts` |
| Furnizorii (nume, gazde, unde e cheia), paragraful de politică | `src/lib/suport/furnizori.ts` |
| Semnăturile (JWT, HMAC), numai pe server | `src/lib/suport/semnaturi.ts` |
| „Verifică” | `src/lib/suport/verifica.ts` |
| Acțiunile paginilor (verifică, salvează, deconectează) | `src/lib/actions/suport.actions.ts` |
| Ruta de identitate | `src/app/api/cont/suport/route.ts` |
| Adaptoarele, câte unul pe furnizor, aduse la cerere | `src/lib/suport/adaptoare/` |
| Contextul paginii și al comenzii | `src/lib/suport/context-vitrina.ts`, `components/public/ComandaPentruChat.tsx` |
| Butonul | `components/storefront/suport/ButonContact.tsx`, adus prin `ButonContactLaCerere.tsx` |
| Butonul desenat din editor | `components/storefront/suport/MartorButonContact.tsx` |
| Locul deasupra barelor | `LocPesteBaraDeJos.tsx` (fixe), `suport/LocPentruButonulDeContact.tsx` (lipicioase), `CookieConsent.tsx` (bara de cookie-uri) |
| Categoria de acord „Funcționale” | `src/lib/cookie-consent.ts`, `components/public/CookieConsent.tsx` |
| Panoul | `components/dashboard/SuportChatClient.tsx`, `components/dashboard/suport/PaginaSuport.tsx` |

- **Date:** o coloană, `suport_config`, cu secretele la primul nivel (`tawkto_cheie_api`, `intercom_secret`,
  `zendesk_secret`), înscrise în `privat.campuri_secrete`. Vitrina primește numai câmpurile publice, prin căi JSON, în
  citirea de antet pe care o făcea deja (`sp_*`): nicio cerere în plus.
- **Un adaptor = un fișier**, cu aceeași formă: `incarca`, `deschide`, `inchide`, `identifica`, `spuneContextul`,
  `acord`. Un al cincilea furnizor înseamnă un fișier, nu o schimbare în buton.
- **Butonul e o listă obișnuită**, nu un meniu ARIA: ordinea din cod e ordinea tastei Tab (întâi butonul, apoi ce
  deschide el), pe ecran răsturnată. Cât se deschide chatul, butonul își păstrează focusul.

## Securitate

- **Identitatea vine numai din sesiunea de cont.** Ruta nu citește nimic din cerere; semnează, cu secretul
  comerciantului, exact omul recunoscut după cookie. Numai pe domeniul propriu al magazinului, cu conturile pornite.
- **Fără semnătură nu pleacă emailul** la tawk.to, Intercom și Zendesk. Tidio nu are semnătură; acolo datele sunt o
  completare a formularului lor.
- **Secretele** sunt criptate în bază, mascate de două ori pe drumul spre browser și citite numai pe server.
- **Scripturile** se încarcă numai de pe gazdele fixe ale furnizorilor; identificatorul trece o verificare de formă
  înainte să ajungă într-o adresă. Niciun câmp de „cod liber”.
- **Acordul:** nimic de la furnizor nu se încarcă fără acordul pentru „Funcționale”, nici măcar legătura deschisă din
  timp (i-ar arăta adresa IP a vizitatorului). Retragerea scoate chatul din pagină pe loc.
- **Nimic personal în HTML:** identitatea se cere din browser, la deschiderea chatului.
- Fiecare acțiune din panou începe cu verificarea proprietarului; chemate fără sesiune răspund „Neautorizat” (probat).

## Viteza (build de producție, baza demo, 22.11.2026)

Aceeași pagină a aceluiași magazin, JavaScript descărcat:

| Starea | Fișiere | Transferat | Cereri spre furnizor |
| --- | --- | --- | --- |
| Fără chat | 39 | 413,8 KB | 0 |
| Cu chat, „la prima apăsare”, neapăsat | 40 | 420,9 KB (+7,1 KB) | 0 |
| Cu chat, după o apăsare sau „automat” | 41 | 423,0 KB (+9,2 KB) | scriptul furnizorului |

Pe pagina de produs, aceleași diferențe: 34 de fișiere și 393,9 KB fără chat, +7,1 KB cu chatul neapăsat, +9,2 KB
după încărcare.

- ⚠ **Găsit la măsurătoare și reparat:** importat direct în layout, codul butonului venea la pachet cu bannerul de
  cookie-uri, la fiecare magazin, cu sau fără chat. Acum stă în bucata lui (`ButonContactLaCerere`), iar în
  JavaScriptul unui magazin fără chat nu se găsește nimic din el.
- Cei 7 KB (butonul) vin după hidratare, nu țin pagina în loc; cei 2 KB în plus sunt adaptorul furnizorului ales.
- Greutatea widgetului fiecărui furnizor (ce se descarcă în felul „automat”) se măsoară cu conturile lui de probă.

## Probat

- **Probe de cod:** `suport-config.test.ts`, `suport-legat.test.ts` (legăturile care nu se văd din tipuri),
  `adaptoare/adaptoare.test.ts` (contractul cu fiecare furnizor, pe un browser fals), `acord-si-context.test.ts`.
- **În browser, pe baza demo**, cu Playwright: scriptul furnizorului e jucat de probă, cu ordinea și pauzele lui
  adevărate. Scenarii, pentru fiecare dintre cei patru: apăsarea, cartonașul de acord, acordul dat înaintea
  bannerului, telefonul cu bara de cumpărare, lista de contact, încărcarea automată (cu butonul lor care nu apare nicio
  clipă), eșecul și a doua încercare, butonul furnizorului, pagina de mulțumire, tastatura, bara de cookie-uri, bara
  coșului, pagina de comandă, coșul compact (derulat pas cu pas), roboții, editorul, legătura deschisă din timp,
  retragerea acordului, locurile unde butonul nu apare.
- **Gazdele adevărate ale furnizorilor, cu identificatori inventați:** un chat care nu pornește ajunge la om ca mesaj,
  iar scriptul lor adevărat nu aruncă nimic în pagina magazinului.
- **Ruta de identitate, pe rute reale:** fără `Origin`, cu `Origin` străin și de pe gazda platformei răspunde 403; un
  anonim primește un răspuns gol; o identitate scrisă în cerere și un cookie inventat sunt ignorate; peste 60 de cereri
  pe minut, 429. Fără sesiuni fabricate.
- **Panoul:** pe o rută locală de probă cu date fixe (nu e în Git), la 1440 și 390 px: capturi, consola, axe-core,
  acțiunile chemate fără sesiune.
- **Cu conturile adevărate (23.11.2026), în Chrome, pe magazinul de probă de pe demo, la 1568 px:** Tidio, tawk.to și
  Intercom, cu identificatorii publici citiți din paginile lor de instalare. La fiecare: butonul „Contact” cu lista
  Chat și WhatsApp, niciun script al furnizorului înainte de apăsare, cartonașul de acord, fereastra lor adevărată
  deschisă, butonul nostru ascuns cât e deschisă și revenit la închidere, butonul lor nevăzut nicio clipă, nicio
  eroare a noastră în consolă. Zendesk: încă neprobat cu un cont adevărat (lipsește cheia widgetului).

Numerele ultimei rulări sunt în secțiunea „Starea”.

## Ce NU face, și de ce

- **Widgetul clasic Zendesk.** Nu poate fi deosebit de cel de mesagerie din pagină (scriptul lasă doar o coadă), iar
  fără un cont cu el nu se poate proba. Pagina din panou o spune.
- **Mesaj precompletat la Zendesk și Tidio.** La Zendesk singura cale schimbă ecranul de început al conversației; la
  Tidio mesajul ar pleca direct.
- **API-ul de server Intercom și Zendesk.** Termenii lor interzic să cerem comerciantului tokenul lui de API; cere
  aplicații aprobate pe numele Edinio.
- **O căsuță de mesaje în Edinio, webhooks, două chaturi deodată.** Vezi `PLAN.md`, secțiunea 8.

## Ce a rămas

- **Dovada cu conturile adevărate, ce a mai rămas.** Zendesk: lipsesc cheia widgetului și Key ID-ul cheii de semnare
  (de confirmat și că `compose` răspunde 200 la o cheie adevărată). La toți: salvarea din panou cu o sesiune adevărată,
  telefonul, felul „automat” cu greutatea fiecărui widget, numele clientului cu cont așa cum îl vede operatorul.
- **Clientul intrat în cont**, în browser: îl probează proprietarul (nu fabric sesiuni).
- **Magazinul de probă de pe demo:** `casa-lumen` are încă chatul configurat pentru proba proprietarului; se scoate
  (`suport_config = null`) când nu mai e de folos.
- **Etapa C** din plan (formularul de contact care creează tichet, catalogul pentru asistenții AI).

## Starea (24.11.2026, la livrare)

- **Cod:** pe `main`, peste `899886a9`. **Bază:** migrația în producție din 24.11.2026, 17:27 RO (`suport_clienti`),
  aplicată înaintea codului; mutată în `migrations/`, scoasă din `IN_ASTEPTARE`, schema de referință regenerată în
  același commit (o coloană, trei câmpuri secrete, vederea și declanșatorul ei de scriere). Niciun magazin din
  producție nu avea chatul configurat la livrare.
- **Porți:** `tsc` 0; `npm test` 12.742 de probe (12.740 trec, 2 sărite); pragul de lint și deriva tipurilor,
  neschimbate; `npm run build` trece.
- ⚠ **Zendesk:** livrat la hotărârea proprietarului („Push, toate patru”), fără o rulare cu un cont adevărat: doar cu
  scriptul lor jucat de probă, cu gazdele lor adevărate și chei inventate. Prima dovadă adevărată va fi primul
  magazin care îl conectează.

### Starea de dinaintea livrării (22.11.2026, seara)

- **Cod:** necomis, în `edinio-main`, pe `main` la `85889828`. **Bază:** migrația numai pe demo. **Producție:** neatinsă.
- **Porți:** `tsc` 0; `npm test` 12.653 de probe (12.651 trec, 2 sărite); pragul de lint și deriva tipurilor,
  neschimbate; `npm run build` trece.
- **În browser, pe baza demo, 80 de scenarii (20 pentru fiecare furnizor), 834 de verificări:** Chromium 834 din 834,
  Firefox 834 din 834, WebKit 834 din 834. Pe build-ul de producție, scenariile principale: 486 din 486.
- **Ruta de identitate:** 24 din 24, pe rute reale.
- **Panoul:** 14 capturi fără erori în consolă și fără derulare laterală; axe-core găsește doar `heading-order`
  (titlurile de pas sunt `<h3>` după `<h1>`: vine din `Panel`, comun întregului panou, nu din lucrarea asta).
- **Baza demo:** pusă la loc după fiecare rulare (niciun magazin cu chat rămas, niciun domeniu de probă).
- **23.11.2026:** pentru proba proprietarului, magazinul `casa-lumen` de pe demo are chatul configurat dinadins: Tidio
  pornit, tawk.to și Intercom salvate (identificatori publici, niciun secret). Se scoate la final
  (`suport_config = null`). Probele de cod ale chatului: 73 din 73 după reparația verificării Intercom.

Uneltele de probă stau în scratchpad-ul sesiunii, nu în Git: `chat-e2e.mjs` (scenariile din browser),
`furnizori-falsi.mjs` (scripturile furnizorilor, jucate), `identitate-e2e.mjs`, `greutate.mjs`, `panou.mjs` și sursa
rutei locale de probă a panoului.

### Găsite la probă și reparate

| Ce s-a văzut | Unde | Reparația |
| --- | --- | --- |
| Bara de cookie-uri (poziția implicită) acoperea butonul, cu o fâșie de 13 px ieșită deasupra | browser, 1280 px | bara își anunță înălțimea (`--banner-cookie`), numai la magazinele cu chat |
| Bara de comandă a coșului compact e lipicioasă: când se desprinde, trecea prin buton, peste „Finalizeaza comanda” | browser, derulare în pași | locul se măsoară (`LocPentruButonulDeContact`), față de o sondă fixă |
| Zendesk: „există `zE`” nu înseamnă „a pornit”; ramura de widget clasic nu se putea declanșa niciodată | scriptul lor adevărat | pornirea se așteaptă cu `messenger:get config`; clasicul, scos |
| Butonul furnizorului putea apărea o clipă înainte să-l ascundem | documentația lor | tawk.to: `onBeforeLoad`; Tidio: `hide()` de cum există API-ul; Zendesk: comanda în coadă |
| Codul butonului ajungea la fiecare magazin, cu sau fără chat | build de producție | `ButonContactLaCerere` |
| În Safari, Tab sărea peste WhatsApp și Telefon din lista de contact | WebKit | `tabindex="0"` pe cele două legături |
| Acordul retras lăsa chatul în pagină până la reîncărcare | recitire | `acord()` pe fiecare adaptor |
| Meniul ARIA promitea săgeți pe care nu le avea; lista venea înaintea butonului în ordinea Tab | recitire | listă obișnuită, ordinea din cod = ordinea Tab |
| „Verifică la Intercom” spunea „pornește Messenger pentru web” la un spațiu care mergea: 403 de pe server, 200 din browser | cont adevărat, 23.11.2026 | 403 înseamnă doar „spațiul există”; ghidul nu mai trimite la o setare din Intercom |
