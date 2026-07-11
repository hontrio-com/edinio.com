import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Brevo calls this on the account-level marketing "unsubscribed" event we registered.
// Payload is JSON: `{ "event": "unsubscribed", "email": "..." , ... }`. The per-store
// secret in the query string identifies the business (Brevo does not sign webhooks).
// We always answer 200 so Brevo never retry-storms us.

function ok() { return NextResponse.json({ ok: true }); }

type Admin = ReturnType<typeof createAdminClient>;

async function resolveBusinessId(admin: Admin, secret: string): Promise<string | null> {
  const { data } = await admin
    .from("store_settings")
    .select("business_id")
    .eq("brevo_config->>webhook_secret" as never, secret)
    .limit(1);
  const row = (data?.[0] as { business_id: string } | undefined) ?? undefined;
  return row?.business_id ?? null;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!secret) return ok();

  const admin = createAdminClient();
  const businessId = await resolveBusinessId(admin, secret);
  if (!businessId) return ok();

  // Brevo sends JSON; fall back to urlencoded just in case.
  const raw = await req.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    try {
      const params = new URLSearchParams(raw);
      params.forEach((v, k) => { payload[k] = v; });
    } catch { /* ignore */ }
  }

  const event = String(payload["event"] ?? "").toLowerCase();
  const email = String(payload["email"] ?? "").trim().toLowerCase();
  if (!email) return ok();

  if (event.includes("unsubscrib")) {
    // Record the suppression so we never re-add this contact (survives list changes).
    await admin
      .from("brevo_suppressions")
      .upsert({ business_id: businessId, email, reason: event || "unsubscribed" }, { onConflict: "business_id,email" });
  }
  return ok();
}

export async function POST(req: NextRequest) {
  try { return await handle(req); } catch { return ok(); }
}

// Brevo may validate the endpoint with a GET.
export async function GET() { return ok(); }
