import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_ORIGIN, isPlatformHost, parseStoreSeo } from "@/lib/seo";
import { parseStoreModeFromSettings } from "@/lib/storefront/store-mode";
import { SEGMENT_MAGAZIN, shopOnPage } from "@/lib/storefront/design/commerce";
import { politiciIndexabile } from "@/lib/storefront/policy-index";
import { slugCategorie } from "@/lib/storefront/category-href";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { categoriiVizibile } from "@/lib/categories/vizibilitate";
import { eticheteFolosite, toateArticolelePublicate } from "@/lib/blog/citire";
import { CATEGORII_AJUTOR, TOATE_GHIDURILE } from "@/lib/website/ajutor";
import { adresaCategorie, adresaGhid } from "@/lib/website/ajutor-cautare";
import {
  COMPETITORS,
  INDUSTRIES,
  RESOURCES,
  SOLUTION_COLUMNS,
  TOP_NAV,
} from "@/lib/website/nav";

// Un fisier de sitemap accepta maxim 50.000 de URL-uri (limita Google) —
// peste, fisierul intreg e respins. Pastram ordinea de prioritate
// static → magazine → produse → pagini si taiem la limita.
const SITEMAP_URL_LIMIT = 50000;

/** Whether a store's homepage opted out of indexing (Settings > SEO > noindex).
 *  Reads the nested store_settings(page_content) selected on a businesses row. */
/**
 * Designul PUBLICAT al magazinului, din randul deja adus.
 *
 * Contextul e minimal: singura intrebare de aici e daca exista pagina de
 * catalog, iar aceea nu depinde de culori, de bannere sau de flagurile paginii
 * principale.
 */
function designPublicat(storeSettings: unknown) {
  const ss = storeSettings as { storefront_design?: unknown } | { storefront_design?: unknown }[] | null;
  const brut = ss ? (Array.isArray(ss) ? ss[0] : ss)?.storefront_design : null;
  return parseStoreDesign(brut, { primaryColor: "#1AB554", pageContent: {}, features: {} });
}

function pcDinRand(row: { store_settings?: unknown }): unknown {
  const ss = row.store_settings as { page_content?: unknown } | { page_content?: unknown }[] | null | undefined;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.page_content ?? null;
}

function politiciDinRand(row: { store_settings?: unknown }): unknown {
  const ss = row.store_settings as { store_policies?: unknown } | { store_policies?: unknown }[] | null | undefined;
  if (!ss) return null;
  return (Array.isArray(ss) ? ss[0] : ss)?.store_policies ?? null;
}

function homepageNoindex(row: { store_settings?: unknown }): boolean {
  const ss = row.store_settings as { page_content?: unknown } | { page_content?: unknown }[] | null | undefined;
  if (!ss) return false;
  const pc = (Array.isArray(ss) ? ss[0] : ss)?.page_content ?? null;
  return parseStoreSeo(pc).noindex === true;
}

// Host-aware. Using headers() makes this dynamic (per request), so:
//  - a merchant custom domain gets a sitemap of ONLY that store's pages, on its
//    own domain;
//  - the platform sitemap (www.edinio.com) lists marketing pages + stores that
//    do NOT have a custom domain (those live on, and index under, their domain).

/**
 * Adresele paginilor de prezentare, scoase din datele meniului.
 *
 * ⚠ SE IAU DIN `nav.ts`, NU SE SCRIU AICI. Meniul e singurul loc unde cineva
 * chiar adauga o pagina noua; daca lista de aici ar fi scrisa de mana, s-ar
 * despartii de el la prima pagina adaugata — si chiar asta se intamplase.
 *
 * Cele patru adaugate cu mana la sfarsit sunt paginile-index si cele care nu
 * stau in meniu, dar sunt vii si indexabile. `/` si `/ajutor` ies, fiindca sunt
 * puse separat mai sus, cu prioritatile lor.
 */
export const PUSE_SEPARAT = ["/", "/ajutor", "/preturi", "/despre", "/contact"];

