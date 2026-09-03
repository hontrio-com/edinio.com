/*
  ═══════════════════════════════════════════════════════════════════════════════
  UNDE NU INTRA JAVASCRIPT DE PUBLICITATE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA. Previzualizarea unui articol nepublicat sta sub grupul
  `(website)`, dinadins: trebuie sa arate exact ca articolul public. Dar layout-ul
  acela randeaza si `EdinioMetaPixel`, si `EdinioTikTokPixel`.

  Deci pana pe 01.09.2026 un redactor care deschidea un DRAFT incarca in aceeasi
  pagina cod adus de la `connect.facebook.net` si `analytics.tiktok.com`.

  ⚠ SI ASTA NU E DOAR O CHESTIUNE DE CONFIDENTIALITATE. Pagina aceea are o
  sesiune Supabase, iar cookie-ul ei NU e `httpOnly` — nu din scaparea noastra, ci
  fiindca modelul Supabase pentru clienti de browser cere ca tokenurile sa fie
  citibile din JavaScript. Un script tert incarcat in pagina ruleaza cu drepturile
  paginii: vede DOM-ul draftului, `location.href` si ce e citibil din JS.

  Nu spun ca Meta sau TikTok fac asta. Spun ca modelul de incredere e gresit: pe
  un ecran autentificat cu continut nepublicat n-are ce cauta cod de reclama de la
  altcineva. Daca lantul lor de livrare e vreodata compromis, paguba nu mai e „s-a
  stricat o pagina de marketing".

  ⚠ REGULA STA INTR-UN SINGUR LOC, dinadins. Doua liste de cai, cate una in
  fiecare componenta de pixel, s-ar fi despartit la prima cale adaugata — si cea
  uitata ar fi continuat sa incarce scriptul fara ca nimic sa cada. Aceeasi
  greseala pe care am reparat-o azi la etichetele operatiilor.

  ⚠ SE INTOARCE `null` INAINTE DE RANDARE, nu se scoate scriptul dupa montare.
  `<Script>` care nu intra in arbore nu e injectat niciodata; unul scos dupa aceea
  a apucat deja sa se incarce si sa trimita `PageView`.
*/

/*
  ⚠ SI PANOUL, DE PE 03.09.2026. Argumentul de mai sus e scris pentru
  previzualizarea de articol, dar se potriveste cuvant cu cuvant si mai apasat
  pentru `/dashboard` si `/admin`: acolo stau comenzile, clientii si facturile
  comerciantilor, tot sub o sesiune Supabase citibila din JavaScript.

  ⚠ SI NU E DOAR CONFIDENTIALITATE. `fbevents.js` isi pune singur carligul pe
  schimbarea istoricului, deci fiecare navigare prin aplicatie pleca la Meta —
  chiar daca `CAI_FARA_PAGE_VIEW` oprea `page_view`-ul NOSTRU. Cele doua liste
  seamana, dar opresc lucruri deosebite: una scripturile lor, cealalta masuratoarea
  noastra. Vezi nota de mai jos.

  ⚠ PIXELII AU FOST SCOSI SI DIN LAYOUT-UL PANOULUI. Randurile astea sunt plasa:
  daca ii pune cineva la loc, nu se mai incarca. O regula tinuta intr-un singur loc
  nu se poate desparti de ea insasi.
*/
/** Caile pe care NU se incarca nimic de urmarire. Prefix sau potrivire exacta. */
export const CAI_FARA_URMARIRE = [
  "/blog/previzualizare",
  "/dashboard",
  "/admin",
  /*
    ⚠ SI DOUA ECRANE DIN `(auth)`, care par palnie de achizitie si nu sunt.

    Grupul `(auth)` isi pastreaza pixelii pe `/login`, `/register` si
    `/forgot-password`: acolo ajung oamenii din reclame, si tocmai pixelul aseaza
    `_fbc`/`_fbp` — fara ele, `sign_up`-ul de mai tarziu n-ar mai sti de la ce
    campanie a venit omul.

    Celelalte doua sunt insa ecrane cu SESIUNE VIE:
      - `/login/mfa` — se ajunge acolo numai dupa ce parola a fost primita;
      - `/reset-password` — linkul din email deschide o sesiune de recuperare,
        chiar de aceea middleware-ul ii face exceptie, si acolo omul TASTEAZA O
        PAROLA NOUA.

    Acelasi argument ca pentru previzualizarea de articol si pentru panou: cookie-ul
    Supabase nu e `httpOnly`, deci un script tert incarcat in pagina ruleaza cu
    drepturile ei. Iar in tot grupul `(auth)` nu se trage niciun eveniment din
    browser — deci nu se pierde nicio masuratoare, doar remarketingul.

    ⚠ CAT APARA, SPUS CINSTIT: se opreste INJECTAREA scriptului. Cine ajunge aici
    printr-o navigare de document — linkul din email, sau redirectarea serverului
    catre `/login/mfa` — e acoperit. Cine ar ajunge printr-o navigare de client
    dintr-o pagina unde scriptul s-a incarcat deja nu e: scriptul incarcat nu se
    descarca. Aceeasi margine ca peste tot in fisierul asta.
  */
  "/login/mfa",
  "/reset-password",
  /*
    ⚠ SI CELE DOUA PAGINI CARE POARTA UN JETON IN ADRESA.

    `/blog/confirma?t=…` si `/blog/dezabonare?t=…` sunt „pentru un singur om": `t`
    NU e un parametru de urmarire, e CHEIA de confirmare, respectiv de dezabonare.

    ⚠ SI DE CE NU E DE AJUNS `curataAdresa`. Ea taie sirul de interogare pentru
    tot ce trece prin magistrala NOASTRA — deci `page_view`-ul nostru e curat. Dar
    `fbevents.js`, `events.js` si eticheta Google isi trimit SINGURE vizualizarea
    de pagina, cu `location.href` intreg, si pe langa magistrala noastra nu trece
    nimic din ce fac ele. Jetonul pleca deci la trei furnizori, in clar.

    ⚠ CE SE PIERDE: nimic care sa se poata numara. Sunt pagini de un singur
    click, la capatul unui email — nu suprafata de achizitie.
  */
  "/blog/confirma",
  "/blog/dezabonare",
] as const;

