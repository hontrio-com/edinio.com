"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Loader2, Pencil, Play, Plus, Trash2, X,
} from "lucide-react";
import {
  deleteStockFeedSource, listStockFeedSources, probeStockFeedUrl,
  runStockFeedSourceNow, saveStockFeedSource, setStockFeedSourceEnabled,
  type ProbeResult,
} from "@/lib/actions/stock-feed-sources.actions";
import type { FeedFrequency, StockFeedSource } from "@/lib/import/stock-feed/sources";
import {
  DEFAULT_STOCK_OPTIONS, MATCH_KEY_LABELS,
  type StockFeedMapping, type StockFeedOptions, type StockMatchKey,
} from "@/lib/import/stock-feed/types";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * Sursele citite automat de la o adresa.
 *
 * Coloanele nu se pot alege pe ghicite: intai se citeste adresa o data
 * ("Verifica adresa"), abia apoi apar antetele reale. Altfel omul ar salva o
 * potrivire pe niste nume de coloane inchipuite, iar greseala s-ar vedea peste
 * o zi, cand cronul scrie in catalog.
 */

const CARD = "rounded-xl border border-border bg-card";
const MATCH_KEYS: StockMatchKey[] = [
  "sku_auto", "sku", "variant_sku", "product_id", "external_id", "gtin",
];

interface Draft {
  id?: string;
  name: string;
  url: string;
  mapping: StockFeedMapping;
  options: StockFeedOptions;
  frequency: FeedFrequency;
  run_hour: number;
}

function emptyDraft(): Draft {
  return {
    name: "",
    url: "",
    mapping: {},
    options: DEFAULT_STOCK_OPTIONS,
    frequency: "daily",
    run_hour: 4,
  };
}

/**
 * Datele initiale vin de la server, nu dintr-un efect.
 *
 * Asa nu mai exista preluare la montare, deci nici spinner, nici o randare goala
 * inainte de continut. E si singura varianta pe care o accepta regula
 * `react-hooks/set-state-in-effect`, care taie orice `setState` pornit din efect.
 */
