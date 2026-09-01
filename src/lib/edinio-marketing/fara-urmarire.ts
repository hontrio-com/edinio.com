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
