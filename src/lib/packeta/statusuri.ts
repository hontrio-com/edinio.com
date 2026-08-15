import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusurile Packeta → statusul comenzii.
 *
 * ═══ NOMENCLATORUL E PUBLICAT, SI E NUMERIC ═══
 *
 * `docs/packet-tracking/status-codes.mdx` da 17 coduri, fiecare cu numele englez
 * si cu descrierea intelesului. Deci potrivirea se face pe NUMAR, nu pe cuvinte —
 * spre deosebire de eColet si Pall-Ex, unde furnizorul nu publica nimic si harta
 * se face pe fraze.
 *
 * ⚠ **Codurile 8 si 13 NU EXISTA** in nomenclatorul lor. Nu e o scapare a
 * transcrierii: sirul sare de la 7 la 9 si de la 12 la 14.
 *
 * ═══ ⚠ EI NU DECLARA CARE STATUS E FINAL ═══
 *
 * Spre deosebire de Poșta Română, tabelul Packeta n-are coloana „final". Deci
 * `final` de mai jos e in INTREGIME hotararea noastra, luata din descrierea
 * fiecarui status. Cele trei sfarsituri sunt `7 delivered`, `10 returned` si
 * `11 cancelled`.
 *
 * ═══ ⚠ TREI TRADUCERI CARE SUNT DECIZII, NU COPIERI ═══
 *
 * 1. **`5 ready for pickup` NU E LIVRARE.** Coletul e la punct si asteapta; omul
 *    n-a venit inca. Marcat livrat, o comanda cu ramburs ar trece drept incasata
 *    desi banii n-au fost predati.
 * 2. **`12 collected` NU E LIVRARE nici el.** Descrierea lor: coletul a fost
 *    preluat de la comerciant. E inceputul drumului, nu sfarsitul — iar cuvantul
 *    englezesc trage exact in partea gresita.
 * 3. **`16 delivery attempt` nu se semnaleaza.** E purtare normala, ca „Avizat" la
 *    Posta: cine nu e acasa primeste o a doua incercare. Semnalat, ar umple
 *    clopotelul comerciantului cu evenimente la care n-are ce face.
 *
 * ⚠ **`999 unknown` e un status DECLARAT de ei**, nu o scapare a noastra. De aia
 * are intrare proprie si clasa `necunoscut`: e diferenta dintre „ei spun ca nu
 * stiu" si „noi n-am inteles ce ne-au trimis".
 *
 * ═══ IMPLICITUL E TACEREA ═══
 *
 * Un cod care nu e in tabel NU misca comanda si NU o scoate din urmarire.
 * Nomenclatorul e o fotografie a documentatiei la data scrierii; ei il pot largi
 * oricand, iar un cod nou care ar cadea din greseala in „livrat" ar inchide o
 * comanda neplatita.
 */

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Intrare = {
  /** Numele englez din nomenclatorul lor, neschimbat — e cheia catre documentatie. */
  nume: string;
  /** Ce se arata comerciantului, in romana. */
  ro: string;
  clasa: Clasificare;
  /** Cere o decizie omeneasca: se trimite notificare comerciantului. */
  semnaleaza?: boolean;
  /** Nu mai are rost sa fie intrebat: coletul si-a incheiat drumul. */
  final?: boolean;
};

/**
 * `docs/packet-tracking/status-codes.mdx`, transcris cap-coada.
 *
 * Coloana `clasa` e a NOASTRA — traduce evenimentul in treapta comenzii:
 *
 *   la_comerciant  coletul e anuntat, dar marfa e inca la comerciant;
 *   in_retea       Packeta (sau curierul ei) il are;
 *   livrat         a ajuns la DESTINATAR;
 *   problema       s-a intors, a fost refuzat sau anulat;
 *   necunoscut     ei insisi spun ca nu stiu.
 */
export const STATUSURI: Record<number, Intrare> = {
  1: { nume: "received data", ro: "Date primite", clasa: "la_comerciant" },
  2: { nume: "arrived", ro: "Ajuns la depozit", clasa: "in_retea" },
  3: { nume: "prepared for departure", ro: "Pregatit de plecare", clasa: "in_retea" },
  4: { nume: "departed", ro: "In tranzit", clasa: "in_retea" },
  /* ⚠ NU e livrare: coletul asteapta la punct, clientul n-a venit. */
  5: { nume: "ready for pickup", ro: "Gata de ridicare", clasa: "in_retea" },
  /* Aduce `externalTrackingCode` — numarul cu care clientul urmareste la curierul real. */
  6: { nume: "handed to carrier", ro: "Predat curierului", clasa: "in_retea" },
  7: { nume: "delivered", ro: "Livrat", clasa: "livrat", final: true },
  9: { nume: "posted back", ro: "Se intoarce la expeditor", clasa: "problema", semnaleaza: true },
  10: { nume: "returned", ro: "Returnat expeditorului", clasa: "problema", semnaleaza: true, final: true },
  11: { nume: "cancelled", ro: "Anulat", clasa: "problema", semnaleaza: true, final: true },
  /* ⚠ „collected" = preluat DE LA COMERCIANT. Inceputul drumului, nu sfarsitul. */
  12: { nume: "collected", ro: "Preluat de la expeditor", clasa: "in_retea" },
  14: { nume: "customs", ro: "In vama", clasa: "in_retea" },
  15: { nume: "reverse packet arrived", ro: "Colet de retur ajuns", clasa: "problema", semnaleaza: true },
  /* Purtare normala: urmeaza o a doua incercare. Nu se semnaleaza. */
  16: { nume: "delivery attempt", ro: "Incercare de livrare", clasa: "in_retea" },
  17: { nume: "rejected by recipient", ro: "Refuzat de destinatar", clasa: "problema", semnaleaza: true },
  999: { nume: "unknown", ro: "Stare necunoscuta la Packeta", clasa: "necunoscut" },
};

