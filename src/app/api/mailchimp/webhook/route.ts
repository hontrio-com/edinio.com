import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Mailchimp calls this on audience events (we register it for unsubscribe/cleaned/
// subscribe). Payload is form-encoded: `type=unsubscribe&data[email]=...&data[list_id]=...`.
// The per-store secret in the query string identifies the business (Mailchimp does
// not sign webhooks). We always answer 200 so Mailchimp never retry-storms us.

function ok() { return NextResponse.json({ ok: true }); }

type Admin = ReturnType<typeof createAdminClient>;

async function resolveBusinessId(admin: Admin, secret: string): Promise<string | null> {
  const { data } = await admin
    .from("store_settings")
    .select("business_id")
    .eq("mailchimp_config->>webhook_secret" as never, secret)
    .limit(1);
  const row = (data?.[0] as { business_id: string } | undefined) ?? undefined;
  return row?.business_id ?? null;
}

async function parseBody(req: NextRequest): Promise<Record<string, string>> {
  try {
    const fd = await req.formData();
    const o: Record<string, string> = {};
    fd.forEach((v, k) => { o[k] = typeof v === "string" ? v : ""; });
    return o;
  } catch {
    try {
      const params = new URLSearchParams(await req.text());
      const o: Record<string, string> = {};
      params.forEach((v, k) => { o[k] = v; });
      return o;
    } catch { return {}; }
  }
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!secret) return ok();

  const admin = createAdminClient();
  const businessId = await resolveBusinessId(admin, secret);
  if (!businessId) return ok();

  const payload = await parseBody(req);
  const type = (payload["type"] || "").toLowerCase();
  const email = (payload["data[email]"] || "").trim().toLowerCase();
  if (!email) return ok();

  if (type === "unsubscribe" || type === "cleaned") {
    // Record the suppression so we never re-add this contact (survives audience changes).
    await admin
      .from("mailchimp_suppressions")
      .upsert({ business_id: businessId, email, reason: payload["data[reason]"] || type }, { onConflict: "business_id,email" });
  } else if (type === "subscribe") {
    // They opted back in — lift any suppression.
    await admin.from("mailchimp_suppressions").delete().eq("business_id", businessId).eq("email", email);
  }
  return ok();
}

export async function POST(req: NextRequest) {
  try { return await handle(req); } catch { return ok(); }
}

// Mailchimp validates the endpoint with a GET when the webhook is created.
export async function GET() { return ok(); }
