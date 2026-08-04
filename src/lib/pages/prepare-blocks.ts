import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { sanitizeEmbedHtml } from "@/lib/utils/sanitize-embed";
import type { Block } from "@/lib/pages/blocks.types";

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

function prepareBlock(b: Block): Block {
  switch (b.type) {
    case "text":
      return { ...b, html: sanitizeHtml(b.html) };
    case "columns":
      return {
        ...b,
        items: (b.items ?? []).map((it) => ({
          ...it,
          html: it.html ? sanitizeHtml(it.html) : it.html,
          // Recurse: nested blocks (text/html/video/…) must be sanitized too.
          blocks: Array.isArray(it.blocks) ? it.blocks.map(prepareBlock) : it.blocks,
        })),
      };
    case "html": {
      // Codul cu JS merge in sandbox (iframe fara allow-same-origin), deci poate
      // ramane neatins. Orice altceva se igienizeaza, INDIFERENT de `raw` /
      // `rawApprovedBy`: steagurile acelea nu mai deschid nicio portita.
      if ((b.js ?? "").trim()) return b;
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
