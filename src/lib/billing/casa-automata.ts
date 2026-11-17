import { autoInvoiceTriggerMatches, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { facturisGata } from "@/lib/facturis/config";
import { factureazaGata } from "@/lib/factureaza/config";
import { easybillGata } from "@/lib/easybill/config";

/**
 * Casa care RASPUNDE de factura automata a unei comenzi, la o schimbare de stare.
 *
 * ═══ DE CE O SINGURA CASA ═══
 *
 * Dispecerul (`maybeAutoInvoice`) chema casele pe rand si trecea la urmatoarea ori de cate ori una
 * intorcea `false`. Dar fiecare intoarce `false` si cand emiterea EI cade (raspuns pierdut, termen,
 * eroare nelamurita). Cu doua case pe automat, un raspuns pierdut la prima (document poate emis,
 * cheia nescrisa pe comanda) lasa a doua sa emita in aceeasi trecere: doua facturi fiscale pentru
 * aceeasi vanzare, desi ecranele promit „se emite o singură factură”.
 *
 * Acum dispecerul alege INAINTE casa raspunzatoare (prima, in ordinea de mai jos, cu facturarea
 * automata pornita, configurarea gata si declansatorul potrivit), si o cheama numai pe ea, oricare
 * ar fi rezultatul. Daca ea nu reuseste, comanda ramane pentru calea manuala, cu motivul in jurnal.
 *
 * ⚠ CONDITIILE SUNT CHIAR CELE DE LA INCEPUTUL `maybeAutoGenerateInvoice` al fiecarei case. Mai
 * largi, ar alege o casa care apoi refuza tacut, iar comanda n-ar mai primi factura de la urmatoarea;
 * mai stramte, ar sari o casa care ar fi emis. Proba `casa-automata.test.ts` le tine aliniate.
 *
 * Modul pur: o singura citire a configurarilor, facuta de apelant.
 */

/** Ordinea dispecerului: aceeasi cu `COLOANE_FACTURA_EMISA` si cu lotul. */
export const CASE_AUTOMATE = ["smartbill", "oblio", "fgo", "facturis", "factureaza", "easybill"] as const;
export type CasaAutomata = (typeof CASE_AUTOMATE)[number];

type Config = Record<string, unknown>;

const obiect = (v: unknown): Config | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Config) : null;

/** „Gata” pe calea automata, exact ca in fiecare casa (verificari de adevar, ca acolo). */
const GATA: Record<CasaAutomata, (c: Config) => boolean> = {
  /* smartbill.actions.ts: `enabled`, apoi email, token, CUI si serie. */
  smartbill: (c) => !!c.enabled && !!c.email && !!c.token && !!c.company_vat_code && !!c.series_name,
  /* oblio.actions.ts si fgo.actions.ts: doar `enabled` (datele se verifica la emitere). */
  oblio: (c) => !!c.enabled,
  fgo: (c) => !!c.enabled,
  facturis: (c) => facturisGata(c),
  factureaza: (c) => factureazaGata(c),
  easybill: (c) => easybillGata(c),
};

/** Coloanele de citit din `store_settings`, ca dispecerul sa poata alege. */
export const COLOANE_CONFIG_AUTOMATE = CASE_AUTOMATE.map((c) => `${c}_config`).join(", ");

export function casaResponsabila(
  setari: Partial<Record<string, unknown>> | null | undefined,
  newStatus: string | undefined,
  newPaymentStatus: string | undefined,
): CasaAutomata | null {
  if (!setari) return null;
  for (const casa of CASE_AUTOMATE) {
    const c = obiect(setari[`${casa}_config`]);
    if (!c || !GATA[casa](c) || !c.auto_invoice) continue;
    if (!autoInvoiceTriggerMatches(c.auto_invoice_trigger as AutoInvoiceTrigger | undefined, newStatus, newPaymentStatus)) continue;
    return casa;
  }
  return null;
}
