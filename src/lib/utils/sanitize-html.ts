/**
 * Lightweight HTML sanitizer for rich-text content from TipTap editor.
 * Strips <script>, <iframe>, event handlers (onerror, onclick, etc.),
 * javascript: URLs, and data: URLs in attributes.
 */
export function sanitizeHtml(html: string): string {
  return html
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove iframe, object, embed, form tags
    .replace(/<\s*\/?\s*(iframe|object|embed|form)\b[^>]*>/gi, "")
    // Remove event handler attributes (on*)
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Remove javascript: and data: in href/src attributes
    .replace(/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "$1=\"\"")
    .replace(/(href|src|action)\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, "$1=\"\"");
}
