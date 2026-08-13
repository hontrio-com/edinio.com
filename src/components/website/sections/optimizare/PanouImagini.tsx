import { statSync } from "node:fs";
import { join } from "node:path";
import { ArrowRight, ImageIcon } from "lucide-react";
import { IMAGINE_OPTIMIZATA } from "@/lib/website/optimizare";

/**
 * Ilustrația cardului „Imagini optimizate": aceeași poză de două ori, cu o
 * săgeată între ele și greutatea scrisă sub fiecare.
 *
 * ⚠ ACEEAȘI POZĂ ÎN AMÂNDOUĂ CASETELE, dinadins. Ideea cardului e că imaginea
 * ARATĂ LA FEL după optimizare și doar cântărește altceva. Cu două fișiere
 * diferite, desenul ar fi spus exact pe dos: că a doua e mai mică pentru că e mai
 * proastă.
 *
 * ═══ GREUTATEA A DOUA E CITITĂ, NU SCRISĂ ═══
 *
 * `5 MB` e cifra clientului: cât are o fotografie ieșită direct din telefon.
 * Numărul din dreapta însă e chiar mărimea fișierului pe care îl trimitem, citită
 * de pe disc la construirea paginii.
 *
 * Nu e o eleganță: panoul se citește ca dovadă, iar o dovadă scrisă de mână
 * rămâne în urmă la prima reîncărcare a pozei. Așa, dacă cineva pune un fișier de
 * 400KB, scrie 400KB — și se vede că nu mai e un exemplu bun.
 *
 * Componentă de SERVER, deci `node:fs` e la îndemână, iar pagina e statică: se
 * citește o dată, la construire, nu la fiecare cerere.
 */

/** `78 KB`, `1,2 MB`. Fără zecimale sub un mega — nimeni nu spune „78,4 KB". */
function greutate(octeti: number): string {
  if (octeti >= 1024 * 1024) {
    return `${(octeti / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.round(octeti / 1024)} KB`;
}

/**
 * Cât are fișierul, sau `null` dacă lipsește.
 *
 * ⚠ Nu aruncă. Un fișier care nu există încă nu are voie să doboare construirea
 * întregului site — până vine poza se vede substituentul, iar cardul rămâne
 * onest: nu scrie nicio cifră pe care n-o poate susține.
 */
function marimeaFisierului(cale: string): number | null {
  try {
    return statSync(join(process.cwd(), "public", cale.replace(/^\//, ""))).size;
  } catch {
    return null;
  }
}

export function PanouImagini() {
  const octeti = marimeaFisierului(IMAGINE_OPTIMIZATA.src);
  const dupa = octeti === null ? IMAGINE_OPTIMIZATA.dupaDeRezerva : greutate(octeti);

  return (
    /*
      Umple ilustrația 4:3 a cardului, ca și panoul de scoruri. `@container`:
      casetele se măsoară în procente din lățimea panoului — vezi nota de la
      lățimea lor.
    */
    <div className="@container absolute inset-0 flex items-center justify-center px-4 py-4 sm:px-5">
      <div className="flex w-full items-start justify-center gap-3">
        <Caseta greutate={IMAGINE_OPTIMIZATA.inainte} lipsa={octeti === null} />

        {/*
          Săgeata stă la mijlocul CASETELOR, nu al blocului: sub ele mai e un rând
          cu greutatea, iar centrată pe tot, săgeata ar fi coborât sub poze.
          `mt-[19cqw]` e jumătate din înălțimea casetei, în aceeași unitate ca ea.
        */}
        <ArrowRight
          className="mt-[19cqw] h-4 w-4 shrink-0 text-ink-3"
          strokeWidth={2}
          aria-hidden
        />

        <Caseta greutate={dupa} lipsa={octeti === null} />
      </div>
    </div>
  );
}

/**
 * O casetă: poza, și greutatea sub ea.
 *
 * ⚠ LĂȚIMEA E LEGATĂ DE LĂȚIMEA PANOULUI, nu de treptele de ecran — aceeași
 * lecție ca la cadranele de scoruri, unde numere fixe pe trepte ieșeau din card
 * la trei lățimi din nouăsprezece. Aici locul e strâns de ALĂTURI, nu de sus:
 * două casete plus săgeata plus spațiile trebuie să încapă în lățimea panoului,
 * deci `(panou − 48) / 2`, adică `50cqw − 24px`. Plafonul de 118 e cât ține
 * desenul înainte să pară două fotografii lipite.
 */
function Caseta({ greutate: text, lipsa }: { greutate: string; lipsa: boolean }) {
  return (
    <div className="w-[calc(50cqw-24px)] max-w-[118px] min-w-[64px]">
      <div className="aspect-square overflow-hidden rounded-[10px] border border-hairline bg-white">
        {lipsa ? (
          /* Același substituent ca la „Problema" și la secțiunea de funcții, ca
             cele trei să nu arate ca trei site-uri cât timp așteptăm fișierul. */
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center">
            <ImageIcon className="h-5 w-5 text-ink-3" strokeWidth={1.5} />
            <span className="text-[10px] leading-[1.25] text-ink-3">
              {IMAGINE_OPTIMIZATA.hint}
            </span>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={IMAGINE_OPTIMIZATA.src}
            alt={IMAGINE_OPTIMIZATA.alt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <p className="mt-2 text-center text-[12px] font-medium tabular-nums text-ink-2">
        {text}
      </p>
    </div>
  );
}
