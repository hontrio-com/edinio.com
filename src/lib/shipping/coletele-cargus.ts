/**
 * Cate bucati are expedierea Cargus, si ce scrie pe fiecare.
 *
 * ═══ ⚠ DEFECTUL PE CARE IL INCHIDE (15.09.2026) ═══
 *
 * Fereastra de AWB il lasa pe comerciant sa spuna „3 colete", trimitea `parcels: 3`, dar
 * `parcelsDetails` era MEREU o singura intrare, cu greutatea INTREAGA a expedierii. Deci
 * corpul care pleca la Cargus spunea deodata doua lucruri care nu se potrivesc: trei bucati,
 * si un singur cod de colet care le cantareste pe toate.
 *
 * Invarianta e scrisa in chiar modulul lor oficial (1.6.0, `class-cargus-admin.php`,
 * randurile 1155-1197): bucla construieste EXACT cate un `ParcelCodes[i]` per bucata, iar
 * `TotalWeight` se aduna din greutatile lor. Nu e o parere, e codul care ruleaza la ei.
 *
 * ⚠ CE COSTA: o eticheta tiparita pentru o expediere de trei colete inseamna doua colete
 * plecate fara eticheta. Aia nu se vede ca eroare nicaieri, se vede ca marfa pierduta.
 *
 * ═══ ⚠ GREUTATEA SE IMPARTE, NU SE INVENTEAZA ═══
 *
 * Cand apelantul da mai putine fise decat bucati, greutatea totala se imparte egal. Suma
 * ramane exact cat a spus omul, deci taxarea nu se schimba; se schimba doar cum e descrisa.
 * Acelasi lucru fac si Sameday, si DPD, si din acelasi motiv.
 *
 * ⚠ NU se completeaza in tacere o expediere pe care omul n-a descris-o: numarul de bucati,
 * greutatea si tipul se VALIDEAZA intai, si un corp incoerent se REFUZA inainte de orice
 * apel la Cargus. Un refuz al nostru costa o apasare; unul al lor costa un colet.
 */

/** Plicuri per AWB. Documentatia lor: „Envelopes . number of envelopes. Maximum of 9". */
export const MAX_PLICURI = 9;

/**
 * Colete per AWB.
 *
 * ⚠ Cincisprezece, si nu din capul nostru: anexa lor numeste ca limita a serviciului
 * Multipiece „more than 15 pieces per shipment", iar modulul lor taie la 15 (`Parcels > 15`).
 */
export const MAX_COLETE = 15;

/** Un plic cantareste cel mult atat. Documentat de ei, si fortat si de modulul lor. */
export const KG_MAX_PLIC = 1;

export type FisaColet = { weight: number; length?: number; width?: number; height?: number };

export type ColeteCargus = {
  /** Cate bucati, oricare ar fi tipul lor. */
  bucati: number;
  /** Greutatea totala, dupa plafonul plicului. */
  greutateTotala: number;
  /** Cate una de fiecare bucata, cu greutatile insumand exact `greutateTotala`. */
  fise: FisaColet[];
};

export type VerdictColete =
  | { ok: true; colete: ColeteCargus }
  | { ok: false; motiv: string };

function eIntregPozitiv(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && Number.isInteger(x) && x > 0;
}

/**
 * Bucatile expedierii, verificate si completate.
 *
 * `parcels` si `envelopes` vin cum le trimite apelantul: una dintre ele e zero.
 */
export function coleteleCargus(input: {
  parcels: number;
  envelopes?: number;
  totalWeightKg: number;
  parcelsDetails: FisaColet[];
}): VerdictColete {
  const plicuri = input.envelopes ?? 0;
  const ePlic = plicuri > 0;
  const bucati = ePlic ? plicuri : input.parcels;

  if (!eIntregPozitiv(bucati)) {
    return {
      ok: false,
      motiv: "Numarul de colete trebuie sa fie un numar intreg, cel putin 1.",
    };
  }
  if (ePlic && bucati > MAX_PLICURI) {
    return { ok: false, motiv: `Cargus accepta cel mult ${MAX_PLICURI} plicuri pe un AWB.` };
  }
  if (!ePlic && bucati > MAX_COLETE) {
    return { ok: false, motiv: `Cargus accepta cel mult ${MAX_COLETE} colete pe un AWB.` };
  }
  /*
   * ⚠ Amandoua deodata nu se poate, si nu e o pedanterie: `Parcels` si `Envelopes` sunt
   * campuri separate in corpul lor, iar o expediere e ori de una, ori de alta. Trimise
   * amandoua, tipul de pe `ParcelCodes` ar descrie doar jumatate din bucati.
   */
  if (plicuri > 0 && input.parcels > 0) {
    return { ok: false, motiv: "O expediere e ori din plicuri, ori din colete, nu din amandoua." };
  }

  const total = input.totalWeightKg;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) {
    return { ok: false, motiv: "Greutatea totala trebuie sa fie un numar mai mare decat 0." };
  }
  if (ePlic && total > KG_MAX_PLIC) {
    return {
      ok: false,
      motiv: `Un plic cantareste maxim ${KG_MAX_PLIC} kg. Alege tipul „Colet" pentru greutati mai mari.`,
    };
  }

  const fisePrimite = Array.isArray(input.parcelsDetails) ? input.parcelsDetails : [];
  for (const f of fisePrimite) {
    if (typeof f?.weight !== "number" || !Number.isFinite(f.weight) || f.weight <= 0) {
      return { ok: false, motiv: "Fiecare colet trebuie sa aiba o greutate mai mare decat 0." };
    }
    for (const [nume, v] of [["lungimea", f.length], ["latimea", f.width], ["inaltimea", f.height]] as const) {
      if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
        return { ok: false, motiv: `Un colet are ${nume} scrisa gresit.` };
      }
    }
  }

  /*
   * ⚠ Fisele se iau ca atare DOAR cand sunt exact cate bucati, SI cand greutatile lor chiar
   * insumeaza totalul. Altfel se reconstruiesc din total, impartit egal: e singurul raspuns
   * care nu inventeaza nimic si nu pierde nimic.
   */
  const suma = fisePrimite.reduce((s, f) => s + f.weight, 0);
  const potrivite =
    fisePrimite.length === bucati && Math.abs(suma - total) <= 0.011;

  if (potrivite) return { ok: true, colete: { bucati, greutateTotala: total, fise: fisePrimite } };

  /* Dimensiunile primei fise se pastreaza: omul le-a scris pentru coletul lui. */
  const dim = fisePrimite[0];
  const fise = impartireEgala(total, bucati).map((weight) => ({
    weight,
    ...(dim?.length !== undefined ? { length: dim.length } : {}),
    ...(dim?.width !== undefined ? { width: dim.width } : {}),
    ...(dim?.height !== undefined ? { height: dim.height } : {}),
  }));

  return { ok: true, colete: { bucati, greutateTotala: total, fise } };
}

/**
 * Totalul, impartit in `bucati` parti care se aduna EXACT la loc.
 *
 * ⚠ Restul cade pe ULTIMA parte, nu se pierde prin rotunjire. `10 / 3` scris cu doua zecimale
 * de trei ori da 9,99, adica un kilogram mai putin la fiecare a suta expediere, si o taxare
 * care nu se potriveste cu ce am cotat.
 */
export function impartireEgala(total: number, bucati: number): number[] {
  const bani = Math.round(total * 100);
  const parte = Math.floor(bani / bucati);
  const parti = Array.from({ length: bucati }, () => parte);
  parti[bucati - 1] += bani - parte * bucati;
  return parti.map((x) => x / 100);
}
