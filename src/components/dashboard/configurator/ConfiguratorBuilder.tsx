"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Check, ChevronDown, ChevronUp, CircleAlert, Loader2, Plus, Rocket, Trash2, TriangleAlert,
} from "lucide-react";
import type { ConfiguratorIncarcat } from "@/lib/actions/configurator.actions";
import { publicaConfigurator, redenumesteConfigurator } from "@/lib/actions/configurator.actions";
import type { Continut } from "@/lib/configurators/citeste";
import type { Nod } from "@/lib/configurators/definitie";
import {
  adaugaGrup, adaugaNod, adaugaPas, idNou, mutaGrup, mutaNod, mutaPas,
  schimbaNod, schimbaPas, stergeGrup, stergeNod, stergePas,
} from "@/lib/configurators/editare";
import type { Constatare } from "@/lib/configurators/validare";
import { useAutosalvare } from "./useAutosalvare";
import { InspectorNod } from "./InspectorNod";
import { PanouAplicare } from "./PanouAplicare";

/**
 * Builderul de configurator.
 *
 * ⚠ FARA „ANULEAZA / REFA". Panoul n-are asa ceva nicaieri, iar modelul casei e ciorna plus
 * publicare: se lucreaza pe ciorna, iar ce e publicat ramane neatins pana la urmatoarea
 * publicare. Un al treilea model, doar aici, ar fi insemnat ca merchantul invata trei intelesuri
 * diferite pentru „modificarile mele".
 */

/** Felurile de optiune pe care le poate adauga butonul „+ Adauga optiune". */
const FELURI: { fel: Nod["fel"]; control: string; eticheta: string }[] = [
  { fel: "text", control: "scurt", eticheta: "Text scurt" },
  { fel: "text", control: "lung", eticheta: "Text lung" },
  { fel: "numar", control: "camp", eticheta: "Numar" },
  { fel: "numar", control: "glisor", eticheta: "Glisor" },
  { fel: "alegere", control: "lista", eticheta: "Alegere din lista" },
  { fel: "alegere", control: "butoane", eticheta: "Alegere cu butoane" },
  { fel: "alegere", control: "culori", eticheta: "Alegere de culoare" },
  { fel: "alegeri", control: "bifare", eticheta: "Alegeri multiple" },
  { fel: "comutator", control: "comutator", eticheta: "Da / Nu" },
  { fel: "fisiere", control: "imagine", eticheta: "Incarcare imagine" },
];

function nodNou(fel: Nod["fel"], control: string, eticheta: string): Nod {
  const baza = { id: idNou(), eticheta };
  if (fel === "alegere" || fel === "alegeri") {
    return {
      ...baza, fel, control,
      optiuni: [{ id: idNou(), eticheta: "Prima optiune" }],
    } as Nod;
  }
  return { ...baza, fel, control } as Nod;
}

