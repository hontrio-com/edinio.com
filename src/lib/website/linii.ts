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

/**
 * Culoarea liniei CONTINUE de 1px, ca valoare — aceeași cu `--color-hairline`.
 *
 * ⚠ NU se scrie `var(--color-hairline)` într-un `style` inline: numele de culori
 * ale site-ului sunt declarate ca temă Tailwind și NU ajung variabile CSS pe
 * `:root`. Utilitarele (`border-hairline`, `text-ink-3`) merg, fiindcă le compune
 * Tailwind la build; un `var(--color-hairline)` scris de mână se rezolvă la nimic,
 * iar valoarea care îl conține — un gradient, de pildă — devine invalidă și cade
 * în întregime. Adică nu se vede nimic, și nimic nu dă eroare.
 *
 * Ăsta e chiar motivul pentru care există fișierul de față: unde culoarea trebuie
 * scrisă într-un `style`, se scrie de aici.
 */
export const HAIRLINE_ON_WHITE = "#EAEAEE";

/**
 * Cerneala stinsă, ca valoare — aceeași cu `--color-ink-3`. Pentru bulinele și
 * semnele desenate în `style`, din același motiv ca mai sus.
 */
export const INK_3 = "#8A8A94";

/**
 * Verdele care se citește, ca valoare pentru `style`.
 *
 * ⚠ AICI `var()` CHIAR MERGE, spre deosebire de `--color-hairline` de mai sus, și
 * merită spus de ce, altfel nota de deasupra pare contrazisă. `--primary` NU e o
 * culoare de temă Tailwind: e un token shadcn, declarat direct pe `:root` în
 * `globals.css`. Deci există ca variabilă CSS adevărată în browser, iar un
 * `var(--primary)` scris de mână se rezolvă. `--color-hairline`, în schimb, e
 * declarat în `@theme` și Tailwind îl consumă la build, fără să-l scoată pe
 * `:root`.
 *
 * ⚠ AICI ERAU DOI VERZI. `#12874A` era scris de mână în nouă fișiere, cu cinci
 * declarații separate de `GREEN_TEXT` și același comentariu copiat lângă fiecare.
 * Motivul lui era corect — `--color-brand` (#1AB554) are 2,70:1 pe alb, sub prag
 * — dar `--primary` (#008236) era deja acolo și are 4,95:1, adică mai bine decât
 * cei 4,57:1 ai lui #12874A. Doi verzi închiși la 0,4 diferență, pe aceleași
 * pagini, nu se văd ca decizie.
 *
 * Doctrina întreagă, cu ce rol are fiecare din cei doi verzi rămași, e scrisă în
 * capul lui `globals.css`, lângă `--color-brand`.
 *
 * ⚠ În clase se scrie `text-primary`, `bg-primary/10`, `border-l-primary`. De
 * aici se ia DOAR când culoarea trebuie pusă într-un `style`.
 */
export const VERDE_CITIBIL = "var(--primary)";
