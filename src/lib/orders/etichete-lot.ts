/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETELE MAI MULTOR COMENZI, INTR-UN SINGUR DOCUMENT        (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de un comerciant prin suport. Masurat inainte de a scrie o linie: in toata
 * viata platformei s-au emis 273 de etichete, si 267 dintre ele sunt ale unui singur
 * magazin, pe Woot (DPD 5, Sameday 1, restul ZERO). Acelasi magazin face intre 4 si 18
 * AWB-uri pe zi, iar azi le descarca una cate una, deschizand cate o fereastra pe
 * comanda. De aici vine lotul.
 *
 * ⚠ AICI NU E NICIO CERERE CATRE CURIER, dinadins. Fisierul asta hotaraste DOAR
 * „a cui e eticheta comenzii" si „de ce nu se poate lua", ca regulile sa poata fi
 * probate fara sa mimez saptesprezece API-uri. Aducerea octetilor sta in
 * `eticheta-sursa.ts`, lipirea lor in ruta.
 */

/** Curierii care pot avea o eticheta de adus pentru o comanda. */
export type CurierEticheta =
  | "woot" | "cargus" | "sameday" | "fancourier" | "dpd" | "colete"
  | "gls" | "ecolet" | "pallex" | "innoship" | "packeta" | "smartship"
  | "shipo" | "fedex" | "ups" | "dhl";

/** Numele omenesc, pentru mesajele catre comerciant. */
export const NUMELE_CURIERULUI: Record<CurierEticheta, string> = {
  woot: "Woot", cargus: "Cargus", sameday: "Sameday", fancourier: "FAN Courier",
  dpd: "DPD", colete: "Colete Online", gls: "GLS", ecolet: "eColet",
  pallex: "Pall-Ex", innoship: "Innoship", packeta: "Packeta",
  smartship: "SmartShip", shipo: "Shipo", fedex: "FedEx", ups: "UPS", dhl: "DHL",
};

/**
 * Coloana care spune ca expedierea EXISTA la curierul acela.
 *
 * ⚠ NU E MEREU UN „NUMAR DE AWB", si aici sta capcana. La Woot identitatea expedierii
 * e `woot_order_id`, fiindca numarul lipseste la platile cu cardul; la Packeta e
 * `packeta_packet_id`; la Colete si eColet, identificatorii lor de comanda. Cazuta pe
 * o coloana de AWB care nu se completeaza, verificarea ar fi spus „comanda n-are
 * eticheta" despre un colet care exista si e platit.
 *
 * ⚠ La DPD e `dpd_awb_number`, NU `dpd_shipment_id`: cel de-al doilea e cheia de
 * idempotenta a emiterii (vezi `bulk-orders.actions.ts`), iar eticheta se cere pe
 * numarul de AWB. Sunt doua coloane deosebite, si tocmai fiindca amandoua exista,
 * confuzia nu ar fi cazut nici la `tsc`, nici la citire.
 */
export const COLOANA_EXPEDIERII: Record<CurierEticheta, string> = {
  woot: "woot_order_id",
  cargus: "cargus_awb_number",
  sameday: "sameday_awb_number",
  fancourier: "fan_courier_awb_number",
  dpd: "dpd_awb_number",
  colete: "colete_order_id",
  gls: "gls_awb_number",
  ecolet: "ecolet_order_to_send_id",
  pallex: "pallex_awb_number",
  innoship: "innoship_awb_number",
  packeta: "packeta_packet_id",
  smartship: "smartship_awb_number",
  shipo: "shipo_awb_number",
  fedex: "fedex_awb_number",
  ups: "ups_awb_number",
  dhl: "dhl_awb_number",
};

/**
 * Ordinea in care se cauta curierul unei comenzi.
 *
 * ⚠ CONTEAZA, fiindca o comanda POATE purta doua expedieri: una anulata la un curier
 * si una buna la altul, sau un AWB emis din greseala si reluat in alta parte. Ordinea
 * e cea a traficului real masurat pe 21.09.2026 (Woot 267, DPD 5, Sameday 1, restul
 * zero), deci in practica prima potrivire e si singura.
 *
 * ⚠ Lista se tine LANGA `COLOANA_EXPEDIERII` si proba cere sa aiba exact aceleasi
 * chei: un curier nou adaugat doar intr-una din ele ar fi disparut tacut din loturi.
 */
export const ORDINEA_CAUTARII: CurierEticheta[] = [
  "woot", "dpd", "sameday", "cargus", "fancourier", "gls", "colete", "ecolet",
  "pallex", "innoship", "packeta", "smartship", "shipo", "fedex", "ups", "dhl",
];

/** Cine tine eticheta comenzii, sau `null` daca n-are niciuna. */
export function curierulEtichetei(rand: Record<string, unknown>): CurierEticheta | null {
  for (const curier of ORDINEA_CAUTARII) {
    const v = rand[COLOANA_EXPEDIERII[curier]];
    if (v === null || v === undefined) continue;
    /*
     * ⚠ SIRUL GOL NU E O EXPEDIERE. O coloana scrisa cu `""` de o reparatie sau de un
     * import ar fi trecut de un simplu `!= null`, si lotul ar fi cerut curierului
     * eticheta unui AWB inexistent: o eroare la fiecare rulare, pe o comanda care de
     * fapt n-are nimic de descarcat.
     */
    if (typeof v === "string" && v.trim() === "") continue;
    /* La eColet identificatorul e NUMERIC, iar zero nu e un id valid. */
    if (typeof v === "number" && !(v > 0)) continue;
    return curier;
  }
  return null;
}

/**
 * Curierii care NU pot intra intr-un document lipit, si de ce.
 *
 * ⚠ Nu toate etichetele sunt PDF-uri, si asta nu e un amanunt: UPS intoarce un GIF,
 * iar GLS si eColet pot intoarce ZPL, care e TEXT pentru imprimanta termica. Lipite
 * fara sa se uite nimeni la ele, ar fi rupt documentul sau ar fi iesit pagini goale.
 * Deci se spun pe nume, se sar, si comerciantul le ia din randul comenzii, ca pana
 * acum.
 *
 * ⚠ Posta Romana nu apare nici macar in `CurierEticheta`: API-ul lor nu da eticheta
 * deloc, se tipareste din aplicatia lor. Vezi `PostaAwbModal`.
 */
export const NU_INTRA_IN_DOCUMENT: Partial<Record<CurierEticheta, string>> = {
  ups: "UPS trimite eticheta ca GIF, nu ca PDF, deci nu poate intra în documentul lipit.",
};

/** Mesajul pentru o comanda care n-are nicio expediere. */
export const FARA_EXPEDIERE =
  "Comanda nu are AWB emis la niciun curier, deci nu are etichetă de descărcat.";

/**
 * Numele documentului care aduna etichetele.
 *
 * ⚠ Poarta si data, fiindca omul descarca loturi in fiecare zi si toate ar fi ajuns
 * in Descarcari cu acelasi nume, peste care browserul pune „(1)", „(2)". Cand vine
 * vremea sa tipareasca, nu mai stie care e cel de azi.
 */
export function numeleDocumentului(cate: number, ziua: Date): string {
  const z = String(ziua.getDate()).padStart(2, "0");
  const l = String(ziua.getMonth() + 1).padStart(2, "0");
  return `etichete-${cate}-${z}.${l}.${ziua.getFullYear()}.pdf`;
}
