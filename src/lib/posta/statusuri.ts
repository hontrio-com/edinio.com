import type { OrderStatus } from "@/lib/orders/status";
import type { StarePosta, StatusNomenclator } from "./client";

/**
 * Statusurile Poșta Română → statusul comenzii.
 *
 * ═══ CE E ALTFEL, IN BINE, FATA DE ULTIMII TREI TRANSPORTATORI ═══
 *
 * Posta PUBLICA nomenclatorul: Anexa 2 din documentatie da 55 de statusuri cu
 * `idStatus` NUMERIC, denumire interna, denumire web si un steag „status final".
 * Si mai exista si `GET /api/statusuri-trace`, care il serveste viu.
 *
 * La eColet si Pall-Ex harta se face pe CUVINTE, fiindca furnizorul nu publica
 * nicio lista si nu ramane decat sa ghicesti dupa fraze. Aici nu: tabelul de mai
 * jos e transcrierea Anexei 2, iar potrivirea e pe numar. Deci nu exista „not
 * delivered" care sa treaca drept livrare.
 *
 * ═══ ⚠ DOUA LOCURI IN CARE NU-I DAM CREZARE STEAGULUI LOR ═══
 *
 * 1. **56 „Anulat" are la ei `statusFinal` FALS.** Luat de bun, o comanda anulata
 *    ar fi interogata la fiecare rulare a cronului, la nesfarsit, si ar sta in
 *    capul cozii (sorteaza dupa cea mai veche verificare) blocand comenzile vii.
 *    La noi e FINAL.
 *
 * 2. **10 „Pierdut" NU e final, desi ar parea.** Chiar tabelul lor are 18
 *    „Regasit" — un status care nu poate veni decat DUPA o pierdere. Scos din
 *    urmarire, coletul regasit n-ar mai fi vazut niciodata.
 *
 * ═══ ⚠ IMPLICITUL E TACEREA ═══
 *
 * Un `idStatus` care nu e in tabel NU misca comanda si NU o scoate din urmarire.
 * Anexa 2 e o fotografie a nomenclatorului la 30.10.2025; ei il pot largi
 * oricand. `codutiNecunoscute` compara tabelul de aici cu nomenclatorul viu, iar
 * pagina de configurare arata diferenta — asa se afla ca a aparut ceva nou, in loc
 * sa se ghiceasca.
 */

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Intrare = {
  /** Denumirea interna din Anexa 2. */
  denumire: string;
  /** Denumirea „web" din Anexa 2 — cea care se arata omului. */
  web: string;
  clasa: Clasificare;
  /** Cere o decizie omeneasca: se trimite notificare comerciantului. */
  semnaleaza?: boolean;
  /** Nu mai are rost sa fie intrebat: coletul si-a incheiat drumul. */
  final?: boolean;
};

/**
 * Anexa 2, transcrisa cap-coada.
 *
 * Coloana `clasa` e a NOASTRA: ea traduce evenimentul postal in treapta comenzii.
 * Regula dupa care s-a completat, ca sa se poata continua la fel:
 *
 *   la_comerciant  marfa e inca la comerciant (scanata pe borderou, dar nepredata);
 *   in_retea       Posta o are;
 *   livrat         a ajuns la DESTINATAR;
 *   problema       nu misca comanda, dar cineva trebuie sa se uite;
 *   necunoscut     eveniment administrativ, fara inteles pentru comanda.
 */
