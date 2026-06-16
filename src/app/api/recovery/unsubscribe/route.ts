import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// One-click email unsubscribe from abandoned-cart recovery messages. The link is
// included in recovery emails as ?b=<businessId>&e=<email>. Idempotent: a duplicate
// insert simply violates the unique index and is ignored.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("b");
  const email = req.nextUrl.searchParams.get("e");
  if (!businessId || !email) {
    return new NextResponse("Link invalid.", { status: 400 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await admin
    .from("recovery_optout")
    .insert({ business_id: businessId, email } as never)
    .then(() => {}, () => {});

  return new NextResponse(
    `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dezabonare</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:56px 24px;color:#18181b;background:#f4f4f5;"><div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;"><h1 style="font-size:20px;margin:0 0 8px;">Te-ai dezabonat</h1><p style="color:#71717a;font-size:14px;margin:0;">Nu vei mai primi emailuri de recuperare a coșului din partea acestui magazin.</p></div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
