import type { OrderStatus } from "@/lib/orders/status";

/**
 * Starile e-packet -> statusul comenzii.
 *
 * ═══ HARTA E A LOR, PUBLICATA ═══
 *
 * Spre deosebire de Woot si Cargus (care nu publica nimic), e-packet isi scrie in documentatie
 * TOATE cele 19 coduri, cu denumirea si cu coloana „Final" (tabelul „Statusuri", 07.10.2026).
 * Ei traduc deja starea fiecarui curier intr-un vocabular comun, deci harta de aici e una
 * singura pentru DPD, Sameday, Cargus, FAN, Dragon Star si TCE.
 *
 * ⚠ Pe contul de test toate expedierile raman `creat` (sandboxul curierilor nu misca coletele),
 * deci tranzitiile de mai jos sunt citite din tabelul lor, nu vazute pe fir.
 *
 * ═══ ⚠ CE NU S-A VAZUT NU MISCA NIMIC ═══
 *
 * Un cod nou (in afara celor 19) nu schimba comanda, nu se semnaleaza si NU scoate coletul din
 * urmarire; cronul il strange pe nume (`stariNoi`), ca harta sa poata creste.
 */

export type StatusEpacket =
  | "creat" | "preluat" | "preluare_esuata" | "in_tranzit" | "in_livrare" | "avizat"
  | "livrare_esuata" | "redirectionat" | "retinut" | "avariat" | "refuzat" | "retur_in_curs"
  | "livrat" | "returnat" | "anulat" | "distrus" | "abandonat" | "inchis_administrativ" | "necunoscut";

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Intrare = {
  /** Denumirea LOR, din tabel. */
  denumire: string;
  clasa: Clasificare;
  /** Cere o decizie omeneasca: se trimite notificare comerciantului. */
  semnaleaza?: boolean;
  /** „Cele finale nu se mai schimba" (coloana „Final" a lor). */
  final?: boolean;
  /** Coletul se intoarce la comerciant: rambursul NU s-a incasat. */
  retur?: boolean;
};

export const STARI: Record<StatusEpacket, Intrare> = {
  /*
   * ⚠ „Creat" NU inseamna „expediat": eticheta e facuta, marfa e inca la comerciant. Marcata
   * expediata, comanda ar minti clientul. Aceeasi hotarare ca la Curiera, SmartShip si Innoship.
   */
  creat: { denumire: "Creat", clasa: "la_comerciant" },
  preluat: { denumire: "Preluat de curier", clasa: "in_retea" },
  /* Curierul n-a ridicat coletul: comerciantul trebuie sa stie, altfel asteapta degeaba. */
  preluare_esuata: { denumire: "Preluare eșuată", clasa: "problema", semnaleaza: true },
  in_tranzit: { denumire: "În tranzit", clasa: "in_retea" },
  in_livrare: { denumire: "În livrare", clasa: "in_retea" },
  /*
   * ⚠ „Avizat" = destinatarul n-a fost gasit si i s-a lasat aviz. Nu e final: urmeaza alta
   * incercare sau returul. Scos din urmarire aici, returul nu s-ar mai afla (lectia SmartShip).
   */
  avizat: { denumire: "Avizat", clasa: "problema", semnaleaza: true },
  livrare_esuata: { denumire: "Livrare eșuată", clasa: "problema", semnaleaza: true },
  /* Coletul merge in ALTA parte, nu inapoi: ca „8" la Woot, problema fara retur. */
  redirectionat: { denumire: "Redirecționat", clasa: "problema", semnaleaza: true },
  retinut: { denumire: "Reținut", clasa: "problema", semnaleaza: true },
  avariat: { denumire: "Avariat", clasa: "problema", semnaleaza: true },
  /* Refuzul NU e final la ei: urmeaza `retur_in_curs` si `returnat`. */
  refuzat: { denumire: "Refuzat de destinatar", clasa: "problema", semnaleaza: true, retur: true },
  retur_in_curs: { denumire: "Retur în curs", clasa: "problema", semnaleaza: true, retur: true },
  livrat: { denumire: "Livrat", clasa: "livrat", final: true },
  returnat: { denumire: "Returnat expeditorului", clasa: "problema", semnaleaza: true, final: true, retur: true },
  /*
   * ⚠ Anularea nu se face din Edinio (API-ul lor n-are anulare): o anulare vazuta de cron s-a
   * facut prin ei, la cererea comerciantului. Comanda ramane cu un numar care nu poarta nimic.
   */
  anulat: { denumire: "Anulat", clasa: "problema", semnaleaza: true, final: true },
  distrus: { denumire: "Distrus / furat", clasa: "problema", semnaleaza: true, final: true },
  abandonat: { denumire: "Abandonat", clasa: "problema", semnaleaza: true, final: true },
  inchis_administrativ: { denumire: "Închis administrativ", clasa: "problema", semnaleaza: true, final: true },
  /* E un cod AL LOR („Necunoscut", nefinal): nu misca nimic, dar nici nu scoate din urmarire. */
  necunoscut: { denumire: "Necunoscut", clasa: "necunoscut" },
};

/** Starea, sau `null` daca nu e unul dintre cele 19 coduri publicate. */
export function normalizeazaStatus(v: unknown): StatusEpacket | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  /* `Object.hasOwn`: un cod ca „constructor" ar fi luat altfel o functie din prototip. */
  return Object.hasOwn(STARI, k) ? (k as StatusEpacket) : null;
}

function intrare(v: unknown): Intrare | null {
  const s = normalizeazaStatus(v);
  return s ? STARI[s] : null;
}

export function clasificaStatus(v: unknown): Clasificare {
  return intrare(v)?.clasa ?? "necunoscut";
}

export function trebuieSemnalat(v: unknown): boolean {
  return intrare(v)?.semnaleaza === true;
}

/**
 * Se mai intreaba? ⚠ Raspunsul LOR (`is_final`) bate harta, dar numai spre „da": un cod nou pe
 * care ei il dau final se opreste, iar unul din harta nu iese din urmarire doar pentru ca ei
 * au uitat steagul.
 */
export function eStareFinala(v: unknown, finalLaEi = false): boolean {
  return finalLaEi || intrare(v)?.final === true;
}

export function esteRetur(v: unknown): boolean {
  return intrare(v)?.retur === true;
}

/** Denumirea pentru om: a LOR (`label`), apoi a tabelului, apoi codul brut. */
export function descriereStare(status: string, eticheta?: string | null): string {
  const lor = (eticheta ?? "").trim();
  if (lor) return lor;
  return intrare(status)?.denumire ?? (status.trim() ? `Stare e-packet „${status.trim()}”` : "Stare necunoscuta");
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

/** Cum se explica unui om clasificarea. Se arata in pagina de configurare. */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut: comanda nu se misca si nu se semnaleaza nimic",
};
