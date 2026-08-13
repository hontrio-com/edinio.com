"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CAUTARE, REZULTATE_SHOPPING } from "@/lib/website/seo";

/**
 * Ilustrația primului card SEO: o căutare pe Google, cu produsele magazinului
 * printre rezultate.
 *
 * ═══ DOUĂ DESENE COPIATE, CERUT „1 LA 1" ═══
 *
 * 1. **Bara de căutare a Google**: pastilă albă cu chenar subțire, lupă cenușie
 *    în stânga, iar în dreapta microfonul și Lens, în cele patru culori ale lor.
 *    Chenarul se îngroașă și capătă umbră la focus — aici e desenată în starea
 *    „scrii în ea", fiindcă tocmai asta se întâmplă.
 * 2. **Caruselul de cumpărături**: un ȘIR de tigle, nu o grilă — toate patru pe
 *    un rând, cu săgeata de „mai departe" pe muchia din dreapta. Tigla are poza
 *    pe fond alb, potrivită întreagă, apoi numele pe două rânduri, prețul gros și
 *    vânzătorul.
 *
 * ═══ SCRISUL ═══
 *
 * Textul se scrie literă cu literă când panoul intră în ecran, o singură dată,
 * iar rezultatele apar după ce s-a terminat. Ordinea aia e tot rostul desenului:
 * întâi cauți, apoi găsești.
 *
 * ⚠ Bara pleacă GOALĂ din HTML, deci ce trimite serverul nu conține căutarea.
 * De aceea e scrisă o dată ca text, în `sr-only`: aia se aude și aia se
 * indexează. Fără rândul acela, tot ce pleca de pe server era o bară goală.
 *
 * Cu `prefers-reduced-motion` nu se scrie nimic: textul și rezultatele se văd
 * de la început, întregi.
 */

/** Cât stă între două litere. La 22 de semne iese cam o secundă și jumătate. */
const PAS_LITERA = 62;
/** Cât așteaptă rezultatele după ce s-a terminat de scris. */
const PAUZA = 260;

