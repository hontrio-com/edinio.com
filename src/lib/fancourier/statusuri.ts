import type { OrderStatus } from "@/lib/orders/status";

/**
 * STARILE UNUI AWB FAN, CITITE DUPA COD.
 *
 * ═══ ⚠ DE CE NU SEAMANA CU `ecolet/statusuri.ts` ═══
 *
 * Modulul eColet ghiceste din TEXT: are sapte liste de cuvinte („delivered", „livrat",
 * „retur") si, peste ele, o lista de NEGATII, fiindca „not delivered" contine „delivered".
 * Trebuie sa faca asta: statusurile lor vin ca nume libere, care se pot schimba oricand.
 *
 * FAN publica un TABEL DE CODURI (`reports/awb-events`, pag. 41-44): `S2` = Delivered,
 * `S43` = Return, `S42` = Incorrect address. Codurile sunt stabile si documentate, iar numele
 * e doar eticheta lor omeneasca. Deci aici se citeste CODUL, si dispare din start toata clasa
 * de greseli cu negatiile si cu diacriticele.
 *
 * ⚠ Numele NU se foloseste la hotarare, nici macar ca rezerva. Un cod nedocumentat inseamna
 * „nu stim", si asta e un raspuns bun: comanda nu se misca si nu se semnaleaza nimic. Ghicind
 * din numele lui, am fi mutat comenzi dupa un text pe care FAN il poate schimba fara sa ne
 * spuna. Documentatia are goluri in sir (S17, S18, S23, S26, S29, S31, S32, S34, S36, S39-S41,
 * S44, S45, S48) si tocmai alea ar fi fost ghicite.
 */

/** Aceleasi cinci clase ca la ceilalti curieri, ca bucla cronului sa fie una singura. */
export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

type Eveniment = {
  clasa: Clasificare;
  /** Starea nu se mai schimba: cronul poate inceta sa intrebe. */
  final?: true;
  /** Coletul se intoarce la comerciant. Schimba doar FORMULAREA instiintarii. */
  retur?: true;
};

/**
 * ⚠ SINGURA SURSA DE ADEVAR. Fiecare cod documentat, cu clasa lui.
 *
 * ⚠ `S46` „Handed over on the delivery point" NU e livrare, si aici e cea mai usoara greseala
 * de facut. Coletul e ajuns la FANbox, la PayPoint sau la oficiu, dar cumparatorul NU l-a
 * ridicat inca. Trecuta pe „Livrata", comanda s-ar inchide cu marfa inca in dulap, iar daca
 * omul n-o ridica, ea se intoarce si nimeni nu mai e atent. Singurul cod care inchide comanda
 * e `S2`.
 *
 * ⚠ REFUZURILE NU SUNT FINALE. `S6` (receptie refuzata), `S7` (transport refuzat) si `S15`
 * (plata la livrare refuzata) sunt urmate de RETUR, deci coletul inca se misca. Marcate
 * „final", am inceta sa intrebam exact cand incepe partea care il intereseaza pe comerciant.
 * Invers, o stare finala tratata ca nefinala costa doar cateva cereri in plus: schimbul e
 * asimetric si se alege in partea ieftina.
 */
export const EVENIMENTE_FAN: Readonly<Record<string, Eveniment>> = {
  /* ── Ridicare si transport ─────────────────────────────────────────── */
  C0: { clasa: "in_retea" },   // shipment picked up
  C1: { clasa: "in_retea" },   // Shipment picked up for delivery
  H0: { clasa: "in_retea" },   // in transit towards the destination warehouse
  H1: { clasa: "in_retea" },   // unloaded in the destination warehouse
  H2: { clasa: "in_retea" },   // Shipment in transit
  H3: { clasa: "in_retea" },   // sorted on the belt
  H4: { clasa: "in_retea" },   // sorted on the belt
  H10: { clasa: "in_retea" },  // in transit towards the destination warehouse
  H11: { clasa: "in_retea" },  // unloaded in the destination warehouse
  H12: { clasa: "in_retea" },  // in the warehouse
  H13: { clasa: "in_retea" },  // in the warehouse
  H15: { clasa: "in_retea" },  // in the warehouse
  H17: { clasa: "in_retea" },  // in the destination warehouse

  /* ── Livrare in curs ───────────────────────────────────────────────── */
  S1: { clasa: "in_retea" },   // Shipment being delivered
  S3: { clasa: "in_retea" },   // Notified
  S11: { clasa: "in_retea" },  // Notified and SMS sent
  S8: { clasa: "in_retea" },   // Delivery from the FAN Courier office
  S35: { clasa: "in_retea" },  // Resent for delivery
  /* ⚠ Ajuns la punct, NU ridicat de client. Vezi nota de mai sus. */
  S46: { clasa: "in_retea" },  // Handed over on the delivery point
  S47: { clasa: "in_retea" },  // Handed over to an external partner

  /* ── Singura livrare ───────────────────────────────────────────────── */
  S2: { clasa: "livrat", final: true },

  /* ── Piedici: comanda NU se misca, dar comerciantul afla ───────────── */
  S4: { clasa: "problema" },   // Incomplete address
  S5: { clasa: "problema" },   // Wrong address, recipient moved
  S9: { clasa: "problema" },   // Redirected
  S10: { clasa: "problema" },  // Incorrect address, no phone
  S12: { clasa: "problema" },  // Contacted; later delivery
  S14: { clasa: "problema" },  // Access restricted to the address
  S19: { clasa: "problema" },  // Incomplete address - SMS sent
  S20: { clasa: "problema" },  // Incomplete address, no phone
  S21: { clasa: "problema" },  // Notified, contact person missing
  S22: { clasa: "problema" },  // Notified, no money for payment on delivery
  S24: { clasa: "problema" },  // Notified, no Power of Attorney / ID
  S25: { clasa: "problema" },  // Incorrect address - SMS sent
  S27: { clasa: "problema" },  // Incorrect address, incorrect phone no.
  S28: { clasa: "problema" },  // Incomplete address, incorrect phone no.
  S30: { clasa: "problema" },  // Does not pick up the phone
  S42: { clasa: "problema" },  // Incorrect address

  /* ── Refuzuri: urmeaza returul, deci NU sunt finale ────────────────── */
  S6: { clasa: "problema" },   // Reception refused
  S7: { clasa: "problema" },   // Transport payment refused
  S15: { clasa: "problema" },  // Payment on delivery refused
  S50: { clasa: "problema" },  // confirmation refused

  /* ── Retur ─────────────────────────────────────────────────────────── */
  S33: { clasa: "problema", retur: true },              // Return requested
  S16: { clasa: "problema", retur: true },              // Return on time
  S43: { clasa: "problema", retur: true, final: true }, // Return

  /* ── Capete de drum ────────────────────────────────────────────────── */
  S37: { clasa: "problema", final: true },  // Compensated
  S38: { clasa: "problema", final: true },  // AWB not sent
  S49: { clasa: "problema", final: true },  // Activity suspended
};

