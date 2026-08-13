/**
 * Culorile mărcilor, pentru rândul de deasupra titlului de pe paginile
 * „Edinio vs …".
 *
 * ═══ SUNT ALE LOR, DAR ÎNTUNECATE CÂT SĂ SE CITEASCĂ ═══
 *
 * ⚠ CULOAREA DE FIRMĂ NU E ÎNTOTDEAUNA CITIBILĂ PE ALB, și aici chiar nu e.
 * Măsurat contrastul fiecăreia pe fond alb (pragul pentru un text mic e 4,5):
 *
 *   Shopify   #95BF46  2,14  ✗      OpenCart  #1FBBEB  2,24  ✗
 *   Magento   #EC6737  3,20  ✗      Edinio    #1AB554  2,70  ✗
 *   WooCommerce #873EFF 5,04 ✓      Cartum    #1C1C1C 17,04 ✓
 *   Wix       #000000 21,00  ✓
 *
 * Patru din șapte pică, iar rândul e scris cu majuscule de 13px pe un hero
 * deschis — adică exact cazul în care un text slab se pierde de tot.
 *
 * Fiecare culoare căzută a fost COBORÂTĂ ÎN LUMINOZITATE, păstrând nuanța și
 * saturația, până trece pragul. Rămâne verdele lor, albastrul lor, portocaliul
 * lor — doar mai închis. Nu e o culoare aleasă de mine: e a lor, dusă până la
 * primul punct în care se poate citi.
 *
 * ⚠ Contrastele de mai jos sunt măsurate pe ALB. Hero-ul are o lumină verde
 * foarte palidă, deci în practică sunt cu foarte puțin mai mici; pragul de 4,5 e
 * ținut cu marja pe care o dă rotunjirea, iar toate ies între 4,51 și 4,59.
 */

export interface MarcaVersus {
  /** Numele, scris cum îl scrie marca. */
  nume: string;
  /** Culoarea la care se scrie: a mărcii, întunecată dacă a fost nevoie. */
  culoare: string;
  /** Culoarea de firmă, neatinsă — ca să se vadă de unde vine cea de sus. */
  deFirma: string;
  /** Contrastul culorii folosite, pe alb. */
  contrast: number;
}

export const CULORI_MARCI = {
  /* A noastră. ⚠ Verdele mărcii (#1AB554) dă 2,70 pe alb — nici el nu trece, deci
     e întunecat la fel ca ale lor. Aceeași măsură pentru toți. */
  edinio: { nume: "Edinio", culoare: "#14883F", deFirma: "#1AB554", contrast: 4.54 },

  shopify: { nume: "Shopify", culoare: "#63802C", deFirma: "#95BF46", contrast: 4.51 },
  /* Cartum și Wix scriu deja în negru: trec fără să fie atinse. */
  cartum: { nume: "Cartum", culoare: "#1C1C1C", deFirma: "#1C1C1C", contrast: 17.04 },
  wix: { nume: "Wix", culoare: "#000000", deFirma: "#000000", contrast: 21 },
  woocommerce: {
    nume: "WooCommerce",
    culoare: "#873EFF",
    deFirma: "#873EFF",
    contrast: 5.04,
  },
  opencart: { nume: "OpenCart", culoare: "#0E7FA2", deFirma: "#1FBBEB", contrast: 4.59 },
  magento: { nume: "Magento", culoare: "#D24614", deFirma: "#EC6737", contrast: 4.54 },
} as const satisfies Record<string, MarcaVersus>;

export type VersusKey = Exclude<keyof typeof CULORI_MARCI, "edinio">;
