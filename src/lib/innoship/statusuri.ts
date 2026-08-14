import type { OrderStatus } from "@/lib/orders/status";
import type { StareInnoship } from "./client";

/**
 * Statusurile Innoship → statusul comenzii.
 *
 * ═══ CEL MAI BUN CONTRACT DE STATUSURI DIN PLATFORMA ═══
 *
 * Innoship publica nomenclatorul si il NORMALIZEAZA peste toti cei ~230 de
 * curieri. Deci „Delivered" inseamna acelasi lucru fie ca a dus Cargus, fie DPD,
 * fie Posta Romana prin ei. La eColet si Pall-Ex harta se face pe cuvinte, fiindca
 * furnizorul nu publica nicio lista; la Posta e pe numar, dar numai pentru Posta.
 *
 * Si mai exista ceva ce NU avem de la nimeni altcineva: un tabel SEPARAT pentru
 * statusul RAMBURSULUI. Vezi mai jos.
 *
 * ═══ ⚠ IMPLICITUL RAMANE TACEREA ═══
 *
 * `isFinalStatus` vine chiar de la ei si e coerent cu tabelul (tot ce e peste 100
 * e final). Il citim, dar harta ramane a NOASTRA: un cod nou aparut la ei nu
 * misca comanda si nu o scoate din urmarire. Steagul lor e a doua parere, nu
 * prima — la Posta Romana steagul chiar minte in doua locuri, si lectia se
 * pastreaza chiar cand furnizorul pare de incredere.
 */

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Intrare = {
  /** Denumirea din tabelul lor. */
  denumire: string;
  clasa: Clasificare;
  /** Cere o decizie omeneasca: se trimite notificare comerciantului. */
  semnaleaza?: boolean;
  /** Nu mai are rost sa fie intrebat. */
  final?: boolean;
};

/**
 * Tabelul lor de statusuri de comanda, transcris cap-coada (40 de intrari).
 *
 * Coloana `clasa` e a NOASTRA; ea traduce evenimentul in treapta comenzii:
 *   la_comerciant  eticheta e facuta, dar marfa e inca la comerciant;
 *   in_retea       curierul o are;
 *   livrat         a ajuns la DESTINATAR;
 *   problema       nu misca comanda, dar cineva trebuie sa se uite;
 *   necunoscut     eveniment administrativ, fara inteles pentru comanda.
 */
