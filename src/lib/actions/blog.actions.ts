"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi, requireBlogEditorApi } from "@/lib/admin-guard";
import { indemnDeAratat } from "@/lib/blog/indemn";
import { adresaDeImagine } from "@/lib/blog/imagini";
import {
  adreseBune,
  canonicaBuna,
  minuteDeCitit,
  seVede,
  slugDin,
  SLUGURI_REZERVATE_BLOG,
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
 * ⚠ CLIENTUL DE SERVICIU SARE PESTE DREPTURILE PE RAND. De aceea fiecare functie
 * de aici incepe cu o paza, fara exceptie. Regulile din baza raman a doua plasa,
 * pentru cine ar ajunge la tabele pe alt drum; ce se intampla prin panou trece
 * pe aici.
 *
 * ⚠ DOUA PAZE, ALESE DUPA CE FACE FUNCTIA:
 *
 *   `requireBlogEditorApi()` — CONTINUT. Articolele, si citirea autorilor si a
 *     categoriilor (redactorul trebuie sa le poata alege din editor). Intoarce
 *     si rolul, fiindca marginea redactorului se pune in cod: vezi
 *     `poateLasaInStarea`.
 *
 *   `requireAdminApi()` — STRUCTURA. Autorii, categoriile si stergerea
 *     etichetelor. Un redactor scrie articole, nu hotaraste cine sunt autorii
 *     platformei sau cum se imparte blogul pe categorii.
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
  if (!(await requireBlogEditorApi())) return [];
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
  /**
   * Contul de pe platformă al persoanei, dacă are unul.
   *
   * ⚠ COLOANA EXISTA DE LA ÎNCEPUT ȘI NU O SCRIA NIMIC. Un câmp pe care nimeni
   * nu-l pune și nimeni nu-l citește nu e „pregătit pentru viitor", e o promisiune
   * pe care schema o face și codul n-o ține: următorul care o vede presupune că
   * e completată și construiește pe ea.
   *
   * Acum face ceva: un articol nou pornește cu autorul legat de contul celui
   * care scrie, în loc să-l pună pe om să-l aleagă din listă de fiecare dată — și
   * să poată alege, din neatenție, numele altcuiva.
   */
  user_id?: string | null;
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
      user_id: intrare.user_id || null,
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

  /*
    ⚠ SLUGUL ȘI REDIRECTAREA, ÎN ACEEAȘI TRANZACȚIE.

    Erau două cereri: întâi `update`, apoi redirectarea. Dacă a doua pica, adresa
    nouă era deja pe site iar cea veche dădea 404 pe loc — și acțiunea întorcea
    `success`, fiindcă prima izbutise. Un comentariu scris chiar aici spunea că
    asta e purtarea bună: „o redenumire salvată cu redirectarea ratată e mai bună
    decât una nesalvată".

    Nu e, pentru o pagină indexată. Acolo redirectarea nu e un lucru în plus, e
    jumătatea care păstrează ce a strâns pagina în ani. Ori amândouă, ori niciuna.
  */
  const { error } = await blogDb().rpc("blog_actualizeaza_taxonomia", {
    p_fel: "autor",
    p_id: id,
    p_rand: {
      name: nume,
      slug: s.slug,
      role_title: intrare.role_title?.trim() || null,
      bio: intrare.bio?.trim() || null,
      avatar_url: intrare.avatar_url?.trim() || null,
      sameas: adreseBune(intrare.sameas),
      user_id: intrare.user_id || null,
    },
  });

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
  /*
    ⚠ ȘI REDIRECTĂRILE PLEACĂ ODATĂ CU AUTORUL.

    Fără asta rămâneau adrese care duc către o pagină care nu mai există:
    `veche → nouă`, iar `nouă` tocmai a fost ștearsă. Un 404 după o săritură e
    mai rău decât unul direct — al doilea măcar e cinstit de la prima cerere.

    Funcția filtrează pe `fel`, deci un articol cu același slug istoric rămâne
    neatins.
  */
  const { data: aSters, error } = await blogDb().rpc("blog_sterge_taxonomia", {
    p_fel: "autor", p_id: id,
  });
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  if (aSters !== true) return { error: "Nu mai există." };

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
  if (!(await requireBlogEditorApi())) return [];
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

  /*
    ⚠ SLUGUL ȘI REDIRECTAREA, ÎN ACEEAȘI TRANZACȚIE.

    Erau două cereri: întâi `update`, apoi redirectarea. Dacă a doua pica, adresa
    nouă era deja pe site iar cea veche dădea 404 pe loc — și acțiunea întorcea
    `success`, fiindcă prima izbutise. Un comentariu scris chiar aici spunea că
    asta e purtarea bună: „o redenumire salvată cu redirectarea ratată e mai bună
    decât una nesalvată".

    Nu e, pentru o pagină indexată. Acolo redirectarea nu e un lucru în plus, e
    jumătatea care păstrează ce a strâns pagina în ani. Ori amândouă, ori niciuna.
  */
  const { error } = await blogDb().rpc("blog_actualizeaza_taxonomia", {
    p_fel: "categorie",
    p_id: id,
    p_rand: {
      name: nume,
      slug: s.slug,
      description: intrare.description?.trim() || null,
      seo_title: intrare.seo_title?.trim() || null,
      seo_description: intrare.seo_description?.trim() || null,
      sort_order: intrare.sort_order ?? 0,
    },
  });

  if (error) return { error: traduEroare(error, "o categorie") };
  reimprospateaza();
  return { success: true };
}
export async function stergeCategorie(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  /*
    ⚠ ȘI REDIRECTĂRILE PLEACĂ ODATĂ CU RUBRICA.

    Fără asta rămâneau adrese care duc către o pagină care nu mai există:
    `veche → nouă`, iar `nouă` tocmai a fost ștearsă. Un 404 după o săritură e
    mai rău decât unul direct — al doilea măcar e cinstit de la prima cerere.

    Funcția filtrează pe `fel`, deci un articol cu același slug istoric rămâne
    neatins.
  */
  const { data: aSters, error } = await blogDb().rpc("blog_sterge_taxonomia", {
    p_fel: "categorie", p_id: id,
  });
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  if (aSters !== true) return { error: "Nu mai există." };

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



/** Etichetele unui articol, pentru cand se deschide in editor. */
export async function eticheteleArticolului(idArticol: string): Promise<string[]> {
  if (!(await requireBlogEditorApi())) return [];
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

/**
 * Are voie rolul asta sa lase articolul in starea asta?
 *
 * ⚠ AICI E MARGINEA ADEVARATA A REDACTORULUI, nu in regulile din baza.
 * Actiunile folosesc cheia de serviciu, care sare peste drepturile pe rand;
 * regulile de acolo sunt a doua plasa, pentru cine ar ajunge la tabele pe alt
 * drum. Ce se intampla prin panou trece pe aici.
 *
 * Un redactor poate scrie si trimite la verificare. Publicarea si arhivarea
 * raman ale adminului: sunt hotarari despre ce vede lumea, nu despre text.
 */
function poateLasaInStarea(rol: "admin" | "editor", stare: StareArticol): boolean {
  if (rol === "admin") return true;
  return stare === "draft" || stare === "review";
}

const NU_AI_VOIE_SA_PUBLICI =
  "Nu poți publica singur. Trimite articolul la verificare, iar un administrator îl publică.";

// ── Articole ─────────────────────────────────────────────────────────────────

/** Rândul din lista de admin: articolul plus numele autorului și al categoriei. */
export type ArticolInLista = Pick<
  ArticolBlog,
  "id" | "slug" | "title" | "status" | "published_at" | "is_featured" | "is_pinned" | "reading_minutes" | "updated_at"
> & {
  autor: string | null;
  categorie: string | null;
  /** Din `blog_post_stats`, nu de pe rândul articolului. Vezi nota din `types.ts`. */
  views: number;
};

export async function listeazaArticole(): Promise<ArticolInLista[]> {
  if (!(await requireBlogEditorApi())) return [];
  const { data } = await blogDb()
    .from("blog_posts")
    .select("id, slug, title, status, published_at, is_featured, is_pinned, reading_minutes, updated_at, blog_authors(name), blog_categories(name), blog_post_stats(views)")
    .order("updated_at", { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    /* Supabase întoarce relația fie ca obiect, fie ca listă cu un element,
       după cum vede el cheia străină. Amândouă se citesc la fel de aici. */
    const unul = (v: unknown) => {
      const x = Array.isArray(v) ? v[0] : v;
      return (x as { name?: string } | null)?.name ?? null;
    };
    /* Un articol necitit încă n-are rând în `blog_post_stats`: rândul se face la
       prima vizită. Lipsa lui înseamnă zero, nu o eroare. */
    const cateCitiri = (v: unknown): number => {
      const x = Array.isArray(v) ? v[0] : v;
      return (x as { views?: number } | null)?.views ?? 0;
    };
    return {
      ...(r as unknown as ArticolInLista),
      autor: unul(r.blog_authors),
      categorie: unul(r.blog_categories),
      views: cateCitiri(r.blog_post_stats),
    };
  });
}

export async function iaArticol(id: string): Promise<ArticolBlog | null> {
  if (!(await requireBlogEditorApi())) return null;
  const { data } = await blogDb().from("blog_posts").select("*").eq("id", id).single();
  return (data as ArticolBlog) ?? null;
}

/**
 * Articolul pentru PREVIZUALIZARE, cu autorul si rubrica lui.
 *
 * ⚠ TRECE PESTE FILTRELE DE VIZIBILITATE, SI DE ACEEA ARE PAZA IN PRIMA LINIE.
 *
 * Toate celelalte citiri de articole din site refuza ce nu e `published` cu data
 * trecuta — asta e tocmai ce le face sigure. Aceasta nu refuza nimic, fiindca
 * rostul ei e sa arate o CIORNA. Deci singurul lucru care sta intre o ciorna si
 * lumea intreaga e `requireBlogEditorApi()` de mai jos. Nu se scoate, nu se muta
 * mai jos, si nu se cheama functia asta din nicio pagina publica.
 */
export async function articolDePrevizualizat(id: string): Promise<ArticolPrevizualizat | null> {
  if (!(await requireBlogEditorApi())) return null;
  const { data } = await blogDb()
    .from("blog_posts")
    .select("*, blog_authors(*), blog_categories(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const unul = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null);
  return {
    ...(r as unknown as ArticolBlog),
    autor: unul<AutorBlog>(r.blog_authors),
    categorie: unul<CategorieBlog>(r.blog_categories),
  };
}

export type ArticolPrevizualizat = ArticolBlog & {
  autor: AutorBlog | null;
  categorie: CategorieBlog | null;
};

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
  /**
   * Versiunea de la care a plecat cel care editeaza.
   *
   * ⚠ FARA EA, ULTIMA SCRIERE CASTIGA IN TACERE. Doua file deschise pe acelasi
   * articol, sau doi redactori: A salveaza, B salveaza peste, si nimeni nu afla
   * nimic. Trimisa, baza refuza scrierea lui B cu `P0409` daca articolul s-a
   * schimbat intre timp.
   *
   * `undefined` sare peste verificare — dinadins, pentru unelte si reparatii.
   * Editorul o trimite mereu.
   */
  edit_version?: number | null;
  /**
   * Salvare automata: nu scrie versiune in istoric.
   *
   * Bate la 30 de secunde. Cu o revizie de fiecare data, cele 50 de sloturi se
   * umplu in 25 de minute de scris, iar istoricul ajunge sa contina numai
   * variante aproape identice din ultima jumatate de ora.
   */
  tacut?: boolean;
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

/**
 * Cât de lung are voie să fie fiecare câmp.
 *
 * ⚠ VERIFICAREA DIN EDITOR NU E O VERIFICARE.
 *
 * Ecranul are `maxLength` pe casete, dar `maxLength` e o purtare a browserului,
 * nu o regulă: acțiunea de server e o adresă POST pe care oricine o poate chema
 * direct, cu ce vrea în ea (vezi ghidul Next, „Treat every action as an
 * untrusted entry point"). Fără rândurile de mai jos, un `content_html` de
 * cincizeci de megaocteți intra în baza de date, iar de acolo în fiecare
 * randare a paginii și în fiecare versiune din istoric.
 *
 * ⚠ NUMERELE SUNT LARGI DINADINS. Nu sunt reguli de redacție — un articol lung
 * și bun nu trebuie oprit de aici. Sunt marginea de dincolo de care valoarea nu
 * mai poate fi ceva scris de un om.
 */
const LIMITE = {
  title: 200,
  slug: 80,
  excerpt: 500,
  answer_summary: 1200,
  content_html: 400_000,
  cover_url: 2048,
  cover_alt: 300,
  og_image_url: 2048,
  seo_title: 200,
  seo_description: 500,
  canonical_url: 2048,
  intrebare: 300,
  raspuns: 2000,
  eticheta: 40,
} as const;

const NUME_OMENESC: Record<string, string> = {
  title: "Titlul",
  slug: "Adresa",
  excerpt: "Rezumatul",
  answer_summary: "Răspunsul scurt",
  content_html: "Textul articolului",
  cover_url: "Adresa copertei",
  cover_alt: "Textul copertei",
  og_image_url: "Imaginea de partajare",
  seo_title: "Titlul SEO",
  seo_description: "Descrierea SEO",
  canonical_url: "Adresa canonică",
};

/**
 * Trece intrarea de plafoane?
 *
 * ⚠ SPUNE CARE CÂMP ȘI CU CÂT. Un „datele nu sunt valide" l-ar lăsa pe om să
 * caute singur, într-un formular cu douăzeci de casete, care dintre ele e prea
 * lungă — și n-ar afla niciodată, fiindcă nimic nu i-ar arăta numărul.
 */
function preaLung(intrare: ArticolInput): string | null {
  const perechi: [keyof typeof LIMITE, string | null | undefined][] = [
    ["title", intrare.title],
    ["slug", intrare.slug],
    ["excerpt", intrare.excerpt],
    ["answer_summary", intrare.answer_summary],
    ["content_html", intrare.content_html],
    ["cover_url", intrare.cover_url],
    ["cover_alt", intrare.cover_alt],
    ["og_image_url", intrare.og_image_url],
    ["seo_title", intrare.seo_title],
    ["seo_description", intrare.seo_description],
    ["canonical_url", intrare.canonical_url],
  ];
  for (const [camp, valoare] of perechi) {
    const n = (valoare ?? "").length;
    if (n > LIMITE[camp]) {
      return `${NUME_OMENESC[camp] ?? camp} are ${n} de caractere, iar maximul e ${LIMITE[camp]}.`;
    }
  }

  /* Întrebările frecvente: și câte, și cât de lungi. Zece e cu mult peste ce se
     citește vreodată dintr-un articol, și peste ce arată Google. */
  const faq = intrare.faq ?? [];
  if (faq.length > 10) return "Sunt prea multe întrebări frecvente. Maximul e 10.";
  for (const i of faq) {
    if ((i.q ?? "").length > LIMITE.intrebare) return `O întrebare e mai lungă de ${LIMITE.intrebare} de caractere.`;
    if ((i.a ?? "").length > LIMITE.raspuns) return `Un răspuns e mai lung de ${LIMITE.raspuns} de caractere.`;
  }

  /* Etichetele se tăiau tăcut la 12 bucăți și 40 de caractere, fără să spună.
     Tăcerea aia era o problemă în sine: omul scria cincisprezece etichete,
     apăsa salvează, și trei dispăreau fără ca nimic să spună de ce. Tăierea a
     rămas (în `etichetePentruBaza`), dar acum se dă și un motiv. */
  const etichete = intrare.etichete ?? [];
  if (etichete.length > 12) return "Sunt prea multe etichete. Maximul e 12.";
  if (etichete.some((e) => (e ?? "").trim().length > LIMITE.eticheta)) {
    return `O etichetă e mai lungă de ${LIMITE.eticheta} de caractere.`;
  }

  /*
    Gazdele copertei și ale imaginii de partajare. Vezi `blog/imagini.ts`, unde
    stă și motivul pentru care regula e mai strictă decât cea din `r2-url.ts`.
  */
  for (const [camp, valoare] of [
    ["Adresa copertei", intrare.cover_url],
    ["Imaginea de partajare", intrare.og_image_url],
  ] as const) {
    const r = adresaDeImagine(valoare, camp);
    if (!r.ok) return r.motiv;
  }

  return null;
}

/**
 * Etichetele, pregătite pentru baza de date.
 *
 * ⚠ SLUGUL SE FACE AICI, NU ÎN SQL. `slugDin` e singura regulă de slugit din tot
 * blogul. Rescrisă și în funcția din bază, cele două s-ar fi despărțit tăcut la
 * prima diacritică tratată altfel: aceeași etichetă ar fi ajuns două rânduri, și
 * nimic n-ar fi dat eroare.
 *
 * `undefined` înseamnă „editorul n-a trimis etichete" și iese `null`, pe care
 * baza îl citește ca „nu atinge nimic". Un tablou gol înseamnă „le-a scos pe
 * toate", și e altceva.
 */
function etichetePentruBaza(etichete: string[] | undefined) {
  if (etichete === undefined) return null;
  return [
    ...new Map(
      etichete
        .map((n) => (n ?? "").trim())
        .filter((n) => n.length > 0)
        .map((n) => [slugDin(n), { slug: slugDin(n), name: n }] as const)
        .filter(([slug]) => slug.length > 0),
    ).values(),
  ].slice(0, 12);
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
    /* ⚠ NU SE ATINGE CAND CEL CARE CHEAMA NU-L TRIMITE.
       Din 30.08.2026 editorul are casuta lui, deci pe drumul obisnuit campul
       vine mereu. Ramura asta ramane pentru celelalte drumuri — un import, o
       reparatie facuta cu SQL, un apel viitor care nu stie de camp: scrierea
       neconditionata l-ar pune pe `null` la fiecare salvare, si o valoare pusa
       de altcineva ar fi stearsa fara ca nimeni sa observe. */
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

/**
 * Autorul legat de contul celui care scrie acum, dacă există unul.
 *
 * ⚠ E O PROPUNERE, NU O REGULĂ. Se folosește doar când editorul n-a ales
 * niciunul. Un admin care scrie în numele altcuiva — se întâmplă — tot poate
 * alege pe cine vrea.
 */
async function autorulMeu(idCont: string): Promise<string | null> {
  const { data } = await blogDb()
    .from("blog_authors").select("id").eq("user_id", idCont).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function creeazaArticol(intrare: ArticolInput): Promise<RaspunsCu<{ id: string }>> {
  const cine = await requireBlogEditorApi();
  if (!cine) return { error: "Neautorizat" };
  if (!poateLasaInStarea(cine.rol, intrare.status ?? "draft")) {
    return { error: NU_AI_VOIE_SA_PUBLICI };
  }
  const titlu = intrare.title?.trim();
  if (!titlu) return { error: "Titlul este obligatoriu." };

  const capat = preaLung(intrare);
  if (capat) return { error: capat };

  const s = slugSauMotiv(intrare.slug, titlu);
  if ("error" in s) return s;
  /* ⚠ Doar articolele au adrese rezervate: ele stau chiar sub `/blog/`, unde
     sunt și rutele. Categoriile și autorii stau sub prefixele lor, deci nu se
     pot ciocni cu nimic. Vezi `SLUGURI_REZERVATE_BLOG`. */
  if (SLUGURI_REZERVATE_BLOG.has(s.slug)) {
    return { error: `Adresa „${s.slug}" e folosită de o pagină a blogului. Alege alta.` };
  }

  /* Dacă n-a ales un autor, se pune cel legat de contul lui. Vezi `autorulMeu`. */
  const rand = randDinIntrare(intrare, s.slug);
  if (!rand.author_id) rand.author_id = await autorulMeu(cine.id);

  /*
    ⚠ TOT ÎNTR-O TRANZACȚIE, ca și salvarea.

    Erau două cereri: `insert blog_posts`, apoi un ajutor separat care scria
    etichetele — și care nici măcar nu se uita la eroarea de la inserarea
    legăturilor (l-am scos odată cu reparația).
    Deci: articol creat, etichete nescrise, ecranul spune „Articol creat" — și
    articolul nu apare în niciuna dintre rubricile pentru care omul le-a scris.
    Nimic nu dădea vreo eroare, fiindcă prima cerere chiar izbutise.
  */
  const { data, error } = await blogDb().rpc("blog_creeaza_articol", {
    p_rand: { ...rand, published_at: dataLaPublicare(intrare) },
    p_etichete: etichetePentruBaza(intrare.etichete),
  });

  if (error) return { error: traduEroare(error, "un articol") };
  const primul = Array.isArray(data) ? data[0] : data;
  const idNou = (primul as { id: string } | null)?.id;
  if (!idNou) return { error: "Nu am putut crea articolul. Încearcă din nou." };

  reimprospateaza();
  return { success: true, date: { id: idNou } };
}

export async function actualizeazaArticol(
  id: string,
  intrare: ArticolInput,
): Promise<RaspunsCu<{ edit_version: number }>> {
  const admin = await requireBlogEditorApi();
  if (!admin) return { error: "Neautorizat" };
  if (!poateLasaInStarea(admin.rol, intrare.status ?? "draft")) {
    return { error: NU_AI_VOIE_SA_PUBLICI };
  }
  const titlu = intrare.title?.trim();
  if (!titlu) return { error: "Titlul este obligatoriu." };

  const capat = preaLung(intrare);
  if (capat) return { error: capat };

  const s = slugSauMotiv(intrare.slug, titlu);
  if ("error" in s) return s;
  /* ⚠ Doar articolele au adrese rezervate: ele stau chiar sub `/blog/`, unde
     sunt și rutele. Categoriile și autorii stau sub prefixele lor, deci nu se
     pot ciocni cu nimic. Vezi `SLUGURI_REZERVATE_BLOG`. */
  if (SLUGURI_REZERVATE_BLOG.has(s.slug)) {
    return { error: `Adresa „${s.slug}" e folosită de o pagină a blogului. Alege alta.` };
  }

  const vechi = await iaArticol(id);
  if (!vechi) return { error: "Articolul nu mai există." };

  /* ⚠ SI STAREA DE DINAINTE CONTEAZA. Fara randul asta, un redactor putea lua
     un articol PUBLICAT si sa-l salveze ca ciorna — adica sa-l scoata de pe
     site. Marginea nu e doar „ce lasi in urma", e si „de ce te atingi". */
  if (!poateLasaInStarea(admin.rol, vechi.status)) {
    return { error: "Articolul e publicat. Doar un administrator îl mai poate schimba." };
  }

  /*
    ═══ TOATĂ SALVAREA, ÎNTR-O SINGURĂ TRANZACȚIE ═══

    Aici erau cinci cereri pe rând: rândul articolului, ștergerea redirectării
    inverse, scrierea redirectării noi, refacerea etichetelor, scrierea
    versiunii. Fiecare izbutea sau cădea singură, iar o cădere la mijloc lăsa în
    urmă lucruri care nu dădeau nicio eroare vizibilă:

      - slug schimbat, redirectare nescrisă → adresa veche dă 404, și tot ce
        strânsese articolul în Google se pierde;
      - articol salvat, etichete nescrise → dispare din rubricile lui de pe site;
      - articol salvat, versiune nescrisă → istoricul minte despre ce a fost.

    Ecranul spunea „salvat" în toate cazurile, fiindcă PRIMA cerere chiar
    izbutise.

    PostgREST rulează o funcție într-o singură tranzacție. Deci ori toate, ori
    niciuna. Vezi `2026-08-30_blog_salvare_tranzactionala.sql`.

    ⚠ SLUGUL ETICHETEI SE FACE AICI, NU ÎN SQL. `slugDin` e singura regulă de
    slugit din tot blogul. Rescrisă și în funcție, cele două s-ar fi despărțit
    tăcut la prima diacritică tratată altfel — aceeași capcană ca la
    `pliaza` / `fara_diacritice`.
  */
  /*
    ⚠ FUNCȚIA ÎȘI CITEȘTE SINGURĂ STAREA VECHE, SUB LACĂT.

    Îi trimiteam `p_slug_vechi`, `p_titlu_vechi`, `p_html_vechi` și hotărârea
    `p_lasa_redirect` — toate dintr-o citire făcută cu o clipă mai devreme, în
    altă tranzacție. Între acea citire și scriere se putea schimba orice: revizia
    ar fi păstrat un text care nu mai era cel de dinainte.

    ⚠ ȘI VERSIUNEA. Două file deschise pe același articol: A salvează, B salvează
    peste, și nimeni nu află nimic. Acum B primește `P0409` și i se spune ce s-a
    întâmplat.
  */
  const { data: versiuneNoua, error } = await blogDb().rpc("blog_salveaza_articol", {
    p_id: id,
    p_rand: { ...randDinIntrare(intrare, s.slug), published_at: dataLaPublicare(intrare) },
    p_etichete: etichetePentruBaza(intrare.etichete),
    p_salvat_de: admin.id,
    p_versiuni: VERSIUNI_PASTRATE,
    p_versiune_asteptata: intrare.edit_version ?? null,
    /*
      ⚠ Salvarea automată NU scrie versiune în istoric.

      Bate la 30 de secunde; cu o revizie de fiecare dată, cele 50 de sloturi se
      umplu în 25 de minute de scris, iar istoricul ajunge să conțină numai
      variante aproape identice din ultima jumătate de oră — adică exact ce nu
      caută nimeni când îl deschide.
    */
    p_creeaza_versiune: intrare.tacut !== true,
  });

  /*
    ⚠ Codul `P0409` e ridicat anume de funcție când versiunile nu se potrivesc.
    Mesajul trebuie să spună ce s-a întâmplat ȘI ce are omul de făcut, altfel
    „conflict" îl lasă să apese Salvează la nesfârșit.
  */
  if (error && (error as { code?: string }).code === "P0409") {
    return {
      error:
        "Articolul a fost modificat între timp — în altă filă sau de alt redactor. " +
        "Deschide-l din nou ca să vezi ce e acum acolo; ce ai scris aici nu s-a pierdut, " +
        "e păstrat în ciorna locală din browser.",
    };
  }
  if (error) return { error: traduEroare(error, "un articol") };

  reimprospateaza();
  return { success: true, date: { edit_version: Number(versiuneNoua ?? 0) } };
}

export async function stergeArticol(id: string): Promise<Raspuns> {
  const cine = await requireBlogEditorApi();
  if (!cine) return { error: "Neautorizat" };

  /* Redirectarile CATRE articolul sters raman fara tinta: ar fi trimis un
     vizitator de la o adresa veche catre un 404, ceea ce e mai rau decat 404-ul
     de la bun inceput — al doilea macar e cinstit de la prima cerere. */
  const articol = await iaArticol(id);

  /* Un redactor sterge doar ciorne. Una „la verificare" e deja in fata cuiva
     si ar disparea de sub ochii lui; una publicata e pe site. */
  if (articol && cine.rol === "editor" && articol.status !== "draft") {
    return { error: "Poți șterge doar ciorne. Cere unui administrator." };
  }

  /*
    ⚠ ȘI ȘTERGEREA E O SINGURĂ TRANZACȚIE.

    Erau două cereri, iar prima nici nu era verificată:
      * redirectări șterse, articol neșters → articolul rămâne, dar istoricul lui
        de adrese a fost distrus;
      * redirectări neșterse, articol șters → adresele vechi trimit către un slug
        care acum dă 404, adică o redirectare care duce într-un zid. Un 404 după o
        săritură e mai rău decât unul direct: al doilea măcar e cinstit de la
        prima cerere.

    Funcția filtrează și pe `fel`, deci o rubrică cu același slug istoric rămâne
    neatinsă.
  */
  const { data: aSters, error } = await blogDb().rpc("blog_sterge_articol", { p_id: id });
  if (error) return { error: "Nu s-a putut sterge. Incearca din nou." };
  if (aSters !== true) return { error: "Articolul nu mai există." };

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
/* ⚠ Taierea se face IN BAZA, in `blog_salveaza_articol`, nu aici. A fost o
   vreme o functie separata chemata doar din `revinoLaVersiune` — adica exact
   din locul in care nu se aduna nimic. */
const VERSIUNI_PASTRATE = 50;

export type VersiuneInLista = {
  id: string;
  title: string | null;
  created_at: string;
  /** Câte caractere avea textul atunci. Ca să se vadă dintr-o privire ce s-a schimbat. */
  marime: number;
};

/*
  ═══ CINE VEDE ISTORICUL SI CINE POATE REVENI ═══

  Regula, scrisa o data si tinuta in trei locuri:

    REDACTOR  vede istoricul oricarui articol, si poate reveni la o versiune
              DOAR pe un articol in ciorna sau la verificare.
    ADMIN     vede si revine oriunde.

  ⚠ CELE TREI LOCURI TREBUIE SA SPUNA ACELASI LUCRU. Pana pe 30.08.2026 nu
  spuneau: RLS-ul ii ingaduia redactorului sa CITEASCA reviziile, actiunile de
  aici cereau admin, iar butonul „Istoric" din editor se arata tuturor. Deci
  redactorul apasa, se deschidea panoul, si lista iesea GOALA — nu „n-ai voie",
  ci „nu exista nimic". Doua minciuni intr-una: ii spunea ca articolul lui n-are
  istoric, si ii ascundea ca de fapt usa e incuiata.
*/
export async function listeazaVersiuni(idArticol: string): Promise<VersiuneInLista[]> {
  if (!(await requireBlogEditorApi())) return [];
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
  if (!(await requireBlogEditorApi())) return null;
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
  const cine = await requireBlogEditorApi();
  if (!cine) return { error: "Neautorizat" };

  const [vechea, acum] = await Promise.all([iaVersiune(idVersiune), iaArticol(idArticol)]);
  if (!vechea) return { error: "Versiunea nu mai există." };
  if (!acum) return { error: "Articolul nu mai există." };

  /* Aceeași margine ca la salvare: un redactor nu atinge un articol publicat.
     Vezi `poateLasaInStarea` și nota de deasupra lui `listeazaVersiuni`. */
  if (!poateLasaInStarea(cine.rol, acum.status)) {
    return { error: "Articolul e publicat. Doar un administrator poate reveni la o versiune." };
  }

  /*
    ⚠ PRIN ACEEAȘI FUNCȚIE CA SALVAREA, nu cu două cereri.

    Erau două: întâi se punea deoparte ce e acum, apoi se scria ce era. Ordinea
    era gândită bine — o cădere între ele lăsa articolul neatins — dar tot rămânea
    o fereastră: revizia scrisă, articolul nu. Iar istoricul se tăia abia după,
    într-o a treia cerere.

    Funcția face totul sub lacăt: pune deoparte starea de acum (`p_creeaza_versiune`),
    scrie ce era, taie istoricul. Ori tot, ori nimic.
  */
  const html = vechea.content_html ?? "";
  const { error } = await blogDb().rpc("blog_salveaza_articol", {
    p_id: idArticol,
    p_rand: {
      title: vechea.title ?? acum.title,
      content_html: html,
      reading_minutes: minuteDeCitit(html),
    },
    /* `null`: revenirea nu atinge etichetele. Ele n-au fost niciodată păstrate
       în istoric, deci n-avem la ce să le întoarcem. */
    p_etichete: null,
    p_salvat_de: cine.id,
    p_versiuni: VERSIUNI_PASTRATE,
    /* Fără verificare de versiune: omul tocmai a citit lista și a ales din ea. */
    p_versiune_asteptata: null,
    p_creeaza_versiune: true,
  });

  if (error) return { error: "Nu s-a putut reveni. Încearcă din nou." };

  reimprospateaza();
  return { success: true };
}

