// Stable per-browser cart session id, used to tie an in-progress cart to a later
// order for abandoned-cart recovery. One id per store slug, persisted in
// localStorage. Safe to call on the server (returns "" — no capture happens).

export function getCartSessionId(slug: string): string {
  if (typeof window === "undefined") return "";
  const key = `edinio_cart_session_${slug}`;
  try {
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "";
  }
}
