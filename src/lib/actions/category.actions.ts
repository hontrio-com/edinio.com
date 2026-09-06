"use server";

import { revalidatePath } from "next/cache";
import { mutaMapareaCategoriei } from "@/lib/marketplace/mapare-categorii";
import { createClient } from "@/lib/supabase/server";
import { collectSubtreeIds } from "@/lib/categories/tree";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * Muta produsele ramase fara categorie pe alt nume (sau le lasa fara).
 *
 * `products.category` e TEXT, nu cheie straina: stergerea sau redenumirea unui
 * rand din `categories` nu-l atinge. Asa au aparut pe Vetdepo sapte nume purtate
 * doar de produse — 557 de produse care nu se mai puteau nici filtra, nici
 * regasi din meniu, si care apareau in magazin ca niste cercuri gri cu o litera.
 *
 * SE MUTA DOAR NUMELE CARE CHIAR AU DISPARUT. Unicitatea numelui e pe frati, nu
 * pe magazin, deci acelasi nume poate sta in doua ramuri: cat timp o categorie
 * geamana il mai poarta, numele e in continuare bun si produsele nu se ating.
 *
 * `.in()` pleaca in ADRESA, deci lista se taie in bucati: peste ~700 de valori,
 * PostgREST raspunde 400 la marginea interogarii.
 */
const NUME_PE_CERERE = 100;

async function remapeazaProduse(
  supabase: Supa,
  businessId: string,
  numeDisparute: string[],
  numeNou: string | null,
): Promise<number> {
  let mutate = 0;
  for (let i = 0; i < numeDisparute.length; i += NUME_PE_CERERE) {
    const bucata = numeDisparute.slice(i, i + NUME_PE_CERERE);
    const { data, error } = await supabase
      .from("products")
      .update({ category: numeNou })
      .eq("business_id", businessId)
      .in("category", bucata)
      .select("id");
    if (error) {
      console.error("[categorii] remaparea produselor a esuat:", error.message);
      continue;
    }
    mutate += data?.length ?? 0;
  }
  return mutate;
}

async function getBusinessId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .single();
  return data?.id ?? null;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

/**
 * Case-insensitive duplicate check among siblings. Needed because the DB
 * unique (business_id, parent_id, name) never fires for root categories —
 * parent_id NULL rows are always distinct in Postgres.
 */
async function siblingNameExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  parentId: string | null,
  name: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase
    .from("categories")
    .select("id")
    .eq("business_id", businessId)
    .ilike("name", escapeIlikePattern(name))
    .limit(1);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  return !!data;
}

export async function createCategory(data: {
  name: string;
  parent_id?: string | null;
  sort_order?: number;
}): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const name = data.name.trim();
  if (!name) return { error: "Numele categoriei este obligatoriu." };
  const parentId = data.parent_id ?? null;

  // The parent must be one of the merchant's own categories — otherwise a
  // crafted request could hang the subtree under a foreign business.
  if (parentId) {
    const { data: parent } = await supabase
      .from("categories")
      .select("id")
      .eq("id", parentId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!parent) return { error: "Categoria parinte nu exista." };
  }

  if (await siblingNameExists(supabase, businessId, parentId, name)) {
    return { error: "Aceasta categorie exista deja." };
  }

  const { data: cat, error } = await supabase
    .from("categories")
    .insert({
      business_id: businessId,
      name,
      parent_id: parentId,
      sort_order: data.sort_order ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Aceasta categorie exista deja." };
    return { error: "Eroare la creare." };
  }

  revalidatePath("/dashboard/products/categories");
  revalidatePath("/dashboard/products");
  return { id: cat.id };
}

