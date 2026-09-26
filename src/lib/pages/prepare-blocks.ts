import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { sanitizeEmbedHtml } from "@/lib/utils/sanitize-embed";
import type { Block, BlockStyle } from "@/lib/pages/blocks.types";
import { curataCulorile } from "@/lib/pages/culori";
import { cereIzolare } from "@/lib/pages/cod-personalizat";
import { CHEI_FONT_BLOC, esteFontPagina } from "@/lib/pages/fonturi";

/**
 * Server-only. Deep-sanitizes user HTML inside blocks before they reach the public
 * renderer (the trust boundary). Keeps the block components pure/presentational.
 *
 *  - text / columns rich text -> allowlist `sanitizeHtml`
 *  - html block:
 *      js present    -> left intact (rendered in an isolated sandbox iframe)
 *      orice altceva -> `sanitizeEmbedHtml` (allows layout markup + safe iframes)
 *
 * NU mai exista o cale „raw + aprobat de admin -> lasat neatins". Ea injecta HTML
 * si `<script>` nefiltrate direct in magazinul PUBLIC, iar poarta era
 * `users_profile.role` — coloana pe care, pana la migratia din 04.08.2026, orice
 * utilizator si-o putea scrie singur. Un singur UPDATE anula tot restul
 * arhitecturii de izolare (sandbox, liste albe, sanitize-html) si servea cod
 * arbitrar cumparatorilor, pe originea platformei, unde cookie-ul de sesiune
 * Supabase e citibil din JavaScript.
 *
 * Verificat inainte de stergere: zero blocuri cu `raw:true` in productie
 * (custom_pages.blocks si store_settings.page_content), deci nu se rupe nimic.
 * Codul personalizat ramane posibil — dar trece prin SandboxEmbed, intr-un
 * iframe fara `allow-same-origin`.
 */
export function prepareBlocksForPublic(blocks: Block[]): Block[] {
  return (blocks ?? []).map(prepareBlock);
}

/* Numai adrese web: imaginile ajung si in `url()` din CSS, nu doar in `src`. */
const doarWeb = (u?: string | null) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

/**
 * ⚠ CAMPURILE DIN 25.09.2026 (asezare, tipografie, harta) trec toate pe aici,
 * pe ORICE bloc: culorile prin lista alba (`curataCulorile`), imaginile de
 * fundal si pinul hartii numai `https:`, fonturile numai din lista cunoscuta.
 * Coloana e `jsonb`, iar proprietarul poate scrie in ea si direct, pe langa
 * editor, deci ce ajunge in `style` pe pagina publica se hotaraste aici.
 */
function curataComune(b: Block): Block {
  const r = curataCulorile(b as unknown as Record<string, unknown>) as unknown as Block;
  if (r.style) {
    const st = curataCulorile(r.style as unknown as Record<string, unknown>) as unknown as BlockStyle;
    r.style = { ...st, bgImage: doarWeb(st.bgImage) };
  }
  const o = r as unknown as Record<string, unknown>;
  for (const k of CHEI_FONT_BLOC) if (o[k] != null && !esteFontPagina(o[k])) o[k] = null;
  if (r.type === "hero") r.bgImage = doarWeb(r.bgImage);
  if (r.type === "trust") r.items = (r.items ?? []).map((it) => ({ ...it, image: doarWeb(it.image) }));
  if (r.type === "newsletter") r.image = doarWeb(r.image);
  if (r.type === "bundles") {
    // Data de sfarsit numai in forma campului din editor; altfel numaratoarea nu apare.
    if (r.countdownEnd && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.countdownEnd)) r.countdownEnd = null;
    if (r.descrieri && typeof r.descrieri === "object") {
      r.descrieri = Object.fromEntries(Object.entries(r.descrieri).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v.slice(0, 300)]));
    }
  }
  return r;
}

/**
 * Pentru EDITOR (26.09.2026, auditul de securitate): numai HTML-ul bogat (text si
 * coloane clasice) trece prin `sanitizeHtml`, restul blocului ramane cum e (se
 * salveaza inapoi). Editorul randa `blocks` direct din baza, iar proprietarul le
 * poate scrie direct prin PostgREST: un `<img onerror>` rula pe originea panoului.
 */
export function curataHtmlPentruEditor(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.type === "text") return { ...b, html: sanitizeHtml(b.html) };
    if (b.type === "columns") {
      return {
        ...b,
        items: (b.items ?? []).map((it) => ({
          ...it,
          html: it.html ? sanitizeHtml(it.html) : it.html,
          blocks: Array.isArray(it.blocks) ? curataHtmlPentruEditor(it.blocks) : it.blocks,
        })),
      };
    }
    return b;
  });
}

/*
  „Titlu mare” din editorul de text scrie `<h1>` (editorul e comun cu produsele si
  blogul, deci ramane asa). Pe pagina, H1 e unul singur si il alege
  `titlulPrincipal`: un hero plus un text cu „Titlu mare” dadeau doua H1. Aici
  `<h1>` devine `<h2 data-h1>`, iar `stil-comun.css` ii pastreaza marimea.
*/
export function coboaraH1(html: string): string {
  return html.replace(/<h1(?=[\s>])/gi, '<h2 data-h1=""').replace(/<\/h1\s*>/gi, "</h2>");
}

function prepareBlock(brut: Block): Block {
  const b = curataComune(brut);
  switch (b.type) {
    case "text":
      return { ...b, html: coboaraH1(sanitizeHtml(b.html)) };
    case "columns":
      return {
        ...b,
        items: (b.items ?? []).map((it) => ({
          ...it,
          html: it.html ? coboaraH1(sanitizeHtml(it.html)) : it.html,
          // Recurse: nested blocks (text/html/video/…) must be sanitized too.
          blocks: Array.isArray(it.blocks) ? it.blocks.map(prepareBlock) : it.blocks,
        })),
      };
    case "html": {
      // Codul cu JS merge in sandbox (iframe fara allow-same-origin), deci poate
      // ramane neatins. Orice altceva se igienizeaza, INDIFERENT de `raw` /
      // `rawApprovedBy`: steagurile acelea nu mai deschid nicio portita.
      /* ⚠ Aceeasi regula ca `HtmlBlockView`: codul activ (JS, `<script>`, formulare)
         merge in cadrul izolat, deci ramane intreg; curatat, widgetul lipit nu mergea. */
      if (cereIzolare(b.html, b.js)) return b;
      return { ...b, raw: false, rawApprovedBy: null, html: sanitizeEmbedHtml(b.html) };
    }
    case "video": {
      // Uploaded video/poster URLs come from our own R2 upload flow; still pin
      // them to http(s) so a hand-crafted block can't smuggle another scheme.
      const safeUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);
      return { ...b, src: safeUrl(b.src), poster: safeUrl(b.poster) };
    }
    default:
      return b;
  }
}
