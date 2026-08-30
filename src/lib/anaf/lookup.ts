import { isValidCui, normalizeCui } from "./cui";
import { potrivesteJudet } from "@/lib/ro/judete";

/**
 * Interogarea registrului public ANAF, intr-un singur loc.
 *
 * Pana acum logica statea in intregime in `app/api/anaf/lookup/route.ts`, o ruta
 * care cere sesiune. Din formularul de comanda cumparatorul e ANONIM, deci ruta
 * i-ar fi raspuns 401. Mutarea aici lasa doua invelisuri peste acelasi cod: ruta
 * autentificata, folosita de panou, si actiunea publica cu limita de cereri,
 * folosita la checkout.
 *
 * FATA DE VERSIUNEA VECHE se intorc in plus statutul de platitor de TVA si cel
 * de firma inactiva. Primul decide `isTaxPayer`/`vatPayer`/prefixul „RO" pe
 * factura — trimis gresit, factura e gresita. Al doilea e o avertizare pentru
 * comerciant, nu o oprire: o firma inactiva poate cumpara, dar furnizorul nu-si
 * deduce TVA-ul de la ea.
 */

const ANAF_URL = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";
const TIMEOUT_MS = 10_000;

interface AnafDateGenerale {
  denumire?: string;
  adresa?: string;
  judet?: string;
  cui?: number;
  nrRegCom?: string;
  codPostal?: string;
}

interface AnafAdresa {
  // Cheile folosite de versiunea dinaintea acesteia. Pastrate primele: pe ele
  // merge autocompletarea din Setari, in productie, de luni de zile.
  ddenumire_Judet?: string;
  ddenumire_Localitate?: string;
  dstrada?: string;
  dnumar?: string;
  dbloc?: string;
  dscara?: string;
  dapartament?: string;
  dcod_Postal?: string;
  // Denumirile din documentatia v9, incercate doar daca cele de sus lipsesc.
  ddenumire_Strada?: string;
  dnumar_Strada?: string;
  ddetalii_Adresa?: string;
}

export interface AnafFoundItem {
  date_generale?: AnafDateGenerale;
  adresa_domiciliu_fiscal?: AnafAdresa;
  inregistrare_scop_Tva?: { scpTVA?: boolean };
  stare_inactiv?: { statusInactivi?: boolean };
  // Forma plata (v8), pastrata ca plasa de siguranta.
  denumire?: string;
  adresa?: string;
  judet?: string;
  nrRegCom?: string;
  codPostal?: string;
}

export interface AnafResponse {
  cod?: number;
  message?: string;
  found?: AnafFoundItem[];
  notFound?: number[];
}

/** Ce afla apelantul. Acelasi obiect pentru panou si pentru magazin. */
export interface AnafCompany {
  cui: string;
  business_name: string;
  reg_com: string;
  address: string;
  city: string;
  county: string;
  post_code: string;
  /** Inregistrata in scopuri de TVA ACUM. Decide prefixul „RO" si `isTaxPayer`. */
  vat_payer: boolean;
  /** Declarata inactiva fiscal. Nu opreste comanda, doar se spune. */
  inactive: boolean;
}

/**
 * De ce a esuat cautarea. Statutul HTTP nu ajunge: „firma asta nu exista" si
 * „n-am inteles raspunsul" ar primi amandoua 404, iar apelantii au nevoie sa le
 * deosebeasca. Numai `not_found` e un VERDICT al ANAF; pe el se poate refuza o
 * comanda. Restul sunt necazuri de-ale noastre si nu au voie sa opreasca un
 * cumparator.
 */
export type AnafFailReason = "not_found" | "unusable" | "unavailable";

export type AnafLookupResult =
  | { ok: true; company: AnafCompany }
  | { ok: false; error: string; status: number; reason: AnafFailReason };

/**
 * Ce spune de fapt un raspuns ANAF fara nicio inregistrare folosibila.
 *
 * ANAF confirma negasirea in doua feluri: pune codul in `notFound` sau intoarce
 * un `found` gol. Un corp caruia ii lipseste cu totul cheia `found` NU e o
 * confirmare — e un corp pe care nu-l putem citi (serviciul are si campuri
 * `cod`/`message` pentru erori proprii), si a-l lua drept „firma nu exista" ar
 * insemna sa refuzam comenzi ale unor firme reale ori de cate ori ANAF are o zi
 * proasta.
 */
export function clasificaLipsa(cui: string, data: AnafResponse): AnafFailReason {
  if (data.notFound?.some((c) => String(c) === cui)) return "not_found";
  if (Array.isArray(data.found)) return "not_found";
  return "unusable";
}

/** ANAF scrie cu majuscule; noi scriem ca oamenii. */
function capitalizeaza(s: string): string {
  return s.toLowerCase().replace(/\p{L}+/gu, (c) => c.charAt(0).toUpperCase() + c.slice(1));
}

/**
 * Raspunsul ANAF, tradus in forma noastra. `null` cand lipseste denumirea —
 * fara ea nu se poate emite nimic.
 *
 * Separata de apelul de retea ca sa poata fi verificata pe raspunsuri reale,
 * salvate: denumirile campurilor din v9 sunt singurul lucru din tot fluxul pe
 * care nu-l putem controla, si s-au schimbat deja o data fata de v8.
 */
