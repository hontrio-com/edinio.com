import sanitizeHtmlLib from "sanitize-html";

/**
 * Allowlist HTML sanitizer for rich-text content produced by the TipTap editor.
 *
 * Server-only (uses the `sanitize-html` package). Everything not explicitly
 * allowed is removed, which neutralises <script>/<style>/<iframe>, event-handler
 * attributes, and javascript:/data: URLs — a default-deny model, unlike a regex
 * blocklist. The allowlist mirrors the editor's capabilities (basic formatting,
 * headings, lists, blockquote, code, links, text alignment).
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtmlLib(html, {
    allowedTags: [
      "p", "br", "span", "div",
      "strong", "b", "em", "i", "u", "s", "strike", "del", "mark", "sub", "sup",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "code", "pre", "hr",
      "a",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
      },
    },
    // Only safe URL schemes; blocks javascript:, data:, vbscript:, etc.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"] },
    disallowedTagsMode: "discard",
    // Harden outbound links and prevent reverse-tabnabbing.
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
    },
  });
}
