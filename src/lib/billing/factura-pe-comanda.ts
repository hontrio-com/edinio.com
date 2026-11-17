/**
 * „Are comanda o factura fiscala emisa?" — O SINGURA intrebare, pentru toate casele de facturare.
 *
 * ═══ DE CE EXISTA ═══
 *
 * Intrebarea era scrisa de mana in sapte locuri (dispecerul automat, lotul, editarea comenzii,
 * adaugarea de produse, easySales, About You, Posta), ca un sir de `||` peste coloanele fiecarei
 * case. La fiecare casa noua trebuia gasit fiecare loc; unul uitat inseamna o a doua factura fiscala
 * pentru aceeasi comanda (dispecerul ar fi emis la alta casa) sau marfa schimbata pe o comanda deja
 * facturata. La a sasea casa, sirul a devenit functia de aici.
 *
 * ⚠ CHEIA, NU NUMARUL, la casele care intorc la emitere doar id-ul documentului (Facturis,
 * Factureaza.ro, easybill): numarul se citeste dupa, iar o factura cu cheie si fara numar EXISTA.
 *
 * ⚠ Selecturile raman scrise de mana in fiecare loc (sirurile literale tin tipurile Supabase); proba
 * `factura-pe-comanda.test.ts` cere ca fiecare loc care intreaba sa ceara si coloanele de aici.
 *
 * ⚠ DOCUMENTUL DIN SANDBOX-UL FACTUREAZA.RO NU E FACTURA. Cheia lui are forma `test:<id>`
 * (`eDocumentDeTestFactureaza`): nu e fiscal, deci nu opreste facturarea automata, lotul sau
 * editarea comenzii. Altfel, dupa trecerea pe contul real, comanda ramanea pe veci „facturata” de
 * un document de proba, iar stornarea lui (singura iesire oferita) e refuzata pe contul real.
 *
 * Modul pur: se cheama si din server, si din componente.
 */
import { eDocumentDeTestFactureaza } from "@/lib/factureaza/config";


/** Coloanele care spun ca exista o factura emisa, in ordinea dispecerului. */
export const COLOANE_FACTURA_EMISA = [
  "smartbill_invoice_number",
  "oblio_invoice_number",
  "fgo_invoice_number",
  "facturis_invoice_key",
  "factureaza_invoice_key",
  "easybill_invoice_key",
] as const;

export type ColoanaFacturaEmisa = (typeof COLOANE_FACTURA_EMISA)[number];

type RandCuFactura = { [K in ColoanaFacturaEmisa]?: unknown };

const plin = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : v != null && v !== false);

/** Coloana poarta un document FISCAL: plina, si nu cheia unui document din sandbox. */
const fiscala = (c: ColoanaFacturaEmisa, v: unknown) =>
  plin(v) && !(c === "factureaza_invoice_key" && eDocumentDeTestFactureaza(String(v)));

/** Exista o factura fiscala emisa, la oricare casa? */
export function areFacturaEmisa(o: RandCuFactura | null | undefined): boolean {
  if (!o) return false;
  return COLOANE_FACTURA_EMISA.some((c) => fiscala(c, o[c]));
}

type RandCuNumar = RandCuFactura & {
  facturis_invoice_series?: string | null; facturis_invoice_number?: string | null;
  factureaza_invoice_series?: string | null; factureaza_invoice_number?: string | null;
  easybill_invoice_series?: string | null; easybill_invoice_number?: string | null;
};

/**
 * Cum se numeste factura in mesaje: numarul ei, sau numele casei cat timp numarul nu s-a citit.
 * `null` cand nu exista factura.
 */
export function etichetaFacturiiEmise(o: RandCuNumar | null | undefined): string | null {
  if (!o) return null;
  for (const c of ["smartbill_invoice_number", "oblio_invoice_number", "fgo_invoice_number"] as const) {
    if (plin(o[c])) return String(o[c]).trim();
  }
  const cuCheie: [ColoanaFacturaEmisa, string | null | undefined, string | null | undefined, string][] = [
    ["facturis_invoice_key", o.facturis_invoice_series, o.facturis_invoice_number, "Facturis"],
    ["factureaza_invoice_key", o.factureaza_invoice_series, o.factureaza_invoice_number, "Factureaza.ro"],
    ["easybill_invoice_key", o.easybill_invoice_series, o.easybill_invoice_number, "easybill"],
  ];
  for (const [cheie, serie, numar, casa] of cuCheie) {
    if (fiscala(cheie, o[cheie])) return [serie, numar].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") || casa;
  }
  return null;
}
