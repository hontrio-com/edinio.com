# Configurarea măsurării Edinio

Ce nu se poate face din cod. Fiecare pas spune **de ce** e nevoie de el și **ce se
strică fără el** — ca să poți sări peste ce nu-ți trebuie, în cunoștință de cauză.

> Măsurarea **Edinio** (site-ul de prezentare, blogul, înscrierea) e complet
> despărțită de măsurarea **magazinelor clienților**. Codurile lor stau în
> configurația fiecărui magazin și nu se întâlnesc niciodată cu ale noastre. O
> probă (`src/lib/granita-tracking.test.ts`) cade dacă cineva le apropie.

---

## 0. Ce e deja făcut, fără nimic din partea ta

| | |
|---|---|
| Eticheta GA4 `G-SB92HFQ1EN` | vie pe `edinio.com`, **numai** acolo |
| Pixel Meta + TikTok | vii, **numai** pe `edinio.com` |
| Evenimente | **29** de nume, trase din cod |
| Conversii | cerere de ofertă, cont nou, trial, abonament |
| Deduplicare | fiecare conversie poartă un `event_id` reproductibil pe server |

Pixelii **nu** mai pornesc pe `localhost` și nici pe desfășurările de
previzualizare. Până pe 01.09.2026 porneau, și trimiteau evenimente în conturile
adevărate.

Cele 29 care se trag azi:

`page_view`, `section_view`, `scroll_depth`, `cta_click`, `navigation_click`,
`outbound_click`, `landing_view`, `form_start`, `form_submit`, `form_error`,
`generate_lead`, `article_view`, `article_read_progress`, `article_read_complete`,
`newsletter_subscribe_request`, `newsletter_subscribe_confirmed`, `sign_up`,
`onboarding_step_view`, `onboarding_step_complete`, `begin_checkout`,
`add_payment_info`, `trial_start`, `purchase`, `billing_period_change`,
`faq_open`, `integration_filter`, `article_cta_click`, `view_search_results`, `article_share`.

> Ultimele cinci s-au adăugat pe 02.09.2026, după un audit din afară care a
> numărat suprafețele vii nemăsurate: comutatorul lunar/anual de la prețuri,
> întrebările frecvente, filtrul din biblioteca de integrări, îndemnul din corpul
> articolelor, și cele două căutări (blog și centrul de ajutor).
>
> Căutarea trimite și **câte rezultate a găsit**. „Ce caută oamenii" e o întrebare
> aproape nefolositoare; „ce caută și **nu** găsesc" e o listă de articole de scris.
>
> `article_share` a venit odată cu butoanele de partajare din articole, adăugate
> tot pe 02.09.2026 — până atunci evenimentul era declarat pentru o funcție care
> nu exista. Butoanele sunt legături obișnuite, **fără niciun script de la
> rețele**: SDK-urile oficiale de „share" urmăresc vizitatorul chiar dacă nu
> apasă nimic, adică exact ce am pus sub consimțământ.
>
> În cod mai există **5 nume declarate dar netrase de nicăieri** (`plan_select`,
> `integration_view`, `registration_view`, `registration_start`,
> `onboarding_complete`). Ele stau acolo ca să nu apară peste o lună trei nume diferite pentru
> același lucru. **Nu le face dimensiuni în GA4**: locurile sunt 50 și n-ar aduna
> nimic.

---

## 1. GA4 — dimensiuni personalizate

**De ce.** GA4 primește parametrii noștri, dar nu-i arată în niciun raport până nu
sunt înregistrați. Până atunci datele *se strâng* și *nu se pot vedea* — iar
Data API respinge cu eroare orice cerere care pomenește un parametru
neînregistrat.

**Unde:** GA4 → Admin → *Custom definitions* → *Create custom dimension*.
La fiecare: **Scope = Event**, iar *Event parameter* = exact numele din tabel.

### Neapărat (fără ele lipsesc secțiuni din `/admin/analytics`)

| Parametru | Nume sugerat | Fără el |
|---|---|---|
| `page_group` | Grup pagină | tabelul „Pe grupuri de pagini" lipsește cu totul |
| `cta_id` | Buton | tabelul „Butoane apăsate" e gol |
| `page_type` | Fel pagină | nu poți despărți blogul de paginile de vânzare |

### Merită, în ordinea folosului

`form_name`, `error_type`, `signup_origin`, `plan_id`, `billing_period`,
`article_id`, `article_slug`, `read_depth`, `section_name`, `lead_type`,
`onboarding_step`, `outbound_host`, `nav_item`, `cta_location`.

### Nu le înregistra

`page_location`, `page_title`, `value`, `currency`, `search_term`,
`transaction_id` — GA4 le are deja ca parametri standard. Înregistrate din nou,
consumă din cele 50 de locuri degeaba.

> **Limita e 50** pe o proprietate standard, și **nu se poate șterge o dimensiune
> și refolosi locul imediat** — arhivarea ține locul ocupat o vreme. De aceea
> lista de sus e scurtă și în ordine.

---

## 2. GA4 — evenimente-cheie

