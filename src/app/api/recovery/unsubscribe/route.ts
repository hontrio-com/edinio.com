import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { verificaDezabonare } from "@/lib/recovery-unsubscribe";
import { logError } from "@/lib/error-logger";

// One-click email unsubscribe from abandoned-cart recovery messages. The link is
// included in recovery emails as ?b=<businessId>&e=<email>. Idempotent: a duplicate
// insert simply violates the unique index and is ignored.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("b");
  const email = req.nextUrl.searchParams.get("e");
  const semnatura = req.nextUrl.searchParams.get("s");
  if (!businessId || !email) {
    return new NextResponse("Link invalid.", { status: 400 });
  }

  // Linkul trebuie SEMNAT. Fara asta, oricine putea dezabona pe oricine de la
  // orice magazin: `b` e public (apare in HTML-ul magazinului), `e` se ghiceste,
  // iar scrierea se face cu service role, deci RLS nu opreste nimic.
  if (!verificaDezabonare(businessId, email, semnatura)) {
    return new NextResponse("Link invalid sau expirat.", { status: 403 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  /*
   * ⚠ REZULTATUL SE VERIFICA, altfel pagina MINTE.
   *
   * Era `.then(() => {}, () => {})`, care nu prinde nimic: clientul Supabase NU
   * ARUNCA la eroare de SQL, intoarce `{ error }`. Deci un insert respins trecea
   * neatins, iar omul primea „Te-ai dezabonat" fara sa fie dezabonat — si nu avea
   * de unde sa afle, pana la urmatorul email.
   *
   * Asta nu e o scapare tehnica ca celelalte: e o promisiune de consimtamant
   * incalcata, si una pe care omul o considera indeplinita.
   *
   * `23505` inseamna „era deja dezabonat" — succes, nu eroare.
   */
  const { error } = await admin
    .from("recovery_optout")
    .insert({ business_id: businessId, email } as never);
  if (error && error.code !== "23505") {
    await logError({
      action: "recovery/unsubscribe",
      message: `dezabonarea NU s-a inregistrat: ${error.message}`,
      details: { businessId, code: error.code }, businessId, severity: "critical",
    });
    return new NextResponse(
      `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dezabonare</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:56px 24px;color:#18181b;background:#f4f4f5;"><div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;"><h1 style="font-size:20px;margin:0 0 8px;">Nu am putut inregistra dezabonarea</h1><p style="color:#71717a;font-size:14px;margin:0;">A fost o problema de moment. Te rugam sa incerci din nou peste cateva momente, folosind acelasi link.</p></div></body></html>`,
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  return new NextResponse(
    `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dezabonare</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:56px 24px;color:#18181b;background:#f4f4f5;"><div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;"><h1 style="font-size:20px;margin:0 0 8px;">Te-ai dezabonat</h1><p style="color:#71717a;font-size:14px;margin:0;">Nu vei mai primi emailuri de recuperare a coșului din partea acestui magazin.</p></div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
