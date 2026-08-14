"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cheieDinNume, numeCuDescendenti, produseDinFeed, type RegulaFeed } from "@/lib/facebook/feeduri";
import type { StoreCategoryNode } from "@/lib/storefront/store-content.types";
import type { Json } from "@/types/database.types";

/**
 * Feedurile Meta segmentate, salvate din panou.
 *
 * ⚠ Fisier cu `"use server"`: FIECARE export devine un endpoint apelabil de
 * oriunde, cu un simplu POST. De aia n-are ajutoare exportate — doar actiuni
 * care isi verifica singure omul. Regulile pure stau in `lib/facebook/feeduri.ts`.
 */

/** Cate feeduri poate avea un magazin. */
const MAX_FEEDURI = 25;
/** Cate produse alese manual incap intr-un feed. */
const MAX_PRODUSE = 5000;

async function magazinulMeu(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("businesses").select("id").eq("user_id", user.id)
    .order("created_at").limit(1).single();
  return data ?? null;
}

/** Curata o regula venita din browser. Nu se salveaza nimic necurat. */
function curata(brut: unknown, cheiLuate: string[]): RegulaFeed | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  const nume = String(o.nume ?? "").trim().slice(0, 60);
  if (!nume) return null;

  const lista = (v: unknown, max: number) =>
    Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, max) : [];
  const numar = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const cheieExistenta = String(o.cheie ?? "").trim().toLowerCase();
  return {
    /* Cheia unui feed SALVAT nu se schimba la redenumire: e lipita in Commerce
       Manager, iar schimbata ar rupe tacut sursa de date a comerciantului. */
    cheie: cheieExistenta || cheieDinNume(nume, cheiLuate),
    nume,
    categorii: lista(o.categorii, 500),
    produse: lista(o.produse, MAX_PRODUSE),
    excluse: lista(o.excluse, MAX_PRODUSE),
    doarInStoc: o.doarInStoc === true,
    pretMin: numar(o.pretMin),
    pretMax: numar(o.pretMax),
  };
}

