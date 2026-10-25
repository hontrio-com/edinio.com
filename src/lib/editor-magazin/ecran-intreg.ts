/**
 * Adresele pe care editorul magazinului ia tot ecranul, fara cadrul panoului (bara laterala,
 * bannerele, bara de sus, meniul de jos). Cerut de proprietar pe 25.10.2026, ca la Shopify:
 * „nu trebuie sa mai apara nici Sidebar, nici Topbar, sa fie intreaga pagina asta cu editarea”.
 *
 * Doar editorul: Biblioteca Media (`/dashboard/editor/media`) e o pagina obisnuita a panoului si
 * isi pastreaza cadrul. Vezi `CadruPanou`.
 */
export function esteEcranIntreg(cale: string | null): boolean {
  return cale === "/dashboard/editor" || cale === "/dashboard/editor/";
}
