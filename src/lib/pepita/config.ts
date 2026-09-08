/**
 * `store_settings.pepita_config`, citit intr-o forma pe care codul o poate folosi.
 *
 * ⚠ MODUL PUR. Se cheama si de pe server (feed, ingest), si din componente de
 * panou. Nimic din el nu atinge baza si nimic nu e `server-only`.
 */

import { CONFIG_IMPLICIT, PIATA_IMPLICITA, PIETE, TIPURI_GARANTIE, type PepitaConfig, type TipGarantie } from "./types";
import { citesteStrategia } from "./pret";

function intreg(v: unknown, implicit: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : implicit;
}

function numarSauNul(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Configuratia salvata, adusa la forma completa.
 *
 * ⚠ NICIODATA NU ARUNCA si niciodata nu intoarce campuri lipsa. Un JSON scris de
 * o versiune mai veche, sau golit de o salvare partiala, trebuie sa dea o
 * integrare OPRITA, nu o exceptie in mijlocul unui feed.
 */
export function citesteConfig(brut: unknown): PepitaConfig {
  const c = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const piata = typeof c.piata === "string" && c.piata in PIETE ? (c.piata as PepitaConfig["piata"]) : PIATA_IMPLICITA;
  const g = (c.garantie && typeof c.garantie === "object" ? c.garantie : null) as { tip?: unknown; durata?: unknown } | null;
  const tipGarantie = TIPURI_GARANTIE.includes(g?.tip as TipGarantie) ? (g!.tip as TipGarantie) : null;
  const durata = intreg(g?.durata, 0);

  return {
    activ: c.activ === true,
    piata,
    strategie_pret: citesteStrategia(c.strategie_pret),
    safety_stock: intreg(c.safety_stock, CONFIG_IMPLICIT.safety_stock),
    shipping_delay: c.shipping_delay == null || c.shipping_delay === "" ? null : intreg(c.shipping_delay, 0),
    shipping_price: numarSauNul(c.shipping_price),
    /*
     * ⚠ „None" cu o durata n-are inteles, si nici un tip fara durata. Perechea se
     * ia intreaga sau deloc: trimisa pe jumatate, garantia ar aparea la ei ca
     * „Year 0", adica fara garantie, dar aratand ca are una.
     */
    garantie: tipGarantie && tipGarantie !== "None" && durata > 0 ? { tip: tipGarantie, durata } : null,
    mod_includere: c.mod_includere === "toate" ? "toate" : "selectate",
    trimis_la: typeof c.trimis_la === "string" ? c.trimis_la : null,
    factureaza_clientul: c.factureaza_clientul === true,
    feed_token: typeof c.feed_token === "string" ? c.feed_token : undefined,
    order_key: typeof c.order_key === "string" ? c.order_key : undefined,
  };
}

/**
 * Configuratia fara chei, forma in care poate cobori in browser.
 *
 * ⚠ CHEILE NU PLEACA CU CONFIGURATIA. Panoul le cere separat, printr-o actiune
 * care verifica din nou proprietatea, si numai cand omul apasa „Arata". Trimise
 * in randarea paginii, ar sta in payload-ul RSC al fiecarei incarcari, adica in
 * memoria browserului, in orice extensie si in orice partajare de ecran.
 */
export function configFaraChei(c: PepitaConfig): Omit<PepitaConfig, "feed_token" | "order_key"> & {
  areFeedToken: boolean;
  areOrderKey: boolean;
} {
  const { feed_token, order_key, ...restul } = c;
  return { ...restul, areFeedToken: !!feed_token, areOrderKey: !!order_key };
}

