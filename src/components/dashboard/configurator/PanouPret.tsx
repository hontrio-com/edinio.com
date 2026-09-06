"use client";

import { Info } from "lucide-react";
import type { Continut } from "@/lib/configurators/citeste";
import type { FelBaza } from "@/lib/configurators/pret";
import {
  problemeleDePret, puneBazaPret, punePragPret, puneRotunjire, puneTaxaInitiala,
} from "@/lib/configurators/editare";
import { Camp, INTRARE, IntrareNumar, Probleme } from "./bucati";

/**
 * Fila „Pret": NUMERELE pretuirii.
 *
 * ═══ ⚠ DE UNDE INCEPE PRETUL E PRIMA INTREBARE, NU A TREIA ═══
 *
 * `pret.ts` are opt pasi, si toti se aduna peste pasul intai. Un ecran care ar fi inceput cu
 * limitele si ar fi lasat baza intr-un colt l-ar fi lasat pe comerciant sa creada ca „minim 50
 * lei" e pretul de pornire — cand de fapt baza obisnuita e chiar pretul produsului din catalog,
 * iar minimul se aplica la sfarsit, peste tot ce s-a adunat.
 *
 * ═══ ⚠ AICI NU SE SCRIU FORMULE, SI SE SPUNE PE FATA ═══
 *
 * Formula principala si adaosurile („plus 10% manopera", „x 1,2 la lemn masiv") sunt tot din
 * `Pretuire`, dar cer un constructor de expresii, care e alta lucrare. Ecranul asta NU le atinge
 * si NU le sterge: cand ciorna le poarta, se spune cate sunt si ca se socotesc mai departe.
 * Tacerea ar fi fost mai rea decat lipsa — comerciantul ar fi citit numerele de aici drept tot
 * pretul, si s-ar fi mirat de ce iese altceva in previzualizare.
 */

/**
 * Pasii de rotunjire pe care ii poate alege comerciantul.
 *
 * ⚠ LISTA INCHISA, NU UN CAMP DE SCRIS. Un camp liber trece prin starile de mijloc ale tastarii:
 * cine scrie 0,5 apasa intai „0", iar `citeste.ts` arunca rotunjirea cu pas zero la urmatoarea
 * citire din baza. Pe drumul asta, o rotunjire scrisa pe jumatate dispare fara ca nimeni sa afle.
 */
const PASI = [0.05, 0.1, 0.5, 1, 5, 10];

const BAZE: { fel: FelBaza; eticheta: string; ajutor: string }[] = [
  {
    fel: "produs", eticheta: "Pretul produsului",
    ajutor: "Pretul din catalog (sau al variantei alese), plus ce adauga configuratorul.",
  },
  {
    fel: "fara", eticheta: "Doar cat calculeaza configuratorul",
    ajutor: "Pretul din catalog nu intra deloc in socoteala.",
  },
  {
    fel: "taxa", eticheta: "O taxa de pornire",
    ajutor: "O suma fixa de la care pleaca orice configuratie.",
  },
];

