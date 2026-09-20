"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { numeCanal } from "@/lib/vanzari";
import { PERIOADE_STATISTICI, type FelPerioadaStatistici } from "@/lib/statistici";

/*
  Filtrele comune ale paginii Statistici: perioada, canalul de vanzare si
  comparatia. Ele hotarasc TOATE cifrele si graficele de dedesubt.

  ⚠ Pana acum erau trei butoane (7 / 30 / 90 de zile) care nu atingeau nici
  harta, nici partea de jos a paginii - deci pagina parea sa raspunda la filtru
  fara sa raspunda.
*/

export function StatisticiFiltre({
  perioada, setPerioada,
  deLa, panaLa, setCapete,
  canal, setCanal, canale,
  comparatie, setComparatie,
}: {
  perioada: FelPerioadaStatistici;
  setPerioada: (f: FelPerioadaStatistici) => void;
  deLa: string;
  panaLa: string;
  setCapete: (care: "deLa" | "panaLa", v: string) => void;
  canal: string;
  setCanal: (c: string) => void;
  canale: { canal: string; comenzi: number }[];
  comparatie: boolean;
  setComparatie: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Alegere
          numeAccesibil="Perioada"
          valoare={perioada}
          schimba={(v) => setPerioada(v as FelPerioadaStatistici)}
          optiuni={PERIOADE_STATISTICI.map((p) => ({ valoare: p.fel, eticheta: p.eticheta }))}
        />

        {/* Canalul apare doar daca magazinul chiar vinde din mai multe locuri. */}
        {canale.length > 1 && (
          <Alegere
            numeAccesibil="Canal de vanzare"
            valoare={canal}
            schimba={setCanal}
            optiuni={[
              { valoare: "", eticheta: "Toate canalele" },
              ...canale.map((c) => ({ valoare: c.canal, eticheta: numeCanal(c.canal) })),
            ]}
          />
        )}

        <button
          type="button"
          onClick={() => setComparatie(!comparatie)}
          aria-pressed={comparatie}
          className={cn(
            "h-8 rounded-lg px-2.5 text-xs font-medium transition-colors",
            comparatie
              ? "bg-foreground text-background"
              : "text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted hover:text-foreground",
          )}
        >
          Compara cu perioada precedenta
        </button>
      </div>

      {perioada === "custom" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
          <label className="text-muted-foreground" htmlFor="stat-de-la">De la</label>
          <input
            id="stat-de-la" type="date" value={deLa}
            onChange={(e) => setCapete("deLa", e.target.value)}
            className="h-8 rounded-lg bg-card px-2 text-xs text-foreground ring-1 ring-foreground/10"
          />
          <label className="text-muted-foreground" htmlFor="stat-pana-la">pana la</label>
          <input
            id="stat-pana-la" type="date" value={panaLa}
            onChange={(e) => setCapete("panaLa", e.target.value)}
            className="h-8 rounded-lg bg-card px-2 text-xs text-foreground ring-1 ring-foreground/10"
          />
          {!(deLa && panaLa) && <span className="text-muted-foreground">Alege amandoua capetele.</span>}
        </div>
      )}
    </div>
  );
}

/** Aceeasi lista nativa ca la graficul din panou: se deschide la fel pe telefon. */
function Alegere({ valoare, schimba, optiuni, numeAccesibil }: {
  valoare: string;
  schimba: (v: string) => void;
  optiuni: { valoare: string; eticheta: string }[];
  numeAccesibil: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={numeAccesibil}
        value={valoare}
        onChange={(e) => schimba(e.target.value)}
        className="h-8 cursor-pointer appearance-none rounded-lg bg-card py-0 pr-7 pl-2.5 text-xs font-medium text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {optiuni.map((o) => (
          <option key={o.valoare} value={o.valoare}>{o.eticheta}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
