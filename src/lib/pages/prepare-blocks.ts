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
  return blocks.map((b) => {
    switch (b.type) {
      case "text":
        return { ...b, html: sanitizeHtml(b.html) };
      case "columns":
        return {
          ...b,
          items: (b.items ?? []).map((it) => ({ ...it, html: it.html ? sanitizeHtml(it.html) : it.html })),
        };
      case "html": {
        if (b.raw && b.rawApprovedBy) return b;
        if ((b.js ?? "").trim()) return b;
        return { ...b, html: sanitizeEmbedHtml(b.html) };
      }
      default:
        return b;
    }
  });
}
