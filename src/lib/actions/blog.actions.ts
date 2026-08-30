"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin-guard";
import { indemnDeAratat } from "@/lib/blog/indemn";
import {
  adreseBune,
  canonicaBuna,
  minuteDeCitit,
  seVede,
  slugDin,
  type ArticolBlog,
  type AutorBlog,
  type CategorieBlog,
  type IntrebareBlog,
  type StareArticol,
} from "@/lib/blog/types";

/**
 * Blogul, partea de administrare: autori si categorii.
 *
 * Tabelele nu sunt inca in tipurile generate ale bazei, deci merge pe un client
 * fara tipuri, exact ca `announcement.actions.ts`. Cand se regenereaza tipurile,
 * `blogDb()` e singurul loc de schimbat.
 *
 * ⚠ CLIENTUL DE SERVICIU SARE PESTE DREPTURILE PE RAND. De aceea fiecare
 * functie de aici incepe cu `requireAdminApi()`, fara exceptie. Regulile din
 * baza raman paza pentru citirea publica; aici paza e poarta asta.
 */
function blogDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

function reimprospateaza() {
  revalidatePath("/admin/blog");
  revalidatePath("/admin/blog/autori");
  revalidatePath("/admin/blog/categorii");
  /*
    ⚠ ȘI PAGINILE PUBLICE. Fără rândurile astea, un articol publicat din admin
    rămâne nevăzut pe site până la următoarea desfășurare: paginile sunt
    prerandate, iar prerandarea nu află singură că s-a schimbat baza.
  */
  revalidatePath("/blog");
  revalidatePath("/blog/[slug]", "page");
}

/**
 * Ce întoarce o acțiune.
 *
 * ⚠ DOUĂ TIPURI, NU UNUL CONDIȚIONAT. Prima formă era un singur tip generic cu
 * `T extends undefined ? ... : ...`, iar la apelant `res.date` ieșea `unknown`:
 * TypeScript nu poate desface un tip condiționat după o îngustare cu `in`. Două
 * nume simple se îngustează corect și se citesc mai ușor.
 */
type Raspuns = { error: string } | { success: true };
type RaspunsCu<T> = { error: string } | { success: true; date: T };

/**
 * Face un slug bun sau spune de ce nu poate.
 *
 * ⚠ BAZA RESPINGE SLUG-URILE STRAMBE PRINTR-UN `check`, iar un `check` picat
 * nu strica un camp, ci opreste INTREGUL rand sa existe. Daca as lasa un slug
 * gol sa ajunga acolo, omul ar primi „eroare la salvare" fara sa afle vreodata
 * ca de vina era numele scris doar din semne de punctuatie. Deci il prind aici,
 * unde pot sa-i spun ce s-a intamplat.
 */
function slugSauMotiv(dorit: string | null | undefined, dinNume: string): { slug: string } | { error: string } {
  const brut = (dorit ?? "").trim() || dinNume;
  const slug = slugDin(brut);
  if (!slug) {
    return { error: "Din numele acesta nu iese o adresa web. Scrie si cateva litere sau cifre." };
  }
  return { slug };
}

/** Mesaj omenesc pentru cele doua erori de baza pe care le poate produce omul. */
function traduEroare(error: { code?: string; message?: string } | null, ceEra: string): string {
  if (error?.code === "23505") return `Exista deja ${ceEra} cu aceasta adresa web. Alege alta.`;
  return "Nu s-a putut salva. Incearca din nou.";
}

// ── Autori ───────────────────────────────────────────────────────────────────

export async function listeazaAutori(): Promise<AutorBlog[]> {
  if (!(await requireAdminApi())) return [];
  const { data } = await blogDb().from("blog_authors").select("*").order("name");
  return (data ?? []) as AutorBlog[];
}

export type AutorInput = {
  name: string;
  slug?: string | null;
  role_title?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  sameas?: string[];
};