export function PanouCautareGoogle() {
  const gazda = useRef<HTMLDivElement>(null);
  /* Pornește goală, cu rezultatele ascunse: desenul are sens doar în ordinea
     „întâi cauți, apoi găsești". */
  const [scris, setScris] = useState("");
  const [cuRezultate, setCuRezultate] = useState(false);

  useEffect(() => {
    const el = gazda.current;
    if (!el) return;

    const fara =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ceasuri: ReturnType<typeof setTimeout>[] = [];

    const scrie = () => {
      for (let i = 1; i <= CAUTARE.length; i++) {
        ceasuri.push(setTimeout(() => setScris(CAUTARE.slice(0, i)), i * PAS_LITERA));
      }
      ceasuri.push(
        setTimeout(() => setCuRezultate(true), CAUTARE.length * PAS_LITERA + PAUZA),
      );
    };

    if (fara || typeof IntersectionObserver !== "function") {
      /* Nu prin `setScris` direct în efect — `react-hooks/set-state-in-effect`.
         Un `setTimeout(0)` e tot o singură randare în plus, dar în afara lui. */
      ceasuri.push(
        setTimeout(() => {
          setScris(CAUTARE);
          setCuRezultate(true);
        }, 0),
      );
      return () => ceasuri.forEach(clearTimeout);
    }

    const observator = new IntersectionObserver(
      (intrari) => {
        if (!intrari.some((i) => i.isIntersecting)) return;
        /* O singură dată: o căutare care o ia de la capăt de fiecare dată când
           derulezi înapoi e decor, nu informație. */
        observator.disconnect();
        scrie();
      },
      { threshold: 0.35 },
    );
    observator.observe(el);

    return () => {
      observator.disconnect();
      ceasuri.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={gazda} className="@container">
      {/*
        Căutarea și rezultatele ca text, o dată, pentru cine ascultă pagina și
        pentru cine o indexează. Bara pleacă goală din HTML, iar literele apar
        abia în browser.
      */}
      <p className="sr-only">
        Căutare pe Google pentru „{CAUTARE}&rdquo;, cu produse din magazin printre
        rezultate:{" "}
        {REZULTATE_SHOPPING.map((r) => `${r.nume}, ${r.pret}`).join("; ")}.
      </p>

      <div aria-hidden="true">
        <BaraGoogle text={scris} scrie={scris.length < CAUTARE.length} />

        {/*
          Caruselul. ⚠ TOATE PATRU PE UN RÂND, cerut de client: așa arată
          caruselul de cumpărături pe Google, un șir care se trage lateral — nu o
          grilă. Prima formă le pusese două pe două, ceea ce e desenul din fila
          „Cumpărături", nu al caruselului din rezultate.

          Apar după ce s-a terminat de scris, pe rând, cu un decalaj mic: așa se
          citește ca un șir care se încarcă, nu ca un bloc care clipește.
        */}
        <div className="relative mt-[4cqw]">
          {/*
            ⚠ ȘIR TĂIAT, nu grilă de patru — și asta e chiar ce face un carusel.

            Cu o grilă de patru coloane, pe un card îngust tiglele se strâng
            oricât: măsurat, la 320px ajungeau la 55px lățime, cu titlul de 5,5px,
            adică nimic de citit. Aici fiecare tiglă are un MINIM de 104px și
            crește doar dacă e loc; când nu e, șirul iese în afară și e tăiat de
            `overflow-hidden`. Se văd două tigle și jumătate, ca pe telefon la ei
            — iar săgeata din dreapta spune ce urmează.
          */}
          <div className="flex gap-[2cqw] overflow-hidden">
            {REZULTATE_SHOPPING.map((r, i) => (
              <TiglaShopping
                key={r.imagine}
                rezultat={r}
                aratat={cuRezultate}
                intarziere={i * 80}
              />
            ))}
          </div>

          {/*
            Săgeata de „mai departe", pe muchia din dreapta. E semnul după care se
            recunoaște caruselul: fără ea, patru carduri într-un rând ar putea fi
            orice grilă. Stă PESTE ultimul card, pe jumătate în afară, exact ca la
            ei.
          */}
          <span
            className="absolute right-[-2.5cqw] top-1/2 flex h-[7cqw] w-[7cqw] -translate-y-1/2 items-center justify-center rounded-full border border-[#dadce0] bg-white shadow-[0_1px_3px_rgba(60,64,67,0.28)]"
            style={{ opacity: cuRezultate ? 1 : 0, transition: "opacity 400ms 420ms" }}
          >
            <svg viewBox="0 0 24 24" className="h-[4cqw] w-[4cqw] fill-[#5f6368]">
              <path d="M9.4 18 8 16.6l4.6-4.6L8 7.4 9.4 6l6 6z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Bara de căutare de pe google.com.
 *
 * Pastilă cu chenar subțire, lupă cenușie în stânga, microfon și Lens în dreapta.
 * Nu are butoanele „Căutare Google" de dedesubt: aici bara e în starea în care
 * scrii în ea, iar acelea dispar oricum de îndată ce apar sugestiile.
 */
function BaraGoogle({ text, scrie }: { text: string; scrie: boolean }) {
  return (
    <div className="flex items-center gap-[3cqw] rounded-full border border-[#dfe1e5] bg-white px-[4cqw] py-[2.6cqw] shadow-[0_1px_6px_rgba(32,33,36,0.28)]">
      {/* Lupa. Cenușie, nu colorată: la Google e #9aa0a6. */}
      <svg viewBox="0 0 24 24" className="h-[4.4cqw] w-[4.4cqw] shrink-0 fill-[#9aa0a6]">
        <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14" />
      </svg>

      <span className="min-w-0 flex-1 truncate text-[4.2cqw] leading-[1.5] text-[#202124]">
        {text}
        {/* Cursorul, cât se scrie. Dispare la sfârșit — unul care clipește la
            nesfârșit ar fi mișcare care nu răspunde la nimic. */}
        {scrie ? (
          <span className="ml-[0.4cqw] inline-block h-[4.4cqw] w-[0.35cqw] translate-y-[0.7cqw] bg-[#202124]" />
        ) : null}
      </span>

      {/* Microfonul, în cele patru culori. */}
      <svg viewBox="0 0 24 24" className="h-[4.4cqw] w-[4.4cqw] shrink-0">
        <path fill="#4285f4" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3" />
        <path fill="#34a853" d="M11 18.92V22h2v-3.08A7 7 0 0 0 19 12h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92" />
        <path fill="#fbbc05" d="M12 3a3 3 0 0 1 3 3v3H9V6a3 3 0 0 1 3-3" />
        <path fill="#ea4335" d="M9 9h6v1.5H9z" />
      </svg>

      {/* Lens: cerc cu un punct, tot în cele patru culori. */}
      <svg viewBox="0 0 24 24" className="h-[4.4cqw] w-[4.4cqw] shrink-0">
        <circle cx="12" cy="12" r="3.2" fill="#4285f4" />
        <path fill="#ea4335" d="M12 3.2a8.8 8.8 0 0 0-7.6 4.4l3.5 2a4.8 4.8 0 0 1 4.1-2.4z" />
        <path fill="#fbbc05" d="M4.4 7.6a8.8 8.8 0 0 0 0 8.8l3.5-2a4.8 4.8 0 0 1 0-4.8z" />
        <path fill="#34a853" d="M7.9 18.4a8.8 8.8 0 0 0 7.6 2l-1.2-3.9a4.8 4.8 0 0 1-3-.1z" />
      </svg>
    </div>
  );
}

/**
 * O tiglă din caruselul de cumpărături, desenată după captura trimisă de client.
 *
 * ⚠ ORDINEA ȘI CULORILE SUNT ALE LOR, punct cu punct, din reper:
 *
 *   poză pe alb, întreagă (`object-contain`, nu tăiată)
 *   ─────────  o linie subțire, cât toată lățimea
 *   numele, ALBASTRU de legătură (#1a0dab), pe trei rânduri, tăiat cu „…"
 *   prețul, NEGRU ȘI GROS — singurul lucru gros din tiglă
 *   vânzătorul, negru obișnuit
 *   livrarea, cenușiu, cu semnul de camion
 *   „De la Google", tot albastru
 *
 * Numele ALBASTRU e ce deosebește un rezultat Google de un card de magazin: în
 * magazin numele e negru, fiindcă ești deja acolo; în rezultate e o legătură.
 * Iar prețul e singurul gros — la Shopping te uiți la un raft și compari prețuri.
 *
 * ⚠ FIECARE TIGLĂ E PROPRIUL EI CONTAINER, iar textul se măsoară în procente din
 * lățimea ei. Dar `@container` NU se aplică propriului element: `p-[6cqw]` pus
 * chiar pe tiglă s-ar raporta la containerul de DEASUPRA. Măsurat, exact asta s-a
 * întâmplat — padding de 29px într-o tiglă de 114, care strângea cutia de
 * conținut la 55px, iar textul, socotit din ea, ieșea de 4,8px. De aceea
 * spațierea stă pe un înveliș dinăuntru.
 */
function TiglaShopping({
  rezultat,
  aratat,
  intarziere,
}: {
  rezultat: (typeof REZULTATE_SHOPPING)[number];
  aratat: boolean;
  intarziere: number;
}) {
  return (
    <div
      /* `basis-0 grow` împarte locul în părți egale când încape, `min-w` ține
         tigla citibilă când nu, iar `shrink-0` o oprește să se strângă sub el.

         ⚠ FĂRĂ COLȚURI ROTUNJITE — cerut de client (13.08). Restul site-ului
         rotunjește tot, deci e de așteptat ca cineva să „repare" asta cândva;
         aici e dinadins. */
      className="@container min-w-[104px] shrink-0 grow basis-0 overflow-hidden border border-[#dadce0] bg-white transition-[opacity,transform] duration-500 ease-out"
      style={{
        opacity: aratat ? 1 : 0,
        transform: aratat ? "none" : "translateY(8px)",
        transitionDelay: `${intarziere}ms`,
      }}
    >
      <div className="p-[6cqw]">
        <div className="relative aspect-square w-full">
          <Image
            src={rezultat.imagine}
            alt=""
            fill
            sizes="140px"
            unoptimized
            className="object-contain"
          />
        </div>
      </div>

      {/* Linia de sub poză, cât toată lățimea tiglei — ca la ei. */}
      <span className="block h-px w-full bg-[#e8eaed]" />

      <div className="px-[6cqw] pb-[6cqw] pt-[5cqw]">
        {/*
          ⚠ ÎNĂLȚIME FIXĂ DE TREI RÂNDURI, chiar când numele are doar două.

          În reper toate tiglele au prețul pe aceeași linie, fiindcă toate numele
          umplu trei rânduri. Fără minimul ăsta, un nume scurt urcă prețul cu un
          rând, iar șirul iese cu prețurile în zigzag — primul lucru care spune că
          nu e caruselul lor.

          3 rânduri x 1,3 interlinie x 10cqw corp = 39cqw.
        */}
        <p className="line-clamp-3 min-h-[39cqw] text-[10cqw] leading-[1.3] text-[#1a0dab]">
          {rezultat.nume}
        </p>
        <p className="mt-[4cqw] text-[10.5cqw] font-bold leading-none text-[#202124]">
          {rezultat.pret}
        </p>
        <p className="mt-[3.5cqw] truncate text-[9cqw] leading-none text-[#202124]">
          {rezultat.vanzator}
        </p>

        <p className="mt-[3.5cqw] flex items-center gap-[2cqw] text-[8.5cqw] leading-none text-[#5f6368]">
          {/* Camionul, ca la ei — desenat, nu o iconiță din bibliotecă: la 9px o
              pictogramă cu multe linii iese o pată. */}
          <svg viewBox="0 0 24 24" className="h-[9cqw] w-[9cqw] shrink-0 fill-[#5f6368]">
            <path d="M19 7h-3V4H3a1 1 0 0 0-1 1v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5zM7 17.5A1.5 1.5 0 1 1 8.5 16 1.5 1.5 0 0 1 7 17.5m12 0A1.5 1.5 0 1 1 20.5 16a1.5 1.5 0 0 1-1.5 1.5m1.5-6.5H16V8.5h2.5z" />
          </svg>
          <span className="truncate">{rezultat.livrare}</span>
        </p>

        <p className="mt-[3.5cqw] truncate text-[8.5cqw] leading-none text-[#1a0dab]">
          De la Google
        </p>
      </div>
    </div>
  );
}
