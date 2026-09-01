/*
  ═══════════════════════════════════════════════════════════════════════════════
  MARKETINGUL COMERCIANTULUI — PARTEA FARA RUNTIME
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E DESPARTIT DE `marketing.ts`. Fisierul acela are un EFECT LA INCARCARE:
  un IIFE care instaleaza `window.__edinioFlushQueue`. Deci oriunde e importat,
  fie si numai pentru un parser, se evalueaza tot runtime-ul de urmarire al
  comerciantului — coada, trackerele, tot.

  Iar doua ecrane din PANOU faceau exact asta: `FacebookPixelConfigClient` si
  `TikTokPixelConfigClient` importau `parseMetaPixelId`/`parseTikTokPixelId` (doua
  functii curate) si trageau dupa ele intreg runtime-ul — intr-un document in care
  ruleaza pixelii NOSTRI, ai platformei.

  ⚠ CE NU S-A INTAMPLAT, SI DE CE CONTA TOTUSI. Niciun eveniment n-a plecat gresit:
  nimeni nu cheama un tracker din panou. Dar `ready("fb")` din runtime se uita la
  `typeof window.fbq === "function"`, iar pe ecranele acelea `window.fbq` e al
  NOSTRU. In ziua in care cineva ar fi scris `fbTrack(...)` intr-o componenta de
  panou — un lucru pe care nimic nu-l oprea — evenimentul ar fi plecat tacut in
  contul Meta al Edinio, sub numele unui comerciant.

  Aici sunt numai lucruri fara efecte: forma configuratiei, analizoarele de id si
  normalizarea datelor pentru potrivire. Se pot importa de oriunde, inclusiv de pe
  server la salvare, fara sa aduca nimic cu ele.
*/

export type MarketingConfig = {
  facebook_pixel_id?: string;
  tiktok_pixel_id?: string;
  google_tag_id?: string;
  google_ads_conversion_label?: string; // e.g. "abc123XYZ" — needed for Purchase conversion tracking in Google Ads
};

// ─────────────────────────────────────────────────────────────────────────
// ID parsing & validation (isomorphic — also used server-side on save).
// Merchants frequently paste the ENTIRE base-code snippet instead of the bare
// ID, so we extract the ID from a known snippet shape before validating.
// Validation is also a security control: the raw value is interpolated into an
// inline <script> on the storefront (shared edinio.com origin), so an
// unsanitized value would be a stored-XSS / cross-tenant vector.
// ─────────────────────────────────────────────────────────────────────────

/** Meta/Facebook pixel ID — 15–16 digit numeric (accept 5–20 for safety). */
export function parseMetaPixelId(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{5,20})['"]/);
  const c = (m ? m[1] : raw).trim();
  return /^\d{5,20}$/.test(c) ? c : null;
}

/** TikTok pixel ID — alphanumeric, typically 20 chars (e.g. "C4ABCDEF..."). */
export function parseTikTokPixelId(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/ttq\.load\(\s*['"]([A-Za-z0-9]{6,40})['"]/);
  const c = (m ? m[1] : raw).trim();
  return /^[A-Za-z0-9]{6,40}$/.test(c) ? c : null;
}

/** Google tag ID — GA4 (G-…), Google Ads (AW-…) or Google Tag (GT-…). */
export function parseGoogleTagId(raw?: string | null): string | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  return /^(G|AW|GT)-[A-Z0-9]{4,20}$/.test(c) ? c : null;
}

/** Google Ads conversion label — bare label or full "AW-123/Label" send_to. */
export function parseGoogleAdsLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const c = raw.trim();
  const label = c.includes("/") ? (c.split("/").pop() ?? "") : c;
  return /^[A-Za-z0-9_-]{3,40}$/.test(label) ? label : null;
}

/** Last-resort sanitizer for values that reach an inline script (defense-in-depth). */
export function sanitizePixelId(raw?: string | null): string {
  return (raw ?? "").replace(/[^A-Za-z0-9_-]/g, "");
}

// ─────────────────────────────────────────────────────────────────────────
// PII normalization for Advanced Matching. The browser pixels hash values with
// SHA-256 themselves; we only need to NORMALIZE first (lowercase/trim email,
// E.164-ish phone) so the hash matches what the ad platform computes.
// ─────────────────────────────────────────────────────────────────────────

export type PixelUser = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null; // ISO-2, defaults to RO
};

export function normalizeEmail(email?: string | null): string | undefined {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : undefined;
}

/** Digits-only phone with country code, no "+" (Meta format). RO-aware. */
export function normalizePhone(phone?: string | null, country = "RO"): string | undefined {
  let d = (phone ?? "").replace(/\D/g, "");
  if (!d) return undefined;
  if ((country || "RO").toUpperCase() === "RO") {
    if (d.startsWith("0040")) d = d.slice(2);
    else if (d.startsWith("40")) { /* already prefixed */ }
    else if (d.startsWith("0")) d = "40" + d.slice(1);
    else if (d.length === 9) d = "40" + d; // "7xxxxxxxx" without leading 0
  }
  return d.length >= 8 ? d : undefined;
}

export function normalizeName(name?: string | null): string | undefined {
  const n = (name ?? "").trim().toLowerCase();
  return n || undefined;
}

/** Split a full name into first/last for Advanced Matching. */
export function splitName(full?: string | null): { firstName?: string; lastName?: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
