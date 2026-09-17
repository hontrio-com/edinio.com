/**
 * Problemele unui produs, asa cum le arata panoul.
 *
 * ═══ ⚠ DE CE (masurat 17.09.2026) ═══
 *
 * Google intoarce ACEEASI problema o data pe fiecare suprafata (`reportingContext`): SHOPPING_ADS,
 * DISPLAY_ADS, FREE_LISTINGS, DEMAND_GEN_ADS, VIDEO_ADS, DEMAND_GEN_ADS_DISCOVER_SURFACE. La `mokka`,
 * cele 228 de probleme stocate erau 38 de produse × 2 probleme × 6 suprafete, iar panoul le arata pe
 * toate: sase randuri identice sub fiecare produs.
 *
 * Aici se strang dupa `code` + `attribute`, cu severitatea cea mai grava dintre suprafete si cu lista
 * suprafetelor afectate.
 *
 * ⚠ Linkul „cum rezolv” e `documentation` (proto v1, `ProductStatus.ItemLevelIssue`). Problemele scrise
 * inainte de 17.09.2026 pot avea doar `documentationUri`, deci se citesc amandoua.
 */

export interface ProblemaStocata {
  code?: string;
  severity?: string;
  resolution?: string;
  attribute?: string;
  reportingContext?: string;
  description?: string;
  detail?: string;
  documentation?: string;
  documentationUri?: string;
  applicableCountries?: string[];
}

export interface ProblemaDeAfisat {
  cheie: string;
  severitate: "DISAPPROVED" | "DEMOTED" | "NOT_IMPACTED";
  titlu: string;
  detaliu?: string;
  link?: string;
  suprafete: string[];
}

const GRAVITATE: Record<string, number> = { DISAPPROVED: 3, DEMOTED: 2, NOT_IMPACTED: 1 };

function severitateCunoscuta(s: string | undefined): ProblemaDeAfisat["severitate"] {
  const v = String(s ?? "").toUpperCase();
  return v === "DISAPPROVED" || v === "DEMOTED" ? v : "NOT_IMPACTED";
}

/** Ordinea: intai ce respinge produsul, apoi ce il retrogradeaza, apoi restul. */
export function problemeDeAfisat(probleme: ProblemaStocata[] | null | undefined): ProblemaDeAfisat[] {
  const dupaCheie = new Map<string, ProblemaDeAfisat>();
  for (const p of probleme ?? []) {
    if (!p || typeof p !== "object") continue;
    const cheie = `${p.code ?? p.description ?? ""}|${p.attribute ?? ""}`;
    const severitate = severitateCunoscuta(p.severity);
    const link = p.documentation || p.documentationUri || undefined;
    const existenta = dupaCheie.get(cheie);
    if (!existenta) {
      dupaCheie.set(cheie, {
        cheie, severitate,
        titlu: p.description || p.code || "Problemă",
        detaliu: p.detail || undefined,
        link,
        suprafete: p.reportingContext ? [p.reportingContext] : [],
      });
      continue;
    }
    if (GRAVITATE[severitate] > GRAVITATE[existenta.severitate]) existenta.severitate = severitate;
    if (!existenta.link && link) existenta.link = link;
    if (!existenta.detaliu && p.detail) existenta.detaliu = p.detail;
    if (p.reportingContext && !existenta.suprafete.includes(p.reportingContext)) existenta.suprafete.push(p.reportingContext);
  }
  return [...dupaCheie.values()].sort((a, b) => GRAVITATE[b.severitate] - GRAVITATE[a.severitate]);
}

/** Numele pe romaneste ale suprafetelor, pentru panou. Una necunoscuta se arata cum vine. */
const SUPRAFETE: Record<string, string> = {
  SHOPPING_ADS: "reclame Shopping",
  FREE_LISTINGS: "listări gratuite",
  DISPLAY_ADS: "reclame Display",
  DEMAND_GEN_ADS: "Demand Gen",
  DEMAND_GEN_ADS_DISCOVER_SURFACE: "Demand Gen (Discover)",
  VIDEO_ADS: "reclame video",
  LOCAL_INVENTORY_ADS: "inventar local",
  FREE_LOCAL_LISTINGS: "listări locale gratuite",
  CLOUD_RETAIL: "Cloud Retail",
  LOCAL_CLOUD_RETAIL: "Cloud Retail local",
};

export function numeleSuprafetei(context: string): string {
  return SUPRAFETE[context] ?? context;
}
