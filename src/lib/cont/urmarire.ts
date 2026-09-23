import { NUME_CURIER, type CurierPropriu } from "@/lib/orders/awb-propriu";
import { stripDiacritics } from "@/lib/utils/ro-address";

/**
 * Unde isi urmareste cumparatorul coletul, si cum se numeste curierul lui.
 *
 * ⚠⚠ NICIO ADRESA INVENTATA. Fiecare tipar are sursa scrisa langa el: fie e deja
 * folosit de panou (modalele de AWB), fie e pagina publica a curierului, citita
 * pe 23.09.2026. Un buton care duce la o pagina gresita e mai rau decat lipsa lui.
 *
 * ⚠ Masurat pe productie: 274 din 280 de colete de vitrina sunt Woot, iar 273
 * dintre ele sunt DPD dedesubt. Fara brokeri, contul arata butonul la 6 colete din
 * 280. Pentru Woot se foloseste pagina LOR publica, cu curierul in adresa: e
 * pagina oficiala pentru AWB-urile emise prin ei.
 *
 * ⚠ O adresa SALVATA de curier (DHL, FedEx, UPS, Innoship, SmartShip) vine dintr-un
 * raspuns de API, deci trece printr-o garda: numai `https:`.
 */

/** Curierii pe care stim sa-i recunoastem dupa nume, la brokeri. */
type CurierCunoscut = "dpd" | "fancourier" | "cargus" | "sameday" | "gls" | "posta" | "dhl" | "fedex" | "ups";

/**
 * Curierul real al unui broker, din numele primit de la el („DPD Classic",
 * „DPD <semn lung> locatie - adresa", „Fan Courier", „fancourier").
 *
 * ⚠ Dupa PRIMUL cuvant, pe o harta explicita, nu dupa un subsir: „Fan Courier"
 * are si „courier" in el, iar un nume nou necunoscut trebuie sa dea nimic, nu o
 * potrivire ghicita.
 */
export function curierulReal(nume: string | null | undefined): CurierCunoscut | null {
  /* Separatorii masurati in `woot_service_name` (semnul lung si punctul median), construiti
     din cod: regula casei cere ca sursa sa nu poarte semnul lung. */
  let curat = stripDiacritics((nume ?? "").trim().toLowerCase());
  for (const s of [String.fromCharCode(0x2014), String.fromCharCode(0xb7), ","]) curat = curat.split(s).join(" ");
  const primul = curat.split(" ").map((x) => x.trim()).filter((x) => x && x !== "-")[0] ?? "";
  const harta: Record<string, CurierCunoscut> = {
    dpd: "dpd",
    fan: "fancourier",
    fancourier: "fancourier",
    cargus: "cargus",
    urgent: "cargus",
    sameday: "sameday",
    gls: "gls",
    posta: "posta",
    postaromana: "posta",
    dhl: "dhl",
    fedex: "fedex",
    ups: "ups",
  };
  return harta[primul] ?? null;
}

const COD = encodeURIComponent;

/** Paginile cu numarul in adresa. */
const DIRECT: Partial<Record<string, (awb: string) => string>> = {
  /* Tiparele din modalele panoului (FanCourierAwbModal, CargusAwbModal, SamedayAwbModal, DpdAwbModal). */
  fancourier: (n) => `https://www.fancourier.ro/awb-tracking/?tracking=${COD(n)}`,
  cargus: (n) => `https://www.cargus.ro/personal/urmareste-coletul/?tracking_number=${COD(n)}`,
  sameday: (n) => `https://sameday.ro/#awb=${COD(n)}`,
  dpd: (n) => `https://tracking.dpd.ro/?shipmentNumber=${COD(n)}`,
  /* gls-group.com/RO/ro/urmarire-colet: scriptul paginii citeste `match` si cauta singur. */
  gls: (n) => `https://gls-group.com/RO/ro/urmarire-colet?match=${COD(n)}`,
  /* Documentat: docs.packeta.com/docs/packet-tracking/tracking, cu packet id-ul. */
  packeta: (n) => `https://tracking.packeta.com/ro/?id=${COD(n)}`,
  /* Pagina publica eColet (ecolet.ro, „urmarirea coletelor fara logare"). */
  ecolet: (n) => `https://panel.ecolet.ro/track/${COD(n)}`,
  /* Formularul GET al paginii Shipo, publicat si ca SearchAction in JSON-LD-ul lor. */
  shipo: (n) => `https://shipo.ro/servicii-curierat/urmarire-colet?awb_track=${COD(n)}`,
};

/** Slugurile paginii publice Woot (awb.woot.ro/urmarire-colet-<slug>/<awb>). */
const SLUG_WOOT: Partial<Record<CurierCunoscut, string>> = {
  dpd: "dpd", fancourier: "fancourier", cargus: "cargus", sameday: "sameday", gls: "gls",
  posta: "postaromana", dhl: "dhl", fedex: "fedex", ups: "ups",
};

/** Numai pagina de cautare: numarul nu se poate pune in adresa (captcha, cod postal). */
const CAUTARE: Partial<Record<string, string>> = {
  posta: "https://www.posta-romana.ro/track-trace.html",
  pallex: "https://nexus.pallex.com/Tracking/",
};

export type Urmarire = {
  href: string;
  /** `direct`: pagina deschide coletul. `cautare`: omul lipeste singur numarul. */
  fel: "direct" | "cautare";
};

function adresaSigura(brut: string | null | undefined): string | null {
  if (!brut) return null;
  try {
    const u = new URL(brut.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function urmareste(p: {
  curier: string | null | undefined;
  curierReal?: string | null;
  awb: string | null | undefined;
  urlSalvat?: string | null;
}): Urmarire | null {
  const salvata = adresaSigura(p.urlSalvat);
  if (salvata) return { href: salvata, fel: "direct" };

  const numar = (p.awb ?? "").trim();
  if (!p.curier || !numar) return null;

  if (p.curier === "woot") {
    const real = curierulReal(p.curierReal);
    const slug = real ? SLUG_WOOT[real] : undefined;
    return slug ? { href: `https://awb.woot.ro/urmarire-colet-${slug}/${COD(numar)}`, fel: "direct" } : null;
  }
  /* La Innoship AWB-ul e al curierului real (courierShipmentId); adresa lor salvata a castigat deja mai sus. */
  if (p.curier === "innoship") {
    const real = curierulReal(p.curierReal);
    const tipar = real ? DIRECT[real] : undefined;
    return tipar ? { href: tipar(numar), fel: "direct" } : null;
  }

  const direct = DIRECT[p.curier];
  if (direct) return { href: direct(numar), fel: "direct" };
  const cautare = CAUTARE[p.curier];
  if (cautare) return { href: cautare, fel: "cautare" };
  return null;
}

/** Tot ce ne spune panoul despre un curier, cu diacriticele scoase pentru vitrina (H6). */
function numeDinHarta(cheie: string): string {
  return stripDiacritics(NUME_CURIER[cheie as CurierPropriu] ?? cheie);
}

/**
 * Numele curierului pentru cumparator.
 *
 * ⚠ La brokeri se arata curierul REAL: omul primeste coletul si SMS-ul de la
 * DPD, nu de la Woot, un nume pe care nu l-a intalnit niciodata.
 */
export function numeleCurierului(curier: string | null | undefined, curierReal?: string | null): string | null {
  if (!curier) return null;
  const real = ["woot", "innoship", "shipo", "smartship"].includes(curier) ? curierulReal(curierReal) : null;
  return numeDinHarta(real ?? curier);
}
