import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { BlockRenderer } from "@/components/pages/BlockRenderer";
import { resolveAllProductsBlocks } from "@/lib/pages/resolve-products";
import { resolveAllBundlesBlocks } from "@/lib/pages/resolve-bundles";
import { integrariPentruPagini } from "@/lib/pages/integrari-pagini";
import { flattenBlocks } from "@/lib/pages/block-tree";
import type { Block } from "@/lib/pages/blocks.types";
import type { FormField, PublicForm } from "@/lib/pages/forms.types";

/**
 * Blocurile unei pagini proprii, cu datele lor citite pe server.
 *
 * Folosita de ruta paginilor si de pagina principala, cand comerciantul a ales
 * o pagina proprie in locul ei (vezi `lib/pages/pagina-acasa.ts`). Acolo pagina
 * se randeaza pe bucati, intre sectiunile magazinului, deci fiecare bucata isi
 * cere doar datele blocurilor ei.
 */
export async function BlocuriPagina({
  supabase, businessId, blocks, hideNoImage, hideOutOfStock,
  color, basePath, storeSlug, social, pageId, h1Id,
}: {
  supabase: SupabaseClient<Database>;
  businessId: string;
  blocks: Block[];
  hideNoImage: boolean;
  hideOutOfStock: boolean;
  color: string;
  basePath: string;
  storeSlug: string;
  social: Record<string, string>;
  pageId: string;
  h1Id: string | null;
}) {
  // Resolve each products-block server-side with a hard cap (scales to huge catalogs).
  // Respecta setarea de vizibilitate a catalogului (ascunde fara imagini / fara stoc).
  /*
    Pachetele si integrarile se citesc NUMAI cand pagina are blocurile lor:
    o pagina „Despre noi” nu plateste doua interogari in plus.
  */
  const toate = flattenBlocks(blocks);
  const tipuri = new Set(toate.map((b) => b.type));
  /*
   * ⚠ Formularele se citesc NUMAI cand pagina are un bloc de contact legat de
   * unul, si numai acelea. Pana acum se aduceau toate formularele magazinului,
   * cu campurile lor, la FIECARE vizita a oricarei pagini, chiar fara bloc de
   * contact (masurat: 4 blocuri de contact in 34 de pagini).
   */
  const formulareFolosite = [...new Set(toate.flatMap((b) => (b.type === "contact" && b.formId ? [b.formId] : [])))];
  const [productsByBlock, bundlesByBlock, integrari, { data: formsRaw }] = await Promise.all([
    resolveAllProductsBlocks(supabase, businessId, blocks, { hideNoImage, hideOutOfStock }),
    tipuri.has("bundles") ? resolveAllBundlesBlocks(supabase, businessId, blocks) : Promise.resolve(undefined),
    tipuri.has("payments") || tipuri.has("couriers") ? integrariPentruPagini(businessId) : Promise.resolve(null),
    // Formularele prin service role: nu se citesc anonim.
    formulareFolosite.length > 0
      ? createAdminClient().from("forms").select("id, name, fields, submit_label, success_message").eq("business_id", businessId).in("id", formulareFolosite)
      : Promise.resolve({ data: [] as { id: string; name: string; fields: unknown; submit_label: string; success_message: string }[] }),
  ]);

  const forms: PublicForm[] = (formsRaw ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    fields: Array.isArray(f.fields) ? (f.fields as unknown as FormField[]) : [],
    submit_label: f.submit_label,
    success_message: f.success_message,
  }));

  return (
    <BlockRenderer
      blocks={blocks}
      ctx={{
        color, basePath, storeSlug, social, products: [], productsByBlock, forms, businessId, pageId, h1Id,
        bundlesByBlock, plati: integrari?.plati, curieri: integrari?.curieri,
      }}
    />
  );
}
