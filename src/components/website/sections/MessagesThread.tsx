"use client";

import { useEffect, useRef } from "react";
import { PROBLEM_MESSAGES } from "@/lib/website/problem";

/**
 * Firul de mesaje din primul card al secțiunii „Problema".
 *
 * Patru întrebări primite, în bule iMessage, care sosesc una câte una când cardul
 * ajunge în dreptul ochilor. Desenul bulei, codița și arcul sunt în `globals.css`,
 * la `.imsg`; aici e doar declanșatorul.
 *
 * ═══ DE CE E COMPONENTĂ DE CLIENT ═══
 *
 * Secțiunea din jur rămâne randată pe server. Doar bucata asta are nevoie de
 * JavaScript, și numai pentru UN lucru: să afle când cardul intră în ecran.
 *
 * Fără declanșator, animația ar porni la încărcarea paginii — adică s-ar termina
 * cu mult înainte ca omul să deruleze până la ea, și n-ar vedea-o nimeni
 * niciodată. Secțiunea stă sub prima pagină de ecran.
 *
 * `animation-timeline: view()` ar fi mers fără JavaScript, dar leagă PROGRESUL de
 * poziția derulării: mesajele ar apărea și ar dispărea pe măsură ce derulezi
 * înainte și înapoi, ca un cursor tras cu mâna. Noi vrem altceva — o animație în
 * timp, pornită o dată, când ajungi acolo.
 *
 * Se joacă O SINGURĂ dată. Mesajele au sosit; nu sosesc din nou de fiecare dată
 * când treci prin dreptul lor.
 *
 * Nu ține nicio stare React: observatorul scrie direct un atribut pe element.
 * Cu `useState` ar fi fost o re-randare în plus pentru ceva ce oricum e pur
 * vizual, plus regula proiectului despre stare pusă din efecte.
 */

/** Cât stă între două mesaje. Sub o jumătate de secundă par trimise deodată. */
const GAP = 0.62;

/** Prima nu pleacă instant: altfel pare că era deja acolo, nu că tocmai a venit. */
const FIRST = 0.18;

export function MessagesThread() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    /* Browser fără `IntersectionObserver`: arată-le pur și simplu. */
    if (typeof IntersectionObserver === "undefined") {
      node.dataset.arrive = "go";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          node.dataset.arrive = "go";
          /* Gata, nu mai avem ce urmări: se joacă o singură dată. */
          observer.disconnect();
        }
      },
      /* Nu de la primul pixel: la 45% cardul e clar în ecran, deci începutul
         animației prinde omul uitându-se la ea, nu ghicind-o cu coada ochiului. */
      { threshold: 0.45 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      /*
        Ancorat JOS: mesajele noi apar dedesubt și le împing pe cele vechi în sus,
        ca într-o conversație. Ce nu mai încape se taie de marginea de sus — tot
        ca într-o conversație derulată.
      */
      className="relative flex h-full w-full flex-col justify-end overflow-hidden bg-white pb-4"
    >
      {/*
        Fără JavaScript, mesajele n-ar apărea deloc: starea de pornire e „ascuns".
        Sunt conținut, nu ornament, deci se arată dintr-o dată.
      */}
      <noscript>
        <style>{`.imsg-row{grid-template-rows:1fr}.imsg{opacity:1;transform:none}`}</style>
      </noscript>

      {/*
        Stingerea de sus.

        Pe ecrane late nu se vede: primul mesaj începe oricum sub ea. Contează pe
        tabletă, unde cardul e cel mai îngust din toată scara — mesajele se rup în
        două rânduri, nu mai încap toate patru, iar marginea de sus tăia fix prin
        mijlocul unei bule. Tăiat drept arată a decupaj greșit; stins, arată a fir
        din care se vede doar coada, adică exact ce e.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, #FFFFFF 32%, rgba(255,255,255,0))",
        }}
      />

      {PROBLEM_MESSAGES.map((message, index) => (
        <div
          key={message}
          className="imsg-row"
          style={{ ["--imsg-delay" as string]: `${FIRST + index * GAP}s` }}
        >
          <div className="imsg-clip">
            {/*
              Spațiul din stânga e 22px, nu mai puțin: codița iese din bulă până
              la -18px, iar `overflow-hidden` de deasupra ar tăia-o și ar rămâne un
              bulgăre în loc de vârf.
            */}
            <div className="flex pl-[22px] pr-3 pt-2.5">
              <p
                className="imsg text-[15px] leading-[20px] sm:text-[16px] sm:leading-[21px]"
                style={{
                  /*
                    Teancul de fonturi de sistem. Pe iPhone și pe Mac iese chiar
                    SF Pro, adică exact fontul din aplicație. În rest iese fontul
                    sistemului, fiindcă SF Pro nu se poate livra pe web.
                  */
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                }}
              >
                {message}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
