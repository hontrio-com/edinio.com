"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteUuid } from "@/lib/supabase/ids";
import { logError } from "@/lib/error-logger";
import type { ContinutPublicat } from "@/lib/editor-magazin/ciorna";
import { instantaneuContinut, VERSIUNI_PASTRATE, type VersiuneInLista } from "@/lib/editor-magazin/versiuni";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { curataContinutulPentruEditor } from "@/lib/storefront/design/continut-pentru-editor";
import { ciornaAFostSchimbata } from "@/lib/storefront/design/draft-guard";
import {
  MAX_CONTINUT_BYTES,
  atingeCheiPc,
  ciornaCuContinut,
  contextCuCiorna,
  continutDinCiorna,
  marimeContinut,
  pcCuCiorna,
  type ContinutCiorna,
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

/**
 * Peste plafon, aproape sigur din „Conținut liber” (etapa 9): restul designului are cativa KB (cel
 * mai mare din productie, 3 KB pe 27.10.2026), deci mesajul spune unde sa taie.
 */
const PREA_MARE = "Designul e prea mare. Scurtează sau scoate din blocurile „Conținut liber”.";

type ActionResult = { error: string } | { success: true };

interface OwnedStore {
  businessId: string;
  userId: string;
  slug: string | null;
  ctx: DesignContext;
  /** Coloanele din `businesses` pe care le regleaza editorul, asa cum sunt ACUM in magazin. */
  magazin: ContinutPublicat["magazin"];
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
    .select("id, slug, logo_url, primary_color, features, cover_url, gallery, tagline, store_settings(page_content)")
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
    magazin: {
      logo_url: biz.logo_url,
      cover_url: biz.cover_url,
      primary_color: biz.primary_color ?? "#07c527",
      gallery: Array.isArray(biz.gallery) ? biz.gallery.filter((u): u is string => typeof u === "string" && !!u) : [],
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

interface Instantaneu {
  design: unknown;
  continut: ContinutCiorna;
}

/**
 * Pastreaza ca versiune ce tocmai a ajuns in magazin (etapa 7 din `docs/editor-magazin/PLAN.md`);
 * cand magazinul n-are inca nicio versiune, si ce era in magazin inainte, ca si primul „Publică” sa
 * se poata desface. Pastreaza cele mai noi `VERSIUNI_PASTRATE`.
 *
 * ⚠ Nu poate strica publicarea: magazinul e deja schimbat, deci o cadere ajunge doar in jurnal.
 * ⚠ Clientul de serviciu (tabelul n-are politici), deci NUMAI cu `owned.businessId`, iar chemata doar
 * dupa `loadOwnedStore`.
 */
async function pastreazaVersiunea(
  owned: OwnedStore,
  v: { inainte: Instantaneu & { la: string | null }; publicat: Instantaneu & { la: string } },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { count, error: eNumar } = await admin
      .from("storefront_design_versions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", owned.businessId);
    if (eNumar) throw new Error(eNumar.message);

    const randuri: { business_id: string; design: Json; continut: Json; origine: string; publicat_de: string | null; created_at: string }[] = [];
    if (count === 0) {
      // Data ei e a publicarii de dinainte, cand exista; altfel o clipa inaintea celei de acum.
      const inainteLa = v.inainte.la && Date.parse(v.inainte.la) < Date.parse(v.publicat.la)
        ? v.inainte.la
        : new Date(Date.parse(v.publicat.la) - 1000).toISOString();
      randuri.push({
        business_id: owned.businessId, design: v.inainte.design as Json, continut: v.inainte.continut as unknown as Json,
        origine: "inainte", publicat_de: null, created_at: inainteLa,
      });
    }
    randuri.push({
      business_id: owned.businessId, design: v.publicat.design as Json, continut: v.publicat.continut as unknown as Json,
      origine: "publicare", publicat_de: owned.userId, created_at: v.publicat.la,
    });
    const { error: eScris } = await admin.from("storefront_design_versions").insert(randuri);
    if (eScris) throw new Error(eScris.message);

    if ((count ?? 0) + randuri.length > VERSIUNI_PASTRATE) {
      const { data: vechi, error: eVechi } = await admin
        .from("storefront_design_versions")
        .select("id")
        .eq("business_id", owned.businessId)
        .order("created_at", { ascending: false })
        .range(VERSIUNI_PASTRATE, VERSIUNI_PASTRATE + 99);
      if (eVechi) throw new Error(eVechi.message);
      if (vechi && vechi.length > 0) {
        const { error: eSters } = await admin
          .from("storefront_design_versions")
          .delete()
          .eq("business_id", owned.businessId)
          .in("id", vechi.map((r) => r.id));
        if (eSters) throw new Error(eSters.message);
      }
    }
  } catch (e) {
    logError({ action: "publishDesign.versiune", businessId: owned.businessId, message: e instanceof Error ? e.message : String(e) });
  }
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
  if (tooLarge(design)) return { error: PREA_MARE };

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
      return { error: "Designul a fost modificat în altă filă. Reîncarcă pagina ca să nu pierzi acele modificări." };
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
 *
 * Din etapa 7, la urma, ce a ajuns in magazin se pastreaza ca versiune (`pastreazaVersiunea`),
 * cu chiar data publicarii.
 */
export async function publishDesign(businessId: string, deEcran?: unknown): Promise<ActionResult> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("store_settings")
    .select("storefront_design_draft, storefront_design, storefront_design_pub_at")
    .eq("business_id", owned.businessId)
    .single();

  const sursa = deEcran ?? row?.storefront_design_draft;
  if (!sursa) return { error: "Nu există modificări de publicat." };

  const continut = continutDinCiorna(sursa);
  if (marimeContinut(continut) > MAX_CONTINUT_BYTES) return { error: "Conținutul nepublicat e prea mare. Publică sau renunță la o parte din el." };
  const design = parseStoreDesign(sursa, contextCuCiorna(owned.ctx, continut));
  if (tooLarge(design)) return { error: PREA_MARE };

  // 1. Continutul. Doar cheile atinse (si cele scoase de o versiune readusa), imbinate peste
  //    `page_content` citit acum (in `loadOwnedStore`): ce au scris Setarile intre timp ramane, ca la
  //    `updatePageContent`.
  const pcNou = pcCuCiorna(owned.ctx.pageContent, continut);
  if (atingeCheiPc(continut)) {
    const scris = await writeSettings(owned.businessId, { page_content: pcNou as Json }, "publishDesign.continut");
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

  // Aceeasi data si pe versiune: asa stie istoricul care versiune e „În magazin acum”.
  const publicatLa = new Date().toISOString();
  const result = await writeSettings(
    owned.businessId,
    {
      // Designul, parsat mai sus cu continutul ciornei, care acum e si in magazin.
      storefront_design: design as unknown as Json,
      storefront_design_draft: null,
      storefront_design_pub_at: publicatLa,
    },
    "publishDesign",
  );
  if ("error" in result) return result;

  // La urma, istoricul (etapa 7): abia acum, cand magazinul chiar s-a schimbat.
  await pastreazaVersiunea(owned, {
    inainte: {
      design: row?.storefront_design ?? {},
      continut: instantaneuContinut(owned.ctx.pageContent, owned.magazin),
      la: row?.storefront_design_pub_at ?? null,
    },
    publicat: {
      design,
      continut: instantaneuContinut(pcNou, { ...owned.magazin, ...continut.magazin }),
      la: publicatLa,
    },
  });

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

/**
 * Istoricul publicarilor (etapa 7), cele mai noi intai, cu data publicarii din magazin: lista scrie
 * „În magazin acum” doar pe versiunea cu chiar data aceea (`esteInMagazin`).
 */
export async function listDesignVersions(
  businessId: string,
): Promise<{ versiuni: VersiuneInLista[]; publicatLa: string | null } | { error: string }> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;

  const supabase = await createClient();
  const [{ data, error }, { data: setari }] = await Promise.all([
    createAdminClient()
      .from("storefront_design_versions")
      .select("id, created_at, origine")
      .eq("business_id", owned.businessId)
      .order("created_at", { ascending: false })
      .limit(VERSIUNI_PASTRATE),
    supabase.from("store_settings").select("storefront_design_pub_at").eq("business_id", owned.businessId).single(),
  ]);
  // ⚠ O citire cazuta NU e „n-ai nicio versiune”: lista goala ar fi mintit.
  if (error) {
    logError({ action: "listDesignVersions", businessId: owned.businessId, message: error.message });
    return { error: "Nu am putut citi istoricul. Încearcă din nou." };
  }
  return {
    versiuni: (data ?? []).map((r) => ({ id: r.id, la: r.created_at, origine: r.origine === "inainte" ? "inainte" : "publicare" })),
    publicatLa: setari?.storefront_design_pub_at ?? null,
  };
}

/**
 * O versiune intreaga, pentru „Readu în editor”. Nu atinge magazinul: editorul o pune in ciorna, iar de
 * acolo trece prin aceleasi porti ca orice ciorna (parserul, lista alba, plafoanele).
 */
export async function getDesignVersion(
  businessId: string,
  idVersiune: string,
): Promise<{ design: unknown; continut: unknown; la: string } | { error: string }> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;
  if (!esteUuid(idVersiune)) return { error: "Versiunea nu mai există." };

  // ⚠ Si `business_id`, nu doar `id`: altfel se putea cere versiunea altui magazin.
  const { data, error } = await createAdminClient()
    .from("storefront_design_versions")
    .select("design, continut, created_at")
    .eq("id", idVersiune)
    .eq("business_id", owned.businessId)
    .maybeSingle();
  // Doua mesaje, fiindca sunt doua lucruri: citirea noastra a cazut, sau versiunea nu (mai) e a lui.
  if (error) {
    logError({ action: "getDesignVersion", businessId: owned.businessId, message: error.message });
    return { error: "Nu am putut citi versiunea acum. Încearcă din nou." };
  }
  if (!data) return { error: "Versiunea nu mai există." };
  // „Conținut liber” (etapa 9): blocurile versiunii ajung in editor curatate, ca ale paginilor proprii.
  return { design: curataContinutulPentruEditor(data.design), continut: data.continut, la: data.created_at };
}
