import sanitizeHtmlLib from "sanitize-html";

/**
 * Permissive-but-safe sanitizer for the custom-code block in its CLIENT (no-JS)
 * mode, and for embed-like HTML. Compared to `sanitizeHtml` (rich text), this
 * additionally allows layout markup, `class`/`id`/`style`, `<style>` blocks and
 * `<iframe>` — but ONLY from an allowlist of trusted embed hosts.
 *
 * Still default-deny: `<script>`, `on*` handlers, `javascript:`/`vbscript:` URLs
 * are removed. Arbitrary JavaScript must go through the sandboxed <iframe srcdoc>
 * path (SandboxEmbed), never through this function.
 *
 * Server-only (the `sanitize-html` package pulls in Node deps).
 */

const IFRAME_HOST_ALLOWLIST = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.vimeo.com",
  "www.google.com",
  "maps.google.com",
  "www.openstreetmap.org",
  "open.spotify.com",
  "w.soundcloud.com",
];

export function sanitizeEmbedHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtmlLib(html, {
    allowedTags: [
      "p", "br", "span", "div", "section", "article", "header", "footer", "main", "aside", "nav",
      "strong", "b", "em", "i", "u", "s", "strike", "del", "mark", "sub", "sup", "small", "abbr",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "code", "pre", "hr",
      "a", "img", "figure", "figcaption", "picture", "source",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
      "iframe", "style", "button", "label", "dl", "dt", "dd",
    ],
    allowedAttributes: {
      "*": ["style", "class", "id", "title", "aria-label", "aria-hidden", "role", "data-*"],
      a: ["href", "target", "rel", "name"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
      source: ["src", "srcset", "type", "media", "sizes"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "loading", "title", "frameborder", "referrerpolicy", "style"],
      table: ["border", "cellpadding", "cellspacing"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      col: ["span", "width"],
      colgroup: ["span"],
    },
    // We deliberately allow <style> blocks for custom layout; acknowledge the risk.
    allowVulnerableTags: true,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto", "tel"],
      img: ["http", "https", "data"],
      iframe: ["https"],
    },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowedIframeHostnames: IFRAME_HOST_ALLOWLIST,
    allowIframeRelativeUrls: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
    },
  });
}
