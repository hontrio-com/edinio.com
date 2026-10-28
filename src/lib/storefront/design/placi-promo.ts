/*
  „Plăci de recomandare” (tema Jupiter, etapa 16.3 din `docs/editor-magazin/PLAN.md`), dupa sectiunea „Recomandări”
  de pe dedeman.ro: placi patrate cu imaginea pe un cerc, titlul si un link („Descoperă ofertele ›”). Pure: le citesc
  sectiunea si probele.
*/

export interface PlacaPromo {
  titlu: string;
  imagine: string;
  link: string;
  /** Textul linkului; gol = „Descoperă ofertele”. */
  eticheta: string;
}

/** Cate placi incap intr-o sectiune: doua randuri de cate patru. */
export const MAX_PLACI_PROMO = 8;

export const ETICHETA_PLACA_IMPLICITA = "Descoperă ofertele";

const sir = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Placile din reglaje, in ordine; una fara titlu si fara imagine n-are ce arata. */
export function placileDinSetari(setari: Record<string, unknown> | undefined): PlacaPromo[] {
  const lista = Array.isArray(setari?.placi) ? setari.placi : [];
  return lista
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .map((p) => ({ titlu: sir(p.titlu), imagine: sir(p.imagine), link: sir(p.link), eticheta: sir(p.eticheta) }))
    .filter((p) => p.titlu || p.imagine)
    .slice(0, MAX_PLACI_PROMO);
}
