import { despartaLocalitateaDeCod } from "@/lib/ro/judete";
import { eroareNesigura } from "@/lib/operatii/eroare-furnizor";
import type { TaraMyGls } from "./client";

/**
 * Punctele de ridicare GLS (ParcelShop si Parcel Locker).
 *
 * ═══ ⚠ DE CE NU DIN API-UL MyGLS ═══
 *
 * `GetDeliveryPoints` chiar exista, dar NU pe `ParcelService.svc` — e pe
 * `MasterDataService.svc`, si asta e prima capcana (WSDL-ul lui ParcelService are
 * 29 de operatii si NICIUNA nu da puncte de ridicare).
 *
 * A doua capcana e mai serioasa: metoda **nu raspunde**. Sondata pe fir, si pe
 * `api.mygls.ro` si pe `api.test.mygls.ro`, inchide conexiunea fara niciun octet
 * — in timp ce `ParcelService.svc/json/GetParcelStatuses`, de pe acelasi domeniu
 * si in acelasi moment, raspunde cum trebuie. Deci nu e nici reteaua, nici
 * mediul. Nu stim daca ruta `/json/` a lui MasterDataService e oprita, daca e un
 * filtru, sau daca serviciul cere un drept pe care contractul nu-l are.
 *
 * ═══ DE UNDE SE IAU, ATUNCI ═══
 *
 * Din fisierul public pe care il foloseste chiar harta oficiala GLS — aceeasi pe
 * care o incorporeaza in checkout si pluginul lor de WooCommerce:
 *
 *     https://map.gls-romania.com/data/deliveryPoints/ro.json
 *
 * Fara autentificare, cu CORS deschis, improspatat des. Verificat: 2833 de
 * puncte pentru Romania, 1750 lockere si 1083 magazine.
 *
 * ⚠ **`id`-ul de aici e EXACT sirul care merge in `PSDParameter.StringValue`.**
 * Nu e o presupunere: exemplul din documentatia MyGLS pentru serviciul PSD e
 * „2351-CSOMAGPONT", iar sirul exista verbatim ca `items[].id` in fisierul public
 * al Ungariei. De aceea `id`-ul se trateaza ca OPAC: nu se taie, nu se
 * normalizeaza, nu se reconstruieste. Formatul obisnuit e `RO` + cod postal +
 * `-` + tip (`RO011857-PARCELSH01`), dar exista si exceptii — 4 puncte cu cinci
 * cifre si 2 fara prefixul `RO` deloc.
 *
 * ═══ ⚠ CE NU SE POATE STI DE AICI ═══
 *
 * Fisierul romanesc NU spune daca un punct accepta RAMBURS sau card. Vocabularul
 * lui `features` are doar `acceptsOnline`, `pickup`, `delivery` si
 * `wheelchairAccess`; `acceptsCash`/`acceptsCard` apar in fisierul unguresc, iar
 * campurile `CodHandler`/`CardPaymentAllowed` exista doar in raspunsul metodei de
 * API care nu raspunde. Deci un cumparator care plateste ramburs poate alege un
 * punct care nu incaseaza — GLS va refuza expedierea, la emiterea AWB-ului.
 */

/**
 * ⚠ Gazda hartii, una singura pentru toate tarile.
 *
 * `map.gls-romania.com`, `map.gls-hungary.com` si `map.gls-croatia.com` servesc
 * fisiere IDENTICE pentru orice tara — verificat. Tinem una singura ca sa nu
 * existe sapte adrese care se pot desincroniza.
 */
const GAZDA_HARTA = "https://map.gls-romania.com";

/**
 * ⚠ Codul de tara intra cu LITERE MICI. `RO.json` da 404, `ro.json` merge.
 *
 * Si fisierul e cel „activ": exista si `ro-all.json`, cu aproape dublu (5561 fata
 * de 2833), dar acolo intra si punctele pe care GLS le tine inchise. Un punct
 * inchis oferit in checkout inseamna un colet care nu ajunge nicaieri.
 */
function urlPuncte(tara: TaraMyGls): string {
  return `${GAZDA_HARTA}/data/deliveryPoints/${tara.toLowerCase()}.json`;
}

/** Cat asteptam. Scurt: e o lista pentru checkout, nu o expediere. */
const ASTEPTARE_MS = 10_000;

export type PunctGls = {
  /** ⚠ OPAC. Merge neatins in `PSDParameter.StringValue`. */
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  lat: number;
  lng: number;
  tip: "locker" | "shop";
};

/** Forma reala a unui element din fisierul public, verificata pe fir. */
type PunctBrut = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  lockerSaturation?: unknown;
  features?: unknown;
  contact?: { countryCode?: unknown; postalCode?: unknown; city?: unknown; address?: unknown };
  /** ⚠ Tablou `[lat, lng]`, NU doua campuri separate. */
  location?: unknown;
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Un element brut → `PunctGls`, sau `null` daca nu e bun de oferit.
 *
 * Se scot:
 *   - punctele fara `id` (fara el n-avem ce trimite la GLS);
 *   - `lockerSaturation: "outOfOrder"` — 59 in Romania. Oferit clientului, e un
 *     locker mort: comanda pleaca si coletul n-are unde sa intre;
 *   - cele care nu au `delivery` intre `features`, adica nu primesc colete.
 */
export function punctDinBrut(brut: PunctBrut): PunctGls | null {
  const id = text(brut.id);
  if (!id) return null;

  if (text(brut.lockerSaturation) === "outOfOrder") return null;

  const features = Array.isArray(brut.features) ? brut.features.map(text) : [];
  if (features.length > 0 && !features.includes("delivery")) return null;

  const loc = Array.isArray(brut.location) ? brut.location : [];
  const lat = Number(loc[0]);
  const lng = Number(loc[1]);

  /* „Brasov BV" → localitatea „Brasov", judetul „Brasov". Judetul nu e altundeva. */
  const { localitate, judet } = despartaLocalitateaDeCod(text(brut.contact?.city));

  return {
    id,
    name: text(brut.name) || id,
    address: text(brut.contact?.address),
    city: localitate,
    county: judet,
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    tip: text(brut.type) === "parcel-locker" ? "locker" : "shop",
  };
}

/**
 * Punctele dintr-o tara, gata de aratat in checkout.
 *
 * ⚠ Nu cere datele de acces MyGLS: fisierul e public. Ramane totusi o citire de
 * retea, deci se cheama din spatele cache-ului din `getLockers`, nu la fiecare
 * tastare in campul de oras.
 */
export async function puncteGls(tara: TaraMyGls): Promise<PunctGls[]> {
  let res: Response;
  try {
    res = await fetch(urlPuncte(tara), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareNesigura(`GLS puncte: ${(e as Error).message}`);
  }

  if (!res.ok) throw eroareNesigura(`GLS puncte: ${res.status}`);

  const date = (await res.json()) as { items?: unknown };
  /*
   * ⚠ Radacina e un OBIECT cu cheia `items`, nu un tablou. Citita ca tablou,
   * lista ar iesi goala — si o lista goala nu produce nicio eroare nicaieri, doar
   * un checkout in care nu se poate alege niciun punct.
   */
  const items = Array.isArray(date.items) ? date.items : [];
  return items
    .map((b) => punctDinBrut(b as PunctBrut))
    .filter((p): p is PunctGls => p !== null);
}
