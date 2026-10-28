/*
  Umple magazinul demo al unei teme cu datele ei (etapa 16.1 din `docs/editor-magazin/PLAN.md`), prin ACELASI import pe
  care il foloseste „Importă datele demo”, deci cu proiectia catalogului si fara marketplace-uri.

  Ruleaza local, pe baza din `.env.development.local` (baza DEMO):

    node --env-file=.env.development.local --conditions=react-server --import ./scripts/tests/register.mjs \
      scripts/teme/seamana-demo.ts jupiter

  ⚠ Refuza productia. Magazinul demo din productie se face abia la push, cu acordul lui (REGISTRU).
*/
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { contextDesign } from "@/lib/editor-magazin/derivare";
import { importaDateleDemo } from "@/lib/teme/import-demo";
import { temaDupaCheie } from "@/lib/teme/teme";

const PRODUCTIA = "rtefdpioqmowkdiybwrr";

async function main() {
  const tema = temaDupaCheie(process.argv[2]);
  if (!tema) throw new Error(`Tema necunoscuta: ${process.argv[2] ?? "(lipsa)"}`);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cheie = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !cheie) throw new Error("Lipsesc NEXT_PUBLIC_SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY.");
  if (url.includes(PRODUCTIA)) throw new Error("Refuz: adresa e a productiei.");

  const admin = createClient<Database>(url, cheie, { auth: { persistSession: false } });
  const { data: magazin, error } = await admin
    .from("businesses").select("id, primary_color, features, cover_url, tagline").eq("slug", tema.slugDemo).single();
  if (error || !magazin) throw new Error(`Magazinul demo ${tema.slugDemo} lipseste: ${error?.message ?? ""}`);

  // Tema are pagina Magazin (`/magazin`): de acolo pornesc linkurile bannerelor.
  const rezultat = await importaDateleDemo(admin, magazin.id, tema.cheie, tema.date, "/magazin");

  // Designul temei, publicat direct: magazinul demo n-are ciorna si nici istoric de pastrat.
  const { data: setari, error: eSet } = await admin.from("store_settings").select("page_content").eq("business_id", magazin.id).single();
  if (eSet) throw new Error(`setari: ${eSet.message}`);
  // Reglajele demo-ului (`setariDemo`) peste ce a scris importul in `page_content` (bannerele, urma datelor demo).
  const pageContent = { ...((setari?.page_content ?? {}) as Record<string, unknown>), ...tema.setariDemo };
  const ctx = contextDesign({
    primaryColor: magazin.primary_color,
    pageContent,
    features: magazin.features,
    coverUrl: magazin.cover_url,
    tagline: magazin.tagline,
  });
  const design = tema.design(ctx, tema.date);
  const { error: eDesign } = await admin.from("store_settings")
    .update({ storefront_design: design as never, storefront_design_draft: null, page_content: pageContent as never, updated_at: new Date().toISOString() })
    .eq("business_id", magazin.id);
  if (eDesign) throw new Error(`design: ${eDesign.message}`);
  console.log(JSON.stringify({ tema: tema.cheie, magazin: tema.slugDemo, ...rezultat, design: "publicat" }));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