export const STATUSURI: Record<number, Intrare> = {
  /* ⚠ „Avizat" e purtare NORMALA la posta (destinatarul n-a fost gasit si i s-a
     lasat aviz), deci nu se semnaleaza. „Reavizat" da: a doua incercare inseamna
     ca returul se apropie. */
  1: { denumire: "Avizat", web: "Avizat", clasa: "in_retea" },
  2: { denumire: "Cazut la pastrare", web: "Trimis la pastrare", clasa: "problema", semnaleaza: true },
  3: { denumire: "Descarcat de pe CPA", web: "In prelucrare", clasa: "in_retea" },
  4: { denumire: "Distribuit", web: "Predat la destinatar", clasa: "livrat", final: true },
  5: { denumire: "Iesit din compunere", web: "In prelucrare", clasa: "in_retea" },
  6: { denumire: "Iesit din gestiune", web: "In prelucrare", clasa: "in_retea" },
  7: { denumire: "Incarcat pe CPA", web: "In transport", clasa: "in_retea" },
  8: { denumire: "Intrare in compunere", web: "In prelucrare", clasa: "in_retea" },
  9: { denumire: "Intrat in gestiune", web: "In prelucrare", clasa: "in_retea" },
  /* ⚠ NU e final: 18 „Regasit" vine tocmai dupa asta. Vezi antetul. */
  10: { denumire: "Pierdut", web: "Pierdut", clasa: "problema", semnaleaza: true },
  11: { denumire: "Predare catre UP", web: "Expediat din", clasa: "in_retea" },
  12: { denumire: "Primire de la UP", web: "Sosit in", clasa: "in_retea" },
  13: { denumire: "Predat la factor", web: "Predat la factor", clasa: "in_retea" },
  14: { denumire: "Prezentat", web: "Primit de la expeditor", clasa: "in_retea" },
  15: { denumire: "Reambalat", web: "In prelucrare", clasa: "in_retea" },
  16: { denumire: "Reavizat", web: "Reavizat", clasa: "in_retea", semnaleaza: true },
  17: { denumire: "Lichidare cursa", web: "In prelucrare", clasa: "in_retea" },
  18: { denumire: "Regasit", web: "Regasit", clasa: "in_retea", semnaleaza: true },
  19: { denumire: "Distribuit si Retur de confirmare", web: "Predat la destinatar", clasa: "livrat", final: true },
  20: { denumire: "Returnat", web: "Returnat catre expeditor", clasa: "problema", semnaleaza: true, final: true },
  /*
   * ⚠ „Schimbare cod" inseamna ca trimiterea are alt numar de acum. AWB-ul nostru
   * poate inceta sa mai primeasca evenimente, iar comanda ar ramane tacut in urma.
   * Nu misca statusul, dar se semnaleaza: e singurul fel in care omul afla.
   */
  21: { denumire: "Schimbare cod", web: "In prelucrare", clasa: "necunoscut", semnaleaza: true },
  22: { denumire: "Reexpediat", web: "Reexpediat", clasa: "in_retea", semnaleaza: true },
  23: { denumire: "Eticheta de rezerva", web: "In prelucrare", clasa: "necunoscut" },
  24: { denumire: "Completare prezentare", web: "In prelucrare", clasa: "necunoscut" },
  25: { denumire: "Provine din", web: "In prelucrare", clasa: "necunoscut" },
  /* Oficiul a primit coletul inapoi de la factor: livrarea n-a reusit, dar
     coletul e tot in reteaua lor. Perechea obisnuita a lui „Avizat". */
  26: { denumire: "Primit de la factor", web: "In prelucrare", clasa: "in_retea" },
  27: { denumire: "Ramas la factor", web: "In prelucrare", clasa: "in_retea" },
  /* ⚠ 33 e SCANAT pe borderou (inca la comerciant), 34 e PREZENTAT (predat). */
  33: { denumire: "Scanat pe borderou", web: "Prezentare serie", clasa: "la_comerciant" },
  34: { denumire: "Prezentat pe borderou", web: "Prezentare serie", clasa: "in_retea" },
  35: { denumire: "Incercare prezentari multiple", web: "In prelucrare", clasa: "necunoscut" },
  41: { denumire: "Formare compunere", web: "In prelucrare", clasa: "in_retea" },
  42: { denumire: "Desfacere compunere", web: "In prelucrare", clasa: "in_retea" },
  43: { denumire: "Predare/primire intre formatiuni", web: "In prelucrare", clasa: "in_retea" },
  44: { denumire: "Mutare fortata in gestiune", web: "In prelucrare", clasa: "in_retea" },
  51: { denumire: "Intrat in BSI pentru import", web: "Sosit in Romania", clasa: "in_retea" },
  52: { denumire: "Intrat in BSI pentru export", web: "In prelucrare", clasa: "in_retea" },
  53: { denumire: "Intrat in sac pentru export", web: "Pregatit pentru export", clasa: "in_retea" },
  54: { denumire: "Inchidere consignement", web: "Expediat din Romania", clasa: "in_retea" },
  /* ⚠ Final la NOI, desi la ei nu. Vezi antetul. */
  56: { denumire: "Anulat", web: "Anulat", clasa: "problema", semnaleaza: true, final: true },
  57: { denumire: "Plecat din BSI", web: "Plecat din BSI", clasa: "in_retea" },
  58: { denumire: "Retinut de autoritati", web: "Retinut de autoritati", clasa: "problema", semnaleaza: true },
  59: { denumire: "Predat la masina", web: "Predat la masina", clasa: "in_retea" },
  /* Posta se ofera doar pentru destinatii interne, deci un eveniment de vama
     inseamna ca ceva nu e cum credem. Se semnaleaza. */
  60: { denumire: "Intrat in vama", web: "Intrat in vama", clasa: "in_retea", semnaleaza: true },
  61: { denumire: "Iesit din vama", web: "Iesit din vama", clasa: "in_retea" },
  /* In tabelul lor scrie chiar „N", la amandoua coloanele. Nu ghicim ce inseamna. */
  62: { denumire: "N", web: "N", clasa: "necunoscut" },
  63: { denumire: "Notificat prin SMS", web: "Notificat prin SMS", clasa: "in_retea" },
  64: { denumire: "Incarcat (Pachetomat)", web: "Incarcat la pachetomat", clasa: "in_retea" },
  65: { denumire: "Aviz prin SMS (Pachetomat)", web: "Aviz prin SMS (Pachetomat)", clasa: "in_retea" },
  66: { denumire: "Aviz prin E-Mail (Pachetomat)", web: "Aviz prin E-Mail (Pachetomat)", clasa: "in_retea" },
  68: { denumire: "Reamintire prin SMS (Pachetomat)", web: "Reamintire prin SMS (Pachetomat)", clasa: "in_retea" },
  69: { denumire: "Reamintire prin E-Mail (Pachetomat)", web: "Reamintire prin E-Mail (Pachetomat)", clasa: "in_retea" },
  70: { denumire: "Reamintire SMS si E-Mail (Pachetomat)", web: "Reamintire SMS si E-Mail (Pachetomat)", clasa: "in_retea" },
  /*
   * ⚠ 71 SE CITESTE A LIVRARE SI TOTUSI NU O MARCAM. Hotarare, nu scapare.
   *
   * „Predat de la pachetomat" inseamna aproape sigur ca destinatarul si-a luat
   * coletul. Dar in tabelul LOR `statusFinal` e FALS, spre deosebire de 4 si 19,
   * care sunt ADEVARAT — deci fie e o nepotrivire in nomenclatorul lor, fie
   * inseamna altceva. Nu putem sti: nu exista cont pe care sa probam.
   *
   * Cele doua greseli nu costa la fel. Marcata livrata pe nedrept, comanda cu
   * plata la livrare trece drept incasata si poate declansa factura automata —
   * bani inregistrati care n-au intrat. Nemarcata desi a fost livrata, comanda
   * ramane „expediata", comerciantul o vede si o muta cu mana.
   *
   * Deci: ramane „in retea" SI SE SEMNALEAZA, ca omul sa se uite. Cand se afla pe
   * fir ce inseamna, se schimba `clasa` in „livrat" si se scoate `semnaleaza`.
   */
  71: { denumire: "Predat (Pachetomat)", web: "Predat de la pachetomat", clasa: "in_retea", semnaleaza: true },
  72: { denumire: "Retras din pachetomat", web: "Retras din pachetomat", clasa: "problema", semnaleaza: true },
  73: { denumire: "Preluat de la expeditor", web: "Preluat de la expeditor", clasa: "in_retea" },
};