**Unde:** Admin → *Events* → comutatorul *Mark as key event*.

Doar acestea patru:

- `generate_lead` — cerere din formularul de contact sau de migrare
- `sign_up` — cont nou
- `trial_start` — a pornit perioada de probă
- `purchase` — abonament plătit

**De ce nu mai multe.** Un clic pe buton nu e o conversie. Marcat așa, optimizarea
campaniilor învață să caute clicuri în loc de clienți — și plătești pentru ele.

> Evenimentele apar în listă **abia după ce s-au produs cel puțin o dată**. Dacă
> nu le vezi, nu e stricat nimic: încă n-a trecut nimeni prin ele.

---

## 3. GA4 — trei setări care se uită

**Păstrarea datelor.** Admin → *Data retention* → **14 luni**. Implicit sunt 2, și
asta înseamnă că peste trei luni nu mai poți compara cu anul trecut. Se schimbă
doar în viitor: ce s-a pierdut nu se mai întoarce.

**Traficul propriu.** Admin → *Data streams* → *Configure tag settings* →
*Define internal traffic*, apoi *Data filters* → activează filtrul.
Fără el, fiecare oră în care lucrezi la site intră în rapoarte ca vizită
adevărată.

> Veghea care ciocănește `www.edinio.com` la câteva minute **nu** umflă nimic: e o
> cerere HTTP simplă, iar GA4 numără doar unde rulează JavaScript.

**⚠ Interacțiunile cu formularele — pe OFF.** Admin → *Data streams* → alege fluxul
web → *Enhanced measurement* (rotița din dreapta) → oprește **Form interactions**.

De ce contează, și de ce e singura dintre cele trei care **strică date deja
adunate**: Enhanced Measurement trage singur `form_start` și `form_submit` pe orice
`<form>` adevărat din pagină. Formularele noastre de contact și de migrare *sunt*
formulare adevărate, iar noi tragem manual evenimente cu **exact aceleași nume**,
fiindcă alea sunt numele standard GA4.

Deci fiecare completare se numără de două ori, iar cele două ajung pe același rând
și nu se mai pot despărți după fapt. Rata de finalizare a formularelor e nesigură
până apeși comutatorul ăsta.

**Ce am ales, și de ce nu am reparat-o din cod:** aș fi putut redenumi evenimentele
noastre în ceva care nu se ciocnește — dar atunci am fi pierdut tot ce știe GA4
despre `form_start` și `form_submit` (rapoarte gata făcute, pâlnii, comparații cu
alte site-uri). Numele standard sunt mai valoroase decât comoditatea de a nu
apăsa un comutator.

**Celelalte două opțiuni din Enhanced Measurement, verificate:**

| Opțiune | Se ciocnește? |
|---|---|
| *Page changes based on browser history events* | **Da, oprește-o.** Noi măsurăm manual schimbarea de pagină, cu `send_page_view: false`. |
| *Scrolls* | Nu. Ea trage `scroll`; noi tragem `scroll_depth` cu praguri 25/50/75/90. Nume diferite, rânduri diferite. |
| *Outbound clicks* | Nu. Ea trage `click`; noi tragem `outbound_click`. |
| *Site search*, *Video*, *File downloads* | Nu se ciocnesc cu nimic de-al nostru. |

---

## 4. `/admin/analytics` — conectarea

1. Panou admin → **Trafic site**
2. **Conectează Google** → alege contul care vede proprietatea GA4 a Edinio
3. Dacă acel cont are o singură proprietate, se alege singură

**Nu trebuie cont de serviciu și nu trebuie nimic în Google Cloud.** Se folosește
aplicația Google care există deja pentru clienți: același `redirect_uri`, același
drept (`analytics.readonly`, **doar citire**).

**Dacă butonul spune că aplicația nu e configurată**, lipsesc din Vercel
`GOOGLE_MERCHANT_CLIENT_ID` și `GOOGLE_MERCHANT_CLIENT_SECRET` (aceleași chei
folosite de integrarea Google a clienților).

**Când legătura se rupe** — dacă retragi accesul din contul Google, dacă schimbi
parola, sau dacă aplicația stă în „Testing" și trec șapte zile — pagina cere
reconectare. E o stare obișnuită, nu o defecțiune.

---

## 5. Conversiile de pe server — **livrate pe 02.09.2026**

> ⚠ Secțiunea asta spunea, până la ora 18:00 pe 02.09.2026, „ce **nu** e făcut
> încă", și cerea tokenuri care erau deja puse. Un audit extern a citit-o și a
> raportat că Meta CAPI și TikTok Events API sunt „infrastructură, nu integrare
> finalizată" — concluzie corectă față de document și falsă față de cod.
>
> Documentul a rămas în urmă cu câteva ore față de livrare, și a mințit pe cine
> l-a crezut. De asta e scris aici: ca să nu pară că nu s-a întâmplat nimic.

Conversiile pleacă **și** de pe server, nu doar din browser, ca să nu se piardă
la blocantele de reclame. Cele două drumuri poartă același `event_id`, deci
furnizorii le unesc și numără o singură conversie.

