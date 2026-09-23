import { createAdminClient } from "@/lib/supabase/admin";
import { documentulFiscal, type DocumentFiscal } from "./documente";
import { numeleCurierului, urmareste, type Urmarire } from "./urmarire";
import type { LivrareBruta } from "./livrare";

export type MiniaturaComenzii = { nume: string; imagine: string | null };

export type ComandaDinCont = {
  orderId: string;
  numar: string;
  creataLa: string;
  stare: string;
  incasata: boolean;
  total: number;
  /** Bucatile de marfa, fara extraoptiuni (suma cantitatilor). */
  bucati: number;
  /** Liniile de marfa, fara extraoptiuni. */
  produse: number;
  /** Primele patru linii de marfa, cu imaginea din catalogul de azi (sau NULL). */
  miniaturi: MiniaturaComenzii[];
  /** Are un document fiscal viu. `false` mereu la vederea redusa. */
  areFactura: boolean;
  vedere: "redusa" | "intreaga";
};

export type RandPersonalizare = { eticheta: string; valoare: string | null; fisiere: number | null };
export type ParteDefalcare = { eticheta: string | null; detaliu: string | null; suma: number | null };

export type LinieComanda = {
  nume: string;
  cantitate: number;
  pret: number;
  produsId: string | null;
  /** Extraoptiune (ambalaj cadou si altele), nu produs din catalog. */
  extra: boolean;
  /** Din catalogul de AZI: produsul poate fi sters sau schimbat intre timp. */
  imagine: string | null;
  /** Numai cand produsul e inca activ. */
  slug: string | null;
  /** NULL la vederea redusa, poarta e in baza. */
  personalizare: RandPersonalizare[] | null;
  defalcare: ParteDefalcare[] | null;
};

export type FirmaComenzii = {
  denumire: string;
  cui: string | null;
  regCom: string | null;
  adresa: string | null;
  oras: string | null;
  judet: string | null;
  platitorTva: boolean | null;
};

export type DetaliuComanda = {
  orderId: string;
  numar: string;
  creataLa: string;
  stare: string;
  incasata: boolean;
  metodaPlata: string | null;
  /* ⚠ Nule la vederea REDUSA: poarta e in baza, iar tipul o spune. */
  subtotal: number | null;
  transport: number | null;
  reducere: number | null;
  taxaRamburs: number | null;
  reducereCard: number | null;
  reducereRamburs: number | null;
  codReducere: string | null;
  tva: number | null;
  cotaTva: number | null;
  /* Regimul de pret INGHETAT pe comanda; `null` la comenzile de dinaintea lui. */
  regimTva: boolean | null;
  /** `orders.payment_status` brut; se citeste numai prin `stareaPlatii`. */
  starePlata: string | null;
  /** Cat a economisit din oferte. INFORMATIV: e deja in pretul liniilor. */
  economieOferte: number | null;
  /** `orders.notes`, text; se citeste prin `detaliileDeLaCheckout`. */
  detalii: string | null;
  total: number;
  linii: LinieComanda[];
  livrare: LivrareBruta | null;
  firma: FirmaComenzii | null;
  factura: DocumentFiscal | null;
  curier: string | null;
  numeCurier: string | null;
  awb: string | null;
  awbEmisLa: string | null;
  /** Curierul REAL la brokeri (Woot, Innoship, Shipo, SmartShip), cum il da brokerul. */
  curierReal: string | null;
  urmarire: Urmarire | null;
  vedere: "redusa" | "intreaga";
};

/* ═══ Cititori defensivi pentru campurile jsonb ═══ */

const sir = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numar = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const obiect = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function personalizarea(v: unknown): RandPersonalizare[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .map(obiect)
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((x) => ({ eticheta: sir(x.eticheta) ?? "Personalizare", valoare: sir(x.valoare), fisiere: numar(x.fisiere) }))
    .filter((x) => x.valoare !== null || (x.fisiere !== null && x.fisiere > 0));
}

function defalcarea(v: unknown): ParteDefalcare[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .map(obiect)
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((x) => ({ eticheta: sir(x.eticheta), detaliu: sir(x.detaliu), suma: numar(x.suma) }));
}

function linia(v: unknown): LinieComanda | null {
  const l = obiect(v);
  if (!l) return null;
  return {
    nume: sir(l.nume) ?? "",
    cantitate: numar(l.cantitate) ?? 0,
    pret: numar(l.pret) ?? 0,
    produsId: sir(l.produs_id),
    extra: l.extra === true,
    imagine: sir(l.imagine),
    slug: sir(l.slug),
    personalizare: personalizarea(l.personalizare),
    defalcare: defalcarea(l.defalcare),
  };
}

