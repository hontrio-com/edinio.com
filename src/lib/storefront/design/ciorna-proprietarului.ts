import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Designul de randat pe o pagina de magazin: ciorna proprietarului in editorul
 * de design, altfel cel publicat.
 *
 * Pagina principala si pagina Magazin o faceau de mult; pagina de produs, cosul
 * si comanda randau mereu designul publicat. In editorul unic (etapa 2) ele sunt
 * pagini pe care comerciantul le alege si le regleaza, deci ciorna lui trebuie sa
 * se vada si acolo, ca pe pagina principala.
 *
 * ⚠ Ciorna se citeste SEPARAT, nu in randul de setari al paginii: randul acela
 * pleaca intreg catre componente de client, iar React il serializeaza in HTML.
 * Coloana de ciorna n-are voie sa ajunga in pagina unui vizitator.
 */
export async function designDeRandat(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  publicat: unknown,
  esteEditorDesign: boolean,
): Promise<unknown> {
  if (!esteEditorDesign) return publicat;
  const { data } = await admin
    .from("store_settings")
    .select("storefront_design_draft")
    .eq("business_id", businessId)
    .maybeSingle();
  return data?.storefront_design_draft ?? publicat;
}
