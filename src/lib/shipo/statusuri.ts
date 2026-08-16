import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusurile Shipo → statusul comenzii.
 *
 * ═══ ⚠ AICI STATUSURILE SUNT SIRURI, NU NUMERE ═══
 *
 * La SmartShip, Innoship, GLS si Packeta codurile sunt intregi, si toata familia
 * de ajutoare din platforma lucreaza cu `codNumeric`. La Shipo sunt CUVINTE:
 * `order_placed`, `collected`, `in_transit`, `out_for_delivery`, `delivered`,
 * `canceled`, `dropoff_locker`, `dropoff_pudo`, `loaded_locker`, `loaded_pudo`,
 * `return_to_sender`.
 *
 * De aia si coloana e `shipo_status_code text`, nu `integer` — vezi migratia.
 * Copiata mecanic dupa SmartShip, ar fi devenit inutilizabila dupa primele date.
 *
 * ⚠ Lista de mai sus e cea din documentatia lui `status_delivery`, repetata
 * identic la `/shipments` si la `/store-returns`. Endpointul `/tracking` insa
 * arata in `statusClasses` si o cheie care NU e in ea: `picked_up`, acolo unde
 * lista oficiala are `collected`. Nu se stie care ajunge in campul `status`, deci
 * sunt tratate AMANDOUA, ca sinonime — costa un rand si inchide o gaura pe care
 * altfel ar fi descoperit-o un comerciant.
 *
 * ═══ ⚠ IMPLICITUL E TACEREA ═══
 *
 * Un status nou aparut la ei nu misca nicio comanda, nu semnaleaza nimic si NU
 * scoate coletul din urmarire. Un broker cu sapte curieri in spate isi poate
 * largi oricand nomenclatorul; presupunerea inversa („nu-l stiu, deci s-a
 * terminat") ar ingheta comenzi pentru totdeauna.
 *
 * ═══ ⚠ DE CE NU SE CITESTE ISTORICUL ═══
 *
 * `/tracking` intoarce si `statusLog`, dar exemplul lor il arata GOL (`{}`) si nu
 * documenteaza nici forma intrarilor, nici vocabularul lor. `status` in schimb e
 * starea EXPEDIERII — un rezumat pe care il tin ei. Se citeste el, si numai el:
 * la GLS am invatat ca ultimul EVENIMENT nu e de ajuns, fiindca intre doua
 * treceri ale cronului pot intra mai multe si ultimul poate fi administrativ.
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

export const STATUSURI: Record<string, Intrare> = {
  /*
   * ⚠ „AWB emis" NU inseamna „expediat": eticheta e facuta, marfa e inca la
   * comerciant. Marcata expediata, comanda ar minti clientul si — la o comanda cu
   * ramburs — ar porni instiintari pentru un colet care n-a plecat. Aceeasi
   * hotarare ca la „0 emis" al SmartShip si „1 New" al Innoship.
   */
  order_placed: { denumire: "AWB emis, coletul n-a fost ridicat", clasa: "la_comerciant" },

  collected: { denumire: "Coletul a fost ridicat", clasa: "in_retea" },
  /* Sinonimul din `statusClasses` al lui /tracking. Vezi antetul. */
  picked_up: { denumire: "Coletul a fost ridicat", clasa: "in_retea" },

  in_transit: { denumire: "In tranzit", clasa: "in_retea" },
  out_for_delivery: { denumire: "Iesit la livrare", clasa: "in_retea" },

  /*
   * Predat intr-un locker sau punct PUDO de catre EXPEDITOR: coletul a intrat in
   * retea, deci comanda e expediata.
   */
  dropoff_locker: { denumire: "Predat in locker", clasa: "in_retea" },
  dropoff_pudo: { denumire: "Predat in punct PUDO", clasa: "in_retea" },

  /*
   * ⚠ „Incarcat in locker" NU e livrare, si e cea mai usoara greseala de facut.
   *
   * Coletul e la capatul drumului, dar clientul inca nu l-a ridicat — la Packeta
   * un colet poate sta saptamani asa, si daca nu-l ridica se intoarce. Marcata
   * „Livrata" aici, comanda ar declansa factura si eventuala eliberare de fonduri
   * pentru marfa pe care cumparatorul n-a atins-o inca, iar la retur nimeni n-ar
   * mai afla. Ramane „Expediata" pana la `delivered`.
   */
  loaded_locker: { denumire: "In locker, asteapta ridicarea", clasa: "in_retea" },
  loaded_pudo: { denumire: "In punct PUDO, asteapta ridicarea", clasa: "in_retea" },

  delivered: { denumire: "Livrat", clasa: "livrat", final: true },

  /*
   * ⚠ Returul catre expeditor E final: marfa s-a intors, drumul s-a incheiat.
   * Comanda NU se misca insa — vezi `statusComandaDinCod`: anularea si
   * rambursarea sunt decizii ale comerciantului, nu ale curierului.
   */
  return_to_sender: { denumire: "Colet returnat expeditorului", clasa: "problema", semnaleaza: true, final: true },

  /*
   * ⚠ Anularea vazuta de CRON inseamna ca s-a facut in ALTA parte decat panoul
   * nostru: anularea noastra scoate numarul de pe comanda, deci coletul iese din
   * interogare. Un AWB anulat pe care comanda il poarta in continuare e exact
   * felul de nepotrivire pe care omul trebuie sa-l afle.
   */
  canceled: { denumire: "AWB anulat", clasa: "problema", semnaleaza: true, final: true },
};

/** Statusurile dupa care marfa s-a intors la comerciant. */
const RETUR = new Set(["return_to_sender"]);

/**
 * Codul ca sir normalizat, sau `null`.
 *
 * Normalizarea e minima si dinadins: litere mici si `trim`. NU se traduc
 * cratimele in underliniute si nu se scot spatiile din interior — daca ei incep
 * candva sa trimita „in transit", vrem sa iasa `necunoscut` (adica tacere), nu o
 * potrivire ghicita care ar muta comanda pe baza unei presupuneri.
 */
export function codStatus(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t.length > 0 && t.length <= 64 ? t : null;
}

function intrare(cod: unknown): Intrare | null {
  const t = codStatus(cod);
  return t !== null ? STATUSURI[t] ?? null : null;
}

export function clasificaStatus(cod: unknown): Clasificare {
  return intrare(cod)?.clasa ?? "necunoscut";
}

/** Denumirea pentru om. Necunoscuta, se arata ce au trimis ei, apoi codul brut. */
export function descriereStatus(cod: unknown, dinRaspuns?: string | null): string {
  const i = intrare(cod);
  if (i) return i.denumire;
  const dat = (dinRaspuns ?? "").trim();
  if (dat) return dat;
  const t = codStatus(cod);
  return t !== null ? `Status ${t}` : "Status necunoscut";
}

export function trebuieSemnalat(cod: unknown): boolean {
  return intrare(cod)?.semnaleaza === true;
}

export function esteRetur(cod: unknown): boolean {
  const t = codStatus(cod);
  return t !== null && RETUR.has(t);
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
