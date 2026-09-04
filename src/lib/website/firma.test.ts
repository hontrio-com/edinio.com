import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { CONTACT_FIRMA, DATE_FIRMA } from "./firma";
import { TERMENI } from "./termeni";
import { CONFIDENTIALITATE } from "./confidentialitate";
import { EMAIL, TELEFON } from "./contact";
import type { DocumentLegal } from "./legal";

/*
  ═══ DATELE DIN COD NU AU VOIE SĂ SE DESPARTĂ DE DOCUMENTE ═══

  `DATE_FIRMA` alimentează nodul `Organization` din datele structurate, pe care
  Google îl citește în ACELAȘI document cu textul paginilor juridice. Până pe
  04.09.2026 cele două se despărțiseră: schema spunea „SC VOID SFT GAMES SRL",
  cu adresa tăiată la „Str. Progresului, Nr. 2" și „Matasari" fără diacritice,
  în timp ce /termeni scria denumirea fără „SC", adresa întreagă și „Mătăsari".

  Probele de aici citesc CHIAR blocul de date al documentelor (transcrierea
  mecanică a actelor clientului, care nu se atinge) și cer ca fiecare constantă
  să apară acolo. Dacă cineva schimbă documentul, proba cade și constanta se
  aliniază — nu invers.
*/

/** Toate valorile din blocurile `date` ale unui document juridic. */
function valoriDinDocument(doc: DocumentLegal): string[] {
  const out: string[] = [];
  for (const s of doc.sectiuni) {
    for (const b of s.blocuri) {
      if (b.tip !== "date") continue;
      for (const it of b.items) out.push(it.valoare);
    }
  }
  return out;
}

/**
 * Adresele din blocurile `date` (`tel:`, `mailto:`), nu textele lor.
 *
 * ⚠ EXISTĂ FIINDCĂ TELEFONUL SE SCRIE ALTFEL ÎN TEXT DECÂT ÎN SCHEMA.ORG.
 * Documentul scrie „0750 456 809", schema cere „+40750456809", deci comparația
 * pe `valoare` nu se putea face — și pentru telefon nu se făcea deloc. Dar
 * `href`-ul aceluiași rând E în forma E.164 (`tel:+40750456809`), adică chiar
 * forma constantei. De aici se ia.
 */
function adreseDinDocument(doc: DocumentLegal): string[] {
  const out: string[] = [];
  for (const s of doc.sectiuni) {
    for (const b of s.blocuri) {
      if (b.tip !== "date") continue;
      for (const it of b.items) if (it.href) out.push(it.href);
    }
  }
  return out;
}

const VALORI_TERMENI = valoriDinDocument(TERMENI);
const VALORI_CONFIDENTIALITATE = valoriDinDocument(CONFIDENTIALITATE);
const ADRESE_TERMENI = adreseDinDocument(TERMENI);
const ADRESE_CONFIDENTIALITATE = adreseDinDocument(CONFIDENTIALITATE);

