import { PREFIX_EXTRA } from "@/lib/orders/extras";
import { recalculeazaTotal } from "@/lib/orders/edit-pricing";

/**
 * Costurile unei comenzi, schimbate de mana din „Editeaza comanda”.
 *
 * Cerut de proprietar pe 25.11.2026: „Cand Editezi Comanda, vreau sa poti edita si sectiunea aia
 * cu costuri (sa poata scoate transportul, sa poata scade TVA, sa poata sa adauge pret
 * suplimentar, etc...)”.
 *
 * ═══ CE SE POATE SCHIMBA, SI UNDE AJUNGE ═══
 *
 *   - transportul            -> `orders.shipping_cost` (0 = scos);
 *   - taxa de plata ramburs  -> `orders.cod_fee_amount`;
 *   - reducerea              -> `orders.discount_amount`, TOATA: cuponul de la plasare si ce a mai
 *                               dat comerciantul de mana stau in acelasi numar;
 *   - un cost suplimentar    -> o linie in `orders.items`, cu `product_id` de forma
 *                               `extra_manual_<id>`.
 *
 * ⚠ NICIO COLOANA NOUA, si e o alegere. Tot ce citeste banii unei comenzi (cele sase case de
 * facturare, SAGA, emailurile, caseta de totaluri, reconcilierea, rambursul de pe AWB) stie deja
 * cele patru locuri de mai sus. O coloana „cost_suplimentar” ar fi trebuit invatata de fiecare, iar
 * una uitata ar fi dat o factura care nu se inchide cu comanda. Costul suplimentar merge ca
 * extraoptiune fiindca extraoptiunea E deja „o linie care nu e produs, n-are stoc si intra in
 * total”: pe factura pleaca pe linia ei, cu denumirea scrisa de comerciant.
 *
 * ⚠ „SCADE TVA” NU MAI EXISTA. A fost cateva ore (25.11.2026) un buton care punea in campul de
 * reducere o suma cat TVA-ul comenzii. Scos la cererea proprietarului („Elimina setarea aia cu
 * Scade TVA-ul”), din doua motive vazute la proba cu salvare adevarata:
 *   - nu era o scutire, desi asa suna: factura ramanea cu TVA, socotit la suma redusa. O scutire
 *     adevarata cere temeiul ei pe fiecare comanda (livrare intracomunitara, export, taxare
 *     inversa), numele cotei de scutire la fiecare casa de facturare si categoria din e-Factura;
 *   - dupa o salvare, la redeschidere se oferea sa scada TVA-ul INCA O DATA: comanda nu tine
 *     minte ca reducerea ei „e TVA-ul”, deci butonul pleca de la reducerea deja micsorata.
 * Comerciantul scrie reducerea de mana. Daca se cere vreodata scutirea adevarata, e un lucru
 * separat, cu loc pe comanda pentru temeiul ei; butonul nu se reface.
 *
 * Modul PUR: aceleasi functii le cheama si serverul (`updateOrderDetails`), si previzualizarea din
 * fereastra de editare, ca cifra aratata sa fie chiar cea scrisa.
 */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Peste suma asta o cerere e o greseala de tastare, nu un cost. */
export const SUMA_MAXIMA = 1_000_000;
/** Cate costuri suplimentare se pot adauga intr-o singura salvare. */
export const COSTURI_ADAUGATE_MAX = 10;
/** Denumirea unui cost ajunge pe factura, ca denumire de linie. */
export const NUME_COST_MAX = 80;

/** Linia unui cost suplimentar: extraoptiune, deci nu intra in subtotal si n-are stoc. */
export const PREFIX_COST_MANUAL = `${PREFIX_EXTRA}manual_`;

export function esteCostManual(productId: unknown): boolean {
  return typeof productId === "string" && productId.startsWith(PREFIX_COST_MANUAL);
}

/**
 * Cum se numeste randul de extraoptiuni din caseta de totaluri a unei comenzi.
 *
 * Randul aduna TOATE liniile `extra_*`: si extraoptiunile alese de client la comanda („ambalaj
 * cadou”), si costurile puse de comerciant. Numit mereu „Opțiuni extra”, un cost de montaj adaugat
 * de mana ar fi aparut sub un nume care nu e al lui.
 */
export function etichetaExtraoptiunilor(items: unknown): string {
  const ids = (Array.isArray(items) ? items : [])
    .map((b) => (b && typeof b === "object" ? (b as { product_id?: unknown }).product_id : null))
    .filter((id): id is string => typeof id === "string" && id.startsWith(PREFIX_EXTRA));
  const puseDeMana = ids.filter(esteCostManual).length;
  if (puseDeMana === 0) return "Opțiuni extra";
  return puseDeMana === ids.length ? "Costuri suplimentare" : "Opțiuni extra și costuri suplimentare";
}

export interface CostAdaugat {
  nume: string;
  suma: number;
}

/** Ce trimite fereastra de editare. Un camp lipsa (sau `null`) inseamna „neatins”. */
export interface CerereCosturi {
  transport?: number | null;
  taxa_ramburs?: number | null;
  /** Noua valoare a reducerii TOATE de pe comanda, nu cat se adauga la ea. */
  reducere?: number | null;
  adaugate?: CostAdaugat[];
}

