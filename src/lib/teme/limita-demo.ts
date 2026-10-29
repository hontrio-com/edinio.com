import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getProductLimit, numaraProduseleContului } from "@/lib/plan-limits";
import { pluralRo } from "@/lib/utils/format";
import { externalIdDemo } from "./import-demo";
import { SURSA_DEMO } from "./produse-demo";
import type { SetDateDemo } from "./tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LIMITA PLANULUI LA „Importă și datele demo” (etapa 18.2 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Produsele demo sunt randuri obisnuite in `products`, deci intra in limita de produse a planului ca oricare altele,
  numarata pe CONT (`numaraProduseleContului`), ca la adaugarea de mana si la importul din fisier: importul demo nu trece
  de ea. Se numara doar produsele temei care lipsesc din magazin (dupa cod), ca un import repetat sa nu fie oprit de
  cele de data trecuta.
*/

export interface LoculPentruDemo {
  /** Produsele demo care s-ar adauga acum. */
  noi: number;
  /** Limita planului; `null` = fara limita (Ultra). */
  limita: number | null;
  /** Produsele contului acum, pe toate magazinele lui. */
  produse: number;
  incap: boolean;
}

/** Cate produse ale temei lipsesc din magazin, dupa cod (`<tema>:<cheie>`). */
export function produseDemoNoi(tema: string, date: SetDateDemo, coduri: Iterable<string | null>): number {
  const are = new Set(coduri);
  return date.produse.filter((p) => !are.has(externalIdDemo(tema, p.cheie))).length;
}

export function loculPentruDemo(limita: number, produse: number, noi: number): LoculPentruDemo {
  const faraLimita = !Number.isFinite(limita);
  return { noi, limita: faraLimita ? null : limita, produse, incap: noi === 0 || faraLimita || produse + noi <= limita };
}

/** De ce nu incap datele demo: pe pagina „Teme”, sub bifa oprita, si in refuzul actiunii. */
export function motivulLimitei(loc: LoculPentruDemo): string {
  return `Datele demo adaugă ${pluralRo(loc.noi)}, iar planul tău permite ${pluralRo(loc.limita ?? 0)} (ai deja ${loc.produse.toLocaleString("ro-RO")}).`;
}

/**
 * Citirea, pentru pagina „Teme” si pentru `aplicaTema`, care o reface la apasare (pagina poate fi deschisa de mult).
 * ⚠ Un plan necitit e o eroare, nu „gratuit”: altfel un plan platit ar fi primit, pentru o clipa, limita celui gratuit
 * (ca la `lib/import/committer.ts`).
 */
export async function citesteLoculPentruDemo(
  supabase: SupabaseClient<Database>,
  userId: string,
  businessId: string,
  tema: string,
  date: SetDateDemo,
): Promise<LoculPentruDemo | { error: string }> {
  const [{ data: profil, error: ePlan }, { data: coduri, error: eCoduri }] = await Promise.all([
    supabase.from("users_profile").select("plan").eq("id", userId).single(),
    supabase.from("products").select("external_id").eq("business_id", businessId).eq("source", SURSA_DEMO),
  ]);
  if (ePlan) return { error: `planul: ${ePlan.message}` };
  if (eCoduri) return { error: `produsele demo: ${eCoduri.message}` };
  const produse = await numaraProduseleContului(supabase, userId);
  return loculPentruDemo(getProductLimit(profil?.plan ?? "free"), produse, produseDemoNoi(tema, date, (coduri ?? []).map((c) => c.external_id)));
}