export async function salveazaFeeduriFacebook(
  feeduri: unknown[],
): Promise<{ success: true; feeduri: RegulaFeed[] } | { error: string }> {
  const biz = await magazinulMeu();
  if (!biz) return { error: "Neautorizat" };

  if (!Array.isArray(feeduri)) return { error: "Date invalide" };
  if (feeduri.length > MAX_FEEDURI) {
    return { error: `Cel mult ${MAX_FEEDURI} feeduri pe magazin.` };
  }

  const curatate: RegulaFeed[] = [];
  for (const f of feeduri) {
    const r = curata(f, curatate.map((x) => x.cheie));
    if (!r) continue;
    /*
     * ⚠ Cheia duplicata se REZOLVA, nu se refuza: `?feed=x` ar fi ajuns sa
     * depinda de ordinea din tablou, iar comerciantul care si-a numit doua
     * feeduri la fel n-a gresit cu nimic.
     */
    if (curatate.some((x) => x.cheie === r.cheie)) {
      r.cheie = cheieDinNume(r.nume, curatate.map((x) => x.cheie));
    }
    curatate.push(r);
  }

  const { error } = await createAdminClient()
    .from("store_settings")
    .update({ facebook_feeds: curatate as unknown as Json, updated_at: new Date().toISOString() })
    .eq("business_id", biz.id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/features/facebook-catalog");
  return { success: true, feeduri: curatate };
}

/**
 * Cate produse ar intra intr-un feed, fara sa-l salvezi.
 *
 * ⚠ Numarul e jumatate din valoarea ecranului. Un feed care se dovedeste GOL
 * abia dupa ce a fost lipit in Commerce Manager inseamna un catalog gol si
 * reclame oprite, fara ca nimic sa dea eroare — exact felul de tacere pe care
 * integrarea asta il produce cel mai usor.
 */
export async function numaraProduseFeed(
  regula: unknown,
): Promise<{ total: number } | { error: string }> {
  const biz = await magazinulMeu();
  if (!biz) return { error: "Neautorizat" };

  const r = curata(regula, []);
  if (!r) return { error: "Feed incomplet" };

  const admin = createAdminClient();
  const [{ data: produse, error: eProd }, { data: categorii }] = await Promise.all([
    admin.from("products")
      .select("id, category, price, track_inventory, stock_quantity, is_bundle")
      .eq("business_id", biz.id).eq("is_active", true),
    admin.from("categories").select("id, name, parent_id").eq("business_id", biz.id),
  ]);
  if (eProd) return { error: "Nu am putut citi produsele." };

  const nume = numeCuDescendenti((categorii ?? []) as unknown as StoreCategoryNode[], r.categorii ?? []);
  /*
   * ⚠ Numaratoarea nu tine cont de disponibilitatea PACHETELOR, care se
   * calculeaza din componente si cere lista intreaga cu `page_sections`. Un
   * pachet fara stoc poate fi numarat aici si sa lipseasca din feed cand
   * `doarInStoc` e pornit. Diferenta e de cel mult cateva articole si costa mult
   * mai putin decat inca o citire a intregului catalog la fiecare tastare.
   */
  return { total: produseDinFeed(r, produse ?? [], nume).length };
}

export interface ProdusPentruAles {
  id: string;
  name: string;
  category: string | null;
  price: number;
  imagine: string | null;
}

/**
 * Produse pentru selectorul din constructorul de feeduri.
 *
 * ⚠ Se cauta pe SERVER, cu plafon, nu se trimite catalogul in browser: cel mai
 * mare magazin are 3351 de produse active, iar ecranul are nevoie de cateva zeci
 * odata. Un catalog intreg trimis la fiecare deschidere ar fi facut panoul de
 * nefolosit exact la magazinele care au nevoie de selectie.
 */
export async function cautaProduseFeed(
  q: string,
  idAlese: string[] = [],
): Promise<{ produse: ProdusPentruAles[]; total: number } | { error: string }> {
  const biz = await magazinulMeu();
  if (!biz) return { error: "Neautorizat" };

  const admin = createAdminClient();
  const termen = String(q ?? "").trim().slice(0, 80);

  let cerere = admin
    .from("products")
    .select("id, name, category, price, images", { count: "exact" })
    .eq("business_id", biz.id)
    .eq("is_active", true);

  /*
   * ⚠ `%` si `_` se escapeaza: intr-un `ilike` sunt metacaractere, deci o cautare
   * dupa „50%" ar fi intors tot catalogul in loc de nimic.
   */
  if (termen) {
    const sigur = termen.replace(/[\%_]/g, (c) => `\${c}`);
    cerere = cerere.ilike("name", `%${sigur}%`);
  }

  const { data, count, error } = await cerere.order("name").limit(40);
  if (error) return { error: "Nu am putut citi produsele." };

  const randuri = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: Number(p.price) || 0,
    imagine: Array.isArray(p.images) ? (p.images[0] as string | undefined) ?? null : null,
  }));

  /*
   * Produsele DEJA alese se aduc chiar daca nu se potrivesc cautarii: altfel, cu
   * o cautare pe ecran, ele ar disparea din lista si comerciantul ar crede ca le-a
   * pierdut — sau le-ar bifa a doua oara.
   */
  const lipsa = idAlese.filter((id) => !randuri.some((r) => r.id === id)).slice(0, 60);
  if (lipsa.length > 0) {
    const { data: dinAles } = await admin
      .from("products")
      .select("id, name, category, price, images")
      .eq("business_id", biz.id)
      .in("id", lipsa);
    for (const p of dinAles ?? []) {
      randuri.push({
        id: p.id,
        name: p.name,
        category: p.category,
        price: Number(p.price) || 0,
        imagine: Array.isArray(p.images) ? (p.images[0] as string | undefined) ?? null : null,
      });
    }
  }

  return { produse: randuri, total: count ?? randuri.length };
}
