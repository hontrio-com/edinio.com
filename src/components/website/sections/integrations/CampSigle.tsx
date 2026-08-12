import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import {
  SIGLE_PLUTITOARE,
  etichetaCampului,
  type SiglaPlutitoare,
} from "@/lib/website/integrari-hero";
import { CasetaSigla } from "./CasetaSigla";
import { FerireDeCursor } from "./FerireDeCursor";

/**
 * Siglele care plutesc în jurul textului, în hero-ul paginii „Integrări".
 *
 * Componentă de SERVER: casetele pleacă gata desenate în HTML, iar bucata de
 * JavaScript (`FerireDeCursor`) doar le primește ca `children` și le ascultă
 * mouse-ul. Așa hero-ul se vede întreg din primul HTML, nu după ce se încarcă
 * ceva, iar plutirea merge și fără JavaScript — e animație CSS.
 *
 * ═══ UNDE STAU NUMERELE ═══
 *
 * Nicăieri aici. Pozițiile, mărimile și traseele sunt în
 * `lib/website/integrari-hero.ts`, verificate cu o probă geometrică la lățimi de
 * la 320 la 2560px: nicio siglă peste text, peste bara de sus, peste altă siglă
 * sau ieșită din ecran. Fișierul ăsta doar le traduce în variabile CSS.
 *
 * Motivul pentru care sunt DATE și nu clase Tailwind: o poziție scrisă în clase
 * nu se poate verifica decât uitându-te la ea, pe fiecare lățime, cu ochiul.
 */

/**
 * Numerele unei sigle, ca variabile CSS.
 *
 * Se scriu amândouă așezările — cea îngustă și cea largă — iar CSS-ul alege între
 * ele cu un `@media`. Nu se poate face invers (o singură așezare, calculată la
 * randare), fiindcă serverul nu știe cât e de lat ecranul: ar fi însemnat ori un
 * salt după hidratare, ori o pagină diferită de la un vizitator la altul.
 *
 * Siglele care apar abia pe ecran lat n-au deloc numere înguste. Variabila lipsă
 * cade pe rezerva din CSS (`auto`), dar oricum nu contează: acolo caseta e
 * `display: none`.
 */
function variabile(sigla: SiglaPlutitoare): CSSProperties {
  const v: Record<string, string> = {
    "--cale": `pluta-${sigla.cale}`,
    "--durata": `${sigla.durata}s`,
    "--decalaj": `${sigla.decalaj}s`,
    "--x-lg": `${sigla.lat.x}%`,
  };

  if (sigla.lat.zona === "jos") v["--jos-lg"] = `${sigla.lat.y}px`;
  else if (sigla.lat.zona === "mijloc") v["--mij"] = `${sigla.lat.y}px`;
  else v["--sus-lg"] = `${sigla.lat.y}px`;

  if (sigla.ingust) {
    v["--x"] = `${sigla.ingust.x}%`;
    if (sigla.ingust.zona === "jos") v["--jos"] = `${sigla.ingust.y}px`;
    else v["--sus"] = `${sigla.ingust.y}px`;
  }

  return v as CSSProperties;
}

export function CampSigle() {
  return (
    <FerireDeCursor eticheta={etichetaCampului()}>
      {SIGLE_PLUTITOARE.map((sigla) => (
        <div
          key={sigla.cheie}
          /* Semnul după care își găsește `FerireDeCursor` casetele. */
          data-pluta
          className={cn(
            "pluta",
            sigla.lat.zona === "mijloc" && "pluta-mijloc",
            sigla.deLa === "lg" && "pluta-de-la-lg",
            sigla.deLa === "xl" && "pluta-de-la-xl",
          )}
          style={variabile(sigla)}
        >
          {/*
            Învelișul care plutește. Separat de `.pluta` fiindcă acolo scrie
            ferirea de cursor, iar două animații nu pot împărți `transform`.
          */}
          <div className="pluta-leagan">
            <CasetaSigla
              cheie={sigla.cheie}
              /*
                Colț mai moale decât în banda de pe pagina de start (16px la
                aceeași mărime), ca în referința aleasă de client. Umbra rămâne
                exact aceeași: ea spune de unde vine lumina, iar două obiecte
                albe de pe același site luminate din direcții diferite e chiar
                ce le face să pară desenate, nu așezate.
              */
              className="h-full w-full rounded-[20px] lg:rounded-[24px]"
              /*
                Cele opt care se văd pe telefon sunt chiar primul ecran, deci se
                cer imediat. Restul rămân leneșe: pe telefon sunt `display: none`
                și atunci nu se descarcă deloc.
              */
              prioritara={sigla.deLa === undefined}
            />
          </div>
        </div>
      ))}
    </FerireDeCursor>
  );
}
