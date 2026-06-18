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

// Netopia serves its "Identitate Vizuala" badge from its own domains. We match by
// domain (subdomains included) so we don't have to guess the exact host the embed
// generator uses, while still allowing ONLY Netopia.
const NETOPIA_IFRAME_DOMAINS = ["netopia-payments.com", "netopia.ro", "mobilpay.ro"];

/**
 * Sanitizer for the Netopia visual-identity badge the merchant pastes in the
 * Netopia integration page. Allows ONLY an <iframe> (with a small set of layout
 * wrappers) from a Netopia domain — the official badge is an iframe embed. Scripts,
 * event handlers and any non-Netopia host are stripped, so a pasted snippet can
 * never inject arbitrary content into the public storefront footer.
 *
 * Server-only (pulls in the Node `sanitize-html` package).
 */
export function sanitizeNetopiaBadge(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtmlLib(html, {
    allowedTags: ["iframe", "a", "div", "span", "img", "picture", "source"],
    allowedAttributes: {
      "*": ["style", "class", "title", "aria-label"],
      a: ["href", "target", "rel"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
      source: ["src", "srcset", "type", "media", "sizes"],
      iframe: ["src", "width", "height", "style", "frameborder", "scrolling", "allow", "allowfullscreen", "loading", "title", "referrerpolicy"],
    },
    allowedSchemes: ["https"],
    allowedSchemesByTag: { a: ["https"], img: ["https"], iframe: ["https"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowedIframeDomains: NETOPIA_IFRAME_DOMAINS,
    allowIframeRelativeUrls: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}

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
