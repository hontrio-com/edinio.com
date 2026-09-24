/**
 * E calea asta in zona de cont? `/cont...` pe domeniul propriu, `/{slug}/cont...`
 * pe gazda platformei (acolo zona da oricum 404, dar regula nu se sprijina pe asta).
 *
 * ⚠ ANCORATA la inceputul caii: prima scriere prindea orice segment `cont`, deci
 * si un produs sau o pagina numita asa, unde pixelii ar fi disparut degeaba.
 */
export function eZonaDeCont(cale: string, slug: string): boolean {
  return ["/cont", `/${slug}/cont`].some((z) => cale === z || cale.startsWith(`${z}/`));
}
