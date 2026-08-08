import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { processImport } from "@/lib/import/committer";
import { logError } from "@/lib/error-logger";
import { deleteFromR2, r2KeyFromUrl } from "@/lib/r2";

// Fallback worker: finishes imports whose client loop stopped (tab closed/crashed).
// To avoid racing an active client loop, we only pick up jobs that have gone
// stale (updated_at older than the threshold); a live loop keeps updated_at fresh.

export const maxDuration = 60;

const STALE_MS = 2 * 60 * 1000;
const MAX_JOBS = 5;
const MAX_TICKS = 8;
const TERMINAL = ["completed", "completed_with_errors", "failed", "cancelled"];

/**
 * Sursele pe care acest cron are voie sa le duca la capat.
 *
 * Lista PERMISA, nu lista interzisa, si asta conteaza. `product_imports` tine si
 * joburi care nu importa produse, de exemplu feedul de stocuri, iar randurile
 * lor din `product_import_rows` au cu totul alta forma. Selectat doar dupa
 * status, cronul ar da un job de stoc pe mana committer-ului de produse, care ar
 * incerca sa CREEZE produse din el.
 *
 * Cu o lista permisa, orice tip de job adaugat maine e ignorat pana cand cineva
 * il trece aici in mod explicit. Cu o lista interzisa, ar fi fost procesat gresit
 * din prima zi.
 */
const PRODUCT_SOURCES = ["shopify_csv", "woo_csv", "generic_csv"];

function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

  const { data: jobs } = await admin
    .from("product_imports")
    .select("id")
    .in("source", PRODUCT_SOURCES)
    .in("status", ["importing", "rehosting_images"])
    .lt("updated_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS);

  let ticks = 0;
  for (const job of jobs ?? []) {
    /*
     * Un job care arunca nu mai omoara toata rularea.
     *
     * `commitChunk` poate arunca pe drept: `loadSlugs` e o citire care TREBUIE sa
     * fie completa (cu set partial, `dedupeSlug` intoarce slug-uri deja existente
     * si TOATE insert-urile pica pe unicitate — incident 25.07), la fel cautarea
     * produselor existente. Dar pana acum exceptia iesea din bucla, iar celelalte
     * joburi din lot nu mai erau atinse deloc — un import stricat oprea importurile
     * altor comercianti, tacut, la fiecare minut.
     *
     * Jobul ramane `importing`: la ridicarea urmatoare se reia de unde a ramas.
     */
    try {
      for (let i = 0; i < MAX_TICKS; i++) {
        const r = await processImport(admin, job.id);
        ticks++;
        if (r.done || (r.status !== "importing" && r.status !== "rehosting_images")) break;
      }
    } catch (e) {
      await logError({
        action: "process-imports",
        message: e instanceof Error ? e.message : "tick de import esuat",
        details: { importId: job.id },
        severity: "critical",
      });
    }
    // Clean up the raw CSV once the job has reached a terminal state.
    const { data: fresh } = await admin.from("product_imports").select("status, file_url").eq("id", job.id).single();
    if (fresh && TERMINAL.includes(fresh.status) && fresh.file_url) {
      const key = r2KeyFromUrl(fresh.file_url);
      if (key) deleteFromR2(key).catch(() => {});
      await admin.from("product_imports").update({ file_url: null }).eq("id", job.id);
    }
  }

  return NextResponse.json({ ok: true, jobs: jobs?.length ?? 0, ticks });
}
