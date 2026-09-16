import {
  BORDEROU_NEVALIDAT,
  BORDEROU_VALIDAT_DE_CLIENT,
  BORDEROU_VALIDAT_DE_TRANSPORTATOR,
} from "./client";

/**
 * Ce i se spune comerciantului cand marfa Pall-Ex n-a plecat dupa o zi.
 *
 * ═══ ⚠ DE CE E UN FISIER INTREG PENTRU O PROPOZITIE ═══
 *
 * Avertismentul cronului spunea intotdeauna acelasi lucru: „cel mai des inseamna
 * ca borderoul nu a fost validat, deschide comanda si valideaza-l". Adevarat in
 * cazul cel mai des, si fals in celelalte doua.
 *
 * Fluxul lor are PATRU stari, nu doua (specificatia, clasa `Bordereau`):
 *
 *   0  nevalidat                     marfa sta, si chiar comerciantul o poate porni
 *   1  validat de CLIENT             el si-a facut partea; asteapta transportatorul
 *   2  validat de TRANSPORTATOR      ar trebui sa fie pe drum
 *
 * Deci un comerciant care si-a validat borderoul acum doua zile si asteapta masina
 * primea un mesaj care il trimitea sa valideze ce validase deja. Merge in
 * ClientPlus, gaseste butonul stins, si a doua oara nu mai crede avertismentul.
 *
 * ⚠ Chiar cronul are scris in el de ce conteaza asta: cand lista de statusuri a
 * magazinului nu se putea citi, TOATE partidele primeau „valideaza borderoul", si
 * comentariul de acolo numeste tocmai urmarea de mai sus. Paza a fost pusa pentru
 * o singura cauza a mesajului fals; cealalta, mai deasa, a ramas deschisa.
 *
 * ═══ ⚠ CAND NU STIM, NU GHICIM ═══
 *
 * `null` inseamna „n-am putut citi borderoul" sau „comanda n-are borderou pe ea".
 * Acolo mesajul nu mai AFIRMA o cauza: ii cere omului sa se uite. Un indemn
 * gresit costa mai mult decat unul care nu spune nimic, fiindca il invata sa nu se
 * mai uite la avertismente.
 */
export function sfatPentruMarfaOprita(stareBorderou: number | null | undefined): string {
  switch (stareBorderou) {
    case BORDEROU_NEVALIDAT:
      return (
        "Borderoul NU e validat, deci marfa nu pleaca: deschide comanda si apasa "
        + "„Valideaza borderoul”."
      );
    case BORDEROU_VALIDAT_DE_CLIENT:
      return (
        "Borderoul e deja validat de tine si asteapta transportatorul, deci nu mai ai "
        + "ce valida. Daca intarzie, intreaba Pall-Ex de ridicare."
      );
    case BORDEROU_VALIDAT_DE_TRANSPORTATOR:
      return (
        "Borderoul e validat si de transportator, deci marfa ar trebui sa fie preluata. "
        + "Daca inca e la tine in depozit, intreaba Pall-Ex."
      );
    default:
      /*
       * ⚠ Nici „valideaza", nici „nu valida": doar „uita-te". Aici intra si starile
       * pe care ei le-ar adauga maine, si acelea n-au voie sa produca un indemn
       * inventat.
       */
      return (
        "Verifica in comanda starea borderoului: pana cand e validat, marfa ramane "
        + "in depozitul tau."
      );
  }
}
