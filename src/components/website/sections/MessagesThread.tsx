"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { PROBLEM_MESSAGES, type ProblemMessage } from "@/lib/website/problem";

/**
 * Firul de mesaje din primul card al secțiunii „Problema".
 *
 * Trei întrebări primite, în bule iMessage, care sosesc una câte una când cardul
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

/**
 * Cele trei chipuri.
 *
 * ═══ DE CE SUNT DESENATE, NU POZE ═══
 *
 * S-au cerut poze de profil. Nu am pus poze de stoc cu oameni adevărați, și nu
 * din lene: o fotografie folosită pe un site comercial, în care persoana pare a
 * fi clientul tău, are nevoie de acord de imagine de la cel fotografiat. Licența
 * de pe Unsplash sau Pexels acoperă folosirea comercială a POZEI, dar nu îți dă
 * și dreptul asupra chipului. E fix cazul în care se ajunge la reclamații.
 *
 * Deci sunt portrete desenate. La 28 de pixeli, un portret din patru forme —
 * fundal, umeri, păr, față — nu se deosebește de o miniatură fotografică; ce se
 * vede la mărimea asta e doar silueta și culorile.
 *
 * Dacă ai poze pe care ai dreptul să le folosești, pui calea în `photo` la
 * mesajul respectiv și desenul dispare singur.
 */
const FACES = [
  { bg: "#E9DCD2", shirt: "#C0736C", skin: "#E9B792", hair: "#3A2A22", long: true },
  { bg: "#D7DFE9", shirt: "#415C7B", skin: "#DBA57B", hair: "#241C17", long: false },
  { bg: "#DCE6DA", shirt: "#7A6A9B", skin: "#F1C49E", hair: "#6B4A2F", long: true },
] as const;

/**
 * Cercul cu chipul expeditorului.
 *
 * `z-index: 1` NU e de ornament. Codița bulei se desenează dintr-o formă albastră
 * și una ALBĂ care mușcă din ea, iar cea albă se întinde cu 18px la stânga bulei,
 * adică fix peste cerc. Fără ridicarea asta, cercul ar apărea ciupit pe dreapta.
 */
function Avatar({ message }: { message: ProblemMessage }) {
  const face = FACES[message.face];

  return (
    <span
      className="relative z-[1] h-7 w-7 shrink-0 overflow-hidden rounded-full"
      title={message.name}
    >
      {message.photo ? (
        <Image src={message.photo} alt={message.name} fill sizes="28px" className="object-cover" />
      ) : (
        <svg viewBox="0 0 40 40" className="h-full w-full" role="img" aria-label={message.name}>
          <rect width="40" height="40" fill={face.bg} />
          {/* Umerii: o elipsă care iese pe jumătate din cadru, ca la orice
              portret tăiat la piept. */}
          <ellipse cx="20" cy="43" rx="15.5" ry="12.5" fill={face.shirt} />
          {/* Părul stă SUB față: din el rămâne vizibilă doar coroana de sus. */}
          <circle cx="20" cy="18.4" r="9.3" fill={face.hair} />
          <circle cx="20" cy="20.4" r="8" fill={face.skin} />
          {/* Șuvițele laterale se desenează PESTE față, altfel n-ar avea ce
              acoperi și părul ar părea tuns la fel la toți trei. */}
          {face.long ? (
            <>
              <ellipse cx="11.6" cy="24.5" rx="2.3" ry="5.4" fill={face.hair} />
              <ellipse cx="28.4" cy="24.5" rx="2.3" ry="5.4" fill={face.hair} />
            </>
          ) : null}
        </svg>
      )}
    </span>
  );
}

/** Cât stă între două mesaje. Sub o jumătate de secundă par trimise deodată. */
const GAP = 0.62;

/** Prima nu pleacă instant: altfel pare că era deja acolo, nu că tocmai a venit. */
const FIRST = 0.18;

export function MessagesThread({
  /**
   * TEMPORAR, cât se compară cele două variante.
   *
   * Cercul cu inițialele expeditorului, ca într-o conversație de GRUP pe iPhone.
   * Într-o conversație în doi, iOS nu îl arată deloc: poza contactului stă doar
   * în antet. Aici are sens, fiindcă sunt trei oameni diferiți care întreabă,
   * nu unul care scrie de trei ori.
   */
  withAvatars = false,
}: {
  withAvatars?: boolean;
}) {
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

              Spațiul din stânga diferă între variante. Fără cerc trebuie 22px,
              fiindcă codița iese din bulă până la -18px și `overflow-hidden` de
              deasupra ar tăia-o. Cu cerc, cercul însuși împinge bula destul, deci
              rămâne un pas mic.

              `items-end`: cercul se aliniază cu FUNDUL bulei, ca pe iPhone, nu cu
              mijlocul ei.
            */}
            <div
              className={`flex items-end pr-3 pt-4 ${
                withAvatars ? "gap-2 pl-2.5" : "pl-[22px]"
              }`}
            >
              {withAvatars ? <Avatar message={message} /> : null}

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