/**
 * Calea asta trebuie tinuta curata de scripturi terte?
 *
 * `null` (calea inca nestiuta) da FALS: pe drumul obisnuit pathname-ul e gata la
 * prima randare, iar un adevarat aici ar stinge pixelii pe tot site-ul la fiecare
 * incarcare — adica ar repara confidentialitatea unui singur ecran stricand
 * masuratoarea intregului site, in tacere.
 */
export function faraUrmarire(cale: string | null | undefined): boolean {
  if (!cale) return false;
  /*
    ⚠ POTRIVIRE EXACTA SAU PE SEGMENT INTREG, nu `startsWith` gol. Cu prefixul
    scris fara bara la capat, un `startsWith` simplu ar fi stins urmarirea si pe
    `/dashboard-public` sau `/adminstratie` — cai care azi nu exista, dar care ar
    fi tacut daca ar aparea. Aceeasi forma ca la `faraPageView`, dinadins.
  */
  return CAI_FARA_URMARIRE.some((p) => cale === p || cale.startsWith(`${p}/`));
}

/*
  ═══════════════════════════════════════════════════════════════════════════════
  SUPRAFETELE PE CARE NU SE NUMARA PAGINI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ASTA E O REGULA DEOSEBITA DE CEA DE SUS, si de aceea nu e aceeasi lista.

  Cea de sus opreste SCRIPTURILE TERTE. Asta opreste doar `page_view`-ul NOSTRU,
  in timp ce pixelii au voie sa ruleze mai departe — asa a fost hotarat pentru
  panou pe 02.09.2026: se pastreaza retargetarea clientilor activi, dar traficul
  lor de lucru n-are ce cauta in rapoartele noastre de marketing.

  ═══ ⚠ CUM S-A VAZUT CA E NEVOIE ═══

  In raportul de admin, `/dashboard` aparea cu doua vizualizari. Layoutul
  panoului NU randeaza eticheta GA4 si nici runtime-ul, deci pareau imposibile.

  Masurat in browser: am schimbat istoricul catre o cale oarecare, fara sa ating
  altceva, si runtime-ul a trimis `page_view` pentru ea. El asculta ROUTERUL, nu
  intrebarea „am voie sa masor pagina asta". In clipa unei navigari, `usePathname`
  arata deja destinatia, iar efectul se aprinde inainte ca layoutul vechi sa se
  desprinda — deci masoara o pagina care nu e a lui.

  ⚠ SI NU E O CIUDATENIE DE COLT: orice drum din site catre panou trece pe aici.
  Doua vizualizari azi, pe un site cu trafic mic; pe unul cu trafic adevarat,
  raportul de pagini s-ar umple de ecrane de aplicatie.
*/

/** Prefixe de cale pe care `page_view` nu se trimite. Pixelii nu sunt atinsi. */
export const CAI_FARA_PAGE_VIEW = ["/dashboard", "/admin"] as const;

/**
 * Calea asta e o suprafata pe care NU o numaram in marketing?
 *
 * `null` da FALS, din acelasi motiv ca la regula de sus: o cale inca nestiuta
 * n-are voie sa stinga masuratoarea peste tot.
 */
export function faraPageView(cale: string | null | undefined): boolean {
  if (!cale) return false;
  return CAI_FARA_PAGE_VIEW.some(p => cale === p || cale.startsWith(`${p}/`));
}
