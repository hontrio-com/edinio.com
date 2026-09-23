import { createAdminClient } from "@/lib/supabase/admin";

export type RezumatCont = {
  comenzi: number;
  /** Comenzi care n-au ajuns inca la capat (in asteptare, confirmate, in lucru, pe drum). */
  inCurs: number;
  facturi: number;
  retururi: number;
};

export const REZUMAT_GOL: RezumatCont = { comenzi: 0, inCurs: 0, facturi: 0, retururi: 0 };

/**
 * Numerele din meniul contului, intr-un singur drum pana la baza.
 *
 * ⚠ Predicatele sunt EXACT cele ale listelor (`cont_rezumat` le copiaza pe ale lui
 * `cont_facturile_mele` si `cont_retururile_mele`), ca meniul sa nu spuna „3
 * facturi" peste o pagina cu doua.
 */
export async function rezumatulContului(businessId: string, contId: string): Promise<RezumatCont> {
  const { data, error } = await createAdminClient().rpc("cont_rezumat", {
    p_business: businessId,
    p_cont: contId,
  });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) ?? null;
  if (!r) return REZUMAT_GOL;
  return {
    comenzi: Number(r.comenzi ?? 0),
    inCurs: Number(r.in_curs ?? 0),
    facturi: Number(r.facturi ?? 0),
    retururi: Number(r.retururi ?? 0),
  };
}
