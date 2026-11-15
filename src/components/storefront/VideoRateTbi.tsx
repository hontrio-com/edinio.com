"use client";

import { useEffect, useRef } from "react";
import { CardTbi, LogoTbi } from "@/components/storefront/CardTbi";

/**
 * Clipul bannerului: motion design generat cu ElevenLabs (Seedance 2.5, din cadrul de start Seedream 5
 * Pro): produse de zi cu zi cad intr-un cos de cumparaturi negru, pe portocaliul tbi. Fara sonor, fara
 * text si fara sigle in imagine: modelele video deformeaza literele si siglele, asa ca sigla OFICIALA
 * si textul stau langa clip, in pagina. Provenienta si comenzile ffmpeg: `docs/plati/TBI.md`.
 */
export const VIDEO_RATE_TBI = {
  mp4: "/plati/tbi/cumparaturi-tbi.mp4",
  afis: "/plati/tbi/cumparaturi-tbi.jpg",
} as const;

/**
 * Forma `video` a mesajului tbi de pe pagina produsului: acelasi card ca bannerul (`CardTbi`), cu sigla
 * tbi MARE si textul in stanga, iar clipul in dreapta, intr-o fereastra rotunjita.
 *
 * Inlocuieste prima varianta (15.11), respinsa de proprietar: sfere fara inteles si sigla mica, puse
 * peste clip. Acum clipul arata chiar cumparaturile, iar sigla sta pe alb, la vedere.
 *
 * ⚠ Clipul nu se descarca odata cu pagina (`preload="none"`): porneste numai cand bannerul ajunge in
 * ecran si se opreste cand iese, iar pana atunci se vede afisul (primul cadru). Cu „miscare redusa"
 * ceruta de sistem nu porneste deloc. Pe pagina produsului conteaza fiecare kilobyte.
 * Fara cifre de credit (vezi `FORME_BANNER_TBI`). Fara diacritice: e text de vitrina.
 */
export function VideoRateTbi() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const clip = ref.current;
    if (!clip || typeof IntersectionObserver === "undefined") return;
    const miscareRedusa = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inEcran = false;
    const potriveste = () => {
      if (inEcran && !miscareRedusa.matches) {
        clip.muted = true;
        /* Economia de energie sau politica de redare a browserului pot refuza: ramane afisul. */
        clip.play().catch(() => {});
      } else {
        clip.pause();
      }
    };
    const observator = new IntersectionObserver(([intrare]) => {
      inEcran = !!intrare?.isIntersecting;
      potriveste();
    }, { threshold: 0.3 });
    observator.observe(clip);
    miscareRedusa.addEventListener("change", potriveste);
    return () => {
      observator.disconnect();
      miscareRedusa.removeEventListener("change", potriveste);
      clip.pause();
    };
  }, []);

  return (
    <CardTbi>
      <div className="flex">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 p-4">
          <LogoTbi className="self-start" />
          <div>
            <p className="text-balance text-[15px] font-semibold leading-snug text-neutral-900 sm:text-base">Cumpara acum, plateste in rate</p>
            <p className="mt-1 text-[12.5px] leading-snug text-neutral-500">Alegi tbi bank la finalizarea comenzii si completezi cererea online.</p>
          </div>
        </div>
        <div className="relative m-1.5 min-h-[140px] w-[44%] shrink-0 self-stretch overflow-hidden rounded-[12px] bg-[#FF6600]">
          <video
            ref={ref}
            src={VIDEO_RATE_TBI.mp4}
            poster={VIDEO_RATE_TBI.afis}
            muted
            loop
            playsInline
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </div>
    </CardTbi>
  );
}
