"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteUuid } from "@/lib/supabase/ids";
import { logError } from "@/lib/error-logger";
import type { ContinutPublicat } from "@/lib/editor-magazin/ciorna";
import { ciornaDinVersiune, instantaneuContinut, origineDinBaza, VERSIUNI_PASTRATE, type VersiuneInLista } from "@/lib/editor-magazin/versiuni";
import { CHEIE_TEMA_APLICATA, continutIdentitate, dateleVersiunilorDeDinainte, radacinaCatalogTemei, type TemaAplicata } from "@/lib/teme/aplicare";
import { CHEIE_DATE_DEMO, importaDateleDemo, urmaDateDemoDin, type UrmaDateDemo } from "@/lib/teme/import-demo";
import {
  continutCuRandurileDemoDeAcum,
  faraTexteleTemelor,
  pcFaraDemoAlAltorTeme,
  produseDemoDeScos,
  stareDinVersiune,
  stareaMagazinului,
} from "@/lib/teme/inlocuire-demo";
import { citesteLoculPentruDemo, motivulLimitei } from "@/lib/teme/limita-demo";
import { SURSA_DEMO } from "@/lib/teme/produse-demo";
import { categoriiDemoDeSters } from "@/lib/teme/stergere-demo";
import { temaDupaCheie } from "@/lib/teme/teme";
import { bulkProductAction } from "@/lib/actions/product.actions";
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

    if ((count ?? 0) + randuri.length > VERSIUNI_PASTRATE) await taieVersiunileVechi(admin, owned.businessId);
  } catch (e) {
    logError({ action: "publishDesign.versiune", businessId: owned.businessId, message: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Prima versiune `tema` a magazinului: designul lui de dinainte de PRIMA tema aplicata vreodata. Nu se taie (etapa 25.6,
 * 11.11.2026): fiecare tema scrie doua versiuni, deci dupa 15 teme incercate designul lui original disparea din Istoric.
 */
async function primaVersiuneDeTema(admin: ReturnType<typeof createAdminClient>, businessId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("storefront_design_versions")
    .select("id")
    .eq("business_id", businessId)
    .eq("origine", "tema")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/**
 * Pastreaza cele mai noi `VERSIUNI_PASTRATE` versiuni ale magazinului, plus prima versiune `tema` (designul lui de
 * dinainte de prima tema); pe celelalte, mai vechi, le sterge.
 */
async function taieVersiunileVechi(admin: ReturnType<typeof createAdminClient>, businessId: string): Promise<void> {
  const [{ data: vechi, error: eVechi }, prima] = await Promise.all([
    admin
      .from("storefront_design_versions")
      .select("id")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(VERSIUNI_PASTRATE, VERSIUNI_PASTRATE + 99),
    primaVersiuneDeTema(admin, businessId),
  ]);
  if (eVechi) throw new Error(eVechi.message);
  const deSters = (vechi ?? []).map((r) => r.id).filter((id) => id !== prima);
  if (deSters.length > 0) {
    const { error: eSters } = await admin
      .from("storefront_design_versions")
      .delete()
      .eq("business_id", businessId)
      .in("id", deSters);
    if (eSters) throw new Error(eSters.message);
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
  const admin = createAdminClient();
  const [{ data, error }, { data: prima, error: ePrima }, { data: setari }] = await Promise.all([
    admin
      .from("storefront_design_versions")
      .select("id, created_at, origine")
      .eq("business_id", owned.businessId)
      .order("created_at", { ascending: false })
      .limit(VERSIUNI_PASTRATE),
    // Prima versiune `tema` ramane si cand e mai veche decat cele 30 (etapa 25.6): o arata si lista, ultima.
    admin
      .from("storefront_design_versions")
      .select("id, created_at, origine")
      .eq("business_id", owned.businessId)
      .eq("origine", "tema")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("store_settings").select("storefront_design_pub_at").eq("business_id", owned.businessId).single(),
  ]);
  // ⚠ O citire cazuta NU e „n-ai nicio versiune”: lista goala ar fi mintit.
  if (error || ePrima) {
    logError({ action: "listDesignVersions", businessId: owned.businessId, message: (error ?? ePrima)!.message });
    return { error: "Nu am putut citi istoricul. Încearcă din nou." };
  }
  const randuri = [...(data ?? [])];
  if (prima && !randuri.some((r) => r.id === prima.id)) randuri.push(prima);
  return {
    versiuni: randuri.map((r) => ({ id: r.id, la: r.created_at, origine: origineDinBaza(r.origine) })),
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

/*
  ═══════════════════════════════════════════════════════════════════════════
  TEMELE (etapa 17 din `docs/editor-magazin/PLAN.md`): „Aplică tema” si „Pune la loc designul de dinainte”
  ═══════════════════════════════════════════════════════════════════════════

  Raspunsul lui: „Direct în magazin, cu Istoric”. Amandoua trec prin `publishDesign`, deci prin aceeasi ordine de
  scriere (continutul, apoi designul, apoi versiunea publicata) si aceeasi revalidare ca orice „Publică”.
*/

type RandVersiune = { business_id: string; design: Json; continut: Json; origine: string; publicat_de: string | null; created_at: string };

/**
 * Ce era in magazin inainte de o tema, scris INAINTE de aplicare: o cadere aici o opreste (`false`), fiindca fara
 * aceste versiuni „Pune la loc” n-ar avea ce readuce.
 */
async function pastreazaInainteDeTema(owned: OwnedStore, randuri: RandVersiune[]): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("storefront_design_versions").insert(randuri);
    if (error) throw new Error(error.message);
    await taieVersiunileVechi(admin, owned.businessId);
    return true;
  } catch (e) {
    logError({ action: "aplicaTema.istoric", businessId: owned.businessId, message: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/**
 * Pune (sau, cu `null`, scoate) o cheie a temelor din `page_content`, peste ce e acum acolo (dupa „Publică”).
 *
 * ⚠ Fara citire reusita, nu scrie nimic: cu `data` gol, `pc` ar fi pornit de la `{}`, iar scrierea ar fi inlocuit tot
 * `page_content` (textele, bannerele, setarile magazinului) cu o singura cheie (gasit la etapa 18).
 */
async function scrieCheiaTemei(businessId: string, cheie: string, valoare: unknown, actiune: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("store_settings").select("page_content").eq("business_id", businessId).single();
  if (error || !data) {
    logError({ action: actiune, businessId, message: error?.message ?? "store_settings lipseste" });
    return;
  }
  const pc = { ...((data.page_content ?? {}) as Record<string, unknown>) };
  if (valoare === null) delete pc[cheie];
  else pc[cheie] = valoare;
  const scris = await writeSettings(businessId, { page_content: pc as Json }, actiune);
  if ("error" in scris) logError({ action: actiune, businessId, message: scris.error });
}

/** Pune sau scoate semnul temei aplicate din `page_content`. */
async function scrieSemnulTemei(businessId: string, semn: TemaAplicata | null): Promise<void> {
  await scrieCheiaTemei(businessId, CHEIE_TEMA_APLICATA, semn, "tema.semn");
}

/**
 * Scoate din magazin datele demo ale altor teme decat `pastreaza` (`null` = ale tuturor), etapa 25.3: produsele (prin
 * stergerea in masa a panoului: retragerile, pachetele, sincronizarile, proiectia), categoriile create de importul lor
 * ramase goale, bannerele, randurile si urma din `page_content`. Ce e al lui ramane. Urma se scrie ultima, deci o
 * cadere la mijloc se poate relua.
 */
async function scoateDateleDemo(owned: OwnedStore, pastreaza: string | null): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const { data: produse, error: eProduse } = await supabase
    .from("products")
    .select("id, external_id")
    .eq("business_id", owned.businessId)
    .eq("source", SURSA_DEMO);
  if (eProduse) return { error: `produse demo: ${eProduse.message}` };
  const iduri = produseDemoDeScos(produse ?? [], pastreaza);
  if (iduri.length > 0) {
    const sterse = await bulkProductAction(owned.businessId, iduri, { kind: "delete" });
    if ("error" in sterse) return sterse;
  }

  const urma = urmaDateDemoDin(owned.ctx.pageContent);
  if (urma && urma.tema !== pastreaza) {
    const categorii = await stergeCategoriileDemo(owned.businessId, urma);
    if (categorii) return categorii;
  }

  // ⚠ Fara citire reusita nu se scrie nimic (o citire cazuta ar fi golit tot `page_content`, vezi `scrieCheiaTemei`).
  const { data, error } = await supabase.from("store_settings").select("page_content").eq("business_id", owned.businessId).single();
  if (error || !data) return { error: `setari: ${error?.message ?? "lipsa"}` };
  const pc = (data.page_content ?? {}) as Record<string, unknown>;
  const patch = pcFaraDemoAlAltorTeme(pc, pastreaza);
  if (Object.keys(patch).length === 0) return null;
  const nou: Record<string, unknown> = { ...pc };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete nou[k];
    else nou[k] = v;
  }
  const scris = await writeSettings(owned.businessId, { page_content: nou as Json }, "scoateDateleDemo");
  return "error" in scris ? scris : null;
}

/**
 * Aplica o tema direct in magazin, cu Istoric:
 * 1. ce era publicat intra in Istoric ca `tema`, iar ciorna nepublicata, intreaga, ca `ciorna`;
 * 2. cu „Importă și datele demo” (etapa 18), datele temei se ADAUGA in magazin (`importaDateleDemo`), marcate demo;
 *    limita de produse a planului se verifica inainte de orice scriere;
 * 3. tema se publica prin `publishDesign`: identitatea ei (fundalul si fonturile din „Stil”, culoarea) ca un continut
 *    de ciorna (17.1), designul temei peste designul publicat (sectiunile, blocurile si coloanele lui raman); cu datele
 *    demo, si textele lor, doar unde magazinul n-are ale lui; ciorna de acum se goleste, ca la orice „Publică”;
 * 4. semnul `tema_aplicata`, pentru pagina „Teme”.
 * Fara datele demo, produsele, textele, setarile si domeniul nu se ating.
 */
export async function aplicaTema(businessId: string, cheie: string, cuDateDemo?: boolean): Promise<ActionResult> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;
  const tema = temaDupaCheie(cheie);
  if (!tema) return { error: "Tema nu există." };
  // Doar un `true` adevarat: argumentul vine din browser.
  const cuDate = cuDateDemo === true;

  const supabase = await createClient();
  const { data: row, error: eCitit } = await supabase
    .from("store_settings")
    .select("storefront_design, storefront_design_draft")
    .eq("business_id", owned.businessId)
    .single();
  if (eCitit) {
    logError({ action: "aplicaTema.citire", businessId: owned.businessId, message: eCitit.message });
    return { error: "Nu am putut citi magazinul. Încearcă din nou." };
  }

  // 0. Limita planului, inaintea oricarei scrieri: refuzat aici, magazinul ramane exact cum era.
  if (cuDate) {
    const loc = await citesteLoculPentruDemo(supabase, owned.userId, owned.businessId, tema.cheie, tema.date);
    if ("error" in loc) {
      logError({ action: "aplicaTema.limita", businessId: owned.businessId, message: loc.error });
      return { error: "Nu am putut verifica limita de produse a planului, deci tema nu s-a aplicat. Încearcă din nou." };
    }
    if (!loc.incap) return { error: `${motivulLimitei(loc)} Aplică tema fără datele demo.` };
  }

  // 1. Ce era, INAINTE de orice scriere. Si starea de atunci (etapa 25.3): tema aplicata si datele demo, ca „Pune la loc”
  //    sa readuca magazinul intocmai, cu datele demo ale temei de atunci.
  const la = dateleVersiunilorDeDinainte(Date.now());
  const randuri: RandVersiune[] = [{
    business_id: owned.businessId, design: (row?.storefront_design ?? {}) as Json,
    continut: { ...instantaneuContinut(owned.ctx.pageContent, owned.magazin), stare: stareaMagazinului(owned.ctx.pageContent) } as unknown as Json,
    origine: "tema", publicat_de: owned.userId, created_at: la.tema,
  }];
  if (row?.storefront_design_draft) {
    // Intreaga, cu ce era publicat sub ea: readusa din Istoric, arata exact ca ciorna de atunci.
    const continutCiorna = continutDinCiorna(row.storefront_design_draft);
    randuri.push({
      business_id: owned.businessId,
      design: parseStoreDesign(row.storefront_design_draft, contextCuCiorna(owned.ctx, continutCiorna)) as unknown as Json,
      continut: instantaneuContinut(pcCuCiorna(owned.ctx.pageContent, continutCiorna), { ...owned.magazin, ...continutCiorna.magazin }) as unknown as Json,
      origine: "ciorna", publicat_de: owned.userId, created_at: la.ciorna,
    });
  }
  if (!(await pastreazaInainteDeTema(owned, randuri))) {
    return { error: "Nu am putut păstra designul de acum în Istoric, deci tema nu s-a aplicat. Încearcă din nou." };
  }

  // 1b. Etapa 25.3: cu datele demo, ale celorlalte teme pleaca INTAI, dupa Istoric (care le tine minte pentru „Pune la
  //     loc”). In magazin ramane o singura tema demo; inainte, 30 de teme incercate lasau 331 de produse demo.
  if (cuDate) {
    const scos = await scoateDateleDemo(owned, tema.cheie);
    if (scos) {
      logError({ action: "aplicaTema.scoateDemo", businessId: owned.businessId, message: scos.error });
      return { error: "Datele demo de dinainte nu s-au putut scoate, deci tema nu s-a aplicat. Încearcă din nou." };
    }
  }

  // 2. Datele demo: dupa Istoric (bannerele si randurile lor sunt chei ale editorului, deci „Pune la loc” le scoate) si
  //    inaintea temei, care le arata. Cu radacina catalogului magazinului, ca linkurile lor sa duca unde trebuie.
  const radacinaCatalog = radacinaCatalogTemei(owned.ctx.pageContent);
  let ctxMagazin = owned.ctx;
  if (cuDate) {
    try {
      await importaDateleDemo(createAdminClient(), owned.businessId, tema.cheie, tema.date, radacinaCatalog);
    } catch (e) {
      logError({ action: "aplicaTema.dateDemo", businessId: owned.businessId, message: e instanceof Error ? e.message : String(e) });
      return { error: "Datele demo nu s-au putut adăuga, deci tema nu s-a aplicat. Încearcă din nou." };
    }
    // Magazinul de dupa import: randurile si bannerele noi intra in designul temei.
    const dupaImport = await loadOwnedStore(owned.businessId);
    if ("error" in dupaImport) return dupaImport;
    ctxMagazin = dupaImport.ctx;
  }

  // 3. Tema, prin „Publică”. Peste designul publicat FARA textele puse de o tema (etapa 25.3): altfel tema noua le-ar fi
  //    pastrat drept ale lui („Alege camera” de la Electra ajungea pe prima pagina Jupiter).
  const continut = continutIdentitate(tema.identitate);
  const ctxTema = contextCuCiorna(ctxMagazin, continut);
  const baza = faraTexteleTemelor(parseStoreDesign(row?.storefront_design ?? {}, ctxTema), { siTexteleTemei: true }).design;
  const design = tema.design(ctxTema, cuDate ? tema.date : null, baza, { radacinaCatalog });
  const publicat = await publishDesign(owned.businessId, ciornaCuContinut(design, continut));
  if ("error" in publicat) {
    // Datele demo au intrat deja: omul trebuie sa stie, iar pagina „Teme” ii arata „Șterge datele demo” (urma exista).
    return cuDate ? { error: `${publicat.error} Datele demo au intrat în magazin; le ștergi de pe pagina „Teme”.` } : publicat;
  }

  // 4. Semnul, pentru pagina „Teme”.
  await scrieSemnulTemei(owned.businessId, { cheie: tema.cheie, la: new Date().toISOString() });
  revalidatePath("/dashboard/editor/teme");
  return { success: true };
}

/**
 * „Pune la loc designul de dinainte”: versiunea `tema` cea mai noua (ce era in magazin inainte de ultima tema), designul
 * si identitatea, publicata prin `publishDesign`. Ce s-a publicat dupa aplicare ramane in Istoric. Cu o ciorna
 * nepublicata, nu: `publishDesign` ar fi golit-o fara urma.
 *
 * Etapa 25.3 (11.11.2026): versiunile scrise de atunci tin si starea magazinului (tema aplicata, datele demo). Cand datele
 * demo de acum nu sunt ale temei de atunci, ele pleaca si se reimporta cele de atunci, iar semnul temei revine: magazinul
 * arata INTOCMAI ca inainte de tema. O versiune mai veche, fara stare, readuce ca pana atunci designul si continutul.
 * `nota` = datele demo de atunci n-au mai incaput in plan (designul revine fara ele).
 */
export async function puneLaLocDesignulDeDinainte(businessId: string): Promise<ActionResult | { success: true; nota: string }> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("store_settings")
    .select("storefront_design_draft")
    .eq("business_id", owned.businessId)
    .single();
  if (row?.storefront_design_draft) {
    return { error: "Ai modificări nepublicate în editor. Publică-le sau renunță la ele, apoi pune la loc designul." };
  }

  const { data: v, error } = await createAdminClient()
    .from("storefront_design_versions")
    .select("design, continut")
    .eq("business_id", owned.businessId)
    .eq("origine", "tema")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logError({ action: "puneLaLocDesignulDeDinainte", businessId: owned.businessId, message: error.message });
    return { error: "Nu am putut citi Istoricul. Încearcă din nou." };
  }
  if (!v) return { error: "Nu există în Istoric un design de dinainte de temă." };

  const stare = stareDinVersiune(v.continut);
  let ctx = owned.ctx;
  let continut: unknown = v.continut;
  let nota: string | null = null;
  if (stare) {
    const demoInainte = stare.demo?.tema || null;
    const urmaAcum = urmaDateDemoDin(owned.ctx.pageContent);
    const { data: produseDemo, error: eDemo } = await supabase
      .from("products")
      .select("id, external_id")
      .eq("business_id", owned.businessId)
      .eq("source", SURSA_DEMO);
    if (eDemo) {
      logError({ action: "puneLaLocDesignulDeDinainte.demo", businessId: owned.businessId, message: eDemo.message });
      return { error: "Nu am putut citi produsele demo. Încearcă din nou." };
    }
    const straine = produseDemoDeScos(produseDemo ?? [], demoInainte).length > 0;
    const deReadus = demoInainte !== null && urmaAcum?.tema !== demoInainte;
    if (straine || deReadus || (urmaAcum !== null && urmaAcum.tema !== demoInainte)) {
      const scos = await scoateDateleDemo(owned, demoInainte);
      if (scos) {
        logError({ action: "puneLaLocDesignulDeDinainte.scoateDemo", businessId: owned.businessId, message: scos.error });
        return { error: "Datele demo de acum nu s-au putut scoate, deci designul nu s-a pus la loc. Încearcă din nou." };
      }
      const temaInainte = deReadus && demoInainte ? temaDupaCheie(demoInainte) : null;
      if (temaInainte) {
        const loc = await citesteLoculPentruDemo(supabase, owned.userId, owned.businessId, temaInainte.cheie, temaInainte.date);
        if ("error" in loc || !loc.incap) {
          nota = `Datele demo ale temei ${temaInainte.nume} nu mai încap în planul tău, deci designul a revenit fără ele.`;
        } else {
          try {
            await importaDateleDemo(createAdminClient(), owned.businessId, temaInainte.cheie, temaInainte.date, radacinaCatalogTemei(owned.ctx.pageContent));
          } catch (e) {
            logError({ action: "puneLaLocDesignulDeDinainte.import", businessId: owned.businessId, message: e instanceof Error ? e.message : String(e) });
            return { error: "Datele demo de dinainte nu s-au putut readuce, deci designul nu s-a pus la loc. Încearcă din nou." };
          }
        }
      }
      // Magazinul de acum: randurile demo reimportate au produse noi, deci versiunea le ia pe acestea.
      const dupa = await loadOwnedStore(owned.businessId);
      if ("error" in dupa) return dupa;
      ctx = dupa.ctx;
      continut = continutCuRandurileDemoDeAcum(v.continut, dupa.ctx.pageContent);
    }
  }

  const ciorna = ciornaDinVersiune({ design: v.design, continut }, { pc: ctx.pageContent, magazin: owned.magazin }, ctx);
  const publicat = await publishDesign(owned.businessId, ciornaCuContinut(ciorna.design, ciorna.continut));
  if ("error" in publicat) return publicat;

  // Etapa 25.7: semnul temei de atunci, ca pagina „Teme” sa stie ce e in magazin; fara stare (versiune veche), niciunul.
  await scrieSemnulTemei(owned.businessId, stare?.tema ?? null);
  revalidatePath("/dashboard/editor/teme");
  if (owned.slug) revalidatePath(`/${owned.slug}`, "layout");
  return nota ? { success: true, nota } : { success: true };
}

/**
 * Pentru pagina „Teme”: are magazinul in Istoric un design de dinainte de tema, de pus la loc? O citire cazuta e o
 * eroare, nu „nu”: altfel butonul ar fi disparut tocmai cand omul are nevoie de el.
 */
export async function areDesignDeDinainteDeTema(
  businessId: string,
): Promise<{ exista: boolean; demoInainte?: string | null } | { error: string }> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;
  // Si starea versiunii (etapa 25.3), ca fereastra „Pune la loc” sa spuna ce date demo revin; `undefined` = versiune veche.
  const { data, error } = await createAdminClient()
    .from("storefront_design_versions")
    .select("continut")
    .eq("business_id", owned.businessId)
    .eq("origine", "tema")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logError({ action: "areDesignDeDinainteDeTema", businessId: owned.businessId, message: error.message });
    return { error: "Nu am putut citi Istoricul." };
  }
  if (!data) return { exista: false };
  const stare = stareDinVersiune(data.continut);
  return stare ? { exista: true, demoInainte: stare.demo?.tema || null } : { exista: true };
}

/**
 * Categoriile create de import ramase goale, sterse (pasul 3 din `stergeDateleDemo`). Doar dupa stergerea produselor
 * demo, ca produsele ramase sa fie ale lui.
 */
async function stergeCategoriileDemo(businessId: string, urma: UrmaDateDemo): Promise<{ error: string } | null> {
  // Id-uri adevarate, ca filtrul de mai jos sa nu poata fi rupt de un sir scris in `page_content`.
  const iduri = urma.categorii.filter(esteUuid);
  if (iduri.length === 0) return null;
  const supabase = await createClient();
  const lista = iduri.join(",");
  // Si copiii lor, ai oricui: un parinte cu un copil care ramane nu se sterge (`on delete cascade`).
  const { data: categorii, error } = await supabase
    .from("categories")
    .select("id, parent_id, name")
    .eq("business_id", businessId)
    .or(`id.in.(${lista}),parent_id.in.(${lista})`);
  if (error) return { error: error.message };
  /*
   * Un produs pe nume, intrebat aparte pentru fiecare categorie: o singura cerere `in` pe toate numele s-ar fi oprit la
   * 1000 de randuri, poate toate dintr-o categorie mare, iar celelalte ar fi parut goale si s-ar fi sters.
   */
  const nume = [...new Set((categorii ?? []).filter((c) => iduri.includes(c.id)).map((c) => c.name))];
  const cuProduse = new Set<string>();
  const raspunsuri = await Promise.all(nume.map((n) =>
    supabase.from("products").select("id").eq("business_id", businessId).eq("category", n).limit(1)));
  for (const [i, r] of raspunsuri.entries()) {
    if (r.error) return { error: r.error.message };
    if ((r.data ?? []).length > 0) cuProduse.add(nume[i]);
  }
  const deSters = categoriiDemoDeSters(urma, categorii ?? [], cuProduse);
  if (deSters.length === 0) return null;
  const { error: eSters } = await supabase.from("categories").delete().eq("business_id", businessId).in("id", deSters);
  return eSters ? { error: eSters.message } : null;
}

/**
 * „Șterge datele demo” (etapa 18.4), dupa urma importului (`page_content.date_demo`):
 * 1. bannerele si randurile adaugate si textele demo ramase neschimbate in design (`Tema.faraTexteleDemo`), prin
 *    `publishDesign`, deci si in Istoric; cu o ciorna nepublicata, nu, ca la „Pune la loc”;
 * 2. produsele cu sursa demo, prin stergerea in masa a panoului (retragerile, pachetele, sincronizarile, proiectia);
 * 3. categoriile create de import, ramase goale;
 * 4. urma.
 * Ce a adaugat sau a schimbat omul ramane. O cadere la mijloc lasa urma pe loc, deci stergerea se poate relua.
 */
export async function stergeDateleDemo(businessId: string): Promise<ActionResult> {
  const owned = await loadOwnedStore(businessId);
  if ("error" in owned) return owned;

  const supabase = await createClient();
  const { data: row, error: eCitit } = await supabase
    .from("store_settings")
    .select("storefront_design, storefront_design_draft")
    .eq("business_id", owned.businessId)
    .single();
  if (eCitit) {
    logError({ action: "stergeDateleDemo.citire", businessId: owned.businessId, message: eCitit.message });
    return { error: "Nu am putut citi magazinul. Încearcă din nou." };
  }
  if (row?.storefront_design_draft) {
    return { error: "Ai modificări nepublicate în editor. Publică-le sau renunță la ele, apoi șterge datele demo." };
  }

  const urma = urmaDateDemoDin(owned.ctx.pageContent);
  const { data: produse, error: eProduse } = await supabase
    .from("products")
    .select("id")
    .eq("business_id", owned.businessId)
    .eq("source", SURSA_DEMO);
  if (eProduse) {
    logError({ action: "stergeDateleDemo.produse", businessId: owned.businessId, message: eProduse.message });
    return { error: "Nu am putut citi produsele demo. Încearcă din nou." };
  }
  const iduri = (produse ?? []).map((p) => p.id);
  if (!urma && iduri.length === 0) return { error: "Nu sunt date demo de șters." };

  // 1. Bannerele, randurile si textele demo, prin „Publică”. Etapa 25.3: ale ORICAREI teme (dupa urma si dupa forma), nu
  //    doar ale temei din urma: un magazin care a adunat date de la mai multe teme ramanea cu textele celorlalte.
  {
    const chei = pcFaraDemoAlAltorTeme(owned.ctx.pageContent, null);
    delete chei[CHEIE_DATE_DEMO]; // urma iese la sfarsit (pasul 4), ca o stergere cazuta sa se poata relua
    const continut: ContinutCiorna = { pc: chei, magazin: {} };
    const design = parseStoreDesign(row?.storefront_design ?? {}, contextCuCiorna(owned.ctx, continut));
    const fara = faraTexteleTemelor(design, { siTexteleTemei: false });
    if (atingeCheiPc(continut) || fara.schimbat) {
      const publicat = await publishDesign(owned.businessId, ciornaCuContinut(fara.design, continut));
      if ("error" in publicat) return publicat;
    }
  }

  // 2. Produsele demo, ca la stergerea din „Produse”.
  if (iduri.length > 0) {
    const sterse = await bulkProductAction(owned.businessId, iduri, { kind: "delete" });
    if ("error" in sterse) return sterse;
  }

  // 3. Categoriile create de import, ramase goale.
  if (urma) {
    const categorii = await stergeCategoriileDemo(owned.businessId, urma);
    if (categorii) {
      logError({ action: "stergeDateleDemo.categorii", businessId: owned.businessId, message: categorii.error });
      return { error: "Produsele demo s-au șters, dar categoriile lor nu. Încearcă din nou." };
    }
  }

  // 4. Urma, la urma: pana aici, o stergere cazuta se poate relua de pe pagina „Teme”.
  await scrieCheiaTemei(owned.businessId, CHEIE_DATE_DEMO, null, "stergeDateleDemo.urma");
  revalidatePath("/dashboard/editor/teme");
  revalidatePath("/dashboard/products/categories");
  if (owned.slug) revalidatePath(`/${owned.slug}`, "layout");
  return { success: true };
}
