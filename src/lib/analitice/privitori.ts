import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CATI OAMENI S-AU UITAT LA UN PRODUS (etapa 12 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Contorul de vizitatori de pe pagina de produs scria „{n} persoane se uita acum”, cu
  `n = 18 + hash(id) % 10`: fix, intre 18 si 27, fara nicio masuratoare. Acum numara vederile
  de produs scrise deja in `site_analytics`: oameni DISTINCTI (`visitor_id`), fara cel care se
  uita chiar acum, in doua ferestre; comerciantul alege una din panoul blocului.

  ⚠ ROBOTII NU SUNT AICI fiindca nu se mai scriu deloc (`esteRobot` in `seMasoaraVizita`).
  Randurile scrise inainte de regula aceea ies singure din fereastra de 24 de ore.
*/

/** „Acum”: ultimele 15 minute. */
export const FEREASTRA_ACUM_MS = 15 * 60 * 1000;
/** „Ultimele 24 de ore”. */
export const FEREASTRA_ZI_MS = 24 * 60 * 60 * 1000;
/**
 * Cate vederi se citesc cel mult. Masurat pe 28.10.2026, produsul cel mai vazut din ultimele 24 de
 * ore avea 118 oameni, deci plafonul nu se atinge; daca se atinge, numarul e unul „cel putin”.
 */
export const PLAFON_VEDERI = 2000;

export interface Privitori {
  /** Altii, in ultimele 15 minute. */
  acum: number;
  /** Altii, in ultimele 24 de ore. */
  zi: number;
}

/**
 * Din vederile unui produs: cati oameni distincti, in fiecare fereastra, fara cei din `exclusi`.
 *
 * ⚠ Distincti, nu vederi: cine reincarca pagina de cinci ori e un om, nu cinci.
 */
export function numaraPrivitorii(
  vederi: readonly { visitor_id: string | null; created_at: string }[],
  exclusi: readonly string[],
  acumMs: number,
): Privitori {
  const fara = new Set(exclusi);
  const zi = new Set<string>();
  const acum = new Set<string>();
  for (const v of vederi) {
    if (!v.visitor_id || fara.has(v.visitor_id)) continue;
    const cand = Date.parse(v.created_at);
    if (!Number.isFinite(cand)) continue;
    const vechime = acumMs - cand;
    if (vechime < 0 || vechime > FEREASTRA_ZI_MS) continue;
    zi.add(v.visitor_id);
    if (vechime <= FEREASTRA_ACUM_MS) acum.add(v.visitor_id);
  }
  return { acum: acum.size, zi: zi.size };
}

/**
 * Privitorii unui produs, pentru amandoua ferestrele, dintr-o singura citire.
 *
 * ⚠ `null` la orice piedica. Pastila nu apare, iar pagina de produs se randeaza mai departe: un
 * contor nu are voie sa strice o pagina pe care se cumpara.
 *
 * ⚠ Fara index nou: `(business_id, created_at desc)` taie la ziua magazinului, iar cel mai mare
 * magazin avea ~10.000 de evenimente pe zi (28.10.2026).
 */
export async function privitoriiProdusului(
  db: SupabaseClient<Database>,
  { businessId, productId, exclusi, acum = new Date() }: {
    businessId: string;
    productId: string;
    exclusi: readonly string[];
    acum?: Date;
  },
): Promise<Privitori | null> {
  try {
    const deLa = new Date(acum.getTime() - FEREASTRA_ZI_MS).toISOString();
    const { data, error } = await db
      .from("site_analytics")
      .select("visitor_id, created_at")
      .eq("business_id", businessId)
      .eq("product_id", productId)
      .eq("event_type", "product_view")
      .gte("created_at", deLa)
      .not("visitor_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(PLAFON_VEDERI);
    if (error) return null;
    return numaraPrivitorii(data ?? [], exclusi, acum.getTime());
  } catch {
    return null;
  }
}
