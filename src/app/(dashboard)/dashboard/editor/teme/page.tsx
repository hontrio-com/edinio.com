import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { areDesignDeDinainteDeTema } from "@/lib/actions/store-design.actions";
import { temaAplicataDin } from "@/lib/teme/aplicare";
import { adresaDemo, TEME } from "@/lib/teme/teme";
import { TemeClient } from "@/components/teme/TemeClient";

export const metadata = { title: "Teme" };

/**
 * Pagina „Teme” (etapa 17 din `docs/editor-magazin/PLAN.md`, raspunsul lui: „Pagină nouă „Teme””): temele, cu demo-ul
 * lor, „Aplică tema” direct in magazin si „Pune la loc designul de dinainte”.
 */
export default async function TemePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: magazin } = await supabase
    .from("businesses")
    .select("id, is_published, store_settings(page_content, storefront_design_draft)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!magazin) redirect("/dashboard");

  const setari = Array.isArray(magazin.store_settings) ? magazin.store_settings[0] : magazin.store_settings;
  const aplicata = temaAplicataDin(setari?.page_content);
  // Doar cat e o tema aplicata (vazut la proba 17.6: dupa „Pune la loc”, caseta ramanea, desi n-avea ce face).
  const inainte = aplicata ? await areDesignDeDinainteDeTema(magazin.id) : null;
  // Pe server, cu fusul Romaniei dat anume: serverul ruleaza pe UTC, iar data nu trebuie sa sara o zi noaptea.
  const aplicataLa = aplicata
    ? new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" }).format(new Date(aplicata.la))
    : null;

  return (
    <TemeClient
      businessId={magazin.id}
      teme={TEME.map((t) => ({ cheie: t.cheie, nume: t.nume, descriere: t.descriere, culoare: t.identitate.culoare, adresaDemo: adresaDemo(t) }))}
      aplicata={aplicata}
      aplicataLa={aplicataLa}
      // Citirea cazuta lasa butonul la vedere: actiunea spune ea daca n-are ce pune la loc.
      poatePuneLaLoc={inainte !== null && ("error" in inainte || inainte.exista)}
      areCiorna={!!setari?.storefront_design_draft}
      public={magazin.is_published === true}
    />
  );
}