export async function creeazaAutor(intrare: AutorInput): Promise<RaspunsCu<{ id: string }>> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const nume = intrare.name?.trim();
  if (!nume) return { error: "Numele este obligatoriu." };

  const s = slugSauMotiv(intrare.slug, nume);
  if ("error" in s) return s;

  const { data, error } = await blogDb()
    .from("blog_authors")
    .insert({
      name: nume,
      slug: s.slug,
      role_title: intrare.role_title?.trim() || null,
      bio: intrare.bio?.trim() || null,
      avatar_url: intrare.avatar_url?.trim() || null,
      sameas: adreseBune(intrare.sameas),
    })
    .select("id")
    .single();

  if (error) return { error: traduEroare(error, "un autor") };
  reimprospateaza();
  return { success: true, date: { id: (data as { id: string }).id } };
}

export async function actualizeazaAutor(id: string, intrare: AutorInput): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const nume = intrare.name?.trim();
  if (!nume) return { error: "Numele este obligatoriu." };

  const s = slugSauMotiv(intrare.slug, nume);
  if ("error" in s) return s;

  const { error } = await blogDb()
    .from("blog_authors")
    .update({
      name: nume,
      slug: s.slug,
      role_title: intrare.role_title?.trim() || null,
      bio: intrare.bio?.trim() || null,
      avatar_url: intrare.avatar_url?.trim() || null,
      sameas: adreseBune(intrare.sameas),
    })
    .eq("id", id);

  if (error) return { error: traduEroare(error, "un autor") };
  reimprospateaza();
  return { success: true };
}

/**
 * Sterge un autor.
 *
 * Articolele lui NU se sterg: cheia straina e `on delete set null`, deci raman
 * publicate, fara autor. Asta e purtarea buna — un articol care se vede in
 * Google n-are de ce sa dispara fiindca a plecat cine l-a scris — dar omul
 * trebuie sa stie cate articole raman asa, de aceea le numar inainte.
 */
export async function stergeAutor(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const { error } = await blogDb().from("blog_authors").delete().eq("id", id);
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  reimprospateaza();
  return { success: true };
}

/** Cate articole ar ramane fara autor. Se cere INAINTE de stergere, pentru avertisment. */
export async function articoleAleAutorului(id: string): Promise<number> {
  if (!(await requireAdminApi())) return 0;
  const { count } = await blogDb()
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", id);
  return count ?? 0;
}

// ── Categorii ────────────────────────────────────────────────────────────────

export async function listeazaCategorii(): Promise<CategorieBlog[]> {
  if (!(await requireAdminApi())) return [];
  const { data } = await blogDb()
    .from("blog_categories")
    .select("*")
    .order("sort_order")
    .order("name");
  return (data ?? []) as CategorieBlog[];
}

export type CategorieInput = {
  name: string;
  slug?: string | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  sort_order?: number;
};

export async function creeazaCategorie(intrare: CategorieInput): Promise<RaspunsCu<{ id: string }>> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const nume = intrare.name?.trim();
  if (!nume) return { error: "Numele este obligatoriu." };

  const s = slugSauMotiv(intrare.slug, nume);
  if ("error" in s) return s;

  const { data, error } = await blogDb()
    .from("blog_categories")
    .insert({
      name: nume,
      slug: s.slug,
      description: intrare.description?.trim() || null,
      seo_title: intrare.seo_title?.trim() || null,
      seo_description: intrare.seo_description?.trim() || null,
      sort_order: intrare.sort_order ?? 0,
    })
    .select("id")
    .single();

  if (error) return { error: traduEroare(error, "o categorie") };
  reimprospateaza();
  return { success: true, date: { id: (data as { id: string }).id } };
}

export async function actualizeazaCategorie(id: string, intrare: CategorieInput): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const nume = intrare.name?.trim();
  if (!nume) return { error: "Numele este obligatoriu." };

  const s = slugSauMotiv(intrare.slug, nume);
  if ("error" in s) return s;

  const { error } = await blogDb()
    .from("blog_categories")
    .update({
      name: nume,
      slug: s.slug,
      description: intrare.description?.trim() || null,
      seo_title: intrare.seo_title?.trim() || null,
      seo_description: intrare.seo_description?.trim() || null,
      sort_order: intrare.sort_order ?? 0,
    })
    .eq("id", id);

  if (error) return { error: traduEroare(error, "o categorie") };
  reimprospateaza();
  return { success: true };
}

