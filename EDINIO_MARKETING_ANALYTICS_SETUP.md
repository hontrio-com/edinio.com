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
| Evenimente | **23** de nume, trase din cod |
| Conversii | cerere de ofertă, cont nou, trial, abonament |
| Deduplicare | fiecare conversie poartă un `event_id` reproductibil pe server |

Pixelii **nu** mai pornesc pe `localhost` și nici pe desfășurările de
previzualizare. Până pe 01.09.2026 porneau, și trimiteau evenimente în conturile
adevărate.

Cele 23 care se trag azi:

`page_view`, `section_view`, `scroll_depth`, `cta_click`, `navigation_click`,
`outbound_click`, `landing_view`, `form_start`, `form_submit`, `form_error`,
`generate_lead`, `article_view`, `article_read_progress`, `article_read_complete`,
`newsletter_subscribe_request`, `newsletter_subscribe_confirmed`, `sign_up`,
`onboarding_step_view`, `onboarding_step_complete`, `begin_checkout`,
`add_payment_info`, `trial_start`, `purchase`.

> În cod mai există **11 nume declarate dar netrase de nicăieri** (`faq_open`,
> `plan_select`, `integration_view`, `article_share` și altele). Ele stau acolo
> ca să nu apară peste o lună trei nume diferite pentru același lucru.
> **Nu le face dimensiuni în GA4**: locurile sunt 50 și n-ar aduna nimic.

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

## 3. GA4 — două setări care se uită

**Păstrarea datelor.** Admin → *Data retention* → **14 luni**. Implicit sunt 2, și
asta înseamnă că peste trei luni nu mai poți compara cu anul trecut. Se schimbă
doar în viitor: ce s-a pierdut nu se mai întoarce.

**Traficul propriu.** Admin → *Data streams* → *Configure tag settings* →
*Define internal traffic*, apoi *Data filters* → activează filtrul.
Fără el, fiecare oră în care lucrezi la site intră în rapoarte ca vizită
adevărată.

> Veghea care ciocănește `www.edinio.com` la câteva minute **nu** umflă nimic: e o
> cerere HTTP simplă, iar GA4 numără doar unde rulează JavaScript.

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

## 5. Ce **nu** e făcut încă, și ce cere fiecare

### Meta Conversions API

Trimiterea conversiilor **și** de pe server, ca să nu se piardă din cauza
blocantelor de reclame. Codul din browser trimite deja `event_id`, deci
deduplicarea e pregătită.

**Îmi trebuie de la tine:** un token din Events Manager → *Settings* →
*Conversions API* → *Generate access token*.

### TikTok Events API

Aceeași poveste. **Îmi trebuie:** un *Access Token* din TikTok Events Manager.

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
