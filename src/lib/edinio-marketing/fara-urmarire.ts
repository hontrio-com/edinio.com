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

/** Caile pe care NU se incarca nimic de urmarire. Prefixe, nu potriviri exacte. */
export const CAI_FARA_URMARIRE = [
  "/blog/previzualizare/",
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
  return CAI_FARA_URMARIRE.some((prefix) => cale.startsWith(prefix));
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
