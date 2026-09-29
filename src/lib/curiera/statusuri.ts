import type { OrderStatus } from "@/lib/orders/status";
import type { EvenimentCuriera } from "./client";

/**
 * Starile Curiera -> statusul comenzii.
 *
 * ═══ STARILE SUNT OPT, SI VIN IN DOUA LIMBI ═══
 *
 * Documentatia: draft, uncollected, active, notified, delivered, returned, canceled, exception,
 * iar „Romanian companies may use Romanian language status names": initial, neridicat, in_curs,
 * avizat, livrat, returnat, anulat, exceptie. Contul de test raspunde in romana (`list_statuses`,
 * masurat pe 29.09.2026). Se primesc AMANDOUA si se aduc la forma romaneasca. Documentatia scrie
 * si „cancelled", si „canceled"; si `change_status` pomeneste `in_transit`.
 *
 * ═══ ⚠ CODUL NU E STAREA ═══
 *
 * Langa stare vine un COD (motivul): „A2 Nu raspunde la telefon", „LIVP Livrat partener",
 * „PC Plata cu cardul". Codurile sunt text liber, pe cont (26 pe contul de test, unele cu spatii
 * si diacritice), si acelasi cod apare sub stari diferite: „LIVP" e permis sub in_curs si avizat,
 * „Colet deteriorat" si sub livrat. Deci NUMAI STAREA misca o comanda. Codul intra in cheia
 * salvata (`stare|cod`), ca un „avizat|A2" urmat de „avizat|A3" sa fie un eveniment nou.
 *
 * ═══ ⚠ CE NU S-A VAZUT NU MISCA NIMIC ═══
 *
 * O stare necunoscuta nu schimba comanda, nu se semnaleaza si NU scoate coletul din urmarire.
 */

export type StatusCuriera =
  | "initial" | "neridicat" | "in_curs" | "avizat" | "livrat" | "returnat" | "anulat" | "exceptie";

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Intrare = {
  denumire: string;
  clasa: Clasificare;
  /** Cere o decizie omeneasca: se trimite notificare comerciantului. */
  semnaleaza?: boolean;
  /** Nu mai are rost sa fie intrebat. */
  final?: boolean;
};

export const STARI: Record<StatusCuriera, Intrare> = {
  /* Ciorna: nu e gata de ridicare. Emiterea noastra nu lasa ciorne cu motive (vezi client.ts),
     dar un cont setat sa porneasca in ciorna le produce pe toate asa. */
  initial: { denumire: "Expediere in ciorna la Curiera", clasa: "la_comerciant" },
  /*
   * ⚠ „Neridicat" NU inseamna „expediat": eticheta e facuta, marfa e inca la comerciant. Marcata
   * expediata, comanda ar minti clientul. Aceeasi hotarare ca la SmartShip (0) si Innoship (1).
   */
  neridicat: { denumire: "AWB emis, coletul n-a fost ridicat", clasa: "la_comerciant" },
  in_curs: { denumire: "In curs de livrare", clasa: "in_retea" },
  /*
   * ⚠ „Avizat" = cel putin o incercare de livrare ESUATA. Nu e final: urmeaza alta incercare
   * sau returul. Scos din urmarire aici, returul nu s-ar mai afla niciodata (lectia SmartShip).
   */
  avizat: { denumire: "Livrare nereusita, urmeaza o noua incercare", clasa: "problema", semnaleaza: true },
  livrat: { denumire: "Livrat", clasa: "livrat", final: true },
  returnat: { denumire: "Colet returnat expeditorului", clasa: "problema", semnaleaza: true, final: true },
  /*
   * ⚠ Anularea vazuta de CRON s-a facut in ALTA parte decat panoul nostru: anularea noastra
   * scoate numarul de pe comanda, deci coletul iese din interogare.
   */
  anulat: { denumire: "AWB anulat", clasa: "problema", semnaleaza: true, final: true },
  /*
   * ⚠ „Exceptie" NU e finala: pe contul de test exista codul „Rezolvat Intern" permis sub
   * in_curs, deci o exceptie se poate rezolva si coletul merge mai departe.
   */
  exceptie: { denumire: "Exceptie la Curiera", clasa: "problema", semnaleaza: true },
};

