import {
  COMPARISON_EYEBROW,
  COMPARISON_LEAD,
  COMPARISON_NOTE,
  COMPARISON_RIVALS,
  COMPARISON_ROWS,
  COMPARISON_TITLE,
  COMPARISON_US,
} from "@/lib/website/comparison";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * Tabelul de comparație: Edinio față de celelalte platforme.
 *
 * A luat locul demo-ului interactiv pe prima pagină (cerut 2026-08-09).
 *
 * ═══ CAPUL SECȚIUNII E AL PERECHII ═══
 *
 * Aceeași coloană de 720px, aceeași etichetă (13px, semibold, 0.18em), același
 * titlu (32/44px) și aceeași descriere (16/18px) ca la „Problema" și „Soluția".
 * Nu e copiere din lene: capetele astea se citesc ca o serie doar fiindcă sunt
 * identice. Când se schimbă unul, se schimbă toate.
 *
 * Eticheta e `SectionEyebrow`, deci gri. Verdele e rezervat secțiunii Integrări
 * — dacă ar fi verde și aici, n-ar mai însemna nimic acolo.
 *
 * ═══ UN SINGUR TABEL ÎN PAGINĂ, NU DOUĂ DESENE ═══
 *
 * Cerința a fost „perfect responsive și pe mobil, să se înțeleagă exact tot".
 * Răspunsul obișnuit — un tabel care se derulează pe orizontală — pică exact la
 * partea a doua: pe un ecran de 390px se văd două coloane din șase, iar cine nu
 * ghicește că se poate trage lateral crede că a citit tot.
 *
 * Al doilea răspuns obișnuit — un tabel pentru desktop și o listă de carduri
 * pentru telefon, amândouă în pagină, ascunse pe rând — costă dublu: aceleași
 * texte în două locuri (deci se despart la prima corectură) și conținut citit de
 * două ori de cititoarele de ecran, dacă ascunderea nu e făcută perfect.
 *
 * Aici e UN SINGUR `<table>`, semantic corect, care își schimbă doar `display`:
 *   - de la `lg` în sus e tabel adevărat, cu antet de coloane;
 *   - sub `lg` fiecare RÂND devine un card: criteriul e titlul, iar fiecare
 *     celulă devine un rând „platformă → valoare".
 *
 * Numele platformei din interiorul celulei apare doar pe ecrane mici (`lg:hidden`)
 * și e `aria-hidden`: pe desktop rolul lui îl are `<th>`-ul din antet, iar
 * legătura celulă-antet o face oricum tabelul. Fără el, pe telefon ar rămâne o
 * coloană de valori fără să se știe a cui e fiecare.
 *
 * ═══ DE CE `lg`, ȘI NU `md` ═══
 *
 * Șase coloane la 768px lasă ~100px de coloană, iar „Necesită configurare" și
 * „Aplicații / parteneri" se rup în trei rânduri fiecare — tabelul devine un
 * zid. La 1024px sunt ~138px de coloană, unde textele stau pe cel mult două
 * rânduri. Deci tableta primește tot cardurile, și e mai bine așa.
 */

/* Verdele pentru TEXT. Verdele de brand (#1AB554) are pe alb 2,6:1, sub pragul
   de citibilitate; #12874A e același ton dus la 4,6:1. Aceeași constantă și
   același motiv ca în `IntegrationsBenzi.tsx` și `TrustedProduct.tsx`. */
const GREEN_TEXT = "#12874A";

