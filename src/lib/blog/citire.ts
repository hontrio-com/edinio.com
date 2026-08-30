import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient } from "@/lib/supabase/public";
import { pregatesteCautarea } from "./types";
import type { ArticolBlog, AutorBlog, CategorieBlog } from "./types";

/**
 * Citirea publică a blogului.
 *
 * ⚠ MERGE PE CLIENTUL OBIȘNUIT, NU PE CEL DE SERVICIU. Cel de serviciu sare
 * peste drepturile pe rând, deci o interogare scrisă greșit ar putea scoate o
 * ciornă pe site. Aici regula din baza de date e paza: `blog_posts_public_read`
 * lasă să treacă doar `published` cu data trecută.
 *
 * Adică o ciornă nu poate ajunge pe site nici dacă o pagină uită să filtreze.
 * Filtrele de mai jos sunt pentru ordine și pentru numărul de rânduri, nu
 * pentru ascundere — ascunderea e mai jos de ele, în bază.
 *
 * ⚠ ȘI FĂRĂ COOKIE-URI, DIN 30.08.2026. `createClient()` din `supabase/server`
 * citește cookie-urile prin `next/headers`, iar o pagină care atinge
 * cookie-urile nu mai poate fi randată o dată pentru toți: Next o socotește la
 * fiecare cerere. Pentru pagini care arată identic pentru toată lumea și trăiesc
 * din a fi rapide, asta e exact ce nu vrem. Vezi `supabase/public.ts`.
 *
 * ⚠ FILTRELE DE MAI JOS SUNT EXPLICITE, NU SE BIZUIE PE CINE CERE.
 *
 * Regula din baza de date ascunde ciornele de `anon`, dar un ADMIN logat trece
 * prin `blog_posts_admin_all` si vede tot. Pana pe 30.08.2026 asta insemna ca
 * paginile publice aratau altceva pentru el decat pentru restul lumii — de
 * obicei inofensiv, cu o exceptie urata: `/llms.txt` se serveste cu
 * `Cache-Control: public, s-maxage=3600`. Un singur admin care deschidea acea
 * adresa umplea cache-ul COMUN cu titlurile ciornelor, si le servea o ora
 * intregii lumi.
 *
 * Acum fiecare citire publica pune ea insasi conditiile. Regula din baza ramane
 * plasa; astea sunt gardul. Nici RLS nu se poate slabi din greseala fara ca
 * cineva sa observe, nici o sesiune de admin nu mai schimba ce vede publicul.
 *
 * Tabelele nu sunt încă în tipurile generate, deci clientul e fără tipuri, ca
 * la `blog.actions.ts`.
 *
 * ⚠ FĂRĂ `import "server-only"`, ca și la `curata.ts`. Pachetul nu e instalat —
 * îl rezolvă Next la build — și face fișierul de necitit pentru node. Aici a
 * contat de două ori: `sitemap.ts` importă bucata asta, deci probele
 * sitemapului au încetat să pornească în clipa în care am legat blogul de el.
 *
 * Paza rămâne, doar că vine din altă parte: `@/lib/supabase/server` folosește
 * `next/headers`, care oricum pică la build dacă ajunge într-un component de
 * client.
 */
async function db(): Promise<SupabaseClient> {
  return createPublicClient() as unknown as SupabaseClient;
}

/** Articolul din listă: fără corpul HTML, care nu se citește acolo. */
export type ArticolDeLista = Pick<
  ArticolBlog,
  | "id" | "slug" | "title" | "excerpt" | "cover_url" | "cover_alt" | "published_at" | "updated_at"
  | "reading_minutes" | "is_featured" | "is_pinned" | "noindex"
> & {
  autor: Pick<AutorBlog, "name" | "slug" | "avatar_url"> | null;
  categorie: Pick<CategorieBlog, "name" | "slug"> | null;
};

const CAMPURI_LISTA =
  /* ⚠ `updated_at` e aici pentru `lastModified` din sitemap. A putut fi adăugat
     abia după ce citirile au plecat de pe rândul articolului: cât timp fiecare
     VIZITĂ îl muta, un sitemap construit pe el ar fi spus lui Google că
     articolele populare se schimbă în fiecare zi. Vezi `blog_post_stats`. */
  "id, slug, title, excerpt, cover_url, cover_alt, published_at, updated_at, reading_minutes, is_featured, is_pinned, noindex," +
  " blog_authors(name, slug, avatar_url), blog_categories(name, slug)";

