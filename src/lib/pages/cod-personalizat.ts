/*
  ═══════════════════════════════════════════════════════════════════════════
  BLOCUL DE COD PERSONALIZAT: UNDE RULEAZA SI CUM I SE ÎNCHIDE CSS-UL (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Doua regimuri, hotarate de O SINGURA functie (`cereIzolare`), chemata si pe
  server (`prepareBlocksForPublic`), si la randare, si in editor:

   - IZOLAT: cadru `srcdoc` cu `sandbox` fara `allow-same-origin` (SandboxEmbed).
     Pentru orice cod care face ceva: JavaScript, `<script>`, formulare,
     campuri, `on...=`. Pana acum, un cod de widget lipit in campul HTML (cu
     `<script>` in el) se curata TACUT si widgetul nu mergea deloc.
   - IN PAGINA: HTML curatat pe lista alba, iar CSS-ul lui inchis in bloc
     (`inchideCss`). Pana acum `.titlu { ... }` din bloc schimba si titlurile
     magazinului, antetul, cosul.

  Masurat pe productie: 2 blocuri de cod, fara CSS, fara `<script>`, fara
  formulare, deci regimul lor nu se schimba.
*/

const ACTIV = /<\s*(script|form|input|select|textarea|object|embed)\b|\son[a-z]+\s*=/i;

/** Blocul are nevoie de cadru izolat (ruleaza cod sau trimite date). */
export function cereIzolare(html?: string | null, js?: string | null): boolean {
  return !!(js ?? "").trim() || ACTIV.test(html ?? "");
}

/* Regulile care nu au voie sa stea intr-o regula imbricata raman la nivelul de sus. */
const DE_SUS = /^@(-webkit-)?keyframes\b|^@font-face\b|^@import\b|^@charset\b|^@property\b|^@layer\s+[^{]*;?$/i;

/**
 * Inchide CSS-ul sub `selector` prin imbricare CSS nativa (`sel { ... }`), pe
 * care o au toate browserele de azi. `@keyframes`, `@font-face` si ce mai nu
 * poate fi imbricat raman afara, altfel s-ar fi pierdut. Regulile pentru
 * `html`/`body`/`:root` se indreapta spre bloc, nu spre pagina.
 */
export function inchideCss(css: string | null | undefined, selector: string): string {
  const text = (css ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (!text.trim()) return "";
  const afara: string[] = [];
  const inauntru: string[] = [];
  let adancime = 0;
  let inceput = 0;
  let sir: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (sir) { if (c === "\\") { i++; continue; } if (c === sir) sir = null; continue; }
    if (c === "\"" || c === "'") { sir = c; continue; }
    if (c === "{") adancime++;
    else if (c === "}") {
      adancime = Math.max(0, adancime - 1);
      if (adancime === 0) {
        const bucata = text.slice(inceput, i + 1).trim();
        (DE_SUS.test(bucata) ? afara : inauntru).push(bucata);
        inceput = i + 1;
      }
    } else if (c === ";" && adancime === 0) {
      const bucata = text.slice(inceput, i + 1).trim();
      if (bucata && DE_SUS.test(bucata)) afara.push(bucata);
      inceput = i + 1;
    }
  }
  const corp = inauntru
    .map((r) => r.replace(/(^|,)\s*(html|body|:root)\b/gi, "$1 &"))
    .join("\n");
  return [...afara, corp ? `${selector} {\n${corp}\n}` : ""].filter(Boolean).join("\n");
}