export async function stergeCategorie(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const { error } = await blogDb().from("blog_categories").delete().eq("id", id);
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  reimprospateaza();
  return { success: true };
}

/** Cate articole ar ramane fara categorie. */
export async function articoleAleCategoriei(id: string): Promise<number> {
  if (!(await requireAdminApi())) return 0;
  const { count } = await blogDb()
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  return count ?? 0;
}


/**
 * Pune etichetele pe un articol, facandu-le pe cele care nu exista.
 *
 * ⚠ SE INLOCUIESC, NU SE ADAUGA. Editorul trimite lista INTREAGA de etichete a
 * articolului, deci una scoasa din caseta trebuie sa dispara si din legaturi.
 * Adaugarea in loc de inlocuire ar fi facut ca o eticheta scoasa sa ramana pe
 * veci, iar omul ar fi crezut ca a scos-o.
 *
 * ⚠ ETICHETELE INSELE NU SE STERG cand raman fara articole. Una scrisa gresit
 * si corectata ar lasa in urma o eticheta orfana, e adevarat — dar stergerea
 * automata ar fi sters si una folosita de un articol aflat in ciorna, iar aceea
 * chiar e in uz. Curatenia lor e treaba ecranului de etichete, cu mana omului.
 */
async function puneEtichete(idArticol: string, nume: string[] | undefined): Promise<void> {
  if (nume === undefined) return; // editorul n-a trimis nimic: nu se atinge nimic

  const curate = [...new Set(
    nume.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 40),
  )].slice(0, 12);

  const db = blogDb();
  await db.from("blog_post_tags").delete().eq("post_id", idArticol);
  if (curate.length === 0) return;

  /* Fiecare eticheta are un slug, iar slugul e cheia unica. Doua nume care dau
     acelasi slug („eMAG" si „emag") sunt aceeasi eticheta, si asa si trebuie. */
  const randuri = curate
    .map((n) => ({ nume: n, slug: slugDin(n) }))
    .filter((e) => e.slug.length > 0);
  if (randuri.length === 0) return;

  const { error: eUpsert } = await db
    .from("blog_tags")
    .upsert(randuri.map((e) => ({ slug: e.slug, name: e.nume })), { onConflict: "slug", ignoreDuplicates: true });
  if (eUpsert) {
    console.error("[blog] etichetele nu s-au putut face", eUpsert);
    return;
  }

  const { data: gasite } = await db
    .from("blog_tags").select("id, slug").in("slug", randuri.map((e) => e.slug));

  const legaturi = ((gasite ?? []) as { id: string }[]).map((t) => ({
    post_id: idArticol,
    tag_id: t.id,
  }));
  if (legaturi.length > 0) {
    await db.from("blog_post_tags").insert(legaturi);
  }
}

/** Etichetele unui articol, pentru cand se deschide in editor. */
export async function eticheteleArticolului(idArticol: string): Promise<string[]> {
  if (!(await requireAdminApi())) return [];
  const { data } = await blogDb()
    .from("blog_post_tags").select("blog_tags(name)").eq("post_id", idArticol);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const t = Array.isArray(r.blog_tags) ? r.blog_tags[0] : r.blog_tags;
      return (t as { name?: string } | null)?.name ?? "";
    })
    .filter(Boolean)
    .sort();
}

/** Toate etichetele, cu numarul de articole pe fiecare. Pentru ecranul de admin. */
export async function listeazaEtichete(): Promise<{ id: string; slug: string; name: string; cate: number }[]> {
  if (!(await requireAdminApi())) return [];
  const db = blogDb();
  const [{ data: etichete }, { data: legaturi }] = await Promise.all([
    db.from("blog_tags").select("id, slug, name").order("name"),
    db.from("blog_post_tags").select("tag_id"),
  ]);
  const numar = new Map<string, number>();
  for (const l of (legaturi ?? []) as { tag_id: string }[]) {
    numar.set(l.tag_id, (numar.get(l.tag_id) ?? 0) + 1);
  }
  return ((etichete ?? []) as { id: string; slug: string; name: string }[])
    .map((e) => ({ ...e, cate: numar.get(e.id) ?? 0 }));
}

