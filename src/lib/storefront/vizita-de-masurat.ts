import { isNonProductionHost } from "@/lib/storefront/host";

/**
 * Cine intra in statisticile de vizite ale comerciantului („Surse de trafic").
 *
 * ═══ DE CE O REGULA SCRISA O SINGURA DATA ═══
 *
 * Sunt DOUA locuri care insereaza in `site_analytics`: pagina principala
 * (`[slug]/page.tsx`) si pagina de catalog (`pagina-magazin.tsx`). Fiecare isi scria
 * singur conditia, deci o excludere noua pusa doar intr-unul ar fi lasat jumatate din
 * vizitele false pe loc, fara ca vreo cifra sa arate care jumatate.
 */

/**
 * User-agentul cu care santinela (`api/cron/santinela`) cere paginile magazinelor.
 *
 * Santinela il TRIMITE, iar `seMasoaraVizita` il RECUNOASTE, prin aceeasi constanta:
 * schimbat intr-o parte, nu se poate desparti de cealalta.
 */
export const UA_SANTINELA = "edinio-santinela";

/**
 * Vizita asta se scrie in statisticile comerciantului?
 *
 *   - proprietarul NU: isi vede propriul magazin, nu e un client;
 *   - gazdele care nu sunt de productie NU (preview, localhost): scriu in baza de
 *     PRODUCTIE, deci fiecare vizita de test ar aparea la comerciant (vezi `host.ts`);
 *   - santinela NU.
 *
 * ═══ ⚠ SANTINELA SCRIA VIZITE FALSE (masurat pe 10.09.2026) ═══
 *
 * Cronul cere paginile fara cookie si pe domeniul propriu, deci trecea de primele doua
 * excluderi. Pe trei zile, in minutele rularilor (la doua ore, din regiunea Stockholm):
 * 252 de vizite „Direct", desktop, din Suedia, la eSAFE, 36 la atelierul-larisei si 36
 * la nordic-outlet-bucovina; in fereastra martor de dupa, zero. Proba descrierilor mai
 * cere patru pagini pe rulare de la un magazin ales dupa marime, adica ~48 de vizite pe
 * zi in plus la un comerciant pe care santinela nu-l atingea. Iar „Surse de trafic" e
 * exact sectiunea dupa care se taie bugete de reclama.
 *
 * ⚠ Egalitate EXACTA, nu „contine": un user-agent care doar pomeneste santinela e al
 * altcuiva, si vizita lui e reala.
 *
 * Randurile deja scrise NU se sterg de aici: e o scriere in baza, o decide proprietarul.
 */
export function seMasoaraVizita(a: {
  esteProprietar: boolean;
  host: string;
  userAgent: string | null | undefined;
}): boolean {
  if (a.esteProprietar) return false;
  if (isNonProductionHost(a.host)) return false;
  return (a.userAgent ?? "").trim() !== UA_SANTINELA;
}
