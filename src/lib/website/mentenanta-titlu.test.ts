import { strict as assert } from "node:assert";
import { test } from "node:test";
import { TITLU_MENTENANTA, titluAuzit, titluCitit } from "./mentenanta-titlu";

test("titlul citit e chiar cel al clientului, cu semnele alese", () => {
  /*
    ⚠ PROBA CARE APĂRĂ DE O SCĂPARE DEJA FĂCUTĂ O DATĂ.

    La titlul paginii „Optimizare", o primă formă lăsase în `h1` textul
    „RapidRapidRapid… Googleoogle.": urma de viteză era făcută din copii ale
    cuvântului, iar litera G stătea ascunsă sub siglă. Pe ecran arăta curat, în
    textul citit era o mizerie, și nimic nu s-a plâns — nici tsc, nici eslint,
    nici build-ul.

    ⚠ Și ruptura de rând intră aici: `<br>` nu pune nicio literă în
    `textContent`, deci spațiul dintre cele două propoziții trebuie scris de
    mână. Fără el, textul ar ieși lipit — „…de afacere.Noi ne ocupăm…" — pe
    ecran fără nicio urmă.

    ⚠ Iar între cuvânt și `/>` NU e spațiu, deși în cod așa s-ar scrie:
    depărtarea e o margine, nu un caracter. Prima formă a probei aștepta un
    spațiu și trecea, în timp ce pagina scotea altceva — proba păzea o poveste,
    nu pagina. Prins măsurând `h1.textContent` în browser.
  */
  assert.equal(
    titluCitit(),
    "Tu te ocupi de afacere. Noi ne ocupăm de partea <tehnică/>.",
  );
});

test("ce se aude nu are semne de cod în el", () => {
  /* Semnele sunt desen, si sunt `aria-hidden` in componenta. Rostite, ar iesi
     „mai mic decat tehnica slash mai mare decat" in mijlocul unei fraze. */
  assert.equal(titluAuzit(), "Tu te ocupi de afacere. Noi ne ocupăm de partea tehnică.");
  assert.equal(titluAuzit().includes("<"), false);
  assert.equal(titluAuzit().includes(">"), false);
});

test("cuvintele n-au fost rescrise, doar reasezate", () => {
  /* Textul e al clientului. Scoase semnele, trebuie sa iasa exact fraza de
     dinainte de 13.08 — altfel cineva a „imbunatatit" pe drum. */
  const { deschis, inchis } = TITLU_MENTENANTA.semne;
  const fara = titluCitit().replace(deschis, "").replace(inchis, "");
  assert.equal(fara, "Tu te ocupi de afacere. Noi ne ocupăm de partea tehnică.");
});

test("semnele sunt chevroane, nu paranteze", () => {
  /* Clientul a vazut sase feluri pe o pagina de lucru si le-a ales pe astea
     (13.08). `<` si `/>` nu exista ca punctuatie in limba, deci nu pot fi
     confundate cu ea — asta e chiar temeiul alegerii. */
  assert.deepEqual({ ...TITLU_MENTENANTA.semne }, { deschis: "<", inchis: "/>" });
});

test("titlul are doua randuri, si al doilea le tine pe toate", () => {
  /* Cerut de client: cele doua propozitii nu curg una din alta. */
  assert.ok(TITLU_MENTENANTA.randUnu.endsWith("."), "primul rand nu se incheie");
  assert.equal(TITLU_MENTENANTA.randUnu.includes("tehnic"), false, "cuvantul e pe randul doi");
  assert.ok(TITLU_MENTENANTA.randDoi.length > 0);
});

test("cuvantul dintre semne e un singur cuvant", () => {
  /* Grupul poarta `whitespace-nowrap`, ca semnul de inchidere sa nu ramana
     singur pe randul urmator. Cu doua cuvinte inauntru, pe telefon grupul ar
     deveni mai lat decat ecranul si ar iesi din pagina. */
  assert.equal(TITLU_MENTENANTA.cuvant.includes(" "), false);
  assert.ok(TITLU_MENTENANTA.cuvant.length <= 12, "cuvant prea lung pentru un grup nedespartit");
});
