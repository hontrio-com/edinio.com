import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { FEATURE_CARDS, type FeatureCard } from "@/lib/website/features";
import { FeatureStack } from "./FeatureStack";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * Secțiunea de funcții: carduri late, care se strâng în teanc la derulare.
 *
 * Fiecare card e `sticky`, așa că se oprește sub bara de sus și următorul urcă
 * peste el. Lipirea e pură CSS. Cel rămas dedesubt se duce în spate și se
 * înclină, iar partea asta cere puțin JavaScript: `FeatureStack` scrie o
 * variabilă, `--covered`, iar desenul îl face tot foaia de stil. Am încercat
 * întâi fără niciun JavaScript, cu `animation-timeline: view()`, dar nu merge
 * peste `sticky`; motivele sunt scrise pe larg în `globals.css`.
 *
 * Adâncimea nu e o micșorare aleasă de mână, ci o deplasare pe `Z` într-o
 * perspectivă: cardul chiar se duce în spate, iar cât se micșorează decide
 * perspectiva. De aceea marginile rămân drepte și nu pare o poză scalată.
 */

/* Cat coboara fiecare card fata de cel dinainte, cand se lipeste. */
const STACK_STEP = 16;
/* De la ce inaltime incepe teancul: bara de sus plus o respiratie. */
const STACK_TOP = 96;

export function Features() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-28 lg:pb-36">
        <div className="mx-auto max-w-[720px] text-center">
          {/*
            Perechea etichetei rosii de mai sus. Acelasi desen, alt ton: asa se
            citeste ca sectiunea asta raspunde la cea dinainte, nu ca incepe alt
            subiect. De aceea nu mai scrie „Ce face platforma".
          */}
          <SectionEyebrow label="Soluția" />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            Tot ce ține un magazin în picioare, la locul lui
          </h2>
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            De la primul produs pus în magazin până la coletul ajuns la client,
            fără să pui nimic cap la cap singur.
          </p>
        </div>

        <div className="mt-14 lg:mt-20">
          {/*
            Cardurile raman frati directi, intr-un singur container. Asa fiecare
            se poate lipi pe toata inaltimea listei si se aduna in teanc. Bagate
            fiecare in propriul invelis cu inaltime proprie, lipirea moare: un
            element `sticky` se misca doar in cutia parintelui.
          */}
          <FeatureStack>
            {FEATURE_CARDS.map((card, index) => (
              <div
                key={card.id}
                className="feature-slot sticky"
                style={{ top: STACK_TOP + index * STACK_STEP }}
              >
                <Card card={card} last={index === FEATURE_CARDS.length - 1} />
              </div>
            ))}
          </FeatureStack>
        </div>
      </div>
    </section>
  );
}

function Card({ card, last }: { card: FeatureCard; last: boolean }) {
  return (
    <article
      data-feature-card
      className={cn(
        "feature-card feature-card-shadow overflow-hidden rounded-[24px] border border-hairline bg-white",
        /* Distanta dintre carduri da si distanta de derulare dintre ele. */
        !last && "mb-6 lg:mb-8",
      )}
    >
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14 lg:p-10">
        {/* ── Stânga: textul ── */}
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-3">
            {card.kicker}
          </p>

          <h3 className="mt-4 text-[26px] font-bold leading-[1.14] tracking-[-0.03em] text-ink sm:text-[32px]">
            {card.title}
          </h3>

          <p className="mt-4 max-w-[480px] text-[15px] leading-[1.6] text-ink-2 sm:text-[16px]">
            {card.description}
          </p>

          <ul className="mt-7 flex flex-wrap gap-2">
            {card.benefits.map((benefit) => (
              <li
                key={benefit}
                className="rounded-lg border border-hairline bg-tint px-3 py-1.5 text-[12.5px] font-medium text-ink-2"
              >
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Dreapta: imaginea ── */}
        <ImagePanel card={card} />
      </div>
    </article>
  );
}

/**
 * Panoul din dreapta: lumina verde a hero-ului, adusă în mic, cu imaginea
 * ridicată deasupra ei.
 *
 * Cât imaginea lipsește, caseta scrie ce trebuie să conțină, ca ideea să nu se
 * piardă până vine fișierul.
 */
function ImagePanel({ card }: { card: FeatureCard }) {
  return (
    <div className="relative isolate overflow-hidden rounded-[18px] bg-tint p-5 sm:p-7">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(85% 75% at 28% 15%, rgba(26,181,84,0.22) 0%, transparent 72%), radial-gradient(70% 65% at 80% 85%, rgba(26,181,84,0.14) 0%, transparent 74%)",
          filter: "blur(18px)",
        }}
      />

      <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] border border-hairline bg-white shadow-[0_14px_36px_-18px_rgba(10,10,10,0.28)]">
        {card.image.src ? (
          <Image
            src={card.image.src}
            alt={card.image.alt}
            fill
            /*
             * Masurat, nu ghicit. Latimea casetei, pe latimi de ecran:
             *   360 -> 224   640 -> 464   1023 -> 847 (maximul)
             *   1024 -> 371  1280 si peste -> 467 (oprit de max-w-[1200px])
             * Cel mai mare NU e pe desktop, ci chiar sub pragul `lg`, unde
             * cardul e inca pe o coloana si ocupa toata latimea. Peste 1024
             * intra a doua coloana si caseta se injumatateste.
             */
            sizes="(min-width: 1024px) 470px, (min-width: 640px) 84vw, 70vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
            <ImageIcon className="h-6 w-6 text-ink-3" strokeWidth={1.5} />
            <span className="text-[13px] font-medium text-ink-2">
              {card.image.hint}
            </span>
            <span className="text-[11px] text-ink-3">4:3 orizontal</span>
          </div>
        )}
      </div>
    </div>
  );
}
