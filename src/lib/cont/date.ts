import { createAdminClient } from "@/lib/supabase/admin";

export type ContactulMeu = {
  fel: "email" | "telefon";
  valoareBruta: string;
  valoare: string;
  verificat: boolean;
  creatLa: string;
};

export type ReturulMeu = {
  returId: string;
  /** Comanda returului, ca sa se poata deschide; NULL cand comerciantul a sters-o. */
  orderId: string | null;
  numarComanda: string;
  creatLa: string;
  stare: string;
  motiv: string | null;
  felRestituire: string | null;
  ibanMascat: string | null;
  bucati: number;
  produse: { nume: string; cantitate: number }[];
};

export async function contacteleMele(businessId: string, contId: string): Promise<ContactulMeu[]> {
  const { data, error } = await createAdminClient().rpc("cont_contactele_mele", {
    p_business: businessId,
    p_cont: contId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fel: r.fel === "telefon" ? "telefon" : "email",
    valoareBruta: r.valoare_bruta,
    valoare: r.valoare,
    verificat: r.verificat === true,
    creatLa: r.creat_la,
  }));
}

/**
 * ⚠ Motivul „ultimul-contact" nu e o eroare tehnica, e o hotarare: nu exista
 * parola, deci contactele SUNT singura cale de intrare. Omul care si-ar scoate
 * ultimul contact s-ar incuia singur afara pentru totdeauna.
 */
export async function scoateContact(
  businessId: string,
  contId: string,
  fel: "email" | "telefon",
  valoare: string,
): Promise<{ ok: boolean; motiv: string }> {
  const { data, error } = await createAdminClient().rpc("cont_sterge_contact", {
    p_business: businessId,
    p_cont: contId,
    p_fel: fel,
    p_valoare: valoare,
  });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) ?? null;
  return { ok: r?.ok === true, motiv: r?.motiv ?? "necunoscut" };
}

export async function retururileMele(businessId: string, contId: string): Promise<ReturulMeu[]> {
  const { data, error } = await createAdminClient().rpc("cont_retururile_mele", {
    p_business: businessId,
    p_cont: contId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    returId: r.retur_id,
    orderId: r.order_id,
    numarComanda: r.numar_comanda,
    creatLa: r.creat_la,
    stare: r.stare,
    motiv: r.motiv,
    felRestituire: r.fel_restituire,
    /* ⚠ Deja mascat IN BAZA. Aici nu se mai poate demasca nimic. */
    ibanMascat: r.iban_mascat,
    bucati: Number(r.bucati ?? 0),
    produse: (Array.isArray(r.produse) ? (r.produse as unknown[]) : [])
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
      .map((x) => ({ nume: typeof x.nume === "string" ? x.nume : "", cantitate: Number(x.cantitate) || 0 }))
      .filter((x) => x.nume !== ""),
  }));
}

export async function anuleazaComanda(
  businessId: string,
  contId: string,
  orderId: string,
): Promise<{ ok: boolean; motiv: string }> {
  const { data, error } = await createAdminClient().rpc("cont_anuleaza_comanda", {
    p_business: businessId,
    p_cont: contId,
    p_order: orderId,
  });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) ?? null;
  return { ok: r?.ok === true, motiv: r?.motiv ?? "necunoscut" };
}

export function mesajulAnularii(motiv: string): string {
  switch (motiv) {
    case "prea-tarziu":
      return "Comanda a intrat deja in lucru si nu se mai poate anula de aici. Scrie magazinului.";
    case "marketplace":
      return "Comanda asta vine de pe un marketplace, iar anularea se face acolo.";
    case "platita":
      return "Comanda e deja platita, deci o anuleaza magazinul, care iti si intoarce banii. Scrie-i.";
    case "plata-online":
      return "Comenzile platite online se anuleaza de magazin, ca plata sa nu ramana pe drum. Scrie-i.";
    case "negasita":
      return "Comanda nu se poate anula.";
    default:
      return "Nu am putut anula comanda. Incearca din nou.";
  }
}

export async function exportulMeu(businessId: string, contId: string): Promise<unknown> {
  const { data, error } = await createAdminClient().rpc("cont_export", {
    p_business: businessId,
    p_cont: contId,
  });
  if (error) throw error;
  return data ?? {};
}

export async function stergeContul(
  businessId: string,
  contId: string,
): Promise<{ ok: boolean; comenziRamase: number }> {
  const { data, error } = await createAdminClient().rpc("cont_sterge", {
    p_business: businessId,
    p_cont: contId,
  });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) ?? null;
  return { ok: r?.ok === true, comenziRamase: Number(r?.comenzi_ramase ?? 0) };
}

/** Contul are parola? (Conturile facute inainte de 24.09.2026 n-au, si o pot seta din cont.) */
export async function areParola(businessId: string, contId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("cont_parola_contului", { p_business: businessId, p_cont: contId });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  return r?.are_parola === true;
}