function firma(v: unknown): FirmaComenzii | null {
  const f = obiect(v);
  const denumire = f ? sir(f.denumire) : null;
  /* ⚠ Baza intoarce un obiect cu toate valorile nule cand comanda nu e pe firma. */
  if (!f || !denumire) return null;
  return {
    denumire,
    cui: sir(f.cui),
    regCom: sir(f.reg_com),
    adresa: sir(f.adresa),
    oras: sir(f.oras),
    judet: sir(f.judet),
    platitorTva: typeof f.platitor_tva === "boolean" ? f.platitor_tva : null,
  };
}

function miniaturile(v: unknown): MiniaturaComenzii[] {
  return lista(v)
    .map(obiect)
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((x) => ({ nume: sir(x.nume) ?? "", imagine: sir(x.imagine) }));
}

/**
 * Leaga de cont comenzile care se potrivesc pe contactele lui verificate.
 *
 * ⚠ Se cheama dupa fiecare intrare reusita si dupa confirmarea unui contact nou,
 * nu la fiecare deschidere de pagina: e o scriere, si nu are ce sa gaseasca nou
 * intre doua clicuri. Comanda trimisa de un om deja logat NU asteapta aici: se
 * leaga pe loc, dupa insert (`leagaComandaPlasata`).
 */
export async function leagaComenzile(businessId: string, contId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("cont_maturare", {
    p_business: businessId,
    p_cont: contId,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export async function comenzileMele(
  businessId: string,
  contId: string,
  limita = 20,
  decalaj = 0,
): Promise<{ comenzi: ComandaDinCont[]; total: number }> {
  const { data, error } = await createAdminClient().rpc("cont_comenzile_mele", {
    p_business: businessId,
    p_cont: contId,
    p_limita: limita,
    p_decalaj: decalaj,
  });
  if (error) throw error;

  const randuri = data ?? [];
  return {
    comenzi: randuri.map((r) => ({
      orderId: r.order_id,
      numar: r.numar,
      creataLa: r.creata_la,
      stare: r.stare,
      incasata: r.incasata,
      total: Number(r.total),
      bucati: Number(r.bucati),
      produse: Number(r.produse ?? 0),
      miniaturi: miniaturile(r.miniaturi),
      areFactura: r.are_factura === true,
      vedere: r.vedere === "redusa" ? "redusa" : "intreaga",
    })),
    /* ⚠ Totalul vine din baza, pe acelasi rand cu comenzile: numarat separat, ar
       fi putut spune alt numar decat lista, la fel ca in fila Segmente. */
    total: randuri.length > 0 ? Number(randuri[0].total_randuri) : 0,
  };
}

export async function comandaMea(
  businessId: string,
  contId: string,
  orderId: string,
): Promise<DetaliuComanda | null> {
  const { data, error } = await createAdminClient().rpc("cont_comanda_mea", {
    p_business: businessId,
    p_cont: contId,
    p_order: orderId,
  });
  if (error) throw error;

  const r = (data ?? [])[0];
  if (!r) return null;

  return {
    orderId: r.order_id,
    numar: r.numar,
    creataLa: r.creata_la,
    stare: r.stare,
    incasata: r.incasata,
    metodaPlata: r.metoda_plata,
    subtotal: r.subtotal === null ? null : Number(r.subtotal),
    transport: r.transport === null ? null : Number(r.transport),
    reducere: r.reducere === null ? null : Number(r.reducere),
    taxaRamburs: r.taxa_ramburs === null ? null : Number(r.taxa_ramburs),
    reducereCard: r.reducere_card === null ? null : Number(r.reducere_card),
    reducereRamburs: r.reducere_ramburs === null ? null : Number(r.reducere_ramburs),
    codReducere: r.cod_reducere,
    tva: r.tva === null ? null : Number(r.tva),
    cotaTva: r.cota_tva === null ? null : Number(r.cota_tva),
    /* ⚠ `typeof`, nu adevar: `false` e un raspuns (preturi FARA TVA), nu o lipsa. */
    regimTva: typeof r.regim_tva === "boolean" ? r.regim_tva : null,
    starePlata: r.stare_plata,
    economieOferte: numar(r.economie_oferte),
    detalii: r.detalii,
    total: Number(r.total ?? 0),
    linii: lista(r.linii).map(linia).filter((x): x is LinieComanda => x !== null),
    livrare: obiect(r.livrare) as LivrareBruta | null,
    firma: firma(r.firma),
    factura: documentulFiscal(r.factura),
    curier: r.curier,
    /*
      ⚠ Numele curierului vine din `NUME_CURIER`, harta care e deja adevarul in
      panou, trecuta prin `stripDiacritics` (H6). Vezi `urmarire.ts`.
    */
    numeCurier: numeleCurierului(r.curier, r.curier_real),
    awb: r.awb,
    awbEmisLa: r.awb_emis_la,
    curierReal: r.curier_real,
    /* ⚠ Adresa salvata numai daca e `https:`, altfel tiparele din `urmarire.ts`. */
    urmarire: urmareste({ curier: r.curier, curierReal: r.curier_real, awb: r.awb, urlSalvat: r.urmarire }),
    vedere: r.vedere === "redusa" ? "redusa" : "intreaga",
  };
}