export const STATUSURI: Record<number, Intrare> = {
  /* ⚠ „New" inseamna doar ca s-a creat eticheta. Marcata „expediata", comanda ar
     minti clientul: coletul e inca pe masa comerciantului. */
  1: { denumire: "Eticheta creata", clasa: "la_comerciant" },
  2: { denumire: "Preluat de curier", clasa: "in_retea" },
  3: { denumire: "Predat curierului", clasa: "in_retea" },
  /* „Shipment was not handed over to the courier, in time" — marfa n-a plecat, si
     nimeni n-ar afla altfel. */
  4: { denumire: "Nepredat la timp catre curier", clasa: "problema", semnaleaza: true },
  10: { denumire: "In depozitul curierului", clasa: "in_retea" },
  20: { denumire: "In tranzit", clasa: "in_retea" },
  21: { denumire: "Vamuit", clasa: "in_retea" },
  22: { denumire: "In asteptarea vamuirii", clasa: "in_retea" },
  30: { denumire: "In curs de livrare", clasa: "in_retea" },
  31: { denumire: "Adresa gresita", clasa: "problema", semnaleaza: true },
  33: { denumire: "Colet avariat", clasa: "problema", semnaleaza: true },
  34: { denumire: "Livrare intarziata", clasa: "in_retea", semnaleaza: true },
  35: { denumire: "Nelivrat", clasa: "problema", semnaleaza: true },
  /* ⚠ 36 si 37 sunt incercari de livrare esuate, dar sunt purtare NORMALA: curierul
     revine. Semnalate, ar umple clopotelul si l-ar face de necitit tocmai cand
     apare ceva adevarat. Aceeasi hotarare ca la „Avizat" al Postei. */
  36: { denumire: "Destinatarul nu era acasa", clasa: "in_retea" },
  37: { denumire: "Sediul destinatarului era inchis", clasa: "in_retea" },
  38: { denumire: "Retinut in depozit", clasa: "problema", semnaleaza: true },
  39: { denumire: "Redirectionat catre alta adresa", clasa: "in_retea", semnaleaza: true },
  40: { denumire: "Refuzat de destinatar", clasa: "problema", semnaleaza: true },
  41: { denumire: "Eroare de scanare sau date lipsa", clasa: "necunoscut", semnaleaza: true },
  42: { denumire: "Livrare reprogramata", clasa: "in_retea" },
  43: { denumire: "Control de securitate", clasa: "in_retea", semnaleaza: true },
  44: { denumire: "Se ridica de la oficiul curierului", clasa: "in_retea" },
  45: { denumire: "Incarcat in locker", clasa: "in_retea" },
  46: { denumire: "Termen de pastrare in locker depasit", clasa: "problema", semnaleaza: true },
  47: { denumire: "Probleme tehnice la locker", clasa: "problema", semnaleaza: true },
  48: { denumire: "In asteptarea returului", clasa: "problema", semnaleaza: true },
  49: { denumire: "Vama cere informatii", clasa: "problema", semnaleaza: true },
  /* In tabelul lor descrierea e chiar „-". Nu ghicim ce inseamna. */
  90: { denumire: "Status personalizat", clasa: "necunoscut" },

  /* ── Cele finale (100+). Steagul lor si al nostru sunt de acord aici. ── */
  100: { denumire: "Livrat", clasa: "livrat", final: true },
  101: { denumire: "Distrus", clasa: "problema", semnaleaza: true, final: true },
  102: { denumire: "Pierdut de curier", clasa: "problema", semnaleaza: true, final: true },
  /* ⚠ Livrare PARTIALA la o expediere cu mai multe colete: nu e nici livrare, nici
     esec. Marcata livrata, comanda ar trece drept incheiata cu marfa lipsa. */
  103: { denumire: "Livrare partiala", clasa: "problema", semnaleaza: true, final: true },
  104: { denumire: "Returnat expeditorului", clasa: "problema", semnaleaza: true, final: true },
  105: { denumire: "Despagubit", clasa: "problema", semnaleaza: true, final: true },
  /* Anulat de expeditor, adica de comerciantul insusi: stie deja, nu se semnaleaza. */
  106: { denumire: "Anulat", clasa: "problema", final: true },
  107: { denumire: "Anulat de curier", clasa: "problema", semnaleaza: true, final: true },
  108: { denumire: "Anulat de sistem", clasa: "problema", semnaleaza: true, final: true },
  109: { denumire: "Urmarire expirata", clasa: "problema", semnaleaza: true, final: true },
  110: { denumire: "Retur confirmat", clasa: "problema", semnaleaza: true, final: true },
};

/** Statusurile dupa care marfa s-a intors la comerciant. */
const RETUR = new Set([104, 110]);

/**
 * Tabelul LOR de statusuri ale rambursului.
 *
 * ⚠ NICIUN ALT TRANSPORTATOR NU NE DA ASTA: statusul BANILOR, separat de al
 * coletului, normalizat peste toti curierii.
 *
 * ⚠ SI TOTUSI, IN FAZA ASTA NU MISCA `payment_status`. Se arata pe comanda si se
 * semnaleaza cand banii au fost virati, atat. Motivul e scris cu sange in proiect:
 * cronul de reconciliere care INCASA pe comenzi anulate a fost un P0 produs chiar
 * de o reparatie, iar la statusul 71 al Postei am ales sa nu marcam livrarea
 * tocmai fiindca la ramburs „livrat" inseamna „bani incasati".
 *
 * Mutarea automata se face intr-o faza separata, dupa ce s-a vazut pe date reale
 * ca `3 Paid` chiar inseamna ce credem.
 */