export async function updateCategory(
  id: string,
  data: { name?: string; sort_order?: number; image_url?: string | null; is_active?: boolean },
): Promise<{ error: string } | { success: true; produseMutate?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const payload = { ...data };
  let numeVechi: string | null = null;
  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) return { error: "Numele categoriei este obligatoriu." };
    payload.name = name;
    const { data: current } = await supabase
      .from("categories")
      .select("id, parent_id, name")
      .eq("id", id)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!current) return { error: "Categoria nu exista." };
    if (current.name !== name) {
      if (await siblingNameExists(supabase, businessId, current.parent_id, name, id)) {
        return { error: "Exista deja o categorie cu acest nume la acelasi nivel." };
      }
      numeVechi = current.name;
    }
  }

  const { error } = await supabase
    .from("categories")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") return { error: "Exista deja o categorie cu acest nume la acelasi nivel." };
    return { error: "Eroare la actualizare." };
  }

  /*
   * Redenumirea duce produsele cu ea.
   *
   * Pana acum nu le ducea: numele vechi ramanea scris pe produse, care ieseau
   * astfel din propria categorie fara ca cineva sa fie anuntat. Se muta doar daca
   * numele vechi chiar a disparut din magazin — o categorie geamana din alta
   * ramura il tine in continuare valid, iar atunci produsele ei n-au de ce sa se
   * mute.
   */
  let produseMutate = 0;
  if (numeVechi && payload.name) {
    const { data: geamana } = await supabase
      .from("categories")
      .select("id")
      .eq("business_id", businessId)
      .eq("name", numeVechi)
      .neq("id", id)
      .limit(1)
      .maybeSingle();
    if (!geamana) {
      produseMutate = await remapeazaProduse(supabase, businessId, [numeVechi], payload.name);
      /*
       * ⚠ SI MAPAREA CATRE MARKETPLACE-URI, nu doar produsele.
       *
       * `category_map` are drept cheie NUMELE categoriei. Mutate produsele si nu maparea,
       * integrarea vede o categorie nemapata si opreste publicarea pentru toate produsele
       * din ea — iar ecranul cere sa fie legata o categorie pe care omul o legase deja.
       */
      await mutaMapareaCategoriei(businessId, numeVechi, payload.name);
    }
  }

  revalidatePath("/dashboard/products/categories");
  revalidatePath("/dashboard/products");
  return { success: true, produseMutate };
}

/**
 * Muta o categorie sub alt parinte, cu tot ce are sub ea.
 *
 * Pana acum nu se putea: greseala la adaugare se repara stergand ramura si
 * refacand-o de mana, subcategorie cu subcategorie.
 *
 * Produsele NU se ating. Ele isi tin categoria dupa NUME (`products.category` e
 * text, nu cheie straina), iar mutarea nu schimba niciun nume — deci nu se rupe
 * nicio legatura si nu e nimic de migrat.
 *
 * `newParentId` null inseamna „scoate-o la nivelul principal".
 */
export async function moveCategory(
  id: string,
  newParentId: string | null,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  const { data: cat } = await supabase
    .from("categories")
    .select("id, name, parent_id")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!cat) return { error: "Categoria nu exista." };
  if ((cat.parent_id ?? null) === newParentId) return { success: true };

  if (newParentId) {
    // Parintele trebuie sa fie tot al lui: altfel o cerere mestesugita ar agata
    // ramura sub alt magazin.
    const { data: parent } = await supabase
      .from("categories")
      .select("id")
      .eq("id", newParentId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!parent) return { error: "Categoria in care muti nu exista." };

    /*
     * Cea mai importanta oprire: nu poti muta o categorie in ea insasi sau in
     * ceva de sub ea.
     *
     * Ramura s-ar inchide intr-un cerc si ar iesi cu totul din arbore: n-ar mai
     * atarna de nicio radacina, deci n-ar mai aparea nicaieri in interfata si
     * n-ar mai putea fi nici mutata inapoi, nici stearsa din ecran. Se citesc
     * TOATE categoriile magazinului, ca sa se poata calcula subarborele.
     */
    const { data: toate } = await supabase
      .from("categories")
      .select("id, parent_id")
      .eq("business_id", businessId);
    if (collectSubtreeIds(toate ?? [], id).has(newParentId)) {
      return { error: "Nu poti muta o categorie in ea insasi sau intr-una dintre subcategoriile ei." };
    }
  }

  // Acelasi nume, doi frati: verificat in aplicatie fiindca la nivelul principal
  // regula din baza de date nu se declanseaza niciodata (vezi `siblingNameExists`).
  if (await siblingNameExists(supabase, businessId, newParentId, cat.name, id)) {
    return { error: "Acolo exista deja o categorie cu acest nume." };
  }

  const { error } = await supabase
    .from("categories")
    .update({ parent_id: newParentId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") return { error: "Acolo exista deja o categorie cu acest nume." };
    return { error: "Eroare la mutare." };
  }

  revalidatePath("/dashboard/products/categories");
  revalidatePath("/dashboard/products");
  return { success: true };
}

