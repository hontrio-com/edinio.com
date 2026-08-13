/**
 * Titlul paginii „Mentenanță gratuită", rupt în bucăți.
 *
 * Stă aici, nu în componentă, ca proba să poată compune la loc textul și să-l
 * compare cu ce trebuie să iasă. Era un șir simplu pe pagină; a fost desfăcut
 * când clientul a cerut (13.08) ca „tehnică" să stea între semne de cod.
 *
 * ⚠ CUVINTELE SUNT ALE CLIENTULUI. Nu se rescriu; se pot doar reașeza.
 */
export const TITLU_MENTENANTA = {
  /**
   * ⚠ DOUĂ RÂNDURI, NU UNUL CURGĂTOR — cerut de client (13.08).
   *
   * Sunt două propoziții care se răspund una alteia: „tu te ocupi de asta, noi
   * de cealaltă". Lăsate să curgă, a doua începea pe rândul primeia și cele două
   * jumătăți ale înțelesului se amestecau. Rupte, se citesc ca o pereche.
   *
   * Ruptura e NECONDIȚIONATĂ. Pe telefon fiecare rând se rupe oricum mai
   * departe, dar niciodată în același loc cu cealaltă propoziție.
   */
  randUnu: "Tu te ocupi de afacere.",
  randDoi: "Noi ne ocupăm de partea",
  /** Cuvântul dintre semne. */
  cuvant: "tehnică",
  /** Ce vine după semnul de închidere. */
  dupa: ".",
  /**
   * Semnele din jurul cuvântului.
   *
   * ⚠ CHEVROANE, nu paranteze drepte. Clientul a văzut șase feluri pe o pagină
   * de lucru și a ales-o pe asta (13.08): semnele de etichetă din cod se citesc
   * a bucată de HTML, nu a punctuație. Parantezele drepte, oricât de lucrate, tot
   * a paranteze arătau.
   */
  semne: { deschis: "<", inchis: "/>" },
} as const;

/**
 * Titlul așa cum iese la citit — `h1.textContent`, cu semne cu tot.
 *
 * ⚠ ASTA E PROBA, nu o comoditate. La titlul paginii „Optimizare" o primă formă
 * lăsase în h1 „RapidRapidRapid… Googleoogle.": urma de viteză era făcută din
 * copii ale cuvântului, iar litera G stătea ascunsă sub siglă. Pe ecran arăta
 * curat, în textul citit era o mizerie, și nimic nu s-a plâns.
 *
 * ⚠ Ruptura de rând NU pune niciun semn în `textContent` — `<br>` nu e o literă.
 * De aceea spațiul dintre cele două propoziții se scrie aici; fără el, textul ar
 * ieși lipit: „…de afacere.Noi ne ocupăm…".
 *
 * ⚠ ÎNTRE CUVÂNT ȘI `/>` NU E SPAȚIU, deși în cod așa s-ar scrie. Depărtarea
 * dintre ele e o MARGINE, nu un caracter: pe ecran se vede, în text nu există.
 * Prima formă a funcției punea aici un spațiu și proba trecea, în timp ce
 * `h1.textContent` scotea altceva — adică proba păzea o poveste, nu pagina.
 * Prins măsurând în browser, nu citind codul.
 */
export function titluCitit(): string {
  const { deschis, inchis } = TITLU_MENTENANTA.semne;
  return (
    `${TITLU_MENTENANTA.randUnu} ${TITLU_MENTENANTA.randDoi} ` +
    `${deschis}${TITLU_MENTENANTA.cuvant}${inchis}${TITLU_MENTENANTA.dupa}`
  );
}

/**
 * Titlul așa cum se AUDE, fără semnele de cod.
 *
 * Semnele sunt desen: un cititor de ecran care le-ar rosti ar spune „mai mic
 * decât tehnică slash mai mare decât", ceea ce nu ajută pe nimeni. De aceea sunt
 * ascunse din arborele de accesibilitate, iar ce rămâne e chiar fraza clientului.
 */
export function titluAuzit(): string {
  return (
    `${TITLU_MENTENANTA.randUnu} ${TITLU_MENTENANTA.randDoi} ` +
    `${TITLU_MENTENANTA.cuvant}${TITLU_MENTENANTA.dupa}`
  );
}
