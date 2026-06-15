// CSV parsing via papaparse. Server-only. Handles the awkward bits of real
// exports: quoted multi-line fields (Shopify "Body (HTML)"), auto delimiter
// detection (comma/semicolon/tab), and a leading UTF-8 BOM.

import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

// Hard cap so a malicious/huge file can't exhaust memory or time. Plan limits
// (max 2500 products on the top tier) are enforced separately at commit time.
export const MAX_CSV_ROWS = 5000;

export function parseCsv(text: string): ParsedCsv {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    dynamicTyping: false,
  });

  const headers = (result.meta.fields ?? []).filter((h) => h && h.length > 0);

  const rows = (result.data ?? [])
    .filter((r) => r && Object.values(r).some((v) => v != null && String(v).trim() !== ""))
    .slice(0, MAX_CSV_ROWS);

  return { headers, rows };
}

export function cell(row: Record<string, string>, header: string | undefined): string {
  if (!header) return "";
  const v = row[header];
  return v == null ? "" : String(v);
}
