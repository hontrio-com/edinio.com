"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Sliders, Trash2, Archive, Power } from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import {
  creeazaConfigurator, schimbaStareaConfiguratorului, stergeConfigurator,
  type RandLista,
} from "@/lib/actions/configurator.actions";

type Filtru = "toate" | "activ" | "ciorna" | "dezactivat" | "arhivat";

const ETICHETE: Record<string, { text: string; clase: string }> = {
  activ: { text: "Activ", clase: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ciorna: { text: "Ciorna", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  dezactivat: { text: "Dezactivat", clase: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  arhivat: { text: "Arhivat", clase: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

export function ConfiguratoareClient({ randuri }: { randuri: RandLista[] }) {
  const router = useRouter();
  const [lucreaza, incepe] = useTransition();
  const [cauta, setCauta] = useState("");
  const [filtru, setFiltru] = useState<Filtru>("toate");
  const [deSters, setDeSters] = useState<string | null>(null);

  const vizibile = useMemo(() => {
    const q = cauta.trim().toLowerCase();
    return randuri.filter((r) =>
      (filtru === "toate" || r.stare === filtru)
      && (!q || r.nume.toLowerCase().includes(q)));
  }, [randuri, cauta, filtru]);

  function creeaza() {
    incepe(async () => {
      const r = await creeazaConfigurator("Configurator nou");
      if ("error" in r) { toast.error(r.error); return; }
      router.push(`/dashboard/products/configurators/${r.id}`);
    });
  }

  function schimbaStarea(id: string, stare: string) {
    incepe(async () => {
      const r = await schimbaStareaConfiguratorului(id, stare);
      if ("error" in r) { toast.error(r.error); return; }
      router.refresh();
    });
  }

  function sterge(id: string) {
    incepe(async () => {
      const r = await stergeConfigurator(id);
      setDeSters(null);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Configuratorul a fost sters.");
      router.refresh();
    });
  }

  /* ── Niciun configurator inca ─────────────────────────────────────────── */
  if (randuri.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <Antet onCreeaza={creeaza} lucreaza={lucreaza} arataButon={false} />
        <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
          <Sliders className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Creeaza primul tau configurator</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Lasa cumparatorul sa aleaga dimensiuni, materiale, culori sau text, iar pretul se
            calculeaza singur din ce a ales.
          </p>
          <button
            type="button" onClick={creeaza} disabled={lucreaza}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden /> Creeaza configurator
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <Antet onCreeaza={creeaza} lucreaza={lucreaza} arataButon />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search" value={cauta} onChange={(e) => setCauta(e.target.value)}
            placeholder="Cauta dupa nume"
            aria-label="Cauta configuratoare"
            className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["toate", "activ", "ciorna", "dezactivat", "arhivat"] as Filtru[]).map((f) => (
            <button
              key={f} type="button" onClick={() => setFiltru(f)}
              aria-pressed={filtru === f}
              className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${
                filtru === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "toate" ? "Toate" : ETICHETE[f].text}
            </button>
          ))}
        </div>
      </div>

      {vizibile.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Niciun configurator nu se potriveste cu ce ai cautat.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
          {vizibile.map((r) => {
            const e = ETICHETE[r.stare] ?? ETICHETE.ciorna;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/products/configurators/${r.id}`}
                    className="truncate font-medium text-foreground hover:text-primary"
                  >
                    {r.nume}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {descriere(r)}
                  </p>
                </div>

                <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${e.clase}`}>
                  {e.text}
                </span>

                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDate(r.updated_at)}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  {r.stare !== "arhivat" && (
                    <button
                      type="button" disabled={lucreaza}
                      onClick={() => schimbaStarea(r.id, r.stare === "activ" ? "dezactivat" : "activ")}
                      title={r.stare === "activ" ? "Dezactiveaza" : "Activeaza"}
                      aria-label={r.stare === "activ" ? `Dezactiveaza ${r.nume}` : `Activeaza ${r.nume}`}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <Power className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button" disabled={lucreaza}
                    onClick={() => schimbaStarea(r.id, "arhivat")}
                    title="Arhiveaza"
                    aria-label={`Arhiveaza ${r.nume}`}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Archive className="h-4 w-4" aria-hidden />
                  </button>
                  {/*
                    ⚠ Stergerea se ofera doar cand n-a fost publicat NICIODATA. O versiune
                    publicata poate sta in instantaneul unei comenzi de acum trei luni. Serverul
                    refuza oricum; butonul doar nu promite ce nu se poate.
                  */}
                  {r.versiune === null && (
                    <button
                      type="button" disabled={lucreaza}
                      onClick={() => setDeSters(r.id)}
                      title="Sterge"
                      aria-label={`Sterge ${r.nume}`}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>

                {deSters === r.id && (
                  <div className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
                    <p className="text-foreground">Stergi „{r.nume}”? Nu se mai poate reface.</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button" disabled={lucreaza} onClick={() => sterge(r.id)}
                        className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Sterge
                      </button>
                      <button
                        type="button" onClick={() => setDeSters(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                      >
                        Renunta
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** „4 pasi · 13 optiuni · 126 produse" — numai ce chiar exista. */
function descriere(r: RandLista): string {
  const bucati: string[] = [];
  if (r.versiune !== null) bucati.push(`V${r.versiune}`);
  bucati.push(`${r.pasi} ${r.pasi === 1 ? "pas" : "pasi"}`);
  bucati.push(`${r.optiuni} ${r.optiuni === 1 ? "optiune" : "optiuni"}`);
  if (r.produse > 0) bucati.push(`${r.produse} ${r.produse === 1 ? "produs" : "produse"}`);
  if (r.categorii > 0) bucati.push(`${r.categorii} ${r.categorii === 1 ? "categorie" : "categorii"}`);
  if (r.produse === 0 && r.categorii === 0) bucati.push("neasociat");
  return bucati.join(" · ");
}

function Antet({ onCreeaza, lucreaza, arataButon }: { onCreeaza: () => void; lucreaza: boolean; arataButon: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuratoare</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Creeaza configuratoare pentru produsele tale, cu optiuni, dimensiuni, preturi calculate
          si reguli.
        </p>
      </div>
      {arataButon && (
        <button
          type="button" onClick={onCreeaza} disabled={lucreaza}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden /> Creeaza configurator
        </button>
      )}
    </div>
  );
}
