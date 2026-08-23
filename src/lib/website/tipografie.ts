/**
 * Cele două trepte de titlu principal ale site-ului.
 *
 * ═══ DE CE SUNT SCRISE AICI ȘI NU ÎN FIECARE COMPONENTĂ ═══
 *
 * Auditul de design din 23.08 a măsurat titlurile `<h1>` în browser și a găsit
 * PATRU tratamente pentru același rol. Citite în cod erau, de fapt, tot patru,
 * dar altfel împărțite:
 *
 *   PageShell     38/52px  1.06  -0.025em
 *   PageHero      34/44px  1.08  -0.03em
 *   PaginaLegal   32/44px  1.08  -0.025em
 *   /ajutor       32/44px  1.10  -0.03em
 *
 * Primele două rânduri sunt o deosebire ADEVĂRATĂ, explicată în `PageHero`: pe
 * o pagină sub al cărei titlu urmează conținut, 52px cântărește cât toată lista
 * de dedesubt. Ultimele trei ar fi trebuit să fie același lucru și erau trei,
 * fiindcă fiecare a fost scris de mână, la câteva zile distanță.
 *
 * ⚠ Deosebirile astea NU se văd una lângă alta. 1.08 față de 1.10 la 44px
 * înseamnă 0,88px pe rând; nimeni nu le prinde comparând două pagini. Se văd
 * abia la măsurătoare, și tocmai de asta se strecoară: nimic nu le oprește.
 * Scrise o dată, nu mai au cum să se despartă.
 *
 * ═══ CE S-A ALES ȘI DE CE ═══
 *
 * Spațierea literelor la treapta mică e acum `-0.025em`, nu `-0.03em`. La 44px
 * cele două înseamnă -1,10px față de -1,32px. Treapta MARE, de 52px, e la
 * -0.025em: strânsoarea se mărește odată cu litera, niciodată invers, deci un
 * titlu mai mic strâns mai tare decât unul mai mare era greșeala, nu regula.
 *
 * Pe telefon treapta mică e 32px, nu 34: două din cele trei folosiri erau deja
 * la 32, iar titlurile lungi respiră mai bine acolo. Vezi și nota din `PageShell`
 * despre cele trei titluri care ies pe patru rânduri la 390px.
 */

/**
 * Titlul paginilor de prezentare: `/`, `/integrari`, `/optimizare`,
 * `/mentenanta-gratuita`, `/migrare`, `/vs/*`.
 *
 * Sub el urmează o pagină întreagă construită în jurul lui, deci are voie să
 * cântărească.
 */
export const H1_MARE =
  "text-[38px] font-bold leading-[1.06] tracking-[-0.025em] text-ink sm:text-[52px]";

/**
 * Titlul paginilor sub care începe imediat conținut: `/preturi`, `/contact`,
 * `/intrebari-frecvente`, documentele legale, centrul de ajutor.
 */
export const H1_MIC =
  "text-[32px] font-bold leading-[1.08] tracking-[-0.025em] text-ink sm:text-[44px]";
