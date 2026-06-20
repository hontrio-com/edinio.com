"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Upload, Search, Trash2, X, Loader2, RefreshCw, CheckSquare, Square,
  Image as ImageIcon, Film, Copy, Check, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  listMedia, getMediaUsage, updateMediaMeta, deleteMedia, backfillMediaLibrary,
  type MediaRow, type UsageMap,
} from "@/lib/actions/media.actions";

const FOLDER_LABELS: Record<string, string> = {
  products: "Produse", logos: "Logo", covers: "Coperta",
  gallery: "Galerie", avatars: "Avatare", pages: "Pagini", other: "Altele",
};

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type TypeFilter = "all" | "image" | "video";
type UsageFilter = "all" | "used" | "unused";

export function MediaLibraryClient() {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [usage, setUsage] = useState<UsageMap>({});
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<MediaRow | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<MediaRow[] | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const [m, u] = await Promise.all([listMedia(), getMediaUsage()]);
    if ("rows" in m) setRows(m.rows); else toast.error(m.error);
    if ("usage" in u) setUsage(u.usage);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const folders = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.folder) s.add(r.folder);
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (folderFilter !== "all" && r.folder !== folderFilter) return false;
      const used = (usage[r.url]?.length ?? 0) > 0;
      if (usageFilter === "used" && !used) return false;
      if (usageFilter === "unused" && used) return false;
      if (q) {
        const hay = [r.file_name, r.title, r.alt_text, r.description, ...(r.tags ?? [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, typeFilter, folderFilter, usageFilter, usage]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((r) => r.id)));
  }

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    const { uploadImage, uploadVideo } = await import("@/lib/upload");
    let ok = 0;
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const res = isVideo ? await uploadVideo(file) : await uploadImage(file, "gallery");
      if ("url" in res) ok += 1; else toast.error(res.error);
    }
    setUploading(false);
    if (ok > 0) { toast.success(`${ok} fisier(e) incarcate.`); await load(); }
  }

  async function rescan() {
    setRescanning(true);
    const res = await backfillMediaLibrary();
    setRescanning(false);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(res.added > 0 ? `${res.added} fisier(e) adaugate.` : "Biblioteca este la zi.");
    await load();
  }

  function requestDelete(targets: MediaRow[]) {
    if (targets.length === 0) return;
    setDeleteTargets(targets);
  }

  async function confirmDelete() {
    if (!deleteTargets) return;
    const ids = deleteTargets.map((r) => r.id);
    const res = await deleteMedia(ids);
    setDeleteTargets(null);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(`${res.deleted} fisier(e) sterse.`);
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    setSelectionMode(false);
    if (active && ids.includes(active.id)) setActive(null);
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Biblioteca Media</h1>
          <p className="text-sm text-muted-foreground">
            Toate imaginile si videoclipurile magazinului tau, intr-un singur loc.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={rescan} disabled={rescanning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50">
            <RefreshCw className={cn("h-4 w-4", rescanning && "animate-spin")} />
            Re-scaneaza
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Incarca
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cauta dupa nume, titlu, text alternativ..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
          <option value="all">Toate tipurile</option>
          <option value="image">Imagini</option>
          <option value="video">Videoclipuri</option>
        </select>
        <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
          <option value="all">Toate sursele</option>
          {folders.map((f) => <option key={f} value={f}>{FOLDER_LABELS[f] ?? f}</option>)}
        </select>
        <select value={usageFilter} onChange={(e) => setUsageFilter(e.target.value as UsageFilter)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
          <option value="all">Folosite si nefolosite</option>
          <option value="used">Doar folosite</option>
          <option value="unused">Doar nefolosite</option>
        </select>
        <button onClick={() => { setSelectionMode((s) => !s); setSelected(new Set()); }}
          className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
            selectionMode ? "border-primary text-primary bg-primary/5" : "border-border text-foreground hover:bg-accent")}>
          <CheckSquare className="h-4 w-4" />
          Selecteaza
        </button>
      </div>

      {/* Bulk action bar */}
      {selectionMode && (
        <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg bg-accent/50 border border-border">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">{selected.size} selectate</span>
            <button onClick={selectAllFiltered} className="text-primary hover:underline">Selecteaza tot ({filtered.length})</button>
            {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:underline">Deselecteaza</button>}
          </div>
          <button onClick={() => requestDelete(selectedRows)} disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-40">
            <Trash2 className="h-4 w-4" /> Sterge
          </button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24">
          <ImageIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0 ? "Nu ai niciun fisier media inca. Incarca primul fisier." : "Niciun rezultat pentru filtrele alese."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {filtered.map((r) => {
            const isSel = selected.has(r.id);
            const used = usage[r.url]?.length ?? 0;
            return (
              <button key={r.id} type="button"
                onClick={() => selectionMode ? toggleSelect(r.id) : setActive(r)}
                className={cn("relative aspect-square rounded-xl overflow-hidden border bg-muted/30 group text-left",
                  isSel ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40")}>
                {r.type === "video" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <Film className="h-7 w-7 text-white/80" />
                  </div>
                ) : (
                  <Image src={r.url} alt={r.alt_text ?? r.file_name ?? ""} fill
                    sizes="(max-width: 640px) 33vw, 120px" className="object-contain p-1" />
                )}
                {selectionMode && (
                  <div className="absolute top-1.5 left-1.5">
                    {isSel ? <CheckSquare className="h-5 w-5 text-primary fill-background" /> : <Square className="h-5 w-5 text-white drop-shadow" />}
                  </div>
                )}
                {used > 0 && (
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-semibold rounded">
                    Folosit
                  </div>
                )}
                {r.type === "video" && (
                  <div className="absolute top-1 right-1 px-1 py-0.5 bg-black/60 text-white text-[8px] font-bold rounded">VIDEO</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      {active && (
        <MediaDrawer
          row={active}
          usage={usage[active.url] ?? []}
          onClose={() => setActive(null)}
          onSaved={(updated) => { setRows((p) => p.map((r) => r.id === updated.id ? updated : r)); setActive(updated); }}
          onDelete={() => requestDelete([active])}
        />
      )}

      {/* Delete confirmation */}
      {deleteTargets && (
        <DeleteDialog
          targets={deleteTargets}
          usage={usage}
          onCancel={() => setDeleteTargets(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

/* ─── Detail drawer ──────────────────────────────────────────────────────────── */

function MediaDrawer({
  row, usage, onClose, onSaved, onDelete,
}: {
  row: MediaRow;
  usage: { label: string }[];
  onClose: () => void;
  onSaved: (r: MediaRow) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(row.title ?? "");
  const [alt, setAlt] = useState(row.alt_text ?? "");
  const [caption, setCaption] = useState(row.caption ?? "");
  const [description, setDescription] = useState(row.description ?? "");
  const [tags, setTags] = useState((row.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save() {
    setSaving(true);
    const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const res = await updateMediaMeta(row.id, {
      title, alt_text: alt, caption, description, tags: tagArr,
    });
    setSaving(false);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Salvat.");
    onSaved({ ...row, title, alt_text: alt, caption, description, tags: tagArr });
  }

  function copyUrl() {
    navigator.clipboard.writeText(row.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-background border-l border-border w-full max-w-md h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
          <h3 className="text-sm font-bold">Detalii fisier</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Preview */}
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border bg-muted/30">
            {row.type === "video"
              ? <video src={row.url} controls className="w-full h-full object-contain bg-black" />
              : <Image src={row.url} alt={row.alt_text ?? ""} fill sizes="400px" className="object-contain" />}
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="truncate"><span className="font-medium text-foreground">Nume:</span> {row.file_name ?? "—"}</div>
            <div><span className="font-medium text-foreground">Tip:</span> {row.type === "video" ? "Video" : "Imagine"}</div>
            <div><span className="font-medium text-foreground">Marime:</span> {formatBytes(row.size_bytes)}</div>
            <div><span className="font-medium text-foreground">Dimensiuni:</span> {row.width && row.height ? `${row.width}×${row.height}` : "—"}</div>
            <div><span className="font-medium text-foreground">Sursa:</span> {FOLDER_LABELS[row.folder ?? "other"] ?? row.folder}</div>
            <div><span className="font-medium text-foreground">Adaugat:</span> {new Date(row.created_at).toLocaleDateString("ro-RO")}</div>
          </div>

          <button onClick={copyUrl} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copiaza URL
          </button>

          {/* Usage */}
          {usage.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Folosit in {usage.length} loc(uri):</p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
                {usage.map((u, i) => <li key={i}>{u.label}</li>)}
              </ul>
            </div>
          )}

          {/* SEO metadata */}
          <div className="space-y-3">
            <Field label="Titlu" value={title} onChange={setTitle} placeholder="Titlu fisier" />
            <Field label="Text alternativ (alt)" value={alt} onChange={setAlt} placeholder="Descrie imaginea pentru SEO si accesibilitate" />
            <Field label="Text asociat (caption)" value={caption} onChange={setCaption} placeholder="Legenda afisata sub imagine" />
            <div>
              <label className="text-xs font-semibold text-foreground">Descriere</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                placeholder="Descriere detaliata (SEO)"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <Field label="Etichete (separate prin virgula)" value={tags} onChange={setTags} placeholder="ex: vara, reducere, nou" />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={save} disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salveaza
            </button>
            <button onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/20">
              <Trash2 className="h-4 w-4" /> Sterge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </div>
  );
}

/* ─── Delete confirmation dialog ─────────────────────────────────────────────── */

function DeleteDialog({
  targets, usage, onCancel, onConfirm,
}: {
  targets: MediaRow[];
  usage: UsageMap;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const usedRefs = targets.flatMap((t) => usage[t.url] ?? []);
  const usedCount = targets.filter((t) => (usage[t.url]?.length ?? 0) > 0).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">
                Stergi {targets.length} fisier(e)?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Fisierele vor fi sterse definitiv din biblioteca si din stocare.
              </p>
              {usedCount > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Atentie: {usedCount} dintre ele sunt inca folosite. Stergerea le va afisa rupt acolo:
                  </p>
                  <ul className="mt-1 text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside max-h-32 overflow-y-auto">
                    {usedRefs.slice(0, 12).map((u, i) => <li key={i}>{u.label}</li>)}
                    {usedRefs.length > 12 && <li>… si inca {usedRefs.length - 12}</li>}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5">
            <button onClick={onCancel} className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent">Anuleaza</button>
            <button onClick={() => { setBusy(true); onConfirm(); }} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sterge definitiv
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
