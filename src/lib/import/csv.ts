// CSV parsing via papaparse. Server-only. Handles the awkward bits of real
// exports: quoted multi-line fields (Shopify "Body (HTML)"), auto delimiter
// detection (comma/semicolon/tab), and a leading UTF-8 BOM.

import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  /**
   * Fisierul avea mai multe randuri decat plafonul, iar restul au fost taiate.
   * Cine cheama trebuie sa se uite la asta: o taiere nespusa arata exact ca un
   * fisier mai mic, si omul ramane convins ca a actualizat tot.
   */
  truncated?: boolean;
}

// Hard cap so a malicious/huge file can't exhaust memory or time. Plan limits
// (max 2500 products on the top tier) are enforced separately at commit time.
export const MAX_CSV_ROWS = 5000;

/**
 * Plafonul pentru feedurile de stoc.
 *
 * Mult mai mare decat cel de produse, si nu din nepasare: un feed de stoc are un
 * rand PER VARIANTA, nu per produs. Un magazin de echipamente de protectie cu
 * 1200 de produse are peste 12.000 de variante, deci plafonul de 5000 taia doua
 * treimi din fisier. Limita adevarata ramane cea de octeti (8MB), care se atinge
 * oricum pe la ~50.000 de randuri.
 */
export const MAX_STOCK_ROWS = 50000;

export function parseCsv(text: string, maxRows: number = MAX_CSV_ROWS): ParsedCsv {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    dynamicTyping: false,
  });

  const headers = (result.meta.fields ?? []).filter((h) => h && h.length > 0);

  const all = (result.data ?? []).filter(
    (r) => r && Object.values(r).some((v) => v != null && String(v).trim() !== ""),
  );

  return { headers, rows: all.slice(0, maxRows), truncated: all.length > maxRows };
}

export function cell(row: Record<string, string>, header: string | undefined): string {
  if (!header) return "";
  const v = row[header];
  return v == null ? "" : String(v);
}
