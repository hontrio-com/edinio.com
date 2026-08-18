/**
 * Culorile liniilor de pe site-ul de prezentare.
 *
 * Aici, și nu în componenta care a avut-o prima, fiindcă acum o folosesc două:
 * cardurile de funcții de pe pagina de start și secțiunile încasetate de pe
 * „Migrare magazin". Cu o copie de fiecare parte, prima corectură făcută într-un
 * loc le-ar fi despărțit — iar două linii punctate de tonuri diferite pe același
 * site se văd imediat ce ajung pe același ecran.
 */

/**
 * Culoarea ramei PUNCTATE pe alb.
 *
 * ⚠ NU `--color-hairline` (#EAEAEE), deși aia e culoarea liniilor noastre de 1px.
 * O linie punctată are cam jumătate din lungime goală, deci la aceeași culoare
 * cântărește vizibil mai puțin decât una continuă și se pierde pe alb. #DCDCE3 e
 * același ton, dus destul de închis cât să ajungă la aceeași diferență de
 * luminanță pe care o are rama modelului, ~36.
 */
export const DASH_ON_WHITE = "#DCDCE3";
