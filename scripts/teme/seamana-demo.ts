/*
  Umple magazinul demo al unei teme cu datele ei (etapa 16.1 din `docs/editor-magazin/PLAN.md`), prin ACELASI import pe
  care il foloseste „Importă datele demo”, deci cu proiectia catalogului si fara marketplace-uri.

  Ruleaza local, pe baza din `.env.development.local` (baza DEMO):

    node --env-file=.env.development.local --conditions=react-server --import ./scripts/tests/register.mjs \
      scripts/teme/seamana-demo.ts jupiter

  ⚠ Productia doar cu `--productie` la coada, LA PUSH, cu acordul lui (REGISTRU), dupa `scripts/teme/magazinul-demo.sql`
  (contul tehnic si magazinul). Fara semn, o rulare din greseala cu cheile productiei e refuzata.

  Scoate INTAI setul de dinainte (etapa 20, `golesteMagazinulDemo`: produsele demo, categoriile, bannerele, randurile),
  apoi il pune pe cel de acum. Deci se poate rula din nou oricand se schimba setul.

  Scrie si semnul magazinului demo (`magazin_demo`, din `setariDemo`): fara comenzi (etapa 19.2); si sigla lui (`siglaDemo`).
*/
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { contextDesign } from "@/lib/editor-magazin/derivare";
import { golesteMagazinulDemo } from "@/lib/teme/golire-demo";
import { importaDateleDemo } from "@/lib/teme/import-demo";
import { magazinCuIdentitatea, pageContentCuIdentitatea } from "@/lib/teme/aplicare";
import { temaDupaCheie } from "@/lib/teme/teme";

const PRODUCTIA = "rtefdpioqmowkdiybwrr";

async function main() {
  const tema = temaDupaCheie(process.argv[2]);
  if (!tema) throw new Error(`Tema necunoscuta: ${process.argv[2] ?? "(lipsa)"}`);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const cheie = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !cheie) throw new Error("Lipsesc NEXT_PUBLIC_SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY.");
  if (url.includes(PRODUCTIA) && !process.argv.includes("--productie")) {
    throw new Error("Refuz: adresa e a productiei. Acolo doar la push, cu acordul lui, si cu --productie.");
  }

  const admin = createClient<Database>(url, cheie, { auth: { persistSession: false } });
  const { data: magazin, error } = await admin
    .from("businesses").select("id, features, cover_url, tagline").eq("slug", tema.slugDemo).single();
  if (error || !magazin) throw new Error(`Magazinul demo ${tema.slugDemo} lipseste: ${error?.message ?? ""}`);

  // Setul de dinainte iese intreg; altfel importul (care doar adauga) l-ar fi lasat langa cel nou.
  const golit = await golesteMagazinulDemo(admin, magazin.id);

  // Tema are pagina Magazin (`/magazin`): de acolo pornesc linkurile bannerelor.
  const rezultat = await importaDateleDemo(admin, magazin.id, tema.cheie, tema.date, "/magazin");

  // Designul temei, publicat direct: magazinul demo n-are ciorna si nici istoric de pastrat.
  const { data: setari, error: eSet } = await admin.from("store_settings").select("page_content").eq("business_id", magazin.id).single();
  if (eSet) throw new Error(`setari: ${eSet.message}`);
  // Reglajele demo-ului (`setariDemo`) peste ce a scris importul in `page_content` (bannerele, urma datelor demo), apoi
  // identitatea temei (fundalul, fonturile; culoarea in `businesses`), ca la aplicare: acolo o regleaza fila „Stil”.
  const pageContent = pageContentCuIdentitatea({ ...((setari?.page_content ?? {}) as Record<string, unknown>), ...tema.setariDemo }, tema.identitate);
  const { error: eCuloare } = await admin.from("businesses")
    .update({ ...magazinCuIdentitatea(tema.identitate), logo_url: tema.siglaDemo }).eq("id", magazin.id);
  if (eCuloare) throw new Error(`culoare: ${eCuloare.message}`);
  const ctx = contextDesign({
    primaryColor: tema.identitate.culoare,
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
  console.log(JSON.stringify({ tema: tema.cheie, magazin: tema.slugDemo, scoase: golit, ...rezultat, design: "publicat" }));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