/** Cererea, dupa ce a fost citita: sume rotunjite la ban, denumiri curatate. */
export interface CosturiCerute {
  transport: number | null;
  taxaRamburs: number | null;
  reducere: number | null;
  adaugate: CostAdaugat[];
}

export const FARA_COSTURI: CosturiCerute = { transport: null, taxaRamburs: null, reducere: null, adaugate: [] };

/** S-a cerut vreo schimbare de costuri? */
export function cereCosturi(c: CosturiCerute): boolean {
  return c.transport !== null || c.taxaRamburs !== null || c.reducere !== null || c.adaugate.length > 0;
}

/** Denumirea unui cost: fara caractere de control, cu spatiile stranse. */
export function numeleCostului(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
}

function sumaCeruta(v: unknown, ce: string): number | null | { error: string } {
  if (v === undefined || v === null) return null;
  /*
   * ⚠ `typeof === "number"`, nu `Number(v)`: un sir gol ar fi devenit 0, adica „scoate
   * transportul”, pentru un camp pe care omul doar l-a golit. Fereastra trimite numere.
   */
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > SUMA_MAXIMA) {
    return { error: `${ce} trebuie să fie o sumă între 0 și ${SUMA_MAXIMA.toLocaleString("ro-RO")} de lei.` };
  }
  return round2(v);
}

/**
 * Citeste cererea de costuri fara sa creada nimic despre forma ei: actiunile de server sunt
 * endpointuri publice, chemabile cu orice argumente.
 */
export function citesteCosturile(brut: unknown): CosturiCerute | { error: string } {
  if (brut === undefined || brut === null) return FARA_COSTURI;
  if (typeof brut !== "object" || Array.isArray(brut)) return { error: "Costurile cerute au o formă pe care nu o pot citi." };
  const o = brut as Record<string, unknown>;

  const transport = sumaCeruta(o.transport, "Transportul");
  if (transport !== null && typeof transport === "object") return transport;
  const taxaRamburs = sumaCeruta(o.taxa_ramburs, "Taxa de plată ramburs");
  if (taxaRamburs !== null && typeof taxaRamburs === "object") return taxaRamburs;
  const reducere = sumaCeruta(o.reducere, "Reducerea");
  if (reducere !== null && typeof reducere === "object") return reducere;

  const adaugate: CostAdaugat[] = [];
  if (o.adaugate !== undefined && o.adaugate !== null) {
    if (!Array.isArray(o.adaugate)) return { error: "Costurile suplimentare au o formă pe care nu o pot citi." };
    if (o.adaugate.length > COSTURI_ADAUGATE_MAX) {
      return { error: `Se pot adăuga cel mult ${COSTURI_ADAUGATE_MAX} costuri suplimentare într-o salvare.` };
    }
    for (const b of o.adaugate as unknown[]) {
      const c = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
      const nume = numeleCostului(c.nume);
      if (!nume) return { error: "Fiecare cost suplimentar are nevoie de o denumire: ea ajunge pe factură." };
      if (nume.length > NUME_COST_MAX) {
        return { error: `Denumirea unui cost suplimentar are cel mult ${NUME_COST_MAX} de caractere.` };
      }
      const suma = sumaCeruta(c.suma, `Costul „${nume}”`);
      if (suma !== null && typeof suma === "object") return suma;
      /* Zero nu e un cost: o linie de 0 lei ar ajunge pe factura fara sa schimbe nimic. */
      if (suma === null || suma <= 0) return { error: `Costul „${nume}” are nevoie de o sumă mai mare decât zero.` };
      adaugate.push({ nume, suma });
    }
  }

  return { transport, taxaRamburs, reducere, adaugate };
}

/**
 * Liniile de scris in `orders.items` pentru costurile adaugate.
 *
 * ⚠ Doar cele patru chei ale unei linii obisnuite (`eLinieSimpla`), cu cantitatea 1: costul e o
 * suma, nu un pret pe bucata. Id-urile vin de la apelant (serverul le trage la sorti,
 * previzualizarea nu are nevoie de ele), ca modulul sa ramana pur.
 */
export function liniiDeCost(
  adaugate: CostAdaugat[],
  ids: string[],
): { product_id: string; name: string; price: number; quantity: number }[] {
  return adaugate.map((c, i) => {
    const id = ids[i];
    if (!id) throw new Error("liniiDeCost: lipseste id-ul unei linii");
    return { product_id: `${PREFIX_COST_MANUAL}${id}`, name: c.nume, price: c.suma, quantity: 1 };
  });
}

/** Banii comenzii, asa cum stau in baza inainte de editare. */
export interface ComandaDeSocotit {
  subtotal: number;
  /** `orders.discount_amount`: cuponul si reducerea data de mana, impreuna. */
  discount: number;
  cardDiscount: number;
  codDiscount: number;
  codFee: number;
  shipping: number;
  /**
   * Transportul a fost pus de mana intr-o editare de dinainte
   * (`shipping_address.transport_manual`). Vezi `socotesteEditarea`.
   */
  transportManual: boolean;
}