describe("datele firmei sunt cele din documentele juridice", () => {
  test("s-au citit blocuri de date din ambele documente (proba nu e goală)", () => {
    assert.ok(VALORI_TERMENI.length >= 5, `doar ${VALORI_TERMENI.length} valori în /termeni`);
    assert.ok(VALORI_CONFIDENTIALITATE.length >= 5, `doar ${VALORI_CONFIDENTIALITATE.length} valori în /confidentialitate`);
  });

  test("denumirea apare identic, fără prefixe adăugate de noi", () => {
    assert.ok(VALORI_TERMENI.includes(DATE_FIRMA.denumire), `„${DATE_FIRMA.denumire}" nu apare în /termeni`);
    assert.ok(VALORI_CONFIDENTIALITATE.includes(DATE_FIRMA.denumire), `„${DATE_FIRMA.denumire}" nu apare în /confidentialitate`);
    /* ⚠ Chiar defectul reparat: „SC " lipit în față de noi, nu de documente. */
    assert.doesNotMatch(DATE_FIRMA.denumire, /^S\.?C\.?\s/i, "denumirea a primit iar un prefix care nu e în acte");
  });

  test("CUI și numărul din Registrul Comerțului apar în documente", () => {
    assert.ok(VALORI_TERMENI.includes(DATE_FIRMA.cui), "CUI-ul nu se potrivește cu /termeni");
    assert.ok(VALORI_TERMENI.includes(DATE_FIRMA.registruComert), "numărul din Registrul Comerțului nu se potrivește");
  });

  test("adresa din cod RECOMPUNE exact sediul social din documente", () => {
    /*
      Documentele scriu sediul într-un singur șir, uneori cu un salt de rând în
      loc de spațiu; codul îl ține pe bucăți, pentru `PostalAddress`.

      ⚠ AICI ERA `curat.includes(bucata)` PENTRU FIECARE BUCATĂ, și trecea pentru
      ORICE trunchiere — inclusiv pentru șirul gol. Adică exact defectul pentru
      care a fost scris `firma.ts` („adresa tăiată la «Str. Progresului, Nr. 2»")
      nu era prins: bucata scurtă e cuprinsă în șirul lung, deci `includes` spune
      „da". O revizie adversarială a numit-o.

      Acum bucățile se lipesc la loc și se cere EGALITATE cu ce scrie documentul.
      O virgulă mutată face proba roșie — și e bine: e o transcriere a actelor
      clientului, nu un text pe care îl rescriem noi.
    */
    const sedii = [...VALORI_TERMENI, ...VALORI_CONFIDENTIALITATE].filter((v) => v.includes("Progresului"));
    assert.ok(sedii.length >= 2, "sediul social nu mai apare în documente");

    /*
      ⚠ VIRGULELE SE IGNORĂ, ȘI ASTA E O CONSTATARE, NU O COMODITATE. Cele două
      documente punctuează sediul altfel: /termeni scrie „…Ap. 10, Mătăsari…",
      /confidentialitate are acolo un salt de rând. Amândouă sunt transcrieri
      MECANICE ale actelor clientului și nu se ating pentru ca o probă de-a mea
      să treacă mai ușor. Se compară CUVINTELE, care sunt aceleași.

      Rămâne strict acolo unde contează: o adresă trunchiată are mai puține
      cuvinte, deci nu mai recompune nimic.
    */
    const cuvinte = (s: string) => s.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    const recompus = cuvinte(
      `${DATE_FIRMA.strada}, ${DATE_FIRMA.localitate}, Județ ${DATE_FIRMA.judet}, ${DATE_FIRMA.tara}`,
    );
    for (const sediu of sedii) {
      assert.equal(
        cuvinte(sediu),
        recompus,
        "bucățile din `firma.ts` nu mai recompun sediul scris în documente",
      );
    }
  });

  test("localitatea își păstrează diacriticele", () => {
    assert.equal(DATE_FIRMA.localitate, "Mătăsari");
  });

  test("contactul e în forma cerută de schema.org", () => {
    assert.match(CONTACT_FIRMA.telefon, /^\+\d{8,15}$/, "telefonul nu e în forma E.164");
    assert.match(CONTACT_FIRMA.email, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    /* Derivarea din `contact.ts` — că prefixul chiar se taie, nu că numărul e
       cel bun. Adevărul despre CE număr e mai jos, față de documente. */
    assert.equal(CONTACT_FIRMA.telefon, TELEFON.href.replace(/^tel:/, ""));
    assert.equal(CONTACT_FIRMA.email, EMAIL.href.replace(/^mailto:/, ""));
  });

  test("telefonul și emailul sunt CELE DIN DOCUMENTE, în amândouă", () => {
    /*
      ⚠ AICI STĂTEA O PROBĂ CARE SE VERIFICA PE EA ÎNSĂȘI (până pe 04.09.2026).

      `firma.ts` DEFINEȘTE `telefon: TELEFON.href.replace(/^tel:/, "")`, iar
      proba asertase `assert.equal(CONTACT_FIRMA.telefon, TELEFON.href.replace(
      /^tel:/, ""))` — aceeași expresie de amândouă părțile, deci egalitate
      adevărată prin construcție, orice număr ar fi fost. Singura altă verificare
      era forma E.164, pe care o trece la fel de bine și un număr greșit.

      Scenariul care ar fi trecut: o cifră schimbată în `contact.ts`. Numărul
      greșit ar fi plecat în `Organization.telephone` și în
      `contactPoint.telephone` pe TOT site-ul de prezentare, în timp ce /termeni
      și /confidentialitate ar fi scris mai departe cel bun — exact despărțirea
      dintre schemă și pagină pe care fișierul `firma.ts` a fost creat s-o
      închidă. Emailul avea deja verificarea reală; telefonul, niciuna.

      Se confruntă cu `href`-ul rândului, nu cu textul lui: documentele scriu
      „0750 456 809" în text și `tel:+40750456809` în adresă.
    */
    for (const [nume, adrese] of [
      ["/termeni", ADRESE_TERMENI],
      ["/confidentialitate", ADRESE_CONFIDENTIALITATE],
    ] as [string, string[]][]) {
      assert.ok(adrese.length >= 2, `${nume}: doar ${adrese.length} adrese în blocurile de date`);
      assert.ok(
        adrese.includes(`tel:${CONTACT_FIRMA.telefon}`),
        `telefonul din schema.org (${CONTACT_FIRMA.telefon}) nu apare în ${nume}: ${adrese.join(", ")}`,
      );
      assert.ok(
        adrese.includes(`mailto:${CONTACT_FIRMA.email}`),
        `emailul din schema.org (${CONTACT_FIRMA.email}) nu apare în ${nume}: ${adrese.join(", ")}`,
      );
    }
    /* Și în textul citit de om, unde numărul e scris altfel: emailul e identic. */
    assert.ok(VALORI_TERMENI.includes(CONTACT_FIRMA.email), "emailul nu se potrivește cu textul din /termeni");
  });
});
