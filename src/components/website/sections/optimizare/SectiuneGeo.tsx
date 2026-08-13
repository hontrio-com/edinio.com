import Image from "next/image";
import { ASISTENTI, ASISTENTI_TEXT, GEO } from "@/lib/website/geo";
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
 * ⚠ SUNT ÎN DOUĂ LOCURI, ȘI AMÂNDOUĂ SUNT CERUTE.
 *
 * TREI, încălecate, în capul răspunsului, unde ar sta semnul asistentului: acolo
 * spun că răspunsul ăla îl poate da oricare dintre ei.
 *
 * PATRU, întregi, sub rândul de text: acolo se spune cine poate citi paginile
 * magazinului, iar Perplexity le citește la fel ca ceilalți.
 *
 * O formă intermediară le scosese de jos, socotind că teancul e de ajuns. Nu e:
 * în teanc se vede jumătate din fiecare siglă, deci teancul spune „mai mulți",
 * nu „aceștia".
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

          <div className="mt-8 flex flex-col items-center gap-5 lg:mt-10">
            <p className="text-center text-[13px] leading-[1.5] text-ink-2 sm:text-[14px]">
              {ASISTENTI_TEXT}
            </p>

            {/*
              ⚠ ÎNĂLȚIME EGALĂ, LĂȚIME DUPĂ RAPORTUL FIECĂREIA. Trei din patru
              sunt aproape pătrate; a patra, Perplexity, e mai înaltă decât lată.
              Cu lățime egală ar fi ieșit turtită. Raporturile sunt citite din
              `viewBox`-ul fișierelor, iar o probă le compară cu sursa lor.

              ⚠ Și numele scrie sub fiecare: siglele astea se recunosc bine în
              lumea lor și deloc în afara ei, iar rândul de deasupra vorbește
              chiar despre ele. Patru semne mute ar fi cerut ghicit.
            */}
            <ul className="flex flex-wrap items-start justify-center gap-x-8 gap-y-6 sm:gap-x-12">
              {ASISTENTI.map((asistent) => (
                <li key={asistent.nume} className="flex flex-col items-center gap-[10px]">
                  <span
                    className="relative block h-[26px] sm:h-[30px]"
                    style={{ aspectRatio: String(asistent.raport) }}
                  >
                    <Image
                      src={asistent.src}
                      alt={asistent.nume}
                      fill
                      sizes="32px"
                      unoptimized
                      className="object-contain"
                    />
                  </span>
                  <span className="text-[12px] leading-none text-ink-2 sm:text-[13px]">
                    {asistent.nume}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