/** Codurile care inseamna ca marfa se intoarce sau s-a intors. */
const RETUR = new Set([9, 10, 15]);

/**
 * Codul, ca numar.
 *
 * ⚠ `999` e valid, deci nu exista plafon superior. Si `0` nu e un cod al lor —
 * un zero venit pe fir inseamna „camp gol citit ca numar", adica exact greseala
 * pe care XML-ul o face usoara. Vezi `xml.ts`.
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

/**
 * Textul pentru om.
 *
 * Necunoscut, se arata ce a spus furnizorul, iar daca nici el n-a spus nimic,
 * chiar codul. Nu se inventeaza text: „Status 42" e cinstit, „In tranzit" ar fi o
 * minciuna comoda.
 */
export function descriereStatus(cod: unknown, dinRaspuns?: string | null): string {
  const i = intrare(cod);
  if (i) return i.ro;
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
 * Coletul si-a incheiat drumul.
 *
 * ⚠ Hotararea e a noastra: nomenclatorul Packeta nu declara nimic final. Vezi
 * antetul.
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
       ale comerciantului, nu ale transportatorului. */
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

/** O stare din istoricul lor, redusa la ce ne trebuie. */
export interface StarePacketa {
  cod: number | null;
  nume: string;
  /** `dateTime` din raspuns, ca text. Forma exacta nu e documentata. */
  cand: string | null;
  /** Numai la `6 handed to carrier`: numarul de la curierul real. */
  codExtern?: string | null;
}

/**
 * Treapta cea mai INALTA atinsa in tot istoricul.
 *
 * ⚠ EXISTA FIINDCA ULTIMA STARE NU E DE AJUNS, si e o lectie platita la GLS.
 * Intre doua treceri ale cronului pot intra mai multe evenimente, iar ultimul
 * poate fi unul administrativ. Citind doar pe el, livrarea petrecuta intre timp
 * n-ar mai fi vazuta niciodata — iar la o comanda cu plata la livrare asta
 * inseamna bani neinregistrati.
 */
export function statusFinalDinStari(statusCurent: string, stari: StarePacketa[]): OrderStatus | null {
  let ceaMaiInalta: OrderStatus | null = null;
  let treapta = -1;

  for (const s of stari) {
    const tinta = statusUrmator(statusCurent, s.cod);
    if (!tinta) continue;
    const t = TREAPTA[tinta] ?? -1;
    if (t > treapta) { treapta = t; ceaMaiInalta = tinta; }
  }
  return ceaMaiInalta;
}

/**
 * Ultima stare din istoric.
 *
 * ⚠ Ordinea din raspuns NU e documentata, deci nu se presupune. Se ia cea mai
 * tarzie dupa `cand`; la date egale sau necitibile, ultima din lista — asa cel
 * putin rezultatul e stabil, nu la voia intamplarii.
 */
export function ultimaStare(stari: StarePacketa[]): StarePacketa | null {
  let cea: StarePacketa | null = null;
  let momentul = -Infinity;
  for (const s of stari) {
    const t = laMoment(s.cand);
    if (cea === null || t === null || t >= momentul) {
      if (t !== null && t < momentul) continue;
      cea = s;
      if (t !== null) momentul = t;
    }
  }
  return cea;
}

/**
 * Momentul unei stari, in milisecunde.
 *
 * ⚠ Documentatia DA forma: `StatusRecord.dateTime` e „`Y-m-d\TH:i:s`", cu exemplu
 * — deci ISO fara fus. Ce NU spune e CARE fus, iar asta conteaza: citita ca UTC, o
 * livrare de dimineata ar cadea in ziua precedenta.
 *
 * Se citeste ca ora Romaniei, fiindca acolo sunt comerciantii nostri si acolo se
 * uita cand compara cu ce le spune clientul. Cand raspunsul ARE fus explicit, se
 * ia asa cum e. `null` cand nu se poate citi: o data gresita e mai rea decat lipsa
 * ei, fiindca ar reordona istoricul.
 */
export function laMoment(text: string | null | undefined): number | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  /* Cu fus explicit (ISO), se ia asa cum e. */
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) {
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) {
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : null;
  }
  /*
   * Fara fus, se presupune ora Romaniei. Diferenta fata de UTC se afla cerandu-i
   * lui `Intl` chiar ziua aceea — vara sunt trei ore, iarna doua, iar o constanta
   * ar fi gresit jumatate de an.
   */
  const ca_utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const proba = new Date(ca_utc);
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bucharest", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(proba);
  const g = (tip: string) => Number(p.find((x) => x.type === tip)?.value ?? "0");
  const ca_local = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return ca_utc - (ca_local - ca_utc);
}

export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Coletul a ajuns la destinatar.",
  in_retea: "Coletul e la Packeta sau la curierul ei.",
  la_comerciant: "Packeta stie de colet, dar marfa e inca la tine.",
  problema: "Coletul se intoarce, a fost refuzat sau anulat.",
  necunoscut: "Packeta nu stie in ce stare e coletul.",
};