**Ce pleacă de pe server:** `sign_up` (email și Google), `generate_lead` (contact
și migrare), `trial_start`, `purchase`.

**Cum:** o coadă în baza de date (`edinio_conversion_outbox`), golită din minut în
minut de `/api/cron/conversii`. O trimitere picată se reîncearcă de șase ori, cu
pauze care cresc; una respinsă de furnizor se abandonează pe loc, cu motivul scris.

**Ce trebuie să existe în Vercel** (sunt deja puse — verificat în producție):

| Variabilă | Ce e |
|---|---|
| `META_CAPI_TOKEN` | token din Events Manager → *Settings* → *Conversions API* |
| `TIKTOK_EVENTS_TOKEN` | *Access Token* din TikTok Events Manager |

⚠ Dacă una lipsește, **nimic nu cade**: furnizorul ei e sărit tăcut, iar în jurnal
apare o dată `conversii.destinatieNelegata`. Build verde, probe verzi, zero
conversii. De aceea sunt scrise și în `.env.example`.

Dovada de la livrare: răspuns brut `{"events_received":1,...}` de la Meta și
`code 0` de la TikTok, iar cronul din producție a golit coada în 7 secunde.

### Aplicație Google separată pentru platformă — **pregătit, opțional**

Astăzi `/admin/analytics` folosește **aceeași aplicație Google OAuth** ca integrarea
comercianților. Datele sunt separate — fiecare cu jetonul lui — dar infrastructura
nu: o schimbare cerută de una o atinge pe cealaltă.

Codul acceptă acum credențiale proprii. **Fără ele nu se schimbă nimic**, deci nu
trebuie făcut nimic acum:

| Variabilă | |
|---|---|
| `EDINIO_ANALYTICS_GOOGLE_CLIENT_ID` | din aplicația nouă |
| `EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET` | din aceeași aplicație |

**Dacă vrei să le separi, în ordinea asta:**

1. În Google Cloud, aplicație OAuth nouă, cu **același** `redirect_uri`:
   `https://www.edinio.com/api/google-analytics/oauth/callback`
2. Drept: `https://www.googleapis.com/auth/analytics.readonly`
3. Pui amândouă variabilele în Vercel și redeploy.
4. **Reconectezi** `/admin/analytics`. Pasul ăsta e obligatoriu, nu opțional.

> ⚠ **De ce cere reconectare.** Un `refresh_token` aparține aplicației care l-a
> cerut. În clipa în care creditele se schimbă, cel salvat nu mai e valabil și
> Google răspunde `invalid_grant`. Nu e un defect — e felul în care lucrează ei.
> Cât timp nu reconectezi, rapoartele din admin arată „neconectat". **Integrarea
> comercianților nu e atinsă deloc**, și o probă păzește asta în ambele sensuri.

> ⚠ **Amândouă sau niciuna.** Cu una singură, codul cade înapoi pe aplicația comună.
> Altfel Google ar răspunde `invalid_client` și nimic n-ar spune de ce.

---

### Search Console în `/admin/analytics` — **abandonat**

Cerea alt drept (`webmasters.readonly`), care se adaugă pe ecranul de
consimțământ al aplicației Google. E un drept „sensibil": la o aplicație deja
verificată, adăugarea lui poate declanșa o re-verificare de câteva săptămâni — în
care integrarea Google a **clienților** ar putea fi afectată.

Hotărât pe 02.09.2026: nu-l cerem. Riscul pentru integrarea clienților e mai mare
decât ce ar aduce raportul. Datele din Search Console rămân în interfața Google,
unde oricum sunt.

---

## 6. Cum verifici că totul merge

**Acum, în 30 de secunde:** GA4 → *Reports* → *Realtime*, deschide `edinio.com`
într-o filă. Trebuie să te vezi.

**Evenimentele, unul câte unul:** GA4 → Admin → *DebugView*. Se aprinde punând
în consola browserului, pe `edinio.com`:

```js
localStorage.setItem("edinio_marketing_debug", "1")
```

De acolo, fiecare eveniment se scrie și în consolă, cu tot ce duce cu el.
Jurnalul e stins pe producție pentru vizitatori — se aprinde doar pentru tine, în
browserul tău.

**Peste 24 de ore:** rapoartele obișnuite. GA4 procesează cu întârziere; un tabel
gol în prima zi nu înseamnă nimic.

---

## 7. Ce s-a schimbat în cifre, ca să nu te sperii

Trei numere **se vor schimba** din cauza reparațiilor din 01–02.09.2026:

| Ce | Cum | De ce |
|---|---|---|
| „Lead" în Meta | **scade** | pasul din înscriere pleca sub același nume ca o cerere de ofertă |
| Conturi noi în Meta | **scade la jumătate** | fiecare înscriere pe email se număra de două ori |
| Conturi noi peste tot | **crește ~17%** | înscrierile prin Google nu se numărau deloc |

Niciunul nu e o defecțiune nouă. Toate trei sunt cifre care abia acum spun
adevărul.