/**
 * Sterge o eticheta.
 *
 * Legaturile pica singure: cheia straina din `blog_post_tags` e
 * `on delete cascade`. Articolele raman neatinse.
 */
export async function stergeEticheta(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const { error } = await blogDb().from("blog_tags").delete().eq("id", id);
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  reimprospateaza();
  return { success: true };
}

// ── Articole ─────────────────────────────────────────────────────────────────

/** Rândul din lista de admin: articolul plus numele autorului și al categoriei. */
export type ArticolInLista = Pick<
  ArticolBlog,
  "id" | "slug" | "title" | "status" | "published_at" | "is_featured" | "is_pinned" | "views" | "reading_minutes" | "updated_at"
> & { autor: string | null; categorie: string | null };

export async function listeazaArticole(): Promise<ArticolInLista[]> {
  if (!(await requireAdminApi())) return [];
  const { data } = await blogDb()
    .from("blog_posts")
    .select("id, slug, title, status, published_at, is_featured, is_pinned, views, reading_minutes, updated_at, blog_authors(name), blog_categories(name)")
    .order("updated_at", { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    /* Supabase întoarce relația fie ca obiect, fie ca listă cu un element,
       după cum vede el cheia străină. Amândouă se citesc la fel de aici. */
    const unul = (v: unknown) => {
      const x = Array.isArray(v) ? v[0] : v;
      return (x as { name?: string } | null)?.name ?? null;
    };
    return {
      ...(r as unknown as ArticolInLista),
      autor: unul(r.blog_authors),
      categorie: unul(r.blog_categories),
    };
  });
}

export async function iaArticol(id: string): Promise<ArticolBlog | null> {
  if (!(await requireAdminApi())) return null;
  const { data } = await blogDb().from("blog_posts").select("*").eq("id", id).single();
  return (data as ArticolBlog) ?? null;
}

export type ArticolInput = {
  title: string;
  slug?: string | null;
  excerpt?: string | null;
  answer_summary?: string | null;
  content_html?: string;
  cover_url?: string | null;
  cover_alt?: string | null;
  og_image_url?: string | null;
  author_id?: string | null;
  category_id?: string | null;
  status?: StareArticol;
  published_at?: string | null;
  is_featured?: boolean;
  is_pinned?: boolean;
  cta?: unknown;
  faq?: IntrebareBlog[];
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  noindex?: boolean;
  /** Numele etichetelor, asa cum le-a scris omul. Se fac singure daca nu exista. */
  etichete?: string[];
};

/**
 * Curăță lista de întrebări.
 *
 * ⚠ O pereche pe jumătate scrisă NU pleacă în datele structurate. `FAQPage` cu
 * un răspuns gol e o declarație falsă către Google: promite un răspuns care nu
 * există. Mai bine o întrebare în minus decât o structură care minte.
 */
/**
 * Curăță îndemnul înainte de scriere.
 *
 * ⚠ ACEEAȘI REGULĂ CA LA AFIȘARE, aplicată mai devreme. `indemnDeAratat` aruncă
 * un „propriu" fără adresă sau fără etichetă; aici se aruncă înainte să intre în
 * bază, ca să nu rămână acolo un rând care arată a îndemn și nu e. Altfel omul
 * ar salva, ar reveni, ar vedea câmpurile pe jumătate completate și ar crede că
 * îndemnul e pus — când în pagină nu apare nimic.
 */
function indemnDeSalvat(brut: unknown): unknown {
  return indemnDeAratat(brut) ? brut : null;
}

function intrebariBune(intrari: IntrebareBlog[] | undefined): IntrebareBlog[] {
  return (intrari ?? [])
    .map((i) => ({ q: (i.q ?? "").trim(), a: (i.a ?? "").trim() }))
    .filter((i) => i.q.length > 0 && i.a.length > 0);
}

