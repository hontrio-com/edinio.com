import type { CSSProperties } from "react";

/*
  ═══════════════════════════════════════════════════════════════════════════
  STILURILE CELOR TREI PAGINI CARE NU AU VOIE SĂ CEARĂ O FOAIE DE STIL
  ═══════════════════════════════════════════════════════════════════════════

  `app/not-found.tsx`, `app/error.tsx` și `app/global-error.tsx`.

  ⚠ DE CE ÎN LINIE ȘI NU CU TAILWIND. Cele trei fișiere stau la rădăcina lui
  `app/`, deci fac parte din arborele de randare al FIECĂREI rute din platformă.
  Un `import "…css"` în ele nu rămâne la ele: Next leagă foaia aceea pe toate
  paginile de sub rădăcină.

  Măsurat pe 31.08.2026, chiar în ziua în care s-au despărțit foile: cu
  `import "./website.css"` în cele trei, o pagină de magazin ajunsese să încarce
  ȘI foaia aplicației (274.046 octeți) ȘI pe cea de prezentare (107.918). Adică
  fix invers decât scopul despărțirii, și tocmai pe paginile celor 130 de
  comercianți, care nu trebuiau atinse deloc.

  Trei ieșiri erau cu putință:
    1. să nu importe nimic  → un 404 pe o adresă care nu prinde niciun grup de
       rute ar rămâne complet nestilizat;
    2. să-și pună foaia lor mică, separată  → încă un fișier legat peste tot,
       aceeași problemă mai mică;
    3. stiluri în linie  → zero octeți în plus pentru oricine, pentru totdeauna.

  ⚠ ȘI E ȘI MAI ROBUST AȘA. O pagină de eroare care are nevoie de o foaie de
  stil ca să arate a ceva se bizuie exact pe lucrul care poate să fi picat. Cu
  stilurile în linie, „500" arată corect chiar dacă rețeaua a căzut între HTML
  și CSS.

  ⚠ CINE ADAUGĂ ALTĂ PAGINĂ LA RĂDĂCINA LUI `app/` intră sub aceeași regulă.
  `foi-de-stil.test.ts` cade dacă apare un import de CSS acolo.
*/

/** Verdele de la `--primary` (#008236), scris de mână fiindcă aici nu există variabile. */
const VERDE = "#008236";
const VERDE_APASAT = "#026b2d";

export const STIL_PAGINA_SIMPLA = {
  pagina: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 1rem",
    background: "#ffffff",
    color: "#0a0a0a",
    fontFamily:
      "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    textAlign: "center",
  } satisfies CSSProperties,

  numar: {
    fontSize: "4.5rem",
    lineHeight: 1,
    fontWeight: 900,
    color: "#e4e4e7",
    margin: 0,
  } satisfies CSSProperties,

  titlu: {
    fontSize: "1.125rem",
    fontWeight: 600,
    margin: "1rem 0 0",
  } satisfies CSSProperties,

  explicatie: {
    fontSize: "0.875rem",
    color: "#71717a",
    margin: "0.25rem 0 0",
    maxWidth: "28rem",
  } satisfies CSSProperties,

  buton: {
    display: "inline-block",
    marginTop: "1.5rem",
    padding: "0.625rem 1.25rem",
    background: VERDE,
    color: "#ffffff",
    fontSize: "0.875rem",
    fontWeight: 600,
    borderRadius: "0.75rem",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    /*
      ⚠ Fără `:hover` — stilurile în linie nu au pseudo-clase, iar un `<style>`
      pus aici ca să le adauge ar fi tot un fișier legat peste tot, adică exact
      ce încearcă fișierul ăsta să evite. Culoarea apăsată de mai jos e folosită
      de `global-error`, unde butonul e singurul lucru de pe ecran.
    */
  } satisfies CSSProperties,

  butonApasat: { background: VERDE_APASAT } satisfies CSSProperties,
};
