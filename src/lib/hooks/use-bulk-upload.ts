"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { inferVideoType, validateVideoFile } from "@/lib/pages/video-config";

/**
 * Reusable bulk-upload engine for images + videos.
 *
 * Why this exists: the Media Library (and pickers) used to upload files one at a
 * time in a bare `for` loop with only a spinner — no progress, no per-file status,
 * and no ceiling on how many files a user could fire off at once (selecting a huge
 * folder would freeze the tab compressing in a tight loop and spawn unbounded
 * requests). This hook adds:
 *   - a hard batch cap (default 100) so volume can't blow up the tab or storage;
 *   - client-side validation that rejects bad files up front (so they never waste
 *     a request) with a human reason;
 *   - a concurrency-limited queue (default 3 — image compression is Canvas-heavy,
 *     so running hundreds in parallel would OOM the tab);
 *   - per-file status + an aggregate progress percentage;
 *   - a `beforeunload` guard so the user is warned before navigating away mid-run.
 *
 * Files already uploaded are safe even if the page is closed: each upload registers
 * itself in the library server-side on success; only still-pending items are lost.
 */

export const DEFAULT_MAX_BATCH = 100;
const DEFAULT_CONCURRENCY = 3;
// Generous source-size guard for images: the API enforces the real 10MB limit on
// the COMPRESSED result, and compression (max 1600px, WebP) almost always lands
// well under 1MB — so we only reject absurd originals that could OOM the canvas.
const IMAGE_MAX_SOURCE_BYTES = 40 * 1024 * 1024;

const VIDEO_EXTS = ["mp4", "m4v", "webm", "mov", "qt"];
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "bmp", "svg"];

export type UploadStatus = "pending" | "uploading" | "done" | "error" | "skipped";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  kind: "image" | "video";
  status: UploadStatus;
  percent: number;
  error?: string;
  /** Public URL, set once the upload succeeds. */
  url?: string;
}

export interface BulkUploadSummary {
  /** Items actually queued for upload (excludes those skipped up front). */
  total: number;
  done: number;
  failed: number;
  skipped: number;
  /** 0–100 across the queue; settled items (done OR error) count as complete. */
  overallPercent: number;
  active: boolean;
}

export interface UseBulkUploadOptions {
  maxBatch?: number;
  concurrency?: number;
  /** R2 bucket for images (videos use their own presigned path). */
  imageBucket?: string;
  /** Restrict accepted kinds; mismatched files are skipped with a reason. Default "all". */
  accept?: "image" | "video" | "all";
  /** Fired once after every item settles (whether the run had failures or not). */
  onComplete?: (summary: { done: number; failed: number; skipped: number; urls: string[] }) => void;
}

function classify(file: File): "image" | "video" | null {
  const t = file.type;
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  // Some phones report an empty MIME type (notably .mov / .heic) — fall back to ext.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (IMAGE_EXTS.includes(ext)) return "image";
  return null;
}

/** Validate a file before it ever costs a request. Returns an error reason or null. */
function validate(
  file: File,
  kind: "image" | "video" | null,
  accept: "image" | "video" | "all",
): string | null {
  if (!kind) return "Tip de fisier neacceptat (doar imagini si video).";
  if (accept === "image" && kind === "video") return "Aici se accepta doar imagini.";
  if (accept === "video" && kind === "image") return "Aici se accepta doar videoclipuri.";
  if (file.size === 0) return "Fisierul pare gol.";
  if (kind === "video") {
    return validateVideoFile({ type: inferVideoType(file.name, file.type), size: file.size });
  }
  if (file.size > IMAGE_MAX_SOURCE_BYTES) return "Imagine prea mare (max 40MB).";
  return null;
}

