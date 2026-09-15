/**
 * Declaratia de taxa logistica romaneasca, ceruta de Packeta de la 1 ianuarie 2026.
 *
 * ═══ ⚠ E LEGE, SI E FIX PIATA NOASTRA ═══
 *
 * Documentatia lor o spune limpede (`docs.packeta.com/guides/ro-logistics-tax`, actualizata pe
 * 30.07.2026):
 *
 *   „Starting from January 1, 2026, Romania has introduced new legislation that imposes a fixed
 *    tax on all packets originating from outside the European Union. This tax applies to packets
 *    where the price of the goods is less than EUR 150 at the time of ordering. Merchants and
 *    platforms handling packets to Romania must account for and apply this tax."
 *
 *   „Non-compliance: Please make sure your integration is updated to include this field. Omitting
 *    this data may result in non-compliance with Romanian regulations."
 *
 * ⚠ Integrarea noastra s-a scris pe 15.08.2026, DUPA ce pagina exista, si n-a prins-o. Motivul e
 * scris in memoria proiectului: documentatia s-a citit din depozitul lor de pe GitHub, care e
 * oprit in februarie 2026. Campul asta nu e acolo nici azi; e numai pe site.
 *
 * ═══ ⚠ CE SPUNE TABELUL DE STRUCTURI, SI E MAI BLAND DECAT GHIDUL ═══
 *
 * In `api-reference/data-structures`, `roLogisticsTaxDeclaration` e marcat **required: no**, iar
 * inauntru:
 *
 *   * `isSubjectToTax` (boolean), required: no;
 *   * `countryOfOrigin` (ISO 3166-1 alpha-2), required: **„If isSubjectToTax set to true"**.
 *
 * Deci blocul se poate OMITE cu totul. Si tocmai de aceea asta si facem cand comerciantul nu ne
 * spune nimic: o declaratie „nu e supus" pusa de noi ar fi o AFIRMATIE JURIDICA facuta in numele
 * lui, despre marfa lui, pe care n-avem cum s-o stim. Un magazin care aduce marfa din China ar
 * ajunge sa declare, prin noi, exact pe dos.
 *
 * ⚠ SI DE CE NU SE POATE DEDUCE. Taxa atarna de doua lucruri pe care platforma nu le are:
 * ORIGINEA marfii (nu tara expeditorului: un magazin din Bucuresti poate vinde marfa chinezeasca)
 * si PRETUL sub 150 EUR la momentul comenzii. Al doilea l-am putea socoti, primul nu.
 *
 * ⚠ DECI JUDECATA E A COMERCIANTULUI, iar noi ii dam doar mijlocul s-o spuna. Cand o spune, se
 * trimite intreaga, fiindca o declaratie pe jumatate e mai rea decat niciuna.
 */

/** Ce a declarat comerciantul in Setari. */
export type TaxaLogisticaRo = {
  /** `isSubjectToTax`: marfa e supusa taxei (marfa din afara UE, sub 150 EUR). */
  supusa?: boolean | null;
  /** `countryOfOrigin`: ISO 3166-1 alpha-2, tara de origine a marfii. */
  taraOrigine?: string | null;
};

/** Forma nodului, exact cum o cer ei. */
export type NodTaxaRo = { isSubjectToTax: string; countryOfOrigin: string };

/** Codurile de tara se scriu cu DOUA litere mari, cum cere ISO 3166-1 alpha-2. */
export function taraOrigineValida(x: unknown): string | null {
  const s = String(x ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/**
 * Nodul de trimis, sau `undefined` cand nu e nimic de declarat.
 *
 * ⚠ ARUNCA daca omul a spus „supusa" fara tara de origine. Documentatia lor o cere in acel caz,
 * iar o declaratie incompleta n-ar fi nici conformitate, nici tacere: ar fi un refuz al lor la
 * emitere, cu un mesaj pe care comerciantul nu-l poate lega de nimic. Mai bine cade AICI, unde
 * mesajul spune exact ce lipseste si unde nu s-a creat inca niciun colet.
 */
export function nodulTaxeiRo(d: TaxaLogisticaRo | null | undefined): NodTaxaRo | undefined {
  if (!d?.supusa) return undefined;

  const tara = taraOrigineValida(d.taraOrigine);
  if (!tara) {
    throw new Error(
      "Ai declarat ca trimiti marfa supusa taxei logistice din Romania, dar n-ai completat tara de"
      + " origine a marfii (doua litere, de exemplu CN). Completeaz-o in Setari, la Packeta.",
    );
  }

  /* ⚠ Booleanul pleaca ca text: tot corpul lor e XML, si `true`/`false` sunt chiar cuvintele din
     exemplul din documentatie. */
  return { isSubjectToTax: "true", countryOfOrigin: tara };
}
