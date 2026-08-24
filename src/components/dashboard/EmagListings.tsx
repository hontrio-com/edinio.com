"use client";

import { useEffect, useState, useTransition } from "react";
import { Paginatie } from "./Paginatie";
import {
  AlertTriangle, ExternalLink, Loader2, PauseCircle, RefreshCw, Search, Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  comutaSincronizareaOfertei, listaOferteEmag, retrageDePeEmag, trimiteAcumPeEmag,
  type RandOfertaEcran, trimiteSelectiaEmag} from "@/lib/actions/emag.actions";

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
  /* ⚠ Origine, nu stare. „Preluate" se uita la `status = imported`, care ține doar
     până la prima reconciliere; filtrul se golea singur în câteva minute. */
  { cheie: "din_edinio", eticheta: "Trimise din Edinio" },
  { cheie: "doar_emag", eticheta: "Doar pe eMAG" },
  { cheie: "probleme", eticheta: "De reparat" },
] as const;

export function EmagListings({ businessId }: { businessId: string }) {
  const [randuri, setRanduri] = useState<RandOfertaEcran[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtru, setFiltru] = useState<string>("");
  const [cautare, setCautare] = useState("");
  /* ⚠ Bifele se țin pe `product_id`, nu pe `emag_id`: coada lucrează pe produse, iar un
     produs cu variante are mai multe oferte. Ținute pe ofertă, același produs ar fi
     intrat de cinci ori în același lot. */
  const [alese, setAlese] = useState<Set<string>>(new Set());
  const [seIncarca, incepe] = useTransition();

  /*
   * ⚠ Trece prin COADĂ, nu prin trimitere directă. „Trimite acum" ține omul pe loc cât
   * durează cererea — acceptabil pentru unul, absurd pentru cincizeci: funcția ar fi
   * depășit limita de timp și ar fi lăsat jumătate trimise, fără să spună care.
   */
  function trimiteAlese(op: "oferta" | "pret" | "stoc") {
    const ids = [...alese];
    incepe(async () => {
      const r = await trimiteSelectiaEmag(businessId, ids, op);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setAlese(new Set());
      toast.success(`${r.puse} ${r.puse === 1 ? "produs pus" : "produse puse"} la rând.`);
      incarca();
    });
  }

  function incarca(p = pagina, f = filtru, c = cautare) {
    incepe(async () => {
      const r = await listaOferteEmag(businessId, {
        pagina: p,
        stare: f && f !== "probleme" && f !== "din_edinio" && f !== "doar_emag"
          ? (f as RandOfertaEcran["stare"]) : undefined,
        origine: f === "din_edinio" ? "edinio" : f === "doar_emag" ? "emag" : undefined,
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

      {/*
        ⚠ Bara apare doar când chiar ai ales ceva. Prezentă mereu, ar fi ocupat un rând
        din ecran ca să spună „0 alese" — iar butoanele stinse învață pe cineva că
        ecranul e stricat.
      */}
      {alese.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
          <span className="text-xs font-medium">
            {alese.size} {alese.size === 1 ? "produs ales" : "produse alese"}
          </span>
          <button type="button" onClick={() => setAlese(new Set())}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            renunță
          </button>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {([
              { op: "stoc", eticheta: "Trimite stocul" },
              { op: "pret", eticheta: "Trimite prețul" },
              { op: "oferta", eticheta: "Trimite tot" },
            ] as const).map((b) => (
              <button
                key={b.op}
                type="button"
                onClick={() => trimiteAlese(b.op)}
                disabled={seIncarca}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                title={b.op === "oferta"
                  ? "Retrimite și fișa produsului. E trimiterea cea mai grea."
                  : undefined}
              >
                {b.eticheta}
              </button>
            ))}
          </div>
        </div>
      )}

      {randuri.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Nicio ofertă aici. Leagă o categorie și publică din ea, sau adu ofertele pe care le
          ai deja pe eMAG.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {randuri.map((r) => (
            <RandOferta
              key={r.id}
              businessId={businessId}
              rand={r}
              laSchimbare={() => incarca()}
              ales={!!r.productId && alese.has(r.productId)}
              laBifa={() => {
                if (!r.productId) return;
                setAlese((v) => {
                  const nou = new Set(v);
                  if (nou.has(r.productId!)) nou.delete(r.productId!);
                  else nou.add(r.productId!);
                  return nou;
                });
              }}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <Paginatie
          pagina={pagina}
          pagini={pagini}
          laSchimbare={(p) => incarca(p)}
          seIncarca={seIncarca}
          rezumat={`${(pagina - 1) * 50 + 1}–${Math.min(pagina * 50, total)} din ${total}`}
        />
      </div>
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
  businessId, rand, laSchimbare, ales, laBifa,
}: {
  businessId: string;
  rand: RandOfertaEcran;
  /** Bifat pentru o trimitere in masa. */
  ales: boolean;
  laBifa: () => void;
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
      /*
       * ═══ ⚠ VERDICTUL SE CITESTE. TOATE PATRU. ═══
       *
       * `retrageDePeEmag` intoarce `{ verdict, mesaj }` pentru ORICE verdict — numai
       * exceptiile ies cu `{ error }`. Forma dinainte verifica doar `"error" in r` si
       * apoi spunea verde „Oferta a fost oprită", indiferent ce raspunsesera ei.
       *
       * Deci: apesi „Retrage" pe un produs epuizat, eMAG raspunde 429 sau refuza
       * `offer/save`, iar ecranul iti spune ca s-a oprit. Oferta ramane VANDABILA,
       * comenzile continua sa intre pentru marfa care nu mai exista, si nimeni nu
       * reia retragerea — butonul nu pune nimic in coada.
       *
       * Raspuns de succes, efect zero: chiar forma incidentului VetDepo. Iar functia
       * sora de deasupra, `trimiteAcum`, trata deja corect toate patru — deci
       * contractul era stiut, doar ca aici nu s-a aplicat.
       */
      if (r.verdict === "trecatoare") {
        toast.warning(r.mesaj || "eMAG n-a răspuns. Nu s-a oprit nimic, mai încearcă.");
        return;
      }
      if (r.verdict === "refuz" || r.verdict === "chei") {
        toast.error(r.mesaj || "eMAG a refuzat retragerea. Oferta e în continuare la vânzare.");
        return;
      }
      if (r.verdict === "sarit") {
        toast.info(r.mesaj || "Nu era nimic de retras.");
        laSchimbare();
        return;
      }
      /* ⚠ „Oprit", nu „sters": eMAG NU are stergere de oferta. Spus gresit, omul s-ar
         speria cand o vede tot in contul lui. */
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

  /* ⚠ Și deriva e o problemă, chiar dacă oferta arată perfect sănătoasă: se vinde, și
     se vinde la alt preț decât crede comerciantul. */
  const areProbleme = rand.docErrors.length > 0 || !!rand.eroare || rand.traducereBlocheaza
    || rand.deriva != null;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* ⚠ Fara `product_id` nu se poate pune la rand: coada lucreaza pe produse.
            Se arata stinsa, nu se ascunde — altfel randul ar fi aratat ca si cum ai fi
            uitat sa-l bifezi. */}
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={ales}
          disabled={!rand.productId}
          onChange={laBifa}
          aria-label={`Alege ${rand.numeProdus}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{rand.numeProdus}</span>
            {/* ⚠ Se spune DE UNDE vine numele. Fara semnul asta, un comerciant care
                vinde pe eMAG si lucruri pe care nu le tine in magazin isi cauta in
                Edinio produse care n-au fost niciodata acolo — si crede ca le-a
                pierdut. Pe 24.08.2026 erau 3.334 de randuri asa. */}
            {rand.indrumare && (
              /* ⚠ Se arata si pe rand, nu doar in `title`: pe telefon nu exista hover, iar
                 „de ce nu se vinde produsul meu" e chiar intrebarea pentru care se deschide
                 ecranul asta. */
              <span className="w-full text-xs text-muted-foreground">{rand.indrumare}</span>
            )}
            {rand.doarPeEmag && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                doar pe eMAG
              </span>
            )}
            {rand.variantTitle && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {rand.variantTitle}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${CULOARE_STARE[rand.stare] ?? "bg-muted"}`}
              /* ⚠ Îndrumarea stă în `title`, nu pe rând: e utilă când o cauți, dar pusă pe
                 fiecare din cele câteva mii de rânduri ar fi făcut lista de necitit. */
              title={rand.indrumare || undefined}
            >
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

          {/*
            ═══ ⚠ DERIVA SE ARATĂ CU AMÂNDOUĂ VALORILE ═══

            „Prețul de pe eMAG nu mai e al tău" nu ajută pe nimeni. Ca să hotărască ce
            are de făcut, comerciantul trebuie să vadă exact CE e la el și CE e la ei:
            89,90 față de 100 e o campanie de-a lor; 0 față de 12 e o scriere pierdută.
            Două situații cu două reparații complet diferite.

            ⚠ Când s-a renunțat, se spune limpede că NU se mai încearcă. Un rând care
            arată o problemă fără să spună că mecanismul a renunțat l-ar fi lăsat pe om
            să aștepte o reparare care nu mai vine.
          */}
          {rand.deriva && (
            <div className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
              <p className="text-xs font-medium">
                Pe eMAG e altceva decât trimitem noi
              </p>
              <ul className="mt-1 space-y-0.5">
                {rand.deriva.campuri.map((d, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {d.camp === "pret" ? "Preț" : "Stoc"}: la tine{" "}
                    <strong className="tabular-nums text-foreground">
                      {d.camp === "pret" ? d.laNoi.toFixed(2) : d.laNoi}
                    </strong>
                    {" · "}pe eMAG{" "}
                    <strong className="tabular-nums text-foreground">
                      {d.camp === "pret" ? d.laEi.toFixed(2) : d.laEi}
                    </strong>
                    {d.camp === "pret" ? " (fără TVA)" : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                {rand.deriva.renuntat
                  ? "eMAG nu acceptă schimbarea. Nu se mai încearcă automat, uită-te în panoul lor."
                  : "Se repară singur la următoarele treceri."}
              </p>
            </div>
          )}

          {/*
            ⚠ SE ARATĂ, NU SE FOLOSEȘTE ÎN NICIO DECIZIE.
            Datele astea sunt tentația curată pentru un preț automat care taie până sub
            marjă. Comerciantul le vede și hotărăște el; Edinio nu-i schimbă prețul.
          */}
          {rand.concurenta && (
            <p className="mt-1 text-xs text-muted-foreground">
              {rand.concurenta.loc === 1
                ? "Ai butonul de cumpărare"
                : rand.concurenta.loc != null
                  ? `Locul ${rand.concurenta.loc} la butonul de cumpărare`
                  : "În competiție"}
              {" · "}
              {rand.concurenta.oferte} {rand.concurenta.oferte === 1 ? "ofertă" : "oferte"} pe produs
              {rand.concurenta.celMaiBunPret != null && (
                <> · cel mai bun preț: <span className="tabular-nums">{rand.concurenta.celMaiBunPret.toFixed(2)}</span> fără TVA</>
              )}
            </p>
          )}
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
                aprobată, ea poate opri publicarea. Verifică produsul în panoul eMAG.
              </li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
}
