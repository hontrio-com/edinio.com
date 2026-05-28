import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isDashboard = pathname.startsWith("/dashboard");
  const isOnboarding = pathname.startsWith("/onboarding");
  const isAuth =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  // Unauthenticated → redirect to login
  if ((isDashboard || isOnboarding) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (isDashboard) url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  const mfaPending = request.cookies.get("mfa_pending")?.value === "1";

  // Authenticated on auth pages → redirect to dashboard (except /login/mfa when MFA pending)
  if (isAuth && user) {
    if (mfaPending && pathname.startsWith("/login/mfa")) {
      return supabaseResponse; // let through to complete MFA
    }
    const url = request.nextUrl.clone();
    url.pathname = mfaPending ? "/login/mfa" : "/dashboard";
    return NextResponse.redirect(url);
  }

  // Authenticated on dashboard but MFA not yet verified → redirect to /login/mfa
  if (user && isDashboard && mfaPending) {
    const url = request.nextUrl.clone();
    url.pathname = "/login/mfa";
    return NextResponse.redirect(url);
  }

  // Cookie flag: skip DB queries if onboarding already confirmed
  const onboardingDone = request.cookies.get("onboarding_done")?.value === "1";

  // Authenticated on onboarding → redirect to dashboard if already completed
  if (user && isOnboarding) {
    if (onboardingDone) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    const { data: profile } = await supabase
      .from("users_profile")
      .select("onboarding_completed")
      .eq("id", user.id)
      .single();
    if (profile?.onboarding_completed) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      const res = NextResponse.redirect(url);
      res.cookies.set("onboarding_done", "1", { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      return res;
    }
  }

  // Authenticated on dashboard → verify onboarding complete (skip if cookie set)
  if (user && isDashboard && !onboardingDone) {
    const [{ data: profile }, { count: bizCount }] = await Promise.all([
      supabase.from("users_profile").select("onboarding_completed").eq("id", user.id).single(),
      supabase.from("businesses").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

    const hasBusiness = (bizCount ?? 0) > 0;

    if (profile && !profile.onboarding_completed) {
      if (hasBusiness) {
        // Stale flag - fix silently and set cookie
        supabase.from("users_profile").update({ onboarding_completed: true }).eq("id", user.id).then(() => {});
        supabaseResponse.cookies.set("onboarding_done", "1", { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      } else {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding/details";
        return NextResponse.redirect(url);
      }
    } else if (profile?.onboarding_completed) {
      // Set cookie so we skip this check on future requests
      supabaseResponse.cookies.set("onboarding_done", "1", { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    }
  }

  return supabaseResponse;
}