/**
 * Conditiile care fac un articol vizibil public, puse pe orice interogare.
 *
 * Aceleasi trei ca in `blog_posts_public_read` si ca in `seVede()`. Al treilea
 * loc unde e scrisa regula, si dinadins: aici e singurul care nu depinde nici
 * de baza, nici de cine intreaba.
 */
const ACUM = () => new Date().toISOString();

/** Supabase întoarce relația fie ca obiect, fie ca listă cu un element. */
function unul<T>(v: unknown): T | null {
  const x = Array.isArray(v) ? v[0] : v;
  return (x as T) ?? null;
}

function caLista(r: Record<string, unknown>): ArticolDeLista {
  return {
    ...(r as unknown as ArticolDeLista),
    autor: unul(r.blog_authors),
    categorie: unul(r.blog_categories),
  };
}

/**
 * Articolele publicate, cele mai noi întâi.
 *
 * ⚠ ORDONATE DUPĂ `published_at`, NU DUPĂ `created_at`. Un articol scris acum
 * o lună și publicat azi trebuie să stea sus: cititorul vede data publicării,
 * și o listă care nu se potrivește cu datele scrise pe ea pare stricată.
 */
export async function articolePublicate(limita = 50): Promise<ArticolDeLista[]> {
  const { data } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .order("published_at", { ascending: false })
    .limit(limita);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista);
}

/** Articolele unei categorii. */
export async function articoleleCategoriei(
  slugCategorie: string,
  pagina = 1,
  pePagina = PE_PAGINA,
): Promise<{ articole: ArticolDeLista[]; total: number; pagini: number }> {
  const gol = { articole: [] as ArticolDeLista[], total: 0, pagini: 1 };
  const client = await db();
  const { data: cat } = await client
    .from("blog_categories").select("id").eq("slug", slugCategorie).maybeSingle();
  if (!cat) return gol;

  const de_la = Math.max(0, (pagina - 1) * pePagina);
  const { data, count } = await client
    .from("blog_posts")
    .select(CAMPURI_LISTA, { count: "exact" })
    .eq("category_id", (cat as { id: string }).id)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    /* ⚠ FIXATELE INTAI si aici: o categorie e o lista de rasfoit, ca cea
       principala, deci ghidul de pornire al categoriei trebuie sa stea sus. */
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);

  const total = count ?? 0;
  return {
    articole: ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista),
    total,
    pagini: Math.max(1, Math.ceil(total / pePagina)),
  };
}

export type ArticolIntreg = ArticolBlog & {
  autor: AutorBlog | null;
  categorie: CategorieBlog | null;
};

/** Un articol, cu autorul și categoria lui. `null` dacă nu se vede. */
/**
 * ⚠ ÎNVELIT ÎN `cache`, FIINDCĂ SE CHEAMĂ DE DOUĂ ORI PE FIECARE CERERE.
 *
 * O dată din `generateMetadata` și o dată din pagina însăși — așa e făcut App
 * Router-ul, și e în regulă să fie așa. Fără `cache`, fiecare deschidere de
 * articol înseamnă două interogări identice, cu tot cu corpul HTML.
 *
 * `cache` din React ține răspunsul pe durata UNEI cereri. Nu e memorie între
 * vizitatori și nu e cache de conținut: la cererea următoare se întreabă din
 * nou. Deci nu poate învechi nimic.
 */
export const articolDupaSlug = cache(async function articolDupaSlug(slug: string): Promise<ArticolIntreg | null> {
  const { data } = await (await db())
    .from("blog_posts")
    .select("*, blog_authors(*), blog_categories(*)")
    .eq("slug", slug)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    ...(r as unknown as ArticolBlog),
    autor: unul<AutorBlog>(r.blog_authors),
    categorie: unul<CategorieBlog>(r.blog_categories),
  };
});

/**
 * Unde s-a mutat un articol care nu mai e la adresa cerută.
 *
 * ⚠ SE CAUTĂ DOAR CÂND ARTICOLUL NU E GĂSIT, adică pe drumul spre 404. Un
 * articol viu nu trece niciodată pe aici, deci tabela de redirectări nu costă
 * nimic la fiecare citire.
 */
