"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet,
  Loader2, Upload, X,
} from "lucide-react";
import {
  cancelStockFeed, createStockFeedJob, previewStockFeed, processStockFeedChunk,
  startStockFeed, type StockFeedPreview,
} from "@/lib/actions/stock-feed.actions";
import {
  DEFAULT_STOCK_OPTIONS, MATCH_KEY_LABELS,
  type StockFeedMapping, type StockFeedOptions, type StockMatchKey,
} from "@/lib/import/stock-feed/types";
import { EMPTY_STOCK_TOTALS, type StockTotals } from "@/lib/import/stock-feed/committer";
import { ACCEPT_ATTRIBUTE, hasAcceptedExtension } from "@/lib/import/tabular-formats";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * Actualizarea stocurilor din fisier.
 *
 * Separat de `ImportWizard`, intentionat. Importul de produse creeaza si
 * suprascrie tot: nume, preturi, imagini, categorii. Feedul de stoc are voie sa
 * atinga doua numere. Tinute in acelasi ecran, o bifa greseala ar face diferenta
 * dintre "am actualizat stocul" si "am rescris catalogul".
 *
 * Pasul de previzualizare nu se poate sari. E singurul moment in care omul poate
 * vedea ce va schimba; dupa scriere nu mai are de unde sa afle ce avea inainte.
 */

type Step = "upload" | "mapping" | "review" | "progress" | "done";

const MATCH_KEYS: StockMatchKey[] = [
  "sku_auto", "sku", "variant_sku", "product_id", "external_id", "gtin",
];

const CARD = "rounded-xl border border-border bg-card";

