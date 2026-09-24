import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADRESA_GOALA, adresaDinBaza, type ProfilCont } from "./profil-reguli";

/**
 * Profilul contului: numele, telefonul si adresa de livrare, plus momentul pozei.
 *
 * ⚠ Telefonul si adresa NU sunt contacte: nu se confirma cu cod si nu leaga
 * comenzi de cont. Sunt numai ca formularul de comanda sa nu mai ceara aceleasi
 * date de fiecare data.
 */
export async function profilulContului(businessId: string, contId: string): Promise<ProfilCont> {
  const { data, error } = await createAdminClient().rpc("cont_profil", { p_business: businessId, p_cont: contId });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) ?? null;
  if (!r) return { nume: "", telefon: "", adresa: ADRESA_GOALA, pozaLa: null };
  return {
    nume: r.nume ?? "",
    telefon: r.telefon ?? "",
    adresa: adresaDinBaza(r.adresa),
    pozaLa: r.poza_la ?? null,
  };
}

/** Adresa pozei, cu momentul schimbarii in ea: browserul o tine minte, dar nu pe cea veche. */
export function adresaPozei(pozaLa: string | null): string | null {
  return pozaLa ? `/api/cont/poza?v=${encodeURIComponent(new Date(pozaLa).getTime().toString(36))}` : null;
}
