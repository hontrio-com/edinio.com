/*
  Ce spune lista despre o comanda intr-un rand de text: ce produse are, unde pleaca, cum se
  plateste, si ce se poate face acum cu expedierea ei.

  ⚠ Modul PUR, fara JSX: aceleasi propozitii in toate asezarile, si probate o singura data.
*/

import type { Sigla } from "@/lib/integrari/sigle";
import type { AwbComanda, ComandaLista } from "./date";

/** „Veioză ceramică Luna și încă 1”. */
export function rezumatProduse(c: ComandaLista): string {
  if (c.produse.length === 0) return "Fără produse";
  const primul = c.produse[0];
  const cap = primul.cantitate > 1 ? `${primul.cantitate} × ${primul.nume}` : primul.nume;
  return c.produse.length > 1 ? `${cap} și încă ${c.produse.length - 1}` : cap;
}

/** Unde pleaca, pe scurt. */
export function rezumatLivrare(c: ComandaLista): string {
  const l = c.livrare;
  switch (l.fel) {
    case "punct": return l.detaliu ? `Punct de ridicare: ${l.detaliu}` : "Punct de ridicare";
    case "ridicare": return "Ridicare din magazin";
    case "proprie": return l.detaliu ? `Livrare proprie, ${l.detaliu}` : "Livrare proprie";
    case "marketplace": return "Livrată de marketplace";
    case "adresa": return l.detaliu ?? "La adresă";
    default: return l.detaliu ?? "Fără adresă";
  }
}

/** Cum se plateste, intr-un rand. `atentie`: banii n-au venit, desi trebuiau sa vina inainte de expediere. */
export function rezumatPlata(c: ComandaLista): { text: string; atentie: boolean } {
  const p = c.plata;
  if (p.stare === "rambursata") return { text: `${p.eticheta}, rambursată`, atentie: false };
  if (p.laLivrare) return { text: p.stare === "platita" ? "Ramburs, încasat" : "Ramburs", atentie: false };
  /* Banii unei comenzi de marketplace ii tine marketplace-ul: „neplatita" acolo nu e o alarma. */
  if (c.sursa.marketplace) return { text: p.eticheta, atentie: false };
  return p.stare === "platita"
    ? { text: `${p.eticheta}, plătită`, atentie: false }
    : { text: `${p.eticheta}, neplătită`, atentie: true };
}

/** Ce scrie langa un AWB: starea de la curier, sau ca numarul inca se asteapta. */
export function stareaAwb(awb: AwbComanda, implicita?: string): string | null {
  if (awb.inCurs) return "Se emite, numărul vine de la curier";
  return awb.stare ?? awb.partener ?? implicita ?? null;
}

/* ── Ce se poate face cu expedierea unei comenzi ──────────────────────────── */

export type Expediere =
  /** Coletul exista: AWB-ul emis, sau expedierea pornita care inca nu are numar. */
  | { fel: "awb"; awb: AwbComanda }
  /** Un singur buton, cu sigla curierului comenzii; ceilalti curieri conectati stau intr-un meniu. */
  | { fel: "buton"; sigla: Sigla; refuz: string | null; altii: Sigla[] }
  /**
   * Marketplace-ul isi tine singur fluxul (eMAG, Trendyol): butonul cu sigla lui duce in pagina
   * comenzii, unde sta panoul lui de expediere. Curierii proprii raman in meniu.
   */
  | { fel: "marketplace"; sigla: Sigla; refuz: string | null; altii: Sigla[] }
  /** Clientul n-a ales un curier conectat: se alege dintre cei conectati. */
  | { fel: "alege"; altii: Sigla[]; refuz: string | null }
  | { fel: "text"; text: string; cu: "magazin" | "camion" };

export function expediere(c: ComandaLista): Expediere {
  const l = c.livrare;
  if (l.awb) return { fel: "awb", awb: l.awb };
  if (l.fel === "ridicare") return { fel: "text", text: "Ridicare din magazin", cu: "magazin" };
  if (l.fel === "proprie") return { fel: "text", text: "Livrare proprie", cu: "camion" };
  if (l.fel === "marketplace") return { fel: "text", text: "Livrată de marketplace", cu: "camion" };
  /*
    O comanda incheiata nu mai are ce expedia: un buton de AWB pe una anulata, restituita sau
    deja livrata e un buton care n-are voie sa fie apasat. Se spune doar cum a ramas. (O
    reexpediere pe o comanda livrata ramane posibila din pagina ei.)
  */
  if (c.status.cheie === "cancelled" || c.status.cheie === "refunded") return { fel: "text", text: "Neexpediată", cu: "camion" };
  if (c.status.cheie === "delivered") {
    return { fel: "text", text: c.sursa.marketplace ? `Livrată prin ${c.sursa.eticheta}` : "Livrată fără AWB", cu: "camion" };
  }
  /* Curierul comenzii si ceilalti, intr-o singura lista: la marketplace toti stau in meniu. */
  const proprii = l.curier ? [l.curier, ...l.altii] : l.altii;
  if (c.sursa.cuFluxPropriu && c.sursa.logo) {
    return { fel: "marketplace", sigla: { cheie: "marketplace", nume: c.sursa.eticheta, logo: c.sursa.logo }, refuz: l.refuz, altii: proprii };
  }
  if (l.curier) return { fel: "buton", sigla: l.curier, refuz: l.refuz, altii: l.altii };
  if (l.altii.length > 0) return { fel: "alege", altii: l.altii, refuz: l.refuz };
  return { fel: "text", text: "Niciun curier conectat", cu: "camion" };
}