export function StockFeedWizard({ onBack }: { onBack: () => void }) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<StockFeedMapping>({});
  const [options, setOptions] = useState<StockFeedOptions>(DEFAULT_STOCK_OPTIONS);
  const [preview, setPreview] = useState<StockFeedPreview | null>(null);
  const [totals, setTotals] = useState<StockTotals>(EMPTY_STOCK_TOTALS);

  const [uploading, setUploading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  /* In stare, nu in `ref`: identificatorul se citeste si la randare, pentru
     linkul de raport, iar un `ref` citit la randare nu e de incredere (regula
     `react-hooks/refs`). */
  const [importId, setImportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!hasAcceptedExtension(file.name)) {
      toast.error("Te rugam incarca un fisier CSV sau Excel");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await createStockFeedJob(fd);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setImportId(res.importId);
      setFileName(file.name);
      setHeaders(res.headers);
      setMapping(res.mapping);
      setSampleRows(res.sampleRows);
      setTotalRows(res.totalRows);
      setStep("mapping");
    } catch {
      toast.error("Fisierul nu a putut fi incarcat. Incearca din nou.");
    } finally {
      setUploading(false);
    }
  }

  async function loadPreview() {
    const id = importId;
    if (!id) return;
    setPreviewLoading(true);
    try {
      const res = await previewStockFeed(id, mapping, options);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setPreview(res);
      setStep("review");
    } catch {
      toast.error("Nu am putut calcula previzualizarea. Incearca din nou.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function run() {
    const id = importId;
    if (!id) return;
    setBusy(true);
    setStep("progress");
    try {
      const started = await startStockFeed(id, mapping, options);
      if ("error" in started) {
        toast.error(started.error);
        setStep("review");
        return;
      }

      /* Bucla pe bucati. Una dupa alta, niciodata deodata: doua bucati nu au voie
         sa scrie in acelasi produs in acelasi timp. */
      for (let guard = 0; guard < 500; guard++) {
        const res = await processStockFeedChunk(id);
        if ("error" in res) {
          toast.error(res.error);
          setStep("review");
          return;
        }
        setTotals(res.totals);
        if (res.done) break;
      }
      setStep("done");
      router.refresh();
    } catch {
      toast.error("Actualizarea nu a putut fi finalizata. Incearca din nou.");
      setStep("review");
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    if (importId) await cancelStockFeed(importId);
    setImportId(null);
    setStep("upload");
    setPreview(null);
    setFileName("");
  }

  /* ── Pasul 1: fisierul ── */
  if (step === "upload") {
    return (
      <div className="space-y-4">
        <Header onBack={onBack} />

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20",
          )}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <p className="text-sm font-medium text-foreground">
            Trage fisierul aici sau alege-l de pe calculator
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            CSV sau Excel (.xlsx). Ai nevoie de doua coloane: un cod care identifica
            produsul si cantitatea. Opțional, si o coloana de pret.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-1 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Alege fisierul
          </button>
        </div>

        <div className={cn(CARD, "p-4")}>
          <p className="text-xs font-semibold text-foreground">Exemplu de fisier</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`cod;stoc
TRIC-001;12
TRIC-001-M;4
TRIC-001-L;8`}
          </pre>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Codurile de produs si cele de varianta pot sta in acelasi fisier. La un
            Excel citim prima foaie.
          </p>
        </div>
      </div>
    );
  }

  /* ── Pasul 2: coloane si cheie ── */
  if (step === "mapping") {
    return (
      <div className="space-y-4">
        <Header onBack={abandon} fileName={fileName} totalRows={totalRows} />

        <div className={cn(CARD, "space-y-4 p-5")}>
          <h2 className="text-sm font-semibold text-foreground">Coloanele din fisier</h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <ColumnPicker
              label="Identificator"
              required
              headers={headers}
              value={mapping.identifier}
              onChange={(v) => setMapping((m) => ({ ...m, identifier: v }))}
            />
            <ColumnPicker
              label="Stoc"
              headers={headers}
              value={mapping.stock}
              onChange={(v) => setMapping((m) => ({ ...m, stock: v }))}
            />
            <ColumnPicker
              label="Pret"
              headers={headers}
              value={mapping.price}
              onChange={(v) => setMapping((m) => ({ ...m, price: v }))}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">Potrivire dupa</label>
            <select
              value={options.match_key}
              onChange={(e) => setOptions((o) => ({ ...o, match_key: e.target.value as StockMatchKey }))}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm sm:max-w-xs"
            >
              {MATCH_KEYS.map((key) => (
                <option key={key} value={key}>{MATCH_KEY_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              checked={options.update_price}
              onChange={(e) => setOptions((o) => ({ ...o, update_price: e.target.checked }))}
              className="mt-0.5"
            />
            <span className="text-xs">
              <span className="font-semibold text-foreground">Actualizeaza si preturile</span>
              <span className="mt-0.5 block text-muted-foreground">
                Preturile schimbate aici ajung mai departe la Google, la marketplace-uri
                si in catalogul Facebook. Lasa nebifat daca fisierul e doar pentru stoc.
              </span>
            </span>
          </label>

          {sampleRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    {headers.map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1.5 text-foreground">{row[h] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={abandon} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> Alt fisier
          </button>
          <button
            type="button"
            disabled={previewLoading || !mapping.identifier}
            onClick={loadPreview}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Vezi ce se schimba <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  /* ── Pasul 3: previzualizarea ── */
  if (step === "review" && preview) {
    const s = preview.summary;
    /* ⚠ CUPLAT cu `StockRowProblem`: cand se adauga un tip, se adauga si aici,
       altfel „Probleme" ramane 0 pentru randuri care chiar au o problema. */
    const problems = s.not_found + s.ambiguous + s.invalid + s.duplicate + s.ignored;

    return (
      <div className="space-y-4">
        <Header onBack={() => setStep("mapping")} fileName={fileName} totalRows={totalRows} />

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Se actualizeaza" value={s.willWrite} tone="primary" />
          <Stat label="Ramane la fel" value={s.unchanged} />
          <Stat label="Nu s-au gasit" value={s.not_found} tone={s.not_found > 0 ? "warning" : undefined} />
          <Stat label="Probleme" value={problems - s.not_found} tone={problems - s.not_found > 0 ? "warning" : undefined} />
        </div>

        {s.willWrite === 0 && (
          <Notice tone="warning">
            Nimic de actualizat. Verifica daca ai ales coloana si cheia potrivite.
          </Notice>
        )}

        {s.toZero > 0 && (
          <Notice tone="warning">
            <strong>{s.toZero}</strong> {s.toZero === 1 ? "produs trece" : "produse trec"} pe stoc 0,
            deci nu se mai pot comanda.
          </Notice>
        )}

        {s.priceChanges > 0 && (
          <Notice tone="warning">
            <strong>{s.priceChanges}</strong> {s.priceChanges === 1 ? "pret se schimba" : "preturi se schimba"}.
            Preturile ajung mai departe la Google si la marketplace-uri.
          </Notice>
        )}

        {s.inventoryOff > 0 && (
          <Notice>
            <strong>{s.inventoryOff}</strong> {s.inventoryOff === 1 ? "produs are" : "produse au"} urmarirea
            stocului oprita. Valoarea se scrie, dar magazinul nu o foloseste.
          </Notice>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className={cn(CARD, "p-4")}>
            <p className="text-xs font-semibold text-foreground">
              Primele modificari {s.variantChanges > 0 && <span className="text-muted-foreground">({s.variantChanges} pe variante)</span>}
            </p>
            <div className="mt-2 space-y-1.5">
              {preview.sampleChanges.length === 0 && (
                <p className="text-xs text-muted-foreground">Nimic.</p>
              )}
              {preview.sampleChanges.map((c) => (
                <div key={`${c.rowIndex}`} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0 break-words text-foreground">
                    {c.productName}
                    {c.variantTitle && <span className="text-muted-foreground"> ({c.variantTitle})</span>}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {c.stockTo !== null && <span>{c.stockFrom ?? 0} → <strong className="text-foreground">{c.stockTo}</strong></span>}
                    {c.priceTo !== null && (
                      <span className="ml-2">{formatPrice(c.priceFrom ?? 0)} → <strong className="text-foreground">{formatPrice(c.priceTo)}</strong></span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={cn(CARD, "p-4")}>
            <p className="text-xs font-semibold text-foreground">Primele probleme</p>
            <div className="mt-2 space-y-1.5">
              {preview.sampleIssues.length === 0 && (
                <p className="text-xs text-muted-foreground">Niciuna.</p>
              )}
              {preview.sampleIssues.map((issue) => (
                <div key={issue.rowIndex} className="text-xs">
                  <span className="font-mono text-foreground">Rand {issue.rowIndex}</span>
                  <span className="text-muted-foreground"> · {issue.identifier || "fara cod"} · {issue.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setStep("mapping")} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> Schimba coloanele
          </button>
          <button
            type="button"
            disabled={busy || s.willWrite === 0}
            onClick={run}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Actualizeaza {s.willWrite} {s.willWrite === 1 ? "produs" : "produse"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Pasul 4: scrierea ── */
  if (step === "progress") {
    const done = totals.written + totals.failed;
    const target = done + totals.pending;
    const pct = target > 0 ? Math.round((done / target) * 100) : 0;

    return (
      <div className={cn(CARD, "space-y-4 p-6 text-center")}>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-semibold text-foreground">Se actualizeaza stocurile</p>
        <div className="mx-auto h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {done} din {target} · nu inchide pagina
        </p>
      </div>
    );
  }

  /* ── Pasul 5: gata ── */
  if (step === "done") {
    const hadProblems = totals.failed > 0 || totals.not_found > 0 || totals.ambiguous > 0
      || totals.invalid > 0 || totals.duplicate > 0 || totals.ignored > 0;

    return (
      <div className="space-y-4">
        <div className={cn(CARD, "space-y-3 p-6 text-center")}>
          <CheckCircle2 className="mx-auto h-9 w-9 text-primary" />
          <p className="text-base font-semibold text-foreground">
            {totals.written} {totals.written === 1 ? "produs actualizat" : "produse actualizate"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {totals.unchanged > 0 && <span>{totals.unchanged} neschimbate</span>}
            {totals.not_found > 0 && <span>{totals.not_found} negasite</span>}
            {totals.ambiguous > 0 && <span>{totals.ambiguous} ambigue</span>}
            {totals.invalid > 0 && <span>{totals.invalid} invalide</span>}
            {totals.duplicate > 0 && <span>{totals.duplicate} duplicate</span>}
            {totals.ignored > 0 && (
              <span className="text-warning">{totals.ignored} fara efect in magazin</span>
            )}
            {totals.failed > 0 && <span className="text-destructive">{totals.failed} eșuate</span>}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {hadProblems && importId && (
              <a
                href={`/api/imports/${importId}/error-report`}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium"
              >
                <Download className="h-4 w-4" /> Descarca raportul
              </a>
            )}
            <button
              type="button"
              onClick={() => { setImportId(null); setPreview(null); setTotals(EMPTY_STOCK_TOTALS); setStep("upload"); }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white"
            >
              Alt fisier
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/* ── Bucati mici ── */

function Header({ onBack, fileName, totalRows }: { onBack: () => void; fileName?: string; totalRows?: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-foreground">Actualizare stocuri</h1>
        {fileName ? (
          <p className="truncate text-xs text-muted-foreground">{fileName} · {totalRows} randuri</p>
        ) : (
          <p className="text-xs text-muted-foreground">Doar stocul si, opțional, pretul. Nimic altceva.</p>
        )}
      </div>
      <button type="button" onClick={onBack} aria-label="Inchide" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ColumnPicker({
  label, required, headers, value, onChange,
}: {
  label: string; required?: boolean; headers: string[];
  value: string | undefined; onChange: (v: string | undefined) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
      >
        <option value="">Nefolosita</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "primary" | "warning" }) {
  return (
    <div className={cn(CARD, "p-3")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 text-xl font-bold",
        tone === "primary" && "text-primary",
        tone === "warning" && "text-warning",
        !tone && "text-foreground",
      )}>
        {value}
      </p>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: "warning" }) {
  return (
    <div className={cn(
      "flex items-start gap-2.5 rounded-lg border p-3 text-xs",
      tone === "warning" ? "border-warning/30 bg-warning/5 text-foreground" : "border-border bg-muted/20 text-foreground",
    )}>
      <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "warning" ? "text-warning" : "text-muted-foreground")} />
      <span>{children}</span>
    </div>
  );
}
