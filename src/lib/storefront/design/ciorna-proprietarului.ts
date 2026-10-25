import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CONTINUT_GOL, continutDinCiorna, type ContinutCiorna } from "./continut-ciorna";

/**
 * Ciorna proprietarului, pe o pagina de magazin deschisa in editor: designul ei si continutul
 * nepublicat (etapa 6, `continut-ciorna.ts`). Pentru oricine altcineva: nimic, deci designul
 * publicat si datele din magazin, ca inainte.
 *
 * Pagina principala si pagina Magazin randau de mult ciorna de design; pagina de produs, cosul
 * si comanda randau mereu designul publicat. In editorul unic (etapa 2) ele sunt pagini pe care
 * comerciantul le alege si le regleaza, deci ciorna lui trebuie sa se vada si acolo. Din etapa 6
 * se vede si continutul ei: textele, logo-ul, culoarea, inainte de „Publică”.
 *
 * ⚠ Ciorna se citeste SEPARAT, nu in randul de setari al paginii: randul acela pleaca intreg
 * catre componente de client, iar React il serializeaza in HTML. Coloana de ciorna n-are voie sa
 * ajunga in pagina unui vizitator.
 */
export interface CiornaDeRandat {
  /** Ciorna din coloana, cand pagina e deschisa in editor si exista una; altfel `null`. */
  ciorna: unknown;
  /** Continutul ei nepublicat; gol pentru oricine nu e proprietarul, in editor. */
  continut: ContinutCiorna;
}

export async function ciornaDeRandat(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  esteEditorDesign: boolean,
): Promise<CiornaDeRandat> {
  if (!esteEditorDesign) return { ciorna: null, continut: CONTINUT_GOL };
  const { data } = await admin
    .from("store_settings")
    .select("storefront_design_draft")
    .eq("business_id", businessId)
    .maybeSingle();
  const ciorna = data?.storefront_design_draft ?? null;
  return { ciorna, continut: ciorna ? continutDinCiorna(ciorna) : CONTINUT_GOL };
}
