"use client";

import { trepteleePalniei } from "@/lib/abandoned/starea-cosului";
import type { PalnieRecuperare } from "@/lib/abandoned-cart";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PALNIA RECUPERARII
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ NU E PALNIA MAGAZINULUI. Aia (vizitatori → cos → comanda) sta la Statistici
  si se sprijina pe urmele de trafic. Asta incepe de unde incepe pagina: de la
  cosurile SALVATE, adica de la oamenii care si-au lasat datele de contact.
  Amestecate, ar fi parut ca pagina stie cati vizitatori are magazinul.

  ⚠ „AU RAMAS NETERMINATE" NU E „ABANDONATE ACUM". Un cos parasit joi si
  finalizat luni a fost neterminat, desi azi e o comanda. Prima scriere a
  palniei numara toate conversiile drept abandonate si iesea „28 → 28": doua
  trepte egale, care nu spun nimic.
*/

const TREPTE: { cheie: keyof PalnieRecuperare; nume: string; explicatie: string }[] = [
  {
    cheie: "salvate", nume: "Coșuri salvate",
    explicatie: "Clienți care au început finalizarea și și-au lăsat datele de contact.",
  },
  {
    cheie: "neterminate", nume: "Au rămas neterminate",
    explicatie: "Coșuri pe care nimeni nu le-a mai atins o oră. Intră și cele finalizate mai târziu.",
  },
  {
    cheie: "contactate", nume: "Contactate",
    explicatie: "Au primit cel puțin un mesaj de recuperare, manual sau automat.",
  },
  {
    cheie: "deschise", nume: "Au deschis linkul",
    explicatie: "Au apăsat linkul din mesaj. Singurul pas pe care îl putem dovedi.",
  },
  {
    cheie: "recuperate", nume: "Au comandat după",
    explicatie: "Au finalizat în cel mult 7 zile de la deschiderea linkului.",
  },
];

export function PalniaRecuperarii({ palnie }: { palnie: PalnieRecuperare }) {
  /*
    ⚠ SOCOTEALA E SCOASA DIN RANDARE (`trepteleePalniei`), ca sa se poata proba.
    Una scrisa aici se poate masura numai cu ochiul - si tocmai procentele se
    citesc gresit: fata de prima treapta in loc de cea dinainte.
  */
  return (
    <ol className="space-y-2">
      {trepteleePalniei(palnie).map((treapta, i) => {
        const t = TREPTE[i];
        const { numar: n, dinPasulAnterior: cadere, latime } = treapta;
        return (
          <li key={t.cheie} title={t.explicatie}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-foreground">{t.nume}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{n}</span>
                {cadere !== null && <span> · {cadere}% din pasul anterior</span>}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${i === TREPTE.length - 1 ? "bg-success" : "bg-primary/70"}`}
                style={{ width: `${latime}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