/**
 * Sterge categoria cu tot subarborele ei, si DUCE PRODUSELE UNDEVA.
 *
 * Stergerea cascadeaza in baza (`parent_id` e `on delete cascade`), dar produsele
 * nu sunt legate prin cheie straina — ele isi poarta categoria ca text. Pana
 * acum ramaneau scrise pe un nume care nu mai exista nicaieri: nu se mai puteau
 * filtra, nu mai aparau in meniu, si ieseau in magazin ca niste cercuri gri cu o
 * litera. Acum urca la parintele categoriei sterse; o radacina stearsa le lasa
 * fara categorie, ceea ce e cinstit — nu mai exista unde sa stea.
 */
export async function deleteCategory(
  id: string,
): Promise<{ error: string } | { success: true; produseMutate: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  /*
   * Arborele INAINTE de stergere: dupa ea, randurile subarborelui nu mai exista,
   * deci nu se mai poate afla ce nume tocmai au disparut.
   *
   * Citire COMPLETA, in ferestre. Un simplu `select` se taie tacut la 1000 de
   * randuri (plafonul PostgREST), iar aici jumatatea lipsa nu saraceste un ecran:
   * ar face subarborele sa para mai mic decat e si ar lasa produse scrise pe nume
   * moarte — exact defectul pe care functia asta il repara.
   */
  let lista: { id: string; parent_id: string | null; name: string }[];
  try {
    lista = await fetchAllRowsStrict("categorii.stergere", (from, to) =>
      supabase
        .from("categories")
        .select("id, parent_id, name")
        .eq("business_id", businessId)
        .order("id")
        .range(from, to)
    );
  } catch (e) {
    console.error("[categorii] arborele n-a putut fi citit intreg:", (e as Error).message);
    return { error: "Eroare la stergere." };
  }
  const stearsa = lista.find((c) => c.id === id);
  if (!stearsa) return { error: "Categoria nu exista." };

  const subarbore = collectSubtreeIds(lista, id);
  const numeSterse = new Set(lista.filter((c) => subarbore.has(c.id)).map((c) => c.name));
  // Numele purtate SI de o categorie care ramane in picioare nu au disparut.
  const raman = new Set(lista.filter((c) => !subarbore.has(c.id)).map((c) => c.name));
  const disparute = [...numeSterse].filter((n) => !raman.has(n));
  const destinatie = lista.find((c) => c.id === stearsa.parent_id)?.name ?? null;

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) return { error: "Eroare la stergere." };

  const produseMutate = disparute.length
    ? await remapeazaProduse(supabase, businessId, disparute, destinatie)
    : 0;

  revalidatePath("/dashboard/products/categories");
  revalidatePath("/dashboard/products");
  return { success: true, produseMutate };
}

/**
 * Scrie ordinea unui grup de frati.
 *
 * Erorile se CITESC. Scrisa cu `await Promise.all(updates)` si `return
 * { success: true }`, functia raporta izbanda si cand niciun rand nu se
 * schimbase: `.update()` din supabase-js nu arunca, intoarce eroarea in obiect.
 * Comerciantul ar fi vazut randurile sarind la loc abia dupa un refresh.
 */
export async function reorderCategories(
  items: { id: string; sort_order: number }[],
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) return { error: "Magazin negasit" };

  if (items.length === 0) return { success: true };

  const rezultate = await Promise.all(
    items.map(({ id, sort_order }) =>
      supabase
        .from("categories")
        .update({ sort_order, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("business_id", businessId)
    )
  );

  const esuate = rezultate.filter((r) => r.error);
  if (esuate.length) {
    console.error("[categorii] reordonarea a esuat:", esuate[0].error?.message);
    return { error: "Ordinea nu s-a putut salva." };
  }

  revalidatePath("/dashboard/products/categories");
  revalidatePath("/dashboard/products");
  return { success: true };
}
