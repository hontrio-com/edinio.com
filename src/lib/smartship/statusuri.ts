import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusurile SmartShip → statusul comenzii.
 *
 * ═══ ⚠ ZERO E UN STATUS, NU O LIPSA ═══
 *
 * `0 = emis (neridicat)` e chiar prima treapta a lor. La toti ceilalti curieri din
 * platforma codurile incep de la 1, iar ajutoarele lor de citire resping zeroul
 * (`Number.isInteger(n) && n > 0`). Copiat mecanic aici, TOATE coletele proaspat
 * emise ar fi aratat „status necunoscut", iar cronul le-ar fi reinterogat la
 * nesfarsit fara sa retina nimic.
 *
 * De aceea `codNumeric` accepta `0`, iar comparatiile de mai jos si din cron se
 * fac cu `!== null`, niciodata cu `||` sau cu adevar-fals.
 *
 * ═══ ⚠ DOUA LISTE, USOR DIFERITE, IN ACEEASI DOCUMENTATIE ═══
 *
 *   `/awb/status`: „0 = emis (neridicat), 1 = in tranzit, 2 = livrat, 5/6 = retur, 10 = anulat"
 *   `/awbs`:       „0 = emis, 1 = in livrare, 2 = livrat, 5 = refuz primire, 6 = returnat, 10 = anulat"
 *
 * A doua e mai fina si nu o contrazice pe prima, deci se ia ea. Cuvantul
 * „principale" din prima lasa insa deschisa existenta altor coduri — de aia
 * implicitul ramane TACEREA: un cod nou aparut la ei nu misca nicio comanda si nu
 * scoate coletul din urmarire.
 *
 * ═══ ⚠ DE CE NU SE CITESTE ISTORICUL, DESI EXISTA ═══
 *
 * La GLS am invatat ca ultima stare nu e de ajuns: intre doua treceri ale cronului
 * pot intra mai multe evenimente, iar ultimul poate fi administrativ, deci o
 * livrare petrecuta intre timp nu s-ar mai vedea niciodata.
 *
 * Aici capcana NU se aplica, si merita spus de ce: `awb_status` nu e ultimul
 * EVENIMENT, e starea EXPEDIERII — un rezumat pe care ei il tin, nu o intrare din
 * jurnal. Iar `tracking[].event_id` (singurul lucru pe care s-ar putea face o
 * clasificare a istoricului) NU are niciun nomenclator publicat: exemplul lor
 * arata „1" si „5" fara sa spuna ce inseamna.
 *
 * Deci istoricul se ARATA omului, dar nu se traduce si nu misca nimic. Ghicit, ar
 * fi fost cea mai scumpa presupunere din integrarea asta.
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

export const STATUSURI: Record<number, Intrare> = {
  /*
   * ⚠ „Emis (neridicat)" NU inseamna „expediat": eticheta e facuta, marfa e inca
   * la comerciant. Marcata expediata, comanda ar minti clientul si — la o comanda
   * cu ramburs — ar porni instiintari pentru un colet care n-a plecat. Aceeasi
   * hotarare ca la „1 New" al Innoship si „1 received data" al Packetei.
   */
  0: { denumire: "AWB emis, coletul n-a fost ridicat", clasa: "la_comerciant" },
  1: { denumire: "In tranzit", clasa: "in_retea" },
  2: { denumire: "Livrat", clasa: "livrat", final: true },
  /*
   * ⚠ Refuzul de primire NU e final: coletul se intoarce, si abia atunci ajunge
   * la 6. Scos din urmarire aici, nu s-ar mai afla niciodata ca marfa s-a intors —
   * iar la o comanda cu ramburs asta inseamna si ca banii nu vin.
   */
  5: { denumire: "Destinatarul a refuzat coletul", clasa: "problema", semnaleaza: true },
  6: { denumire: "Colet returnat expeditorului", clasa: "problema", semnaleaza: true, final: true },
  /*
   * ⚠ Anularea vazuta de CRON inseamna ca s-a facut in ALTA parte decat panoul
   * nostru: anularea noastra scoate numarul de pe comanda, deci coletul iese din
   * interogare. Un AWB anulat pe care comanda il poarta in continuare e exact
   * felul de nepotrivire pe care omul trebuie sa-l afle.
   */
  10: { denumire: "AWB anulat", clasa: "problema", semnaleaza: true, final: true },
};

/** Statusurile dupa care marfa s-a intors (sau se intoarce) la comerciant. */
const RETUR = new Set([5, 6]);

/**
 * Codul ca numar, sau `null`.
 *
 * ⚠ ZERO E VALID. Vezi antetul fisierului — e chiar prima treapta.
 * Primeste si sir: coloanele si JSON-ul pot purta „0".
 */
export function codNumeric(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  return null;
}

function intrare(cod: unknown): Intrare | null {
  const n = codNumeric(cod);
  return n !== null ? STATUSURI[n] ?? null : null;
}

export function clasificaStatus(cod: unknown): Clasificare {
  return intrare(cod)?.clasa ?? "necunoscut";
}

/** Denumirea pentru om. Necunoscuta, se arata ce au trimis ei, apoi codul. */
export function descriereStatus(cod: unknown, dinRaspuns?: string | null): string {
  const i = intrare(cod);
  if (i) return i.denumire;
  const dat = (dinRaspuns ?? "").trim();
  if (dat) return dat;
  const n = codNumeric(cod);
  return n !== null ? `Status ${n}` : "Status necunoscut";
}

export function trebuieSemnalat(cod: unknown): boolean {
  return intrare(cod)?.semnaleaza === true;
}

export function esteRetur(cod: unknown): boolean {
  const n = codNumeric(cod);
  return n !== null && RETUR.has(n);
}

export function eStareFinala(cod: unknown): boolean {
  return intrare(cod)?.final === true;
}

export function statusComandaDinCod(cod: unknown): OrderStatus | null {
  switch (clasificaStatus(cod)) {
    case "livrat": return "delivered";
    case "in_retea": return "shipped";
    case "la_comerciant": return "processing";
    /* Sfarsiturile proaste au inteles, dar anularea si rambursarea sunt decizii
       ale comerciantului, nu ale curierului. */
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
 * Nu se coboara niciodata (evenimentele pot sosi in alta ordine), si o comanda
 * anulata sau rambursata nu se misca de la un transportator.
 */
export function statusUrmator(statusCurent: string, cod: unknown): OrderStatus | null {
  const tinta = statusComandaDinCod(cod);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/** Cum se explica unui om clasificarea. Se arata in pagina de configurare. */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut — comanda nu se misca si nu se semnaleaza nimic",
};
