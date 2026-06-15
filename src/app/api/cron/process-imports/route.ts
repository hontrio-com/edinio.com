import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processImport } from "@/lib/import/committer";
import { deleteFromR2, r2KeyFromUrl } from "@/lib/r2";

// Fallback worker: finishes imports whose client loop stopped (tab closed/crashed).
// To avoid racing an active client loop, we only pick up jobs that have gone
// stale (updated_at older than the threshold); a live loop keeps updated_at fresh.

export const maxDuration = 60;

const STALE_MS = 2 * 60 * 1000;
const MAX_JOBS = 5;
const MAX_TICKS = 8;
const TERMINAL = ["completed", "completed_with_errors", "failed", "cancelled"];

function verifyCron(req: NextRequest): boolean {
  return req.headers.get("authorization")?.replace("Bearer ", "") === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

  const { data: jobs } = await admin
    .from("product_imports")
    .select("id")
    .in("status", ["importing", "rehosting_images"])
    .lt("updated_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS);

  let ticks = 0;
  for (const job of jobs ?? []) {
    for (let i = 0; i < MAX_TICKS; i++) {
      const r = await processImport(admin, job.id);
      ticks++;
      if (r.done || (r.status !== "importing" && r.status !== "rehosting_images")) break;
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