export function PanouPret({ continut, onSchimba }: {
  continut: Continut; onSchimba: (c: Continut) => void;
}) {
  const p = continut.pretuire;
  const probleme = problemeleDePret(p);

  /* ⚠ Pasul din ciorna intra in lista chiar daca nu e unul dintre ai nostri: un sablon poate
     purta 0,25, iar un select care nu-l cuprinde l-ar fi aratat pe primul din lista si l-ar fi
     inlocuit tacut la prima atingere a altui camp. */
  const pasi = p.rotunjire && !PASI.includes(p.rotunjire.pas)
    ? [...PASI, p.rotunjire.pas].sort((a, b) => a - b)
    : PASI;

  const cateAdaosuri = (p.modificatori ?? []).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4">
      {/* ── De unde porneste ───────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-xl border border-border bg-card p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">De unde porneste pretul</legend>
        {BAZE.map((b) => (
          <label key={b.fel} className="flex items-start gap-2.5">
            <input
              type="radio" name="baza-pret" checked={p.baza === b.fel}
              onChange={() => onSchimba(puneBazaPret(continut, b.fel))}
              className="mt-0.5 h-4 w-4 shrink-0 border-border"
            />
            <span>
              <span className="block text-sm text-foreground">{b.eticheta}</span>
              <span className="block text-[11px] text-muted-foreground">{b.ajutor}</span>
            </span>
          </label>
        ))}

        {p.baza === "taxa" && (
          <div className="pl-7 pt-1">
            <Camp eticheta="Taxa de pornire (lei)">
              <IntrareNumar
                valoare={p.taxaInitiala}
                onSchimba={(n) => onSchimba(puneTaxaInitiala(continut, n))}
              />
            </Camp>
          </div>
        )}
      </fieldset>

      {/* ── Limitele ───────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-xl border border-border bg-card p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Limitele pretului</legend>
        <p className="text-[11px] text-muted-foreground">
          Se aplica la sfarsit, peste tot ce s-a adunat. Lasa gol ca sa nu existe limita.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Camp eticheta="Pret minim (lei)">
            <IntrareNumar
              valoare={p.minim}
              onSchimba={(n) => onSchimba(punePragPret(continut, "minim", n))}
            />
          </Camp>
          <Camp eticheta="Pret maxim (lei)">
            <IntrareNumar
              valoare={p.maxim}
              onSchimba={(n) => onSchimba(punePragPret(continut, "maxim", n))}
            />
          </Camp>
        </div>
      </fieldset>

      {/* ── Rotunjirea ─────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-xl border border-border bg-card p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Rotunjirea pretului</legend>
        <p className="text-[11px] text-muted-foreground">
          Hotararea ta comerciala: pretul iesit din calcul se duce la treapta aleasa aici.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Camp eticheta="La cat">
            <select
              value={p.rotunjire ? String(p.rotunjire.pas) : ""}
              onChange={(e) => onSchimba(puneRotunjire(
                continut,
                e.target.value
                  ? { fel: p.rotunjire?.fel ?? "aproape", pas: Number(e.target.value) }
                  : undefined,
              ))}
              className={INTRARE}
            >
              <option value="">Fara rotunjire</option>
              {pasi.map((x) => (
                <option key={x} value={String(x)}>{x} lei</option>
              ))}
            </select>
          </Camp>
          <Camp eticheta="In ce fel">
            <select
              value={p.rotunjire?.fel ?? "aproape"}
              disabled={!p.rotunjire}
              onChange={(e) => onSchimba(puneRotunjire(continut, {
                fel: e.target.value as NonNullable<typeof p.rotunjire>["fel"],
                pas: p.rotunjire?.pas ?? 1,
              }))}
              className={`${INTRARE} disabled:opacity-50`}
            >
              <option value="aproape">La cea mai apropiata treapta</option>
              <option value="insus">Mereu in sus</option>
              <option value="injos">Mereu in jos</option>
            </select>
          </Camp>
        </div>
      </fieldset>

      <Probleme probleme={probleme} />

      {/* ── Ce NU se editeaza aici ─────────────────────────────────────── */}
      {(p.formula || cateAdaosuri > 0) && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Configuratorul mai are {p.formula ? "o formula de pret" : null}
            {p.formula && cateAdaosuri > 0 ? " si " : null}
            {cateAdaosuri > 0 ? `${cateAdaosuri} ${cateAdaosuri === 1 ? "adaos" : "adaosuri"}` : null}
            {" "}
            care se socotesc mai departe. Ecranul asta nu le schimba si nu le sterge; le vezi la
            treaba in Previzualizare.
          </span>
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Peste pretul de aici vin, cu motoarele care exista deja, treptele de cantitate, ofertele,
        cupoanele, TVA-ul si transportul. Configuratorul nu-si scrie propriile reduceri.
      </p>
    </div>
  );
}
