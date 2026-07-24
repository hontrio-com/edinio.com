import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

// Plasa de siguranta pentru sincronizarea abonamentelor Stripe -> Edinio.
// Webhook-ul `customer.subscription.deleted` seteaza perioada de gratie la anulare,
// DAR daca evenimentul nu ajunge (endpoint neabonat la eveniment, livrare esuata,
// abonament fara user_id in metadata), un cont anulat ramane marcat „activ" si
// pastreaza accesul degeaba. Acest cron detecteaza driftul: un user cu plan PLATIT
// dar FARA niciun abonament Stripe activ primeste aceeasi perioada de gratie de 15
// zile ca in webhook. Idempotent — nu re-suspenda un cont deja in gratie.
function verifyCron(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const GRACE_DAYS = 15;

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const stripe = getStripe();

  // Useri cu plan PLATIT + client Stripe, care NU sunt in dunning (payment_failed_at
  // gol — dunning-ul e tratat separat, nu-l suprascriem).
  const { data: users } = await admin
    .from("users_profile")
    .select("id, plan, stripe_customer_id")
    .in("plan", ["basic", "premium", "ultra"])
    .not("stripe_customer_id", "is", null)
    .is("payment_failed_at", null);

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, suspended: 0 });
  }

  // Business-urile lor: sarim userii deja in gratie/suspendati (au deja suspended_until).
  const userIds = users.map((u) => u.id);
  const { data: bizRows } = await admin
    .from("businesses")
    .select("user_id, suspended_until")
    .in("user_id", userIds);

  const alreadySuspended = new Set(
    (bizRows ?? []).filter((b) => b.suspended_until).map((b) => b.user_id),
  );
  const hasBusiness = new Set((bizRows ?? []).map((b) => b.user_id));

  let checked = 0;
  let suspended = 0;

  for (const u of users) {
    if (!u.stripe_customer_id) continue;
    if (alreadySuspended.has(u.id)) continue; // deja in gratie
    if (!hasBusiness.has(u.id)) continue; // nimic de suspendat
    checked++;
    try {
      const subs = await stripe.subscriptions.list({
        customer: u.stripe_customer_id,
        status: "all",
        limit: 20,
      });
      const hasLive = subs.data.some((s) => LIVE_STATUSES.has(s.status));
      if (hasLive) continue; // are abonament activ -> totul e in regula

      // Plan platit in DB, dar niciun abonament Stripe viu -> anulare neprinsa.
      const graceUntil = new Date();
      graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS);
      const { error } = await admin
        .from("businesses")
        .update({ suspended_until: graceUntil.toISOString() })
        .eq("user_id", u.id)
        .is("suspended_until", null); // idempotent: doar cele fara gratie deja
      if (!error) {
        suspended++;
        console.warn(
          `[reconcile-subscriptions] fara abonament Stripe activ pentru user ${u.id} (plan ${u.plan}) -> gratie setata`,
        );
      }
    } catch (e) {
      console.error("[reconcile-subscriptions] stripe list esuat pentru", u.id, e);
    }
  }

  console.log(`[reconcile-subscriptions] verificati ${checked}, gratie setata ${suspended}`);
  return NextResponse.json({ ok: true, checked, suspended });
}
