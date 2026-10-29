import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { esteSlugDeMagazinDemo } from "./gazde-demo";
import { CHEIE_DATE_DEMO } from "./import-demo";
import { SURSA_DEMO } from "./produse-demo";

/*
  ═══════════════════════════════════════════════════════════════════════════
  GOLIREA MAGAZINULUI DEMO AL UNEI TEME (etapa 20 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Scriptul de umplere (`scripts/teme/seamana-demo.ts`) scoate INTAI setul vechi, apoi importa setul nou. Fara golire,
  importul („Adaugă”, nu „Înlocuiește”) ar fi lasat produsele vechi langa cele noi, iar categoriile cu acelasi nume ar fi
  ramas cu pozele vechi: se refolosesc dupa nume.

  ⚠ Doar magazinul demo al unei teme (slug `tema-*`, rezervat: niciun comerciant nu-l poate lua) si doar cat nu are
  niciun produs care sa nu fie demo: acolo totul a venit din import. La comerciant, datele demo ies cu „Șterge datele
  demo”, care scoate doar ce a adaugat importul, nimic din ce e al lui.

  Nu atinge marketplace-uri: magazinul demo nu e legat de niciunul, iar produsele demo nu pleaca in canale (18.1).
  Proiectia catalogului se curata singura (declansatorul sterge randurile ei, importul de dupa goleste coada).
*/

/** Ce scrie importul in `page_content` (bannerele, linkurile lor, randurile de produse, urma): iese tot, la golire. */
export const CHEI_SCRISE_DE_IMPORT = ["hero_banners", "hero_banner_links", "product_sections", CHEIE_DATE_DEMO] as const;

/** `page_content` fara ce scrie importul; restul (semnul demo, identitatea, meniul, subsolul) ramane. */
export function continutFaraImport(pc: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...pc };
  for (const k of CHEI_SCRISE_DE_IMPORT) delete rest[k];
  return rest;
}

export interface RezultatGolire {
  produse: number;
  categorii: number;
}

/** Goleste magazinul demo al unei teme de datele ei. Arunca (fara sa stearga nimic) cand magazinul nu e de golit. */
export async function golesteMagazinulDemo(admin: SupabaseClient<Database>, businessId: string): Promise<RezultatGolire> {
  const { data: magazin, error: eMag } = await admin.from("businesses").select("slug").eq("id", businessId).single();
  if (eMag || !magazin) throw new Error(`magazin: ${eMag?.message ?? "lipsa"}`);
  if (!esteSlugDeMagazinDemo(magazin.slug)) throw new Error(`Refuz: „${magazin.slug}” nu e magazinul demo al unei teme.`);

  // Un singur produs care nu e demo inseamna ca magazinul nu mai e doar al temei: nu se goleste nimic.
  const { count: straine, error: eStr } = await admin
    .from("products").select("id", { count: "exact", head: true })
    .eq("business_id", businessId).or(`source.is.null,source.neq.${SURSA_DEMO}`);
  if (eStr || straine === null) throw new Error(`produse: ${eStr?.message ?? "numaratoare lipsa"}`);
  if (straine > 0) throw new Error(`Refuz: magazinul demo are ${straine} produse care nu sunt demo.`);

  // ⚠ Setarile se citesc INAINTE de orice stergere: fara ele nu se scrie nimic (o citire cazuta ar fi golit tot JSON-ul).
  const { data: setari, error: eSet } = await admin.from("store_settings").select("page_content").eq("business_id", businessId).single();
  if (eSet || !setari) throw new Error(`setari: ${eSet?.message ?? "lipsa"}`);
  const pc = (setari.page_content ?? {}) as Record<string, unknown>;

  const { count: produse, error: eProd } = await admin
    .from("products").delete({ count: "exact" }).eq("business_id", businessId).eq("source", SURSA_DEMO);
  if (eProd) throw new Error(`produse demo: ${eProd.message}`);
  // Toate categoriile: in magazinul demo le-a creat importul pe toate (subcategoriile pleaca odata cu parintii lor).
  const { count: categorii, error: eCat } = await admin
    .from("categories").delete({ count: "exact" }).eq("business_id", businessId);
  if (eCat) throw new Error(`categorii: ${eCat.message}`);
  const { error: eScris } = await admin.from("store_settings")
    .update({ page_content: continutFaraImport(pc) as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (eScris) throw new Error(`page_content: ${eScris.message}`);
  return { produse: produse ?? 0, categorii: categorii ?? 0 };
}
