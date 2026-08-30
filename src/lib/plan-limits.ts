export const PLAN_PRODUCT_LIMITS: Record<string, number> = {
  free:    10,
  basic:   500,
  premium: 2500,
  ultra:   Infinity,
};

export function getProductLimit(plan: string): number {
  return PLAN_PRODUCT_LIMITS[plan] ?? PLAN_PRODUCT_LIMITS.free;
}

export function isAtProductLimit(plan: string, currentCount: number): boolean {
  const limit = getProductLimit(plan);
  return currentCount >= limit;
}

/**
 * Cate produse are contul, PESTE TOATE magazinele lui.
 *
 * Limita de plan se numara pe cont (`users_profile.plan`), dar verificarile o
 * numarau pe MAGAZIN (`.eq("business_id", …)`). Cine isi facea al doilea magazin
 * isi dubla astfel limita, al treilea o tripla — planul devenea decorativ.
 *
 * Fixul e aici, si NU o limita de magazine per cont: cate magazine poate avea
 * cineva e o decizie de produs, nu de securitate. Asa, limita spune exact ce
 * promite planul, indiferent cum isi imparte comerciantul catalogul.
 *
 * Impact la aplicare: NUL. Toate cele 127 de conturi din productie au exact un
 * magazin (verificat 2026-08-04), deci suma pe cont e identica cu numarul pe
 * magazin. Conteaza de acum incolo.
 */
export async function numaraProduseleContului(
  supabase: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
): Promise<number> {
  const { data: magazine } = await supabase
    .from("businesses").select("id").eq("user_id", userId);
  const iduri = (magazine ?? []).map((b: { id: string }) => b.id);
  if (iduri.length === 0) return 0;

  const { count } = await supabase
    .from("products").select("id", { count: "exact", head: true }).in("business_id", iduri);
  return count ?? 0;
}
