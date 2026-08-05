import Image from "next/image";
import { AlertTriangle, ImageIcon } from "lucide-react";
import { PROBLEM_CARDS, PROBLEM_LEAD, PROBLEM_TITLE, type ProblemCard } from "@/lib/website/problem";
import { MessagesThread } from "./MessagesThread";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * Secțiunea „Problema": trei carduri simple, fiecare cu o imagine și două rânduri
 * de text.
 *
 * ═══ CAPUL SECȚIUNII E COPIAT DIN „SOLUȚIA" ═══
 *
 * Cerut explicit de client: eticheta, titlul și descrierea trebuie să fie „exact
 * același stil" ca la secțiunea de funcții de dedesubt. Nu e o preferință de
 * moment — cele două etichete sunt o PERECHE („Problema" roșie, „Soluția" verde),
 * iar numai fiindcă arată identic se citește că a doua răspunde la prima. Dacă
 * unul dintre capete se retușează singur, perechea se rupe.
 *
 * Deci: același `SectionEyebrow` centrat, aceeași coloană de 720px, aceleași
 * mărimi de titlu (32/44px) și de text (16/18px), aceleași distanțe (`mt-6`,
 * `mt-5`). Când se schimbă unul, se schimbă amândouă.
 *
 * ═══ CE A FOST ÎNAINTE ═══
 *
 * Secțiunea a pierdut trei desene la rând: un nor de pastile roșii care pluteau,
 * trei capturi „1 la 1 cu realitatea" (WhatsApp, Excel, pagină fără CSS) și
 * carduri cu perdea de lumină și panouri înclinate. Toate în istoric. Verdictul
 * pe ultima a fost „par super vibe coded", iar cererea a fost limpede: carduri
 * SIMPLE, cu imagini adevărate în loc de desene.
 *
 * De aici regula pentru orice retușare viitoare: dacă îți vine să adaugi un efect
 * în cardurile astea, nu o face. Poza duce mesajul, cardul doar o ține.
 */

export function Problem() {
  return (
    /*
     * Fără spațiu jos: secțiunea de funcții vine imediat și își aduce propriul
     * `pt-20 lg:pt-28`. Puse amândouă, s-ar aduna și ar rămâne o gaură în
     * mijlocul paginii.
     */
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 pt-20 sm:px-6 lg:px-8 lg:pt-28">
        <div className="mx-auto max-w-[720px] text-center">
          <SectionEyebrow tone="alarm" icon={AlertTriangle} label="Problema" />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {PROBLEM_TITLE.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>

          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {PROBLEM_LEAD}
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3 lg:mt-20 lg:gap-7">
          {PROBLEM_CARDS.map((card) => (
            <Card key={card.id} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Un card: imaginea sus, titlul și explicația dedesubt.
 *
 * Colțurile sunt 16px afară și 11px înăuntru, cu 5px între ele. Ca două colțuri
 * concentrice să pară paralele, raza interioară trebuie să fie cea exterioară
 * minus distanța dintre ele; cu aceeași rază în amândouă părțile, cel din
 * interior arată prea rotund.
 */
function Card({ card }: { card: ProblemCard }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[16px] border border-hairline bg-white">
      <div className="p-[5px]">
        {/*
          Cardul cu firul de mesaje stă pe ALB, nu pe `tint`: codița bulei se
          desenează dintr-o formă gri și una de culoarea fundalului, iar culoarea
          aia e scrisă în `globals.css`. Pe alt fundal ar apărea o pată albă lângă
          fiecare codiță.
        */}
        <div
          className={`relative aspect-[4/3] overflow-hidden rounded-[11px] ${
            card.art === "messages" ? "bg-white" : "bg-tint"
          }`}
        >
          {card.art === "messages" ? (
            <MessagesThread />
          ) : card.image?.src ? (
            <Image
              src={card.image.src}
              alt={card.image.alt}
              fill
              /*
               * Masurat, nu ghicit. Latimea unui card, pe latimi de ecran:
               *   360 -> 320   767 -> 727 (maximul, inca pe o coloana)
               *   768 -> 229   1280 si peste -> 363 (oprit de max-w-[1200px])
               * Cel mai mare NU e pe desktop, ci chiar sub pragul `md`, unde
               * cardurile sunt inca unul sub altul si tin toata latimea.
               */
              sizes="(min-width: 1280px) 363px, (min-width: 768px) 30vw, 92vw"
              className="object-cover"
            />
          ) : (
            <Placeholder hint={card.image?.hint ?? ""} />
          )}
        </div>
      </div>

      <div className="px-5 pb-6 pt-4 sm:pb-7 sm:pt-5">
        <h3 className="text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink sm:text-[18px]">
          {card.title}
        </h3>
        <p className="mt-2 text-[14px] leading-[1.55] text-ink-2 sm:text-[14.5px]">
          {card.description}
        </p>
      </div>
    </article>
  );
}

/**
 * Cât lipsește poza, caseta scrie ce trebuie să conțină și în ce format.
 *
 * Același desen ca substituentul din secțiunea de funcții, ca cele două secțiuni
 * să nu arate ca două site-uri diferite cât timp așteptăm fișierele.
 */
function Placeholder({ hint }: { hint: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
      <ImageIcon className="h-6 w-6 text-ink-3" strokeWidth={1.5} />
      <span className="text-[13px] font-medium text-ink-2">{hint}</span>
      <span className="text-[11px] text-ink-3">4:3 orizontal</span>
    </div>
  );
}
