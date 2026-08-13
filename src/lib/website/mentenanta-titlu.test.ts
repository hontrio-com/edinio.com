import { strict as assert } from "node:assert";
import { test } from "node:test";
import { TITLU_MENTENANTA, titluCitit } from "./mentenanta-titlu";

test("titlul citit e chiar cel al clientului, cu parantezele cerute", () => {
  /*
    ⚠ PROBA CARE APĂRĂ DE O SCĂPARE DEJA FĂCUTĂ O DATĂ.

    La titlul paginii „Optimizare", o primă formă lăsase în `h1` textul
    „RapidRapidRapid… Googleoogle.": urma de viteză era făcută din copii ale
    cuvântului, iar litera G stătea ascunsă sub siglă. Pe ecran arăta curat, în
    textul citit era o mizerie, și nimic nu s-a plâns — nici tsc, nici eslint,
    nici build-ul.

    De atunci, fiecare titlu desfăcut în bucăți își poartă și forma întreagă, iar
    proba o compară cu ce trebuie să iasă.
  */
  assert.equal(
    titluCitit(),
    "Tu te ocupi de afacere. Noi ne ocupăm de partea [tehnică].",
  );
});

test("cuvintele n-au fost rescrise, doar reașezate", () => {
  /* Textul e al clientului. Scos parantezele, trebuie sa iasa exact sirul de
     dinainte de 13.08 — altfel cineva a „imbunatatit" pe drum. */
  const [deschis, inchis] = TITLU_MENTENANTA.paranteze;
  const faraParanteze = titluCitit().replace(deschis, "").replace(inchis, "");
  assert.equal(
    faraParanteze,
    "Tu te ocupi de afacere. Noi ne ocupăm de partea tehnică.",
  );
});

test("parantezele sunt drepte, nu rotunde", () => {
  /* Clientul a cerut anume paranteze DREPTE: alea se citesc a cod. Rotunde, ar
     fi doar o precizare intr-o fraza. */
  assert.deepEqual([...TITLU_MENTENANTA.paranteze], ["[", "]"]);
});

test("cuvantul dintre paranteze e un singur cuvant", () => {
  /* Grupul poarta `whitespace-nowrap`, ca paranteza de inchidere sa nu ramana
     singura pe randul urmator. Cu doua cuvinte inauntru, pe telefon grupul ar
     deveni mai lat decat ecranul si ar iesi din pagina. */
  assert.equal(TITLU_MENTENANTA.cuvant.includes(" "), false);
  assert.ok(TITLU_MENTENANTA.cuvant.length <= 12, "cuvant prea lung pentru un grup nedespartit");
});
