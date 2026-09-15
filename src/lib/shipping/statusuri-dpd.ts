/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CODURILE DE OPERATIE DPD, DIN CHIAR APPENDIX 1 AL LOR          (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sursa: documentatia lor oficiala de Web API, `https://api.dpd.ro/web-api.html`, sectiunea
 * „4.1. Appendix 1 - Track And Trace Operation Codes". Adusa de la ei, nu din memorie.
 *
 * ⚠ DEOSEBIREA FATA DE WOOT, SI E TOATA DEOSEBIREA: DPD isi PUBLICA tabelul de stari. De aceea
 * aici se poate scrie o harta, iar comanda se poate muta si factura poate pleca. La Woot nu exista
 * nicio enumerare nicaieri, si de aceea cronul lui inregistreaza si nu hotaraste. Vezi
 * `@/lib/shipping/statusuri-woot`.
 *
 * ═══ ⚠⚠ CAPCANA CARE TREBUIE CITITA INAINTE DE ORICE ═══
 *
 * **„Livrat" e codul `-14`. NEGATIV.** Iar `14` exista si el, in CEALALTA lista a lor (Appendix 2,
 * codurile de exceptie), unde inseamna „Refused by recipient - not ordered". Un parser care citeste
 * numarul fara semn, sau care confunda cele doua tabele, ar inchide comanda pe un REFUZ.
 *
 * ⚠ SI A DOUA, la fel de usor de facut: `124 Delivered Back to Sender` CONTINE cuvantul
 * „Delivered". E returul ajuns inapoi la comerciant, nu livrarea. Marcat „livrat", comanda s-ar
 * inchide si ar pleca factura pentru un colet care tocmai s-a intors.
 *
 * ⚠ SI A TREIA, aceeasi pe care FAN a platit-o cu `S46`: `134 Prepared for Self-collecting
 * Consignee` si `1134 Notification sent for parcel in office/locker` NU sunt livrare. Coletul e in
 * dulap sau la oficiu, dar cumparatorul nu l-a ridicat. Trecuta pe „Livrata", comanda s-ar inchide
 * cu marfa inca acolo, iar daca omul n-o ridica, ea se intoarce si nimeni nu mai e atent.
 *
 * ═══ ⚠ CE NU E FINAL, DESI ARATA A SFARSIT ═══
 *
 * Refuzurile si livrarile nereusite (`44`, `123`, `111`) sunt urmate de RETUR, deci coletul inca se
 * misca. Marcate „final", am inceta sa intrebam exact cand incepe partea care il intereseaza pe
 * comerciant. Invers, o stare finala tratata ca nefinala costa doar cateva cereri in plus: schimbul
 * e asimetric si se alege in partea ieftina. Aceeasi hotarare ca la FAN.
 */

export type ClasificareDpd = "livrat" | "la_comerciant" | "in_retea" | "problema" | "necunoscut";

type OperatieDpd = {
  clasa: ClasificareDpd;
  /** Capat de drum ADEVARAT: cronul poate inceta sa intrebe. */
  final?: true;
  /** Coletul se intoarce la comerciant. Schimba doar FORMULAREA instiintarii. */
  retur?: true;
};

/**
 * ⚠ SINGURA SURSA DE ADEVAR. Fiecare cod din Appendix 1, cu clasa lui si cu numele lor langa.
 *
 * ⚠ CHEILE SUNT SIRURI, si nu din neglijenta: „-14" nu se poate scrie ca literal numeric intr-un
 * obiect JavaScript, iar un `Record<number, …>` cu un cast peste el ar fi ascuns tocmai greseala pe
 * care antetul o numeste drept cea mai usoara de facut. Cautarea trece prin `String(cod)`, la
 * vedere, si atunci si `-14` si `1134` se citesc la fel.
 */
export const OPERATII_DPD: Readonly<Record<string, OperatieDpd>> = {
  /* ── Inainte de ridicare ───────────────────────────────────────────── */
  "148": { clasa: "la_comerciant" }, // Shipment data received

  /* ── In retea, coletul se misca ────────────────────────────────────── */
  "1": { clasa: "in_retea" },    // Arrival Scan
  "2": { clasa: "in_retea" },    // Departure Scan
  "11": { clasa: "in_retea" },   // Received in Office
  "12": { clasa: "in_retea" },   // Out for Delivery
  "21": { clasa: "in_retea" },   // Processed in Office
  "38": { clasa: "in_retea" },   // Returned to Office
  "39": { clasa: "in_retea" },   // Courier Pick-up
  "69": { clasa: "in_retea" },   // Deferred delivery
  "115": { clasa: "in_retea" },  // Redirected
  "116": { clasa: "in_retea" },  // Forwarded
  "152": { clasa: "in_retea" },  // Routed to another DPD Location
  "175": { clasa: "in_retea" },  // Predict (fereastra de livrare anuntata)
  "176": { clasa: "in_retea" },  // Export to foreign provider
  "217": { clasa: "in_retea" },  // Handover to midway carrier
  /* ⚠ Coletul E la punct, dar NU e ridicat. Vezi capcana a treia din antet. */
  "134": { clasa: "in_retea" },  // Prepared for Self-collecting Consignee
  "1134": { clasa: "in_retea" }, // Notification sent for parcel in office/locker

  /* ── Livrarea, si numai ea ─────────────────────────────────────────── */
  "-14": { clasa: "livrat", final: true }, // ⚠ NEGATIV. Delivered.

  /* ── Cere omul ─────────────────────────────────────────────────────── */
  "44": { clasa: "problema" },   // Unsuccessful Delivery
  "123": { clasa: "problema" },  // Refused by recipient
  "136": { clasa: "problema" },  // Clarify shipment delivery
  "164": { clasa: "problema" },  // Unsuccessful shipment pickup
  "169": { clasa: "problema" },  // Delivery capacity reached (tour/office)
  "181": { clasa: "problema" },  // Unexpected delay
  "190": { clasa: "problema" },  // Postponed delivery due to inaccurate/incomplete address
  "195": { clasa: "problema" },  // Refuse contents check/test
  "144": { clasa: "problema" },  // Handover for contents check/test
  "120": { clasa: "problema" },  // Refusal to send
  "121": { clasa: "problema" },  // Stopped by Sender
  "112": { clasa: "problema" },  // Processed to the Insurance dept.
  "114": { clasa: "problema" },  // Processed for Destruction

  /* ── Returul ───────────────────────────────────────────────────────── */
  "111": { clasa: "problema", retur: true },               // Return to Sender
  /* ⚠ „Delivered" in nume, dar e returul AJUNS. Vezi capcana a doua din antet. */
  "124": { clasa: "problema", retur: true, final: true },  // Delivered Back to Sender

  /* ── Capete de drum ────────────────────────────────────────────────── */
  "125": { clasa: "problema", final: true },  // Destroyed
  "127": { clasa: "problema", final: true },  // Theft/Burglary
  "128": { clasa: "problema", final: true },  // Canceled
  "129": { clasa: "problema", final: true },  // Administrative Closure
};