export function paginiDeSite(): string[] {
  const adrese = new Set<string>();
  for (const col of SOLUTION_COLUMNS) for (const it of col.items) adrese.add(it.href);
  for (const it of RESOURCES) adrese.add(it.href);
  for (const t of TOP_NAV) if ("href" in t) adrese.add(t.href);

  adrese.add("/vs");
  adrese.add("/industrii");
  adrese.add("/magazin-online");
  adrese.add("/start");

  for (const c of COMPETITORS) adrese.add(c.href);
  for (const i of INDUSTRIES) adrese.add(`/industrii/${i.slug}`);

  // Puse separat mai sus, cu alta prioritate. Aici ar fi iesit de doua ori.
  for (const deja of PUSE_SEPARAT) adrese.delete(deja);

  return [...adrese].sort();
}

/**
 * Când s-a schimbat ultima oară CONȚINUTUL articolului.
 *
 * ⚠ VINE DIN `content_updated_at`, NU DIN `updated_at`. Al doilea se mută la
 * orice atingere administrativă — pui alt articol în vitrină și triggerul îl
 * coboară pe ăsta, îl fixezi, îl arhivezi. Un sitemap construit pe el spunea lui
 * Google că articolul s-a schimbat, când de fapt cineva apăsase o bifă.
 *
 * Se ia cea mai MARE dintre cele două date: un articol programat în viitor și
 * încă neatins poate avea data conținutului mai veche decât cea de publicare.
 */
function candSaSchimbat(actualizat?: string | null, publicat?: string | null): Date {
  const d = [actualizat, publicat]
    .filter((x): x is string => !!x)
    .map((x) => new Date(x).getTime())
    .filter((t) => Number.isFinite(t));
  return d.length ? new Date(Math.max(...d)) : new Date();
}

