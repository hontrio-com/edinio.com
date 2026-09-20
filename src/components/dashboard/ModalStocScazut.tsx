"use client";

import { use, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, Package, X } from "lucide-react";
import { toast } from "sonner";
import {
  actualizeazaStocuri,
  type Modificare,
  type ModScriere,
  type ProdusSubPrag,
} from "@/lib/actions/stoc-scazut.actions";
import { PRAG_STOC_SCAZUT } from "@/lib/stoc-prag";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  MODALUL DE STOC: SE BIFEAZA CE S-A COMPLETAT, SI SE SCRIE DINTR-O APASARE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ UN PRODUS CU VARIANTE NU ARE UN STOC AL LUI. Are cate unul pe fiecare
  combinatie, iar numarul de pe produs e doar suma lor, recalculata de baza. De
  aceea randul unui astfel de produs NU se poate bifa: se desface, si se bifeaza
  variantele. Altfel omul ar fi crezut ca a completat stocul, iar valoarea lui
  s-ar fi sters la prima recalculare.

  Doua feluri de scriere, fiindca sunt doua situatii diferite in magazin:
    - „Adauga" (implicit): a venit marfa, cresc cu cat am primit;
    - „Seteaza": am numarat raftul, valoarea de acum e asta.

  Cifrele arata cum e ACUM, nu cum era la deschidere: dupa scriere lista se
  reincarca, iar produsele care au iesit de sub prag dispar din ea.
*/
export type CerereProduse = Promise<{ produse: ProdusSubPrag[] } | { error: string }>;

