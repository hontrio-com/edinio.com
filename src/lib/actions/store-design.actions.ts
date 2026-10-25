"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { ciornaAFostSchimbata } from "@/lib/storefront/design/draft-guard";
import {
  MAX_CONTINUT_BYTES,
  ciornaCuContinut,
  contextCuCiorna,
  continutDinCiorna,
  marimeContinut,
  pcCuCiorna,
} from "@/lib/storefront/design/continut-ciorna";
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
 * Din etapa 6 ciorna tine si continutul nepublicat (`continut`: cheile atinse din `page_content`,
 * plus logo, coperta, culoare, galerie; vezi `continut-ciorna.ts`), deci „Publică” il duce si pe el
 * in magazin, iar „Renunță” il arunca odata cu designul.
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
  userId: string;
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
    userId: user.id,
    slug: biz.slug,
    ctx: {
      primaryColor: biz.primary_color ?? "#07c527",
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
 *
 * ⚠ `null` si `undefined` sunt lucruri DIFERITE aici. `undefined` inseamna „nu
 * verifica nimic"; `null` inseamna „am pornit de la o coloana goala" — starea in
 * care ajunge fiecare magazin dupa Publica si dupa Renunta. Un client care
 * trimite designul de pe ecran in loc de `null` isi refuza singur prima salvare,
 * la nesfarsit. Vezi `draft-guard.ts`.
 */
export async function saveDesignDraft(businessId: string, raw: unknown, baza?: unknown): Promise<ActionResult> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;

  // Continutul nepublicat (etapa 6), pe lista alba; designul se parseaza CU el, altfel un rand de
  // produse care exista doar in ciorna ar fi iesit din design ca orfan.
  const continut = continutDinCiorna(raw);
  if (marimeContinut(continut) > MAX_CONTINUT_BYTES) return { error: "Conținutul nepublicat e prea mare. Publică sau renunță la o parte din el." };
  const design = parseStoreDesign(raw, contextCuCiorna(owned.ctx, continut));
  if (tooLarge(design)) return { error: "Configuratia de design e prea mare." };

  if (baza !== undefined) {
    const supabase = await createClient();
    const { data: rand } = await supabase
      .from("store_settings")
      .select("storefront_design_draft")
      .eq("business_id", owned.businessId)
      .single();
    // Regulile si capcanele stau in `draft-guard.ts`, langa testele lor. Cel mai
    // important: coloana goala inseamna `null`, iar `baza` trebuie sa poarte ce
    // scrie in COLOANA, nu ce se vede pe ecranul care salveaza.
    if (ciornaAFostSchimbata(rand?.storefront_design_draft, baza, owned.ctx)) {
      return { error: "Designul a fost modificat in alta fila. Reincarca pagina ca sa nu pierzi acele modificari." };
    }
  }

  const result = await writeSettings(
    owned.businessId,
    { storefront_design_draft: ciornaCuContinut(design, continut) as unknown as Json },
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
 *
 * ⚠ Din etapa 6, INTAI continutul (`page_content` imbinat pe chei, apoi `businesses`), APOI
 * designul, parsat cu continutul nou, si golirea ciornei. Cazut la mijloc, ciorna ramane intreaga
 * si „Publică” se poate repeta: scrierile de continut sunt idempotente. Invers, un design publicat
 * fara continutul lui ar fi putut arata in magazin un rand de produse inca nescris.
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

  const continut = continutDinCiorna(sursa);
  if (marimeContinut(continut) > MAX_CONTINUT_BYTES) return { error: "Conținutul nepublicat e prea mare. Publică sau renunță la o parte din el." };
  const design = parseStoreDesign(sursa, contextCuCiorna(owned.ctx, continut));
  if (tooLarge(design)) return { error: "Configuratia de design e prea mare." };

  // 1. Continutul. Doar cheile atinse, imbinate peste `page_content` citit acum (in `loadOwnedStore`):
  //    ce au scris Setarile intre timp ramane, ca la `updatePageContent`.
  if (Object.keys(continut.pc).length > 0) {
    const scris = await writeSettings(owned.businessId, { page_content: pcCuCiorna(owned.ctx.pageContent, continut) as Json }, "publishDesign.continut");
    if ("error" in scris) return scris;
  }
  if (Object.keys(continut.magazin).length > 0) {
    const { error } = await supabase
      .from("businesses")
      .update(continut.magazin as never)
      .eq("id", owned.businessId)
      .eq("user_id", owned.userId);
    if (error) {
      logError({ action: "publishDesign.magazin", businessId: owned.businessId, message: error.message });
      return { error: "Eroare la salvare." };
    }
  }

  const result = await writeSettings(
    owned.businessId,
    {
      // Designul, parsat mai sus cu continutul ciornei, care acum e si in magazin.
      storefront_design: design as unknown as Json,
      storefront_design_draft: null,
      storefront_design_pub_at: new Date().toISOString(),
    },
    "publishDesign",
  );
  if ("error" in result) return result;

  revalidatePath("/dashboard/editor");
  if (owned.slug) {
    revalidatePath(`/${owned.slug}`);
    // Si rutele care depind de acelasi design. Azi sunt dinamice prin
    // `headers()`, deci revalidarea n-are ce invalida, dar publicarea nu trebuie
    // sa devina jumatate corecta in ziua in care una dintre ele capata cache.
    revalidatePath(`/${owned.slug}/magazin`);
    revalidatePath(`/${owned.slug}/cos`);
    revalidatePath(`/${owned.slug}/checkout`);
    // Si catalogul pe un prefix propriu (Setari > Permalink-uri): tot ce sta sub magazin.
    revalidatePath(`/${owned.slug}`, "layout");
  }
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
