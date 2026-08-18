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
  DEFAULT_STOCK_OPTIONS, MATCH_KEY_LABELS, MAX_FAILURES as MAX_ESECURI,
  type StockFeedMapping, type StockFeedOptions, type StockMatchKey,
} from "@/lib/import/stock-feed/types";
import { cn } from "@/lib/utils/cn";
import { rezumatCifre, verdictRulare } from "@/lib/import/stock-feed/verdict";

/**
 * Sursele citite automat de la o adresa.
 *
 * Coloanele nu se pot alege pe ghicite: intai se citeste adresa o data
 * ("Verifica adresa"), abia apoi apar antetele reale. Altfel omul ar salva o
 * potrivire pe niste nume de coloane inchipuite, iar greseala s-ar vedea peste
 * o zi, cand cronul scrie in catalog.
 */

/** Data SI ora. La un feed orar, data singura nu spune nimic. */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

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
  /* Eroarea probei nu mai traieste doar intr-un toast de 1,8 secunde: dupa ce
     acesta disparea, ecranul arata exact ca inainte de apasare, deci omul nu mai
     avea ce citi si nu stia daca a apasat sau nu. */
  const [probeError, setProbeError] = useState<string | null>(null);
  /** Coloanele sursei, asa cum erau la deschiderea formularului. Vezi mai jos. */
  const [coloaneInitiale, setColoaneInitiale] = useState<string[]>([]);

  /* Reincarcare dupa o modificare. Pornita mereu dintr-un gest al omului, deci
     nu incalca regula de mai sus. */
  const load = useCallback(async () => {
    const res = await listStockFeedSources();
    if ("error" in res) {
      /*
       * Lista de pe ecran NU se goleste.
       *
       * Inainte, orice eroare trecatoare la reincarcare (o pierdere de retea
       * dupa o stergere) inlocuia tot panoul cu un mesaj si stergea lista
       * impreuna cu butonul „Adauga o sursa" — fara nimic de apasat ca sa
       * reincerci. Sursele afisate raman cele stiute, iar eroarea pleaca intr-un
       * toast cu viata lunga: e o cadere trecatoare a REINCARCARII, nu o stare a
       * sursei, deci n-are ce ancora permanenta sa primeasca pe ecran.
       */
      toast.error(res.error, { duration: 8000 });
      return;
    }
    setLoadError(null);
    setSources(res);
  }, []);

  async function checkUrl() {
    if (!draft) return;
    setProbing(true);
    setProbeError(null);
    try {
      const res = await probeStockFeedUrl(draft.url);
      if ("error" in res) {
        setProbeError(res.error);
        toast.error(res.error, { duration: 8000 });
        return;
      }
      setProbe(res);

      setDraft((d) => {
        if (!d) return d;
        /*
         * Coloanele alese raman DOAR daca mai exista in antetul nou.
         *
         * Cu o adresa schimbata, o alegere veche care nu se mai regaseste in
         * lista lasa `<select>` gol, dar `draft.mapping.identifier` ramanea
         * adevarat — deci butonul Salveaza era activ, iar sursa se salva cu o
         * coloana pe care fisierul nu o are. Feedul rula apoi zilnic fara sa
         * potriveasca nimic.
         */
        const pastreaza = (col: string | undefined) =>
          col && res.headers.includes(col) ? col : undefined;
        const ramas = {
          identifier: pastreaza(d.mapping.identifier),
          stock: pastreaza(d.mapping.stock),
          price: pastreaza(d.mapping.price),
        };
        return {
          ...d,
          mapping: ramas.identifier ? ramas : res.mapping,
          /*
           * Coloana de identificator arata a cod de bare: se muta si cheia,
           * altfel fiecare rand ar iesi „negasit".
           *
           * DOAR daca omul n-a ales inca nimic anume. Sugestia calca altfel
           * peste o alegere facuta dinadins: cineva care pusese „SKU varianta"
           * si reverifica adresa se trezea mutat inapoi pe cod de bare, tacut.
           */
          options:
            res.suggestedMatchKey && d.options.match_key === DEFAULT_STOCK_OPTIONS.match_key
              ? { ...d.options, match_key: res.suggestedMatchKey }
              : d.options,
        };
      });

      const sarite = res.skippedBeforeHeader
        ? ` (am sarit ${res.skippedBeforeHeader} randuri de dinaintea antetului)`
        : "";
      toast.success(`Adresa raspunde: ${res.totalRows} randuri${sarite}`);
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
    /* Un singur clic pe o iconita stergea sursa, fara confirmare si fara
       revenire: potrivirea coloanelor si programul se pierdeau pe loc. */
    if (!window.confirm(`Stergi sursa „${source.name || source.url}"? Actiunea nu se poate anula.`)) {
      return;
    }
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

  /*
   * Coloanele pe care le poate alege omul: cele proaspat citite, sau — cand
   * adresa nu raspunde — cele deja salvate pe sursa. A doua varianta exista ca o
   * sursa cu adresa picata sa ramana reglabila (nume, program, ora, pornit/oprit)
   * in loc sa se blocheze cu totul.
   */
  const areColoaneSalvate = Boolean(draft?.id) && coloaneInitiale.length > 0;
  /*
   * `coloaneInitiale` se ingheata cand se deschide formularul, NU se recalculeaza
   * din `draft`: derivate din starea vie, o coloana golita din greseala disparea
   * pe loc din lista si nu mai putea fi pusa la loc fara o noua verificare a
   * adresei — care, daca adresa e picata, nu se poate face deloc.
   */
  const coloaneDisponibile = probe?.headers ?? coloaneInitiale;

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
                  /* Oprita de noi dupa prea multe esecuri arata altfel decat una
                     pusa pe pauza de om: pana acum era aceeasi pastila gri, si
                     comerciantul nu avea de unde sti ca platforma renuntase. */
                  <span
                    className={cn(
                      "ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      source.consecutive_failures >= MAX_ESECURI
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {source.consecutive_failures >= MAX_ESECURI
                      ? `oprita automat dupa ${source.consecutive_failures} esecuri`
                      : "oprita"}
                  </span>
                )}
              </p>
              <p className="mt-0.5 break-all text-[11px] text-muted-foreground">{source.url}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {source.frequency === "hourly"
                  ? "In fiecare ora"
                  : `Zilnic, dupa ora ${String(source.run_hour).padStart(2, "0")}:00 UTC`}
                {!source.last_run_at && source.enabled && (
                  /* O sursa noua nu spunea niciodata cand porneste prima data,
                     iar comerciantul astepta fara sa stie ce asteapta. */
                  <span className="ml-1 text-primary">· inca n-a rulat, porneste la urmatoarea tura</span>
                )}
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
                  setProbeError(null);
                  setColoaneInitiale(
                    [source.mapping?.identifier, source.mapping?.stock, source.mapping?.price]
                      .filter((c): c is string => Boolean(c)),
                  );
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

          {source.last_run_at && <UltimaRulare source={source} />}
        </div>
      ))}

      {!draft && (
        <button
          type="button"
          onClick={() => { setDraft(emptyDraft()); setProbe(null); setProbeError(null); setColoaneInitiale([]); }}
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
            <button type="button" onClick={() => { setDraft(null); setProbe(null); setProbeError(null); }} aria-label="Renunta"
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
                onChange={(e) => { setDraft({ ...draft, url: e.target.value }); setProbe(null); setProbeError(null); }}
                placeholder="https://furnizor.ro/stoc.csv"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </Field>
          </div>

          {/* Fara randurile astea, singurul indiciu era un exemplu din placeholder.
              Cele doua greseli pe care le face toata lumea sunt linkul paginii de
              descarcare in locul fisierului, si un fisier care cere autentificare. */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">Ce fel de adresa merge</p>
            <ul className="mt-1.5 space-y-1">
              <li>
                Trebuie sa fie linkul <strong>direct catre fisier</strong>, cel care
                porneste descarcarea, nu linkul paginii pe care se afla fisierul.
              </li>
              <li>
                Fisierul trebuie sa fie <strong>public</strong>. Daca furnizorul iti da un
                utilizator si o parola, pune-le in adresa:{" "}
                <code>https://utilizator:parola@furnizor.ro/stoc.csv</code>.
              </li>
              <li>
                Adresa incepe cu <strong>https://</strong>. Adresele <code>http://</code> nu
                se accepta.
              </li>
              <li>
                Merge si un <strong>Google Sheets</strong> publicat: Fisier → Distribuie →
                Publica pe web → CSV.
              </li>
            </ul>
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

          {probeError && (
            /* Ramane pe ecran pana la urmatoarea incercare. Toastul de 1,8
               secunde disparea si lasa ecranul exact ca inainte de apasare. */
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Adresa nu a putut fi citita</p>
                <p className="mt-0.5 text-muted-foreground">{probeError}</p>
              </div>
            </div>
          )}

          {!probe && !areColoaneSalvate && (
            <p className="text-[11px] text-muted-foreground">
              Verifica adresa ca sa putem citi antetele. Fara asta nu poti alege coloanele.
            </p>
          )}

          {!probe && areColoaneSalvate && (
            /* Sursa salvata se poate regla si cand adresa e picata: pana acum tot
               blocul statea in spatele unei verificari reusite, deci un feed cu
               adresa moarta nu mai putea fi nici redenumit, nici oprit din
               program, nici mutat pe alta ora. */
            <p className="text-[11px] text-muted-foreground">
              Coloanele de mai jos sunt cele salvate. Ca sa le schimbi, verifica intai adresa.
            </p>
          )}

          {probe && probe.sampleRows.length > 0 && (
            /*
             * `sampleRows` se calcula pe server si se trimitea in browser de la
             * bun inceput, dar nu le folosea nimeni. Fara ele, „Adresa raspunde:
             * 221 randuri" era tot ce vedea omul — si arata la fel si cand cele
             * 221 de randuri erau, de fapt, o pagina de eroare.
             */
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/50">
                  <tr>
                    {probe.headers.slice(0, 6).map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {probe.sampleRows.slice(0, 3).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {probe.headers.slice(0, 6).map((h) => (
                        <td key={h} className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                Primele randuri din fisier. Daca nu arata a produse, adresa nu duce la
                fisierul bun.
              </p>
            </div>
          )}

          {(probe || areColoaneSalvate) && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Identificator" required>
                  <Select
                    value={draft.mapping.identifier}
                    options={coloaneDisponibile}
                    onChange={(v) => setDraft({ ...draft, mapping: { ...draft.mapping, identifier: v } })}
                  />
                </Field>
                {/* Serverul refuza salvarea fara ea (afara de cazul in care se
                    actualizeaza preturi), deci steluta trebuie sa se vada. */}
                <Field label="Stoc" required={!draft.options.update_price}>
                  <Select
                    value={draft.mapping.stock}
                    options={coloaneDisponibile}
                    onChange={(v) => setDraft({ ...draft, mapping: { ...draft.mapping, stock: v } })}
                  />
                </Field>
                <Field label="Pret">
                  <Select
                    value={draft.mapping.price}
                    options={coloaneDisponibile}
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
            <button type="button" onClick={() => { setDraft(null); setProbe(null); setProbeError(null); }}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium">
              Renunta
            </button>
            <button
              type="button"
              disabled={saving || !draft.mapping.identifier || (!probe && !areColoaneSalvate)}
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

/**
 * Verdictul ultimei rulari, citit din CIFRE, nu doar din `last_status`.
 *
 * Trei minciuni traiau in randul asta:
 *  - o rulare in care NICIUN rand nu s-a potrivit iesea „reusita": `last_status`
 *    e „ok" (adresa chiar s-a citit), iar singurele cifre afisate erau `written`
 *    si `not_found`, amandoua 0 cand tot fisierul a fost respins;
 *  - o rulare NETERMINATA arata la fel cu una dusa la capat;
 *  - problemele altele decat „negasit" (ambiguu, dezactivat, invalid, duplicat)
 *    nu se vedeau deloc, desi tocmai ele explica un feed care „nu face nimic".
 */
function UltimaRulare({ source }: { source: StockFeedSource }) {
  const t = source.last_totals;
  /* Verdictul se calculeaza in `verdict.ts`, pur si probat. Aici doar se
     imbraca: regula a fost deja gresita o data pe date adevarate, si acolo poate
     fi tinuta sub probe. */
  const v = verdictRulare(t, source.last_status);
  const rezumat = rezumatCifre(t);

  const TONURI = {
    rau: { clasa: "text-destructive", pictograma: AlertTriangle },
    atentie: { clasa: "text-warning", pictograma: AlertTriangle },
    bun: { clasa: "text-primary", pictograma: CheckCircle2 },
  } as const;
  const imbracaminte = v.fel === "in_curs"
    ? { clasa: "text-warning", pictograma: Loader2 }
    : TONURI[v.ton];
  const Pictograma = imbracaminte.pictograma;

  return (
    <div className="mt-3 space-y-1 border-t border-border pt-2.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("inline-flex items-center gap-1", imbracaminte.clasa)}>
          <Pictograma className="h-3 w-3" /> {v.text}
        </span>
        {/* Cu ora, nu doar data: la un feed orar, „18.08.2026" nu spune nimic. */}
        <span className="text-muted-foreground">{source.last_run_at ? formatDateTime(source.last_run_at) : ""}</span>
        {rezumat && <span className="text-muted-foreground">{rezumat}</span>}
        {source.last_error && <span className="text-destructive">{source.last_error}</span>}
        {source.last_import_id && source.last_status !== "error" && (
          /* Dupa un esec, `last_import_id` ramane (e manerul cu care se anuleaza
             jobul vechi), dar raportul lui descrie alta rulare. Nu se arata. */
          <a href={`/api/imports/${source.last_import_id}/error-report`} className="text-primary hover:underline">
            Raport
          </a>
        )}
      </div>

      {t && v.probleme > 0 && (
        <p className="text-muted-foreground">
          {[
            t.not_found > 0 && `${t.not_found} coduri din fisier fara produs in magazin`,
            t.ambiguous > 0 && `${t.ambiguous} ambigue`,
            t.ignored > 0 && `${t.ignored} fara efect in magazin`,
            t.invalid > 0 && `${t.invalid} cu valori gresite`,
            t.duplicate > 0 && `${t.duplicate} duplicate`,
          ]
            .filter(Boolean)
            .join(" · ")}
          {v.negasiteSuntNormale
            ? " — normal la un feed de furnizor, care acopera tot catalogul lui, nu doar ce vinzi tu."
            : source.last_import_id
              ? " — vezi raportul pentru randurile exacte."
              : ""}
        </p>
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
