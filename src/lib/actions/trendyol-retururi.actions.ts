"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getClaimIssueReasons, isTrendyolError } from "@/lib/trendyol/client";
import { loadTrendyolContext } from "@/lib/trendyol/sync";
import { hotarasteRetur, repuneInStoc } from "@/lib/trendyol/retururi";

/**
 * Retururile Trendyol, din panoul nostru.
 *
 * ⚠ FIECARE ACTIUNE ISI VERIFICA MAGAZINUL. Actiunile de server se pot chema cu orice
 * argumente, printr-un POST direct: fara garda, cineva ar putea aproba retururile altui
 * comerciant. Aceeasi regula ca peste tot in casa.
 */

const FEATURE_PATH = "/dashboard/features/trendyol";

/**
 * ⚠ TIPUL SE SCRIE, nu se lasa dedus. Dedus din `as const`, iesea o uniune in care `error`
 * putea fi si `undefined`, iar apelantii nu-l puteau intoarce mai departe fara sa se planga
 * compilatorul — si atunci tentatia e un cast, adica exact ascunderea pe care n-o vrem.
 */
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

export interface RandRetur {
  claimId: string;
  orderNumber: string | null;
  status: string | null;
  claimDate: string | null;
  linii: {
    claimItemId: string;
    barcode: string | null;
    numeProdus: string | null;
    cantitate: number;
    motiv: string | null;
    notaClient: string | null;
    decizie: string | null;
    repusInStoc: boolean;
  }[];
}

/** Retururile magazinului, cele mai noi intai. */
export async function retururiTrendyol(
  businessId: string, doarDeHotarat = false,
): Promise<{ retururi: RandRetur[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  let q = admin.from("trendyol_claims")
    .select("claim_id, order_number, claim_status, claim_date, trendyol_claim_items(claim_item_id, barcode, product_name, quantity, reason, customer_note, decizie, repus_in_stoc_la)")
    .eq("business_id", businessId)
    .order("claim_date", { ascending: false })
    .limit(100);

  /* ⚠ Cele care asteapta o hotarare se pot cere separat: ele sunt singurele la care
     comerciantul mai are ceva de facut. */
  if (doarDeHotarat) q = q.in("claim_status", ["Created", "WaitingInAction", "InAnalysis"]);

  const { data, error } = await q;
  if (error) return { error: "Retururile nu s-au putut citi. Reîncarcă pagina." };

  type Rand = {
    claim_id: string; order_number: string | null; claim_status: string | null; claim_date: string | null;
    trendyol_claim_items: {
      claim_item_id: string; barcode: string | null; product_name: string | null; quantity: number;
      reason: string | null; customer_note: string | null; decizie: string | null; repus_in_stoc_la: string | null;
    }[] | null;
  };

  return {
    retururi: ((data ?? []) as Rand[]).map((r) => ({
      claimId: r.claim_id,
      orderNumber: r.order_number,
      status: r.claim_status,
      claimDate: r.claim_date,
      linii: (r.trendyol_claim_items ?? []).map((l) => ({
        claimItemId: l.claim_item_id,
        barcode: l.barcode,
        numeProdus: l.product_name,
        cantitate: l.quantity,
        motiv: l.reason,
        notaClient: l.customer_note,
        decizie: l.decizie,
        repusInStoc: !!l.repus_in_stoc_la,
      })),
    })),
  };
}

/** Motivele de respingere, citite de la ei. */
export async function motiveRespingereTrendyol(
  businessId: string,
): Promise<{ motive: { id: number; nume: string }[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  const ctx = await loadTrendyolContext(admin, businessId);
  if (!ctx) return { error: "Contul Trendyol nu este conectat." };

  const res = await getClaimIssueReasons(ctx.auth);
  if (isTrendyolError(res)) return { error: res.error };
  /* ⚠ Motivele se CITESC de la ei, nu se scriu de mana: un id inventat ar fi fost refuzat
     abia la respingere, cand comerciantul crede ca a rezolvat. */
  return { motive: (res.data ?? []).map((m) => ({ id: m.id, nume: m.name })) };
}

/** Comerciantul accepta sau respinge liniile alese. */
export async function hotarasteReturTrendyol(
  businessId: string,
  input: { claimId: string; claimItemIds: string[]; accepta: boolean; motivId?: number; explicatie?: string },
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  const ctx = await loadTrendyolContext(admin, businessId);
  if (!ctx) return { error: "Contul Trendyol nu este conectat." };

  const r = await hotarasteRetur(admin, ctx, input);
  if ("error" in r) return r;
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/**
 * „Am primit marfa și e bună": se pune înapoi în stoc.
 *
 * ⚠ E O A DOUA APASARE, ANUME. Acceptarea returului inseamna ca banii se intorc, nu ca
 * produsul e bun de pus la loc pe raft — vine desfacut, incomplet, sau pur si simplu altul.
 */
export async function repuneInStocTrendyol(
  businessId: string, claimItemId: string,
): Promise<{ success: true; pus: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  const ctx = await loadTrendyolContext(admin, businessId);
  if (!ctx) return { error: "Contul Trendyol nu este conectat." };

  const r = await repuneInStoc(admin, ctx, claimItemId);
  if ("error" in r) return r;
  revalidatePath(FEATURE_PATH);
  return { success: true, pus: r.pus };
}
