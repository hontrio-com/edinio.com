"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, X, Loader2, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Users,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ACCEPT_ATTRIBUTE } from "@/lib/import/tabular-formats";
import type { CustomerFeedMapping } from "@/lib/import/customers/types";
import {
  analyzeCustomerFile,
  commitCustomerImport,
  previewCustomerImport,
  type CustomerFileInfo,
  type CustomerImportPreview,
  type CustomerImportResult,
} from "@/lib/actions/customer-import.actions";

/**
 * Importul de clienti, in trei pasi: fisier, coloane, previzualizare.
 *
 * Fisierul RAMANE in browser si se trimite la fiecare pas. Asa nu e nevoie nici de
 * un tabel de stare, nici de fisiere pastrate care sa fie curatate mai tarziu.
 *
 * Nimic nu se scrie pana la butonul din ultimul pas, la fel ca la feedul de
 * stocuri: omul vede intai cati clienti intra si cati se contopesc.
 */

/** Campurile pe care le poate lega omul, in ordinea in care conteaza. */
const FIELDS: { key: keyof CustomerFeedMapping; label: string; hint?: string }[] = [
  { key: "name", label: "Nume complet" },
  { key: "firstName", label: "Prenume", hint: "daca numele vine pe doua coloane" },
  { key: "lastName", label: "Nume de familie" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefon" },
  { key: "address", label: "Adresa" },
  { key: "city", label: "Oras" },
  { key: "county", label: "Judet" },
  { key: "postcode", label: "Cod postal" },
  { key: "externalId", label: "Id din vechea platforma" },
];

type Step =
  | { at: "file" }
  | { at: "map"; info: CustomerFileInfo; mapping: CustomerFeedMapping }
  | { at: "preview"; info: CustomerFileInfo; mapping: CustomerFeedMapping; preview: CustomerImportPreview }
  | { at: "done"; result: CustomerImportResult };

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", tone ?? "text-foreground")}>{value}</p>
    </div>
  );
}

