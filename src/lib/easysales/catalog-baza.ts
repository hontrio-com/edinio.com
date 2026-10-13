import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { COLOANE_PRODUS_CATALOG, type ProdusCatalog } from "./eligibilitate";

/**
 * Citirile si scrierile comune catalogului (`catalog.ts`) si buclei de stoc (`bucla.ts`), ca cele doua
 * sa nu se importe una pe alta. Fiecare citire picata arunca `EroareCitireBaza`: o pana a bazei nu
 * are voie sa trimita la ei ceva socotit pe date lipsa.
 */

type Admin = SupabaseClient<Database>;
export type Rand = Database["public"]["Tables"]["easysales_produse"]["Row"];

/** Starile in care un articol e la ei (sau poate fi) si primeste actualizari. */
export const STARI_LA_EI = ["trimis", "confirmat"] as const;
/** Starile care nu mai primesc nimic: nici continut, nici pret, nici stoc. */
export const STARI_INCHISE = ["arhivat", "exclus", "disparut"] as const;

export function laEi(r: Pick<Rand, "stare">): boolean {
  return (STARI_LA_EI as readonly string[]).includes(r.stare);
}
export function inchis(r: Pick<Rand, "stare">): boolean {
  return (STARI_INCHISE as readonly string[]).includes(r.stare);
}

/** Ruleaza `fn` pe elemente, cate `cate` deodata. */
export async function inParalel<T>(elemente: readonly T[], cate: number, fn: (e: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < elemente.length; i += cate) {
    await Promise.all(elemente.slice(i, i + cate).map(fn));
  }
}

export function bucati<T>(lista: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

export async function citesteProdusele(admin: Admin, businessId: string, uuids: string[]): Promise<Map<string, ProdusCatalog>> {
  const out = new Map<string, ProdusCatalog>();
  for (const b of bucati(uuids, 100)) {
    const { data, error } = await admin.from("products").select(COLOANE_PRODUS_CATALOG).eq("business_id", businessId).in("id", b);
    if (error) throw new EroareCitireBaza("easysales.produse", error.message);
    for (const p of (data ?? []) as unknown as ProdusCatalog[]) out.set(p.id, p);
  }
  return out;
}

export async function citesteRandurile(admin: Admin, businessId: string, uuids: string[]): Promise<Rand[]> {
  const out: Rand[] = [];
  for (const b of bucati(uuids, 100)) {
    const { data, error } = await admin.from("easysales_produse").select("*").eq("business_id", businessId).in("product_uuid", b);
    if (error) throw new EroareCitireBaza("easysales.articole", error.message);
    out.push(...((data ?? []) as Rand[]));
  }
  return out;
}

export async function scrieRand(admin: Admin, id: number, petic: Partial<Rand>): Promise<void> {
  const { error } = await admin.from("easysales_produse").update({ ...petic, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new EroareCitireBaza("easysales.articole", error.message);
}
