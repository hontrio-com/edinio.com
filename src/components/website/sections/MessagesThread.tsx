"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { PROBLEM_MESSAGES, type ProblemMessage } from "@/lib/website/problem";

/**
 * Firul de mesaje din primul card al secțiunii „Problema".
 *
 * Patru întrebări primite, fiecare de la alt om, în bule iMessage care sosesc una
 * câte una când cardul ajunge în dreptul ochilor. Desenul bulei, codița și arcul
 * sunt în `globals.css`, la `.imsg`; aici e doar declanșatorul.
 *
 * Cercul cu chipul expeditorului e ce se vede într-o conversație de GRUP pe
 * iPhone. Într-una în doi, iOS nu îl arată deloc — poza contactului stă doar în
 * antet. Aici are sens: sunt patru oameni diferiți care întreabă, nu unul care
 * scrie de patru ori.
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

/**
 * Cercul cu chipul expeditorului.
 *
 * `z-index: 1` NU e de ornament. Codița bulei se desenează dintr-o formă albastră
 * și una ALBĂ care mușcă din ea, iar cea albă se întinde cu 18px la stânga bulei,
 * adică fix peste cerc. Fără ridicarea asta, cercul ar apărea ciupit pe dreapta.
 *
 * Apropierea (`zoom` + `focus`) e explicată în `lib/website/problem.ts`, acolo
 * unde stau și valorile: pe scurt, pozele sunt portrete întregi, iar într-un cerc
 * de 28px capul trebuie adus în față ca să se distingă cineva.
 *
 * `sizes="28px"` deși poza e de 200: browserul are nevoie de mărimea AFIȘATĂ ca
 * să aleagă densitatea, nu de cea a fișierului. Fără el ar presupune lățimea
 * ferestrei și ar cere cea mai mare variantă degeaba.
 */
function Avatar({ message }: { message: ProblemMessage }) {
  return (
    <span
      className="relative z-[1] h-7 w-7 shrink-0 overflow-hidden rounded-full bg-tint-2"
      title={message.name}
    >
      <Image
        src={message.photo}
        alt={message.name}
        fill
        sizes="28px"
        /*
          `eager`, nu leneș. Bulele pornesc cu rândul strâns la înălțime ZERO, iar
          o poză într-o cutie de zero pixeli nu are cum să intre în raza
          încărcării leneșe: browserul o amână, iar când rândul se deschide,
          cercul e gol o clipă. Sunt patru fișiere de 3KB, deci n-are ce
          încetini — și nu sunt `priority`, ca să nu se bage în fața LCP-ului.

          `unoptimized` fiindcă sunt deja exact la mărimea bună (200px pentru un
          cerc de 28) și fiindcă loader-ul proiectului oricum lasă neatinse
          imaginile locale — trece doar cele de pe R2. Fără el, Next se plânge în
          consolă că loader-ul nu implementează `width`.
        */
        loading="eager"
        unoptimized
        className="object-cover"
        style={{
          transform: `scale(${message.zoom})`,
          transformOrigin: message.focus,
        }}
      />
    </span>
  );
}

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
          key={message.text}
          className="imsg-row"
          style={{ ["--imsg-delay" as string]: `${FIRST + index * GAP}s` }}
        >
          <div className="imsg-clip">
            {/*
              `pt-4` e spațiul dintre bule, mai mare decât în aplicație dinadins:
              pe iPhone mesajele stau strânse fiindcă ecranul e plin de ele, aici
              sunt trei într-un card și trebuie să respire.

              Spațiul din stânga e mic fiindcă cercul îl aduce el pe al lui:
              codița iese din bulă până la -18px, iar `overflow-hidden` de
              deasupra ar tăia-o dacă bula ar sta lipită de margine.

              `items-end`: cercul se aliniază cu FUNDUL bulei, ca pe iPhone, nu cu
              mijlocul ei.
            */}
            <div className="flex items-end gap-2 pl-2.5 pr-3 pt-4">
              <Avatar message={message} />

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
                {message.text}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
