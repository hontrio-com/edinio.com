"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { esteUuid } from "@/lib/supabase/ids";
import { logError } from "@/lib/error-logger";
import { mesajulDezlegarii, mesajulLegarii } from "@/lib/cont/panou-texte";

/*
 * Actiunile comerciantului pe conturile clientilor lui (Clienti > Conturi).
 *
 * ⚠⚠ FIECARE EXPORT DINTR-UN MODUL "use server" E UN CAPAT PUBLIC, chemabil cu
 * orice argumente printr-un POST direct. De-aia fiecare incepe cu `garda`:
 * omul logat, magazinul LUI, id-uri care chiar sunt uuid. Functiile din baza cer
 * si magazinul, si contul, deci un cont al altui magazin nu se gaseste nici daca
 * cineva ghiceste un id.
 *
 * ⚠ Comerciantul nu are nevoie de parola clientului pentru nimic de aici, si
 * nimic de aici nu i-o arata.
 */

type Rezultat = { ok: true; mesaj: string } | { error: string };

async function garda(businessId: unknown, contId: unknown): Promise<{ ok: true } | { error: string }> {
  if (!esteUuid(businessId) || !esteUuid(contId)) return { error: "Cerere nevalidă." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu ești autentificat." };
  const { data, error } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (error) return { error: "Nu am putut verifica magazinul. Încearcă din nou." };
  if (!data) return { error: "Magazin negăsit." };
  return { ok: true };
}

function reimprospateaza(contId: string) {
  revalidatePath(`/dashboard/customers/conturi/${contId}`);
  revalidatePath("/dashboard/customers");
}

async function esec(actiune: string, businessId: string, e: unknown, text: string): Promise<{ error: string }> {
  await logError({
    action: `panou-conturi/${actiune}`,
    message: `${actiune} a esuat: ${e instanceof Error ? e.message : String(e)}`,
    businessId,
    severity: "error",
  });
  return { error: text };
}

/**
 * Suspenda contul: omul nu mai poate intra, iar sesiunile si dispozitivele lui cad
 * pe loc. Comenzile raman legate; se vad din nou la reactivare.
 */
export async function suspendaContul(businessId: string, contId: string, motiv: string): Promise<Rezultat> {
  const g = await garda(businessId, contId);
  if ("error" in g) return g;
  const text = typeof motiv === "string" ? motiv.trim().slice(0, 200) : "";
  try {
    const { data, error } = await createAdminClient().rpc("cont_panou_suspenda", {
      p_business: businessId, p_cont: contId, p_motiv: text || null,
    });
    if (error) throw error;
    reimprospateaza(contId);
    if (data === "suspendat") return { ok: true, mesaj: "Contul a fost suspendat. Clientul a fost scos de pe toate dispozitivele." };
    if (data === "deja-suspendat") return { ok: true, mesaj: "Contul era deja suspendat." };
    return { error: "Contul nu mai există." };
  } catch (e) {
    return esec("suspendare", businessId, e, "Nu am putut suspenda contul. Încearcă din nou.");
  }
}

export async function reactiveazaContul(businessId: string, contId: string): Promise<Rezultat> {
  const g = await garda(businessId, contId);
  if ("error" in g) return g;
  try {
    const { data, error } = await createAdminClient().rpc("cont_panou_reactiveaza", { p_business: businessId, p_cont: contId });
    if (error) throw error;
    reimprospateaza(contId);
    if (data === "reactivat") return { ok: true, mesaj: "Contul a fost reactivat. Clientul poate intra din nou cu parola lui." };
    if (data === "nu-era-suspendat") return { ok: true, mesaj: "Contul nu era suspendat." };
    return { error: "Contul nu mai există." };
  } catch (e) {
    return esec("reactivare", businessId, e, "Nu am putut reactiva contul. Încearcă din nou.");
  }
}

/** Inchide toate sesiunile contului si uita dispozitivele tinute minte. */
export async function scoateDePeDispozitive(businessId: string, contId: string): Promise<Rezultat> {
  const g = await garda(businessId, contId);
  if ("error" in g) return g;
  try {
    const { data, error } = await createAdminClient().rpc("cont_panou_iesire", { p_business: businessId, p_cont: contId });
    if (error) throw error;
    const r = (data ?? [])[0];
    if (!r?.ok) return { error: "Contul nu mai există." };
    reimprospateaza(contId);
    const n = Number(r.sesiuni ?? 0);
    return {
      ok: true,
      mesaj: n === 0
        ? "Nu era nicio sesiune deschisă. Dispozitivele ținute minte au fost uitate."
        : `${n === 1 ? "Sesiunea deschisă a fost închisă" : `Cele ${n} sesiuni deschise au fost închise`}, iar dispozitivele ținute minte au fost uitate.`,
    };
  } catch (e) {
    return esec("iesire", businessId, e, "Nu am putut închide sesiunile. Încearcă din nou.");
  }
}

/**
 * Sterge contul la cererea omului. Acelasi drum ca stergerea din contul lui
 * (`cont_sterge`): contul, contactele, sesiunile si istoricul dispar, iar
 * COMENZILE RAMAN (au documente fiscale in spate).
 */
export async function stergeContulClientului(businessId: string, contId: string): Promise<Rezultat> {
  const g = await garda(businessId, contId);
  if ("error" in g) return g;
  try {
    const { data, error } = await createAdminClient().rpc("cont_panou_sterge", { p_business: businessId, p_cont: contId });
    if (error) throw error;
    const r = (data ?? [])[0];
    if (!r?.ok) return { error: "Contul nu mai există." };
    reimprospateaza(contId);
    const n = Number(r.comenzi_ramase ?? 0);
    return {
      ok: true,
      mesaj: n === 0
        ? "Contul a fost șters."
        : `Contul a fost șters. ${n === 1 ? "Comanda lui rămâne" : `Cele ${n} comenzi ale lui rămân`} în magazin, cu datele de pe ele.`,
    };
  } catch (e) {
    return esec("stergere", businessId, e, "Nu am putut șterge contul. Încearcă din nou.");
  }
}

export type ComandaDeLegat = {
  orderId: string;
  numar: string;
  creataLa: string;
  total: number;
  stare: string;
  numeClient: string | null;
  emailClient: string | null;
  telefonClient: string | null;
  marketplace: boolean;
  legataDe: string | null;
  sePotriveste: boolean;
};

/**
 * Cauta o comanda dupa numar, ca s-o ARATE inainte de legare.
 *
 * ⚠⚠ Legarea nu se face de aici: un numar tastat gresit ar fi pus adresa si
 * factura altui om in contul asta. Comerciantul vede intai cine a comandat.
 */
export async function cautaComandaDeLegat(
  businessId: string,
  contId: string,
  numar: string,
): Promise<{ ok: true; comanda: ComandaDeLegat | null } | { error: string }> {
  const g = await garda(businessId, contId);
  if ("error" in g) return g;
  const n = typeof numar === "string" ? numar.trim().slice(0, 40) : "";
  if (!n) return { error: "Scrie numărul comenzii." };
  try {
    const { data, error } = await createAdminClient().rpc("cont_panou_comanda_de_legat", {
      p_business: businessId, p_cont: contId, p_numar: n,
    });
    if (error) throw error;
    const r = (data ?? [])[0];
    if (!r) return { ok: true, comanda: null };
    return {
      ok: true,
      comanda: {
        orderId: r.order_id,
        numar: r.numar,
        creataLa: r.creata_la,
        total: Number(r.total),
        stare: r.stare,
        numeClient: r.nume_client ?? null,
        emailClient: r.email_client ?? null,
        telefonClient: r.telefon_client ?? null,
        marketplace: r.marketplace === true,
        legataDe: r.legata_de ?? null,
        sePotriveste: r.se_potriveste === true,
      },
    };
  } catch (e) {
    return esec("cautare-comanda", businessId, e, "Nu am putut căuta comanda. Încearcă din nou.");
  }
}

export async function leagaComandaDeCont(businessId: string, contId: string, orderId: string): Promise<Rezultat> {
  const g = await garda(businessId, contId);
  if ("error" in g) return g;
  if (!esteUuid(orderId)) return { error: "Cerere nevalidă." };
  try {
    const { data, error } = await createAdminClient().rpc("cont_panou_leaga_comanda", {
      p_business: businessId, p_cont: contId, p_order: orderId,
    });
    if (error) throw error;
    const motiv = typeof data === "string" ? data : "necunoscut";
    if (motiv !== "legata" && motiv !== "deja-legata") return { error: mesajulLegarii(motiv) };
    reimprospateaza(contId);
    return { ok: true, mesaj: mesajulLegarii(motiv) };
  } catch (e) {
    return esec("legare-comanda", businessId, e, mesajulLegarii("necunoscut"));
  }
}

export async function dezleagaComandaDeCont(businessId: string, contId: string, orderId: string): Promise<Rezultat> {
  const g = await garda(businessId, contId);
  if ("error" in g) return g;
  if (!esteUuid(orderId)) return { error: "Cerere nevalidă." };
  try {
    const { data, error } = await createAdminClient().rpc("cont_panou_dezleaga_comanda", {
      p_business: businessId, p_cont: contId, p_order: orderId,
    });
    if (error) throw error;
    const motiv = typeof data === "string" ? data : "necunoscut";
    if (motiv !== "dezlegata") return { error: mesajulDezlegarii(motiv) };
    reimprospateaza(contId);
    return { ok: true, mesaj: mesajulDezlegarii(motiv) };
  } catch (e) {
    return esec("dezlegare-comanda", businessId, e, mesajulDezlegarii("necunoscut"));
  }
}