/** Ce inseamna codul asta pentru comanda. Un cod nedocumentat e `necunoscut`, nu o ghicitura. */
export function clasificaOperatia(cod: number | null | undefined): ClasificareDpd {
  if (cod === null || cod === undefined || !Number.isInteger(cod)) return "necunoscut";
  return OPERATII_DPD[String(cod)]?.clasa ?? "necunoscut";
}

type StareComanda = "processing" | "shipped" | "delivered";

/**
 * Starea la care duce codul, sau `null` daca nu duce nicaieri.
 *
 * ⚠ `problema` intoarce `null` DINADINS: o livrare nereusita sau un refuz nu au voie sa anuleze
 * singure comanda. Comerciantul primeste o instiintare si hotaraste el.
 */
export function statusComandaDinOperatie(cod: number | null | undefined): StareComanda | null {
  switch (clasificaOperatia(cod)) {
    case "livrat": return "delivered";
    case "la_comerciant": return "processing";
    case "in_retea": return "shipped";
    default: return null;
  }
}

/** Treptele pe care o comanda le urca, niciodata invers. */
const TREAPTA: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4,
};

/**
 * Starea urmatoare, sau `null` cand nu e nimic de schimbat.
 *
 * ⚠ NU COBOARA NICIODATA. Operatiile nu vin garantat in ordine, iar un „Arrival Scan" sosit dupa
 * „Delivered" ar fi dat comanda inapoi pe „Expediata". Si o comanda anulata sau restituita nu se
 * mai misca de la niciun eveniment de curier.
 */
export function statusUrmatorDpd(statusCurent: string, cod: number | null | undefined): StareComanda | null {
  const tinta = statusComandaDinOperatie(cod);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/** Merita o instiintare catre comerciant? */
export function trebuieSemnalatDpd(cod: number | null | undefined): boolean {
  return clasificaOperatia(cod) === "problema";
}

/** Coletul se intoarce? Schimba formularea instiintarii, nu clasificarea. */
export function esteReturDpd(cod: number | null | undefined): boolean {
  return cod !== null && cod !== undefined && OPERATII_DPD[String(cod)]?.retur === true;
}

/** Se mai poate schimba ceva, sau cronul poate inceta sa intrebe? */
export function eStareFinalaDpd(cod: number | null | undefined): boolean {
  return cod !== null && cod !== undefined && OPERATII_DPD[String(cod)]?.final === true;
}

/** O operatie din raspunsul lor, cat ne trebuie noua. */
export type OperatieUrmarita = {
  dateTime?: string;
  operationCode?: number;
  description?: string;
  exceptionCodes?: string[];
};

/**
 * Ultima operatie dintr-o lista, DUPA DATA, nu dupa pozitie.
 *
 * ⚠ Aceeasi lectie ca la FAN si la Woot: ordinea unei liste nu e un contract. Si aici conteaza mai
 * mult decat oriunde, fiindca din ea iese chiar mutarea comenzii si factura.
 *
 * ⚠ Data vine ca „2026-09-15T14:30:00+03:00", deci CU fus. Se compara ca moment, nu ca sir: doua
 * operatii scrise in fusuri diferite (coletul trece granita) s-ar ordona gresit ca text. Cand data
 * lipseste sau nu se poate citi, operatia nu poate castiga.
 */
export function ultimaOperatie(operatii: readonly OperatieUrmarita[] | null | undefined): OperatieUrmarita | null {
  let cea: OperatieUrmarita | null = null;
  let cand = Number.NEGATIVE_INFINITY;
  for (const o of operatii ?? []) {
    if (!o || typeof o !== "object") continue;
    const t = Date.parse(String(o.dateTime ?? ""));
    if (!Number.isFinite(t)) continue;
    if (t >= cand) { cand = t; cea = o; }
  }
  return cea;
}