export type FelRedirectare = "articol" | "categorie" | "autor";

/**
 * Unde s-a mutat adresa asta?
 *
 * ⚠ FELUL CONTEAZĂ. Un articol și o rubrică pot avea același slug vechi fără să
 * se calce, fiindcă stau pe căi diferite: `/blog/x` față de
 * `/blog/categorie/x`. Cheia din bază e (fel, from_slug) tocmai de aceea —
 * altfel redenumirea unei rubrici ar fi șters tăcut redirectarea unui articol cu
 * același nume.
 */
export async function undeS_aMutat(slug: string, fel: FelRedirectare = "articol"): Promise<string | null> {
  const { data } = await (await db())
    .from("blog_redirects").select("to_slug").eq("fel", fel).eq("from_slug", slug).maybeSingle();
  return (data as { to_slug: string } | null)?.to_slug ?? null;
}

/** Categoriile, în ordinea aleasă din admin. */
export async function categoriiBlog(): Promise<CategorieBlog[]> {
  const { data } = await (await db())
    .from("blog_categories").select("*").order("sort_order").order("name");
  return (data ?? []) as unknown as CategorieBlog[];
}

/**
 * Articole înrudite cu unul dat.
 *
 * Aceeași categorie întâi, iar dacă nu se strâng destule, se completează cu
 * cele mai noi. Un articol fără nimic dedesubt e un fund de sac: cititorul care
 * a terminat de citit n-are unde să meargă mai departe, iar Google vede o
 * pagină din care nu pleacă nicio legătură internă.
 */
export async function articoleInrudite(
  articol: Pick<ArticolBlog, "id" | "category_id">,
  cate = 3,
): Promise<ArticolDeLista[]> {
  const client = await db();
  const gasite: ArticolDeLista[] = [];

  if (articol.category_id) {
    const { data } = await client
      .from("blog_posts")
      .select(CAMPURI_LISTA)
      .eq("category_id", articol.category_id)
      .neq("id", articol.id)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", ACUM())
      .order("published_at", { ascending: false })
      .limit(cate);
    gasite.push(...((data ?? []) as unknown as Record<string, unknown>[]).map(caLista));
  }

  if (gasite.length < cate) {
    const stiute = new Set([articol.id, ...gasite.map((a) => a.id)]);
    const { data } = await client
      .from("blog_posts")
      .select(CAMPURI_LISTA)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", ACUM())
      .order("published_at", { ascending: false })
      .limit(cate + stiute.size);
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const a = caLista(r);
      if (!stiute.has(a.id)) { gasite.push(a); stiute.add(a.id); }
      if (gasite.length >= cate) break;
    }
  }

  return gasite.slice(0, cate);
}

/** Un autor, după adresa lui. `null` dacă nu există. */
export async function autorDupaSlug(slug: string): Promise<AutorBlog | null> {
  const { data } = await (await db())
    .from("blog_authors").select("*").eq("slug", slug).maybeSingle();
  return (data as AutorBlog) ?? null;
}

/**
 * Articolele publicate ale unui autor, pe pagini.
 *
 * ⚠ CU NUMARATOARE, nu cu `.limit()`. Un autor productiv trecea de plafonul
 * fix si restul articolelor lui deveneau de negasit din pagina lui — acelasi
 * defect mut pe care paginarea listei principale il repara.
 */
export async function articoleleAutorului(
  idAutor: string,
  pagina = 1,
  pePagina = PE_PAGINA,
): Promise<{ articole: ArticolDeLista[]; total: number; pagini: number }> {
  const de_la = Math.max(0, (pagina - 1) * pePagina);
  const { data, count } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA, { count: "exact" })
    .eq("author_id", idAutor)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);

  const total = count ?? 0;
  return {
    articole: ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista),
    total,
    pagini: Math.max(1, Math.ceil(total / pePagina)),
  };
}

/**
 * Autorii care au măcar un articol publicat.
 *
 * ⚠ CEILALȚI N-AU PAGINĂ. Un autor fără articole ar avea o pagină goală, care
 * pentru Google e o pagină subțire — mai rău decât niciuna. Se folosește și la
 * sitemap, ca să nu se anunțe adrese care nu spun nimic.
 */
