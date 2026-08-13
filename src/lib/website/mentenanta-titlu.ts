/**
 * Titlul paginii „Mentenanță gratuită", rupt în bucăți.
 *
 * Stă aici, nu în componentă, ca proba să poată compune la loc textul citit și
 * să-l compare cu cel scris. Titlul era un șir simplu pe pagină; a fost desfăcut
 * când clientul a cerut (13.08) ca „tehnică" să stea între paranteze drepte.
 *
 * ⚠ CUVINTELE SUNT ALE CLIENTULUI. Nu se rescriu; se pot doar reașeza.
 */
export const TITLU_MENTENANTA = {
  inainte: "Tu te ocupi de afacere. Noi ne ocupăm de partea",
  /** Cuvântul dintre paranteze. */
  cuvant: "tehnică",
  /** Ce vine după paranteza de închidere. */
  dupa: ".",
  /** Parantezele, în ordinea desenării. */
  paranteze: ["[", "]"] as const,
} as const;

/**
 * Titlul așa cum trebuie să iasă la citit — `h1.textContent`.
 *
 * ⚠ ASTA E PROBA, nu o comoditate. La titlul paginii „Optimizare" o primă formă
 * lăsase în h1 „RapidRapidRapid… Googleoogle.": urma de viteză era făcută din
 * copii ale cuvântului, iar litera G era ascunsă sub siglă. Pe ecran arăta
 * curat, în textul citit era o mizerie, și nimic nu s-a plâns. De atunci,
 * fiecare titlu desfăcut în bucăți își poartă și forma întreagă.
 */
export function titluCitit(): string {
  const [deschis, inchis] = TITLU_MENTENANTA.paranteze;
  return `${TITLU_MENTENANTA.inainte} ${deschis}${TITLU_MENTENANTA.cuvant}${inchis}${TITLU_MENTENANTA.dupa}`;
}
