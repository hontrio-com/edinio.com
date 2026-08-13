import { ASISTENTI_TEXT, GEO } from "@/lib/website/geo";
import { SectionEyebrow } from "../SectionEyebrow";
import { PanouAsistentAi } from "./PanouAsistentAi";

/**
 * Secțiunea „GEO", a treia și ultima de pe pagina „Optimizare".
 *
 * ═══ O SINGURĂ ILUSTRAȚIE, LATĂ ═══
 *
 * „Performanță" are trei carduri, „SEO" are patru într-o grilă punctată. Aici e
 * un singur lucru de arătat — o discuție — iar o discuție cere lățime: rândurile
 * scurte o fac să arate a mesaje, nu a răspuns. De aceea fereastra stă singură,
 * la mijloc, pe cel mult 760px.
 *
 * ⚠ ȘI DE ACEEA SECȚIUNEA NU E O A TREIA GRILĂ. Trei secțiuni cu același desen
 * s-ar fi citit ca o listă lungă; a treia rupe ritmul tocmai fiindcă ce arată e
 * altfel.
 *
 * ═══ SIGLELE ═══
 *
 * ⚠ NU MAI SUNT UN RÂND SUB FEREASTRĂ, ci stau ÎNCĂLECATE ÎN RĂSPUNS, în locul
 * unde ar sta semnul asistentului — cerut de client (13.08). E o mutare mică cu
 * un înțeles mare: pe un rând dedesubt, siglele erau o listă de nume; în capul
 * răspunsului, ele spun că răspunsul ăla îl poate da oricare dintre ei.
 *
 * Sub fereastră a rămas doar rândul de text, fiindcă el spune ce siglele nu pot
 * spune singure.
 *
 * ⚠ RÂNDUL SPUNE „POT FI CITITE", NU „SUNT INDEXATE".
 *
 * Ce iau și ce nu iau asistenții e alegerea lor; nimeni nu poate promite că un
 * magazin ajunge în răspunsurile lor. Ce se poate spune, și se poate verifica,
 * e că nimic nu-i oprește: `src/app/robots.ts` deschide `/` pentru `*` și nu
 * blochează niciun robot de AI. Multe platforme îi blochează, deci lucrul ăsta
 * chiar deosebește.
 */

export function SectiuneGeo() {
  return (
    <section id="geo" className="border-t border-hairline bg-white">
      <div className="mx-auto max-w-[1200px] px-5 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-28 lg:pb-32">
        <div className="mx-auto max-w-[720px] text-center">
          <SectionEyebrow label={GEO.eyebrow} />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {GEO.titlu}
          </h2>
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {GEO.descriere}
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-[760px] lg:mt-20">
          <PanouAsistentAi />

          {/* Rândul de sub fereastră. Siglele stau în răspuns, nu aici. */}
          <p className="mt-8 text-center text-[13px] leading-[1.5] text-ink-2 sm:text-[14px] lg:mt-10">
            {ASISTENTI_TEXT}
          </p>
        </div>
      </div>
    </section>
  );
}
