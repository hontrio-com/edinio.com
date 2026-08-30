import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
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
  return (await createClient()) as unknown as SupabaseClient;
}

/** Articolul din listă: fără corpul HTML, care nu se citește acolo. */
export type ArticolDeLista = Pick<
  ArticolBlog,
  "id" | "slug" | "title" | "excerpt" | "cover_url" | "cover_alt" | "published_at" | "reading_minutes" | "is_featured" | "noindex"
> & {
  autor: Pick<AutorBlog, "name" | "slug" | "avatar_url"> | null;
  categorie: Pick<CategorieBlog, "name" | "slug"> | null;
};

const CAMPURI_LISTA =
  "id, slug, title, excerpt, cover_url, cover_alt, published_at, reading_minutes, is_featured, noindex," +
  " blog_authors(name, slug, avatar_url), blog_categories(name, slug)";

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
    .order("published_at", { ascending: false })
    .limit(limita);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista);
}

/** Articolele unei categorii. */
export async function articoleleCategoriei(slugCategorie: string, limita = 50): Promise<ArticolDeLista[]> {
  const client = await db();
  const { data: cat } = await client
    .from("blog_categories").select("id").eq("slug", slugCategorie).maybeSingle();
  if (!cat) return [];
  const { data } = await client
    .from("blog_posts")
    .select(CAMPURI_LISTA)
    .eq("category_id", (cat as { id: string }).id)
    .order("published_at", { ascending: false })
    .limit(limita);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista);
}

export type ArticolIntreg = ArticolBlog & {
  autor: AutorBlog | null;
  categorie: CategorieBlog | null;
};

/** Un articol, cu autorul și categoria lui. `null` dacă nu se vede. */
export async function articolDupaSlug(slug: string): Promise<ArticolIntreg | null> {
  const { data } = await (await db())
    .from("blog_posts")
    .select("*, blog_authors(*), blog_categories(*)")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    ...(r as unknown as ArticolBlog),
    autor: unul<AutorBlog>(r.blog_authors),
    categorie: unul<CategorieBlog>(r.blog_categories),
  };
}

/**
 * Unde s-a mutat un articol care nu mai e la adresa cerută.
 *
 * ⚠ SE CAUTĂ DOAR CÂND ARTICOLUL NU E GĂSIT, adică pe drumul spre 404. Un
 * articol viu nu trece niciodată pe aici, deci tabela de redirectări nu costă
 * nimic la fiecare citire.
 */
export async function undeS_aMutat(slug: string): Promise<string | null> {
  const { data } = await (await db())
    .from("blog_redirects").select("to_slug").eq("from_slug", slug).maybeSingle();
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
      .order("published_at", { ascending: false })
      .limit(cate);
    gasite.push(...((data ?? []) as unknown as Record<string, unknown>[]).map(caLista));
  }

  if (gasite.length < cate) {
    const stiute = new Set([articol.id, ...gasite.map((a) => a.id)]);
    const { data } = await client
      .from("blog_posts")
      .select(CAMPURI_LISTA)
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

/** Articolele publicate ale unui autor. */
export async function articoleleAutorului(idAutor: string, limita = 50): Promise<ArticolDeLista[]> {
  const { data } = await (await db())
    .from("blog_posts")
    .select(CAMPURI_LISTA)
    .eq("author_id", idAutor)
    .order("published_at", { ascending: false })
    .limit(limita);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista);
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
 * scurt și textul articolului fără etichete, pliat de diacritice. Deci „livrare"
 * găsește și „livrări", iar „PLĂȚI" găsește „plati".
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
    .order("published_at", { ascending: false })
    .range(de_la, de_la + pePagina - 1);

  const total = count ?? 0;
  return {
    articole: ((data ?? []) as unknown as Record<string, unknown>[]).map(caLista),
    total,
    pagini: Math.max(1, Math.ceil(total / pePagina)),
  };
}
