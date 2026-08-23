"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle, ExternalLink, Loader2, PauseCircle, RefreshCw, Search, Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  comutaSincronizareaOfertei, listaOferteEmag, retrageDePeEmag, trimiteAcumPeEmag,
  type RandOfertaEcran,
} from "@/lib/actions/emag.actions";

/**
 * Lista ofertelor de pe eMAG.
 *
 * ═══ ⚠ ECRANUL ĂSTA EXISTĂ CA SĂ SPUNĂ DE CE NU SE VINDE UN PRODUS ═══
 *
 * La Trendyol, motivul respingerii n-a fost arătat niciodată. Produsele au stat „în
 * aprobare" la nesfârșit, iar comerciantul era convins că platforma le ține pe loc —
 * când de fapt marketplace-ul îi ceruse de trei zile o caracteristică.
 *
 * Deci `doc_errors` se arată ÎNTREG, cuvânt cu cuvânt de la ei. Un rezumat scris de
 * noi ar fi pierdut exact detaliul care spune CE câmp și CE valoare.
 *
 * ⚠ „Se vinde pe eMAG" înseamnă toate cele patru condiții deodată — stoc, stare,
 * validarea ofertei și validarea documentației. Scris după una singură, ecranul ar fi
 * spus „publicat" pentru oferte pe care cumpărătorul nu le vede, adică cea mai
 * supărătoare minciună a unui panou: omul nu are cum s-o dovedească.
 */

const CAMP =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";

const FILTRE = [
  { cheie: "", eticheta: "Toate" },
  { cheie: "live", eticheta: "Se vând" },
  { cheie: "sent", eticheta: "În validare" },
  { cheie: "imported", eticheta: "Preluate" },
  { cheie: "probleme", eticheta: "De reparat" },
] as const;

