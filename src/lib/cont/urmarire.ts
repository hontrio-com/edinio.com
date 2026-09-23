import { NUME_CURIER, type CurierPropriu } from "@/lib/orders/awb-propriu";
import { stripDiacritics } from "@/lib/utils/ro-address";

/**
 * Unde isi urmareste cumparatorul coletul.
 *
 * ⚠⚠ NICIO ADRESA INVENTATA. Tiparele de mai jos sunt EXACT cele pe care panoul
 * comerciantului le deschide deja din modalele de AWB (FanCourierAwbModal,
 * CargusAwbModal, SamedayAwbModal; DPD e compus si in baza). Pentru curierii care
 * nu dau un link public pe care sa-l fi folosit deja cineva, ecranul arata numarul
 * AWB si atat: un buton care duce la o pagina gresita e mai rau decat lipsa lui.
 *
 * ⚠ O adresa SALVATA de curier (DHL, FedEx, UPS, Innoship, Shipo, SmartShip) vine
 * dintr-un raspuns de API, deci trece printr-o garda: numai `https:`. Un
 * `javascript:` sau un `http:` intr-un `href` pe pagina cumparatorului ar fi o usa
 * pe care n-am deschis-o noi.
 */

const TIPARE: Partial<Record<CurierPropriu, (awb: string) => string>> = {
  fancourier: (awb) => `https://www.fancourier.ro/awb-tracking/?tracking=${encodeURIComponent(awb)}`,
  cargus: (awb) => `https://www.cargus.ro/personal/urmareste-coletul/?tracking_number=${encodeURIComponent(awb)}`,
  sameday: (awb) => `https://sameday.ro/#awb=${encodeURIComponent(awb)}`,
  dpd: (awb) => `https://tracking.dpd.ro/?shipmentNumber=${encodeURIComponent(awb)}`,
};

/** O adresa venita de la curier, numai daca e `https:` si se poate citi. */
function adresaSigura(brut: string | null | undefined): string | null {
  if (!brut) return null;
  try {
    const u = new URL(brut.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function adresaDeUrmarire(
  curier: string | null | undefined,
  awb: string | null | undefined,
  urlSalvat: string | null | undefined,
): string | null {
  const salvata = adresaSigura(urlSalvat);
  if (salvata) return salvata;
  const numar = (awb ?? "").trim();
  if (!curier || !numar) return null;
  const tipar = TIPARE[curier as CurierPropriu];
  return tipar ? tipar(numar) : null;
}

/**
 * Numele curierului pentru cumparator.
 *
 * ⚠ Trece prin `stripDiacritics`: harta e scrisa pentru PANOU („Poșta Română"),
 * iar ecranele contului se scriu fara (H6).
 */
export function numeleCurierului(curier: string | null | undefined): string | null {
  if (!curier) return null;
  return stripDiacritics(NUME_CURIER[curier as CurierPropriu] ?? curier);
}
