import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { needsRehost, rehostProductImages, rehostImageUrl } from "@/lib/import/image-rehost";

/**
 * Aduce pe CDN-ul nostru imaginile ramase pe serverele altora.
 *
 * DE CE EXISTA. Codul de rehostare exista si e livrat, dar `rehostChunk` e legat
 * de un import IN CURS: citeste `product_import_rows` filtrate pe `import_id`.
 * Pentru importurile deja incheiate nu ruleaza niciodata. Masurat: **29 de
 * magazine** au produse cu imagini externe, iar **20 dintre ele complet** — la
 * tonel-beauty toate cele 500 de produse, la rallsro toate cele 113.
 *
 * Trei consecinte, toate reale:
 *   - imaginile ocolesc redimensionarea din CDN, deci `srcSet` nu face nimic si
 *     telefonul descarca fisierul mare. Chiar defectul de 864 KiB gasit pe eSAFE.
 *   - magazinul depinde de un server pe care nu-l controleaza nimeni de la noi
 *   - daca furnizorul le muta sau le sterge, magazinul ramane fara poze
 *
 * MERGE PE LOTURI MICI. Fiecare imagine e o descarcare de la un server strain plus
 * o incarcare in R2, deci partea lenta nu e baza. La un lot mic pe minut, cele
 * ~800 de produse ramase se aseaza in cateva ore, fara sa incarce nimic.
 */

/** Cate produse pe rulare. Mic dinadins: vezi nota de sus. */
const PRODUSE_PE_RULARE = 8;

interface RandProdus {
  id: string;
  business_id: string;
  images: unknown;
  page_sections: unknown;
}

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  /*
   * Se cer mai multe randuri decat se prelucreaza, si se filtreaza in JS.
   *
   * `needsRehost` lucreaza pe lista de URL-uri, iar in SQL nu exista o conditie
   * care sa insemne exact „are cel putin o imagine care nu e a noastra" fara sa
   * duplice regula din `isOurR2Url`. O a doua definitie a ei ar diverge exact ca
   * celelalte pe care le-am unificat.
   */
  const { data, error } = await admin
    .from("products")
    .select("id, business_id, images, page_sections")
    .eq("is_active", true)
    .not("images", "is", null)
    .order("updated_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[rehost] citirea produselor a esuat:", error.message);
    return NextResponse.json({ error: "citire" }, { status: 500 });
  }

  const candidate = ((data ?? []) as unknown as RandProdus[]).filter((p) => {
    const g = Array.isArray(p.images) ? (p.images as unknown[]).map(String) : [];
    if (needsRehost(g)) return true;
    // Si combinatiile de varianta au imagini proprii, si se uita: un produs cu
    // galeria adusa dar combinatiile lasate afara arata bine pe card si prost in
    // selectorul de variante.
    const comb = combinatiiCuImagini(p.page_sections);
    return comb.some((u) => needsRehost([u]));
  }).slice(0, PRODUSE_PE_RULARE);

  let produse = 0;
  let imagini = 0;
  let eșecuri = 0;

  for (const p of candidate) {
    // Cache-ul e PER PRODUS si se imparte intre galerie si variante: acelasi URL
    // apare des in amandoua, iar fara el s-ar descarca si urca de doua ori.
    const cache = new Map<string, string>();
    const patch: Record<string, unknown> = {};

    const galerie = Array.isArray(p.images) ? (p.images as unknown[]).map(String) : [];
    if (needsRehost(galerie)) {
      const r = await rehostProductImages(galerie, p.business_id, "backfill", cache);
      imagini += r.done;
      eșecuri += r.failed;
      // Se scrie doar daca s-a schimbat ceva: `rehostProductImages` intoarce
      // URL-ul original la eșec, deliberat, ca o rehostare rupta sa nu piarda
      // imaginea.
      if (r.done > 0) patch.images = r.images;
    }

    // Variantele DUPA galerie, ca sa prinda cache-ul ei.
    const ps = p.page_sections as Record<string, unknown> | null;
    const noiCombinatii = await rehostCombinatii(ps, p.business_id, cache);
    if (noiCombinatii.schimbat) {
      patch.page_sections = noiCombinatii.pageSections;
      imagini += noiCombinatii.done;
      eșecuri += noiCombinatii.failed;
    }

    if (Object.keys(patch).length === 0) continue;
    const { error: eUpd } = await admin.from("products").update(patch).eq("id", p.id);
    if (eUpd) {
      console.error(`[rehost] ${p.id}: ${eUpd.message}`);
      continue;
    }
    produse++;
  }

  return NextResponse.json({ ok: true, produse, imagini, eșecuri });
}

/** URL-urile de imagine ale combinatiilor de varianta, fara sa presupuna forma. */
function combinatiiCuImagini(pageSections: unknown): string[] {
  const v = (pageSections as { variants?: { combinations?: unknown } } | null)?.variants;
  const comb = Array.isArray(v?.combinations) ? (v.combinations as unknown[]) : [];
  return comb
    .map((c) => (c as { image?: unknown } | null)?.image)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

/**
 * Rehosteaza imaginile combinatiilor, pastrand restul lui `page_sections` neatins.
 *
 * Se rescrie prin copie, nu prin mutatie: `page_sections` poarta si designul, si
 * pachetul, si specificatiile, iar o scriere partiala peste el ar sterge ce nu
 * cunoaste.
 */
async function rehostCombinatii(
  pageSections: Record<string, unknown> | null,
  businessId: string,
  cache: Map<string, string>,
): Promise<{ schimbat: boolean; pageSections: unknown; done: number; failed: number }> {
  const v = pageSections?.variants as { combinations?: unknown } | undefined;
  const comb = Array.isArray(v?.combinations) ? (v.combinations as Record<string, unknown>[]) : null;
  if (!pageSections || !comb) return { schimbat: false, pageSections, done: 0, failed: 0 };

  let done = 0;
  let failed = 0;
  let schimbat = false;
  const noi: Record<string, unknown>[] = [];

  for (const c of comb) {
    const u = typeof c?.image === "string" ? c.image : "";
    if (!u || !needsRehost([u])) { noi.push(c); continue; }
    const r = await rehostImageUrl(u, businessId, "backfill", cache);
    if (r.ok && r.url !== u) { noi.push({ ...c, image: r.url }); done++; schimbat = true; }
    else { noi.push(c); if (!r.ok) failed++; }
  }

  if (!schimbat) return { schimbat: false, pageSections, done, failed };
  return {
    schimbat: true,
    pageSections: { ...pageSections, variants: { ...(v as object), combinations: noi } },
    done,
    failed,
  };
}
