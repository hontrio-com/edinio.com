import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import type { PostgrestError } from "@supabase/supabase-js";
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
 * ⚠ SI DIN 31.08.2026 NU MAI EXISTA NICIO POLITICA DE ADMIN SAU DE REDACTOR pe
 * tabelele de blog. Un cont autentificat vede prin REST exact ce vede un
 * vizitator: articolele publicate. Ciornele nu se mai pot citi decat cu cheia de
 * serviciu, adica doar prin actiunile de server.
 *
 * ⚠ CLIENTUL E TIPAT, din 30.08.2026. Tabelele si functiile de blog au intrat in
 * `database.types.ts`, deci `tsc` verifica numele coloanelor si al functiilor.
 * Pana atunci era turnat cu `as unknown as SupabaseClient`, ceea ce insemna ca un
 * nume de coloana gresit trecea de typecheck si cadea abia in trafic.
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
async function db() {
  return createPublicClient();
}

/**
 * Coloanele publice ale unui autor.
 *
 * ⚠ FARA `user_id`. Era `select("*")`, deci identificatorul contului Supabase
 * al omului pleca in fiecare pagina publica de autor si in fiecare articol. Nu e
 * o gaura prin care intra cineva — dar e un identificator intern de autentificare
 * dat pe degeaba, iar el nu are ce cauta la un cititor.
 *
 * ⚠ SE TINE IN ACORD CU GRANTUL PE COLOANE din migrarea
 * `blog_autorul_nu_isi_arata_contul`. Acolo lui `anon` i s-a scos SELECT pe
 * `user_id`; daca cineva pune `*` inapoi aici, interogarea nu intoarce mai mult,
 * CADE — si cade pagina de autor cu totul.
 */
const CAMPURI_AUTOR =
  "id, slug, name, role_title, bio, avatar_url, sameas, created_at, updated_at";
/** Articolul din listă: fără corpul HTML, care nu se citește acolo. */
export type ArticolDeLista = Pick<
  ArticolBlog,
  | "id" | "slug" | "title" | "excerpt" | "cover_url" | "cover_alt" | "published_at"
  | "content_updated_at" | "reading_minutes" | "is_featured" | "is_pinned" | "noindex"
> & {
  /* `content_updated_at` al taxonomiei: sitemapul are nevoie de el ca data
     paginii de rubrică sau de autor. Vezi nota de la `CAMPURI_LISTA`. */
  autor: Pick<AutorBlog, "name" | "slug" | "avatar_url" | "content_updated_at"> | null;
  categorie: Pick<CategorieBlog, "name" | "slug" | "content_updated_at"> | null;
};

const CAMPURI_LISTA =
  /*
    ⚠ `content_updated_at`, NU `updated_at`.

    Al doilea se mută la ORICE atingere administrativă: ridici alt articol în
    vitrină și triggerul îl coboară pe ăsta, îl fixezi, îl ascunzi de Google, îl
    arhivezi. Iar din el ieșeau trei lucruri care ajung la Google — eticheta
    „Actualizat", `dateModified` și `lastModified` din sitemap.

    Deci un articol pe care nimeni nu-l atinsese începea să spună „Actualizat
    azi" fiindcă altul fusese pus în vitrină. Vezi `blog_continut_atins()`.
  */
  /*
    ⚠ `canonical_url` E AICI PENTRU SITEMAP SI llms.txt (04.09.2026).

    Un articol republicat de pe alt site isi muta canonicalul acolo
    (`blog/[slug]/page.tsx`). Fara campul asta in lista, sitemapul si llms.txt
    l-ar fi anuntat ca adresa a noastra, in timp ce pagina spune „originalul e
    in alta parte" — chiar contradictia pe care Search Console o raporteaza.
    Azi niciun articol nu-l are completat, deci defectul e armat, nu pornit.
  */
  "id, slug, title, excerpt, cover_url, cover_alt, published_at, content_updated_at, reading_minutes, is_featured, is_pinned, noindex, canonical_url," +
  /*
    ⚠ SI `content_updated_at` AL TAXONOMIEI, de la 31.08.2026.

    Sitemapul lua data unei rubrici sau a unui autor NUMAI din articolele lor.
    Deci o descriere de rubrica sau o biografie schimbata nu ajungea niciodata la
    Google: pagina se schimba, `lastModified` ramanea la ultimul articol.

    Vine de aici, in aceeasi interogare, fiindca sitemapul citeste oricum
    articolele cu taxonomia legata — deci nu costa nicio cerere in plus.
  */
  " blog_authors(name, slug, avatar_url, content_updated_at)," +
  " blog_categories(name, slug, content_updated_at)";