/** Câmpurile comune la creare și la actualizare. */
function randDinIntrare(intrare: ArticolInput, slug: string) {
  const html = intrare.content_html ?? "";
  return {
    title: intrare.title.trim(),
    slug,
    excerpt: intrare.excerpt?.trim() || null,
    answer_summary: intrare.answer_summary?.trim() || null,
    content_html: html,
    cover_url: intrare.cover_url?.trim() || null,
    cover_alt: intrare.cover_alt?.trim() || null,
    /* ⚠ NU SE ATINGE CAND EDITORUL NU-L TRIMITE. Campul n-are inca o casuta in
       editor, deci `intrare.og_image_url` e mereu `undefined`, iar scrierea
       neconditionata il punea pe `null` la FIECARE salvare. O valoare pusa
       vreodata din baza sau dintr-un import ar fi fost stearsa de prima salvare
       a unui om care nici nu stia ca exista campul. */
    ...(intrare.og_image_url !== undefined
      ? { og_image_url: intrare.og_image_url?.trim() || null }
      : {}),
    author_id: intrare.author_id || null,
    category_id: intrare.category_id || null,
    status: intrare.status ?? "draft",
    published_at: intrare.published_at || null,
    is_featured: intrare.is_featured ?? false,
    is_pinned: intrare.is_pinned ?? false,
    /* Îndemnul se curăță la scriere: un „propriu” pe jumătate scris n-are ce
       căuta în baza de date, fiindcă la afișare ar fi oricum aruncat. */
    cta: indemnDeSalvat(intrare.cta),
    faq: intrebariBune(intrare.faq),
    seo_title: intrare.seo_title?.trim() || null,
    seo_description: intrare.seo_description?.trim() || null,
    canonical_url: canonicaBuna(intrare.canonical_url),
    noindex: intrare.noindex ?? false,
    /* Socotit la salvare, nu la afișare: lista de articole n-are de ce să
       despice HTML-ul a douăzeci de articole ca să scrie un număr lângă fiecare. */
    reading_minutes: minuteDeCitit(html),
  };
}

/**
 * ⚠ PUBLICAT CERE O DATĂ, ALTFEL BAZA RESPINGE TOT RÂNDUL.
 *
 * `blog_posts_published_has_date` e un `check`, iar un `check` picat nu strică
 * un câmp, ci oprește ÎNTREAGA scriere. Fără asta, omul ar apăsa „Publică" și
 * ar primi „nu s-a putut salva", fără să afle vreodată că lipsea data.
 */
function dataLaPublicare(intrare: ArticolInput): string | null {
  if (intrare.status !== "published") return intrare.published_at || null;
  return intrare.published_at || new Date().toISOString();
}

export async function creeazaArticol(intrare: ArticolInput): Promise<RaspunsCu<{ id: string }>> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const titlu = intrare.title?.trim();
  if (!titlu) return { error: "Titlul este obligatoriu." };

  const s = slugSauMotiv(intrare.slug, titlu);
  if ("error" in s) return s;

  const { data, error } = await blogDb()
    .from("blog_posts")
    .insert({ ...randDinIntrare(intrare, s.slug), published_at: dataLaPublicare(intrare) })
    .select("id")
    .single();

  if (error) return { error: traduEroare(error, "un articol") };
  const idNou = (data as { id: string }).id;
  await puneEtichete(idNou, intrare.etichete);
  reimprospateaza();
  return { success: true, date: { id: idNou } };
}

