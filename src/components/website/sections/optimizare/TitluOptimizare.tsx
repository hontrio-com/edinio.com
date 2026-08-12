/**
 * Titlul paginii „Optimizare", cu cele două piese cerute de client: o urmă de
 * viteză la „Rapid" și sigla Google în locul literei G.
 *
 * ═══ REGULA CARE A DAT FORMA AMÂNDUROR EFECTELOR ═══
 *
 * Titlul trebuie să rămână, ca TEXT, exact propoziția clientului:
 * „Rapid pentru clienți. Pregătit pentru Google." Nicio literă în plus, niciuna
 * în minus. E și ce indexează un motor de căutare — ironic, chiar pe pagina asta.
 *
 * Prima formă a fiecărui efect încălca regula, și numai măsurând s-a văzut:
 *
 *   - urma era făcută din ȘASE COPII ale cuvântului, puse una peste alta. Toate
 *     `aria-hidden`, deci un cititor de ecran auzea bine — dar `textContent`
 *     ieșea „RapidRapidRapidRapidRapidRapidRapid pentru clienți.", iar un crawler
 *     citește textul, nu `aria-hidden`.
 *   - sigla era un SVG lângă un „Google" pus în `sr-only`, plus „oogle" vizibil.
 *     Text: „Googleoogle."
 *
 * Acum niciunul nu mai adaugă text:
 *
 *   - urma e din `text-shadow`, adică șase copii ale GLIFELOR, desenate de motorul
 *     de redare. Zero noduri, zero litere în plus.
 *   - litera „G" chiar există în text, dar e desenată transparentă, iar semnul
 *     Google stă exact peste locul ei.
 */

/**
 * Cuvântul cu urmă de viteză.
 *
 * ═══ DE CE `text-shadow` ȘI NU `filter: blur()` ═══
 *
 * Fiindcă neclaritatea de mișcare e DIRECȚIONALĂ, iar `blur()` din CSS e
 * rotundă: un „Rapid" neclar în toate direcțiile nu arată repede, arată
 * defocalizat. Se poate obține direcția cu un filtru SVG (`stdDeviation="8 0"`),
 * dar acela rasterizează textul și îl face pastos.
 *
 * Șase umbre, tot mai depărtate și tot mai stinse, dau o urmă orizontală în care
 * literele rămân litere. Distanțele cresc neliniar, ca ce lasă în urmă un obiect
 * care încetinește: dens lângă el, rărit în coadă. Valorile sunt în `em` — titlul
 * are 38px pe telefon și 66 pe desktop, iar o urmă fixă ar fi fost o coadă
 * discretă pe ecran mare și o mânjeală pe telefon.
 *
 * La încărcare, cuvântul sosește din stânga și urma se strânge în el, adică
 * frânează. O SINGURĂ dată: mișcarea perpetuă e decor, iar decorul care nu
 * răspunde la nimic e primul lucru pe care clientul îl taie. Aici mișcarea spune
 * chiar ce spune cuvântul.
 */
export function CuvantRapid({ children }: { children: string }) {
  return <span className="rapid">{children}</span>;
}

/**
 * Cuvântul „Google", cu semnul lor în locul literei G.
 *
 * ═══ DE CE SE ÎNLOCUIEȘTE O LITERĂ, ȘI NU SE COLOREAZĂ CUVÂNTUL ═══
 *
 * „Google" scris cu fontul nostru în cele patru culori ale lor ar fi fost o
 * imitație a mărcii într-o literă care nu e a lor — exact lucrul care arată
 * ieftin. Aici se pune semnul lor, neatins, iar restul cuvântului rămâne în
 * tipografia paginii. Se citește ca o alăturare făcută cu intenție.
 *
 * ⚠ LITERA „G" NU E ȘTEARSĂ, E TRANSPARENTĂ. Așa textul rămâne „Google" întreg,
 * iar semnul stă peste locul ei — deci și lățimea rândului rămâne cea a
 * cuvântului scris, la orice corp de literă.
 *
 * ⚠ DESENUL VINE DIN CODUL TRIMIS DE CLIENT (componenta `IconGoogle` din
 * exemplul cu siglele plutitoare). E o redare simplificată a mărcii, nu fișierul
 * oficial de la Google. Dacă are fișierul lor, se schimbă doar traseele de mai
 * jos; mărimea și așezarea rămân cum sunt.
 */
export function SiglaGoogle() {
  return (
    <span className="google">
      {/*
        Semnul, peste litera transparentă. `aria-hidden`: cuvântul e deja scris
        alături, în text adevărat, deci un cititor de ecran n-are ce afla de aici.
      */}
      <span className="google-semn" aria-hidden="true">
        <svg viewBox="1.45 1.33 20.55 20.67" role="presentation" focusable="false">
          <path
            d="M21.9999 12.24C21.9999 11.4933 21.9333 10.76 21.8066 10.0533H12.3333V14.16H17.9533C17.7333 15.3467 17.0133 16.3733 15.9666 17.08V19.68H19.5266C21.1933 18.16 21.9999 15.4533 21.9999 12.24Z"
            fill="#4285F4"
          />
          <path
            d="M12.3333 22C15.2333 22 17.6866 21.0533 19.5266 19.68L15.9666 17.08C15.0199 17.7333 13.7933 18.16 12.3333 18.16C9.52659 18.16 7.14659 16.28 6.27992 13.84H2.59326V16.5133C4.38659 20.0267 8.05992 22 12.3333 22Z"
            fill="#34A853"
          />
          <path
            d="M6.2799 13.84C6.07324 13.2267 5.9599 12.58 5.9599 11.92C5.9599 11.26 6.07324 10.6133 6.2799 10L2.59326 7.32667C1.86659 8.78667 1.45326 10.32 1.45326 11.92C1.45326 13.52 1.86659 15.0533 2.59326 16.5133L6.2799 13.84Z"
            fill="#FBBC05"
          />
          <path
            d="M12.3333 5.68C13.8933 5.68 15.3133 6.22667 16.3866 7.24L19.6 4.02667C17.68 2.29333 15.2266 1.33333 12.3333 1.33333C8.05992 1.33333 4.38659 3.97333 2.59326 7.32667L6.27992 10C7.14659 7.56 9.52659 5.68 12.3333 5.68Z"
            fill="#EA4335"
          />
        </svg>
      </span>
      <span className="google-litera">G</span>oogle
    </span>
  );
}

/**
 * Titlul întreg.
 *
 * Cele două propoziții stau pe rânduri scrise de mână, nu lăsate să se rupă unde
 * nimerește. Sunt două afirmații despre doi destinatari — „pentru clienți" și
 * „pentru Google" — iar tăietura la punct e chiar ce le pune față în față.
 * Lăsată liberă, la unele lățimi ar fi căzut peste „pentru".
 */
export function TitluOptimizare() {
  return (
    <>
      <span className="block">
        <CuvantRapid>Rapid</CuvantRapid> pentru clienți.
      </span>
      {/* ⚠ Spatiul dintre propozitii. Pe ecran nu se vede — randurile sunt blocuri
          — dar fara el textul paginii iese „clienți.Pregătit", lipit, si asa il
          citeste un motor de cautare. */}
      {" "}
      <span className="block">
        Pregătit pentru <SiglaGoogle />.
      </span>
    </>
  );
}