const ALIASURI: Record<string, StatusCuriera> = {
  initial: "initial", draft: "initial",
  neridicat: "neridicat", uncollected: "neridicat",
  in_curs: "in_curs", active: "in_curs", in_transit: "in_curs",
  avizat: "avizat", notified: "avizat",
  livrat: "livrat", delivered: "livrat",
  returnat: "returnat", returned: "returnat",
  anulat: "anulat", canceled: "anulat", cancelled: "anulat",
  exceptie: "exceptie", exception: "exceptie",
};

/** Starea in forma romaneasca, sau `null` daca nu o stim. */
export function normalizeazaStatus(v: unknown): StatusCuriera | null {
  if (typeof v !== "string") return null;
  return ALIASURI[v.trim().toLowerCase()] ?? null;
}

/**
 * Cheia salvata pe comanda: `stare|cod`, sau doar `stare` fara cod.
 * Starea necunoscuta se pastreaza BRUTA, ca sa se vada ce au trimis.
 */
export function cheieStare(status: string, cod?: string | null): string {
  const s = normalizeazaStatus(status) ?? status.trim();
  const c = (cod ?? "").trim();
  return c ? `${s}|${c}` : s;
}

/** Starea dintr-o cheie salvata (`stare|cod`) sau dintr-o stare simpla. */
export function statusDinCheie(cheie: string | null | undefined): StatusCuriera | null {
  if (!cheie) return null;
  return normalizeazaStatus(cheie.split("|")[0]);
}

function intrare(v: unknown): Intrare | null {
  const s = typeof v === "string" ? statusDinCheie(v) : null;
  return s ? STARI[s] : null;
}

export function clasificaStatus(v: unknown): Clasificare {
  return intrare(v)?.clasa ?? "necunoscut";
}

export function trebuieSemnalat(v: unknown): boolean {
  return intrare(v)?.semnaleaza === true;
}

export function eStareFinala(v: unknown): boolean {
  return intrare(v)?.final === true;
}

export function esteRetur(v: unknown): boolean {
  return (typeof v === "string" ? statusDinCheie(v) : null) === "returnat";
}

/**
 * Denumirea pentru om: starea, apoi motivul lor, daca l-au dat.
 * O stare necunoscuta se arata cum au scris-o ei.
 */
export function descriereStare(status: string, cod?: string | null, numeCod?: string | null): string {
  const i = intrare(status);
  const baza = i?.denumire ?? (status.trim() ? `Stare Curiera „${status.trim()}”` : "Stare necunoscuta");
  const motiv = (numeCod ?? "").trim() || (cod ?? "").trim();
  return motiv ? `${baza} (${motiv})` : baza;
}

export function statusComandaDinStatus(v: unknown): OrderStatus | null {
  switch (clasificaStatus(v)) {
    case "livrat": return "delivered";
    case "in_retea": return "shipped";
    case "la_comerciant": return "processing";
    /* Sfarsiturile proaste au inteles, dar anularea si rambursarea sunt decizii ale
       comerciantului, nu ale curierului. */
    default: return null;
  }
}

/** Ordinea pe scara comenzii. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4,
};

/**
 * Ce status primeste comanda, sau `null` daca nu se schimba nimic.
 *
 * Nu se coboara niciodata (starile pot sosi in alta ordine), iar o comanda anulata sau
 * rambursata nu se misca de la un transportator.
 */
