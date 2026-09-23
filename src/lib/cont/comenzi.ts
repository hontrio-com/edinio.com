import { createAdminClient } from "@/lib/supabase/admin";
import { NUME_CURIER, type CurierPropriu } from "@/lib/orders/awb-propriu";

export type ComandaDinCont = {
  orderId: string;
  numar: string;
  creataLa: string;
  stare: string;
  incasata: boolean;
  total: number;
  bucati: number;
  vedere: "redusa" | "intreaga";
};

export type DetaliuComanda = {
  orderId: string;
  numar: string;
  creataLa: string;
  stare: string;
  incasata: boolean;
  metodaPlata: string | null;
  subtotal: number;
  transport: number;
  reducere: number;
  taxaRamburs: number;
  total: number;
  linii: { nume: string; cantitate: number; pret: number; produsId: string | null }[];
  livrare: Record<string, string | null> | null;
  firma: { denumire: string | null; cui: string | null; regCom: string | null } | null;
  factura: { casa: string; serie: string | null; numar: string } | null;
  curier: string | null;
  numeCurier: string | null;
  awb: string | null;
  urmarire: string | null;
  vedere: "redusa" | "intreaga";
};

/**
 * Leaga de cont comenzile care se potrivesc pe contactele lui verificate.
 *
 * ⚠ Se cheama dupa fiecare intrare reusita, nu la fiecare deschidere de pagina:
 * e o scriere, si nu are ce sa gaseasca nou intre doua clicuri. Un om care
 * comanda dupa ce s-a logat isi vede comanda la urmatoarea intrare, si tocmai
 * de-aia ecranul principal arata si un indiciu catre revendicare.
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

  const linii = Array.isArray(r.linii) ? (r.linii as Record<string, string | null>[]) : [];
  const firma = (r.firma ?? null) as Record<string, string | null> | null;
  const factura = (r.factura ?? null) as Record<string, string | null> | null;

  return {
    orderId: r.order_id,
    numar: r.numar,
    creataLa: r.creata_la,
    stare: r.stare,
    incasata: r.incasata,
    metodaPlata: r.metoda_plata,
    subtotal: Number(r.subtotal ?? 0),
    transport: Number(r.transport ?? 0),
    reducere: Number(r.reducere ?? 0),
    taxaRamburs: Number(r.taxa_ramburs ?? 0),
    total: Number(r.total ?? 0),
    linii: linii.map((l) => ({
      nume: l.nume ?? "",
      cantitate: Number(l.cantitate ?? 0),
      pret: Number(l.pret ?? 0),
      produsId: l.produs_id ?? null,
    })),
    livrare: (r.livrare ?? null) as Record<string, string | null> | null,
    firma: firma?.denumire
      ? { denumire: firma.denumire, cui: firma.cui ?? null, regCom: firma.reg_com ?? null }
      : null,
    factura: factura?.numar
      ? { casa: factura.casa ?? "", serie: factura.serie ?? null, numar: factura.numar }
      : null,
    curier: r.curier,
    /* ⚠ Numele curierului vine din `NUME_CURIER`, harta care e deja adevarul in
       panou. O a doua lista ar fi inceput sa se desparta de prima. */
    numeCurier: r.curier ? (NUME_CURIER[r.curier as CurierPropriu] ?? r.curier) : null,
    awb: r.awb,
    urmarire: r.urmarire,
    vedere: r.vedere === "redusa" ? "redusa" : "intreaga",
  };
}