/**
 * Conditiile care fac un articol vizibil public, puse pe orice interogare.
 *
 * Aceleasi trei ca in `blog_posts_public_read` si ca in `seVede()`. Al treilea
 * loc unde e scrisa regula, si dinadins: aici e singurul care nu depinde nici
 * de baza, nici de cine intreaba.
 */
const ACUM = () => new Date().toISOString();

/**
 * O eroare de la baza NU e „nu există".
 *
 * ⚠ TOATE CELE 23 DE CITIRI DE AICI IGNORAU `error`. Scriau `const { data } = …`
 * și mergeau mai departe cu `data ?? []` sau `if (!data) return null`. Adică
 * două lucruri cu totul diferite ieșeau la fel:
 *
 *   * articolul chiar nu există  → `data = null`, `error = null`  → 404, corect;
 *   * baza a avut o clipă proastă → `data = null`, `error = {…}`  → 404, GREȘIT.
 *
 * Al doilea e scump și tăcut. Google tratează 404 și 5xx cu totul diferit: pe
 * 404 înțelege „adresa asta nu mai există" și poate scoate pagina din index; pe
 * 5xx înțelege „serverul are o problemă acum" și revine mai târziu. Deci o pană
 * de câteva minute la bază putea, până acum, să ne coste articole din index.
 *
 * ⚠ IAR PE LISTE ERA ȘI MAI RĂU. `data ?? []` face dintr-o eroare o listă goală,
 * care arată exact ca „nu sunt articole". Sitemapul răspundea 200, valid, și fără
 * blog. Proiectul a mai trecut o dată prin asta — vezi nota din
 * `supabase/fetch-all.ts`: „sitemapul platformei a raspuns 200, valid, si gol,
 * doua saptamani. Nimeni n-a aflat, fiindca un raspuns partial arata exact ca
 * unul adevarat."
 *
 * ⚠ SE ARUNCĂ, NU SE ÎNTOARCE GOL. Aruncarea urcă până la Next, care răspunde
 * 500 — adică adevărul. O pagină care nu se poate desena trebuie să spună asta,
 * nu să pretindă că nu există.
 */
/**
 * ═══ ⚠ „PESTE ULTIMA PAGINĂ" NU E O EROARE (04.09.2026) ═══
 *
 * Cerută cu `count: "exact"`, o felie care începe după ultimul rând nu întoarce
 * o listă goală: PostgREST răspunde **416** cu `PGRST103` — „An offset of 12 was
 * requested, but there are only 1 rows." Măsurat pe bază, nu presupus.
 *
 * `cere()` aruncă dinadins pe ORICE eroare, deci fiecare listă a blogului
 * răspundea **500** la orice `?p=` dincolo de ultima pagină: `/blog?p=2`,
 * `/blog?p=999`, rubrică, autor, etichetă, căutare — verificat în producție,
 * inclusiv pentru Googlebot. Garda `paginaNuExista`, scrisă tocmai ca să dea
 * 404, stătea DUPĂ citirea care arunca și nu apuca să ruleze niciodată. Iar
 * comentariile din `Paginare.tsx` susțineau că `?p=999999` dă 404.
 *
 * Diferența costă: pe 404 Google închide discuția, pe 500 revine și numără
 * eroarea la sănătatea site-ului.
 *
 * ⚠ NUMAI codul ăsta se iartă, și numai el. Orice altă eroare urcă mai departe:
 * o pană a bazei tot 500 trebuie să dea, nu o listă goală care arată ca „nu
 * sunt articole" (vezi nota lui `cere`).
 */
const DUPA_ULTIMA_PAGINA = "PGRST103";

export function dupaUltimaPagina(error: { code?: string } | null | undefined): boolean {
  return error?.code === DUPA_ULTIMA_PAGINA;
}

/**
 * Ce întorc listele când pagina cerută e dincolo de ultima.
 *
 * `total: 0` nu se vede niciodată: fiecare pagină cheamă `paginaNuExista`, care
 * pentru orice pagină ≥ 2 cu total 0 dă `notFound()`. Iar pagina 1 NU poate
 * ajunge aici — offsetul 0 întoarce 200 cu listă goală chiar și pe o mulțime
 * goală (măsurat pe bază).
 */