export function statusUrmator(statusCurent: string, v: unknown): OrderStatus | null {
  const tinta = statusComandaDinStatus(v);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;
  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

// ─── Evenimentele din istoric ─────────────────────────────────────────────────

/**
 * Starea de la momentul unui eveniment din istoric.
 *
 * `StatusChanged:<stare>` o poarta in nume; pe celelalte (`CodeChanged:<cod>`) o spune campul
 * `status`, cand e completat.
 */
function stareaEvenimentului(ev: EvenimentCuriera): StatusCuriera | null {
  const m = /^StatusChanged:(.+)$/i.exec(ev.tip.trim());
  return normalizeazaStatus(m ? m[1] : ev.status);
}

/** Cheia unui eveniment in memoria semnalarilor: felul lui si clipa LOR. */
export function cheieEveniment(ev: EvenimentCuriera): string {
  return `${ev.tip.trim()}|${ev.data ?? ""}`;
}

/** Memoria salvata pe comanda. `null` / forma straina = nimic semnalat inca. */
export function memorieSemnalari(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Evenimentele din istoric care cer atentia omului si n-au fost inca semnalate.
 *
 * ═══ ⚠ DE CE ISTORICUL, SI NU DOAR STAREA CURENTA ═══
 *
 * Cronul trece o data la doua ore si citeste in lot doar starea CURENTA. Un „avizat" (livrare
 * esuata) urmat de „in_curs" (a doua incercare) intre doua treceri nu s-ar vedea niciodata. La
 * Posta exact asa se pierdea un refuz sub un eveniment administrativ. De aceea, la ORICE
 * schimbare a cheii, se citeste istoricul si se semnaleaza fiecare eveniment-problema inca
 * nesemnalat, o singura data (cheia `felul|clipa lor` se tine minte pe comanda).
 *
 * Se semnaleaza schimbarile de STARE spre o stare-problema si schimbarile de COD petrecute sub o
 * stare-problema (un motiv nou al aceleiasi livrari esuate).
 */
export function evenimenteDeSemnalat(
  istoric: EvenimentCuriera[],
  memorie: unknown,
): { noi: EvenimentCuriera[]; memorie: string[] } {
  const vazute = new Set(memorieSemnalari(memorie));
  const noi: EvenimentCuriera[] = [];
  /*
   * ⚠ Starea se tine pe parcurs: un `CodeChanged` fara `status` o MOSTENESTE pe a ultimului
   * `StatusChanged`. Singurul istoric vazut pe fir are `status: ""` pe evenimentele care nu sunt
   * schimbari de stare, deci un motiv nou („avizat|A3" dupa „avizat|A2") ar fi fost aruncat tocmai
   * cand istoricul s-a citit, iar caderea pe starea curenta nu mai intervine atunci.
   */
  let stareaCurenta: StatusCuriera | null = null;
  for (const ev of istoric) {
    const tip = ev.tip.trim();
    if (/^StatusChanged:/i.test(tip)) stareaCurenta = stareaEvenimentului(ev) ?? stareaCurenta;
    if (!/^(StatusChanged|CodeChanged):/i.test(tip)) continue;
    const stare = stareaEvenimentului(ev) ?? stareaCurenta;
    if (!stare || STARI[stare].semnaleaza !== true) continue;
    const cheie = cheieEveniment(ev);
    if (vazute.has(cheie)) continue;
    vazute.add(cheie);
    noi.push(ev);
  }
  return { noi, memorie: [...vazute] };
}

/** Un rand de notificare pentru un eveniment din istoric. */
export function descriereEveniment(ev: EvenimentCuriera): string {
  const stare = stareaEvenimentului(ev);
  const baza = ev.descriere || (stare ? STARI[stare].denumire : ev.tip);
  const cod = /^CodeChanged:/i.test(ev.tip) ? ev.tip.replace(/^CodeChanged:/i, "").trim() : ev.cod;
  return cod && !baza.includes(cod) ? `${baza} (${cod})` : baza;
}

/** Cum se explica unui om clasificarea. Se arata in pagina de configurare. */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut: comanda nu se misca si nu se semnaleaza nimic",
};
