import { CircleArrowUp, Layers, Package, ShoppingCart, Sparkles, Gift, Repeat, TrendingUp, type LucideIcon } from "lucide-react";
import { DESPRE_TIPUL_OFERTEI, TIPURI_CARE_SE_POT_FACE, type OfferType } from "@/lib/offers/offer.types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICONIȚA FIECĂRUI TIP DE OFERTĂ                                (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ SINGURUL LUCRU DESPRE TIPURI CARE NU STĂ ÎN `lib/offers/offer.types.ts`, și
 * anume fiindcă e un import din `lucide-react`: tabelul de acolo e încărcat și
 * de server, la fiecare rezolvare de ofertă din vitrină, iar o bibliotecă de
 * iconițe n-are ce căuta pe drumul acela.
 *
 * ⚠⚠ DE-AIA ARE O PROBĂ CARE CERE ACELEAȘI CHEI ca tabelul de acolo
 * (`tipurile-de-oferta-sunt-intr-un-singur-loc.test.ts`). Un tip nou adăugat
 * acolo și uitat aici ar fi căzut pe `Sparkles` fără nicio eroare — adică exact
 * felul de tăcere pe care mutarea asta o închide.
 *
 * Etichetele, explicațiile și steagurile („are reducere", „un singur produs")
 * NU se mai scriu aici: erau scrise de cinci ori, iar una din cele cinci liste
 * n-avea niciun cititor.
 */
export const ICOANA_TIPULUI: Record<OfferType, LucideIcon> = {
  frequently_bought: Layers,
  cross_sell: Package,
  order_bump: ShoppingCart,
  upgrade: CircleArrowUp,
  volume: TrendingUp,
  post_purchase: Repeat,
  bogo: Repeat,
  gift: Gift,
  spend_reward: Sparkles,
};

/** Ce știe panoul despre un tip: tot ce e în tabelul comun, plus iconița. */
export function metaTip(type: OfferType) {
  return { ...DESPRE_TIPUL_OFERTEI[type], type, icon: ICOANA_TIPULUI[type] ?? Sparkles };
}

/**
 * Tipurile pe care le arată formularul, în ordinea din tabelul comun.
 *
 * ⚠ Se derivă, nu se scriu: erau patru înșirate de mână în `OfferForm.tsx`, iar
 * un tip devenit gata de folosit trebuia mutat pe listă cu mâna.
 */
export const TIPURI_DE_ALES = TIPURI_CARE_SE_POT_FACE.map(metaTip);
export type MetaTip = ReturnType<typeof metaTip>;