export async function actualizeazaArticol(id: string, intrare: ArticolInput): Promise<Raspuns> {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Neautorizat" };
  const titlu = intrare.title?.trim();
  if (!titlu) return { error: "Titlul este obligatoriu." };

  const s = slugSauMotiv(intrare.slug, titlu);
  if ("error" in s) return s;

  const vechi = await iaArticol(id);
  if (!vechi) return { error: "Articolul nu mai există." };

  const { error } = await blogDb()
    .from("blog_posts")
    .update({ ...randDinIntrare(intrare, s.slug), published_at: dataLaPublicare(intrare) })
    .eq("id", id);

  if (error) return { error: traduEroare(error, "un articol") };

  /*
    ═══ SLUGUL SCHIMBAT LASĂ O REDIRECTARE ÎN URMĂ ═══

    ⚠ Doar dacă articolul A FOST vizibil. Un slug schimbat pe o ciornă n-a fost
    niciodată nicăieri: o redirectare de la el ar fi o adresă inventată, care nu
    duce decât la umplut tabela.

    Dar dacă articolul se vedea, adresa veche există deja în Google, în legături
    și în istoricul cuiva. Mutată fără redirectare, tot ce a strâns se pierde și
    rămâne un 404 pe care motoarele îl țin minte mult.

    Se scrie și se merge mai departe: un articol salvat cu redirectarea ratată e
    mai bun decât unul nesalvat. Eșecul se vede în jurnal.
  */
  if (vechi.slug !== s.slug && seVede(vechi)) {
    /*
      ⚠ SE STERGE INTAI REDIRECTAREA CARE PLEACA DE LA ADRESA NOUA.

      Fara asta se face o bucla: redenumesti `a` in `b` (deci `a → b`), te
      razgandesti si redenumesti inapoi `b` in `a` (deci `b → a`). Acum `/blog/a`
      trimite la `/blog/b`, care trimite la `/blog/a`, la nesfarsit. Browserul da
      „prea multe redirectari", Google la fel, si nu se poate desface decat din
      SQL — fiindca articolul insusi e in regula, doar drumul catre el nu.
    */
    await blogDb().from("blog_redirects").delete().eq("from_slug", s.slug);

    const { error: eRedirect } = await blogDb()
      .from("blog_redirects")
      .upsert({ from_slug: vechi.slug, to_slug: s.slug }, { onConflict: "from_slug" });
    if (eRedirect) {
      console.error("[blog] redirectare neputută la schimbarea slugului", vechi.slug, "->", s.slug, eRedirect);
    }
  }

  await puneEtichete(id, intrare.etichete);

  /* Versiunea de dinainte, păstrată. Se scrie DUPĂ salvare: dacă salvarea cade,
     n-are rost o versiune a unei schimbări care nu s-a întâmplat. */
  await blogDb().from("blog_post_revisions").insert({
    post_id: id,
    title: vechi.title,
    content_html: vechi.content_html,
    saved_by: admin.id,
  });

  reimprospateaza();
  return { success: true };
}

export async function stergeArticol(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };

  /* Redirectarile CATRE articolul sters raman fara tinta: ar fi trimis un
     vizitator de la o adresa veche catre un 404, ceea ce e mai rau decat 404-ul
     de la bun inceput — al doilea macar e cinstit de la prima cerere. */
  const articol = await iaArticol(id);
  if (articol) {
    await blogDb().from("blog_redirects").delete().eq("to_slug", articol.slug);
  }

  const { error } = await blogDb().from("blog_posts").delete().eq("id", id);
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  reimprospateaza();
  return { success: true };
}

// ── Istoricul versiunilor ────────────────────────────────────────────────────

/**
 * Câte versiuni se păstrează pentru un articol.
 *
 * ⚠ FĂRĂ PLAFON, ISTORICUL CREȘTE LA NESFÂRȘIT. Fiecare salvare scrie o copie a
 * întregului HTML. Un articol lung, rescris de cincizeci de ori, ar ajunge să
 * ocupe de cincizeci de ori cât el însuși, iar nimeni nu se uită vreodată la a
 * treizecea versiune de acum trei luni.
 *
 * Cincizeci acoperă cu mult o zi de scris intens, care e singurul moment în
 * care omul chiar vrea să se întoarcă.
 */
const VERSIUNI_PASTRATE = 50;

export type VersiuneInLista = {
  id: string;
  title: string | null;
  created_at: string;
  /** Câte caractere avea textul atunci. Ca să se vadă dintr-o privire ce s-a schimbat. */
  marime: number;
};

