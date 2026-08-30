"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin-guard";
import { slugDin, type AutorBlog, type CategorieBlog } from "@/lib/blog/types";

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
  revalidatePath("/admin/blog/autori");
  revalidatePath("/admin/blog/categorii");
}

type Raspuns<T = undefined> = { error: string } | ({ success: true } & (T extends undefined ? object : { date: T }));

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

/**
 * Pastreaza doar adresele care chiar sunt adrese.
 *
 * ⚠ ASTEA PLEACA IN `Person.sameAs` DIN DATELE STRUCTURATE. Un rand scris
 * gresit acolo nu strica pagina, dar strica exact ce trebuia sa faca: leaga
 * autorul de o persoana cunoscuta. O adresa invalida e mai rea decat lipsa ei,
 * fiindca trece drept declaratie si nu duce nicaieri.
 */
function adreseBune(intrari: string[] | undefined): string[] {
  return (intrari ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    });
}

export async function creeazaAutor(intrare: AutorInput): Promise<Raspuns<{ id: string }>> {
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

export async function creeazaCategorie(intrare: CategorieInput): Promise<Raspuns<{ id: string }>> {
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
