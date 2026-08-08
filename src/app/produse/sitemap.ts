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
function interogare(coloane: string) {
  return createAdminClient()
    .from("products")
    .select(coloane)
    .eq("is_active", true)
    .eq("businesses.is_published", true);
}

/*
 * Relatia se numeste EXPLICIT prin cheia straina, nu se lasa dedusa.
 *
 * `businesses!inner(...)` intorcea eroarea „more than one relationship was found
 * for 'products' and 'businesses'", si sitemap-ul iesea gol cu raspuns 200.
 * Cauza: `catalog_produs` si `catalog_index_cuvant` au fiecare chei straine catre
 * AMANDOUA tabelele, deci PostgREST vede si drumuri indirecte
 * (products → catalog_produs → businesses) pe langa cel direct, si refuza sa
 * aleaga.
 *
 * Adica embed-ul asta e rupt de cand exista modelul de citire al catalogului
 * (migratia din 09.08) — nu de azi. N-a semnalat nimeni fiindca eroarea era
 * inghitita intr-un `const { data } = await ...`.
 */
const COLOANE = "slug, updated_at, businesses!products_business_id_fkey!inner(slug, is_published, custom_domain)";

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
 * felie fara produse intoarce un sitemap valid si gol.
 *
 * Numarul e ACELASI cu cel anuntat in `robots.ts`, importat de acolo: anuntate
 * mai putine decat se randeaza, produsele din ultima felie n-ar fi gasite.
 */
export const FELII = 4;

export async function generateSitemaps(): Promise<{ id: number }[]> {
  return Array.from({ length: FELII }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const felie = Number(id) || 0;
  const de_la = felie * PE_FELIE;

  /*
   * FEREASTRA SE CITESTE IN PASI DE 1000, nu dintr-o data.
   *
   * `range(0, 44999)` pare ca cere 45.000 de randuri, dar PostgREST taie SILENTIOS
   * la `db-max-rows` = 1000 — chiar capcana pentru care exista `fetchAllRows`, si
   * in care am calcat scriind fisierul asta. Aici nu se poate folosi `fetchAllRows`
   * ca atare: acela citeste pana la capat, iar noi vrem exact fereastra feliei.
   */
  const PAS = 1000;
  const randuri: {
    slug: string | null;
    updated_at: string | null;
    businesses: { slug: string; custom_domain: string | null } | null;
  }[] = [];

  for (let pornire = de_la; pornire < de_la + PE_FELIE; pornire += PAS) {
    const { data, error } = await interogare(COLOANE)
      // Ordine STABILA: `range` fara `order` nu garanteaza nimic intre doua cereri,
      // deci doua felii ar putea arata acelasi produs si sari altul.
      .order("id")
      .range(pornire, pornire + PAS - 1);

    /*
     * Eroarea se CITESTE. Fara asta, o interogare picata devine `data: null`
     * devine sitemap GOL cu raspuns 200 — adica toate produsele dispar din index
     * si nimic nu semnaleaza. Exact asa a iesit prima versiune a acestui fisier.
     */
    if (error) {
      console.error(`[sitemap] felia ${felie}, pornire ${pornire}: ${error.message}`);
      break;
    }
    const bucata = (data ?? []) as unknown as typeof randuri;
    randuri.push(...bucata);
    if (bucata.length < PAS) break;
  }

  /*
   * Magazinele cu DOMENIU PROPRIU isi au sitemap-ul pe domeniul lor, iar cele „un
   * singur produs" isi reprezinta produsul prin pagina principala (`/product/*`
   * face 301 catre ea).
   *
   * Amandoua se filtreaza AICI, in JavaScript, nu in interogare: un filtru
   * `is.null` pe o resursa imbricata (`businesses.custom_domain`) intorcea ZERO
   * randuri, tacut. Filtrul pe `is_published` merge — acela era si inainte — dar
   * pe `is null` nu, si diferenta nu se vede decat numarand ce a iesit.
   */
  const { data: mode } = await createAdminClient()
    .from("businesses")
    .select("slug, store_settings(page_content)")
    .eq("is_published", true);
  const unSingurProdus = new Set(
    ((mode ?? []) as unknown as { slug: string; store_settings: { page_content: Json } | { page_content: Json }[] | null }[])
      .filter((b) => {
        const st = Array.isArray(b.store_settings) ? b.store_settings[0] : b.store_settings;
        return parseStoreMode(st?.page_content ?? null).mode === "one_product";
      })
      .map((b) => b.slug),
  );

  return randuri
    .filter((p) => p.slug && p.businesses && !p.businesses.custom_domain && !unSingurProdus.has(p.businesses.slug))
    .map((p) => ({
      url: `${PLATFORM_ORIGIN}/${p.businesses!.slug}/product/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
}
