import type { OfertaSmartship, SmartshipConfig } from "./client";

/**
 * Ofertele SmartShip → ce vede cumparatorul in checkout si comerciantul in panou.
 *
 * ⚠ PUR: nu atinge reteaua. Aici stau chiar hotararile care se vad pe ecran —
 * care oferte se arata, in ce ordine si cum se numesc — deci sunt si singurele
 * care se pot proba fara cont.
 */

/** O oferta gata de aratat, cu cheia ei. */
export type OfertaAratata = {
  /** ⚠ Prima parte a cheii. */
  courierId: number;
  /**
   * ⚠ A DOUA PARTE A CHEII, si nu e decor.
   *
   * Cu `show_byoc: 1`, ACELASI curier apare de doua ori: o data pe contractul
   * comerciantului, o data pe cel SmartShip, la preturi diferite. Cheia facuta
   * doar din `courierId` le-ar prabusi una peste alta — cumparatorul ar alege una
   * si ar primi alta, iar diferenta de pret ar plati-o comerciantul.
   *
   * Exact defectul gasit la Innoship, unde `optionKey` nu cuprindea toate partile
   * cheii. Vezi [[innoship-integrare]].
   */
  contractPropriu: boolean;
  numeCurier: string;
  /** Pretul CU TVA, in lei. */
  pret: number;
  pretFaraTva: number | null;
  dataLivrare: string | null;
  dataRidicare: string | null;
  /** Zile pana la virarea rambursului, dupa livrarile lor anterioare. */
  rambursZile: { median: number | null; p75: number | null } | null;
  /** Doar pe liniile de contract propriu: costul returului. */
  costRetur: number | null;
};

/**
 * Pretul care ajunge la cumparator.
 *
 * ⚠ `cost` e CU TVA („Preturile includ discountul contului tau si sunt exprimate
 * in RON, cu TVA inclus"), `cost_fara_tva` e cel net. Preturile din checkout-ul
 * nostru sunt toate cu TVA inclus, iar un transport afisat fara ar fi cu ~19% mai
 * mic decat cel incasat — exact clasa de defecte pe care auditul de preturi a
 * inchis-o in 40 de locuri.
 *
 * Cand `cost` lipseste NU se cade pe net: ar fi un pret prea mic afisat ca si cum
 * ar fi cel adevarat. Oferta se arunca.
 */
export function pretCuTva(o: OfertaSmartship): number | null {
  const total = Number(o?.cost);
  if (Number.isFinite(total) && total > 0) return Math.round(total * 100) / 100;
  return null;
}

/** „2026-07-10" → „10.07.2026". Orice alta forma se intoarce neatinsa. */
export function dataRo(iso: string | null | undefined): string | null {
  const t = (iso ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (t || null);
}

/**
 * Termenul, asa cum il citeste cumparatorul.
 *
 * ⚠ Se arata DATA lor, nu un numar de zile calculat de noi. Ei dau
 * `delivery_date`; un „3 zile lucratoare" dedus din ea ar fi o traducere pe care
 * n-o putem apara (nu stim cum numara ei sarbatorile), iar cumparatorul ar citi
 * o promisiune usor diferita de a curierului.
 */
export function termenLivrare(o: OfertaAratata): string | undefined {
  const d = dataRo(o.dataLivrare);
  return d ? `livrare estimata ${d}` : undefined;
}

/** Eticheta ofertei. Cumparatorul vede CURIERUL REAL, nu numele brokerului. */
export function etichetaOferta(o: OfertaAratata): string {
  const nume = (o.numeCurier ?? "").trim();
  if (!nume) return "Livrare prin SmartShip";
  /* ⚠ Se spune pe fata cand oferta e pe contractul comerciantului: altfel doua
     randuri identice la preturi diferite arata a defect. */
  return o.contractPropriu ? `${nume} (contractul tau)` : nume;
}

/** Cheia unei oferte. Un singur loc care o compune, ca sa nu apara doua forme. */
export function cheiaOfertei(o: Pick<OfertaAratata, "courierId" | "contractPropriu">): string {
  return `${o.courierId}::${o.contractPropriu ? "byoc" : "ss"}`;
}

/**
 * Ofertele care se pot arata, filtrate si asezate.
 *
 * ⚠ Filtrul pe curieri e alegerea comerciantului; lista goala inseamna „toti cei
 * pe care ii da contul", nu „niciunul".
 *
 * ⚠ Ordinea e dupa PRET, ca in tot checkout-ul. SmartShip intoarce lista deja
 * sortata crescator, dar cu `show_byoc` cele doua contracte se intercaleaza, iar
 * filtrarea noastra poate scoate randuri — deci se re-aseaza aici, ca sa nu
 * depindem de o ordine pe care n-o controlam.
 */
export function ofertePosibile(
  costs: OfertaSmartship[],
  config?: Pick<SmartshipConfig, "curieri_permisi">,
): OfertaAratata[] {
  const permisi = new Set((config?.curieri_permisi ?? []).filter((x) => Number.isInteger(x) && x > 0));

  const iesire: OfertaAratata[] = [];
  const vazute = new Set<string>();

  for (const o of costs ?? []) {
    const courierId = Number(o?.courier_id);
    const pret = pretCuTva(o);

    /* Fara curier, alegerea nu poate fi dusa pana la emitere. */
    if (!Number.isInteger(courierId) || courierId <= 0) continue;
    if (pret === null) continue;
    if (permisi.size > 0 && !permisi.has(courierId)) continue;

    const contractPropriu = o?.own_contract === true;
    const cheie = cheiaOfertei({ courierId, contractPropriu });
    if (vazute.has(cheie)) continue;
    vazute.add(cheie);

    const net = Number(o?.cost_fara_tva);
    const retur = Number(o?.cost_retur);
    const median = Number(o?.ramburs_delay?.median);
    const p75 = Number(o?.ramburs_delay?.p75);

    iesire.push({
      courierId,
      contractPropriu,
      numeCurier: (o?.courier_name ?? "").trim(),
      pret,
      pretFaraTva: Number.isFinite(net) && net > 0 ? Math.round(net * 100) / 100 : null,
      dataLivrare: (o?.delivery_date ?? "").trim() || null,
      dataRidicare: (o?.pickup_date ?? "").trim() || null,
      rambursZile: o?.ramburs_delay
        ? {
            median: Number.isFinite(median) && median >= 0 ? median : null,
            p75: Number.isFinite(p75) && p75 >= 0 ? p75 : null,
          }
        : null,
      costRetur: Number.isFinite(retur) && retur > 0 ? Math.round(retur * 100) / 100 : null,
    });
  }

  return iesire.sort((a, b) => a.pret - b.pret);
}

/**
 * Textul despre cat dureaza pana la banii din ramburs.
 *
 * ⚠ Se arata DOAR comerciantului, in panou — nu cumparatorului. E o insusire a
 * contului lui („cand primesc banii"), nu a livrarii.
 */
export function textRamburs(o: OfertaAratata): string | null {
  const m = o.rambursZile?.median;
  if (m === null || m === undefined) return null;
  const p = o.rambursZile?.p75;
  const zile = (n: number) => (n === 1 ? "o zi" : `${n} zile`);
  return p !== null && p !== undefined && p !== m
    ? `ramburs virat in ${zile(m)} (de obicei sub ${zile(p)})`
    : `ramburs virat in ${zile(m)}`;
}
