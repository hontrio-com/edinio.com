import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";
import { COOKIE_SESIUNE, cuDurataNoastra } from "./cookie-sesiune";

/**
 * Repara steagul `onboarding_completed` ramas pe false desi userul are deja
 * magazin. Coloana e privilegiata (fara grant de UPDATE pentru `authenticated`),
 * deci scrierea trece prin service role. Import dinamic ca sa nu incarcam
 * clientul de admin pe fiecare cerere care nu are nevoie de el; erorile se
 * inghit intentionat — e o reparatie cosmetica, nu o cale critica.
 */
async function repairOnboardingFlag(userId: string): Promise<void> {
  try {
    const { createAdminClient } = await import("./admin");
    await createAdminClient()
      .from("users_profile")
      .update({ onboarding_completed: true } as never)
      .eq("id", userId);
  } catch {
    /* se reincearca la cererea urmatoare */
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Aceleasi optiuni in toate cele patru locuri unde se face un client; vezi
      // ./cookie-sesiune.ts pentru ce erau inainte si de ce s-au schimbat.
      cookieOptions: COOKIE_SESIUNE,
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, cuDurataNoastra(options)));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Helper: create a redirect that preserves Supabase auth cookies
  function redirectTo(dest: string) {
    const url = request.nextUrl.clone();
    url.pathname = dest;
    const res = NextResponse.redirect(url);
    // Copy refreshed auth cookies so the next request has valid tokens
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value, cookie as any);
    });
    return res;
  }

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
    /*
     * „Neautentificat" are acum doua intelesuri diferite, si merita despartite.
     *
     * De la 05.08.2026, cine a trecut de parola dar nu si de codul din email NU
     * are sesiune deloc — asta E reparatia. Fara ramura de mai jos, un asemenea
     * om ar fi trimis la /login, ar reintroduce parola si ar primi alt cod, la
     * nesfarsit. Cookie-ul `mfa_pending` spune ca exista o autentificare in curs,
     * deci il ducem unde trebuie: la pasul doi.
     *
     * Cookie-ul e doar un indiciu de rutare. Nu decide nimic: sigiliul cu
     * tokenurile e separat, cifrat, si numai el poate deveni sesiune.
     */
    const areAutentificareInCurs =
      request.cookies.get("mfa_pending")?.value === "1" ||
      request.cookies.has("mfa_asteptare");
    if (areAutentificareInCurs) {
      url.pathname = "/login/mfa";
      url.search = "";
      return NextResponse.redirect(url);
    }
    url.pathname = "/login";
    if (isDashboard) url.searchParams.set("redirect", pathname);
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value, cookie as any);
    });
    return res;
  }

  /*
   * `mfa_pending` a incetat sa mai fie sursa de adevar (05.08.2026).
   *
   * E un cookie trimis de client, cu maxAge 10 minute: expira singur, si oricine
   * il putea pur si simplu sa nu-l trimita. Adevarul sta acum in baza, in
   * `mfa_sesiuni_confirmate`, si se verifica in poarta comuna (proxy pentru
   * /api si actiuni, layout-ul de dashboard pentru pagini, `requireAdmin` pentru
   * /admin). Cookie-ul ramane doar ca SCURTATURA: trimite omul direct la pagina
   * de cod, fara sa mai atinga baza. Nu mai decide nimic singur.
   */
  const mfaPending = request.cookies.get("mfa_pending")?.value === "1";

  // Authenticated on auth pages → redirect to dashboard
  // EXCEPT: /reset-password (user needs session from recovery link to change password)
  // EXCEPT: /login/mfa — vezi mai jos
  if (isAuth && user) {
    if (pathname.startsWith("/reset-password")) {
      return supabaseResponse; // let through to complete password reset
    }
    /*
     * /login/mfa se lasa sa treaca INTOTDEAUNA pentru un utilizator autentificat,
     * nu doar cand exista cookie-ul.
     *
     * Altfel apare o bucla de redirectari din care omul nu mai iese: layout-ul de
     * dashboard vede sesiunea neconfirmata si trimite la /login/mfa, iar de aici
     * lipsa cookie-ului (expirat dupa 10 minute, sau alt dispozitiv) l-ar trimite
     * inapoi la /dashboard. Pentru o sesiune DEJA confirmata pagina e inofensiva:
     * arata un formular de cod, atat.
     */
    if (pathname.startsWith("/login/mfa")) {
      return supabaseResponse;
    }
    return redirectTo(mfaPending ? "/login/mfa" : "/dashboard");
  }

  // Authenticated on dashboard but MFA not yet verified → redirect to /login/mfa
  if (user && isDashboard && mfaPending) {
    return redirectTo("/login/mfa");
  }

  // Cookie flag: skip DB queries if onboarding already confirmed
  const onboardingDone = request.cookies.get("onboarding_done")?.value === "1";

  // Authenticated on onboarding → redirect to dashboard if already completed
  if (user && isOnboarding) {
    if (onboardingDone) {
      return redirectTo("/dashboard");
    }
    const { data: profile } = await supabase
      .from("users_profile")
      .select("onboarding_completed")
      .eq("id", user.id)
      .single();
    if (profile?.onboarding_completed) {
      const res = redirectTo("/dashboard");
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
        // Steag invechit - il reparam in tacere si punem cookie-ul.
        // `onboarding_completed` e coloana privilegiata (clientul utilizatorului
        // nu mai are grant de UPDATE pe ea), deci scrierea trece prin service
        // role. Ramane fire-and-forget: nu blocam raspunsul pentru o reparatie
        // cosmetica, iar daca esueaza se reincearca la cererea urmatoare.
        void repairOnboardingFlag(user.id);
        supabaseResponse.cookies.set("onboarding_done", "1", { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      } else {
        return redirectTo("/onboarding/details");
      }
    } else if (profile?.onboarding_completed) {
      // Set cookie so we skip this check on future requests
      supabaseResponse.cookies.set("onboarding_done", "1", { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    }
  }

  return supabaseResponse;
}
