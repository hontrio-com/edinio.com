import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { areDesignDeDinainteDeTema } from "@/lib/actions/store-design.actions";
import { temaAplicataDin } from "@/lib/teme/aplicare";
import { urmaDateDemoDin } from "@/lib/teme/import-demo";
import { citesteContextulPentruDemo, loculDinContext, motivulLimitei } from "@/lib/teme/limita-demo";
import { SURSA_DEMO } from "@/lib/teme/produse-demo";
import { adresaDemo, TEME } from "@/lib/teme/teme";
import { adresaCapturii, CAPTURI_TEME } from "@/lib/teme/capturi-teme";
import { TemeClient } from "@/components/teme/TemeClient";

export const metadata = { title: "Teme" };

/**
 * Pagina „Teme” (etapa 17 din `docs/editor-magazin/PLAN.md`, raspunsul lui: „Pagină nouă „Teme””): temele, cu demo-ul
 * lor, „Aplică tema” direct in magazin (din etapa 18, si cu datele demo) si „Pune la loc designul de dinainte”;
 * cat sunt date demo in magazin, „Șterge datele demo”.
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

  // Etapa 18: locul din planul lui pentru datele demo ale fiecarei teme, si ce date demo sunt acum in magazin.
  // O singura citire pentru toate temele (30 din lotul 7): planul si produsele nu depind de tema.
  const [context, { count: produseDemo }, { count: produseProprii }] = await Promise.all([
    citesteContextulPentruDemo(supabase, user.id, magazin.id),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", magazin.id).eq("source", SURSA_DEMO),
    // Etapa 25.5: produsele LUI (sursa goala sau alta decat demo; 1.009 au sursa NULL in productie, deci `or`, nu `neq`).
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", magazin.id)
      .or(`source.is.null,source.neq.${SURSA_DEMO}`),
  ]);
  const urma = urmaDateDemoDin(setari?.page_content);
  // Etapa 19: „Vezi demo” pe subdomeniul temei, dupa gazda pe care s-a deschis panoul (local, `jupiter.localhost`).
  const gazda = (await headers()).get("host");

  return (
    <TemeClient
      businessId={magazin.id}
      teme={TEME.map((t) => {
        const loc = "error" in context ? context : loculDinContext(context, t.cheie, t.date);
        return {
          cheie: t.cheie, nume: t.nume, descriere: t.descriere,
          adresaDemo: adresaDemo(t, gazda),
          // Captura primei pagini (08.11.2026), in locul demo-ului viu: `scripts/teme/capturi-teme.mjs`.
          captura: CAPTURI_TEME[t.cheie] ? { adresa: adresaCapturii(t.cheie), ...CAPTURI_TEME[t.cheie] } : null,
          demo: {
            produse: t.date.produse.length, bannere: t.date.bannere.length, randuri: t.date.randuri.length,
            // Citirea cazuta lasa bifa la vedere: actiunea reface verificarea si spune ea daca nu incap.
            limita: "error" in loc ? null : loc.limita,
            motivOprit: "error" in loc || loc.incap ? null : motivulLimitei(loc),
          },
        };
      })}
      aplicata={aplicata}
      aplicataLa={aplicataLa}
      // Citirea cazuta lasa butonul la vedere: actiunea spune ea daca n-are ce pune la loc.
      poatePuneLaLoc={inainte !== null && ("error" in inainte || inainte.exista)}
      laLocDemoInainte={inainte && !("error" in inainte) ? inainte.demoInainte : undefined}
      // 14.11.2026: de dinaintea carei teme revine designul (peste temele doar incercate), ca fereastra sa o numeasca.
      laLocTemaDupa={inainte && !("error" in inainte) ? inainte.temaDupa ?? null : null}
      dateDemo={urma || (produseDemo ?? 0) > 0 ? { produse: produseDemo ?? 0, tema: urma?.tema || null } : null}
      // O citire cazuta conteaza ca „are produse”: bifa porneste oprita, deci nu pune produse demo intr-un magazin care vinde.
      areProduseProprii={produseProprii === null || produseProprii > 0}
      areCiorna={!!setari?.storefront_design_draft}
      public={magazin.is_published === true}
    />
  );
}