export function useBulkUpload(options: UseBulkUploadOptions = {}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [active, setActive] = useState(false);

  // Canonical store the async workers read/write so concurrent updates never clobber
  // each other (React state alone would race across the parallel workers).
  const itemsRef = useRef<UploadItem[]>([]);
  const cancelRef = useRef(false);
  const runningRef = useRef(false);
  const optionsRef = useRef(options);
  // Keep the latest options in a ref (read inside the async run / event handlers).
  // Synced in an effect, not during render, per react-hooks/refs.
  useEffect(() => { optionsRef.current = options; });

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    const next = itemsRef.current.map((it) => (it.id === id ? { ...it, ...patch } : it));
    itemsRef.current = next;
    setItems(next);
  }, []);

  const start = useCallback(async (files: FileList | File[]) => {
    if (runningRef.current) return;
    const all = Array.from(files);
    if (all.length === 0) return;

    const maxBatch = optionsRef.current.maxBatch ?? DEFAULT_MAX_BATCH;
    const concurrency = optionsRef.current.concurrency ?? DEFAULT_CONCURRENCY;
    const imageBucket = optionsRef.current.imageBucket ?? "gallery";
    const accept = optionsRef.current.accept ?? "all";

    // Volume protection: take only the first `maxBatch` files; warn about the rest.
    const overLimit = Math.max(0, all.length - maxBatch);
    const slice = all.slice(0, maxBatch);

    const fileById = new Map<string, File>();
    const built: UploadItem[] = slice.map((file, idx) => {
      const kind = classify(file);
      const error = validate(file, kind, accept);
      const id = `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;
      fileById.set(id, file);
      return {
        id,
        name: file.name || "fisier",
        size: file.size,
        kind: kind ?? "image",
        status: error ? "skipped" : "pending",
        percent: 0,
        error: error ?? undefined,
      };
    });

    itemsRef.current = built;
    setItems(built);

    if (overLimit > 0) {
      toast.warning(`Am luat primele ${maxBatch} fisiere; restul (${overLimit}) au fost ignorate.`);
    }

    const queue = built.filter((it) => it.status === "pending");
    if (queue.length === 0) {
      const skipped = built.length;
      optionsRef.current.onComplete?.({ done: 0, failed: 0, skipped, urls: [] });
      return;
    }

    cancelRef.current = false;
    runningRef.current = true;
    setActive(true);

    // Lazy-load the uploader (and its Canvas/compression deps) only when needed.
    const { uploadImage, uploadVideo } = await import("@/lib/upload");

    const worker = async (item: UploadItem) => {
      if (cancelRef.current) {
        update(item.id, { status: "skipped", error: "Anulat." });
        return;
      }
      update(item.id, { status: "uploading", percent: item.kind === "video" ? 0 : 5 });
      const file = fileById.get(item.id)!;
      try {
        const res =
          item.kind === "video"
            ? await uploadVideo(file, (p) => update(item.id, { percent: p }))
            : await uploadImage(file, imageBucket);
        if ("url" in res) update(item.id, { status: "done", percent: 100, url: res.url });
        else update(item.id, { status: "error", error: res.error, percent: 0 });
      } catch {
        update(item.id, { status: "error", error: "Incarcarea a esuat.", percent: 0 });
      }
    };

    let cursor = 0;
    const runNext = async (): Promise<void> => {
      while (cursor < queue.length) {
        if (cancelRef.current) {
          // Drain the rest of the queue as cancelled so the UI settles cleanly.
          for (let i = cursor; i < queue.length; i++) {
            const it = itemsRef.current.find((x) => x.id === queue[i].id);
            if (it && it.status === "pending") update(it.id, { status: "skipped", error: "Anulat." });
          }
          cursor = queue.length;
          return;
        }
        const item = queue[cursor++];
        await worker(item);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, () => runNext()),
    );

    runningRef.current = false;
    setActive(false);

    let done = 0, failed = 0, skipped = 0;
    const urls: string[] = [];
    for (const it of itemsRef.current) {
      if (it.status === "done") { done++; if (it.url) urls.push(it.url); }
      else if (it.status === "error") failed++;
      else if (it.status === "skipped") skipped++;
    }
    optionsRef.current.onComplete?.({ done, failed, skipped, urls });
  }, [update]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const reset = useCallback(() => {
    if (runningRef.current) return;
    itemsRef.current = [];
    setItems([]);
  }, []);

  // Warn before leaving while a run is in flight — pending items would be lost
  // (completed ones are already saved server-side).
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  const summary = useMemo<BulkUploadSummary>(() => {
    let done = 0, failed = 0, skipped = 0, queued = 0, pctSum = 0;
    for (const it of items) {
      if (it.status === "skipped") { skipped++; continue; }
      queued++;
      if (it.status === "done" || it.status === "error") {
        pctSum += 100; // settled — counts as complete for the bar
        if (it.status === "done") done++; else failed++;
      } else if (it.status === "uploading") {
        pctSum += it.percent;
      }
      // pending contributes 0
    }
    return {
      total: queued,
      done,
      failed,
      skipped,
      overallPercent: queued === 0 ? 0 : Math.round(pctSum / queued),
      active,
    };
  }, [items, active]);

  return { items, summary, active, start, cancel, reset };
}
