"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randuriCitite } from "@/lib/supabase/rand-citit";
import { logError } from "@/lib/error-logger";

/**
 * Retururile About You, din panoul nostru.
 *
 * ═══ ⚠ DE CE EXISTA ═══
 *
 * Pana azi statusul „returned" de la ei punea AUTOMAT toata comanda inapoi pe raft. Marfa
 * intoarsa vine insa desfacuta, zgariata, incompleta, sau pur si simplu alta — iar stocul
 * umflat se vinde, si se vinde ce nu exista. Aceeasi taietura s-a facut la eMAG pe 25.08 si la
 * Trendyol pe 26.08.
 *
 * ⚠ SI DE-AIA A TREBUIT ECRANUL. Oprita repunerea fara el, marfa intoarsa n-ar mai fi ajuns
 * NICIODATA inapoi in stoc — o paguba mai mare decat cea reparata.
 *
 * ⚠ FIECARE ACTIUNE ISI VERIFICA MAGAZINUL. Actiunile de server se pot chema cu orice
 * argumente, printr-un POST direct.
 */

const FEATURE_PATH = "/dashboard/features/aboutyou";

type Garda = { error: string } | { userId: string };

async function guard(businessId: string): Promise<Garda> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz, error } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  /* ⚠ O citire picata NU se citeste ca „nu e magazinul lui": s-ar fi refuzat o actiune
     legitima, iar comerciantul n-ar fi avut de unde sti de ce. */
  if (error) return { error: "Nu am putut verifica magazinul. Încearcă din nou." };
  if (!biz) return { error: "Magazin negăsit" };
  return { userId: user.id };
}

export interface RandReturAboutYou {
  id: string;
  comanda: string;
  sku: string;
  numeProdus: string | null;
  variantTitle: string | null;
  cantitate: number;
  repusInStoc: boolean;
}

/** Liniile intoarse ale magazinului, cele mai noi intai. */
export async function retururiAboutYou(
  businessId: string, doarNerezolvate = true,
): Promise<{ retururi: RandReturAboutYou[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  let q = admin.from("aboutyou_retururi")
    .select("id, aboutyou_order_number, sku, nume_produs, variant_title, quantity, repus_in_stoc_la")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (doarNerezolvate) q = q.is("repus_in_stoc_la", null);

  const { data, error } = await q;
  if (error) return { error: "Retururile nu s-au putut citi. Reîncarcă pagina." };

  type Rand = {
    id: string; aboutyou_order_number: string; sku: string; nume_produs: string | null;
    variant_title: string | null; quantity: number; repus_in_stoc_la: string | null;
  };
  return {
    retururi: ((data ?? []) as Rand[]).map((r) => ({
      id: r.id,
      comanda: r.aboutyou_order_number,
      sku: r.sku,
      numeProdus: r.nume_produs,
      variantTitle: r.variant_title,
      cantitate: r.quantity,
      repusInStoc: !!r.repus_in_stoc_la,
    })),
  };
}

/**
 * „Am primit marfa și e bună": se pune înapoi în stoc.
 *
 * ⚠ TRECE PRINTR-UN RPC, nu prin trei pasi. Citit-adunat-marcat, doua apasari repezi ar fi
 * trecut amandoua de citire cu marcajul gol si ar fi adunat amandoua. Randul se ia `for update`
 * inauntru — aceeasi forma ca la Trendyol, si din acelasi motiv.
 */
export async function repuneInStocAboutYou(
  businessId: string, returId: string,
): Promise<{ success: true; pus: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("aboutyou_repune_stoc_retur", {
    p_business_id: businessId, p_retur_id: returId,
  });
  if (error) {
    await logError({
      action: "aboutyou/retururi",
      message: `repunerea in stoc a picat: ${error.message}`,
      details: { returId }, businessId, severity: "warning",
    });
    return { error: "Stocul nu s-a putut actualiza. Încearcă din nou." };
  }

  const r = (data ?? {}) as { stare?: string; pus?: number };
  switch (r.stare) {
    case "pus": revalidatePath(FEATURE_PATH); return { success: true, pus: Number(r.pus) || 0 };
    /* Nu e o eroare: e chiar raspunsul corect la a doua apasare. */
    case "deja": return { success: true, pus: 0 };
    case "lipsa": return { error: "Linia de retur nu există." };
    case "fara-produs": return { error: "Linia nu mai e legată de niciun produs din magazin." };
    default: return { error: "Stocul nu s-a putut actualiza. Încearcă din nou." };
  }
}

/** Cate linii intoarse asteapta. Pentru pastila din panou. */
export async function cateRetururiAsteaptaAboutYou(businessId: string): Promise<number> {
  const g = await guard(businessId);
  if ("error" in g) return 0;
  const randuri = randuriCitite<{ id: string }>("aboutyou.retururiDeRezolvat", await createAdminClient()
    .from("aboutyou_retururi").select("id")
    .eq("business_id", businessId).is("repus_in_stoc_la", null) as never);
  return randuri.length;
}
