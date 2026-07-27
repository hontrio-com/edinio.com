"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import type { Json } from "@/types/database.types";

/**
 * Salvarea si publicarea designului de magazin.
 *
 * Modelul e ciorna + publicare, nu salvare directa: un magazin cu vanzari active
 * nu are voie sa se schimbe sub ochii clientilor in timp ce proprietarul se joaca
 * cu variantele. `storefront_design_draft` e vizibil doar proprietarului, in
 * `/{slug}?preview=1`; `storefront_design` e ce vad vizitatorii.
 *
 * Validarea foloseste EXACT parserul de la citire (`parseStoreDesign`), nu o a
 * doua schema. Un al doilea strat ar diverge inevitabil de primul; asa, ce nu
 * trece de parser nu ajunge in baza, iar ce e in baza e garantat randabil.
 */

/** Plafon de marime, in stilul lui MAX_BLOCKS_BYTES din page.actions.ts. */
const MAX_DESIGN_BYTES = 200_000;

type ActionResult = { error: string } | { success: true };

interface OwnedStore {
  businessId: string;
  slug: string | null;
  ctx: DesignContext;
}

/**
 * Verifica proprietatea si intoarce contextul necesar parserului. Contextul vine
 * din baza, nu de la client: designul „classic" se deriva din el, deci un client
 * care l-ar putea trimite ar putea si sa modifice ce se salveaza.
 */
async function loadOwnedStore(businessId: string): Promise<OwnedStore | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, primary_color, features, cover_url, tagline, store_settings(page_content)")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const settings = Array.isArray(biz.store_settings) ? biz.store_settings[0] : biz.store_settings;
  return {
    businessId: biz.id,
    slug: biz.slug,
    ctx: {
      primaryColor: biz.primary_color ?? "#1AB554",
      pageContent: (settings?.page_content as Record<string, unknown>) ?? {},
      features: (biz.features as Record<string, unknown>) ?? {},
      coverUrl: biz.cover_url,
      tagline: biz.tagline,
    },
  };
}

function tooLarge(design: StoreDesign): boolean {
  return JSON.stringify(design).length > MAX_DESIGN_BYTES;
}

/** Scrie un patch pe store_settings, cu upsert manual ca in restul fisierului store.actions.ts. */
async function writeSettings(businessId: string, patch: Record<string, unknown>, action: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("store_settings")
    .select("id")
    .eq("business_id", businessId)
    .single();

  const { error } = existing
    ? await supabase
        .from("store_settings")
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, ...patch } as never);

  if (error) {
    logError({ action, businessId, message: error.message });
    return { error: "Eroare la salvare." };
  }
  return { success: true };
}

/** Salveaza ciorna. Nu atinge ce vad vizitatorii. */
/**
 * Salveaza ciorna.
 *
 * `baza` e ciorna de la care a pornit fila care scrie. Cand in baza e altceva,
 * altcineva a salvat intre timp — doua file sau doua ecrane deschise pe acelasi
 * magazin se suprascriau tacut, iar ultimul care apasa castiga tot. Fara `baza`,
 * scrierea trece neconditionat, ca pana acum.
 */
export async function saveDesignDraft(businessId: string, raw: unknown, baza?: unknown): Promise<ActionResult> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;

  const design = parseStoreDesign(raw, owned.ctx);
  if (tooLarge(design)) return { error: "Configuratia de design e prea mare." };

  if (baza !== undefined) {
    const supabase = await createClient();
    const { data: rand } = await supabase
      .from("store_settings")
      .select("storefront_design_draft")
      .eq("business_id", owned.businessId)
      .single();
    // Compararea se face pe forma PARSATA, ca doua reprezentari echivalente ale
    // aceleiasi cioarne sa nu para un conflict.
    const inBaza = rand?.storefront_design_draft
      ? JSON.stringify(parseStoreDesign(rand.storefront_design_draft, owned.ctx))
      : null;
    const asteptat = baza === null ? null : JSON.stringify(parseStoreDesign(baza, owned.ctx));
    if (inBaza !== asteptat) {
      return { error: "Designul a fost modificat in alta fila. Reincarca pagina ca sa nu pierzi acele modificari." };
    }
  }

  const result = await writeSettings(
    owned.businessId,
    { storefront_design_draft: design as unknown as Json },
    "saveDesignDraft",
  );
  if ("error" in result) return result;

  revalidatePath("/dashboard/editor");
  return { success: true };
}

/** Muta ciorna in designul publicat. Din acest moment o vad toti vizitatorii. */
/**
 * Publica designul.
 *
 * `deEcran` e ciorna asa cum o vede comerciantul in acest moment. Autosave-ul
 * are o intarziere de o secunda, deci cine apasa Publica imediat dupa o
 * schimbare trimitea in magazin ciorna VECHE din baza, in timp ce ecranul ii
 * spunea ca totul e publicat. Valoarea primita trece prin acelasi parser total
 * ca oricare alta, deci nu poate strica designul; fara ea se cade pe ciorna din
 * baza, ca pana acum.
 */
export async function publishDesign(businessId: string, deEcran?: unknown): Promise<ActionResult> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("store_settings")
    .select("storefront_design_draft")
    .eq("business_id", owned.businessId)
    .single();

  const sursa = deEcran ?? row?.storefront_design_draft;
  if (!sursa) return { error: "Nu exista modificari de publicat." };

  const design = parseStoreDesign(sursa, owned.ctx);
  if (tooLarge(design)) return { error: "Configuratia de design e prea mare." };

  const result = await writeSettings(
    owned.businessId,
    {
      storefront_design: design as unknown as Json,
      storefront_design_draft: null,
      storefront_design_pub_at: new Date().toISOString(),
    },
    "publishDesign",
  );
  if ("error" in result) return result;

  revalidatePath("/dashboard/editor");
  if (owned.slug) revalidatePath(`/${owned.slug}`);
  return { success: true };
}

/** Renunta la modificarile nepublicate. Designul public ramane neatins. */
export async function discardDesignDraft(businessId: string): Promise<ActionResult> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;

  const result = await writeSettings(
    owned.businessId,
    { storefront_design_draft: null },
    "discardDesignDraft",
  );
  if ("error" in result) return result;

  revalidatePath("/dashboard/editor");
  return { success: true };
}
