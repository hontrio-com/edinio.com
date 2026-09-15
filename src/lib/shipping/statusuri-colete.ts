/**
 * Ce inseamna, pentru comanda, codul de stare pe care il da Colete Online.
 *
 * ═══ ⚠ EI CHIAR DAU CODURI, dar NU PUBLICA TABELUL LOR ═══
 *
 * Raspunsul lor de la `GET /order/status/{uniqueId}` poarta, pe fiecare eveniment, un `code`
 * NUMERIC plus numele in romana (`statusTextParts.ro.name`). Asta il aseaza intre DPD, care
 * isi publica tabelul intreg, si Woot sau Cargus, care nu dau niciun cod.
 *
 * Dar tabelul nu e publicat nicaieri: in toata specificatia lor OpenAPI exista UN SINGUR
 * exemplu de istoric, pe un drum fericit. Codurile de mai jos sunt exact cele din el, cu
 * numele lor cu tot. Nu sunt inventate, si nu sunt nici complete.
 *
 * ═══ ⚠ CE NU E AICI NU MISCA NIMIC ═══
 *
 * Aceeasi regula ca la Woot: un cod nevazut nu cade pe nicio ramura, se strange pe nume in
 * jurnal, si harta creste din trafic ADEVARAT. Codurile pentru refuz, retur sau livrare
 * esuata nu apar in exemplul lor, deci NU se ghicesc: un „Livrat" pus pe un retur ar emite si
 * factura, si aia e greu de intors.
 *
 * ⚠ SI DE CE TOTUSI SE MISCA COMANDA, spre deosebire de Woot si Cargus. Fiindca aici avem
 * numele LOR langa numar: `20800` se cheama „Colet livrat", iar `20050` „Ridicat de la
 * expeditor". Nu e o deducere din bandă, e eticheta pe care o scriu ei. La Woot nu exista
 * nici macar atat, pana cand cronul a strans perechile din trafic.
 */

/** Ce face comanda cand vede codul. */
export type OperatieColete = {
  /** Treapta la care se ridica comanda, daca se ridica. */
  treapta?: "shipped" | "delivered";
  /** Drumul s-a incheiat: nu mai are rost intrebat. */
  final?: true;
  /** Numele lor, exact cum il scriu ei in exemplu. */
  nume: string;
};

/**
 * Codurile VAZUTE in exemplul lor, si numai ele.
 *
 * ⚠ `9000`, `10000` si `11000` sunt INAINTE de ridicare: coletul e inca la comerciant, deci
 * comanda nu se misca. „Document de transport emis" nu inseamna ca a plecat ceva.
 */
export const STARI_COLETE: Readonly<Record<string, OperatieColete>> = {
  "9000": { nume: "Comanda trimisa la curier" },
  "10000": { nume: "Document de transport emis" },
  "11000": { nume: "Alocata pentru ridicare" },
  /* De aici incolo coletul chiar e in reteaua curierului. */
  "20050": { nume: "Ridicat de la expeditor", treapta: "shipped" },
  "20100": { nume: "In tranzit spre depozit", treapta: "shipped" },
  "20200": { nume: "In depozit", treapta: "shipped" },
  "20210": { nume: "In depozit", treapta: "shipped" },
  "20400": { nume: "In depozit central", treapta: "shipped" },
  "20500": { nume: "In livrare la curier", treapta: "shipped" },
  "20800": { nume: "Colet livrat", treapta: "delivered", final: true },
};

export type EvenimentColete = {
  code?: unknown;
  dateTime?: unknown;
  unixDateTime?: unknown;
  statusTextParts?: { ro?: { name?: unknown; reason?: unknown } };
  comment?: { ro?: unknown };
};

/** Codul, ca sir, sau `null` cand nu e un numar. */
export function codulColete(e: EvenimentColete | null | undefined): string | null {
  const c = e?.code;
  if (typeof c === "number" && Number.isFinite(c)) return String(c);
  if (typeof c === "string" && /^\d+$/.test(c.trim())) return c.trim();
  return null;
}

/**
 * Ultimul eveniment din istoricul lor.
 *
 * ⚠ SE IA CEL MAI NOU DUPA TIMP, nu ultimul din lista: ordinea in care ni le dau ei nu e
 * promisa nicaieri in specificatie. Iar `unixDateTime` e preferat lui `dateTime`, fiindca e
 * un numar si nu depinde de cum se parseaza un sir.
 */
export function ultimulEvenimentColete(
  istoric: EvenimentColete[] | null | undefined,
): EvenimentColete | null {
  const lista = Array.isArray(istoric) ? istoric : [];
  let cel: EvenimentColete | null = null;
  let celMoment = -Infinity;
  for (const e of lista) {
    const u = Number(e?.unixDateTime);
    const moment = Number.isFinite(u)
      ? u
      : Date.parse(typeof e?.dateTime === "string" ? e.dateTime : "");
    if (!Number.isFinite(moment)) continue;
    /* `>=` si nu `>`: la timpi egali castiga cel de mai tarziu din lista, care e si ordinea
       in care ei ii scriu. Doua evenimente cu aceeasi secunda chiar apar in exemplul lor. */
    if (moment >= celMoment) { celMoment = moment; cel = e; }
  }
  return cel;
}

/** Eticheta de aratat omului: numele lor, plus motivul cand il dau. */
export function eticheta(e: EvenimentColete | null | undefined): string {
  const ro = e?.statusTextParts?.ro;
  const nume = typeof ro?.name === "string" ? ro.name.trim() : "";
  const motiv = typeof ro?.reason === "string" ? ro.reason.trim() : "";
  if (nume && motiv) return `${nume}: ${motiv}`;
  return nume || motiv || "";
}

/** Treptele comenzii, in ordine. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4,
};

/**
 * Ce status merita comanda dupa ultimul eveniment, sau `null` daca nu se schimba.
 *
 * ⚠ NU SE COBOARA NICIODATA, si o comanda anulata sau rambursata nu se misca de la un
 * transportator: alea sunt hotarari ale comerciantului.
 */
export function statusUrmatorColete(
  statusCurent: string,
  cod: string | null,
): "shipped" | "delivered" | null {
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;
  const op = cod ? STARI_COLETE[cod] : undefined;
  if (!op?.treapta) return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[op.treapta];
  if (acum === undefined || nou === undefined) return null;
  return nou > acum ? op.treapta : null;
}

/** Drumul s-a incheiat: cronul nu-l mai intreaba. */
export function eStareFinalaColete(cod: string | null): boolean {
  return !!(cod && STARI_COLETE[cod]?.final);
}

/** Un cod pe care nu-l stim inca. Se strange pe nume, ca harta sa creasca din trafic. */
export function eCodNecunoscutColete(cod: string | null): boolean {
  return !!cod && !STARI_COLETE[cod];
}
