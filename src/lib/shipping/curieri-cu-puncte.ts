/**
 * Curierii care livreaza si la punct (locker, punct de ridicare, oficiu postal), adica cei
 * pentru care `getLockers` are o ramura.
 *
 * Lista sta aici, nu in `shipping.actions.ts`: fisierul acela e `"use server"` si nu poate
 * exporta o constanta, iar panoul de livrare are nevoie de ea ca sa arate „Pret la punct”
 * doar la curierii care chiar au puncte (25.10.2026).
 */
export const CURIERI_CU_LOCKERE: ReadonlySet<string> = new Set([
  "sameday", "fan-courier", "dpd", "cargus", "gls", "posta", "innoship", "packeta",
  "smartship", "shipo", "ups", "curiera", "epacket",
]);