/*
  ⚠ E O FUNCTIE, NU O CONSTANTA, si asta nu e o preferinta de stil.

  Scrisa ca obiect de modul, aceeasi referinta — si acelasi ARRAY gol — se
  intorcea din toate cele cinci citiri, la fiecare cerere din acelasi proces
  Node. Un singur apelant care ar sorta lista pe loc (`.sort()`, `.reverse()`,
  `.push()`) ar fi stricat-o pentru toate cererile urmatoare ale tuturor
  vizitatorilor, iar defectul ar fi aparut la ore dupa cauza si numai pe
  serverele care apucasera sa treaca prin acea ruta.

  Azi niciun apelant nu muta lista. Pretul unui obiect nou e nimic; pretul
  descoperirii, cand cineva ar adauga o sortare, ar fi o zi.
*/
function paginaInexistenta(): { articole: ArticolDeLista[]; total: number; pagini: number } {
  return { articole: [], total: 0, pagini: 1 };
}

function cere<T>(rezultat: { data: T; error: { message?: string } | null }, unde: string): T {
  if (rezultat.error) {
    throw new Error(
      `[blog] citirea publică „${unde}” a eșuat: ${rezultat.error.message ?? "eroare necunoscută"}. ` +
        "Se aruncă dinadins: un răspuns gol ar fi arătat ca „nu există”, iar Google " +
        "scoate din index paginile care dau 404.",
    );
  }
  return rezultat.data;
}


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
  const { data, error: e1 } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .order("published_at", { ascending: false })
    .limit(limita);
  cere({ data: null, error: e1 }, "articolePublicate");
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
  const { data: cat, error: e2 } = await client
    .from("blog_categories").select("id").eq("slug", slugCategorie).maybeSingle();
  cere({ data: null, error: e2 }, "articoleleCategoriei");
  if (!cat) return gol;

  const de_la = Math.max(0, (pagina - 1) * pePagina);
  const { data, count, error: e3 } = await client
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
  /* Pagina cerută e dincolo de ultima: 404, nu 500. Vezi `dupaUltimaPagina`. */
  if (dupaUltimaPagina(e3)) return paginaInexistenta();

  cere({ data: null, error: e3 }, "articoleleCategoriei");

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
  const { data, error: e4 } = await (await db())
    .from("blog_posts")
    /* ⚠ `blog_authors(*)` ar cere si `user_id`, pe care `anon` nu-l mai poate
       citi (vezi `CAMPURI_AUTOR`). Cu `*` interogarea n-ar intoarce mai putin, ar
       CADEA — si ar cadea pagina articolului cu totul. */
    .select(`*, blog_authors(${CAMPURI_AUTOR}), blog_categories(*)`)
    .eq("slug", slug)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .maybeSingle();
  cere({ data: null, error: e4 }, "articolDupaSlug");
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
  const { data, error: e5 } = await (await db())
    .from("blog_redirects").select("to_slug").eq("fel", fel).eq("from_slug", slug).maybeSingle();
  cere({ data: null, error: e5 }, "undeS_aMutat");
  return (data as { to_slug: string } | null)?.to_slug ?? null;
}