export async function listeazaVersiuni(idArticol: string): Promise<VersiuneInLista[]> {
  if (!(await requireAdminApi())) return [];
  const { data } = await blogDb()
    .from("blog_post_revisions")
    .select("id, title, content_html, created_at")
    .eq("post_id", idArticol)
    .order("created_at", { ascending: false })
    .limit(VERSIUNI_PASTRATE);

  return ((data ?? []) as { id: string; title: string | null; content_html: string | null; created_at: string }[])
    .map((v) => ({
      id: v.id,
      title: v.title,
      created_at: v.created_at,
      marime: (v.content_html ?? "").replace(/<[^>]+>/g, "").length,
    }));
}

/** Textul unei versiuni, pentru previzualizare. */
export async function iaVersiune(id: string): Promise<{ title: string | null; content_html: string | null } | null> {
  if (!(await requireAdminApi())) return null;
  const { data } = await blogDb()
    .from("blog_post_revisions").select("title, content_html").eq("id", id).maybeSingle();
  return (data as { title: string | null; content_html: string | null }) ?? null;
}

/**
 * Aduce înapoi o versiune veche.
 *
 * ⚠ NU SE PIERDE NIMIC. Revenirea trece prin aceeași cale ca o salvare
 * obișnuită, deci starea de ACUM se scrie ea însăși ca versiune înainte să fie
 * înlocuită. Cine revine din greșeală poate reveni înapoi.
 *
 * ⚠ SE ADUC DOAR TITLUL ȘI TEXTUL. Adresa web, starea, data publicării,
 * etichetele și câmpurile de SEO rămân cele de acum. Motivul: o versiune veche
 * a unui articol PUBLICAT i-ar fi adus înapoi și adresa veche, iar aceea e deja
 * în Google. Revenirea la un text nu trebuie să mute pagina.
 */
export async function revinoLaVersiune(idArticol: string, idVersiune: string): Promise<Raspuns> {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Neautorizat" };

  const [vechea, acum] = await Promise.all([iaVersiune(idVersiune), iaArticol(idArticol)]);
  if (!vechea) return { error: "Versiunea nu mai există." };
  if (!acum) return { error: "Articolul nu mai există." };

  const db = blogDb();

  /* Întâi se pune deoparte ce e acum, apoi se scrie ce era. În ordinea
     inversă, o cădere între cele două ar fi lăsat articolul schimbat și fără
     nicio urmă a stării dinainte. */
  const { error: eIstoric } = await db.from("blog_post_revisions").insert({
    post_id: idArticol,
    title: acum.title,
    content_html: acum.content_html,
    saved_by: admin.id,
  });
  if (eIstoric) return { error: "Nu s-a putut păstra versiunea de acum. Nu am schimbat nimic." };

  const html = vechea.content_html ?? "";
  const { error } = await db
    .from("blog_posts")
    .update({
      title: vechea.title ?? acum.title,
      content_html: html,
      reading_minutes: minuteDeCitit(html),
    })
    .eq("id", idArticol);

  if (error) return { error: "Nu s-a putut reveni. Încearcă din nou." };

  await taieIstoriculVechi(idArticol);
  reimprospateaza();
  return { success: true };
}

/**
 * Taie versiunile de peste plafon.
 *
 * ⚠ SE ȘTERG CELE MAI VECHI, nu cele mai mici. Un articol scurtat mult are
 * versiuni mici recente și una mare veche; ștergerea după mărime ar fi păstrat
 * tocmai ce nu trebuie.
 */
async function taieIstoriculVechi(idArticol: string): Promise<void> {
  const db = blogDb();
  const { data } = await db
    .from("blog_post_revisions")
    .select("id")
    .eq("post_id", idArticol)
    .order("created_at", { ascending: false })
    .range(VERSIUNI_PASTRATE, VERSIUNI_PASTRATE + 200);

  const deSters = ((data ?? []) as { id: string }[]).map((v) => v.id);
  if (deSters.length === 0) return;
  const { error } = await db.from("blog_post_revisions").delete().in("id", deSters);
  if (error) {
    /* Nu opreste salvarea: un istoric prea lung e o risipa, nu o stricaciune. */
    console.error("[blog] istoricul vechi n-a putut fi taiat", idArticol, error);
  }
}
