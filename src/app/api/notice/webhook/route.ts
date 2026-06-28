import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeNoticePhone } from "@/lib/notice";

export const dynamic = "force-dynamic";

// notice.ro calls this endpoint for INBOUND events: delivery reports (DLR) for the
// SMS/WhatsApp we sent, customer replies, and voice callbacks. The merchant pastes
// the URL (with their per-store ?secret=...) into notice.ro → "Integrare API".
//
// The payload shape is undocumented (the Postman collection is a skeleton), so we
// parse defensively across JSON / form-encoded bodies and tolerate many field names.

const DELIVERY_KEYWORDS = ["deliver", "fail", "sent", "undeliv", "expire", "reject", "dlr", "accept", "read", "queued", "sending"];

function ok() {
  return NextResponse.json({ ok: true });
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    const s = str(v);
    if (s) return s;
  }
  return "";
}

async function parseBody(req: NextRequest): Promise<Record<string, unknown>> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const j = await req.json();
      return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
    }
    if (ct.includes("form-data") || ct.includes("x-www-form-urlencoded")) {
      const fd = await req.formData();
      const o: Record<string, unknown> = {};
      fd.forEach((v, k) => { o[k] = typeof v === "string" ? v : ""; });
      return o;
    }
    // Unknown content-type: try JSON then urlencoded.
    const txt = await req.text();
    if (!txt) return {};
    try { return JSON.parse(txt) as Record<string, unknown>; } catch { /* fall through */ }
    const params = new URLSearchParams(txt);
    const o: Record<string, unknown> = {};
    params.forEach((v, k) => { o[k] = v; });
    return o;
  } catch {
    return {};
  }
}

// Map a provider status string to our coarse delivery_status bucket.
function normalizeDelivery(raw: string): "delivered" | "failed" | "sent" | "read" {
  const s = raw.toLowerCase();
  if (s.includes("deliver")) return "delivered";
  if (s.includes("read")) return "read";
  if (s.includes("fail") || s.includes("undeliv") || s.includes("reject") || s.includes("expire")) return "failed";
  return "sent";
}

type Admin = ReturnType<typeof createAdminClient>;

async function resolveBusinessId(admin: Admin, secret: string): Promise<string | null> {
  const { data } = await admin
    .from("store_settings")
    .select("business_id")
    .eq("notice_config->>webhook_secret" as never, secret)
    .limit(1);
  const row = (data?.[0] as { business_id: string } | undefined) ?? undefined;
  return row?.business_id ?? null;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || url.searchParams.get("token");
  if (!secret) return ok();

  const admin = createAdminClient();
  const businessId = await resolveBusinessId(admin, secret);
  if (!businessId) return ok();

  const payload = await parseBody(req);
  if (!payload || Object.keys(payload).length === 0) return ok();

  const providerId = pick(payload, ["id", "message_id", "sms_id", "reference", "msg_id", "uuid"]);
  const statusRaw = pick(payload, ["status", "dlr_status", "delivery_status", "event", "type", "state"]);
  const text = pick(payload, ["message", "text", "body", "content", "reply"]);
  const from = pick(payload, ["from", "sender", "msisdn", "number", "phone", "source"]);
  const channel = /whats/i.test(pick(payload, ["channel", "type", "source", "event"])) ? "whatsapp" : "sms";

  const looksDelivery = DELIVERY_KEYWORDS.some((k) => statusRaw.toLowerCase().includes(k));

  // 1. Delivery report → update the matching outbound log row.
  if (looksDelivery && (providerId || from)) {
    const norm = normalizeDelivery(statusRaw);
    const patch = { delivery_status: norm, delivered_at: norm === "delivered" ? new Date().toISOString() : null } as never;

    let updated = false;
    if (providerId) {
      const { data } = await admin
        .from("notice_sms_log").update(patch)
        .eq("business_id", businessId).eq("provider_id", providerId).select("id");
      updated = !!(data && data.length);
    }
    if (!updated && from) {
      const phone = normalizeNoticePhone(from) ?? from;
      const { data: rows } = await admin
        .from("notice_sms_log").select("id")
        .eq("business_id", businessId).eq("phone", phone)
        .order("created_at", { ascending: false }).limit(1);
      if (rows && rows.length) {
        await admin.from("notice_sms_log").update(patch).eq("id", (rows[0] as { id: string }).id);
      }
    }
    return ok();
  }

  // 2. Inbound reply → store it so the merchant can see customer responses.
  if (text && from) {
    await admin.from("notice_inbox").insert({
      business_id: businessId,
      channel,
      from_number: normalizeNoticePhone(from) ?? from,
      body: text,
      raw: payload as never,
      received_at: new Date().toISOString(),
    } as never);
  }

  return ok();
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch {
    // Always 200 so notice.ro doesn't retry-storm us on our own errors.
    return ok();
  }
}

// Some providers verify a webhook with a GET first — answer 200.
export async function GET() {
  return ok();
}
