import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { butonVerde } from "@/lib/website/buton";
import { cn } from "@/lib/utils/cn";

/**
 * Banda de final a paginii de start.
 *
 * ═══ CE A FOST ÎNAINTE, ȘI DE CE S-A REFĂCUT ═══
 *
 * Era singura secțiune rămasă pe fundal închis, și călca două reguli spuse
 * explicit de client:
 *
 * 1. **Cuvinte verzi în titlu** („cu ajutorul Edinio" era `text-primary`).
 * 2. **Un rând de trei bife cu iconițe** sub buton — „Fără card de credit",
 *    „Suport 7 zile din 7", „Mentenanță gratuită pe viață".
 *
 * Rândul de bife nu a fost înlocuit cu altceva, ci ȘTERS: toate trei erau deja
 * scrise, cuvânt cu cuvânt, în propoziția de deasupra butonului. Era repetiție
 * pe două straturi, adică exact ce face o pagină să pară făcută în grabă.
 *
 * Textele au rămas ale clientului, neatinse.
 *
 * ═══ HARTA E CONȚINUT, NU TAPET ═══
 *
 * Titlul spune „în toată România", deci harta nu e un ornament pus ca să fie
 * ceva acolo — e chiar afirmația, desenată. Trei lucruri o țin de partea bună a
 * graniței:
 *
 * - **Se văd județele.** O siluetă plină ar fi fost o pată; cu liniile albe
 *   dintre județe se recunoaște dintr-o privire că e România, nu o formă verde.
 * - **Se stinge spre margini.** Un desen care ajunge în marginile ecranului se
 *   citește ca tapet. Masca radială îl lasă tare la mijloc și îl topeșteb spre
 *   margini — aceeași soluție ca la fundalurile din hero.
 * - **Stă sub pragul la care culoarea devine fundal.** Pe alb, verdele peste
 *   ~0,16 nu se mai citește ca lumină, ci ca suprafață colorată. Harta stă la
 *   0,10, iar textul rămâne pe alb curat.
 *
 * Zero JavaScript: e o imagine și două gradiente. Componenta rămâne de server.
 */
export function FinalCta() {
  return (
    <section data-analytics-section="final" className="relative flex min-h-[540px] items-center overflow-hidden bg-white py-24 lg:min-h-[620px] lg:py-32">
      {/*
        Harta, în spate. `aria-hidden`: nu spune nimic în plus față de titlu,
        care zice deja „în toată România".
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-5 sm:p-8"
      >
        {/*
          ⚠ HARTA SE ÎNCADREAZĂ ÎNTREAGĂ, nu se taie.

          Prima formă o punea la `w-full max-w-[1100px]`, adică ~774px înălțime
          într-o secțiune de vreo 600 — iar `overflow-hidden` îi tăia sudul. O
          hartă din care lipsește o bucată nu mai e o hartă, e o pată verde.
          `object-contain` o face să încapă pe amândouă dimensiunile, oricât de
          înaltă ar fi secțiunea, pe orice ecran.

          Tot de aici a plecat și masca radială: stingea capetele — Dobrogea la
          est, Banatul la vest — adică fix marginile care trebuie să se vadă. Cu
          harta încadrată ca obiect întreg, ea nu se mai citește ca tapet, deci
          n-are ce să stingă.
        */}
        {/*
          ⚠ CONTURUL ȚĂRII NU EXISTĂ ÎN FIȘIER.
          `ro.svg` are 42 de trasee, câte unul de județ, cu linii albe între ele.
          Nu există un traseu al graniței, iar unirea celor 42 nu se poate face
          din CSS.

          Se face din SILUETĂ: patru `drop-shadow` fără neclaritate, împinse în
          patru direcții, urmăresc conturul zonei opace a imaginii — adică exact
          granița. Iese o ramă uniformă, care nu depinde de conținutul desenului.

          De ce nu prin scalarea unei copii puse dedesubt: scalarea pleacă din
          centru, deci rama ar fi ieșit subțire la mijloc și groasă la capete.
        */}
        <Image
          src="/ro.svg"
          alt=""
          width={1000}
          height={704}
          /* Loader-ul proiectului lasă neatinse imaginile locale; fără asta Next
             se plânge că nu implementează `width`. */
          unoptimized
          priority={false}
          /*
            ⚠ Opacitatea e RESPONSIVĂ, și nu din capriciu: pe telefon harta are
            ~340px lățime, adică a cincea parte din cât are pe desktop, iar
            aceeași opacitate se citește vizibil mai slab la mărimea aia — la
            0,12 dispărea de tot. Cu cât desenul e mai mic, cu atât are nevoie de
            mai mult ca să spună același lucru.
          */
          className="h-full w-full object-contain opacity-[0.2] sm:opacity-[0.15] lg:opacity-[0.12]"
          style={{
            /*
              ⚠ SUBTILĂ. Verdictul pe prima formă a fost „mult prea colorată":
              interiorul la 0,28 plus o ramă tare plus un halou larg făceau harta
              să concureze cu titlul, care e chiar mesajul.

              Acum culoarea e coborâtă peste tot, dar NU uniform: interiorul se
              stinge cel mai mult, fiindcă pe el stă textul, iar rama rămâne
              singura care se vede clar — cerința era ca marginea să iasă în
              evidență, nu suprafața.
            */
            filter: [
              /* Rama: mai subțire și mult mai stinsă, dar tot fără neclaritate,
                 ca granița să rămână o linie, nu o ceață. */
              "drop-shadow(1.5px 0 0 rgba(18,135,74,0.5))",
              "drop-shadow(-1.5px 0 0 rgba(18,135,74,0.5))",
              "drop-shadow(0 1.5px 0 rgba(18,135,74,0.5))",
              "drop-shadow(0 -1.5px 0 rgba(18,135,74,0.5))",
              /* Lumina care urmărește granița, acum abia simțită: dă senzația de
                 „înconjurată" fără să adauge culoare pe pagină. */
              "drop-shadow(0 0 22px rgba(26,181,84,0.18))",
            ].join(" "),
          }}
        />
      </div>

      {/*
        Lumina verde, largă și slabă. Un halou strâmt și tare e o pată; unul larg
        și slab e lumină — regula clientului, aplicată și în hero.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(26,181,84,0.09), transparent 70%)" }}
      />

      <div className="relative mx-auto w-full max-w-[820px] px-5 text-center sm:px-6 lg:px-8">
        {/*
          Titlul e NEGRU integral. Cuvintele verzi în titluri sunt tăiate peste
          tot pe site — verdele rămâne al butonului.
        */}
        <h2 className="text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px] lg:text-[52px]">
          Ești pregătit să vinzi în toată România cu ajutorul Edinio?
        </h2>

        <p className="mx-auto mt-6 max-w-[620px] text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
          Testează gratuit 15 zile. Fără card de credit, fără obligații. Mentenanță
          gratuită pe viață și suport 7 zile din 7.
        </p>

        <Link
          href="/register"
          prefetch={false}
          data-analytics-cta="final_incepe"
          data-analytics-location="final_cta"
          className={cn("mt-10 halou-cta", butonVerde("lat"))}
        >
          Începe gratuit acum
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