export async function autoriCuArticole(): Promise<AutorBlog[]> {
  const client = await db();
  const { data: articole } = await client
    .from("blog_posts").select("author_id").not("author_id", "is", null);
  const idUri = [
    ...new Set(((articole ?? []) as { author_id: string }[]).map((a) => a.author_id)),
  ];
  if (idUri.length === 0) return [];
  const { data } = await client
    .from("blog_authors").select("*").in("id", idUri).order("name");
  return (data ?? []) as unknown as AutorBlog[];
}

/** Câte articole intră pe o pagină din listă. */
/**
 * Articolul scos în față, oriunde ar fi el.
 *
 * ⚠ SE CĂUTA DOAR ÎN PAGINA CURENTĂ. `/blog` făcea
 * `articole.find((a) => a.is_featured)` pe cele 12 rânduri pe care le avea în
 * mână. Deci vitrina se vedea numai cât timp articolul ales era destul de nou
 * ca să încapă în prima pagină; din clipa în care ieșea de acolo, dispărea
 * tăcut de pe site și rămânea doar bifa aprinsă în admin, care spunea contrariul.
 *
 * ⚠ E UNUL SINGUR, ȘI ACUM O ȚINE BAZA. Comentariul din `types.ts` spunea de la
 * început „cel scos în față e unul singur", dar nimic nu-l ținea: două articole
 * puteau avea `is_featured`, iar pagina alegea după noroc. Vezi indexul
 * `blog_posts_o_singura_vitrina` și triggerul de lângă el.
 */
export async function articolulDinVitrina(): Promise<ArticolDeLista | null> {
  const { data } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA)
    .eq("is_featured", true)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .maybeSingle();
  return data ? caLista(data as unknown as Record<string, unknown>) : null;
}

export const PE_PAGINA = 12;

/**
 * O pagină din lista de articole, plus câte sunt în total.
 *
 * ⚠ ÎNLOCUIEȘTE O LIMITĂ CARE PIERDEA ÎN TĂCERE. Lista cerea primele 50 și
 * atât: la al 51-lea articol, cel mai vechi ar fi ieșit din site fără să crape
 * nimic și fără să observe cineva. Un articol care nu mai e legat de nicăieri
 * rămâne în bază, rămâne în sitemap, dar nu mai are drum către el din pagină.
 *
 * `count: "exact"` costă o numărare la fiecare cerere. La zeci de mii de rânduri
 * ar fi de înlocuit cu una estimată, dar până acolo e mai important să știm
 * numărul adevărat de pagini decât să economisim o numărare.
 */
export async function paginaDeArticole(
  pagina: number,
  pePagina = PE_PAGINA,
): Promise<{ articole: ArticolDeLista[]; total: number; pagini: number }> {
  const de_la = Math.max(0, (pagina - 1) * pePagina);
  const { data, count } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA, { count: "exact" })
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    /* ⚠ FIXATELE INTAI. Ordinea asta e a listei principale; cautarea si
       articolele inrudite raman strict cronologice, fiindca acolo intrebarea
       omului e alta si un articol fixat in capul rezultatelor ar fi zgomot. */
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);

  const total = count ?? 0;
  return {
    articole: ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista),
    total,
    pagini: Math.max(1, Math.ceil(total / pePagina)),
  };
}

/**
 * Caută în articolele publicate.
 *
 * Caută în coloana derivată `cauta`, care ține titlul, rezumatul, răspunsul
 * scurt și textul articolului fără etichete, pliat de diacritice.
 *
 * ⚠ CE FACE: „PLĂȚI" găsește „plati", „Întârziere" găsește „intarziere". Adică
 * scrisul cu sau fără diacritice, cu litere mari sau mici, nu mai contează.
 *
 * ⚠ CE NU FACE, DEȘI NOTA ASTA A SPUS MULTĂ VREME CĂ FACE: nu găsește „livrări"
 * căutând „livrare". E potrivire de subșir, nu de rădăcină — după pliere,
 * „livrare" pur și simplu nu se află în „livrari" (a patra literă diferă).
 * Pentru rădăcini ar fi trebuit `to_tsvector('romanian', …)`, care e altă
 * unealtă și altă coloană.
 *
 * Nu e o scăpare, e o alegere: căutarea unui blog cu câteva zeci de articole
 * n-are nevoie de rădăcini. Dar nota trebuie să spună adevărul, altfel
 * următorul care caută „de ce nu găsește" pornește de la o presupunere falsă.
 */