/** Codul, curatat de spatii si adus la majuscule. FAN il da „S2", dar spatiile se strecoara. */
export function cheieCod(cod: string | null | undefined): string {
  return (cod ?? "").trim().toUpperCase();
}

/** Ce inseamna codul asta pentru comanda. Un cod nedocumentat e `necunoscut`, nu o ghicitura. */
export function clasificaCod(cod: string | null | undefined): Clasificare {
  const c = cheieCod(cod);
  if (!c) return "necunoscut";
  return EVENIMENTE_FAN[c]?.clasa ?? "necunoscut";
}

/**
 * Pe ce stare ar trebui sa ajunga comanda, sau `null` daca nu se misca.
 *
 * ⚠ `problema` intoarce `null` DINADINS: o adresa gresita sau un refuz nu au voie sa anuleze
 * singure comanda. Comerciantul primeste o instiintare si hotaraste el.
 */
export function statusComandaDinCod(cod: string | null | undefined): OrderStatus | null {
  switch (clasificaCod(cod)) {
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
 * ⚠ NU COBOARA NICIODATA. Evenimentele FAN nu vin garantat in ordine cronologica, iar un „in
 * tranzit" sosit dupa „livrat" ar fi dat comanda inapoi pe „Expediata". Si o comanda anulata
 * sau restituita nu se mai misca de la niciun eveniment de curier.
 */
export function statusUrmator(statusCurent: string, cod: string | null | undefined): OrderStatus | null {
  const tinta = statusComandaDinCod(cod);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/** Merita o instiintare catre comerciant? */
export function trebuieSemnalat(cod: string | null | undefined): boolean {
  return clasificaCod(cod) === "problema";
}

/** Coletul se intoarce? Schimba formularea instiintarii, nu clasificarea. */
export function esteRetur(cod: string | null | undefined): boolean {
  const c = cheieCod(cod);
  return c !== "" && EVENIMENTE_FAN[c]?.retur === true;
}

/**
 * Se mai poate schimba ceva, sau cronul poate inceta sa intrebe?
 *
 * ⚠ Numai capetele de drum ADEVARATE. Vezi nota de la `EVENIMENTE_FAN`: refuzurile arata a
 * sfarsit, dar sunt urmate de retur.
 */
export function eStareFinala(cod: string | null | undefined): boolean {
  const c = cheieCod(cod);
  return c !== "" && EVENIMENTE_FAN[c]?.final === true;
}

/**
 * Ultimul eveniment dintr-o lista, dupa DATA, nu dupa pozitie.
 *
 * ⚠ Exista fiindca `events[]` din raspunsul FAN nu e garantat ordonat, iar exemplul din
 * documentatie chiar il da crescator, ceea ce invita la „ultimul din lista". Pe o lista
 * sosita invers, aia ar fi citit prima stare a coletului drept cea de acum, si comanda ar fi
 * ramas pe „Expediata" la nesfarsit.
 *
 * Datele vin ca „2023-03-06 13:58:43", fara fus orar. Se compara ca SIRURI, nu prin `Date`:
 * formatul e fix si sortabil lexicografic, iar `new Date("… …")` pe un sir fara fus e
 * interpretat local, deci ar muta ordinea in functie de masina.
 */
export function ultimulEveniment<T extends { id?: unknown; date?: unknown }>(evenimente: readonly T[] | null | undefined): T | null {
  let cel: T | null = null;
  let cea = "";
  for (const e of evenimente ?? []) {
    const d = typeof e?.date === "string" ? e.date.trim() : "";
    if (!d) continue;
    if (cel === null || d >= cea) { cel = e; cea = d; }
  }
  return cel;
}
