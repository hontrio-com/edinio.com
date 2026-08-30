import { despartaLocalitateaDeCod, judetDupaCodAuto } from "@/lib/ro/judete";
import { eroareNesigura } from "@/lib/operatii/eroare-furnizor";
import { CacheScurt } from "@/lib/utils/cache-scurt";
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
  /**
   * ⚠ Codul postal al PUNCTULUI, si nu e un amanunt de afisare.
   *
   * `ZipCode` e camp REQUIRED in clasa `Address` a MyGLS, iar comenzile din
   * Romania nu primesc cod postal din checkout (campul se arata doar la livrarea
   * internationala). La livrarea in punct insa adresa de livrare E a punctului —
   * checkout-ul ii scrie deja strada si orasul in comanda — deci codul lui postal
   * e chiar raspunsul corect, si il avem aici pe gratis.
   */
  codPostal: string;
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

  /*
   * ⚠ Si sufixul lipit cu CRATIMA, pe care GLS il pune ca sa dezambiguizeze
   * omonimele: „Navodari-CT CT", „Tecuci-GL GL", „Bals-OT OT".
   *
   * `despartaLocalitateaDeCod` taie doar ce e dupa ultimul SPATIU, deci ramanea
   * „Navodari-CT" ca nume de localitate. 60 de localitati (136 de puncte) nu se
   * potriveau niciodata cu ce scrie cumparatorul — si tocmai in orasele in care
   * GLS are cea mai buna acoperire.
   */
  const cuCratima = /^(.*)-([A-Z]{1,2})$/.exec(localitate);
  const judetDinSufix = cuCratima ? judetDupaCodAuto(cuCratima[2]) : null;
  const localitateCurata = judetDinSufix ? cuCratima![1] : localitate;

  return {
    id,
    name: text(brut.name) || id,
    address: text(brut.contact?.address),
    city: localitateCurata,
    county: judet || judetDinSufix || "",
    codPostal: text(brut.contact?.postalCode),
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
/**
 * Codul postal al unei localitati, luat din punctele GLS din ea.
 *
 * ═══ ⚠ DE CE EXISTA ═══
 *
 * `ZipCode` e camp REQUIRED la MyGLS, iar comenzile din Romania NU au cod postal:
 * checkout-ul arata campul doar la livrarea internationala. Masurat pe productie
 * la 14.08.2026: din 137 de comenzi romanesti din ultimele 90 de zile, ZERO
 * aveau cod postal.
 *
 * Deci alegerea reala nu e „cod postal exact sau aproximativ", ci „ceva sau
 * NIMIC". Un camp obligatoriu lasat gol se intoarce ca refuz (Appendix A, 13,
 * „Parcel validation issue") — un mesaj care nu numeste niciun camp.
 *
 * Sursa e cea mai potrivita cu putinta: fisierul de puncte al LUI GLS. Codul
 * postal al unui punct din acelasi oras e un cod pe care reteaua lor il cunoaste
 * si il ruteaza. Nu e cel al strazii clientului, si nici nu se pretinde a fi:
 * adresa scrisa pe eticheta ramane cea adevarata, iar comerciantul poate pune
 * codul exact in formular oricand.
 *
 * ⚠ Se intoarce si `aproximativ`, ca apelantul sa poata SPUNE ca a completat el.
 * Un camp completat pe tacute e felul de ajutor care se descopera tarziu si prost.
 */
export async function codPostalOras(
  tara: TaraMyGls,
  oras: string,
  /**
   * ⚠ JUDETUL NU E OPTIONAL DIN COMODITATE — fara el se ghiceste gresit.
   *
   * In fisierul romanesc sunt 23 de nume de localitate care apar in DOUA sau mai
   * multe judete, iar `find` ar lua primul din ordinea fisierului. Masurat pe
   * datele reale: „Mihail Kogalniceanu" scotea 807277 (Galati) in loc de 907195
   * (Constanta, comuna aeroportului), „Zarnesti" scotea codul din Buzau in loc de
   * cel al orasului de 23.000 de locuitori din Brasov, „Sebes" pe cel din Brasov
   * in loc de Alba.
   *
   * Si nu e o inexactitate cosmetica: documentatia (clasa `Location`, pag. 15-16)
   * leaga `ZipCode` de `Routing.DepotNumber` — codul postal chiar ALEGE depozitul.
   * Un cod din alt judet trimite coletul pe ruta gresita.
   */
  judet?: string | null,
): Promise<string | null> {
  const cautat = normalizeaza(oras);
  if (!cautat) return null;
  try {
    const puncte = await puncteGls(tara);
    /* Punctele fara cod postal nu ajuta cu nimic; se sare peste ele. */
    const cuCod = puncte.filter((p) => p.codPostal && normalizeaza(p.city) === cautat);
    if (cuCod.length === 0) return null;

    const judetCautat = normalizeaza(judet ?? "");
    if (judetCautat) {
      const inJudet = cuCod.find((p) => normalizeaza(p.county) === judetCautat);
      if (inJudet) return inJudet.codPostal;
    }

    /*
     * ⚠ AMBIGUITATEA INSEAMNA „NU STIM", nu „ia primul".
     *
     * Am ajuns aici fie fara judet, fie cu unul in care numele asta nu exista. Daca
     * localitatea apare in MAI MULTE judete, orice alegere ar fi pe ghicite — si
     * exact asta trimitea coletul pe ruta altui depozit. `null` il face pe apelant
     * sa ceara codul omului, ceea ce e recuperabil; un cod gresit nu e.
     */
    const judete = new Set(cuCod.map((p) => normalizeaza(p.county)).filter(Boolean));
    if (judete.size > 1) return null;
    return cuCod[0].codPostal;
  } catch {
    /* Fisierul public nu raspunde: nu inventam un cod. Apelantul cere omului. */
    return null;
  }
}

/**
 * Forma de comparat a unui nume de localitate.
 *
 * ⚠ Se pliaza si PUNCTUATIA, nu doar diacriticele. GLS dezambiguizeaza singur
 * omonimele lipind codul de judet cu cratima in `contact.city`: „Navodari-CT",
 * „Tecuci-GL", „Bals-OT". Cu o comparatie care pastra cratima, 60 de localitati
 * (136 de puncte) nu se potriveau NICIODATA — adica fallback-ul refuza tocmai
 * acolo unde GLS are cea mai buna acoperire. Acelasi lucru la formele tastate
 * uzual: „Cluj Napoca" fata de „Cluj-Napoca".
 */
function normalizeaza(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * ⚠ Cache scurt pe TARA, in modul.
 *
 * `codPostalOras` se cheama la FIECARE emitere de AWB, iar fisierul are 2833 de
 * puncte. Fara cache, o generare in masa de 50 de comenzi ar descarca lista de 50
 * de ori. `getLockers` isi are deja cache-ul lui, pe alt drum; asta il acopera pe
 * acesta.
 */
const CACHE_PUNCTE = new CacheScurt<PunctGls[]>(10 * 60_000, 8);

/**
 * Goleste cache-ul. Pentru PROBE.
 *
 * ⚠ Fara asta, probele din acelasi fisier se influenteaza una pe alta: prima care
 * cere punctele umple cache-ul, iar urmatoarele primesc datele ei oricat de
 * diferit ar fi raspunsul pe care il pregatesc. O proba care nu poate ESUA e mai
 * rea decat lipsa ei.
 */
export function golesteCachePuncte(): void {
  CACHE_PUNCTE.goleste();
}

export async function puncteGls(tara: TaraMyGls): Promise<PunctGls[]> {
  /* Lista goala se tine doar 30 de secunde: altfel o cadere trecatoare a
     fisierului public ar goli checkout-ul pentru zece minute. */
  return CACHE_PUNCTE.iaSau(tara, () => descarcaPuncte(tara), (v) => v.length === 0, 30_000);
}

async function descarcaPuncte(tara: TaraMyGls): Promise<PunctGls[]> {
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
