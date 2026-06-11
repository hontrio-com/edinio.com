import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    // Password reset flow: redirect straight to /reset-password with active session
    if (next === "/reset-password") {
      return NextResponse.redirect(`${origin}/reset-password`);
    }

    const { data: { user } } = await supabase.auth.getUser();
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