export function Comparison() {
  return (
    <section id="comparatie" className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-[720px] text-center">
          <SectionEyebrow label={COMPARISON_EYEBROW} />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {COMPARISON_TITLE.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>

          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {COMPARISON_LEAD}
          </p>
        </div>

        {/*
          Placa albă pe pagina albă se deosebește DOAR prin umbră — aceeași
          rețetă de patru straturi ca la casetele de sigle, scoasă în
          `--umbra-placa` ca sursa de lumină să rămână una singură în tot site-ul.
          Vezi comentariul de la `.caseta-sigla` din globals.css pentru ce face
          fiecare strat și de ce niciunul nu poate lipsi.

          `overflow-hidden` ca fundalul coloanei Edinio să fie tăiat de colțuri;
          fără el, tenta iese în afara plăcii sus și jos.
        */}
        <div className="placa mt-14 overflow-hidden rounded-[16px] lg:mt-20">
          <table className="block w-full lg:table lg:table-fixed lg:border-collapse">
            <caption className="sr-only">
              Comparație între {COMPARISON_US} și {COMPARISON_RIVALS.join(", ")} pe
              criteriile care privesc operarea unui magazin online în România.
            </caption>

            <thead className="hidden lg:table-header-group">
              <tr>
                <th
                  scope="col"
                  className="w-[26%] border-b border-hairline px-5 py-4 text-left text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3"
                >
                  Criteriu
                </th>
                <th
                  scope="col"
                  className="border-b border-hairline bg-tint px-4 py-4 text-left text-[14px] font-bold tracking-[-0.01em]"
                  style={{ color: GREEN_TEXT }}
                >
                  {COMPARISON_US}
                </th>
                {COMPARISON_RIVALS.map((rival) => (
                  <th
                    key={rival}
                    scope="col"
                    className="border-b border-hairline px-4 py-4 text-left text-[14px] font-semibold tracking-[-0.01em] text-ink"
                  >
                    {rival}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="block lg:table-row-group">
              {COMPARISON_ROWS.map((row) => (
                /*
                  Pe ecrane mici rândul e un card: `border-t` desparte cardurile
                  între ele (primul n-are, ca să nu dubleze marginea plăcii), iar
                  pe desktop redevine linia obișnuită dintre rânduri.
                */
                <tr
                  key={row.criteriu}
                  className="block border-t border-hairline first:border-t-0 lg:table-row"
                >
                  <th
                    scope="row"
                    className="block px-5 pb-3 pt-5 text-left text-[15px] font-semibold leading-[1.35] tracking-[-0.02em] text-ink lg:table-cell lg:px-5 lg:py-4 lg:text-[14px] lg:font-medium lg:leading-[1.45] lg:tracking-normal lg:text-ink-2"
                  >
                    {row.criteriu}
                  </th>

                  {/*
                    Edinio primul, și pe telefon, și pe desktop: e coloana
                    pentru care există tabelul. Tenta `tint` e o suprafață din
                    INTERIORUL plăcii, singurul loc unde mai are voie să apară
                    după trecerea site-ului pe fundal alb.
                  */}
                  <td className="flex items-baseline justify-between gap-4 bg-tint px-5 py-2.5 lg:table-cell lg:px-4 lg:py-4 lg:align-top">
                    <span className="text-[13px] font-medium text-ink-2 lg:hidden" aria-hidden="true">
                      {COMPARISON_US}
                    </span>
                    <span
                      className="text-right text-[14px] font-semibold leading-[1.4] lg:text-left lg:text-[14px]"
                      style={{ color: GREEN_TEXT }}
                    >
                      {row.edinio}
                    </span>
                  </td>

                  {row.rivali.map((valoare, i) => (
                    <td
                      key={COMPARISON_RIVALS[i]}
                      className="flex items-baseline justify-between gap-4 px-5 py-2.5 last:pb-5 lg:table-cell lg:px-4 lg:py-4 lg:align-top lg:last:pb-4"
                    >
                      <span className="text-[13px] font-medium text-ink-2 lg:hidden" aria-hidden="true">
                        {COMPARISON_RIVALS[i]}
                      </span>
                      {/*
                        Absența e mai ștearsă decât o descriere, dar NU e roșie.
                        Roșul ar face din tabel o acuzație, iar afirmațiile astea
                        trebuie să rămână descrieri verificabile — vezi nota de
                        sub tabel și comentariul din `comparison.ts`.
                      */}
                      <span
                        className={`text-right text-[13.5px] leading-[1.4] lg:text-left ${
                          valoare === "X" || valoare === "Nu" ? "text-ink-3" : "text-ink-2"
                        }`}
                      >
                        {valoare}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/*
          Nota se aliniază la STÂNGA plăcii, nu pe axa capului de secțiune.
          E o notă de subsol a tabelului, nu o a doua descriere — legată de el
          prin margine, se citește ca atare. Într-o casetă centrată de lățime
          fixă părea centrată doar cât timp textul o umplea; la prima corectură
          care o scurta, ar fi ieșit un rând plutind strâmb sub tabel.
        */}
        <p className="mt-5 text-[12.5px] leading-[1.55] text-ink-3">
          {COMPARISON_NOTE}
        </p>
      </div>
    </section>
  );
}