export function CustomerImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ at: "file" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Fisierul se tine aici, ca sa poata fi retrimis la fiecare pas. */
  const fileRef = useRef<File | null>(null);

  function body(mapping?: CustomerFeedMapping): FormData | null {
    if (!fileRef.current) return null;
    const fd = new FormData();
    fd.set("file", fileRef.current);
    if (mapping) fd.set("mapping", JSON.stringify(mapping));
    return fd;
  }

  async function onPick(file: File) {
    fileRef.current = file;
    setError(null);
    setBusy(true);
    const fd = body();
    const res = fd ? await analyzeCustomerFile(fd) : { error: "Niciun fisier" };
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    setStep({ at: "map", info: res, mapping: res.mapping });
  }

  async function toPreview() {
    if (step.at !== "map") return;
    setError(null);
    setBusy(true);
    const fd = body(step.mapping);
    const res = fd ? await previewCustomerImport(fd) : { error: "Niciun fisier" };
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    setStep({ at: "preview", info: step.info, mapping: step.mapping, preview: res });
  }

  async function commit() {
    if (step.at !== "preview") return;
    setError(null);
    setBusy(true);
    const fd = body(step.mapping);
    const res = fd ? await commitCustomerImport(fd) : { error: "Niciun fisier" };
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    setStep({ at: "done", result: res });
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full sm:max-w-2xl bg-background border border-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-shrink-0">
          <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Users className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-foreground">Importa clienti</h2>
            <p className="text-xs text-muted-foreground">
              {step.at === "file" && "Fisier CSV sau XLSX din vechea platforma"}
              {step.at === "map" && `${step.info.fileName} · ${step.info.totalRows} randuri`}
              {step.at === "preview" && "Verifica ce se va intampla"}
              {step.at === "done" && "Gata"}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-40"
            aria-label="Inchide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Pasul 1: fisierul ── */}
          {step.at === "file" && (
            <label className="block border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
              <input
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); }}
              />
              {busy ? (
                <Loader2 className="h-7 w-7 mx-auto text-primary animate-spin" />
              ) : (
                <Upload className="h-7 w-7 mx-auto text-muted-foreground" />
              )}
              <p className="mt-3 text-sm font-medium text-foreground">
                {busy ? "Citesc fisierul..." : "Alege fisierul"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Are nevoie de o coloana cu telefon sau email. Restul sunt opționale.
              </p>
            </label>
          )}

          {/* ── Pasul 2: coloanele ── */}
          {step.at === "map" && (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      {f.label}
                      {f.hint && <span className="text-muted-foreground font-normal"> · {f.hint}</span>}
                    </label>
                    <select
                      value={step.mapping[f.key] ?? ""}
                      onChange={(e) => setStep({
                        ...step,
                        mapping: { ...step.mapping, [f.key]: e.target.value || undefined },
                      })}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">Nefolosita</option>
                      {step.info.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {!step.mapping.email && !step.mapping.phone && (
                <p className="text-xs text-warning flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Alege cel putin emailul sau telefonul: fara ele clientul nu poate fi identificat.
                </p>
              )}

              <div className="border border-border rounded-xl overflow-hidden">
                <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">
                  Primele randuri din fisier
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {step.info.headers.map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {step.info.sampleRows.map((r, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          {step.info.headers.map((h) => (
                            <td key={h} className="px-2 py-1.5 text-foreground whitespace-nowrap max-w-[180px] truncate">{r[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── Pasul 3: ce se va intampla ── */}
          {step.at === "preview" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Clienti noi" value={step.preview.summary.newCustomers} tone="text-primary" />
                <Stat label="Fise completate" value={step.preview.summary.enriched} />
                <Stat label="Randuri unite" value={step.preview.summary.merged_duplicate} />
                <Stat label="Sarite" value={step.preview.summary.no_key} tone={step.preview.summary.no_key > 0 ? "text-warning" : undefined} />
              </div>

              {step.preview.summary.willMergeWithOrders > 0 && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-3">
                  <strong className="text-foreground">{step.preview.summary.willMergeWithOrders}</strong> dintre ei
                  au deja comenzi in magazin. Nu vor apărea de doua ori: importul se lipeste de fisa lor.
                </p>
              )}

              {(step.preview.summary.oddPhones > 0 || step.preview.summary.oddEmails > 0) && (
                <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-xl p-3">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    {step.preview.summary.oddPhones > 0 && (
                      <>
                        <strong>{step.preview.summary.oddPhones}</strong> au telefon care nu arata ca un singur numar.
                        Intra oricum, dar nu se vor lega singuri de comenzile viitoare.{" "}
                      </>
                    )}
                    {step.preview.summary.oddEmails > 0 && (
                      <><strong>{step.preview.summary.oddEmails}</strong> au email fara „@”.</>
                    )}
                  </span>
                </div>
              )}

              {step.preview.sampleNew.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">
                    Primii clienti care intra
                  </p>
                  <ul className="divide-y divide-border/50">
                    {step.preview.sampleNew.map((c, i) => (
                      <li key={i} className="px-3 py-2 text-xs flex items-center gap-2">
                        <span className="font-medium text-foreground truncate flex-1">{c.name || "(fara nume)"}</span>
                        <span className="text-muted-foreground truncate">{c.phone ?? c.email}</span>
                        {c.city && <span className="text-muted-foreground/70 hidden sm:inline">{c.city}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {step.preview.sampleIssues.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">
                    Primele probleme
                  </p>
                  <ul className="divide-y divide-border/50">
                    {step.preview.sampleIssues.map((iss, i) => (
                      <li key={i} className="px-3 py-2 text-xs">
                        <span className="text-muted-foreground">Rand {iss.rowIndex}</span>{" "}
                        <span className="text-foreground font-medium">{iss.label}</span>
                        <span className="text-muted-foreground"> · {iss.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ── Gata ── */}
          {step.at === "done" && (
            <div className="text-center py-6">
              <CheckCircle2 className="h-10 w-10 mx-auto text-success" />
              <p className="mt-3 text-base font-bold text-foreground">
                {step.result.inserted} {step.result.inserted === 1 ? "client adaugat" : "clienti adaugati"}
              </p>
              {step.result.enriched > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {step.result.enriched} fise existente completate
                </p>
              )}
              {step.result.skipped > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {step.result.skipped} randuri sarite, fara telefon si fara email
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-2 flex-shrink-0">
          {step.at === "map" && (
            <button
              onClick={() => setStep({ at: "file" })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Alt fisier
            </button>
          )}
          {step.at === "preview" && (
            <button
              onClick={() => setStep({ at: "map", info: step.info, mapping: step.mapping })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Schimba coloanele
            </button>
          )}
          <div className="flex-1" />

          {step.at === "map" && (
            <button
              onClick={() => void toPreview()}
              disabled={busy || (!step.mapping.email && !step.mapping.phone)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Vezi ce se schimba <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {step.at === "preview" && (
            <button
              onClick={() => void commit()}
              disabled={busy || step.preview.summary.newCustomers + step.preview.summary.enriched === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Importa {step.preview.summary.newCustomers} clienti
            </button>
          )}
          {(step.at === "file" || step.at === "done") && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-muted text-foreground hover:bg-muted/70"
            >
              {step.at === "done" ? "Gata" : "Anuleaza"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
