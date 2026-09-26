import { slimPageSections } from "@/lib/storefront/catalog-slim";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { Block, BundlesBlock } from "./blocks.types";
import { flattenBlocks } from "./block-tree";
import { bundleComponentsSum, disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { getProductPriceRange, type PriceRange } from "@/lib/utils/product-price";
import { createAdminClient } from "@/lib/supabase/admin";

type DB = SupabaseClient<Database>;

/*
  ═══════════════════════════════════════════════════════════════════════════
  PACHETELE UNEI PAGINI                                            (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Un pachet e un produs cu `is_bundle`, cu componentele in `page_sections.bundle`
  (vezi `lib/bundles.ts`). Blocul arata ce contine, pretul si cat economisesti.

  ⚠ DOUA CITIRI PE PAGINA, oricate blocuri: pachetele tuturor blocurilor, apoi
  componentele tuturor pachetelor, intr-un singur `in`. Nu o citire pe pachet.

  ⚠ „Se poate cumpara” vine din `disponibilitatePachet`, aceeasi regula ca pe
  pagina produsului: o componenta stearsa sau DEZACTIVATA face pachetul
  indisponibil (componentele se citesc cu `is_active`, altfel una stinsa ar fi
  parut vandabila).
*/

export interface PachetPagina {
  id: string;
  name: string;
  slug: string | null;
  price: number;
  /** Suma componentelor (cat ar costa separat). */
  compare: number;
  economie: number;
  image: string | null;
  images: string[];
  page_sections: unknown;
  price_range: PriceRange;
  disponibil: boolean;
  /** Descrierea scurta din produs, fara etichete HTML. */
  descriere: string | null;
  /**
   * Cate pachete se mai pot face din stocul REAL: minimul, peste componentele
   * cu stoc urmarit, din `stoc / cantitate`. `null` = nicio componenta nu are
   * stoc urmarit, deci nu se poate spune nimic adevarat.
   */
  ramase: number | null;
  /** Comenzile REALE din ultimele 7 zile care il contin. `null` = necerut. */
  vanzari7: number | null;
  componente: { nume: string; cantitate: number; imagine: string | null; slug: string | null; id: string }[];
}

const MAX = 12;

export async function resolveAllBundlesBlocks(supabase: DB, businessId: string, blocks: Block[]): Promise<Record<string, PachetPagina[]>> {
  const map: Record<string, PachetPagina[]> = {};
  const blocuri = flattenBlocks(blocks).filter((b): b is BundlesBlock => b.type === "bundles");
  if (blocuri.length === 0) return map;

  /* Blocurile cu pachete alese de mana cer numai acele pachete (26.09.2026, auditul
     paginilor: se citeau pana la 200, cu tot `page_sections`, pentru a arata 6). */
  const doarAlese = blocuri.every((b) => b.mode === "selected" && (b.productIds?.length ?? 0) > 0);
  const aleseIds = [...new Set(blocuri.flatMap((b) => b.productIds ?? []))].slice(0, 200);
  let cerere = supabase
    .from("products")
    .select("id, name, slug, price, images, page_sections, sort_order")
    .eq("business_id", businessId).eq("is_active", true).eq("is_bundle", true);
  if (doarAlese) cerere = cerere.in("id", aleseIds);
  const { data: pachete } = await cerere.order("sort_order").limit(doarAlese ? 200 : 60);
  const lista = pachete ?? [];

  const idComponente = new Set<string>();
  for (const p of lista) for (const it of readBundleConfig(p.page_sections)?.items ?? []) idComponente.add(it.product_id);
  const { data: comps } = idComponente.size
    ? await supabase.from("products")
      .select("id, name, slug, price, images, track_inventory, stock_quantity")
      .eq("business_id", businessId).eq("is_active", true).in("id", [...idComponente].slice(0, 500))
    : { data: [] as { id: string; name: string; slug: string | null; price: number; images: unknown; track_inventory: boolean | null; stock_quantity: number | null }[] };
  const dupaId = new Map((comps ?? []).map((c) => [c.id, c]));

  const toate = new Map<string, PachetPagina>();
  for (const p of lista) {
    const cfg = readBundleConfig(p.page_sections);
    if (!cfg) continue;
    const ps = (p.page_sections ?? {}) as { short_description?: unknown };
    const descriere = typeof ps.short_description === "string"
      ? ps.short_description.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || null
      : null;
    const componente = cfg.items.map((it) => {
      const c = dupaId.get(it.product_id);
      return {
        id: it.product_id,
        nume: c?.name ?? "Produs indisponibil",
        cantitate: it.quantity,
        imagine: c && Array.isArray(c.images) && c.images.length ? String(c.images[0]) : null,
        slug: c?.slug ?? null,
        pret: Number(c?.price) || 0,
        stare: { quantity: it.quantity, vandabila: !!c, track_inventory: !!c?.track_inventory, stock_quantity: c?.stock_quantity ?? null },
      };
    });
    const pret = Number(p.price) || 0;
    const compare = bundleComponentsSum(componente.map((c) => ({ price: c.pret, quantity: c.cantitate })));
    const imagini = Array.isArray(p.images) ? (p.images as unknown[]).map(String).filter(Boolean) : [];
    toate.set(p.id, {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: pret,
      compare,
      economie: Math.max(0, Math.round((compare - pret) * 100) / 100),
      image: imagini[0] ?? componente.find((c) => c.imagine)?.imagine ?? null,
      images: imagini,
      page_sections: slimPageSections(p.page_sections, pret),
      price_range: getProductPriceRange(pret, p.page_sections ?? null),
      disponibil: disponibilitatePachet(componente.map((c) => c.stare)).inStock,
      descriere,
      ramase: (() => {
        const urmarite = componente.filter((c) => c.stare.vandabila && c.stare.track_inventory);
        if (urmarite.length === 0) return null;
        return Math.max(0, Math.min(...urmarite.map((c) => Math.floor((c.stare.stock_quantity ?? 0) / Math.max(1, c.cantitate)))));
      })(),
      vanzari7: null,
      componente: componente.map(({ id, nume, cantitate, imagine, slug }) => ({ id, nume, cantitate, imagine, slug })),
    });
  }

  for (const b of blocuri) {
    const limita = Math.min(Math.max(b.limit ?? 6, 1), MAX);
    const ales = b.mode === "selected" && b.productIds?.length
      ? b.productIds.map((id) => toate.get(id)).filter((x): x is PachetPagina => !!x)
      : [...toate.values()];
    map[b.id] = ales.slice(0, limita);
  }

  /*
   * ⚠ VANZARILE, NUMAI CAND UN BLOC LE CERE, si numai pentru pachetele afisate.
   * Numaratoare pe comenzile REALE din ultimele 7 zile, fara cele anulate sau
   * rambursate. Prin clientul de serviciu, fiindca vizitatorul nu poate citi
   * comenzi; din ele pleaca spre pagina DOAR un numar, niciun rand.
   * O cifra inventata („12 oameni se uita acum”) ar fi o practica inselatoare;
   * aici nu exista niciuna.
   */
  const deNumarat = new Set<string>();
  for (const b of blocuri) if (b.showRecentSales) for (const p of map[b.id] ?? []) deNumarat.add(p.id);
  if (deNumarat.size) {
    const admin = createAdminClient();
    const deLa = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const numere = new Map<string, number>();
    await Promise.all([...deNumarat].map(async (id) => {
      const { count } = await admin.from("orders").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).gte("created_at", deLa)
        .not("status", "in", "(cancelled,refunded)")
        .contains("items", JSON.stringify([{ product_id: id }]));
      numere.set(id, count ?? 0);
    }));
    for (const b of blocuri) {
      if (!b.showRecentSales) continue;
      map[b.id] = (map[b.id] ?? []).map((p) => ({ ...p, vanzari7: numere.get(p.id) ?? 0 }));
    }
  }
  return map;
}
