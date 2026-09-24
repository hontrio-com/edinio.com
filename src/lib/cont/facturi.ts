import { createAdminClient } from "@/lib/supabase/admin";
import { documentulFiscal, type DocumentFiscal } from "./documente";
import { decalajSigur } from "./paginare";

export type FacturaDinCont = {
  orderId: string;
  numarComanda: string;
  comandaLa: string;
  /** Totalul COMENZII: suma documentului nu e stocata nicaieri. */
  totalComanda: number;
  stareComanda: string;
  document: DocumentFiscal;
  firma: { denumire: string; cui: string | null } | null;
};

/**
 * Facturile cumparatorului, pentru pagina „Facturi".
 *
 * ⚠ Nu se aduce NICIUN PDF aici: fiecare document se cere viu, la furnizor, abia
 * la clic (`/api/cont/factura`). Limitele lor de cereri nu le stim.
 */
export async function facturileMele(
  businessId: string,
  contId: string,
  limita = 20,
  decalaj = 0,
): Promise<{ facturi: FacturaDinCont[]; total: number }> {
  const { data, error } = await createAdminClient().rpc("cont_facturile_mele", {
    p_business: businessId,
    p_cont: contId,
    p_limita: limita,
    p_decalaj: decalajSigur(decalaj),
  });
  if (error) throw error;

  const randuri = data ?? [];
  const facturi: FacturaDinCont[] = [];
  for (const r of randuri) {
    const document = documentulFiscal(r.document);
    /* Baza nu intoarce rand fara document; paza e pentru o forma neasteptata. */
    if (!document) continue;
    facturi.push({
      orderId: r.order_id,
      numarComanda: r.numar_comanda,
      comandaLa: r.comanda_la,
      totalComanda: Number(r.total_comanda),
      stareComanda: r.stare_comanda,
      document,
      firma: r.firma_denumire ? { denumire: r.firma_denumire, cui: r.firma_cui } : null,
    });
  }
  return { facturi, total: randuri.length > 0 ? Number(randuri[0].total_randuri) : 0 };
}
