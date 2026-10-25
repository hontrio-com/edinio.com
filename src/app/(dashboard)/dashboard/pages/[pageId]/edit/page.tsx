import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { PageBuilder } from "@/components/pages/PageBuilder";
import { dateEditorPagina } from "@/lib/pages/date-editor-pagina";

// Titlul filei (sablonul radacinii adauga „ | Edinio”); pana acum fila arata textul generic al site-ului.
export const metadata = { title: "Editor de pagină" };

export default async function EditCustomPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  // Datele le citeste `dateEditorPagina`, aceeasi functie ca editorul unic (etapa 5).
  const d = await dateEditorPagina(supabase, pageId, user.id);
  if (!d) notFound(); // pagina lipsa sau a altcuiva

  return (
    <PageBuilder
      pageId={d.pagina.id}
      fundal={d.fundal}
      initialTitle={d.pagina.titlu}
      initialSlug={d.pagina.slug}
      initialPublished={d.pagina.publicata}
      initialBlocks={d.pagina.blocks}
      initialCss={d.pagina.css}
      initialSeo={d.pagina.seo}
      initialVersiune={d.pagina.versiune}
      legaturi={d.legaturi}
      business={d.business}
      products={d.products}
      categories={d.categorii}
      forms={d.forms}
      isAdmin={d.isAdmin}
      pachete={d.pachete}
      integrari={d.integrari}
      estePaginaAcasa={d.estePaginaAcasa}
      randuriProduse={d.randuriProduse}
    />
  );
}
