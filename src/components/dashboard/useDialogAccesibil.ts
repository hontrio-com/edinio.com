"use client";

import { useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   CE LIPSEA MODALELOR DIN DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════

   Modalele panoului sunt scrise de mana, toate: un `fixed inset-0` cu un fundal
   si o cutie. Arata ca un dialog, dar pentru tastatura si pentru
   cititorul de ecran nu era unul:

     * fara `role="dialog"` si `aria-modal`, cititorul de ecran nu anunta ca s-a
       deschis ceva si continua sa citeasca pagina de dedesubt;
     * fara nume accesibil, anuntul ar fi fost oricum „dialog", fara sa spuna care;
     * Escape nu inchidea nimic, singura iesire era clicul pe „X" sau pe fundal,
       adica exact ce nu poate face cineva care navigheaza cu tastatura;
     * focusul ramanea in pagina de dedesubt: Tab plimba prin butoane ascunse sub
       fundal, iar formularul din fata nu se putea completa fara mouse.

   ⚠ DE CE UN HOOK, SI NU O REPARATIE IN FIECARE MODAL. E aceeasi regula de zeci de
   ori. Scrisa de fiecare data, se dezbina la primul modal nou, iar cel care il scrie
   copiaza fisierul de langa, si daca acela e cel fara, lipsa se propaga tacut.
   Exact motivul pentru care `poarta-awb.ts` e o poarta singura.

   ⚠ CAT E PUS, MASURAT (13.09.2026): in `src/components/dashboard` sunt 36 de fisiere
   cu `fixed inset-0`, adica tot atatea care arata a dialog, si DOUA au `role="dialog"`,
   chiar cele doua care cheama hook-ul. Deci treaba NU e facuta; randurile astea spun
   unde s-a ajuns, ca urmatorul cititor sa nu creada ca panoul e deja accesibil.

   ⚠ SI DE CE NU FOLOSESTE `@/components/ui/dialog`. Ar fi fost mai curat, dar e o
   primitiva cu alt model de compunere (portal, backdrop, popup): mutarea modalelor
   pe ea inseamna rescrierea aranjarii lor, cu anteturi lipite si subsoluri care se
   tin de marginea de jos. Hook-ul da ACELASI comportament fara sa atinga nicio linie
   de aranjare, deci se poate pune pe rand, fara regresii vizuale.
*/

/** Elementele care pot primi focus, in ordinea in care le da si browserul. */
const FOCUSABILE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Face dintr-un `<div>` obisnuit un dialog adevarat.
 *
 * Se pune pe cutia din fata (nu pe fundal), impreuna cu `role="dialog"`,
 * `aria-modal="true"` si `aria-labelledby={idTitlu}`.
 *
 * @param deschis daca modalul e pe ecran acum
 * @param inchide ce se cheama la Escape
 */
export function useDialogAccesibil(deschis: boolean, inchide: () => void) {
  const cutia = useRef<HTMLDivElement>(null);

  /*
   * ⚠ `inchide` PRIN REF, ca sa nu intre in dependintele efectului.
   *
   * Toti apelantii trimit o sageata scrisa pe loc (`onClose={() => setX(false)}`), deci
   * `inchide` e alt obiect la FIECARE randare a paginii. Cu el in dependinte, orice
   * `router.refresh()` cu dialogul deschis rula curatenia si efectul din nou: focusul
   * era smuls din campul in care se scria si mutat inapoi la inceputul cutiei, iar
   * `inainte` ajungea sa fie elementul de atunci, nu declansatorul adevarat.
   *
   * ⚠ Nu se cere `useCallback` de la cei trei apelanti: aceeasi regula ceruta in trei
   * locuri se dezbina la al patrulea.
   */
  const inchideRef = useRef(inchide);

  /*
   * ⚠ SCRIEREA IN REF SE FACE INTR-UN EFECT, nu in corpul randarii.
   *
   * Prima forma era `inchideRef.current = inchide;` scris pe loc, iar `react-hooks/refs`
   * o refuza pe buna dreptate: „Cannot access refs during render". Un ref citit sau scris
   * in timpul randarii face randarea sa depinda de ceva ce React nu urmareste, si sub
   * compilator asta se poate vedea ca randare pastrata cu o valoare veche.
   *
   * ⚠ EFECT FARA LISTA DE DEPENDINTE, dinadins: ruleaza dupa FIECARE randare, deci
   * `inchideRef.current` e mereu ultima sageata primita, fara ca `inchide` sa intre in
   * dependintele efectului cel mare de mai jos. Aia era toata miza: apelantii trimit
   * `onClose={() => setX(false)}`, adica alt obiect la fiecare randare a paginii.
   *
   * ⚠ A cazut in CI, nu la mine: poarta se cheama `npm run lint:prag` si numara erorile
   * de lint cu prag (90). Nu era in lista mea de porti dinainte de push. Acum e.
   */
  useEffect(() => {
    inchideRef.current = inchide;
  });

  useEffect(() => {
    if (!deschis) return;

    /*
     * ⚠ Elementul care avea focusul INAINTE. La inchidere focusul se intoarce
     * acolo; altfel ar sari la inceputul paginii, iar cine navigheaza cu
     * tastatura ar lua lista de comenzi de la capat dupa fiecare AWB.
     */
    const inainte = document.activeElement as HTMLElement | null;

    /*
     * ⚠ CUTIA INSASI, nu primul focusabil din ea.
     *
     * `querySelector` cu o lista de selectori intoarce prima potrivire in ORDINEA DIN
     * DOCUMENT, iar in fiecare dintre modalele astea antetul cu butonul X sta inaintea
     * oricarui camp. Deci focusul ateriza pe „Inchide": cititorul de ecran anunta
     * „dialog, Inchide, buton", iar cutia e `overflow-y-auto`, deci primul reflex pe un
     * formular lung e Space ca sa derulezi. Space pe un buton focusat il APASA, si
     * dialogul se inchide peste ce apucase omul sa completeze.
     *
     * Cutia primeste `tabIndex={-1}` in fiecare modal. E si purtarea recomandata pentru
     * dialoguri lungi: cititorul de ecran anunta dialogul si numele lui, iar focusul nu
     * poate fi „apasat" din greseala.
     */
    cutia.current?.focus();

    function laTasta(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        inchideRef.current();
        return;
      }
      if (e.key !== "Tab" || !cutia.current) return;

      // Capcana de focus: Tab pe ultimul duce la primul, Shift+Tab invers.
      const lista = Array.from(cutia.current.querySelectorAll<HTMLElement>(FOCUSABILE))
        .filter((el) => el.offsetParent !== null);
      if (lista.length === 0) return;
      const primulEl = lista[0];
      const ultimul = lista[lista.length - 1];
      const activ = document.activeElement;

      /*
       * ⚠ FOCUSUL PE CUTIE NU E IN LISTA, si fara randurile astea capcana se deschide.
       *
       * `FOCUSABILE` exclude `[tabindex='-1']`, adica exact cutia, deci la prima apasare
       * `activ` nu e nici `primulEl`, nici `ultimul`: niciuna din cele doua ramuri de mai
       * jos nu se aprinde, nu se cheama `preventDefault`, si browserul duce focusul in
       * ordinea documentului, adica INAPOI in pagina de sub fundal. Exact a patra
       * promisiune din antet, desfacuta de reparatia focusului.
       */
      if (!lista.includes(activ as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? ultimul : primulEl).focus();
        return;
      }

      if (e.shiftKey && activ === primulEl) {
        e.preventDefault();
        ultimul.focus();
      } else if (!e.shiftKey && activ === ultimul) {
        e.preventDefault();
        primulEl.focus();
      }
    }

    document.addEventListener("keydown", laTasta, true);
    return () => {
      document.removeEventListener("keydown", laTasta, true);
      /* ⚠ Doar daca mai e in pagina: butonul care a deschis dialogul poate sa fi disparut
         intre timp (o caseta care nu se mai randeaza dupa o reimprospatare). Focus pe un
         nod desprins nu face nimic, si `document.activeElement` ajunge `<body>`. */
      if (inainte?.isConnected) inainte.focus?.();
    };
    /* ⚠ Doar `deschis`: `inchide` se citeste prin ref, vezi nota de sus. */
  }, [deschis]);

  return cutia;
}
