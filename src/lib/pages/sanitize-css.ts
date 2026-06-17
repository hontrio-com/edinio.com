/**
 * Neutralize attempts to break out of a `<style>` element when CSS is injected
 * via dangerouslySetInnerHTML (e.g. `</style><img src=x onerror=alert(1)>`).
 *
 * React does NOT escape dangerouslySetInnerHTML, and on SSR the string is placed
 * literally inside `<style>…</style>`, so a stray `</style>` would terminate the
 * tag and let following markup execute. Stripping the tag-open sequences makes
 * the payload inert (CSS itself cannot run JS in modern browsers). Pure module —
 * safe to import in client components.
 */
export function sanitizeCss(css?: string | null): string {
  if (!css) return "";
  return css.replace(/<\/?\s*(style|script|iframe|object|embed|!--|!doctype)\b/gi, "");
}
