"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import { queueSyncAll } from "@/lib/actions/google-merchant.actions";
import {
  FELURI_PERMALINK, setareaPermalinkurilor, urmatoareaSetare, valideazaPermalinkuri,
  type FelPermalink, type Permalinkuri,
} from "@/lib/storefront/permalinkuri";

/**
 * Salveaza prefixele din Setari > Permalink-uri.
 *
 * ⚠ Fiind "use server", e un punct de intrare HTTP public: proprietarul se verifica
 * aici, iar regulile (forma, cuvinte rezervate, diferite intre ele, nu peste o
 * pagina proprie) se aplica pe server, nu doar in formular.
 *
 * ⚠ Prefixele VECHI intra in istoric (`anterioare`): adresele lor raman valide si
 * duc, prin redirectionare permanenta, la cele noi.
 *
 * ⚠ `page_content` se completeaza, nu se inlocuieste: se scrie doar cheia
 * `permalinks`, peste randul citit acum. Si e SINGURUL drum care o scrie
 * (`updatePageContent` o arunca), ca un editor deschis de ieri sa n-o calce.
 */
export async function salveazaPermalinkurile(
  businessId: string,
  cerute: Partial<Record<FelPermalink, string>>,
): Promise<{ ok: true; valoare: Permalinkuri; schimbat: boolean } | { ok: false; eroare: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, eroare: "Nu ești autentificat." };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!biz) return { ok: false, eroare: "Magazin negăsit." };

  const [{ data: ss, error: eCitire }, { data: pagini, error: ePagini }] = await Promise.all([
    supabase.from("store_settings").select("id, page_content").eq("business_id", businessId).maybeSingle(),
    supabase.from("custom_pages").select("slug").eq("business_id", businessId),
  ]);
  if (eCitire || ePagini) {
    void logError({
      action: "permalinkuri.salvare", severity: "error", businessId,
      message: `citirea a picat: ${(eCitire ?? ePagini)?.message}`,
    });
    return { ok: false, eroare: "Nu am putut citi setările. Încearcă din nou." };
  }
  if (!ss) return { ok: false, eroare: "Setările magazinului lipsesc. Salvează întâi o setare generală." };

  const pageContent = (ss.page_content as Record<string, unknown> | null) ?? {};
  const veche = setareaPermalinkurilor(pageContent);
  const validare = valideazaPermalinkuri(cerute, (pagini ?? []).map((p) => p.slug as string), veche.anterioare);
  if (!validare.ok) return { ok: false, eroare: validare.eroare };
  const schimbat = FELURI_PERMALINK.some((f) => veche[f] !== validare.valoare[f]);
  if (!schimbat) return { ok: true, valoare: validare.valoare, schimbat: false };

  const noua = urmatoareaSetare(veche, validare.valoare);
  const { error: eScriere } = await supabase
    .from("store_settings")
    .update({ page_content: { ...pageContent, permalinks: noua } as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (eScriere) {
    void logError({ action: "permalinkuri.salvare", severity: "error", businessId, message: eScriere.message });
    return { ok: false, eroare: "Nu am putut salva. Încearcă din nou." };
  }

  // Se citeste inapoi: o scriere care n-a atins niciun rand nu da eroare.
  const { data: dupa } = await supabase
    .from("store_settings").select("page_content").eq("business_id", businessId).maybeSingle();
  const scris = setareaPermalinkurilor(dupa?.page_content);
  if (FELURI_PERMALINK.some((f) => scris[f] !== validare.valoare[f])) {
    void logError({ action: "permalinkuri.salvare", severity: "error", businessId, message: "citit inapoi altceva decat s-a scris" });
    return { ok: false, eroare: "Salvarea nu s-a confirmat. Reîncarcă pagina și încearcă din nou." };
  }

  /*
   * Link-urile produselor din Google Merchant se reimprospateaza oricum in cel mult 7 zile;
   * cand s-a schimbat prefixul produselor, catalogul intra in coada acum. Fara conexiune,
   * `queueSyncAll` refuza singur, iar asta nu e o eroare a salvarii.
   */
  // DUPA raspuns (`after`): pe un catalog mare, punerea in coada ar fi facut salvarea lenta,
  // iar o cadere tarzie ar fi aratat eroare pentru o salvare care reusise deja.
  if (veche.produs !== validare.valoare.produs) {
    after(async () => {
      try { await queueSyncAll(businessId); } catch { /* reimprospatarea de 7 zile o prinde */ }
    });
  }

  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`, "layout");
  return { ok: true, valoare: validare.valoare, schimbat: true };
}
