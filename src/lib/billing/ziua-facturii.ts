/**
 * Ziua documentului fiscal, in CALENDARUL ROMANIEI.
 *
 * ═══ DE CE EXISTA ═══
 *
 * SmartBill, Oblio si fGO isi luau data din `new Date().toISOString().split("T")[0]`, adica ziua
 * UTC. Romania e cu doua ore (iarna) sau trei (vara) inaintea UTC, deci o factura emisa intre
 * miezul noptii si 02:00/03:00 purta data ZILEI DE DINAINTE. La cumpana lunii, documentul cadea
 * in alta luna de TVA (decontul se face pe luna documentului), iar scadenta se socotea de la ziua
 * gresita. Facturis, Factureaza.ro si easybill foloseau deja ziua Romaniei.
 *
 * Modul pur, fara dependinte: se cheama din actiuni si din constructorii de documente.
 */

const ZI = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** „YYYY-MM-DD”, ziua calendaristica din Romania in clipa data (implicit: acum). */
export function ziuaCalendaristica(acum: Date = new Date()): string {
  return ZI.format(acum);
}

/** Ziua `zi` („YYYY-MM-DD”) plus `zile` zile calendaristice, tot „YYYY-MM-DD”. Pentru scadente. */
export function ziuaPlus(zi: string, zile: number): string {
  const d = new Date(`${zi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.trunc(zile));
  return d.toISOString().slice(0, 10);
}
