"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getClaimIssueReasons, isTrendyolError } from "@/lib/trendyol/client";
import { loadTrendyolContext } from "@/lib/trendyol/sync";
import { hotarasteRetur, repuneInStoc } from "@/lib/trendyol/retururi";
import { MOTIVE_RETUR_RO } from "@/lib/trendyol/types";
import { marfaAAjuns, sePoateHotari, STARI_DE_HOTARAT } from "@/lib/trendyol/retur-forma";

/**
 * Retururile Trendyol, din panoul nostru.
 *
 * ⚠ FIECARE ACTIUNE ISI VERIFICA MAGAZINUL. Actiunile de server se pot chema cu orice
 * argumente, printr-un POST direct: fara garda, cineva ar putea aproba retururile altui
 * comerciant. Aceeasi regula ca peste tot in casa.
 */

const FEATURE_PATH = "/dashboard/features/trendyol";

/** ⚠ Marginile dovezilor. Cele de la ei: 10 MB pe fisier, si doar PDF, JPEG sau PNG. */
const MAX_DOVEZI = 5;
const MAX_MB_DOVADA = 10;
const TIPURI_DOVADA = ["application/pdf", "image/jpeg", "image/png"];

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
  /**
   * Ce mai are de facut omul dupa ce a respins returul.
   *
   * ⚠ TREI STARI, NU DOUA: `null` = nu exista colet de retur-respins; `true` = nu trimiti nimic
   * inapoi; `false` = TREBUIE sa trimiti coletul inapoi clientului daca ei accepta respingerea.
   * Absenta nu e „false" — vezi `nuSeTrimiteInapoi`.
   */
  nuTrimiteInapoi: boolean | null;
  coletRespins: {
    awb: string | null; curier: string | null; link: string | null; pin: string | null;
  } | null;
  linii: {
    claimItemId: string;
    barcode: string | null;
    numeProdus: string | null;
    cantitate: number;
    motiv: string | null;
    notaClient: string | null;
    decizie: string | null;
    /** Se mai poate cere o hotarare pe linia asta? Vezi `sePoateHotari`. */
    sePoateHotari: boolean;
    /** A ajuns marfa fizic la comerciant? Vezi `marfaAAjuns`. */
    marfaAAjuns: boolean;
    /** ⚠ Nu i-am putut citi starea. Altceva decat „s-a hotarat deja". */
    stareNecunoscuta: boolean;
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
    .select("claim_id, order_number, claim_status, claim_date, dont_ship_back, colet_respins, trendyol_claim_items(claim_item_id, claim_item_status, barcode, product_name, quantity, reason, customer_note, decizie, repus_in_stoc_la)")
    .eq("business_id", businessId)
    .order("claim_date", { ascending: false })
    .limit(100);

  /*
   * ⚠ Cele care asteapta o hotarare se pot cere separat: ele sunt singurele la care
   * comerciantul mai are ceva de facut.
   *
   * ═══ ⚠ LISTA DE AICI ERA GRESITA DE DOUA ORI (26.08.2026) ═══
   *
   * Intai: `claim_status` iesea NULL la fiecare cerere, fiindca il luam dintr-un camp pe care ei
   * nu-l trimit — vezi nota de la `stareaCererii`. Un `in(...)` nu potriveste niciodata un NULL,
   * deci lista asta era GOALA oricate retururi ar fi fost.
   *
   * Apoi: `InAnalysis` nu e o stare in care comerciantul are ceva de facut — acolo se uita EI.
   * Aratata ca „așteaptă răspunsul tău", l-ar fi trimis sa caute un buton care nu exista.
   */
  /*
   * ═══ ⚠ SI UN STATUS PE CARE NU-L STIM TREBUIE SA SE VADA ═══
   *
   * `in(...)` nu potriveste un NULL — chiar capcana de mai sus, in alta haina. `claim_status` se
   * aduna acum din liniile lor, iar daca vreodata n-am putea citi starea unei linii (o forma
   * noua a lui `claimItemStatus`, un raspuns pe care nu l-am mai vazut), cererea ar iesi cu
   * `null` si ar DISPAREA din lista — adica exact defectul de azi, reintors.
   *
   * ⚠ DIRECTIA SIGURA E INVERSA: mai bine aratat un retur la care omul n-are ce face, decat
   * ascuns unul care cere o apasare si expira netratat. Necunoscutul se arata.
   */
  if (doarDeHotarat) {
    q = q.or(`claim_status.is.null,claim_status.in.(${STARI_DE_HOTARAT.join(",")})`);
  }

  const { data, error } = await q;
  if (error) return { error: "Retururile nu s-au putut citi. Reîncarcă pagina." };

  type Rand = {
    claim_id: string; order_number: string | null; claim_status: string | null; claim_date: string | null;
    dont_ship_back: boolean | null;
    colet_respins: Record<string, unknown> | null;
    trendyol_claim_items: {
      claim_item_id: string; claim_item_status: string | null;
      barcode: string | null; product_name: string | null; quantity: number;
      reason: string | null; customer_note: string | null; decizie: string | null; repus_in_stoc_la: string | null;
    }[] | null;
  };

  return {
    retururi: ((data ?? []) as Rand[]).map((r) => ({
      claimId: r.claim_id,
      orderNumber: r.order_number,
      status: r.claim_status,
      claimDate: r.claim_date,
      nuTrimiteInapoi: r.dont_ship_back,
      coletRespins: r.colet_respins
        ? {
          /* ⚠ AWB-ul vine NUMERIC in exemplul lor, nu ca sir. */
          awb: r.colet_respins.cargoTrackingNumber != null ? String(r.colet_respins.cargoTrackingNumber) : null,
          curier: typeof r.colet_respins.cargoProviderName === "string" ? r.colet_respins.cargoProviderName : null,
          link: typeof r.colet_respins.cargoTrackingLink === "string" ? r.colet_respins.cargoTrackingLink : null,
          pin: typeof r.colet_respins.sellerOtp === "string" ? r.colet_respins.sellerOtp : null,
        }
        : null,
      linii: (r.trendyol_claim_items ?? []).map((l) => ({
        claimItemId: l.claim_item_id,
        barcode: l.barcode,
        numeProdus: l.product_name,
        cantitate: l.quantity,
        motiv: l.reason,
        notaClient: l.customer_note,
        decizie: l.decizie,
        repusInStoc: !!l.repus_in_stoc_la,
        /*
         * ⚠ ECRANUL NU ARE VOIE SA OFERE UN BUTON CARE VA FI REFUZAT (26.08.2026).
         *
         * Serverul opreste deja — si acolo e paza adevarata, fiindca un buton se poate ocoli cu
         * un POST direct. Dar aratat activ, butonul promite ceva ce nu se poate face, iar omul
         * afla abia dupa apasare. Vezi `sePoateHotari` si `marfaAAjuns`.
         */
        sePoateHotari: sePoateHotari(l.claim_item_status),
        marfaAAjuns: marfaAAjuns(l.claim_item_status),
        /*
         * ⚠ „NU STIM" NU E ACELASI LUCRU CU „S-A HOTARAT DEJA" (26.08.2026).
         *
         * De cand hotararea se cere numai din `WaitingInAction`, o linie a carei stare n-am
         * putut-o citi iese si ea nebifabila — corect, fiindca n-avem voie sa pariem pe un apel
         * ireversibil. Dar cererea ei APARE in lista „așteaptă răspunsul tău", anume, ca sa nu
         * dispara. Iar ecranul ii spunea „nu mai așteaptă un răspuns de la tine" — adica taman
         * contrariul listei in care statea, si neadevarat pe deasupra.
         *
         * Ecranul trebuie sa poata spune care din doua e.
         */
        stareNecunoscuta: !l.claim_item_status,
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
  /*
   * ⚠ ID-URILE SE CITESC DE LA EI, ETICHETA SE TRADUCE AICI.
   *
   * Lista tot de la ei vine — un id inventat ar fi fost refuzat abia la respingere, cand
   * comerciantul crede ca a rezolvat. Dar numele vin NUMAI in turca: probat cu
   * `storeFrontCode: RO` si `Accept-Language: ro`, apoi cu `INT`/`en` — aceleasi propozitii
   * turcesti de fiecare data.
   *
   * ⚠ Un motiv pe care ei il adauga si noi nu-l stim se arata cu numele lui turcesc, nu
   * dispare: mai bine o eticheta pe care omul n-o intelege decat o optiune care lipseste.
   */
  return {
    motive: (res.data ?? []).map((m) => ({ id: m.id, nume: MOTIVE_RETUR_RO[m.id] ?? m.name })),
  };
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
/**
 * Respinge returul, cu dovezi.
 *
 * === FISIERELE CER `FormData`, NU ARGUMENTE OBISNUITE ===
 *
 * O actiune de server nu poate primi `File` printre argumente serializate; trebuie sa vina
 * intr-un `FormData`. De-aia respingerea cu dovezi are actiunea ei, in loc sa umfle
 * `hotarasteReturTrendyol`.
 *
 * ⚠ DOVADA E CERUTA, in afara de doua motive. Schema lor le da ca optionale, ghidul lor le cere
 * („file yüklemek zorunludur"), si se crede ghidul — vezi nota lunga de la `MOTIVE_FARA_DOVADA`.
 * Oprirea sta in `hotarasteRetur`, ca sa acopere si calea fara fisiere, nu doar ecranul asta.
 *
 * ⚠ SE MARGINESC AICI, nu la ei: cel mult cinci fisiere, cel mult 10 MB fiecare, si numai
 * PDF/JPEG/PNG. Altfel refuzul ar fi venit de la ei dupa ce omul a apasat, iar mesajul lor nu
 * spune CARE fisier a fost de vina.
 */
export async function respingeReturTrendyolCuDovezi(
  businessId: string, formData: FormData,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const claimId = String(formData.get("claimId") ?? "");
  const motivId = Number(formData.get("motivId") ?? 0);
  const explicatie = String(formData.get("explicatie") ?? "");
  const claimItemIds = String(formData.get("claimItemIds") ?? "").split(",").filter(Boolean);
  if (!claimId || claimItemIds.length === 0) return { error: "Alege întâi liniile de retur." };

  const brute = formData.getAll("dovezi").filter((f): f is File => f instanceof File && f.size > 0);
  if (brute.length > MAX_DOVEZI) return { error: `Poți atașa cel mult ${MAX_DOVEZI} fișiere.` };
  for (const f of brute) {
    if (f.size > MAX_MB_DOVADA * 1024 * 1024) {
      return { error: `Fișierul ${f.name} depășește ${MAX_MB_DOVADA} MB.` };
    }
    if (!TIPURI_DOVADA.includes(f.type)) {
      return { error: `Fișierul ${f.name} nu e PDF, JPEG sau PNG.` };
    }
  }

  const admin = createAdminClient();
  const ctx = await loadTrendyolContext(admin, businessId);
  if (!ctx) return { error: "Contul Trendyol nu este conectat." };

  const r = await hotarasteRetur(admin, ctx, {
    claimId, claimItemIds, accepta: false, motivId, explicatie, dovezi: brute,
  });
  if ("error" in r) return r;
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

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