/** Categoriile, în ordinea aleasă din admin. */
export async function categoriiBlog(): Promise<CategorieBlog[]> {
  const { data, error: e6 } = await (await db())
    .from("blog_categories").select("*").order("sort_order").order("name");
  cere({ data: null, error: e6 }, "categoriiBlog");
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
    const { data, error: e7 } = await client
      .from("blog_posts")
      .select(CAMPURI_LISTA)
      .eq("category_id", articol.category_id)
      .neq("id", articol.id)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", ACUM())
      .order("published_at", { ascending: false })
      .limit(cate);
    cere({ data: null, error: e7 }, "articoleInrudite");
    gasite.push(...((data ?? []) as unknown as Record<string, unknown>[]).map(caLista));
  }

  if (gasite.length < cate) {
    const stiute = new Set([articol.id, ...gasite.map((a) => a.id)]);
    const { data, error: e8 } = await client
      .from("blog_posts")
      .select(CAMPURI_LISTA)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", ACUM())
      .order("published_at", { ascending: false })
      .limit(cate + stiute.size);
    cere({ data: null, error: e8 }, "articoleInrudite");
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
  const { data, error: e9 } = await (await db())
    .from("blog_authors").select(CAMPURI_AUTOR).eq("slug", slug).maybeSingle();
  cere({ data: null, error: e9 }, "autorDupaSlug");
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
  const { data, count, error: e10 } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA, { count: "exact" })
    .eq("author_id", idAutor)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);
  /* Pagina cerută e dincolo de ultima: 404, nu 500. Vezi `dupaUltimaPagina`. */
  if (dupaUltimaPagina(e10)) return paginaInexistenta();

  cere({ data: null, error: e10 }, "articoleleAutorului");

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
  const { data: articole, error: e11 } = await client
    .from("blog_posts").select("author_id").not("author_id", "is", null);
  cere({ data: null, error: e11 }, "autoriCuArticole");
  const idUri = [
    ...new Set(((articole ?? []) as { author_id: string }[]).map((a) => a.author_id)),
  ];
  if (idUri.length === 0) return [];
  const { data, error: e12 } = await client
    .from("blog_authors").select(CAMPURI_AUTOR).in("id", idUri).order("name");
  cere({ data: null, error: e12 }, "autoriCuArticole");
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
  const { data, error: e13 } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA)
    .eq("is_featured", true)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .maybeSingle();
  cere({ data: null, error: e13 }, "articolulDinVitrina");
  return data ? caLista(data as unknown as Record<string, unknown>) : null;
}

export type ArticolDeFeed = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
  content_updated_at: string | null;
  autor: string | null;
  categorie: string | null;
};

/**
 * Articolele pentru feedul RSS.
 *
 * ⚠ CITIRE PROPRIE, NU `paginaDeArticole`. Aceea ordonează `is_pinned` întâi,
 * ceea ce e bun pentru `/blog`: un ghid de pornire scris acum un an trebuie să
 * rămână sus. Într-un FEED e greșit — un feed e un flux cronologic, nu o copie
 * a așezării de pe pagină.
 *
 * Urmarea, pe feedul de dinainte: un articol fixat din ianuarie stătea primul,
 * iar cel de ieri al doilea. Iar `lastBuildDate` se lua din primul element, deci
 * putea fi mai VECHI decât alte articole din același feed — și un cititor care se
 * uită la data aceea crede că n-are ce prelua.
 *
 * ⚠ Sare și peste `noindex`: dacă i-am spus lui Google să nu-l indexeze, n-are
 * de ce să plece mai departe printr-un feed.
 */
export async function articolePentruFeed(cate = 30): Promise<ArticolDeFeed[]> {
  const { data, error: e14 } = await (await db()).rpc("blog_articole_pentru_feed", { p_cate: cate });
  cere({ data: null, error: e14 }, "articolePentruFeed");
  return (data ?? []) as ArticolDeFeed[];
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
  const { data, count, error: e15 } = await (await db())
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
  /* Pagina cerută e dincolo de ultima: 404, nu 500. Vezi `dupaUltimaPagina`. */
  if (dupaUltimaPagina(e15)) return paginaInexistenta();

  cere({ data: null, error: e15 }, "paginaDeArticole");

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
  const { data, count, error: e16 } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA, { count: "exact" })
    .ilike("cauta", `%${cautat}%`)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);
  /* Pagina cerută e dincolo de ultima: 404, nu 500. Vezi `dupaUltimaPagina`. */
  if (dupaUltimaPagina(e16)) return paginaInexistenta();

  cere({ data: null, error: e16 }, "cautaArticole");

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
  const { data, error: e17 } = await (await db())
    .from("blog_post_tags").select("blog_tags(slug, name)").eq("post_id", idArticol);
  cere({ data: null, error: e17 }, "eticheteArticol");
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => unul<EticheteBlogPublic>(r.blog_tags))
    .filter((e): e is EticheteBlogPublic => !!e)
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

/** O etichetă, după adresa ei. */
export async function eticheta(slug: string): Promise<EticheteBlogPublic | null> {
  const { data, error: e18 } = await (await db())
    .from("blog_tags").select("slug, name").eq("slug", slug).maybeSingle();
  cere({ data: null, error: e18 }, "eticheta");
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
  const { data, count, error: e19 } = await client
    .from("blog_posts")
    .select(`${CAMPURI_LISTA}, blog_post_tags!inner(blog_tags!inner(slug))`, { count: "exact" })
    .eq("blog_post_tags.blog_tags.slug", slugEticheta)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", ACUM())
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);
  /* Pagina cerută e dincolo de ultima: 404, nu 500. Vezi `dupaUltimaPagina`. */
  if (dupaUltimaPagina(e19)) return paginaInexistenta();

  cere({ data: null, error: e19 }, "articoleleEtichetei");

  const total = count ?? 0;
  return {
    articole: ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista),
    total,
    pagini: Math.max(1, Math.ceil(total / pePagina)),
  };
}

