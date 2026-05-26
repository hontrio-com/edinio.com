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

  // Authenticated on auth pages → redirect to dashboard
  if (isAuth && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Authenticated on dashboard → verify onboarding complete
  if (user && isDashboard) {
    const [{ data: profile }, { count: bizCount }] = await Promise.all([
      supabase.from("users_profile").select("onboarding_completed").eq("id", user.id).single(),
      supabase.from("businesses").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

    const hasBusiness = (bizCount ?? 0) > 0;

    if (profile && !profile.onboarding_completed) {
      if (hasBusiness) {
        // Stale flag - fix silently
        supabase.from("users_profile").update({ onboarding_completed: true }).eq("id", user.id).then(() => {});
      } else {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding/details";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
