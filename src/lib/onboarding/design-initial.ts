import { buildClassicDesign } from "@/lib/storefront/design/defaults";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { stilDupaId } from "./aspect";

/*
 * Designul cu care se naste un magazin, din stilul ales la pasul „Aspectul".
 *
 * Designul clasic, cu antetul si subsolul stilului (marcate ca alese de om, ca
 * nimic sa nu le schimbe singur) si hero-ul aprins: un magazin nou n-are nici
 * bannere, nici slogan, deci fara semnul asta pagina ar fi inceput cu o grila goala.
 * Hero-ul NU primeste `variantOverride`: bannerele adaugate mai tarziu il trec
 * singure pe varianta cu imagini.
 *
 * Pura, ca s-o poata chema si `createBusiness`, si proba (`design-initial.test.ts`).
 */
export function designInitial(stilId: unknown, ctx: DesignContext): StoreDesign {
  const stil = stilDupaId(stilId);
  const baza = buildClassicDesign(ctx);
  return parseStoreDesign({
    ...baza,
    chrome: {
      ...baza.chrome,
      header: { ...baza.chrome.header, variant: stil.antet, variantOverride: stil.antet },
      footer: { ...baza.chrome.footer, variant: stil.subsol, variantOverride: stil.subsol },
    },
    home: baza.home.map((sec) => (sec.kind === "hero" ? { ...sec, enabled: true, enabledOverride: true } : sec)),
  }, ctx);
}
