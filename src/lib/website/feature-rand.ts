/**
 * Cine e „la rând" dintre cardurile de funcții, pe telefon.
 *
 * Pe telefon cardurile nu se lipesc (motivul e la `STACK_TOP` în
 * `components/website/sections/Features.tsx`), așa că nu există acoperire de
 * calculat. În schimb un singur card e la rând: se ridică 16px și primește umbra
 * deplină, restul stau plate. Aici se decide CARE, și doar atât — desenul îl face
 * foaia de stil, la `.rand-live` în `globals.css`.
 *
 * Partea asta stă într-un fișier separat, nu în componentă, ca să poată fi
 * probată: în componentă e închisă într-un `useEffect` care nu pornește decât la
 * derulare reală, într-un browser vizibil.
 */

/**
 * Cele două linii, în pixeli de la marginea de sus a ferestrei.
 *
 * Nu un procent din fereastră, ci din banda LIBERĂ de sub antet: sus stă antetul
 * lipit, jos stau butoanele plutitoare de contact și bara browserului.
 *
 * Se recalculează la fiecare cadru, nu o dată la montare — pe iOS înălțimea
 * vizibilă se schimbă cât derulezi, când se strânge bara de adrese.
 */
export function liniiRand(
  inaltimeFereastra: number,
  inaltimeAntet: number,
  sus: number,
  jos: number,
): { lineUp: number; lineDown: number } {
  const banda = Math.max(inaltimeFereastra - inaltimeAntet, 1);
  return {
    lineUp: inaltimeAntet + banda * sus,
    lineDown: inaltimeAntet + banda * jos,
  };
}

/**
 * Următorul card la rând, dat fiind unde sunt vârfurile lor acum.
 *
 * `tops` sunt marginile de sus ale LOCAȘURILOR față de fereastră, nu ale
 * cardurilor: cardul la rând e ridicat cu 16px, iar dacă am citi cardul,
 * răspunsul ar depinde de propria lui stare.
 *
 * `activ` e -1 înainte de primul card, apoi indicele celui la rând.
 *
 * ═══ DE CE DOUĂ LINII ȘI NU UNA ═══
 *
 * Cu o singură linie, un card oprit cu vârful exact pe ea ar clipi între stări la
 * fiecare pixel de tremurat al degetului. `lineUp` aprinde, `lineDown` stinge, iar
 * distanța dintre ele e o zonă în care nu se schimbă nimic.
 *
 * ═══ DE CE BUCLE ȘI NU `if` ═══
 *
 * La o derulare cu inerție se pot trece două-trei carduri într-un singur cadru.
 * Cu `if` starea ar avansa cu unu pe cadru și ar rămâne în urma degetului.
 */
export function randUrmator(
  tops: readonly number[],
  activ: number,
  lineUp: number,
  lineDown: number,
): number {
  let next = activ;
  /* Înainte: vârful cardului următor a urcat peste linia de aprindere. */
  while (next + 1 < tops.length && tops[next + 1] <= lineUp) next += 1;
  /* Înapoi: vârful cardului curent a coborât sub linia de retragere. */
  while (next >= 0 && tops[next] > lineDown) next -= 1;
  return next;
}
