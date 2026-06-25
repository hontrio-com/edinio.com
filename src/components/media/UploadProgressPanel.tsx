"use client";

import {
  Loader2, AlertTriangle, Check, X, Film, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UploadItem, BulkUploadSummary } from "@/lib/hooks/use-bulk-upload";

/**
 * Shared progress UI for the bulk-upload engine (`useBulkUpload`): an aggregate
 * bar plus a scrollable per-file list with status + reason. Used by both the
 * Media Library page and the in-form MediaPicker.
 */
export function UploadProgressPanel({
  items, summary, onCancel, onClose,
}: {
  items: UploadItem[];
  summary: BulkUploadSummary;
  onCancel: () => void;
  onClose: () => void;
}) {
  const { active, total, done, failed, skipped, overallPercent } = summary;

  return (
    <div className="rounded-xl border border-border bg-background p-3 sm:p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {active
            ? <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            : failed > 0
              ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              : <Check className="h-4 w-4 text-green-600 shrink-0" />}
          <p className="text-sm font-semibold text-foreground truncate">
            {active
              ? `Se incarca… ${done}/${total}`
              : `Incarcare finalizata · ${done} reusite${failed > 0 ? `, ${failed} esuate` : ""}${skipped > 0 ? `, ${skipped} ignorate` : ""}`}
          </p>
        </div>
        <button type="button" onClick={active ? onCancel : onClose}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent shrink-0">
          <X className="h-3.5 w-3.5" /> {active ? "Anuleaza" : "Inchide"}
        </button>
      </div>

      {/* Overall bar */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-200" style={{ width: `${overallPercent}%` }} />
      </div>

      {active && (
        <p className="mt-2 text-xs text-muted-foreground">
          Nu inchide pagina pana nu se termina incarcarea.
        </p>
      )}

      {/* Per-file list */}
      <ul className="mt-3 max-h-44 overflow-y-auto space-y-1 pr-1">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 text-xs">
            <span className="shrink-0">
              {it.status === "done" ? <Check className="h-3.5 w-3.5 text-green-600" />
                : it.status === "uploading" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                : it.status === "error" ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                : it.status === "skipped" ? <X className="h-3.5 w-3.5 text-muted-foreground" />
                : <span className="block h-3.5 w-3.5 rounded-full border border-border" />}
            </span>
            {it.kind === "video"
              ? <Film className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span className="truncate text-foreground flex-1 min-w-0" title={it.name}>{it.name}</span>
            <span
              title={it.error ?? undefined}
              className={cn(
                "shrink-0 max-w-[45%] truncate text-right tabular-nums",
                it.status === "error" ? "text-red-500" : it.status === "skipped" ? "text-amber-600" : "text-muted-foreground",
              )}>
              {it.status === "uploading" && it.kind === "video" ? `${it.percent}%`
                : it.status === "uploading" ? "se incarca…"
                : it.status === "done" ? "gata"
                : it.status === "error" ? (it.error ?? "eroare")
                : it.status === "skipped" ? (it.error ?? "ignorat")
                : "in asteptare"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
