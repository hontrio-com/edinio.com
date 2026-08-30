/**
 * Limitele pe care le declară eMAG pentru fiecare câmp, într-un singur loc.
 *
 * ═══ ⚠ DE CE EXISTĂ ═══
 *
 * Auditul din 24.08.2026, făcut cuvânt cu cuvânt după OpenAPI-ul lor v4.5.1, a găsit
 * cinci câmpuri pe care le trimiteam fără nicio pază. Niciunul n-a lovit încă acest
 * comerciant — dar niciunul n-ar fi dat o eroare pe care s-o putem citi: eMAG refuză
 * oferta întreagă, cu un mesaj despre un câmp, iar produsul rămâne nepublicat.
 *
 * Împrăștiate ca `.slice(0, 255)` prin cod, limitele se pierd: cea de la `name` era
 * scrisă, cea de la `characteristics.value` nu, și nimic nu arăta diferența.
 *
 * ═══ ⚠ TREI PURTĂRI, ȘI ALEGEREA E DUPĂ CE ÎNSEAMNĂ CÂMPUL ═══
 *
 *   TAIE     ce e descriere: nume, marcă, valoarea unei caracteristici. Coada pierdută
 *            supără mai puțin decât oferta nepublicată.
 *   REFUZĂ   ce e identitate: `part_number`. Un SKU tăiat nu e un SKU mai scurt — e
 *            ALT SKU. Trimis, ar lega oferta de alt produs sau ar face un duplicat,
 *            fără nicio eroare. Mai bine oprit aici, cu un mesaj în română.
 *   PLAFONEAZĂ ce e cantitate: stoc, garanție, zile de pregătire. „65535 bucăți" e
 *            destul de adevărat cât să se vândă; refuzat, ar opri vânzarea.
 */

/** Citate din OpenAPI eMAG v4.5.1, `ProductOfferSave` și sub-obiectele ei. */
export const LIMITE_EMAG = {
  /** `name` maxLength=255 */
  nume: 255,
  /** `part_number` maxLength=25 */
  partNumber: 25,
  /** `brand` maxLength=255 */
  marca: 255,
  /** `characteristics[].value` maxLength=255 */
  valoareCaracteristica: 255,
  /** `images[].url` și `attachments[].url` maxLength=1024 */
  adresa: 1024,
  /** `stock[].value` maximum=65535 */
  stoc: 65535,
  /** `handling_time[].value` maximum=255 */
  zilePregatire: 255,
  /** `warranty` maximum=255 (luni) */
  garantie: 255,
  /** `manufacturer[].name` și `eu_representative[].name` maxLength=200 */
  gpsrNume: 200,
  /** `…[].address` maxLength=500 */
  gpsrAdresa: 500,
  /** `…[].email` maxLength=100 */
  gpsrEmail: 100,
  /** „Maximum 10 sets" la manufacturer și eu_representative */
  gpsrSeturi: 10,
  /**
   * `safety_information` maxLength=16777215 în schema lor — adică practic nemărginit.
   *
   * ⚠ Se taie totuși, la 4.000. Limita lor e de tip „text lung în baza de date", nu o
   * hotărâre despre ce e rezonabil; iar un câmp fără margine în panou e o invitație să se
   * lipească acolo o fișă tehnică întreagă, care apoi pleacă la FIECARE ofertă a
   * magazinului, în fiecare încărcătură. Patru mii de semne înseamnă vreo două pagini de
   * avertismente, mai mult decât are orice produs.
   */
  gpsrSiguranta: 4000,
  /**
   * `CampaignProposal.stock` maximum=255.
   *
   * ⚠ MULT SUB CEL AL OFERTEI (65535), și asta e ușor de ratat: același cuvânt, „stoc",
   * cu două limite diferite după unde pleacă. Un magazin cu 4.863 de bucăți (măsurat pe
   * date reale) trimitea o propunere de campanie în afara intervalului, iar eMAG o
   * refuza întreagă.
   */
  stocCampanie: 255,
  /** `Measurement.length|width|height` maximum=999999 (mm) */
  masuraMm: 999999,
  /** `Measurement.weight` maximum=999999 (g) */
  masuraGrame: 999999,
  /** `CampaignProposal.voucher_discount` minimum=10 */
  reducereVoucherMin: 10,
  /** `CampaignProposal.voucher_discount` maximum=100 */
  reducereVoucherMax: 100,
  /** `OrderAttachment.name` maxLength=60. E numele pe care il vede CUMPARATORUL. */
  atasamentNume: 60,
} as const;

/** Taie un text la limita lor, păstrând începutul. Pentru descrieri. */
export function taiat(text: string | null | undefined, limita: number): string {
  return (text ?? "").slice(0, limita);
}

/**
 * Plafonează o cantitate între 0 și maximul lor, ca întreg.
 *
 * ⚠ Și `NaN` cade la 0. Trimis mai departe, ar fi ieșit din JSON ca `null` pe un câmp
 * obligatoriu, iar eMAG ar fi refuzat oferta cu un mesaj despre altceva.
 */
export function plafonat(valoare: number, maxim: number): number {
  if (!Number.isFinite(valoare)) return 0;
  return Math.min(maxim, Math.max(0, Math.floor(valoare)));
}

/**
 * `part_number` e prea lung?
 *
 * ⚠ Nu se taie, se ÎNTREABĂ. Vezi nota de sus: un SKU tăiat e alt SKU.
 */
export function partNumberPreaLung(pn: string): boolean {
  return pn.length > LIMITE_EMAG.partNumber;
}
