/**
 * Butoanele site-ului de prezentare, scrise o singură dată.
 *
 * ═══ CE A GĂSIT AUDITUL DIN 23.08 ═══
 *
 * Butonul verde principal avea CINCI înălțimi și PATRU feluri de a reacționa la
 * hover. Adunate din tot site-ul de prezentare:
 *
 *   h-13  px-8  15px   hero-ul paginii de start      scale-[1.02] + halou verde
 *   h-12  px-8  15px   banda de final                bg-primary/90
 *   h-12  px-6  15px   `PageShell`                   scale-[1.02]
 *   h-12  px-6  15px   cele două formulare           scale-[1.01]
 *   h-12        15px   meniul de telefon             nimic
 *   h-11  px-6  14px   biblioteca de integrări       scale-[1.02]
 *   h-10  px-5  14px   bara de sus                   scale-[1.02]
 *   py-2.5      14px   cardurile de preț             bg-primary/90
 *   py-2.5      14px   secțiunea de funcționalități  bg-primary/90
 *
 * Nimic din toate astea nu era o decizie. Fiecare buton a fost scris de mână,
 * la câteva săptămâni distanță, copiind aproximativ ce era alături.
 *
 * ═══ CE RĂMÂNE: TREI MĂRIMI, FIECARE CU UN ROL ═══
 *
 * Mărimile NU se împuținează la una. Un buton din bara de sus chiar trebuie să
 * fie mai mic decât CTA-ul unui hero: bara are 72px înălțime cu tot cu ea. Ce
 * se schimbă e că fiecare mărime are acum un rol scris, iar cine adaugă un buton
 * alege un rol, nu inventează o înălțime.
 *
 * ═══ UN SINGUR HOVER, ȘI ANUME CULOAREA ═══
 *
 * S-a ales `hover:bg-primary/90`, nu scalarea. Trei motive:
 *
 * 1. Scalarea unui buton lat de 200px mișcă marginile cu ~2px fiecare. Pe un
 *    dreptunghi cu text înăuntru, asta se citește ca tremurat, nu ca răspuns.
 * 2. Erau TREI valori de scalare (1.01, 1.02, 1.04) pentru același gest, ceea ce
 *    arată că nimeni nu alesese vreuna: se copiase.
 * 3. `transition-colors` nu creează un strat de compunere nou, cum face
 *    `transform`. Pe pagini cu ilustrații animate, cu atât mai bine.
 *
 * ⚠ `active:` rămâne fără scalare dinadins. Apăsarea se simte deja prin culoare;
 * un al doilea semn pentru același gest nu adaugă nimic.
 *
 * ═══ ⚠ NUMAI SITE-UL DE PREZENTARE ═══
 *
 * Fișierul ăsta nu are treabă cu panoul de administrare, cu autentificarea sau
 * cu onboarding-ul. Acolo butoanele au altă familie (`rounded-lg`, `py-2.5`,
 * `text-sm`) și alt rost, iar amestecul lor a fost tocmai ce a făcut auditul
 * greu de citit. Cine lucrează la panou nu importă de aici.
 */

/** Rolul butonului, care îi dă și mărimea. */
export type MarimeButon =
  /** Bara de sus. Trebuie să încapă într-un antet de 72px. */
  | "bara"
  /** Butoanele din corpul paginii și din formulare. Cel folosit cel mai des. */
  | "normal"
  /** CTA-ul principal al unei pagini: hero-ul și banda de final. */
  | "lat";

const MARIMI: Record<MarimeButon, string> = {
  bara: "h-10 px-5 text-[14px]",
  normal: "h-12 px-6 text-[15px]",
  /* Aceeași înălțime ca `normal`, doar mai mult aer în lateral. Butonul principal
     al unei pagini se cuvine să fie mai lat, dar nu mai înalt: două înălțimi
     apropiate (48 și 52) puse pe pagini diferite se citesc ca o scăpare. */
  lat: "h-12 px-8 text-[15px]",
};

/** Ce au toate butoanele în comun, indiferent de culoare. */
const BAZA =
  "inline-flex items-center justify-center gap-2 rounded-[8px] font-semibold transition-colors duration-200";

/**
 * Butonul verde plin. Acțiunea principală.
 *
 * ⚠ Unul singur pe ecran, de regulă. Două butoane verzi alăturate nu mai spun
 * care e acțiunea principală, deci nu mai e niciuna.
 */
export function butonVerde(marime: MarimeButon = "normal"): string {
  return `${BAZA} ${MARIMI[marime]} bg-primary text-white hover:bg-primary/90`;
}

/**
 * ═══ ⚠ `tint-2` LA CONTROALE, `tint` LA SUPRAFEȚE ═══
 *
 * Nu e o alegere de gust, e o măsurătoare. `--color-tint` e #FAFAFB, adică două
 * trepte sub alb; `--color-tint-2` e #F5F5F7, cinci trepte. Pe un card care are
 * deja chenar și umbră, două trepte ajung — forma e desenată de altceva, iar
 * hover-ul doar confirmă. Pe un buton, care e mic și în care omul chiar
 * țintește, două trepte aproape nu se văd.
 *
 * De aceea butoanele de aici folosesc `tint-2`, iar cardurile, rândurile de
 * întrebări și celulele benzii de contact folosesc `tint`.
 *
 * ⚠ Ce e DEJA pe tint (chipurile din documentele juridice, meniul din bară) trece
 * tot pe `tint-2`: nu se poate ridica un fundal la culoarea pe care o are deja.
 */

/**
 * Butonul alb cu chenar. Acțiunea secundară care stă singură: îndemnul din
 * cardurile de funcționalități, planurile nerecomandate din tabelul de prețuri.
 *
 * Aceeași înălțime și același colț ca perechea lui verde: puse alături, cele
 * două trebuie să stea pe aceeași linie de sus și de jos.
 */
export function butonAlb(marime: MarimeButon = "normal"): string {
  return `${BAZA} ${MARIMI[marime]} border border-hairline bg-white text-ink hover:bg-tint-2`;
}

/**
 * Butonul fără chenar. Acțiunea secundară care stă LÂNGĂ cea verde.
 *
 * ═══ DE CE ALTUL DECÂT CEL ALB ═══
 *
 * Lângă butonul verde plin, cu halou sub el, unul cu chenar concureaza cu el:
 * doua dreptunghiuri desenate, unul lângă altul, iar ochiul nu mai știe care e
 * acțiunea principală. Fără chenar, al doilea rămâne o cale, nu o alegere.
 *
 * ⚠ Auditul din 23.08 a găsit TREI tratamente pentru aceeași pereche: fantomă la
 * h-13 în hero-ul paginii de start, cu chenar la h-11 în cardurile de
 * funcționalități, și cu chenar la h-12 în `PageShell`. Trei înălțimi, două
 * greutăți de font, doua feluri de a arata. Acum sunt două roluri, scrise.
 */
export function butonFantoma(marime: MarimeButon = "normal"): string {
  return `${BAZA} ${MARIMI[marime]} text-ink-2 hover:bg-tint-2 hover:text-ink`;
}

/**
 * Butonul dezactivat, cât se trimite un formular.
 *
 * Scris o dată fiindcă erau două variante, iar una uita `disabled:hover:` și
 * lăsa butonul să reacționeze la hover deși nu mai făcea nimic.
 */
export const BUTON_INACTIV =
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary";
