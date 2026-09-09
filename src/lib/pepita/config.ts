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
 * Ce trebuie scris in configurare la PORNIREA integrarii, in afara de `activ` si de chei.
 *
 * ═══ ⚠ DE CE E O FUNCTIE, SI NU DOUA RANDURI IN ACTIUNE ═══
 *
 * Fiindca regula are un caz in care trebuie sa NU faca nimic, iar cazul acela nu se vede
 * din cod cand e scris in mijlocul unei actiuni care mai si genereaza chei. Aici se poate
 * proba de-a dreptul, pe amandoua ramurile.
 *
 * ═══ ⚠ CE REPARA ═══
 *
 * `citesteConfig` de mai sus citeste un `mod_includere` LIPSA ca „selectate”, adica „trimite
 * doar ce a bifat omul”, adica, pentru un magazin proaspat, NIMIC. Pana pe 09.09.2026
 * pornirea integrarii nu scria campul, deci fiecare magazin nou servea un `<Catalog>` valid
 * si gol. S-a intamplat la toate cele trei magazine cu Pepita pornit, si l-a gasit Pepita,
 * prin email, nu noi.
 *
 * ⚠ IMPLICITUL DIN `citesteConfig` RAMANE „selectate”, DINADINS. El apara un JSON stricat
 * sau golit de o salvare partiala: acolo directia sigura e „nu trimite”, nu „trimite tot”.
 * Ce se repara e alt lucru, mai ingust: cand omul APASA „pornește integrarea”, el chiar cere
 * sa vanda pe Pepita, deci lipsa campului nu mai are voie sa insemne tacere.
 *
 * ⚠ SI NU SE ATINGE O ALEGERE DEJA SCRISA. Cine a ales „doar produsele alese de mine”, apoi a
 * oprit si a repornit integrarea, si-ar fi vazut tot catalogul plecand fara sa fi cerut-o.
 * De asta se citeste JSON-ul BRUT: prin `citesteConfig` „nescris” si „scris selectate” arata la fel.
 */
export function peticDePornire(brut: unknown): Record<string, unknown> {
  const c = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const mod = c.mod_includere;
  if (mod === "toate" || mod === "selectate") return {};
  return { mod_includere: "toate" };
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

