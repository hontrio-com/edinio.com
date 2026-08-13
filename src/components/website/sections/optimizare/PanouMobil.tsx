import { IPhoneMockup } from "./IPhoneMockup";
import { PaginaProdusMobil } from "./PaginaProdusMobil";

/**
 * Ilustrația cardului „Optimizat pentru mobil": pagina de produs, într-un aparat.
 *
 * ═══ APARATUL E TĂIAT DE MARGINEA DE JOS, DINADINS ═══
 *
 * Ilustrația cardului e 4:3, adică lată; un telefon e de peste două ori mai înalt
 * decât lat. Încăput ÎNTREG, ar fi ieșit de vreo 125px lățime, cu un ecran de
 * 117 — iar o pagină de produs la lățimea aia nu se mai citește ca pagină de
 * produs, ci ca o pată.
 *
 * Tăiat de marginea de jos, aparatul poate fi cu jumătate mai mare: ecranul ajunge
 * la ~170px, cât are și ilustrația de pe pagina de start, unde aceleași mărimi de
 * text s-au dovedit bune. Ce se pierde e partea de jos a paginii, care oricum se
 * vede prin derulare la un telefon adevărat.
 *
 * ⚠ Tăietura e a ILUSTRAȚIEI (`overflow-hidden` pe caseta cardului), nu a
 * aparatului: proporțiile lui rămân întregi, doar că nu se vede tot. Vezi
 * `IPhoneMockup` — mockupul e „1 la 1", cerut de client.
 *
 * ═══ CÂT DE MARE ═══
 *
 * `48cqw`, adică 48% din lățimea ilustrației. Curat proporțional, FĂRĂ PLAFON.
 *
 * Procentul, nu pixelii: lățimea cardului sare la fiecare prag al grilei, iar cu
 * o valoare fixă aparatul ar fi ieșit când prea mare, când pierdut în mijloc —
 * exact ce s-a întâmplat la cadranele de scoruri și la casetele cu imagini.
 *
 * ⚠ ȘI FĂRĂ PLAFON, tot măsurat. Cu unul de 172px, între 430 și 639 lățime —
 * unde cardurile sunt încă pe o singură coloană și ilustrația ajunge la 589px —
 * aparatul se oprea în plafon și rămânea spațiu gol SUB el: la 639 nu mai era
 * tăiat deloc, ci plutea cu 82px de gol dedesubt. Proporțional, tăietura iese 25-27%
 * la orice lățime, deci desenul arată la fel peste tot.
 *
 * ⚠ NUMĂRUL E ALES DUPĂ CE SE VEDE, nu după cât de mare arată. La 52% aparatul
 * era mai impunător, dar tăietura cădea peste PREȚ — adică peste lucrul pentru
 * care omul deschide o pagină de produs. La 48%, cu marginea de sus strânsă,
 * intră poza, numele, recenziile și prețul; sub tăietură rămân variantele și
 * butonul, exact ce s-ar vedea derulând pe un telefon adevărat.
 */
export function PanouMobil() {
  return (
    /*
      ⚠ `items-start` NU e spațiere, ține aparatul întreg. Fără el, învelișul e un
      flex cu întindere din oficiu, iar întinderea BATE `aspect-ratio`: telefonul
      primea înălțimea ilustrației și ieșea turtit, cu raportul 1,33 în loc de
      2,09. Măsurat — colțurile, rama și insula erau toate corecte, numai silueta
      era a altui aparat.
    */
    <div className="@container absolute inset-0 flex items-start justify-center">
      <IPhoneMockup latime="42cqw" className="mt-[2cqw]">
        <PaginaProdusMobil />
      </IPhoneMockup>
    </div>
  );
}