/** Statusurile dupa care marfa s-a intors la comerciant. */
const RETUR = new Set([20]);

/**
 * `idStatus` ca numar, sau `null`.
 *
 * ⚠ Primeste si sir: coloana `posta_status_code` e `text` (ca sa poata pastra o
 * valoare neasteptata asa cum a venit), iar raspunsul lor poate purta numarul
 * oricum. Orice nu e intreg pozitiv devine `null`, si atunci nu se misca nimic.
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

/** Denumirea pentru om. Necunoscuta, se arata chiar codul — nu se inventeaza text. */
export function descriereStatus(cod: unknown, dinRaspuns?: string | null): string {
  const i = intrare(cod);
  if (i) return i.web;
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
 * Coletul si-a incheiat drumul: nu mai are rost sa fie intrebat.
 *
 * ⚠ Se ia din tabelul NOSTRU, nu din `statusFinal`-ul lor. Vezi antetul: 56 e
 * final la noi si nu la ei, iar 10 e invers.
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
       ale comerciantului, nu ale Postei. */
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

/**
 * Treapta cea mai INALTA atinsa in tot istoricul.
 *
 * ⚠ EXISTA FIINDCA ULTIMA STARE NU E DE AJUNS, si asta e o lectie platita la GLS.
 * Intre doua treceri ale cronului pot intra mai multe evenimente, iar ultimul
 * poate fi unul administrativ („Schimbare cod", „Reambalat"). Citind doar pe el,
 * livrarea petrecuta intre timp n-ar mai fi vazuta niciodata — iar la o comanda cu
 * plata la livrare asta inseamna bani neinregistrati.
 */
export function statusFinalDinStari(statusCurent: string, stari: StarePosta[]): OrderStatus | null {
  let cea_mai_inalta: OrderStatus | null = null;
  let treapta = -1;

  for (const s of stari) {
    const tinta = statusComandaDinCod(s?.idStatus);
    if (!tinta) continue;
    const t = TREAPTA[tinta] ?? -1;
    if (t > treapta) {
      treapta = t;
      cea_mai_inalta = tinta;
    }
  }

  return cea_mai_inalta ? statusUrmator(statusCurent, codAlStatusului(cea_mai_inalta)) : null;
}

/** Un cod reprezentativ pentru o treapta, ca `statusUrmator` sa poata fi refolosit. */
function codAlStatusului(status: OrderStatus): number {
  switch (status) {
    case "delivered": return 4;   // Distribuit
    case "shipped": return 14;    // Prezentat
    case "processing": return 33; // Scanat pe borderou
    default: return 0;
  }
}

/**
 * Ultima stare din istoric.
 *
 * ⚠ Nu se increde in ordinea in care vin: se sorteaza dupa data lor („ZZ.LL.AAAA
 * HH:mm"), si abia daca datele nu se pot citi se cade pe ultima din lista.
 */
export function ultimaStare(stari: StarePosta[]): StarePosta | null {
  if (!stari.length) return null;

  let cea_mai_noua: StarePosta | null = null;
  let cel_mai_mare = -Infinity;
  for (const s of stari) {
    const t = laMomentUtc(s?.data ?? s?.dataInregistrare);
    if (t !== null && t > cel_mai_mare) {
      cel_mai_mare = t;
      cea_mai_noua = s;
    }
  }
  return cea_mai_noua ?? stari[stari.length - 1];
}

/**
 * „ZZ.LL.AAAA HH:mm" → milisecunde, sau `null`.
 *
 * ⚠ Formatul e al lor si e neambiguu (ziua prima), dar NU e ISO — `new Date(...)`
 * pe el da `Invalid Date` in Node. Se sparge de mana.
 *
 * Se citeste ca ora Romaniei si se socoteste ca atare: e ceasul de la ghiseu.
 * Diferenta fata de UTC nu conta la comparatii intre doua date de la ei, dar
 * conteaza cand data ajunge in panou langa una a noastra.
 */
export function laMomentUtc(text: string | null | undefined): number | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec((text ?? "").trim());
  if (!m) return null;
  const [, z, l, a, hh, mm] = m;
  const ms = Date.UTC(Number(a), Number(l) - 1, Number(z), Number(hh ?? 0), Number(mm ?? 0));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Codurile pe care nomenclatorul viu le are si tabelul de aici nu.
 *
 * ⚠ De aia merita chemat `GET /api/statusuri-trace`: Anexa 2 e o fotografie de la
 * 30.10.2025, iar un cod nou aparut la ei ar trece prin `clasificaStatus` ca
 * „necunoscut" — adica tacut. Pagina de configurare arata diferenta, deci se afla
 * ca s-a schimbat ceva in loc sa se ghiceasca peste luni.
 */
export function codutiNecunoscute(nomenclator: StatusNomenclator[]): { cod: number; nume: string }[] {
  const noi: { cod: number; nume: string }[] = [];
  for (const s of nomenclator) {
    const n = codNumeric(s?.idStatus);
    if (n === null || STATUSURI[n]) continue;
    noi.push({ cod: n, nume: (s?.statusWeb || s?.status || "").trim() || `Status ${n}` });
  }
  return noi.sort((a, b) => a.cod - b.cod);
}

/** Cum se explica unui om clasificarea. Se arata in pagina de configurare. */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut — comanda nu se misca si nu se semnaleaza nimic",
};