/*
  ⚠ AICI ERA `eticheteFolosite()`, ȘTEARSĂ PE 04.09.2026.

  Întorcea etichetele cu măcar un articol publicat, și o chema un singur loc:
  sitemapul. De când etichetele au primit `noindex, follow` și au ieșit din
  sitemap, funcția n-a mai avut niciun apelant. Lista de sub un articol vine din
  `eticheteArticol(idArticol)`, altă citire — nota ei veche spunea „și pentru
  lista de sub articole", și era deja neadevărată.

  ⚠ FUNCȚIA SQL `blog_etichete_folosite` RĂMÂNE ÎN BAZĂ, cu regula
  `canonical_url` pe ea. Nefolosită, dar corectă: ștergerea unui RPC e o
  migrație cu riscurile ei, iar cererea a fost despre index, nu despre schemă.
  Cine reia etichetele în sitemap are funcția gata, cu tot cu numărarea făcută
  în bază — motivul pentru care exista, vezi istoricul din git.
*/

export async function categoriiFolosite(): Promise<{ slug: string; name: string; cate: number }[]> {
  const { data, error: e21 } = await (await db()).rpc("blog_categorii_folosite");
  cere({ data: null, error: e21 }, "categoriiFolosite");
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
  const { data, error: e22 } = await (await db()).rpc("blog_subiectele_autorului", { p_autor: idAutor });
  cere({ data: null, error: e22 }, "subiecteleAutorului");
  return ((data ?? []) as { name: string }[]).map((r) => r.name).filter(Boolean);
}

/**
 * TOATE articolele publicate, luate în felii.
 *
 * ⚠ FOLOSEȘTE `fetchAllRowsStrict`, ȘI ASTA E TOT ROSTUL EI.
 *
 * Bucla scrisă de mână de dinainte avea două găuri, amândouă tăcute:
 *
 * 1. `.limit()` NU ADUCE CÂT CERI. PostgREST are propriul plafon de rânduri pe
 *    cerere (1000 la configurația obișnuită) și taie fără nicio eroare. De aceea
 *    se merge în felii — asta era deja bine.
 *
 * 2. Dar felia nu se uita la `error`. O cădere a bazei la PRIMA felie dădea
 *    `data = null` → `felie = []` → `length < FELIE` → `break`, iar funcția
 *    întorcea o listă goală care arată exact ca „nu există articole".
 *    Sitemapul răspundea 200, valid, și fără blog.
 *
 * Proiectul a mai trecut o dată prin asta, la altă masă: nota din
 * `supabase/fetch-all.ts` spune „sitemapul platformei a raspuns 200, valid, si
 * gol, doua saptamani. Nimeni n-a aflat, fiindca un raspuns partial arata exact
 * ca unul adevarat." Unealta scrisă atunci face exact ce trebuie aici: ori
 * citește tot, ori aruncă.
 *
 * ⚠ Și fereastra e acum 1000, nu 500. Unealta cere asta anume: o fereastră mai
 * mică decât plafonul face ca „am primit mai puțin decât am cerut" să nu mai
 * însemne sigur „s-au terminat".
 */
export async function toateArticolelePublicate(): Promise<ArticolDeLista[]> {
  const client = await db();
  const randuri = await fetchAllRowsStrict<Record<string, unknown>>(
    "blog.toateArticolelePublicate",
    (de_la, pana_la) =>
      client
        .from("blog_posts")
        .select(CAMPURI_LISTA)
        .eq("status", "published")
        .not("published_at", "is", null)
        .lte("published_at", ACUM())
        /* ⚠ Ordonare stabilă, cu `id` drept departajare: fără ea, două articole
           cu aceeași dată se pot muta între ferestre, iar unul s-ar pierde. */
        .order("published_at", { ascending: false })
        .order("id", { ascending: true })
        .range(de_la, pana_la) as unknown as PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: PostgrestError | null;
        }>,
  );
  return randuri.map(caLista);
}
