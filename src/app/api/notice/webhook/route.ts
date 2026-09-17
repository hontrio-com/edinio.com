import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeNoticePhone } from "@/lib/notice";
import { asazaRaspunsurile, asazaApelul } from "@/lib/notice-raspunsuri";

export const dynamic = "force-dynamic";

/**
 * Ce ne cheama notice.ro inapoi.
 *
 * ═══ CE E DOVEDIT SI CE NU (17.09.2026) ═══
 *
 * Citita specificatia lor cap la cap (colectia Postman oficiala, 29 de capete):
 *
 *   - DOVEDIT: `callback_url` la `POST /audio`. Corpul e FORMULAR, cu `audio_id` si `status`.
 *   - NEDOCUMENTAT: rapoarte de livrare si raspunsuri pentru SMS. Nu apar in API, dar pagina lor de
 *     prezentare promite „callback-uri HTTP” pentru ambele, iar panoul nostru trimite comerciantul la
 *     „Integrare API → Webhook URL”. Deci se pot primi, dar in ce forma, nu stie nimeni.
 *
 * ⚠ Masurat in productie: 405 SMS-uri, ZERO `delivered`. Nu dovedeste ca ei nu trimit: 399 dintre ele
 * sunt ale unui magazin care n-a avut NICIODATA secret de webhook, iar adresa afisata celorlalti era pe
 * apex, care raspunde 308. Pe 17.09 scrisesem aici ca vechiul comentariu „era fals”; era o concluzie
 * trasa din aceeasi lipsa de date, doar in sens invers.
 *
 * De aceea ramurile SMS raman, citite tolerant, iar raspunsurile trec prin aceeasi regula ca a cronului
 * care le TRAGE (`asazaRaspunsurile`), ca sa nu se dubleze intre ele si ca „STOP” sa fie auzit oricum.
 *
 * ⚠ SE RASPUNDE MEREU 200: o cerere falsificata nu merita reincercata, iar un callback repetat la
 * nesfarsit n-ajuta pe nimeni.
 */

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

  // ── Rezultatul unui APEL DE VOCE ───────────────────────────────────────────
  /*
   * ⚠⚠ SE JUDECA PRIMUL, si orice corp cu `audio_id` se opreste aici, oricare i-ar fi starea. Regula
   * si cele doua capcane pe care le evita sunt in `asazaApelul`, unde se pot proba chemand-o.
   */
  if (await asazaApelul(admin, businessId, payload) !== "nu-e-apel") return ok();

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

    /* ⚠ Doar randurile notice.ro: jurnalul e impartit cu SMSO, iar un raport de-al lor nu atinge altceva. */
    let updated = false;
    if (providerId) {
      const { data } = await admin
        .from("notice_sms_log").update(patch)
        .eq("business_id", businessId).eq("provider", "notice").eq("provider_id", providerId).select("id");
      updated = !!(data && data.length);
    }
    if (!updated && from) {
      const phone = normalizeNoticePhone(from) ?? from;
      const { data: rows } = await admin
        .from("notice_sms_log").select("id")
        .eq("business_id", businessId).eq("provider", "notice").eq("phone", phone)
        .order("created_at", { ascending: false }).limit(1);
      if (rows && rows.length) {
        await admin.from("notice_sms_log").update(patch).eq("id", (rows[0] as { id: string }).id);
      }
    }
    return ok();
  }

  // 2. Raspuns primit → aceeasi regula ca la TRAGERE: doar de la numere carora le-am scris, „STOP”
  //    tinut minte, si fara dubluri fata de ce aduce cronul.
  if (text && from) {
    await asazaRaspunsurile(admin, businessId, [
      { id: providerId || null, number: from, message: text, created_at: null, status: null },
    ], { sursa: "webhook", canal: channel, brut: payload });
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
