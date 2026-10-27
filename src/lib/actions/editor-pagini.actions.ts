"use server";

import { createClient } from "@/lib/supabase/server";
import { dateBlocuriMagazin, dateEditorPagina, type DateBlocuri, type DateEditorPagina } from "@/lib/pages/date-editor-pagina";

/**
 * O pagina proprie deschisa in editorul unic (etapa 5 din `docs/editor-magazin/PLAN.md`): randul ei
 * si datele de previzualizare, doar pentru proprietarul ei (`dateEditorPagina` verifica). `null`
 * pentru o pagina lipsa sau a altcuiva.
 */
export async function datePaginaInEditor(pageId: string): Promise<DateEditorPagina | null> {
  if (typeof pageId !== "string" || !/^[0-9a-zA-Z-]{1,64}$/.test(pageId)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return dateEditorPagina(supabase, pageId, user.id);
}

/**
 * Datele blocurilor pentru „Conținut liber” (etapa 9): produsele, formularele, pachetele, integrarile,
 * legaturile magazinului, doar pentru proprietar (`dateBlocuriMagazin` verifica). `null` altfel.
 */
export async function dateBlocuriInEditor(businessId: string): Promise<DateBlocuri | null> {
  if (typeof businessId !== "string" || !/^[0-9a-zA-Z-]{1,64}$/.test(businessId)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return dateBlocuriMagazin(supabase, businessId, user.id);
}