export const STATUSURI_RAMBURS: Record<number, { denumire: string; final?: boolean; semnaleaza?: boolean }> = {
  1: { denumire: "Ramburs neincasat" },
  2: { denumire: "Ramburs incasat de curier" },
  3: { denumire: "Ramburs virat catre tine", final: true, semnaleaza: true },
  99: { denumire: "Ramburs neurmaribil", final: true, semnaleaza: true },
};

/**
 * `clientStatusId` ca numar, sau `null`.
 *
 * Primeste si sir: coloana din baza e `text` (ca sa poata pastra o valoare
 * neasteptata asa cum a venit).
 */
export function codNumeric(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
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

/**
 * Expedierea si-a incheiat drumul.
 *
 * ⚠ Se ia din tabelul NOSTRU, nu din `isFinalStatus`-ul lor. Aici cele doua sunt
 * de acord, dar regula ramane: la Posta steagul furnizorului minte in doua locuri,
 * si n-avem cum sti dinainte cand incepe sa minta si al lor.
 */
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

/** Un cod reprezentativ pentru o treapta, ca `statusUrmator` sa poata fi refolosit. */
function codAlTreptei(status: OrderStatus): number {
  switch (status) {
    case "delivered": return 100;
    case "shipped": return 20;
    case "processing": return 1;
    default: return 0;
  }
}

/**
 * Treapta cea mai INALTA atinsa in tot istoricul.
 *
 * ⚠ EXISTA FIINDCA ULTIMA STARE NU E DE AJUNS — lectie platita la GLS. Intre doua
 * treceri pot intra mai multe evenimente, iar ultimul poate fi administrativ
 * („Eroare de scanare", „Redirectionat"). Citind doar pe el, livrarea petrecuta
 * intre timp n-ar mai fi vazuta niciodata — iar la o comanda cu plata la livrare
 * asta inseamna bani neinregistrati.
 */
export function statusFinalDinStari(statusCurent: string, stari: StareInnoship[]): OrderStatus | null {
  let ceaMaiInalta: OrderStatus | null = null;
  let treapta = -1;

  for (const s of stari ?? []) {
    const tinta = statusComandaDinCod(s?.clientStatusId);
    if (!tinta) continue;
    const t = TREAPTA[tinta] ?? -1;
    if (t > treapta) { treapta = t; ceaMaiInalta = tinta; }
  }

  return ceaMaiInalta ? statusUrmator(statusCurent, codAlTreptei(ceaMaiInalta)) : null;
}

/**
 * Ultima stare din istoric.
 *
 * ⚠ Nu se increde in ordinea in care vin: se sorteaza dupa `eventDate`. Formatul
 * lor e ISO („2022-04-21T15:00:00"), deci `Date.parse` il citeste — spre deosebire
 * de Posta, unde data era „ZZ.LL.AAAA HH:mm" si trebuia sparta de mana.
 */
export function ultimaStare(stari: StareInnoship[] | null | undefined): StareInnoship | null {
  const lista = stari ?? [];
  if (lista.length === 0) return null;

  let ceaMaiNoua: StareInnoship | null = null;
  let celMaiMare = -Infinity;
  for (const s of lista) {
    const t = Date.parse(s?.eventDate ?? "");
    if (Number.isFinite(t) && t > celMaiMare) { celMaiMare = t; ceaMaiNoua = s; }
  }
  return ceaMaiNoua ?? lista[lista.length - 1];
}

/** Statusul rambursului, pentru afisare si semnalare. */
export function descriereRamburs(cod: unknown, dinRaspuns?: string | null): string {
  const n = codNumeric(cod);
  const i = n !== null ? STATUSURI_RAMBURS[n] : undefined;
  if (i) return i.denumire;
  const dat = (dinRaspuns ?? "").trim();
  if (dat) return dat;
  return n !== null ? `Status ramburs ${n}` : "Status ramburs necunoscut";
}

export function rambursTrebuieSemnalat(cod: unknown): boolean {
  const n = codNumeric(cod);
  return n !== null && STATUSURI_RAMBURS[n]?.semnaleaza === true;
}

/** Cum se explica unui om clasificarea. Se arata in pagina de configurare. */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut — comanda nu se misca si nu se semnaleaza nimic",
};
