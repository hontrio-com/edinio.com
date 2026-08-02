/**
 * Contractul comun al modelelor de pagina de cos.
 *
 * Toate primesc exact aceste date, ca schimbarea designului sa fie o singura
 * linie in dispecer, nu o rescriere a rutei. Numerele vin din `store_settings`,
 * citite pe server: pe pagina de cos nu exista contextul de catalog al paginii
 * de magazin.
 */
import type { CartPricingInput } from "@/lib/storefront/cart/pricing";

export interface CartPageProps {
  color: string;
  basePath: string;
  businessId: string;
  shippingCost: number;
  freeShippingThreshold: number | null;
  minOrderAmount: number | null;
  /**
   * Regimul de TVA al magazinului. Lipsa = fara TVA in socoteala.
   *
   * Fara el, la magazinele cu preturi fara TVA cosul arata un total din care
   * lipsea taxa, iar la finalizare aparea alt numar, mai mare.
   */
  vat?: CartPricingInput["vat"];
  /** Ce se intampla la „Finalizeaza comanda": navigare sau deschiderea modalului. */
  onCheckout: () => void;
  /** Setarile variantei, din registry. */
  settings: Record<string, unknown>;
  /**
   * Miniatura din catalogul de design-uri: fara recomandari (ar fi cate o
   * interogare pe server pentru fiecare card) si fara evenimente de marketing.
   */
  preview?: boolean;
}