export interface IntrareSocoteala {
  comanda: ComandaDeSocotit;
  /** Suma extraoptiunilor de pe comanda INAINTE de editare. */
  extrasVechi: number;
  /** Din planul de editare: cat se muta subtotalul. */
  deltaSubtotal: number;
  /** Din planul de editare: extraoptiunile de DUPA editare, fara costurile adaugate acum. */
  extrasPlan: number;
  costuri: CosturiCerute;
  /** Transportul recotat pentru destinatia noua si ACCEPTAT de server. `null` cand nu e. */
  transportCotat: number | null;
  /** Taxa de ramburs a magazinului e un procent din baza (altfel e suma fixa). */
  taxaProcentuala: boolean;
  /** `null` = magazinul nu ofera livrare gratuita peste un prag. */
  pragTransportGratuit: number | null;
  vat: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean };
}

export interface Socoteala {
  subtotal: number;
  extras: number;
  discount: number;
  cardDiscount: number;
  codDiscount: number;
  codFee: number;
  /** Transportul chiar cerut clientului, dupa pragul de livrare gratuita. */
  shipping: number;
  vatAmount: number;
  total: number;
  /** Ce se scrie mai departe in `shipping_address.transport_manual`. */
  transportManual: boolean;
}

/**
 * Taxa de plata ramburs dupa editare.
 *
 * Suma scrisa de comerciant bate tot. Altfel ramane regula de dinainte: taxa PROCENTUALA se
 * scaleaza cu baza ei (marfa plus extraoptiuni, minus reducere), pastrand procentul convenit la
 * plasare; cea fixa nu se misca. O taxa care n-a existat nu apare singura, iar una pusa pe zero de
 * comerciant ramane zero (`taxaVeche > 0`).
 */
export function taxaRambursDupaEditare(p: {
  ceruta: number | null;
  taxaVeche: number;
  bazaVeche: number;
  bazaNoua: number;
  procentuala: boolean;
}): number {
  if (p.ceruta !== null) return p.ceruta;
  const taxaVeche = round2(p.taxaVeche);
  return p.procentuala && p.bazaNoua !== p.bazaVeche && taxaVeche > 0 && p.bazaVeche > 0
    ? round2(taxaVeche * (p.bazaNoua / p.bazaVeche))
    : taxaVeche;
}

/**
 * Toti banii comenzii dupa editare, dintr-o singura socoteala.
 *
 * ═══ ⚠ TRANSPORTUL PUS DE MANA NU SE MAI JUDECA DUPA PRAG ═══
 *
 * `recalculeazaTotal` face transportul gratuit ori de cate ori marfa trece de pragul magazinului.
 * Corect cat timp transportul e cel cotat la plasare; gresit din clipa in care comerciantul a scris
 * el o suma: pe o comanda de 500 de lei intr-un magazin cu prag de 300, cei 30 de lei pusi de mana
 * ar fi disparut la prima corectare a unui telefon. De aceea comanda tine minte ca transportul e
 * al comerciantului, iar pragul nu se mai aplica pana cand el il schimba din nou sau aplica o
 * cotatie noua pentru alta destinatie.
 */
export function socotesteEditarea(p: IntrareSocoteala): Socoteala {
  const c = p.comanda;
  const subtotal = round2(c.subtotal + p.deltaSubtotal);
  const extras = round2(p.extrasPlan + p.costuri.adaugate.reduce((s, a) => s + a.suma, 0));
  const discountVechi = round2(c.discount);
  const discount = p.costuri.reducere !== null ? p.costuri.reducere : discountVechi;

  const codFee = taxaRambursDupaEditare({
    ceruta: p.costuri.taxaRamburs,
    taxaVeche: c.codFee,
    /* ⚠ Baza VECHE din extraoptiunile si reducerea VECHI: un raport intre doua momente. */
    bazaVeche: round2(c.subtotal + p.extrasVechi - discountVechi),
    bazaNoua: round2(subtotal + extras - discount),
    procentuala: p.taxaProcentuala,
  });

  const transportManual = p.costuri.transport !== null ? true
    : p.transportCotat !== null ? false
    : c.transportManual;
  const transportDeBaza = p.costuri.transport !== null ? p.costuri.transport
    : p.transportCotat !== null ? p.transportCotat
    : c.shipping;

  const r = recalculeazaTotal({
    subtotal,
    extras,
    discount,
    cardDiscount: c.cardDiscount,
    codDiscount: c.codDiscount,
    codFee,
    shipping: transportDeBaza,
    freeShippingThreshold: transportManual ? null : p.pragTransportGratuit,
    vat: p.vat,
  });

  return {
    subtotal,
    extras,
    discount,
    cardDiscount: round2(c.cardDiscount),
    codDiscount: round2(c.codDiscount),
    codFee,
    shipping: r.shipping,
    vatAmount: r.vatAmount,
    total: r.total,
    transportManual,
  };
}