export async function cautaArticole(
  q: string,
  pagina = 1,
  pePagina = PE_PAGINA,
): Promise<{ articole: ArticolDeLista[]; total: number; pagini: number }> {
  const cautat = pregatesteCautarea(q);
  if (cautat.length < 2) return { articole: [], total: 0, pagini: 1 };

  const de_la = Math.max(0, (pagina - 1) * pePagina);
  const { data, count } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA, { count: "exact" })
    .ilike("cauta", `%${cautat}%`)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);

  const total = count ?? 0;
  return {
    articole: ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista),
    total,
    pagini: Math.max(1, Math.ceil(total / pePagina)),
  };
}

export interface EticheteBlogPublic {
  slug: string;
  name: string;
  /**
   * Cel mai proaspăt articol al etichetei.
   *
   * ⚠ Numai `eticheteFolosite()` o completează, fiindcă doar acolo se face
   * socoteala în bază. Sub un articol nu are ce căuta, deci acolo lipsește.
   *
   * E pentru `lastModified` din sitemap: fără ea, toate paginile de etichetă
   * spuneau „s-a schimbat chiar acum", la fiecare cerere — iar un sitemap care
   * spune asta despre tot nu mai spune nimic despre nimic.
   */
  ultima?: string | null;
}

/** Etichetele unui articol, pentru afișare sub el. */
export async function eticheteArticol(idArticol: string): Promise<EticheteBlogPublic[]> {
  const { data } = await (await db())
    .from("blog_post_tags").select("blog_tags(slug, name)").eq("post_id", idArticol);
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => unul<EticheteBlogPublic>(r.blog_tags))
    .filter((e): e is EticheteBlogPublic => !!e)
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

/** O etichetă, după adresa ei. */
export async function eticheta(slug: string): Promise<EticheteBlogPublic | null> {
  const { data } = await (await db())
    .from("blog_tags").select("slug, name").eq("slug", slug).maybeSingle();
  return (data as EticheteBlogPublic) ?? null;
}

/**
 * Articolele unei etichete.
 *
 * ⚠ DOUĂ INTEROGĂRI, NU UN JOIN. PostgREST ar putea filtra articolele printr-o
 * relație imbricată, dar atunci numărătoarea totală (de care are nevoie
 * paginarea) se face pe rândurile legăturii, nu pe articole. Aici întâi se află
 * ce articole poartă eticheta, apoi se citesc chiar acele articole — iar regula
 * din baza de date le taie pe cele nepublicate la al doilea pas.
 */
export async function articoleleEtichetei(
  slugEticheta: string,
  pagina = 1,
  pePagina = PE_PAGINA,
): Promise<{ articole: ArticolDeLista[]; total: number; pagini: number }> {
  const client = await db();

  /*
    ⚠ O SINGURĂ INTEROGARE, CU LEGĂTURĂ, NU DOUĂ CU O LISTĂ DE ID-URI ÎNTRE ELE.

    Înainte se cereau TOATE legăturile etichetei, apoi articolele cu
    `.in("id", idUri)`. Două plafoane tăcute pe același drum: PostgREST taie la
    1000 de rânduri fără să spună nimic, iar `.in()` cu o mie de id-uri face o
    adresă enormă. La a 1001-a legătură, pagina etichetei ar fi început să piardă
    articole — fără nicio eroare, fără niciun semn.

    `!inner` face o legătură adevărată: filtrarea, numărarea și paginarea se
    întâmplă toate în bază.
  */
  const de_la = Math.max(0, (pagina - 1) * pePagina);
  const { data, count } = await client
    .from("blog_posts")
    .select(`${CAMPURI_LISTA}, blog_post_tags!inner(blog_tags!inner(slug))`, { count: "exact" })
    .eq("blog_post_tags.blog_tags.slug", slugEticheta)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);

  const total = count ?? 0;
  return {
    articole: ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista),
    total,
    pagini: Math.max(1, Math.ceil(total / pePagina)),
  };
}

/**
 * Etichetele care au măcar un articol publicat, pentru sitemap și pentru lista
 * de sub articole.
 *
 * ⚠ SE PORNEȘTE DE LA ARTICOLE, NU DE LA ETICHETE. O etichetă poate exista
 * legată doar de ciorne; pagina ei ar fi goală, iar un sitemap care o anunță
 * trimite crawlerul degeaba.
 */
