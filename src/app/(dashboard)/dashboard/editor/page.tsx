import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { MarkEditorVisited } from "@/components/dashboard/MarkEditorVisited";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import { permalinkuriDin } from "@/lib/storefront/permalinkuri";
import { citestePaginaAcasa } from "@/lib/pages/pagina-acasa";
import { contextDesign } from "@/lib/editor-magazin/derivare";
import { iesireaEditorului, paginaCeruta as paginaDinAdresa, type PaginaProprieEditor } from "@/lib/editor-magazin/pagini";
import { EditorMagazin } from "@/components/editor-magazin/EditorMagazin";
import { ScheletEditor } from "@/components/editor-magazin/ScheletEditor";

export const metadata = { title: "Editează magazinul" };

/**
 * Editorul unic al magazinului (etapa 2, 25.10.2026).
 *
 * Un singur ecran in locul a trei: „Design magazin" (panourile de continut),
 * „Ordinea sectiunilor" si „Design sectiuni" (ciorna de design). Rutele lor
 * vechi redirectioneaza aici. Vezi `docs/editor-magazin/PLAN.md`.
 */
interface Props {
  searchParams: Promise<{ pagina?: string; sectiune?: string; din?: string }>;
}

export default async function EditorPage({ searchParams }: Props) {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  return (
    <>
      <MarkEditorVisited />
      <Suspense fallback={<ScheletEditor />}>
        <ContinutEditor
          userId={user.id}
          // Validata in `ContinutEditor`, fata de paginile magazinului (o pagina proprie straina nu se deschide).
          paginaCeruta={typeof sp.pagina === "string" ? sp.pagina : null}
          sectiuneCeruta={typeof sp.sectiune === "string" && sp.sectiune.length <= 64 ? sp.sectiune : null}
          iesire={iesireaEditorului(sp.din)}
        />
      </Suspense>
    </>
  );
}

async function ContinutEditor({ userId, paginaCeruta, sectiuneCeruta, iesire }: {
  userId: string;
  paginaCeruta: string | null;
  sectiuneCeruta: string | null;
  iesire: string;
}) {
  const supabase = await createClient();

  /*
   * Coloane numite, nu `*`: tot ce se citeste aici pleaca intr-o componenta de
   * client, deci in HTML. `store_settings` aduce doar cele trei coloane de care
   * are nevoie editorul; restul (inclusiv parola SMTP) ramane pe server.
   * Acelasi magazin ca editorul vechi: cel mai nou al contului.
   */
  const { data: rand } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, is_published, logo_url, cover_url, primary_color, tagline, features, gallery, store_name, business_name, store_settings(page_content, storefront_design, storefront_design_draft)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!rand) redirect("/dashboard");

  const { store_settings: brut, ...magazin } = rand;
  const setari = Array.isArray(brut) ? brut[0] ?? null : brut ?? null;
  const pageContent = (setari?.page_content as Record<string, unknown> | null) ?? {};

  const [{ data: profil }, categorii, { data: produs }, paginaAcasa, { data: paginiRanduri }] = await Promise.all([
    supabase.from("users_profile").select("plan").eq("id", userId).single(),
    // Peste plafonul de 1000 de randuri al PostgREST: taxonomii importate mari.
    fetchAllRows("dashboard.editor.categories", (from, to) =>
      supabase.from("categories").select("id, name, parent_id, sort_order").eq("business_id", magazin.id)
        .order("sort_order").order("id").range(from, to)
    ),
    // Un produs activ oarecare, pentru previzualizarea paginii de produs.
    supabase.from("products").select("slug").eq("business_id", magazin.id)
      .eq("is_active", true).not("slug", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // O pagina din „Pagini” aleasa ca pagina principala: Acasa trimite la ea.
    (async () => {
      const id = citestePaginaAcasa(pageContent);
      if (!id) return null;
      const { data } = await supabase.from("custom_pages").select("id, title, is_published")
        .eq("id", id).eq("business_id", magazin.id).maybeSingle();
      return data ? { id: data.id, titlu: data.title, publicata: data.is_published } : null;
    })(),
    // Paginile proprii, pentru „Editezi” (etapa 5), in ordinea din „Pagini”.
    supabase.from("custom_pages").select("id, title, slug, is_published")
      .eq("business_id", magazin.id).order("sort_order").order("created_at").limit(500),
  ]);
  const paginiProprii: PaginaProprieEditor[] = (paginiRanduri ?? []).map((p) => ({ id: p.id, titlu: p.title, slug: p.slug, publicata: p.is_published }));

  const ctx = contextDesign({
    primaryColor: magazin.primary_color,
    pageContent,
    features: magazin.features,
    coverUrl: magazin.cover_url,
    tagline: magazin.tagline,
  });
  /*
   * Ciorna, daca exista; altfel designul publicat: comerciantul reia de unde a
   * ramas. Ciorna se trimite SI ca ea insasi: salvarea o cere ca „baza”, iar
   * diferenta dintre „coloana goala” si „coloana cu designul publicat” decide
   * daca prima salvare trece. Vezi `draft-guard.ts`.
   */
  const publicat = parseStoreDesign(setari?.storefront_design, ctx);
  const ciorna = setari?.storefront_design_draft ? parseStoreDesign(setari.storefront_design_draft, ctx) : null;
  const permalinkuri = permalinkuriDin(pageContent);

  return (
    <EditorMagazin
      magazin={{
        id: magazin.id,
        slug: magazin.slug,
        nume: magazin.store_name || magazin.business_name,
        customDomain: magazin.custom_domain,
        isPublished: magazin.is_published,
        logoUrl: magazin.logo_url,
        coverUrl: magazin.cover_url,
        primaryColor: magazin.primary_color,
        tagline: magazin.tagline,
        features: magazin.features,
        gallery: magazin.gallery,
      }}
      pageContent={pageContent}
      designInitial={ciorna ?? publicat}
      designPublicat={publicat}
      cioarnaInitiala={ciorna}
      categorii={categorii}
      planGratuit={profil?.plan === "free" || profil?.plan === "trial" || !profil?.plan}
      pagini={{
        slug: magazin.slug,
        produsSlug: produs?.slug ?? null,
        prefixProdus: permalinkuri.produs,
        prefixMagazin: permalinkuri.magazin,
        unSingurProdus: parseStoreMode(pageContent as never).mode === "one_product",
        paginiProprii,
      }}
      paginaAcasa={paginaAcasa}
      paginaInitiala={paginaDinAdresa(paginaCeruta, { paginiProprii })}
      sectiuneInitiala={sectiuneCeruta}
      iesire={iesire}
    />
  );
}
