/**
 * Formatele acceptate la incarcare. Constante, nimic altceva.
 *
 * Stau in fisier separat de `tabular.ts` pentru un motiv concret: parserul de
 * XLSX se incarca din `read-excel-file/node`, care ajunge la `fs`. Cand
 * componentele de client importau constantele direct din `tabular.ts`, tot
 * modulul intra in pachetul de browser si build-ul cadea cu
 * "Module not found: Can't resolve 'fs'".
 *
 * Aici nu e nimic care sa nu poata rula si in browser.
 */

export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xlsm"] as const;

export const ACCEPT_ATTRIBUTE =
  ".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Aceeasi regula ca la server, pentru verificarea rapida din browser. */
export function hasAcceptedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
