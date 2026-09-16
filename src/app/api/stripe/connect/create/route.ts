import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  /*
   * ═══ ⚠ MAGAZINUL SE CERE, NU SE GHICESTE (16.09.2026) ═══
   *
   * Aici se lua PRIMUL magazin al omului (`order("created_at").limit(1)`), nu acela din care a
   * apasat. Cu mai multe magazine pe un cont, cineva conecta Stripe din magazinul B si contul se
   * lega de magazinul A: platile ar fi mers pe alt magazin decat cel configurat.
   *
   * ⚠ MASURAT INAINTE DE A REPARA: la 16.09.2026, toti cei 130 de utilizatori au exact UN magazin,
   * deci defectul era ADORMIT, nu viu. Se inchide acum fiindca devine viu in tacere in ziua in care
   * platforma da mai multe magazine pe cont, si atunci nimeni n-ar cauta cauza aici.
   *
   * ⚠ Se PASTREAZA caderea pe primul magazin cand apelantul nu trimite nimic: panoul deschis inainte
   * de desfasurare inca face `POST` fara corp, si n-are rost sa-i stricam conectarea pentru o
   * repartie de care nu are nevoie (are un singur magazin).
   */
  let cerut: string | null = null;
  try {
    const corp = (await request.json()) as { businessId?: string } | null;
    cerut = typeof corp?.businessId === "string" ? corp.businessId : null;
  } catch { /* fara corp: ramane purtarea veche */ }

  const q = supabase.from("businesses").select("id").eq("user_id", user.id);
  const { data: business } = cerut
    ? await q.eq("id", cerut).single()
    : await q.order("created_at").limit(1).single();

  /* ⚠ `eq("user_id")` de mai sus e si autorizarea: un `businessId` strain nu se potriveste. */
  if (!business) return NextResponse.json({ error: "No business found" }, { status: 400 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: settings } = await admin
    .from("store_settings")
    .select("stripe_config")
    .eq("business_id", business.id)
    .single();

  const stripeConfig = (settings?.stripe_config as Record<string, unknown> | null) ?? {};
  let accountId = stripeConfig.account_id as string | undefined;

  if (!accountId) {
    const account = await stripe.accounts.create({ type: "standard" });
    accountId = account.id;
    /* ⚠ Se PASTREAZA ce era in configurare: scrierea de dinainte inlocuia obiectul intreg, deci
       orice cheie pusa acolo de alta cale disparea la o reconectare. */
    await admin
      .from("store_settings")
      .update({
        stripe_config: { ...stripeConfig, account_id: accountId, onboarding_complete: false, enabled: false },
      })
      .eq("business_id", business.id);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? "https://www.edinio.com";

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/api/stripe/connect/refresh?business_id=${business.id}`,
    return_url: `${baseUrl}/api/stripe/connect/return?business_id=${business.id}`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
