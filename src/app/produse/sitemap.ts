import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_ORIGIN } from "@/lib/seo";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import type { Json } from "@/types/database.types";

/**
 * Sitemap-urile de PRODUSE ale platformei, taiate in felii.
 *
 * ═══ CE ERA ═══
 *
 * `sitemap.ts` citea, cu `fetchAllRows`, TOATE produsele active ale TUTUROR
 * magazinelor publicate — si abia la final tinea primele 50.000. La cinci milioane
 * de produse asta inseamna cinci milioane de randuri aduse in memoria functiei ca
 * sa se pastreze un procent din ele. Nu e doar lent: e o cerere publica, deci
 * oricine o poate declansa.
 *
 * ═══ CE FACE ACUM ═══
 *
 * `generateSitemaps` intoarce cate o felie la fiecare `PE_FELIE` produse, iar
 * fiecare felie citeste EXACT fereastra ei, cu `range`. Nicio cerere nu mai atinge
 * mai mult decat publica.
 *
 * Adresele ies la `/produse/sitemap/0.xml`, `/produse/sitemap/1.xml`, … si sunt
 * anuntate din `robots.txt`. Google accepta pana la 50.000 de adrese pe fisier;
 * 45.000 lasa loc de crestere intre doua reconstructii.
 */

/** Sub plafonul Google de 50.000, cu marja. */
const PE_FELIE = 45_000;
/**
 * Produsele care intra in sitemap-ul PLATFORMEI.
 *
 * `custom_domain is null` intra in interogare, nu intr-un filtru de dupa:
 * magazinele cu domeniu propriu isi au sitemap-ul lor, pe domeniul lor, deci
 * randurile lor n-au ce cauta nici macar citite aici.
 */
function interogare(coloane: string, optiuni?: { count: "exact"; head: true }) {
  return createAdminClient()
    .from("products")
    .select(coloane, optiuni)
    .eq("is_active", true)
    .eq("businesses.is_published", true)
    .is("businesses.custom_domain", null);
}

const COLOANE = "slug, updated_at, businesses!inner(slug, is_published, custom_domain)";

/*
 * Ruta e DINAMICA: se randeaza la cerere, nu la build.
 *
 * Fara asta, Next incearca sa colecteze feliile in timpul build-ului, unde
 * `SUPABASE_SERVICE_ROLE_KEY` nu exista — si build-ul PICA. Un sitemap trebuie
 * oricum sa spuna ce e in baza acum, nu ce era la ultimul deploy.
 */
export const dynamic = "force-dynamic";

/**
 * Cate felii exista. NU se intreaba baza.
 *
 * `generateSitemaps` se evalueaza si la build, unde nu exista nici chei, nici
 * retea catre baza — o interogare aici rupe build-ul. Si n-ar castiga nimic: o
 * felie fara produse intoarce un sitemap valid si gol, pe care crawlerul il
 * citeste si il uita.
 *
 * `FELII` acopera 180.000 de produse, de douazeci si sapte de ori catalogul de
 * azi al platformei. Numarul e ACELASI cu cel anuntat in `robots.ts`; crescute
 * separat, robots-ul ar fi anuntat felii care nu se randeaza, sau invers.
 */
export const FELII = 4;

export async function generateSitemaps(): Promise<{ id: number }[]> {
  return Array.from({ length: FELII }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const felie = Number(id) || 0;
  const de_la = felie * PE_FELIE;

  const { data } = await interogare(COLOANE)
    // Ordine STABILA, altfel doua felii pot arata acelasi produs si sari altul:
    // `range` fara `order` nu garanteaza nimic intre doua cereri.
    .order("id")
    .range(de_la, de_la + PE_FELIE - 1);

  const randuri = (data ?? []) as unknown as {
    slug: string | null;
    updated_at: string | null;
    businesses: { slug: string; store_settings?: unknown } | null;
  }[];

  /*
   * Magazinele „un singur produs" isi reprezinta produsul chiar prin pagina
   * principala: `/product/*` face 301 catre ea, deci adresele alea n-au ce cauta
   * in sitemap. Se citesc separat, o data pe felie — sunt cateva zeci de
   * magazine, nu milioane de randuri.
   */
  const { data: mode } = await createAdminClient()
    .from("businesses")
    .select("slug, store_settings(page_content)")
    .eq("is_published", true)
    .is("custom_domain", null);
  const unSingurProdus = new Set(
    ((mode ?? []) as unknown as { slug: string; store_settings: { page_content: Json } | { page_content: Json }[] | null }[])
      .filter((b) => {
        const s = Array.isArray(b.store_settings) ? b.store_settings[0] : b.store_settings;
        return parseStoreMode(s?.page_content ?? null).mode === "one_product";
      })
      .map((b) => b.slug),
  );

  return randuri
    .filter((p) => p.slug && p.businesses && !unSingurProdus.has(p.businesses.slug))
    .map((p) => ({
      url: `${PLATFORM_ORIGIN}/${p.businesses!.slug}/product/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
}