export function ConfiguratorBuilder({ initial }: { initial: ConfiguratorIncarcat }) {
  const router = useRouter();
  const [continut, setContinut] = useState<Continut>(initial.continut);
  const [nume, setNume] = useState(initial.nume);
  const [selectat, setSelectat] = useState<string | null>(null);
  const [constatari, setConstatari] = useState<Constatare[] | null>(null);
  const [fila, setFila] = useState<"structura" | "aplicare">("structura");
  const [publica, incepePublicarea] = useTransition();

  const salvare = useAutosalvare(initial.id, continut, initial.revizie);

  /** Orice schimbare a ciornei trece pe aici, ca autosalvarea sa stie ca are ce scrie. */
  const schimba = useCallback((urmator: Continut) => {
    salvare.marcheazaSchimbat();
    setContinut(urmator);
    setConstatari(null);
  }, [salvare]);

  const nodSelectat = useMemo(() => {
    for (const p of continut.definitie.pasi) {
      for (const g of p.grupuri) {
        for (const n of g.noduri) if (n.id === selectat) return n;
      }
    }
    return null;
  }, [continut, selectat]);

  function laPublicare() {
    incepePublicarea(async () => {
      /*
       * ⚠ Se scrie ciorna INAINTE de publicare, si daca scrierea cade NU se publica.
       * Altfel s-ar fi publicat forma de acum trei secunde, iar comerciantul ar fi vazut pe
       * magazin altceva decat pe ecran.
       */
      const scris = await salvare.salveazaAcum();
      if (!scris) {
        toast.error("Nu am putut salva ciorna, deci n-am publicat. Incearca din nou.");
        return;
      }
      const r = await publicaConfigurator(initial.id);
      if ("error" in r) {
        setConstatari(r.constatari ?? null);
        toast.error(r.error);
        return;
      }
      setConstatari(r.avertismente.length ? r.avertismente : null);
      toast.success(`Publicat: versiunea ${r.versiune}.`);
      router.refresh();
    });
  }

  function laRedenumire(valoare: string) {
    setNume(valoare);
  }

  function salveazaNumele() {
    const curat = nume.trim();
    if (!curat || curat === initial.nume) return;
    void redenumesteConfigurator(initial.id, curat).then((r) => {
      if ("error" in r) toast.error(r.error);
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Bara de sus ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          href="/dashboard/products/configurators"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Configuratoare
        </Link>

        <input
          value={nume}
          onChange={(e) => laRedenumire(e.target.value)}
          onBlur={salveazaNumele}
          aria-label="Numele configuratorului"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-base font-semibold outline-none hover:border-border focus:border-primary"
        />

        <IndicatorSalvare stare={salvare.stare} mesaj={salvare.mesaj} />

        <button
          type="button" onClick={laPublicare} disabled={publica}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {publica ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="h-4 w-4" aria-hidden />}
          {initial.versiuneActiva ? "Publica modificarile" : "Publica"}
        </button>
      </header>

      {/*
        ⚠ DOUA FILE, si de ce nu-s doua pagini.

        Structura e o CIORNA care se publica; aplicarea intra in vigoare pe loc. Doua pagini
        ar fi despartit doua intrebari pe care comerciantul le are in aceeasi clipa — cum
        arata, si pe ce se pune — si l-ar fi pus sa navigheze inainte si inapoi ca sa vada
        ce a facut. Deosebirea de inteles se spune in scris, in fila de aplicare.
      */}
      <div className="flex gap-1 border-b border-border px-4" role="tablist" aria-label="Ce editezi">
        <Fila activa={fila === "structura"} onAlege={() => setFila("structura")}>Structura</Fila>
        <Fila activa={fila === "aplicare"} onAlege={() => setFila("aplicare")}>Aplicare</Fila>
      </div>

      {fila === "aplicare" ? (
        <PanouAplicare configuratorId={initial.id} />
      ) : (
      <>
      {constatari && constatari.length > 0 && (
        <ListaConstatari constatari={constatari} onMergiLa={setSelectat} />
      )}

      {/* ── Structura si inspectorul ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-6 p-4 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1" aria-label="Structura configuratorului">
          {continut.definitie.pasi.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Configuratorul e gol. Incepe cu un pas, apoi adauga optiuni in el.
              </p>
              <button
                type="button" onClick={() => schimba(adaugaPas(continut))}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <Plus className="h-4 w-4" aria-hidden /> Adauga primul pas
              </button>
            </div>
          ) : (
            <>
              <ul className="space-y-4">
                {continut.definitie.pasi.map((pas, iPas) => (
                  <li key={pas.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={pas.eticheta}
                        onChange={(e) => schimba(schimbaPas(continut, pas.id, { eticheta: e.target.value }))}
                        aria-label={`Numele pasului ${iPas + 1}`}
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:border-border focus:border-primary"
                      />
                      <Mutare
                        eticheta={`pasul ${pas.eticheta}`}
                        sus={iPas > 0} jos={iPas < continut.definitie.pasi.length - 1}
                        onSus={() => schimba(mutaPas(continut, pas.id, -1))}
                        onJos={() => schimba(mutaPas(continut, pas.id, 1))}
                      />
                      <Sterge eticheta={`pasul ${pas.eticheta}`} onSterge={() => schimba(stergePas(continut, pas.id))} />
                    </div>

                    {pas.grupuri.map((grup, iGrup) => (
                      <div key={grup.id} className="mt-3 rounded-lg border border-border/70 bg-background p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={grup.eticheta ?? ""}
                            onChange={(e) => schimba({
                              ...continut,
                              definitie: {
                                ...continut.definitie,
                                pasi: continut.definitie.pasi.map((p) => p.id !== pas.id ? p : {
                                  ...p,
                                  grupuri: p.grupuri.map((g) => g.id === grup.id ? { ...g, eticheta: e.target.value } : g),
                                }),
                              },
                            })}
                            placeholder="Grup fara nume"
                            aria-label={`Numele grupului ${iGrup + 1}`}
                            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:border-border focus:border-primary"
                          />
                          <Mutare
                            eticheta={`grupul ${grup.eticheta || iGrup + 1}`}
                            sus={iGrup > 0} jos={iGrup < pas.grupuri.length - 1}
                            onSus={() => schimba(mutaGrup(continut, grup.id, -1))}
                            onJos={() => schimba(mutaGrup(continut, grup.id, 1))}
                          />
                          <Sterge eticheta={`grupul ${grup.eticheta || iGrup + 1}`} onSterge={() => schimba(stergeGrup(continut, grup.id))} />
                        </div>

                        <ul className="mt-2 space-y-1">
                          {grup.noduri.map((nod, iNod) => (
                            <li key={nod.id} className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button" onClick={() => setSelectat(nod.id)}
                                aria-pressed={selectat === nod.id}
                                className={`min-w-0 flex-1 truncate rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                                  selectat === nod.id
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border text-foreground hover:bg-muted"
                                }`}
                              >
                                {nod.eticheta}
                                <span className="ml-2 text-xs text-muted-foreground">{nod.fel}</span>
                              </button>
                              <Mutare
                                eticheta={`optiunea ${nod.eticheta}`}
                                sus={iNod > 0} jos={iNod < grup.noduri.length - 1}
                                onSus={() => schimba(mutaNod(continut, nod.id, -1))}
                                onJos={() => schimba(mutaNod(continut, nod.id, 1))}
                              />
                              <Sterge
                                eticheta={`optiunea ${nod.eticheta}`}
                                onSterge={() => {
                                  if (selectat === nod.id) setSelectat(null);
                                  schimba(stergeNod(continut, nod.id));
                                }}
                              />
                            </li>
                          ))}
                        </ul>

                        <AdaugaOptiune onAlege={(f) => {
                          const n = nodNou(f.fel, f.control, f.eticheta);
                          schimba(adaugaNod(continut, grup.id, n));
                          setSelectat(n.id);
                        }} />
                      </div>
                    ))}

                    <button
                      type="button" onClick={() => schimba(adaugaGrup(continut, pas.id))}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Adauga grup
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button" onClick={() => schimba(adaugaPas(continut))}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Plus className="h-4 w-4" aria-hidden /> Adauga pas
              </button>
            </>
          )}
        </section>

        <aside className="w-full shrink-0 lg:w-96" aria-label="Setarile optiunii alese">
          {nodSelectat ? (
            <InspectorNod
              nod={nodSelectat}
              onSchimba={(n) => schimba(schimbaNod(continut, n))}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Alege o optiune din stanga ca sa-i vezi setarile.
            </p>
          )}
        </aside>
      </div>
      </>
      )}
    </div>
  );
}

/** O fila din bara de sub antet. */
function Fila({ activa, onAlege, children }: {
  activa: boolean; onAlege: () => void; children: React.ReactNode;
}) {
  /*
   * ⚠ Culoarea nu e singurul semn ca fila e aleasa: are si chenarul de jos, si
   * `aria-selected` pentru cititoarele de ecran.
   */
  return (
    <button
      type="button" role="tab" aria-selected={activa} onClick={onAlege}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        activa
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUCATI MICI
   ═══════════════════════════════════════════════════════════════════════════ */

function IndicatorSalvare({ stare, mesaj }: { stare: string; mesaj: string | null }) {
  /*
   * ⚠ „Salvat" se scrie DOAR dupa un raspuns bun. Un indicator care spune „Salvat" fiindca s-a
   * trimis cererea e mai rau decat niciun indicator: omul inchide fila linistit.
   */
  if (stare === "seSalveaza") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Se salveaza
      </span>
    );
  }
  if (stare === "salvat") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Check className="h-3.5 w-3.5" aria-hidden /> Salvat
      </span>
    );
  }
  if (stare === "conflict" || stare === "eroare") {
    return (
      <span className="inline-flex max-w-xs items-center gap-1.5 text-xs text-destructive" role="alert">
        <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate" title={mesaj ?? undefined}>{mesaj ?? "Nu am putut salva"}</span>
      </span>
    );
  }
  return null;
}

function Mutare({ eticheta, sus, jos, onSus, onJos }: {
  eticheta: string; sus: boolean; jos: boolean; onSus: () => void; onJos: () => void;
}) {
  /*
   * ⚠ Butoane, nu tragere. Tragerea e greu de folosit pe telefon si imposibila cu tastatura;
   * pentru o parte dintre oameni astea sunt singurul drum.
   */
  return (
    <span className="inline-flex shrink-0">
      <button
        type="button" onClick={onSus} disabled={!sus}
        aria-label={`Muta ${eticheta} mai sus`}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronUp className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button" onClick={onJos} disabled={!jos}
        aria-label={`Muta ${eticheta} mai jos`}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}

function Sterge({ eticheta, onSterge }: { eticheta: string; onSterge: () => void }) {
  const [confirma, setConfirma] = useState(false);
  if (confirma) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        <button
          type="button" onClick={onSterge}
          className="rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-white"
        >
          Sterge
        </button>
        <button
          type="button" onClick={() => setConfirma(false)}
          className="rounded-md border border-border px-2 py-1 text-xs"
        >
          Nu
        </button>
      </span>
    );
  }
  return (
    <button
      type="button" onClick={() => setConfirma(true)}
      aria-label={`Sterge ${eticheta}`}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

function AdaugaOptiune({ onAlege }: { onAlege: (f: typeof FELURI[number]) => void }) {
  const [deschis, setDeschis] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button" onClick={() => setDeschis((x) => !x)}
        aria-expanded={deschis}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Adauga optiune
      </button>
      {deschis && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {FELURI.map((f) => (
            <button
              key={`${f.fel}-${f.control}`}
              type="button"
              onClick={() => { onAlege(f); setDeschis(false); }}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted"
            >
              {f.eticheta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ce s-a gasit la publicare.
 *
 * ⚠ Fiecare constatare DUCE undeva. O lista de texte moarte l-ar fi lasat pe comerciant sa caute
 * singur, printre douazeci de optiuni, pe care dintre ele o numeste mesajul.
 */
function ListaConstatari({ constatari, onMergiLa }: { constatari: Constatare[]; onMergiLa: (id: string) => void }) {
  const critice = constatari.filter((c) => c.treapta === "critic");
  return (
    <div className={`mx-4 mt-4 rounded-lg border px-4 py-3 ${
      critice.length ? "border-destructive/40 bg-destructive/5" : "border-amber-300/50 bg-amber-50/60"
    }`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <TriangleAlert className="h-4 w-4" aria-hidden />
        {critice.length
          ? "Nu se poate publica inca"
          : "Publicat, dar merita sa te uiti peste astea"}
      </p>
      <ul className="mt-2 space-y-1.5">
        {constatari.map((c, i) => (
          <li key={`${c.cod}-${i}`} className="text-sm text-muted-foreground">
            {c.tinta ? (
              <button
                type="button" onClick={() => onMergiLa(c.tinta!)}
                className="text-left underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                {c.mesaj}
              </button>
            ) : c.mesaj}
          </li>
        ))}
      </ul>
    </div>
  );
}
