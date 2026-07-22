import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { sanitizeEmbedHtml } from "@/lib/utils/sanitize-embed";
import type { Block } from "@/lib/pages/blocks.types";

/**
 * Server-only. Deep-sanitizes user HTML inside blocks before they reach the public
 * renderer (the trust boundary). Keeps the block components pure/presentational.
 *
 *  - text / columns rich text -> allowlist `sanitizeHtml`
 *  - html block:
 *      raw + approved (admin) -> left intact (admin-trusted, injected directly)
 *      js present             -> left intact (rendered in an isolated sandbox iframe)
 *      safe HTML/CSS          -> `sanitizeEmbedHtml` (allows layout markup + safe iframes)
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
      if (b.raw && b.rawApprovedBy) return b;
      if ((b.js ?? "").trim()) return b;
      return { ...b, html: sanitizeEmbedHtml(b.html) };
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
