"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, ArrowLeft, ArrowRight, Loader2, CheckCircle2,
  AlertTriangle, Package, Download, X,
} from "lucide-react";
import {
  createImportJob, previewMapping, startImport, processImportChunk, cancelImport,
} from "@/lib/actions/import.actions";
import { OUR_FIELDS, DEFAULT_OPTIONS, EMPTY_TOTALS } from "@/lib/import/types";
import type { ColumnMapping, ImportOptions, ImportSource, ImportStatus, ImportTotals, StagedProduct, ValidationSummary } from "@/lib/import/types";
import { SOURCE_LABELS } from "@/lib/import/presets";
import { IMPORT_TEMPLATES } from "@/lib/import/templates";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Step = "upload" | "mapping" | "review" | "progress" | "done";

export function ImportWizard({ plan, productLimit, productCount }: { plan: string; productLimit: number; productCount: number }) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [source, setSource] = useState<ImportSource>("generic_csv");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [sample, setSample] = useState<StagedProduct[]>([]);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [totals, setTotals] = useState<ImportTotals>(EMPTY_TOTALS);
  const [status, setStatus] = useState<ImportStatus>("uploaded");

  const [uploading, setUploading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const importIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const loopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload ────────────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Te rugam incarca un fisier CSV");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await createImportJob(fd);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      importIdRef.current = res.importId;
      setFileName(file.name);
      setSource(res.preview.source);
      setHeaders(res.preview.headers);
      setMapping(res.preview.mapping);
      setSample(res.preview.sampleProducts);
      setTotalRows(res.preview.totalRows);

      if (res.preview.source === "generic_csv") {
        setStep("mapping");
      } else {
        setStep("review");
        void refreshPreview(res.preview.mapping, DEFAULT_OPTIONS);
      }
    } catch {
      toast.error("Fisierul nu a putut fi incarcat. Poate fi prea mare sau conexiunea a cazut. Incearca din nou.");
    } finally {
      setUploading(false);
    }
  }

  // ── Preview / validation refresh ────────────────────────────────────────────
  async function refreshPreview(m: ColumnMapping, o: ImportOptions) {
    if (!importIdRef.current) return;
    setPreviewLoading(true);
    try {
      const res = await previewMapping(importIdRef.current, m, o);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setSample(res.sample);
      setSummary(res.summary);
    } catch {
      toast.error("Nu am putut genera previzualizarea. Incearca din nou.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function updateMapping(field: string, header: string) {
    const next = { ...mapping, [field]: header || undefined } as ColumnMapping;
    setMapping(next);
  }

  function updateOption<K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) {
    const next = { ...options, [key]: value };
    setOptions(next);
    if (step === "review") void refreshPreview(mapping, next);
  }

  function goToReview() {
    setStep("review");
    void refreshPreview(mapping, options);
  }

  // ── Run ──────────────────────────────────────────────────────────────────────
  async function beginImport() {
    if (!importIdRef.current) return;
    setBusy(true);
    try {
      const res = await startImport(importIdRef.current, mapping, options);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      cancelledRef.current = false;
      setTotals({ ...EMPTY_TOTALS, total: summary?.valid ?? totalRows });
      setStatus("importing");
      setStep("progress");
      void runLoop();
    } catch {
      toast.error("Nu am putut porni importul. Incearca din nou.");
    } finally {
      setBusy(false);
    }
  }

  async function runLoop() {
    if (loopRef.current || !importIdRef.current) return;
    loopRef.current = true;
    try {
      while (!cancelledRef.current) {
        let res: Awaited<ReturnType<typeof processImportChunk>>;
        try {
          res = await processImportChunk(importIdRef.current);
        } catch {
          toast.error("Eroare la procesarea importului. Reincarca pagina pentru status.");
          setStatus("failed");
          setStep("done");
          break;
        }
        if ("error" in res) {
          toast.error(res.error);
          setStatus("failed");
          setStep("done");
          break;
        }
        setStatus(res.status);
        setTotals(res.totals);
        if (res.done) {
          setStep("done");
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    } finally {
      loopRef.current = false;
    }
  }

  async function handleCancel() {
    if (!importIdRef.current) return;
    cancelledRef.current = true;
    try {
      await cancelImport(importIdRef.current);
      toast.success("Import anulat");
    } catch {
      toast.error("Nu am putut anula importul.");
    }
    router.push("/dashboard/products");
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push("/dashboard/products")}
          className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Inapoi"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Importa produse</h1>
          <p className="text-sm text-muted-foreground">Din Shopify, WooCommerce sau orice fisier CSV</p>
        </div>
      </div>

      <Stepper step={step} />

      {step === "upload" && (
        <UploadStep
          dragging={dragging}
          uploading={uploading}
          fileInputRef={fileInputRef}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
          onPick={(f) => void handleFile(f)}
        />
      )}

      {step === "mapping" && (
        <MappingStep
          headers={headers}
          mapping={mapping}
          onChange={updateMapping}
          onBack={() => setStep("upload")}
          onNext={goToReview}
        />
      )}

      {step === "review" && (
        <ReviewStep
          source={source}
          fileName={fileName}
          options={options}
          onOption={updateOption}
          summary={summary}
          sample={sample}
          loading={previewLoading}
          busy={busy}
          productLimit={productLimit}
          productCount={productCount}
          plan={plan}
          onBack={() => setStep(source === "generic_csv" ? "mapping" : "upload")}
          onStart={beginImport}
        />
      )}

      {step === "progress" && <ProgressStep status={status} totals={totals} onCancel={handleCancel} />}

      {step === "done" && (
        <DoneStep
          totals={totals}
          status={status}
          importId={importIdRef.current}
          onViewProducts={() => router.push("/dashboard/products")}
        />
      )}
    </div>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────────
function Stepper({ step }: { step: Step }) {
  const order: Step[] = ["upload", "mapping", "review", "progress"];
  const labels: Record<string, string> = { upload: "Incarca", mapping: "Potriveste", review: "Verifica", progress: "Importa" };
  const activeIdx = order.indexOf(step === "done" ? "progress" : step);
  return (
    <div className="flex items-center gap-2 mb-6">
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
            i <= activeIdx ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}>
            <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px]", i <= activeIdx ? "bg-primary text-white" : "bg-border text-muted-foreground")}>{i + 1}</span>
            {labels[s]}
          </div>
          {i < order.length - 1 && <div className="w-4 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

// ── Upload step ─────────────────────────────────────────────────────────────────
function UploadStep({ dragging, uploading, fileInputRef, onDragOver, onDragLeave, onDrop, onPick }: {
  dragging: boolean;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPick: (file: File) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SourceCard
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/import_icons/shopify.svg" alt="Shopify" className="h-8 w-auto object-contain" />
          }
          title="Shopify" desc="Admin → Products → Export → CSV" />
        <SourceCard
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/import_icons/woocommerce.svg" alt="WooCommerce" className="h-8 w-auto object-contain" />
          }
          title="WooCommerce" desc="Products → Export → Genereaza CSV" />
        <SourceCard icon={<FileSpreadsheet className="h-7 w-7 text-muted-foreground" />} title="Alt magazin" desc="Orice CSV cu produse" />
      </div>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Se citeste fisierul...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Trage fisierul CSV aici sau apasa pentru a alege</p>
              <p className="text-xs text-muted-foreground mt-1">Recunoastem automat formatul Shopify si WooCommerce. Maximum 8MB.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <span className="text-xs text-muted-foreground">Nu ai un fisier? Descarca un sablon:</span>
        <TemplateButton label="Generic" onClick={() => downloadTemplate(IMPORT_TEMPLATES.generic)} />
        <TemplateButton label="Shopify" onClick={() => downloadTemplate(IMPORT_TEMPLATES.shopify)} />
        <TemplateButton label="WooCommerce" onClick={() => downloadTemplate(IMPORT_TEMPLATES.woo)} />
      </div>
    </div>
  );
}

function SourceCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-surface">
      <div className="h-8 flex items-center mb-3">{icon}</div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </div>
  );
}

function TemplateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
    >
      <Download className="h-3 w-3" />
      {label}
    </button>
  );
}

function downloadTemplate(t: { filename: string; csv: string }) {
  // Prepend a UTF-8 BOM so Excel opens Romanian diacritics correctly.
  const blob = new Blob(["﻿" + t.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = t.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Mapping step ────────────────────────────────────────────────────────────────
function MappingStep({ headers, mapping, onChange, onBack, onNext }: {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (field: string, header: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const missingRequired = OUR_FIELDS.filter((f) => f.required && !mapping[f.key]);
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/50">
          <p className="text-sm font-medium text-foreground">Potriveste coloanele din fisierul tau cu campurile Edinio</p>
        </div>
        <div className="divide-y divide-border">
          {OUR_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground">{f.label}</span>
                {f.required && <span className="text-red-500 ml-1">*</span>}
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
              <select
                value={mapping[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={cn(
                  "w-56 px-3 py-2 text-sm border rounded-xl bg-muted/40 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors",
                  f.required && !mapping[f.key] ? "border-red-300" : "border-border",
                )}
              >
                <option value="">— ignora —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" /> Inapoi
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={missingRequired.length > 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continua <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {missingRequired.length > 0 && (
        <p className="text-xs text-amber-600 text-right">Potriveste campurile obligatorii: {missingRequired.map((f) => f.label).join(", ")}</p>
      )}
    </div>
  );
}

// ── Review step ─────────────────────────────────────────────────────────────────
function ReviewStep({ source, fileName, options, onOption, summary, sample, loading, busy, productLimit, productCount, plan, onBack, onStart }: {
  source: ImportSource;
  fileName: string;
  options: ImportOptions;
  onOption: <K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) => void;
  summary: ValidationSummary | null;
  sample: StagedProduct[];
  loading: boolean;
  busy: boolean;
  productLimit: number;
  productCount: number;
  plan: string;
  onBack: () => void;
  onStart: () => void;
}) {
  const importable = productLimit === Infinity ? (summary?.valid ?? 0) : Math.max(0, Math.min(summary?.valid ?? 0, productLimit - productCount));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileSpreadsheet className="h-4 w-4" />
        <span className="font-medium text-foreground">{fileName}</span>
        <span className="px-2 py-0.5 bg-muted rounded-full text-xs">{SOURCE_LABELS[source]}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Produse" value={summary ? summary.total : "—"} />
        <Stat label="Valide" value={summary ? summary.valid : "—"} tone="green" />
        <Stat label="Cu probleme" value={summary ? summary.errors.length : "—"} tone={summary && summary.errors.length ? "red" : undefined} />
        <Stat label="Categorii noi" value={summary ? summary.newCategories.length : "—"} />
      </div>

      {/* Options */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
        <Toggle checked={options.default_active} onChange={(v) => onOption("default_active", v)} label="Seteaza produsele ca active (vizibile in magazin)" />
        <Toggle checked={options.import_images} onChange={(v) => onOption("import_images", v)} label="Descarca si gazduieste imaginile pe Edinio" hint="Recomandat. Altfel pastram linkurile externe." />
        <Toggle checked={options.collapse_variants} onChange={(v) => onOption("collapse_variants", v)} label="Grupeaza variantele (marime, culoare) intr-un singur produs" />
        <Toggle checked={options.overwrite_existing} onChange={(v) => onOption("overwrite_existing", v)} label="Actualizeaza produsele importate anterior (in loc sa le dublezi)" />
      </div>

      {/* Warnings */}
      {summary && summary.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 space-y-1">
          {summary.warnings.slice(0, 4).map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{w.name !== "Limita de plan" && w.row_index >= 0 ? `${w.name}: ${w.message}` : w.message}</span>
            </div>
          ))}
          {summary.warnings.length > 4 && <p className="text-xs">si inca {summary.warnings.length - 4} avertismente...</p>}
        </div>
      )}

      {/* Sample preview */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/50 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Previzualizare</p>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border">
          {sample.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nimic de previzualizat</p>}
          {sample.map((p, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.images[0] ? <img src={p.images[0].src} alt="" className="w-full h-full object-cover" /> : <Package className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{p.name || <span className="text-red-500">(fara nume)</span>}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.category_path.join(" › ") || "Fara categorie"}
                  {p.variants && p.variants.combinations.length > 0 ? ` · ${p.variants.combinations.length} variante` : ""}
                  {p.images.length ? ` · ${p.images.length} imagini` : ""}
                </p>
              </div>
              <span className="text-sm font-medium text-foreground whitespace-nowrap">{formatPrice(p.price)}</span>
            </div>
          ))}
        </div>
      </div>

      {productLimit !== Infinity && (summary?.valid ?? 0) + productCount > productLimit && (
        <p className="text-xs text-amber-600">
          Planul {plan} permite {productLimit} produse. Vor fi importate primele {importable}; restul vor fi sarite.
        </p>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" /> Inapoi
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={busy || loading || !summary || summary.valid === 0}
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importa {summary ? `${importable} produse` : ""}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "green" | "red" }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-3 text-center">
      <p className={cn("text-2xl font-semibold", tone === "green" ? "text-green-600" : tone === "red" ? "text-red-600" : "text-foreground")}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("mt-0.5 w-9 h-5 rounded-full transition-colors flex-shrink-0 relative", checked ? "bg-primary" : "bg-border")}
      >
        <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <div>
        <span className="text-sm text-foreground">{label}</span>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </label>
  );
}

// ── Progress step ──────────────────────────────────────────────────────────────
function ProgressStep({ status, totals, onCancel }: { status: ImportStatus; totals: ImportTotals; onCancel: () => void }) {
  const committed = totals.created + totals.updated + totals.skipped + totals.failed;
  const isImages = status === "rehosting_images";
  const pct = isImages
    ? totals.images_total > 0 ? Math.round((totals.images_done / totals.images_total) * 100) : 100
    : totals.total > 0 ? Math.round((committed / totals.total) * 100) : 0;

  return (
    <div className="bg-surface border border-border rounded-2xl p-8 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
      <p className="text-sm font-semibold text-foreground mb-1">
        {isImages ? "Se descarca imaginile..." : "Se importa produsele..."}
      </p>
      <p className="text-xs text-muted-foreground mb-5">Poti lasa aceasta fila deschisa. Importul continua si daca o inchizi.</p>

      <div className="max-w-md mx-auto">
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {isImages
            ? `${totals.images_done} / ${totals.images_total} imagini`
            : `${committed} / ${totals.total} produse`}
        </p>
      </div>

      <button type="button" onClick={onCancel} className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
        <X className="h-4 w-4" /> Anuleaza
      </button>
    </div>
  );
}

// ── Done step ──────────────────────────────────────────────────────────────────
function DoneStep({ totals, status, importId, onViewProducts }: { totals: ImportTotals; status: ImportStatus; importId: string | null; onViewProducts: () => void }) {
  const hasIssues = totals.failed > 0 || totals.skipped > 0;
  const imported = totals.created + totals.updated;
  return (
    <div className="bg-surface border border-border rounded-2xl p-8 text-center">
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4", hasIssues ? "bg-amber-100" : "bg-green-100")}>
        {hasIssues ? <AlertTriangle className="h-7 w-7 text-amber-600" /> : <CheckCircle2 className="h-7 w-7 text-green-600" />}
      </div>
      <p className="text-base font-semibold text-foreground mb-1">
        {status === "failed" ? "Importul a esuat" : `${imported} produse importate`}
      </p>
      <p className="text-sm text-muted-foreground mb-5">
        {totals.created} create · {totals.updated} actualizate · {totals.skipped} sarite · {totals.failed} esuate
      </p>

      <div className="flex items-center justify-center gap-2">
        {hasIssues && importId && (
          <a
            href={`/api/imports/${importId}/error-report`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" /> Descarca raportul de erori
          </a>
        )}
        <button type="button" onClick={onViewProducts} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors">
          Vezi produsele <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
