import { cn } from "@/lib/utils/cn";
import { liniePunctata, liniiPunctate, PUNCTAT } from "@/lib/website/linie-punctata";
import { CARDURI_SEO, SEO } from "@/lib/website/seo";
import { SectionEyebrow } from "../SectionEyebrow";
import { PanouCautareGoogle } from "./PanouCautareGoogle";
import { PanouRezultateGoogle } from "./PanouRezultateGoogle";
import { PanouIndexare } from "./PanouIndexare";
import { PanouSitemap } from "./PanouSitemap";

/**
 * Secțiunea „SEO" de pe pagina „Optimizare".
 *
 * ═══ ALT DESEN DECÂT LA „PERFORMANȚĂ", CERUT DE CLIENT ═══
 *
 * Acolo sunt trei carduri albe, cu chenar, unul lângă altul. Aici, după referința
 * trimisă de el: DOUĂ PE RÂND, fără chenar și fără fundal, despărțite doar prin
 * linii PUNCTATE care formează o cruce. Adică nu sunt patru obiecte pe o pagină,
 * ci o pagină împărțită în patru.
 *
 * Deosebirea nu e de gust: cardurile de la „Performanță" sunt trei lucruri
 * diferite, fiecare cu ilustrația lui; astea patru sunt fețele aceluiași lucru,
 * iar o grilă despărțită prin linii se citește ca un tot.
 *
 * ⚠ CULOAREA LINIILOR e #DCDCE3, nu `--color-hairline` (#EAEAEE), deși aia e
 * culoarea liniilor noastre de 1px. O linie PUNCTATĂ are cam jumătate din
 * lungime goală, deci la aceeași culoare cântărește vizibil mai puțin decât una
 * continuă și se pierde pe alb. Același ton, dus mai închis — aceeași socoteală
 * ca la rama punctată a cardurilor de pe pagina de start.
 *
 * ⚠ NEÎNCHEIATĂ: clientul a cerut PATRU carduri și a dat textele pentru primul.
 * Restul se adaugă în `CARDURI_SEO`, plus ilustrația fiecăruia mai jos.
 */

export function SectiuneSeo() {
  return (
    <section id="seo" className="border-t border-hairline bg-white">
      <div className="mx-auto max-w-[1200px] px-5 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-28 lg:pb-32">
        <div className="mx-auto max-w-[720px] text-center">
          <SectionEyebrow label={SEO.eyebrow} />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {SEO.titlu}
          </h2>
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {SEO.descriere}
          </p>
        </div>

        {/*
          Grila, cu CHENAR PUNCTAT DE JUR ÎMPREJUR — cerut de client, și așa e și
          în referința trimisă de el: liniile nu doar despart celulele, ci închid
          tot blocul. Fără chenar, cele două linii dinăuntru păreau două tăieturi
          într-o pagină; cu el, se citește ca un tablou împărțit în patru.

          Liniile dintre celule stau pe CELULE, ca margini, nu ca elemente
          separate: o linie desenată aparte ar fi trebuit poziționată absolut și
          n-ar fi știut cât de înalt e rândul.

          Pe telefon rămâne o singură coloană, deci despărțitura verticală n-are
          ce despărți: acolo e doar linia de sub fiecare card.
        */}
        <div
          className="mt-14 grid md:grid-cols-2 lg:mt-20"
          style={liniiPunctate(["sus", "jos", "stanga", "dreapta"])}
        >
          {CARDURI_SEO.map((card, i) => {
            const peUltimulRand = i >= CARDURI_SEO.length - (CARDURI_SEO.length % 2 || 2);
            const inColoanaStanga = i % 2 === 0;

            return (
              <article
                key={card.id}
                className={cn(
                  "relative flex flex-col px-5 py-8 sm:px-6 sm:py-10 md:px-8 lg:px-10 lg:py-12",
                  /* Marginile de la capetele rândului: fără ele, textul primului
                     card ar fi lipit de linia verticală. */
                  inColoanaStanga ? "md:pr-8 lg:pr-10" : "md:pl-8 lg:pl-10",
                )}

              >
                <div className="mx-auto max-w-[420px] text-center">
                  <h3 className="text-[22px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[26px]">
                    {card.titlu}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.6] text-ink-2 sm:text-[16px]">
                    {card.descriere}
                  </p>
                </div>

                {/*
                  Ilustrația. Se alege pe `id`, nu pe poziție: o listă reordonată
                  n-are voie să pună căutarea Google sub alt titlu.
                */}
                <div className="mt-8 lg:mt-10">
                  {card.id === "gasire" ? <PanouCautareGoogle /> : null}
                  {card.id === "prezentare" ? <PanouRezultateGoogle /> : null}
                  {card.id === "sitemap" ? <PanouSitemap /> : null}
                  {card.id === "indexare" ? <PanouIndexare /> : null}
                </div>

                {/*
                  ── Despărțiturile ──

                  Sunt ELEMENTE, nu laturi ale celulei, dintr-un motiv anume:
                  cea verticală trebuie să apară doar de la `md` în sus, unde
                  chiar sunt două coloane. Pe telefon grila e pe o coloană, iar o
                  linie „la dreapta" n-ar despărți nimic — ar fi o dungă lipită
                  de marginea cardului. Ca element, condiția aia se scrie curat
                  cu `hidden md:block`, adică în CSS; ca fundal ar fi cerut
                  citirea lățimii ferestrei în JS, deci un component de client pe
                  o secțiune care altfel se desenează întreagă pe server.
                */}
                {!peUltimulRand ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0"
                    style={{ height: PUNCTAT.grosime, ...liniePunctata("orizontala") }}
                  />
                ) : null}

                {inColoanaStanga ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 hidden md:block"
                    style={{ width: PUNCTAT.grosime, ...liniePunctata("verticala") }}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