export async function eticheteFolosite(): Promise<EticheteBlogPublic[]> {
  /*
    ⚠ SE NUMĂRĂ ÎN BAZĂ, NU AICI.

    Înainte: cere id-urile TUTUROR articolelor publicate, apoi legăturile lor.
    Ambele cereri erau tăiate tăcut de PostgREST la 1000 de rânduri, deci de la
    al 1001-lea articol lista de etichete devenea pur și simplu greșită — fără
    nicio eroare. Aceeași capcană ca în cronuri: o tăietură pusă înaintea
    adunării.

    ⚠ ȘI SE SAR ARTICOLELE `noindex`. Nu se săreau: o etichetă ale cărei
    articole erau toate `noindex` ajungea în sitemap și în lista de sub articole.
    Îi spuneam lui Google „uite o pagină", iar când venea găsea pe ea numai
    lucruri despre care îi ceruserăm să nu le indexeze — o pagină subțire cerută
    de noi înșine.
  */
  const { data } = await (await db()).rpc("blog_etichete_folosite");
  return ((data ?? []) as { slug: string; name: string; ultima: string | null }[]).map((e) => ({
    slug: e.slug,
    name: e.name,
    ultima: e.ultima ?? null,
  }));
}

/**
 * Rubricile care au măcar un articol publicat, cu câte are fiecare.
 *
 * ⚠ PE TOATE ARTICOLELE, NU PE PAGINA CURENTĂ. Pagina `/blog` își făcea lista
 * de rubrici din cele 12 articole pe care le avea în mână, deși comentariul de
 * lângă spunea „pe TOATE articolele". Deci navigația se schimba sub picioarele
 * omului de la o pagină la alta, iar o rubrică ale cărei articole erau abia în
 * pagina 3 nu se vedea de nicăieri.
 */
export async function categoriiFolosite(): Promise<{ slug: string; name: string; cate: number }[]> {
  const { data } = await (await db()).rpc("blog_categorii_folosite");
  return ((data ?? []) as { slug: string; name: string; cate: number }[]).map((c) => ({
    slug: c.slug,
    name: c.name,
    cate: Number(c.cate ?? 0),
  }));
}

/**
 * Despre ce scrie un autor — pentru `knowsAbout` din datele structurate.
 *
 * ⚠ TOT PE TOATE ARTICOLELE LUI. Se socotea din pagina curentă, deci aceeași
 * persoană avea alte competențe pe pagina 1 față de pagina 2. Un `@id` care
 * descrie de fiecare dată altceva nu e o identitate, e zgomot — și tocmai
 * identitatea e ce trebuie să dovedească pagina de autor.
 */
export async function subiecteleAutorului(idAutor: string): Promise<string[]> {
  const { data } = await (await db()).rpc("blog_subiectele_autorului", { p_autor: idAutor });
  return ((data ?? []) as { name: string }[]).map((r) => r.name).filter(Boolean);
}

/**
 * TOATE articolele publicate, luate în felii.
 *
 * ⚠ `.limit(2000)` NU ADUCE 2000. PostgREST are propriul plafon de rânduri pe
 * cerere (1000 la configurația obișnuită), și taie TĂCUT: nicio eroare, niciun
 * semn, doar mai puține rânduri decât ai cerut. Sitemapul ar fi anunțat primele
 * o mie de articole și le-ar fi lăsat pe restul nevăzute, iar noi am fi crezut
 * că le-am cerut pe toate.
 *
 * Aceeași capcană a mușcat deja în cronuri, cu aceeași formă: o tăietură pusă
 * înaintea deduplicării, pe care rotația n-o repară.
 *
 * Se cere în felii până vine una mai mică decât felia, adică până se termină.
 */
export async function toateArticolelePublicate(maxim = 20000): Promise<ArticolDeLista[]> {
  const client = await db();
  const FELIE = 500;
  const toate: ArticolDeLista[] = [];

  for (let de_la = 0; de_la < maxim; de_la += FELIE) {
    const { data } = await client
      .from("blog_posts")
      .select(CAMPURI_LISTA)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", ACUM())
      .order("published_at", { ascending: false })
      .range(de_la, de_la + FELIE - 1);

    const felie = ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista);
    toate.push(...felie);
    if (felie.length < FELIE) break; // s-au terminat
  }

  return toate;
}
