import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusurile UPS → statusul comenzii.
 *
 * ═══ ⚠ AICI SUNT DOUA VOCABULARE, SI NUMAI UNUL E PUBLICAT ═══
 *
 * Raspunsul de urmarire da, pe acelasi obiect `currentStatus`:
 *   `type`        o litera sau doua — `D`, `I`, `M`, `MV`, `U`, `X`;
 *   `code`        doua caractere — `FS`, `OT`, …;
 *   `statusCode`  trei cifre — `011`, `021`, …;
 *   `description` TEXT TRADUS dupa `locale`.
 *
 * **Doar `type` are enumerare publicata.** Ea nu e in `Tracking.yaml` (acolo scrie
 * doar „The activity status type." si un exemplu), ci in `UPSTrackAlert.yaml`, ca
 * `oneOf` cu titluri:
 *
 *     D  = Delivery         I  = On the Way        M  = Manifest
 *     MV = Manifest Void    U  = Updated Delivery Date or Time
 *     X  = Package Exception
 *
 * Si e reluata in proza acolo: „M and MV = manifest information, X = exception
 * information …, I = in-progress …, U = update …, D = delivery information (loaded on
 * delivery vehicle, out for delivery, delivered)".
 *
 * ═══ ⚠⚠ `D` NU INSEAMNA „LIVRAT". SI ASTA E CAPCANA CEA MARE ═══
 *
 * Titlul lui e „Delivery", dar propria lor explicatie il desface in trei: „**loaded
 * on delivery vehicle, out for delivery, delivered**". Un `type === "D"` citit ca
 * livrare trece comanda pe „Livrata" — si declanseaza facturarea automata — in timp
 * ce coletul e inca in masina.
 *
 * Livrarea se dovedeste altfel, si din doua surse independente:
 *   1. `deliveryDate[]` cu `type: "DEL"` — enumerarea lor e inchisa acolo
 *      (`SDD` programata, `RDD` reprogramata, `DEL` livrata);
 *   2. `deliveryInformation`, despre care scriu „**Populated only when the package is
 *      delivered.**"
 *
 * ═══ ⚠ TABELUL DE CODURI DE PE SITE-UL LOR E ALT VOCABULAR ═══
 *
 * `developer.ups.com/api/reference/tracking/appendix` publica 687 de coduri sub
 * titlul **„EXCEPTION CODE"**. Nu e enumerarea lui `status.code`, si se poate dovedi:
 * `FS` — codul pe care UPS il da EL INSUSI ca exemplu pentru „Delivered" in schema de
 * webhook — **nu apare deloc in tabel**; iar `OT`, care in exemplele lor inseamna
 * „Out for Delivery", in tabel inseamna „UPS initiated contact with the sender to
 * obtain clearance information".
 *
 * Deci `ups_status_code` e `text`, set DESCHIS, si nu misca nimic singur. Se creste
 * din traficul real — `coduriNecunoscute()` e chiar carligul prin care se afla ce
 * trimit ei.
 */

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Intrare = {
  denumire: string;
  clasa: Clasificare;
  /** Cere o decizie omeneasca: se trimite notificare comerciantului. */
  semnaleaza?: boolean;
  /** Nu mai are rost sa fie intrebat. */
  final?: boolean;
};

/**
 * Cele SASE tipuri, singurele documentate.
 *
 * ⚠ `D` e clasificat `in_retea`, nu `livrat` — vezi antetul. Livrarea vine din
 * `eLivrat()`, care se uita la dovezi, nu la tip.
 */
export const TIPURI: Record<string, Intrare> = {
  /*
   * „Manifest" = informatia a plecat la UPS, eticheta e facuta, marfa e inca la
   * comerciant. Marcata expediata, comanda ar minti clientul. Aceeasi hotarare ca la
   * `OC` al FedEx, „0 emis" al SmartShip si `order_placed` al Shipo.
   */
  M: { denumire: "AWB emis, coletul n-a fost ridicat", clasa: "la_comerciant" },

  I: { denumire: "In tranzit prin reteaua UPS", clasa: "in_retea" },
  D: { denumire: "In curs de livrare", clasa: "in_retea" },
  U: { denumire: "Data de livrare a fost actualizata", clasa: "in_retea" },

  /*
   * ⚠ „Exception" NU inseamna „a esuat". Explicatia lor, verbatim: „something out of
   * the normal happened to your package, **but it may still be delivered on time**".
   * Deci comanda NU se misca si nu se anuleaza nimic — omul afla si decide.
   */
  X: { denumire: "Exceptie pe traseu (coletul poate ajunge totusi la timp)", clasa: "problema", semnaleaza: true },

  /*
   * ⚠ „Manifest Void" vazut de CRON inseamna ca anularea s-a facut in ALTA parte
   * decat panoul nostru: anularea noastra scoate numarul de pe comanda, deci coletul
   * iese din interogare. Un AWB anulat pe care comanda il poarta in continuare e exact
   * felul de nepotrivire pe care omul trebuie sa-l afle.
   */
  MV: { denumire: "AWB anulat", clasa: "problema", semnaleaza: true, final: true },
};

/**
 * Codurile de doua caractere pe care le RECUNOASTEM.
 *
 * ⚠ SUNT DOUA. Nu e o lista scurtata din lene — sunt singurele doua pe care UPS le
 * scrie el insusi, in exemplele schemei lui de webhook:
 *   `{"type":"D","code":"FS","description":"Delivered","descriptionCode":"011"}`
 *   `{"type":"I","code":"OT","description":"Out for Delivery","descriptionCode":"021"}`
 *
 * Restul se afla din traficul real. Pana atunci, un cod necunoscut nu misca nimic:
 * clasificarea sta pe `type`, care e documentat.
 */
export const CODURI: Record<string, string> = {
  FS: "Livrat",
  OT: "Iesit la livrare",
};

/**
 * Codul, normalizat.
 *
 * ⚠ MAJUSCULE, fiindca ale lor sunt majuscule peste tot. Normalizarea se opreste aici
 * dinadins: nu se scot cratime si nu se ghiceste nimic. Daca ei incep candva sa
 * trimita altceva, vrem `necunoscut` — adica tacere — nu o potrivire ghicita care ar
 * muta comanda pe baza unei presupuneri.
 */
export function codStatus(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return t.length > 0 && t.length <= 16 ? t : null;
}

/** Tipul, normalizat. Aceleasi reguli. */
export function tipStatus(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return t.length > 0 && t.length <= 4 ? t : null;
}

function intrare(tip: unknown): Intrare | null {
  const t = tipStatus(tip);
  return t !== null ? TIPURI[t] ?? null : null;
}

export function clasificaStatus(tip: unknown): Clasificare {
  return intrare(tip)?.clasa ?? "necunoscut";
}

/**
 * Livrarea, dovedita.
 *
 * ⚠ NU din `type`. Vezi antetul: `D` acopera si „incarcat in masina" si „iesit la
 * livrare". Se cere o dovada — data de livrare cu tipul `DEL`, sau containerul
 * `deliveryInformation`, despre care ei spun „populated only when the package is
 * delivered".
 *
 * Codul `FS` e acceptat si el, fiindca e singurul pe care UPS il pune el insusi langa
 * „Delivered" — dar e al treilea semnal, nu primul.
 */
export function eLivrat(
  tip: unknown,
  cod: unknown,
  livratLa: string | null | undefined,
  areDovadaLivrarii?: boolean,
): boolean {
  if ((livratLa ?? "").trim()) return true;
  if (areDovadaLivrarii === true) return true;
  return codStatus(cod) === "FS";
}

/** Denumirea pentru om. Necunoscuta, se arata ce a trimis UPS, apoi tipul brut. */
export function descriereStatus(tip: unknown, cod: unknown, dinRaspuns?: string | null): string {
  const c = codStatus(cod);
  if (c && CODURI[c]) return CODURI[c];

  const dat = (dinRaspuns ?? "").trim();
  if (dat) return dat;

  const i = intrare(tip);
  if (i) return i.denumire;

  const t = tipStatus(tip);
  return t !== null ? `Status UPS ${t}${c ? ` (${c})` : ""}` : "Status necunoscut";
}

export function trebuieSemnalat(tip: unknown): boolean {
  return intrare(tip)?.semnaleaza === true;
}

/**
 * Coletul se intoarce la expeditor?
 *
 * ⚠ RASPUNSUL CINSTIT E „NU SE POATE STI DIN API". UPS nu are niciun `type` de retur
 * (cele sase sunt D, I, M, MV, U, X), niciun steag si niciun camp. Singurele urme
 * sunt in tabelul lor de coduri de EXCEPTIE — alt vocabular, care nu se potriveste cu
 * `status.code` (vezi antetul).
 *
 * Deci nu se ghiceste. Un retur ajunge la comerciant ca `X` (exceptie), cu textul lor
 * netradus alaturi, si comerciantul decide. O potrivire inventata pe „returned to
 * sender" ar fi mutat comenzi pe baza unui tabel despre care stim ca e altul.
 */
export function esteRetur(): boolean {
  return false;
}

export function eStareFinala(tip: unknown, cod: unknown, livratLa?: string | null, areDovada?: boolean): boolean {
  if (eLivrat(tip, cod, livratLa, areDovada)) return true;
  return intrare(tip)?.final === true;
}

export function statusComandaDinCod(
  tip: unknown,
  cod: unknown,
  livratLa?: string | null,
  areDovada?: boolean,
): OrderStatus | null {
  if (eLivrat(tip, cod, livratLa, areDovada)) return "delivered";
  switch (clasificaStatus(tip)) {
    case "in_retea": return "shipped";
    case "la_comerciant": return "processing";
    /* Sfarsiturile proaste au inteles, dar anularea si rambursarea sunt decizii ale
       comerciantului, nu ale curierului. */
    case "problema": return null;
    default: return null;
  }
}

/** Ordinea pe scara comenzii. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4,
};

/**
 * Ce status primeste comanda — sau `null` daca nu se schimba nimic.
 *
 * Nu se coboara niciodata, si o comanda anulata sau rambursata nu se misca de la un
 * transportator.
 */
export function statusUrmator(
  statusCurent: string,
  tip: unknown,
  cod: unknown,
  livratLa?: string | null,
  areDovada?: boolean,
): OrderStatus | null {
  const tinta = statusComandaDinCod(tip, cod, livratLa, areDovada);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/**
 * Perechea (tip, cod) e una pe care n-o cunoastem?
 *
 * ⚠ Exista ca sa se poata CRESTE tabelul din traficul real, nu ca sa se semnaleze
 * ceva comerciantului. Cronul o foloseste ca sa scrie in jurnal perechile noi — asa,
 * peste cateva saptamani, `CODURI` se poate completa din ce trimite UPS cu adevarat,
 * in loc sa fie ghicit dintr-un tabel despre care stim ca e altul.
 */
export function eCombinatieNecunoscuta(tip: unknown, cod: unknown): boolean {
  const t = tipStatus(tip);
  const c = codStatus(cod);
  if (t !== null && !TIPURI[t]) return true;
  return c !== null && !CODURI[c];
}

/** Cum se explica unui om clasificarea. Se arata in pagina de configurare. */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut — comanda nu se misca si nu se semnaleaza nimic",
};