/** Cel mai proaspăt articol dintr-un teanc, pentru paginile de rubrică și autor. */
function ceaMaiProaspata(
  articole: { content_updated_at?: string | null; published_at?: string | null }[],
): Date {
  if (articole.length === 0) return new Date();
  return new Date(
    Math.max(...articole.map((a) => candSaSchimbat(a.content_updated_at, a.published_at).getTime())),
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
  const supabase = await createClient();

  // ── Custom domain: only this store's pages, on its own domain ──────────────
  if (!isPlatformHost(host)) {
    const { data: biz } = await createAdminClient()
      .from("businesses")
      .select("id, updated_at, store_settings(page_content, storefront_design, store_policies)")
      .eq("custom_domain", host)
      .eq("is_published", true)
      .single();
    if (!biz) return [];

    const base = `https://${host}`;
    // Skip the homepage entry when the merchant set it to noindex (Settings > SEO);
    // its products/pages can still be indexable, so they stay below.
    const entries: MetadataRoute.Sitemap = homepageNoindex(biz)
      ? []
      : [{ url: base, lastModified: biz.updated_at ? new Date(biz.updated_at) : new Date(), changeFrequency: "weekly", priority: 1 }];

    // Pagina de catalog, cand magazinul si-a ales-o. Prima ruta-sectiune
    // indexabila: cosul si finalizarea sunt deliberat noindex, dar asta e chiar
    // catalogul magazinului.
    if (shopOnPage(designPublicat(biz.store_settings))) {
      entries.push({
        url: `${base}/${SEGMENT_MAGAZIN}`,
        lastModified: biz.updated_at ? new Date(biz.updated_at) : new Date(),
        changeFrequency: "daily",
        priority: 0.9,
      });
      // Si paginile de categorie: de cand exista, ele sunt adresele care
      // raspund cautarilor de tip „bocanci de protectie". Cele stinse din panou
      // ies — pagina lor raspunde 404.
      const categorii = categoriiVizibile(await fetchAllRowsStrict("sitemap.store.categories", (from, to) =>
        supabase.from("categories").select("id, name, parent_id, is_active").eq("business_id", biz.id).order("id").range(from, to)
      ));
      const vazute = new Set<string>();
      for (const c of categorii) {
        const seg = slugCategorie(c.name ?? "");
        if (!seg || vazute.has(seg)) continue;
        vazute.add(seg);
        entries.push({
          url: `${base}/${SEGMENT_MAGAZIN}/${seg}`,
          lastModified: biz.updated_at ? new Date(biz.updated_at) : new Date(),
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
    }

    // One Product Store: the homepage already represents the single product, so
    // skip the individual /product/* URLs (the main one 301s to the homepage; the
    // rest are noindex). Custom pages below still get listed.
    if (parseStoreModeFromSettings(biz.store_settings).mode !== "one_product") {
      const products = await fetchAllRowsStrict("sitemap.store.products", (from, to) =>
        supabase
          .from("products")
          .select("slug, updated_at")
          .eq("business_id", biz.id)
          .eq("is_active", true)
          .not("slug", "is", null)
          .order("id")
          .range(from, to)
      );

      for (const p of products) {
        if (!p.slug) continue;
        entries.push({
          url: `${base}/product/${p.slug}`,
          lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }

    // Paginile de politici indexabile. Vezi `politiciIndexabile`: aceeasi functie
    // decide si eticheta `robots` a paginii, ca sitemapul si pagina sa nu spuna
    // lucruri diferite.
    for (const tip of politiciIndexabile(pcDinRand(biz), politiciDinRand(biz))) {
      entries.push({
        url: `${base}/politici/${tip}`,
        lastModified: biz.updated_at ? new Date(biz.updated_at) : new Date(),
        changeFrequency: "yearly",
        priority: 0.3,
      });
    }

    const pages = await fetchAllRowsStrict("sitemap.store.pages", (from, to) =>
      supabase
        .from("custom_pages")
        .select("slug, updated_at, seo")
        .eq("business_id", biz.id)
        .eq("is_published", true)
        .order("id")
        .range(from, to)
    );
    for (const pg of pages) {
      if ((pg.seo as { noindex?: boolean } | null)?.noindex) continue;
      entries.push({
        url: `${base}/${pg.slug}`,
        lastModified: pg.updated_at ? new Date(pg.updated_at) : new Date(),
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
    return entries.slice(0, SITEMAP_URL_LIMIT);
  }

  // ── Platform (www.edinio.com): marketing + stores WITHOUT a custom domain ──

  /* ⚠ SE IAU IN FELII, nu cu un `.limit()` mare.
     Aici scria „plafonul e generos dinadins: la 2000 de articole sitemapul tot
     incape sub limita Google". Era o presupunere gresita: PostgREST taie TACUT
     la propriul lui plafon de randuri, deci `.limit(2000)` ar fi adus o mie si
     ne-ar fi lasat sa credem ca le are pe toate. Vezi nota din
     `toateArticolelePublicate`. */
  /*
    ⚠ ARTICOLELE CU `noindex` NU INTRĂ ÎN SITEMAP.

    Un sitemap e o rugăminte: „indexează asta". Pagina cu `noindex` spune exact
    pe dos. Trimise amândouă, Google primește două instrucțiuni care se bat cap
    în cap, cheltuie o vizită ca să afle că n-avea ce căuta acolo, și numără
    contradicția la sănătatea site-ului.

    Găsit chiar la proba de punere în funcțiune (30.08.2026): articolul de test
    era `noindex` și apărea totuși în sitemap.
  */
  const [toateArticolele, eticheteBlog] = await Promise.all([
    toateArticolelePublicate(),
    eticheteFolosite(),
  ]);
  const articoleBlog = toateArticolele.filter((a) => !a.noindex);
  const categoriiCuArticole = [
    ...new Set(articoleBlog.map((a) => a.categorie?.slug).filter((s): s is string => !!s)),
  ];
  /* Din aceleași rânduri, fără încă o interogare: autorul vine deja legat de
     fiecare articol. */
  const autoriDeAratat = [
    ...new Set(articoleBlog.map((a) => a.autor?.slug).filter((s): s is string => !!s)),
  ];

  const staticPages: MetadataRoute.Sitemap = [
    { url: PLATFORM_ORIGIN, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${PLATFORM_ORIGIN}/preturi`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${PLATFORM_ORIGIN}/despre`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${PLATFORM_ORIGIN}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${PLATFORM_ORIGIN}/termeni`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${PLATFORM_ORIGIN}/confidentialitate`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${PLATFORM_ORIGIN}/cookies`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${PLATFORM_ORIGIN}/gdpr`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },

    /*
      Paginile de prezentare, luate din CHIAR datele meniului.

      ⚠ NU SE SCRIU DE MANA. Pana pe 30.08.2026, lista de deasupra se oprise la
      paginile vechi, iar zece pagini vii lipseau cu totul din sitemap: /blog,
      /integrari, /magazin-online, /optimizare, /mentenanta-gratuita, /vs,
      /industrii, /intrebari-frecvente, /migrare si /start. Toate raspundeau 200.

      Nu le-a observat nimeni fiindca o pagina lipsa dintr-un sitemap nu strica
      nimic si nu da nicio eroare — doar nu e gasita. E cel mai tacut fel de
      defect: paginile de comparatie si cele pe industrii sunt tocmai cele care
      aduc cautari cu intentie de cumparare, si tocmai ele nu erau anuntate.

      Luate din `nav.ts`, o pagina adaugata in meniu intra singura aici, si una
      scoasa iese. Aceeasi disciplina ca la centrul de ajutor, mai jos. Slug-urile
      de competitori si de industrii vin din listele din care isi fac paginile
      `generateStaticParams`, deci nu pot ramane in urma.
    */
    ...paginiDeSite().map((cale) => ({
      url: `${PLATFORM_ORIGIN}${cale}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    /*
      Centrul de ajutor: pagina lui de start, categoriile si fiecare ghid.
      Se construiesc din datele centrului, nu se scriu de mana: un ghid adaugat
      acolo intra singur in sitemap, iar unul sters iese.

      Un centru de ajutor traieste din cautare. Cele mai multe intrebari ajung la
      el prin Google, nu prin meniul site-ului, deci ghidurile negasite de Google
      sunt ghiduri pe care nu le citeste nimeni.

      ⚠ SE SCOT DE AICI cand centrul trece pe `ajutor.edinio.com`: un sitemap nu
      poate cuprinde adrese de pe alt domeniu. E punctul 3 din lista de mutare,
      scrisa in capul lui `lib/website/ajutor.ts`.
    */
    { url: `${PLATFORM_ORIGIN}/ajutor`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    ...CATEGORII_AJUTOR.map((c) => ({
      url: `${PLATFORM_ORIGIN}${adresaCategorie(c.slug)}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...TOATE_GHIDURILE.map((g) => ({
      url: `${PLATFORM_ORIGIN}${adresaGhid(g.categorie.slug, g.slug)}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),

    /*
      Blogul: fiecare articol publicat, și categoriile care au articole.

      ⚠ SE CITESC PRIN `articolePublicate`, care merge pe clientul obișnuit, NU
      pe cel de serviciu folosit mai jos pentru magazine. Regula din baza de date
      lasă să treacă doar `published` cu data trecută, deci o ciornă sau un
      articol programat nu POT ajunge aici. Cu cheia de serviciu ar fi ajuns la
      un filtru scris de mână, iar un filtru uitat ar fi trimis Google către
      pagini care dau 404 — genul de greșeală care se plătește în încredere.

      ⚠ `lastModified` E DATA ADEVĂRATĂ, nu `new Date()` ca la paginile de
      deasupra. Acolo e o aproximare fără miză; aici e un semnal: un sitemap care
      spune că TOATE paginile s-au schimbat azi nu mai spune nimic despre
      niciuna, iar crawlerul învață să nu se mai uite la câmp.

      ⚠ NOTA ASTA A FOST MULTĂ VREME O MINCIUNĂ PE JUMĂTATE. Stătea exact aici,
      deasupra unor blocuri care puneau `new Date()` la categorii, la autori și
      la etichete. Numai articolele o respectau.

      ⚠ ARTICOLUL FOLOSEȘTE `updated_at`, NU DOAR `published_at`. Cu
      `published_at`, un articol corectat peste șase luni părea neatins din ziua
      publicării, deci Google n-avea niciun motiv să se întoarcă la el. Am putut
      trece pe `updated_at` abia după ce citirile au plecat de pe rândul
      articolului: cât timp fiecare vizită îl muta, ar fi însemnat „articolele
      citite se schimbă zilnic".
    */
    ...articoleBlog.map((a) => ({
      url: `${PLATFORM_ORIGIN}/blog/${a.slug}`,
      lastModified: candSaSchimbat(a.content_updated_at, a.published_at),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    /* Pagina unei rubrici se schimbă când apare un articol în ea. Deci data ei e
       a celui mai proaspăt articol al ei — nu ziua de azi. */
    ...categoriiCuArticole.map((slug) => ({
      url: `${PLATFORM_ORIGIN}/blog/categorie/${slug}`,
      lastModified: ceaMaiProaspata(articoleBlog.filter((a) => a.categorie?.slug === slug)),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    /* Doar autorii cu articole. Ceilalți dau 404 dinadins — o pagină cu un nume
       și nimic altceva e o pagină subțire, iar un sitemap care o anunță trimite
       crawlerul degeaba. */
    ...autoriDeAratat.map((slug) => ({
      url: `${PLATFORM_ORIGIN}/blog/autor/${slug}`,
      lastModified: ceaMaiProaspata(articoleBlog.filter((a) => a.autor?.slug === slug)),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
    /* Etichetele folosite de măcar un articol publicat. Cele legate doar de
       ciorne dau 404 dinadins, deci n-au ce căuta aici.

       ⚠ Bucata asta a lipsit o vreme, deși `eticheteFolosite()` era deja
       chemată: o înlocuire automată nu potrivise, iar variabila rămăsese
       nefolosită. Am prins-o citind sitemapul adevărat, nu codul — pagina de
       etichetă răspundea 200 și tot nu era anunțată nicăieri. */
    /* Data vine din `blog_etichete_folosite`: legăturile eticheta-articol nu se
       pot număra aici fără să le cerem pe toate, iar acolo e plafonul tăcut de
       1000 de rânduri al PostgREST. */
    ...eticheteBlog.map((e) => ({
      url: `${PLATFORM_ORIGIN}/blog/eticheta/${e.slug}`,
      lastModified: e.ultima ? new Date(e.ultima) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];

  const admin = createAdminClient();
  const businesses = await fetchAllRowsStrict("sitemap.platform.businesses", (from, to) =>
    admin
      .from("businesses")
      .select("slug, updated_at, custom_domain, store_settings(page_content, storefront_design)")
      .eq("is_published", true)
      .order("id")
      .range(from, to)
  );

  const businessPages: MetadataRoute.Sitemap = businesses
    .filter((b) => !b.custom_domain && !homepageNoindex(b))
    .map((b) => ({
      url: `${PLATFORM_ORIGIN}/${b.slug}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const paginiDeCatalog: MetadataRoute.Sitemap = businesses
    .filter((b) => !b.custom_domain && !homepageNoindex(b) && shopOnPage(designPublicat(b.store_settings)))
    .map((b) => ({
      url: `${PLATFORM_ORIGIN}/${b.slug}/${SEGMENT_MAGAZIN}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    }));

  // One Product Store homepages represent their single product, so their
  // /product/* URLs are excluded below (the main one 301s to the homepage; the
  // rest are noindex).
  const opsSlugs = new Set(
    businesses
      .filter((b) => parseStoreModeFromSettings(b.store_settings).mode === "one_product")
      .map((b) => b.slug),
  );

  /*
   * PRODUSELE NU MAI SUNT AICI. Vezi `app/produse/sitemap.ts`.
   *
   * Se citeau toate, ale tuturor magazinelor publicate, ca sa se pastreze primele
   * 50.000 — la cinci milioane de produse, cinci milioane de randuri aduse in
   * memoria functiei ca sa se arunce 99%. Si e o ruta PUBLICA, deci oricine o
   * putea declansa.
   *
   * Acum sunt taiate in felii de 45.000 cu `generateSitemaps`, fiecare citindu-si
   * exact fereastra ei. Feliile se anunta din `robots.txt`.
   */
  const pages = await fetchAllRowsStrict("sitemap.platform.pages", (from, to) =>
    supabase
      .from("custom_pages")
      // Relatia numita explicit, ca la sitemap-ul de produse: aici nu e (inca)
      // ambigua, dar o tabela noua cu chei straine catre `custom_pages` si
      // `businesses` ar face-o, iar simptomul ar fi tot un sitemap gol cu 200.
      .select("slug, updated_at, seo, businesses!custom_pages_business_id_fkey!inner(slug, is_published, custom_domain)")
      .eq("is_published", true)
      .eq("businesses.is_published", true)
      .order("id")
      .range(from, to)
  );

  const customPagePages: MetadataRoute.Sitemap = pages
    .filter((p) => !(p.businesses as unknown as { custom_domain: string | null }).custom_domain)
    .filter((p) => !(p.seo as { noindex?: boolean } | null)?.noindex)
    .map((p) => {
      const biz = p.businesses as unknown as { slug: string };
      return {
        url: `${PLATFORM_ORIGIN}/${biz.slug}/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.5,
      };
    });

  return [...staticPages, ...businessPages, ...paginiDeCatalog, ...customPagePages].slice(0, SITEMAP_URL_LIMIT);
}