export function mapAnafItem(cui: string, item: AnafFoundItem): AnafCompany | null {
  const general = item.date_generale ?? item;
  const adresa = item.adresa_domiciliu_fiscal;

  const businessName = (general.denumire ?? "").trim();
  if (!businessName) return null;

  const judetBrut = (adresa?.ddenumire_Judet ?? general.judet ?? "").trim();
  const orasBrut = (adresa?.ddenumire_Localitate ?? "").trim() || judetBrut;

  // Strada se compune din bucati.
  //
  // ATENTIE la prefix: `ddenumire_Strada` vine din ANAF cu tipul arterei DEJA
  // inclus („Str. Gara Herastrau", „Sos. Virtutii"), pe cand vechiul `dstrada`
  // continea doar numele. Un „Str. " pus in fata amandurora dadea „Str. Sos.
  // Virtutii" pe factura.
  //
  // In v9 `dstrada`/`dnumar` nu mai apar deloc in raspuns — pastrate doar ca sa
  // nu se rupa nimic daca ANAF le reintoarce vreodata.
  let street = "";
  if (adresa?.ddenumire_Strada) {
    street = adresa.ddenumire_Strada.trim();
    if (adresa.dnumar_Strada) street += ` nr. ${adresa.dnumar_Strada}`;
    if (adresa.ddetalii_Adresa) street += `, ${adresa.ddetalii_Adresa}`;
  } else if (adresa?.dstrada) {
    street = `Str. ${adresa.dstrada}`;
    if (adresa.dnumar) street += ` nr. ${adresa.dnumar}`;
    if (adresa.dbloc) street += ` bl. ${adresa.dbloc}`;
    if (adresa.dscara) street += ` sc. ${adresa.dscara}`;
    if (adresa.dapartament) street += ` ap. ${adresa.dapartament}`;
  } else {
    // Ultima plasa: sirul brut din `date_generale`, cu tot cu judet si oras.
    street = (adresa?.ddetalii_Adresa ?? general.adresa ?? "").trim();
  }

  return {
    cui,
    business_name: businessName,
    // Judetul trece prin lista noastra: forma ANAF („BISTRIŢA-NĂSĂUD") nu s-ar
    // potrivi cu niciun element de `select` si campul ar ramane necompletat.
    county: potrivesteJudet(judetBrut) ?? capitalizeaza(judetBrut),
    city: capitalizeaza(orasBrut),
    address: street,
    post_code: (adresa?.dcod_Postal ?? general.codPostal ?? "").trim(),
    reg_com: (general.nrRegCom ?? "").trim(),
    vat_payer: item.inregistrare_scop_Tva?.scpTVA === true,
    inactive: item.stare_inactiv?.statusInactivi === true,
  };
}

/**
 * Interogheaza ANAF pentru un CUI. Nu arunca niciodata: orice esec devine un
 * rezultat cu mesaj gata de aratat clientului, fiindca apelantii sunt un
 * formular de comanda si un panou, nu un batch care poate reincerca.
 */
export async function lookupAnaf(cuiInput: string, timeoutMs = TIMEOUT_MS): Promise<AnafLookupResult> {
  const cifre = normalizeCui(cuiInput);
  if (!cifre) return { ok: false, error: "CUI lipsa", status: 400, reason: "not_found" };
  // Verificarea locala INAINTE de retea: un CUI tastat gresit nu are de ce sa
  // ajunga la un serviciu al statului, cu atat mai putin dintr-un formular public.
  if (!isValidCui(cifre)) return { ok: false, error: "CUI invalid", status: 400, reason: "not_found" };

  const azi = new Date().toISOString().split("T")[0];

  // Anulare manuala prin AbortController: `AbortSignal.timeout` nu e peste tot.
  //
  // Cronometrul se opreste in `finally`, DUPA citirea corpului, nu imediat dupa
  // `fetch`. Oprit devreme, el margineste doar antetele: un ANAF care raspunde in
  // 200 ms si apoi trage corpul la nesfarsit ar fi tinut plasarea comenzii blocata
  // oricat, exact cazul pentru care exista limita de doua secunde.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(ANAF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui: Number(cifre), data: azi }]),
      signal: controller.signal,
      // Nomenclator mic si volatil: `force-cache` a dat 500 pe Data Cache-ul
      // Vercel in trecut, iar raspunsul depinde oricum de ziua curenta.
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[anaf/lookup] HTTP error:", res.status);
      return { ok: false, error: "Serviciul ANAF nu raspunde. Incearca din nou.", status: 502, reason: "unavailable" };
    }

    const data = (await res.json()) as AnafResponse;
    const item = data.found?.[0];
    if (!item) {
      const motiv = clasificaLipsa(cifre, data);
      return motiv === "not_found"
        ? { ok: false, error: "CUI negasit in baza de date ANAF.", status: 404, reason: "not_found" }
        : { ok: false, error: "Raspuns neasteptat de la ANAF. Incearca din nou.", status: 502, reason: "unusable" };
    }

    const company = mapAnafItem(cifre, item);
    if (!company) {
      // Inregistrarea EXISTA, doar ca nu are denumire — deci nu e „negasit".
      return { ok: false, error: "Date incomplete in ANAF pentru acest CUI.", status: 404, reason: "unusable" };
    }
    return { ok: true, company };
  } catch (err) {
    const eTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[anaf/lookup] Error:", err);
    return {
      ok: false,
      error: eTimeout ? "Serviciul ANAF nu raspunde (timeout)." : "Eroare la interogarea ANAF.",
      status: 502,
      reason: "unavailable",
    };
  } finally {
    clearTimeout(timer);
  }
}