export function EmagListings({ businessId }: { businessId: string }) {
  const [randuri, setRanduri] = useState<RandOfertaEcran[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtru, setFiltru] = useState<string>("");
  const [cautare, setCautare] = useState("");
  const [seIncarca, incepe] = useTransition();

  function incarca(p = pagina, f = filtru, c = cautare) {
    incepe(async () => {
      const r = await listaOferteEmag(businessId, {
        pagina: p,
        stare: f && f !== "probleme" ? (f as RandOfertaEcran["stare"]) : undefined,
        doarProbleme: f === "probleme",
        cautare: c || undefined,
      });
      if ("error" in r) {
        toast.error(r.error);
        setRanduri([]);
        return;
      }
      setRanduri(r.randuri);
      setTotal(r.total);
      setPagina(r.pagina);
    });
  }

  useEffect(() => {
    incarca(1, "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  if (randuri === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Se citesc ofertele…
        </div>
      </div>
    );
  }

  const pagini = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Ofertele tale pe eMAG</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {total} {total === 1 ? "ofertă" : "oferte"} în total.
          </p>
        </div>
        <button
          type="button"
          onClick={() => incarca()}
          disabled={seIncarca}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
        >
          {seIncarca ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reîmprospătează
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FILTRE.map((f) => (
          <button
            key={f.cheie}
            type="button"
            onClick={() => {
              setFiltru(f.cheie);
              incarca(1, f.cheie, cautare);
            }}
            className={`rounded-lg px-2.5 py-1.5 text-xs ${
              filtru === f.cheie ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"
            }`}
          >
            {f.eticheta}
          </button>
        ))}

        <div className="relative ml-auto min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${CAMP} pl-8`}
            placeholder="Caută după SKU sau cod de bare"
            value={cautare}
            onChange={(e) => setCautare(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") incarca(1, filtru, cautare);
            }}
          />
        </div>
      </div>

      {randuri.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Nicio ofertă aici. Leagă o categorie și publică din ea, sau adu ofertele pe care le
          ai deja pe eMAG.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {randuri.map((r) => (
            <RandOferta key={r.id} businessId={businessId} rand={r} laSchimbare={() => incarca()} />
          ))}
        </ul>
      )}

      {pagini > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs">
          <button
            type="button"
            disabled={pagina <= 1 || seIncarca}
            onClick={() => incarca(pagina - 1)}
            className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
          >
            Înapoi
          </button>
          <span className="tabular-nums text-muted-foreground">
            Pagina {pagina} din {pagini}
          </span>
          <button
            type="button"
            disabled={pagina >= pagini || seIncarca}
            onClick={() => incarca(pagina + 1)}
            className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
          >
            Mai departe
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UN RÂND
   ═══════════════════════════════════════════════════════════════════════════ */

const CULOARE_STARE: Record<string, string> = {
  live: "bg-primary/10 text-primary",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  queued: "bg-muted text-muted-foreground",
  imported: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  error: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  withdrawn: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

function RandOferta({
  businessId, rand, laSchimbare,
}: {
  businessId: string;
  rand: RandOfertaEcran;
  laSchimbare: () => void;
}) {
  const [seLucreaza, incepe] = useTransition();

  function trimite() {
    if (!rand.productId) return;
    incepe(async () => {
      const r = await trimiteAcumPeEmag(businessId, rand.productId!, "oferta");
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      /*
       * ⚠ „Salvat cu observații" NU e o reușită curată și NU e un eșec. eMAG a
       * primit oferta și a salvat-o, dar are ce să-i reproșeze. Arătat ca reușită,
       * omul ar fi crezut că s-a terminat; arătat ca eroare, ar fi retrimis la
       * nesfârșit ceva ce e deja acolo.
       */
      if (r.verdict === "reusit_cu_observatii") {
        toast.warning("eMAG a acceptat oferta, dar are observații. Vezi mai jos ce cere.");
      } else if (r.verdict === "sarit") {
        toast.info(r.mesaj || "Nu era nimic de trimis.");
      } else if (r.verdict === "reusit") {
        toast.success("Trimis la eMAG. Validarea lor durează ore.");
      } else {
        toast.error(r.mesaj || "eMAG a refuzat.");
      }
      laSchimbare();
    });
  }

  function retrage() {
    if (!rand.productId) return;
    incepe(async () => {
      const r = await retrageDePeEmag(businessId, rand.productId!);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      /* ⚠ „Oprit", nu „șters": eMAG NU are ștergere de ofertă. Spus greșit, omul s-ar
         speria când o vede tot în contul lui. */
      toast.success("Oferta a fost oprită de la vânzare. Rămâne în contul tău eMAG.");
      laSchimbare();
    });
  }

  function comuta() {
    if (!rand.productId) return;
    incepe(async () => {
      const r = await comutaSincronizareaOfertei(businessId, rand.productId!, !rand.autoSync);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(
        rand.autoSync
          ? "Prețul și stocul nu se mai trimit automat pentru produsul ăsta."
          : "Prețul și stocul din Edinio vor conduce de acum oferta de pe eMAG.",
      );
      laSchimbare();
    });
  }

  const areProbleme = rand.docErrors.length > 0 || !!rand.eroare || rand.traducereBlocheaza;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{rand.numeProdus}</span>
            {rand.variantTitle && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {rand.variantTitle}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-xs ${CULOARE_STARE[rand.stare] ?? "bg-muted"}`}>
              {rand.stareEticheta}
            </span>
            {!rand.autoSync && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Nu se trimite automat
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            #{rand.emagId}
            {rand.validare ? ` · ${rand.validare}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {rand.linkEmag && (
            <a
              href={rand.linkEmag}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border p-1.5 hover:bg-muted"
              title="Vezi pe eMAG"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {rand.productId && (
            <>
              <button
                type="button"
                onClick={trimite}
                disabled={seLucreaza}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
              >
                {seLucreaza ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Trimite acum
              </button>
              <button
                type="button"
                onClick={comuta}
                disabled={seLucreaza}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                title={
                  rand.autoSync
                    ? "Oprește trimiterea automată a prețului și stocului"
                    : "Lasă Edinio să conducă prețul și stocul"
                }
              >
                {rand.autoSync ? "Nu mai trimite" : "Trimite automat"}
              </button>
              <button
                type="button"
                onClick={retrage}
                disabled={seLucreaza}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-60"
                title="Oprește de la vânzare pe eMAG"
              >
                <PauseCircle className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {areProbleme && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Ce cere eMAG
          </p>
          <ul className="mt-1.5 space-y-1">
            {/* ⚠ Textul lor, întreg. Un rezumat de-al nostru ar fi pierdut exact
                câmpul și valoarea care spun ce e de reparat. */}
            {rand.docErrors.map((d, i) => (
              <li key={i} className="text-xs text-amber-900 dark:text-amber-200">
                {d}
              </li>
            ))}
            {rand.eroare && (
              <li className="text-xs text-amber-900 dark:text-amber-200">{rand.eroare}</li>
            )}
            {rand.traducereBlocheaza && (
              <li className="text-xs text-amber-900 dark:text-amber-200">
                {/* ⚠ NU pretindem că știm ce înseamnă valoarea: documentația lor nu o
                    enumeră nicăieri. Se arată că există, și atât. */}
                eMAG semnalează și starea traducerii automate. Chiar cu documentația
                aprobată, ea poate opri publicarea — verifică produsul în panoul eMAG.
              </li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
}