export function StockFeedSources({
  initialSources,
  initialError,
}: {
  initialSources: StockFeedSource[];
  initialError: string | null;
}) {
  const [sources, setSources] = useState<StockFeedSource[]>(initialSources);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Reincarcare dupa o modificare. Pornita mereu dintr-un gest al omului, deci
     nu incalca regula de mai sus. */
  const load = useCallback(async () => {
    const res = await listStockFeedSources();
    if ("error" in res) {
      setLoadError(res.error);
      setSources([]);
    } else {
      setLoadError(null);
      setSources(res);
    }
  }, []);

  async function checkUrl() {
    if (!draft) return;
    setProbing(true);
    try {
      const res = await probeStockFeedUrl(draft.url);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setProbe(res);
      /* Coloanele ghicite intra ca punct de plecare, doar daca omul n-a ales deja. */
      setDraft((d) => (d ? { ...d, mapping: d.mapping.identifier ? d.mapping : res.mapping } : d));
      toast.success(`Adresa raspunde: ${res.totalRows} randuri`);
    } finally {
      setProbing(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await saveStockFeedSource(draft);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Sursa a fost salvata");
      setDraft(null);
      setProbe(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function runNow(source: StockFeedSource) {
    setBusyId(source.id);
    try {
      const res = await runStockFeedSourceNow(source.id);
      if ("error" in res) toast.error(res.error);
      else if (res.unfinished) toast.success("Pornit. Restul se termina singur, in fundal.");
      else toast.success("Gata");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(source: StockFeedSource) {
    setBusyId(source.id);
    try {
      const res = await setStockFeedSourceEnabled(source.id, !source.enabled);
      if ("error" in res) toast.error(res.error);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(source: StockFeedSource) {
    setBusyId(source.id);
    try {
      const res = await deleteStockFeedSource(source.id);
      if ("error" in res) toast.error(res.error);
      else toast.success("Sursa a fost stearsa");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loadError) {
    return (
      <div className={cn(CARD, "flex items-start gap-2.5 p-5")}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-xs">
          <p className="font-semibold text-foreground">Sincronizarea automata nu e pregatita</p>
          <p className="mt-1 text-muted-foreground">{loadError}</p>
          <p className="mt-1 text-muted-foreground">
            Incarcarea manuala de fisier functioneaza normal, in cealalta filă.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sources.length === 0 && !draft && (
        <div className={cn(CARD, "p-6 text-center")}>
          <p className="text-sm font-semibold text-foreground">Nicio sursa salvata</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Salveaza adresa unui fisier de la furnizor si il citim noi, automat, dupa
            programul pe care il alegi.
          </p>
        </div>
      )}

      {sources.map((source) => (
        <div key={source.id} className={cn(CARD, "p-4")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {source.name || "Fara nume"}
                {!source.enabled && (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    oprita
                  </span>
                )}
              </p>
              <p className="mt-0.5 break-all text-[11px] text-muted-foreground">{source.url}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {source.frequency === "hourly"
                  ? "In fiecare ora"
                  : `Zilnic, la ora ${String(source.run_hour).padStart(2, "0")}:00 UTC`}
                {" · "}
                {MATCH_KEY_LABELS[source.options.match_key ?? "sku_auto"]}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <IconButton title="Ruleaza acum" busy={busyId === source.id} onClick={() => runNow(source)}>
                <Play className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                title="Modifica"
                onClick={() => {
                  setProbe(null);
                  setDraft({
                    id: source.id,
                    name: source.name,
                    url: source.url,
                    mapping: source.mapping ?? {},
                    options: { ...DEFAULT_STOCK_OPTIONS, ...(source.options ?? {}) },
                    frequency: source.frequency,
                    run_hour: source.run_hour,
                  });
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton title={source.enabled ? "Opreste" : "Porneste"} onClick={() => toggle(source)}>
                <span className="text-[10px] font-bold">{source.enabled ? "II" : "▶"}</span>
              </IconButton>
              <IconButton title="Sterge" onClick={() => remove(source)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </IconButton>
            </div>
          </div>

          {source.last_run_at && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[11px]">
              {source.last_status === "ok" ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <CheckCircle2 className="h-3 w-3" /> Ultima rulare reusita
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Ultima rulare a eșuat
                </span>
              )}
              <span className="text-muted-foreground">{formatDate(source.last_run_at)}</span>
              {source.last_totals && (
                <span className="text-muted-foreground">
                  {source.last_totals.written} actualizate
                  {source.last_totals.not_found > 0 && `, ${source.last_totals.not_found} negasite`}
                </span>
              )}
              {source.last_error && <span className="text-destructive">{source.last_error}</span>}
              {source.last_import_id && (
                <a href={`/api/imports/${source.last_import_id}/error-report`} className="text-primary hover:underline">
                  Raport
                </a>
              )}
            </div>
          )}
        </div>
      ))}

      {!draft && (
        <button
          type="button"
          onClick={() => { setDraft(emptyDraft()); setProbe(null); }}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Adauga o sursa
        </button>
      )}

      {draft && (
        <div className={cn(CARD, "space-y-4 p-5")}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {draft.id ? "Modifica sursa" : "Sursa noua"}
            </h3>
            <button type="button" onClick={() => { setDraft(null); setProbe(null); }} aria-label="Renunta"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nume">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Furnizor principal"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </Field>
            <Field label="Adresa fisierului (CSV sau Excel)" required>
              <input
                value={draft.url}
                onChange={(e) => { setDraft({ ...draft, url: e.target.value }); setProbe(null); }}
                placeholder="https://furnizor.ro/stoc.csv"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </Field>
          </div>

          <button
            type="button"
            disabled={probing || !draft.url}
            onClick={checkUrl}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-50"
          >
            {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Verifica adresa
          </button>

          {!probe && (
            <p className="text-[11px] text-muted-foreground">
              Verifica adresa ca sa putem citi antetele. Fara asta nu poti alege coloanele.
            </p>
          )}

          {probe && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Identificator" required>
                  <Select
                    value={draft.mapping.identifier}
                    options={probe.headers}
                    onChange={(v) => setDraft({ ...draft, mapping: { ...draft.mapping, identifier: v } })}
                  />
                </Field>
                <Field label="Stoc">
                  <Select
                    value={draft.mapping.stock}
                    options={probe.headers}
                    onChange={(v) => setDraft({ ...draft, mapping: { ...draft.mapping, stock: v } })}
                  />
                </Field>
                <Field label="Pret">
                  <Select
                    value={draft.mapping.price}
                    options={probe.headers}
                    onChange={(v) => setDraft({ ...draft, mapping: { ...draft.mapping, price: v } })}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Potrivire dupa">
                  <select
                    value={draft.options.match_key}
                    onChange={(e) => setDraft({ ...draft, options: { ...draft.options, match_key: e.target.value as StockMatchKey } })}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    {MATCH_KEYS.map((k) => <option key={k} value={k}>{MATCH_KEY_LABELS[k]}</option>)}
                  </select>
                </Field>
                <Field label="Cat de des">
                  <select
                    value={draft.frequency}
                    onChange={(e) => setDraft({ ...draft, frequency: e.target.value as FeedFrequency })}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    <option value="daily">Zilnic</option>
                    <option value="hourly">In fiecare ora</option>
                  </select>
                </Field>
                {draft.frequency === "daily" && (
                  <Field label="La ora (UTC)">
                    <select
                      value={draft.run_hour}
                      onChange={(e) => setDraft({ ...draft, run_hour: Number(e.target.value) })}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  checked={draft.options.update_price}
                  onChange={(e) => setDraft({ ...draft, options: { ...draft.options, update_price: e.target.checked } })}
                  className="mt-0.5"
                />
                <span className="text-xs">
                  <span className="font-semibold text-foreground">Actualizeaza si preturile</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Se va intampla automat, fara sa mai confirmi de fiecare data. Preturile
                    ajung mai departe la Google si la marketplace-uri.
                  </span>
                </span>
              </label>
            </>
          )}

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setDraft(null); setProbe(null); }}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium">
              Renunta
            </button>
            <button
              type="button"
              disabled={saving || !probe || !draft.mapping.identifier}
              onClick={save}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salveaza
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Select({
  value, options, onChange,
}: { value: string | undefined; options: string[]; onChange: (v: string | undefined) => void }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
    >
      <option value="">Nefolosita</option>
      {options.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

function IconButton({
  children, title, onClick, busy,
}: { children: React.ReactNode; title: string; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={busy}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}