export function ModalStocScazut({
  businessId,
  cerere,
  reincarca,
  inchide,
}: {
  businessId: string;
  /*
    ⚠ CITIREA NU PORNESTE DE AICI, si nu e o scapare.

    Un `useEffect` care cheama citirea si pune rezultatul in stare e chiar tiparul
    pe care regula `react-hooks/set-state-in-effect` il opreste: randari in
    cascada, si o stare care se poate desincroniza de ce e pe ecran. Asa cum
    recomanda React 19, cererea porneste in apasarea care deschide modalul (in
    banda), iar aici se CITESTE cu `use()`. Componenta nu mai are nici efect de
    incarcare, nici stare de „se incarca”: de asteptat asteapta `Suspense`-ul
    parintelui.
  */
  cerere: CerereProduse;
  /** Porneste o cerere noua, dupa ce s-a scris ceva. */
  reincarca: () => void;
  inchide: () => void;
}) {
  const router = useRouter();
  const rezultat = use(cerere);
  const produse = "error" in rezultat ? null : rezultat.produse;
  const eroare = "error" in rezultat ? rezultat.error : null;

  const [alese, setAlese] = useState<Set<string>>(new Set());
  const [desfacute, setDesfacute] = useState<Set<string>>(
    () => new Set((produse ?? []).filter(p => p.variante.length > 0).map(p => p.id)),
  );
  const [mod, setMod] = useState<ModScriere>("adauga");
  const [cantitate, setCantitate] = useState("10");
  const [seScrie, setSeScrie] = useState(false);
  const [seReincarca, porneste] = useTransition();

  // Escape inchide, ca la celelalte modale din panou.
  useEffect(() => {
    function laTasta(e: KeyboardEvent) { if (e.key === "Escape" && !seScrie) inchide(); }
    window.addEventListener("keydown", laTasta);
    return () => window.removeEventListener("keydown", laTasta);
  }, [inchide, seScrie]);

  /** Cheia unui rand bifabil: produsul simplu, sau varianta. */
  const cheieProdus = (p: ProdusSubPrag) => `p:${p.id}`;
  const cheieVarianta = (p: ProdusSubPrag, vid: string) => `v:${p.id}:${vid}`;

  function comuta(k: string) {
    setAlese(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function comutaDesfacut(id: string) {
    setDesfacute(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Toate randurile bifabile: produsele simple, plus variantele celor cu variante. */
  const toateRandurile: string[] = (produse ?? []).flatMap(p =>
    p.variante.length > 0 ? p.variante.map(v => cheieVarianta(p, v.id)) : [cheieProdus(p)],
  );
  const toateBifate = toateRandurile.length > 0 && toateRandurile.every(k => alese.has(k));

  function comutaToate() {
    setAlese(toateBifate ? new Set() : new Set(toateRandurile));
  }

  async function aplica() {
    const n = Number(cantitate);
    if (!Number.isFinite(n) || n < 0) { toast.error("Pune un numar mai mare sau egal cu zero."); return; }

    const modificari: Modificare[] = [];
    for (const p of produse ?? []) {
      if (p.variante.length > 0) {
        for (const v of p.variante) {
          if (alese.has(cheieVarianta(p, v.id))) {
            modificari.push({ fel: "varianta", productId: p.id, variantId: v.id, cantitate: n });
          }
        }
      } else if (alese.has(cheieProdus(p))) {
        modificari.push({ fel: "produs", productId: p.id, cantitate: n });
      }
    }

    if (modificari.length === 0) { toast.error("Bifeaza intai produsele."); return; }

    setSeScrie(true);
    const r = await actualizeazaStocuri(businessId, modificari, mod);
    setSeScrie(false);

    if ("error" in r) { toast.error(r.error); return; }

    if (r.esuate.length > 0) {
      toast.warning(`${r.actualizate} produse actualizate, ${r.esuate.length} nu s-au putut scrie.`);
    } else {
      toast.success(
        mod === "adauga"
          ? `Am adaugat ${n} buc la ${modificari.length} ${modificari.length === 1 ? "rand" : "randuri"}.`
          : `Am setat stocul la ${n} buc pentru ${modificari.length} ${modificari.length === 1 ? "rand" : "randuri"}.`,
      );
    }

    /* Bifele se sterg: randurile completate ies din lista, iar cele ramase au
       alte numere. Reincarcarea se face intr-o tranzitie, ca lista de acum sa
       ramana pe ecran pana soseste cea noua. */
    setAlese(new Set());
    porneste(() => reincarca());
    router.refresh();
  }

  const nrAlese = alese.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !seScrie && inchide()} />

      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-foreground/10">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Produse sub pragul de stoc</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Produsele active cu urmarirea stocului pornita si cel mult {PRAG_STOC_SCAZUT} bucati.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !seScrie && inchide()}
            aria-label="Inchide"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/10 transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {eroare && (
          <div className="px-5 py-10 text-center text-sm text-destructive">{eroare}</div>
        )}

        {produse && produse.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Niciun produs sub prag. Stocurile stau bine.
          </div>
        )}

        {produse && produse.length > 0 && (
          <>
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-5 py-2">
              <input
                id="bifa-toate"
                type="checkbox"
                checked={toateBifate}
                onChange={comutaToate}
                className="h-4 w-4 cursor-pointer rounded accent-primary"
              />
              <label htmlFor="bifa-toate" className="cursor-pointer text-xs font-medium text-muted-foreground">
                Bifeaza tot ({toateRandurile.length})
              </label>
            </div>

            <ul className="flex-1 divide-y divide-border overflow-y-auto">
              {produse.map(p => {
                const cuVariante = p.variante.length > 0;
                const desfacut = desfacute.has(p.id);

                return (
                  <li key={p.id}>
                    <div className="flex items-center gap-3 px-5 py-2.5">
                      {cuVariante ? (
                        <button
                          type="button"
                          onClick={() => comutaDesfacut(p.id)}
                          aria-label={desfacut ? "Strange variantele" : "Desfa variantele"}
                          className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground"
                        >
                          {desfacut ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      ) : (
                        <input
                          type="checkbox"
                          checked={alese.has(cheieProdus(p))}
                          onChange={() => comuta(cheieProdus(p))}
                          className="h-4 w-4 flex-shrink-0 cursor-pointer rounded accent-primary"
                        />
                      )}

                      {p.imagine ? (
                        <Image
                          src={p.imagine}
                          alt=""
                          width={36}
                          height={36}
                          className="h-9 w-9 flex-shrink-0 rounded-lg object-cover ring-1 ring-foreground/10"
                        />
                      ) : (
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/dashboard/products/${p.id}/edit`}
                          className="block truncate text-sm text-foreground hover:underline"
                        >
                          {p.nume}
                        </Link>
                        {cuVariante && (
                          <span className="text-xs text-muted-foreground">
                            {p.variante.length} variante, stocul se completeaza pe fiecare
                          </span>
                        )}
                      </div>

                      <PastilaStoc buc={p.stoc} />
                    </div>

                    {cuVariante && desfacut && (
                      <ul className="bg-muted/30">
                        {p.variante.map(v => (
                          <li key={v.id} className="flex items-center gap-3 py-2 pl-16 pr-5">
                            <input
                              type="checkbox"
                              checked={alese.has(cheieVarianta(p, v.id))}
                              onChange={() => comuta(cheieVarianta(p, v.id))}
                              className="h-4 w-4 flex-shrink-0 cursor-pointer rounded accent-primary"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{v.eticheta}</span>
                            {v.sku && (
                              <span className="flex-shrink-0 font-mono text-xs text-muted-foreground">{v.sku}</span>
                            )}
                            <PastilaStoc buc={v.stoc} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>

            <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/50 px-5 py-3">
              <div className="flex overflow-hidden rounded-lg ring-1 ring-foreground/10">
                {(["adauga", "seteaza"] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMod(m)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                      mod === m ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {m === "adauga" ? "Adauga" : "Seteaza"}
                  </button>
                ))}
              </div>

              <input
                type="number"
                min={0}
                value={cantitate}
                onChange={e => setCantitate(e.target.value)}
                aria-label="Cantitate"
                className="w-24 rounded-lg bg-card px-3 py-1.5 text-sm text-foreground ring-1 ring-foreground/10 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-xs text-muted-foreground">
                {mod === "adauga" ? "bucati in plus la fiecare rand bifat" : "bucati, valoarea finala a fiecarui rand bifat"}
              </span>

              <button
                type="button"
                onClick={aplica}
                disabled={seScrie || seReincarca || nrAlese === 0}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
              >
                {(seScrie || seReincarca) && <Loader2 className="h-4 w-4 animate-spin" />}
                {nrAlese === 0 ? "Bifeaza randuri" : `Aplica la ${nrAlese} ${nrAlese === 1 ? "rand" : "randuri"}`}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function PastilaStoc({ buc }: { buc: number }) {
  const epuizat = buc <= 0;
  return (
    <span
      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        epuizat ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
      }`}
    >
      {epuizat ? "epuizat" : `${buc} buc`}
    </span>
  );
}
