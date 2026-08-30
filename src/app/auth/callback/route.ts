import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { idSesiuneCurenta } from "@/lib/auth/stare-mfa";
import { confirmaSesiuneaMfa } from "@/lib/auth/flux-mfa";

/**
 * Aterizarea din linkurile trimise pe email: confirmarea contului, resetarea
 * parolei, linkul magic folosit de impersonare.
 *
 * DE CE MARCHEAZA SESIUNEA CA TRECUTA DE AL DOILEA FACTOR (05.08.2026): ca sa
 * ajunga aici, omul a deschis un link primit pe adresa contului. Asta ESTE
 * factorul al doilea — exact acelasi lucru pe care il dovedeste codul din 6
 * cifre, care se trimite tot pe email. Fara marcaj, cine isi reseteaza parola ar
 * primi o sesiune pe care poarta o refuza, si nu ar mai putea nici sa-si puna
 * parola noua: linkul de recuperare e singura lui cale de intrare, iar codul MFA
 * cere o autentificare pe care tocmai nu o poate face.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  const supabase = await createClient();
  let authenticated = false;

  // PKCE flow (normal login/register)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authenticated = !error;
  }
  // OTP/magic link flow (admin impersonation)
  else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email",
    });
    authenticated = !error;
  }

  if (authenticated) {
    const { data: { user: utilizator } } = await supabase.auth.getUser();
    const idSesiune = utilizator ? await idSesiuneCurenta(supabase) : null;
    if (utilizator && idSesiune) await confirmaSesiuneaMfa(utilizator.id, idSesiune);

    // Password reset flow: redirect straight to /reset-password with active session
    if (next === "/reset-password") {
      return NextResponse.redirect(`${origin}/reset-password`);
    }

    const user = utilizator;
    if (user) {
      const { data: profile } = await supabase
        .from("users_profile")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();

      if (!profile?.onboarding_completed) {
        const plan = searchParams.get("plan");
        const res = NextResponse.redirect(`${origin}/onboarding/details`);
        res.cookies.delete("onboarding_done");
        if (plan && ["basic", "premium", "ultra"].includes(plan)) {
          res.cookies.set("preselected_plan", plan, { httpOnly: false, path: "/", maxAge: 600, sameSite: "lax" });
        }
        return res;
      }
      const dashRes = NextResponse.redirect(`${origin}/dashboard`);
      dashRes.cookies.set("onboarding_done", "1", { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      return dashRes;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
