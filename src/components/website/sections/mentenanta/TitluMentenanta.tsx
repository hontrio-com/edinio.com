import { TITLU_MENTENANTA } from "@/lib/website/mentenanta-titlu";

/**
 * Titlul paginii „Mentenanță gratuită", cu cuvântul „tehnică" între semne de cod.
 *
 * ═══ DE CE CHEVROANE, ȘI DE CE NU PAR PUNCTUAȚIE ═══
 *
 * Clientul a cerut întâi paranteze drepte, apoi a văzut șase feluri pe o pagină
 * de lucru și a ales chevroanele (13.08). Alegerea are un temei limpede: `<` și
 * `/>` NU EXISTĂ ca punctuație în limbă. O paranteză, oricât ai lucra-o, tot
 * paranteză se citește, fiindcă ochiul o știe dintr-o frază. Chevroanele le-a
 * văzut numai în cod, deci acolo trimit fără să fie nevoie de nimic altceva.
 *
 * Peste asta, trei lucruri le țin deosebite de cuvânt:
 *
 * 1. **ALT FONT.** Monospațiate (Geist Mono), în timp ce titlul e cu font
 *    obișnuit — forma pe care ochiul a văzut-o de o mie de ori într-un editor.
 * 2. **ALTĂ GROSIME.** Titlul e `bold`; semnele sunt de 400. Mai subțiri decât
 *    cuvântul dinăuntru, se așază în urma lui: cuvântul rămâne cuvânt, semnele
 *    devin ramă.
 * 3. **ALTĂ CULOARE.** Verdele mărcii. ⚠ Regula site-ului e că în titluri NU se
 *    colorează cuvinte — vezi nota din pagina „Optimizare". Aici nu se colorează
 *    niciun cuvânt: „tehnică" rămâne cerneală ca tot titlul, iar verdele stă pe
 *    două SEMNE. Regula nu e atinsă.
 *
 * ⚠ SEMNELE SUNT ASCUNSE DE CITITOARELE DE ECRAN (`aria-hidden`). Rostite, ar
 * ieși „mai mic decât tehnică slash mai mare decât" în mijlocul unei fraze. Sunt
 * desen, nu vorbă. Ce se aude e chiar fraza clientului — vezi `titluAuzit()`.
 *
 * ⚠ TEXTUL CITIT RĂMÂNE ÎNTREG. Lecția e de la titlul paginii „Optimizare", unde
 * o primă formă lăsase în h1 „RapidRapidRapid… Googleoogle.": ce se vede și ce se
 * citește se despărțiseră fără ca nimic să se plângă. Proba din
 * `mentenanta-titlu.test.ts` compară cele două.
 */
export function TitluMentenanta() {
  return (
    <>
      {TITLU_MENTENANTA.randUnu}

      {/*
        ⚠ RUPTURĂ ADEVĂRATĂ DE RÂND, cerută de client. Sunt două propoziții care
        se răspund una alteia; lăsate să curgă, a doua începea pe rândul primeia.

        Spațiul dinaintea rupturii NU e de prisos: `<br>` nu pune nicio literă în
        `textContent`, deci fără el textul citit ar ieși lipit — „…de
        afacere.Noi ne ocupăm…".
      */}{" "}
      <br />
      {TITLU_MENTENANTA.randDoi}{" "}
      {/*
        `whitespace-nowrap` pe grup: fără el, pe telefon semnul de închidere
        putea rămâne singur pe rândul următor, cu punctul după el.
      */}
      <span className="whitespace-nowrap">
        <Semn parte="deschis" />
        {/*
          Cuvântul e o literă plină din care sunt SCOASE cifre de 0 și 1. De
          departe se citește ca un cuvânt obișnuit; de aproape se vede din ce e
          făcut. Socoteala dalei, și plasa pentru browserele care nu știu tăierea
          pe text, sunt la `.cuvant-binar` în `globals.css` — acolo, fiindcă are
          nevoie de `@supports`, iar un stil scris pe element nu poate avea.
        */}
        <span className="cuvant-binar">{TITLU_MENTENANTA.cuvant}</span>
        <Semn parte="inchis" />
      </span>
      {TITLU_MENTENANTA.dupa}
    </>
  );
}

function Semn({ parte }: { parte: "deschis" | "inchis" }) {
  const deschis = parte === "deschis";

  return (
    <span
      aria-hidden="true"
      className="inline-block"
      style={{
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontWeight: 400,
        color: "var(--color-brand)",
        /* Mai mic ca literă, dar întins pe verticală: așa ajunge mai înalt decât
           cuvântul fără să se îngroașe odată cu el. */
        fontSize: "0.72em",
        transform: "scaleY(1.3)",
        /* Se întinde din mijloc, ca să crească în amândouă părțile; de la linia
           de scris, ar fi ieșit doar în sus. */
        transformOrigin: "50% 52%",
        /* Măsurat pe ecran: sub 0,04em semnul se lipește de literă, peste 0,1em
           se desprinde și pare răzleț lângă cuvânt. */
        [deschis ? "marginRight" : "marginLeft"]: "0.06em",
      }}
    >
      {TITLU_MENTENANTA.semne[parte]}
    </span>
  );
}
