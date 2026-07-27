import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { SectionDesignBrowser } from "@/components/store-editor/SectionDesignBrowser";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import type { DesignContext } from "@/lib/storefront/design/types";

export const metadata = { title: "Design sectiuni" };

interface RandCategorie {
  id: string;
  name: string;
  parent_id: string | null;
}

/**
 * Cate categorii de nivel intai vede efectiv vizitatorul.
 *
 * Aceeasi regula ca in magazin (MiniStoreRenderer): categoriile radacina al
 * caror subarbore are macar un produs, plus numele de categorie ramase pe
 * produse fara rand in tabel. Pragul din registry e degeaba daca cele doua parti
 * numara populatii diferite: comerciantul ar alege o varianta care la el nu se
 * randeaza. Parcurgerea e iterativa si cu multime de vizitate, ca un ciclu de
 * parinti sa nu blocheze pagina.
 */
function numaraCategoriiVizibile(categorii: RandCategorie[], numeDePeProduse: Set<string>): number {
  const copiiiLui = new Map<string, RandCategorie[]>();
  for (const c of categorii) {
    if (!c.parent_id) continue;
    const arr = copiiiLui.get(c.parent_id);
    if (arr) arr.push(c);
    else copiiiLui.set(c.parent_id, [c]);
  }

  const areProduse = (radacina: RandCategorie): boolean => {
    const vazute = new Set<string>();
    const stiva: RandCategorie[] = [radacina];
    while (stiva.length) {
      const nod = stiva.pop()!;
      if (vazute.has(nod.id)) continue;
      vazute.add(nod.id);
      if (numeDePeProduse.has(nod.name)) return true;
      for (const copil of copiiiLui.get(nod.id) ?? []) stiva.push(copil);
    }
    return false;
  };

  const radacini = categorii.filter((c) => !c.parent_id && areProduse(c)).length;
  const numeInTabel = new Set(categorii.map((c) => c.name));
  let orfane = 0;
  for (const nume of numeDePeProduse) if (!numeInTabel.has(nume)) orfane++;
  return radacini + orfane;
}

/**
 * Catalogul de design-uri pe sectiuni.
 *
 * Ruta e separata de editorul cu preview live pentru ca raspunde altei
 * intrebari: acolo se aseaza si se reordoneaza sectiunile, aici se alege cum
 * arata fiecare si i se regleaza setarile. Amandoua scriu in aceeasi ciorna.
 */
export default async function SectionDesignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, primary_color, features, cover_url, tagline, store_settings(page_content, storefront_design, storefront_design_draft)")
    .eq("user_id", user.id)
    .single();

  if (!business) redirect("/dashboard");

  const settings = Array.isArray(business.store_settings) ? business.store_settings[0] : business.store_settings;
  const ctx: DesignContext = {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: (settings?.page_content as Record<string, unknown>) ?? {},
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  };

  const publicat = parseStoreDesign(settings?.storefront_design, ctx);
  const design = settings?.storefront_design_draft
    ? parseStoreDesign(settings.storefront_design_draft, ctx)
    : publicat;

  // Unele design-uri au nevoie de un numar minim de categorii ca sa arate bine.
  // Se numara populatia pe care o vede magazinul, nu randurile din tabel: altfel
  // un magazin cu 7 categorii radacina din care doar 4 au produse trecea de prag
  // in catalog, iar in magazin bara laterala nu aparea deloc. Toggle-urile de
  // ascundere din Pagina magazin raman in afara socotelii: sunt implicit stinse
  // si ar cere adus tot randul de produs pentru o simpla numaratoare.
  const [randuriCategorii, randuriProduse] = await Promise.all([
    fetchAllRows("editor.sectiuni.categories", (from, to) =>
      supabase
        .from("categories")
        .select("id, name, parent_id")
        .eq("business_id", business.id)
        .order("id")
        .range(from, to)
    ),
    fetchAllRows("editor.sectiuni.product-categories", (from, to) =>
      supabase
        .from("products")
        .select("category")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("id")
        .range(from, to)
    ),
  ]);
  const numeDePeProduse = new Set<string>();
  for (const p of randuriProduse) if (p.category) numeDePeProduse.add(p.category);
  const numarCategorii = numaraCategoriiVizibile(randuriCategorii, numeDePeProduse);

  return (
    <SectionDesignBrowser
      businessId={business.id}
      slug={business.slug}
      designInitial={design}
      designPublicat={publicat}
      numarCategorii={numarCategorii}
    />
  );
}
