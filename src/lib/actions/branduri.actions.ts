"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { brandCanonic, curataBrand } from "@/lib/dashboard/branduri";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { proiecteazaImediat } from "@/lib/storefront/catalog/proiector";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueAboutYouSyncMany } from "@/lib/aboutyou/queue";
import { enqueueTrendyolSyncMany } from "@/lib/trendyol/queue";
import { enqueueEmagSyncMany } from "@/lib/emag/queue";
import { logError } from "@/lib/error-logger";

/**
 * Administrarea brandurilor, din Produse > Branduri.
 *
 * ⚠⚠ ORICE EXPORT DE AICI E UN CAPAT PUBLIC: Next le rezolva dintr-un manifest global,
 * deci o actiune se poate chema de oriunde, cu orice argumente. Fiecare verifica deci
 * SINGURA utilizatorul si ca magazinul e al lui; functiile din baza sunt oricum
 * `security invoker`, deci RLS-ul le mai margineste o data la produsele lui.
 *
 * ⚠ Redenumirea, unirea si stergerea sunt aceeasi operatie in baza
 * (`produse_redenumeste_brandul`): produsele cu brandul vechi primesc brandul nou,
 * sau niciunul. Dupa ea pleaca aceleasi cozi ca la schimbarea categoriei: brandul
 * intra in feeduri si pe marketplace-uri.
 */

type Rezultat = { success: true; count: number } | { error: string };

async function magazinulMeu(businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  return { supabase, ok: !!biz };
}

async function schimba(businessId: string, vechi: string, nou: string | null): Promise<Rezultat> {
  const { supabase, ok } = await magazinulMeu(businessId);
  if (!ok) return { error: "Magazin negasit." };

  const { data: atinse, error } = await supabase.rpc("produse_redenumeste_brandul", {
    p_business: businessId,
    p_vechi: vechi,
    p_nou: nou,
  });
  if (error) {
    await logError({ action: "branduri/schimba", message: error.message, businessId, severity: "error" });
    return { error: "Nu am putut salva. Incearca din nou." };
  }
  const ids = (atinse ?? []) as string[];
  if (ids.length > 0) {
    dupaRaspuns(() => enqueueGmcSyncMany(businessId, ids), "enqueueGmcSyncMany", businessId);
    dupaRaspuns(() => enqueueOlxSyncMany(businessId, ids), "enqueueOlxSyncMany", businessId);
    dupaRaspuns(() => enqueueAboutYouSyncMany(businessId, ids), "enqueueAboutYouSyncMany", businessId);
    dupaRaspuns(() => enqueueTrendyolSyncMany(businessId, ids), "enqueueTrendyolSyncMany", businessId);
    dupaRaspuns(() => enqueueEmagSyncMany(businessId, ids), "enqueueEmagSyncMany", businessId);
    await proiecteazaImediat(businessId);
  }
  revalidatePath("/dashboard/products/brands");
  revalidatePath("/dashboard/products");
  return { success: true, count: ids.length };
}

/**
 * Redenumeste un brand pe toate produsele lui. Daca numele nou exista deja (si
 * difera doar prin majuscule), produsele trec pe forma EXISTENTA: asa se si unesc
 * dublurile („ARMAF” in „Armaf”).
 */
export async function redenumesteBrandul(businessId: string, vechi: string, nou: string): Promise<Rezultat> {
  const brandVechi = curataBrand(vechi);
  const scris = curataBrand(nou);
  if (!brandVechi) return { error: "Brand negasit." };
  if (!scris) return { error: "Scrie noul nume al brandului." };

  const { supabase, ok } = await magazinulMeu(businessId);
  if (!ok) return { error: "Magazin negasit." };
  const { data: existente } = await supabase.rpc("produse_branduri", { p_business: businessId });
  /* Forma existenta castiga, cu exceptia brandului redenumit insusi (altfel „ARMAF” -> „Armaf” n-ar schimba nimic). */
  const altele = (existente ?? []).map((b) => b.brand).filter((b) => b !== brandVechi);
  const tinta = brandCanonic(scris, altele);
  if (tinta === brandVechi) return { success: true, count: 0 };
  return schimba(businessId, brandVechi, tinta);
}

/** Uneste un brand in altul existent (toate produsele lui trec pe cel ales). */
export async function unesteBrandul(businessId: string, dinBrand: string, inBrand: string): Promise<Rezultat> {
  const din = curataBrand(dinBrand);
  const in_ = curataBrand(inBrand);
  if (!din || !in_) return { error: "Alege brandurile de unit." };
  if (din === in_) return { success: true, count: 0 };
  return schimba(businessId, din, in_);
}

/** Scoate brandul de pe toate produsele lui. Produsele raman; numai brandul pleaca. */
export async function stergeBrandul(businessId: string, brand: string): Promise<Rezultat> {
  const b = curataBrand(brand);
  if (!b) return { error: "Brand negasit." };
  return schimba(businessId, b, null);
}
