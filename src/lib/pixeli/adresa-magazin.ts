/*
  ═══════════════════════════════════════════════════════════════════════════════
  PAGINA E A ACESTUI MAGAZIN?
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ COMUNA CELOR DOUA CAPETE PUBLICE (Meta si TikTok). Amandoua primesc adresa paginii din corpul cererii,
  iar fara verificarea asta un magazin ar putea primi evenimente pretinse de pe alt site. Doua copii ale
  regulii s-ar fi despartit la prima schimbare, iar una din ele ar fi ramas mai slaba.
*/

/**
 * Pagina e a acestui magazin? Pe domeniul propriu (si geamanul `www.`), sau pe platforma sub `/<slug>`.
 */
export function adresaEAMagazinului(adresa: string, magazin: { slug: string; custom_domain: string | null }, gazdaPlatformei: string): boolean {
  let u: URL;
  try { u = new URL(adresa); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const gazda = u.hostname.toLowerCase();
  const domeniu = (magazin.custom_domain ?? "").toLowerCase().replace(/^www\./, "");
  if (domeniu && (gazda === domeniu || gazda === `www.${domeniu}`)) return true;
  return gazda === gazdaPlatformei && (u.pathname === `/${magazin.slug}` || u.pathname.startsWith(`/${magazin.slug}/`));
}
