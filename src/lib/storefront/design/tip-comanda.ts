import { checkoutOnPage } from "./commerce";
import { sectionMeta, variantMeta, type VariantMeta } from "./registry";
import type { SectionInstance, StoreDesign } from "./types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  TIPUL DE CHECKOUT (etapa 15 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el (28.10.2026): „practic trebuie sa il facem cumva din Setari de aici sa selecteze tipul de Checkout,
  Standard cu sau Formular de comanda”. Raspunsul lui la intrebare: „În Setări > Comanda”.

  Pana atunci tipul era VARIANTA de design a sectiunii `checkout`, aleasa din „Schimbă designul”. Acum se tine in
  `page_content.checkout_config.tip`, langa campurile formularului, si se salveaza direct, ca restul setarilor: nu-l
  ating nici „Publică”, nici istoricul versiunilor, fiindca nu sta in design.

  ⚠ SE APLICA LA CITIRE, ca pagina principala proprie (`aplicaPaginaAcasa`): `resolveDesign` pentru rutele
  magazinului, editorul pentru previzualizare, lista din „Pagini”. Dupa el, `checkoutOnPage` ramane singurul raspuns
  la „pagina sau fereastra”. Fara tip salvat, designul decide, ca inainte, deci magazinele de azi nu se schimba.
*/

export const TIPURI_COMANDA = ["fereastra", "pagina"] as const;
export type TipComanda = (typeof TIPURI_COMANDA)[number];

/** Numele din panou, din arbore si din ghid. */
export const ETICHETA_TIP_COMANDA: Record<TipComanda, string> = {
  fereastra: "Formular de comandă, în fereastră",
  pagina: "Standard, pagină de finalizare",
};

export function esteTipComanda(v: unknown): v is TipComanda {
  return typeof v === "string" && (TIPURI_COMANDA as readonly string[]).includes(v);
}

/** Tipul salvat in Setări > Comanda, sau `null` cand lipseste (ori e o valoare necunoscuta). */
export function tipComandaDinPageContent(pageContent: unknown): TipComanda | null {
  if (!pageContent || typeof pageContent !== "object") return null;
  const config = (pageContent as Record<string, unknown>).checkout_config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const tip = (config as Record<string, unknown>).tip;
  return esteTipComanda(tip) ? tip : null;
}

/** Tipul pe care il are designul (dupa `aplicaTipulComenzii`, cel pe care il vad clientii). */
export function tipulComenzii(design: StoreDesign): TipComanda {
  return checkoutOnPage(design) ? "pagina" : "fereastra";
}

/** Tipul unei variante a sectiunii `checkout`. */
export function tipulVariantei(variant: string): TipComanda {
  return variantMeta("checkout", variant)?.surface === "page" ? "pagina" : "fereastra";
}

/** Prima varianta a sectiunii `checkout` de tipul cerut, in ordinea din registry. */
function primaVariantaDeTip(tip: TipComanda): string | undefined {
  return Object.keys(sectionMeta("checkout")?.variants ?? {}).find((v) => tipulVariantei(v) === tip);
}

/**
 * Designul cu tipul de checkout ales. Varianta sectiunii se schimba DOAR cand nu se potriveste cu tipul, deci un
 * design de pagina ales anume ramane. `null` (nimic salvat) lasa designul neatins.
 */
export function aplicaTipulComenzii(design: StoreDesign, tip: TipComanda | null): StoreDesign {
  if (!tip || tipulComenzii(design) === tip) return design;
  const variant = primaVariantaDeTip(tip);
  if (!variant) return design;
  return { ...design, commerce: { ...design.commerce, checkout: { ...design.commerce.checkout, variant } } };
}

/**
 * Design-urile intre care se poate alege la o sectiune, pentru „Schimbă designul” si galeria lui. La finalizarea
 * comenzii, doar cele de acelasi tip cu varianta data: tipul se alege in Setări > Comanda, iar galeria nu mai e al
 * doilea loc pentru el (azi e o singura varianta pe fiecare tip, deci butonul nu apare).
 */
export function varianteDeAles(section: Pick<SectionInstance, "kind" | "variant">): [string, VariantMeta][] {
  const variante = Object.entries(sectionMeta(section.kind)?.variants ?? {});
  if (section.kind !== "checkout") return variante;
  const tip = tipulVariantei(section.variant);
  return variante.filter(([cheie]) => tipulVariantei(cheie) === tip);
}
