"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { sendAccountWelcomeEmail } from "@/lib/email";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita, reseteazaLimita, mesajLimita } from "@/lib/utils/limita-durabila";
import { idSesiuneCurenta, uitaStareaMfa } from "@/lib/auth/stare-mfa";
import { sesiuneCurentaNeconfirmata } from "@/lib/auth/cere-mfa";
import {
  citesteCampuriMfa,
  confirmaSesiuneaMfa,
  scrieCampuriMfa,
  trimiteCodMfa,
  verificaCodMfa,
} from "@/lib/auth/flux-mfa";
import {
  COOKIE_ASTEPTARE,
  DURATA_ASTEPTARE_SEC,
  optiuniCookieAsteptare,
  sigileazaSesiune,
} from "@/lib/auth/sesiune-asteptare";

/**
 * IP-ul apelantului. ATENTIE la ce se poate si ce nu se poate face cu el:
 * `x-forwarded-for` e pus de Vercel in fata aplicatiei, deci primul element e
 * de incredere in productie. Nu ne bazam DOAR pe el — la login limitam si pe
 * adresa de email, tocmai pentru cazul in care atacatorul roteste IP-uri.
 */
async function ipApelant(): Promise<string> {
  return clientIpFromHeaders(await headers());
}

/**
 * Limitele de autentificare, intr-un singur loc.
 *
 * De ce sunt necesare aici, si nu ne bazam pe Supabase: `signInWithPassword` e
 * apelat de pe SERVER (e Server Action), deci GoTrue vede IP-ul functiei Vercel,
 * nu al atacatorului. Limitarea per-IP din Supabase e practic anulata — si, mai
 * rau, daca se declanseaza ii loveste pe TOTI utilizatorii deodata.
 */
const LIMITE = {
  // 8 incercari / 15 min per IP, apoi blocare 15 min.
  loginIp:    { limita: 8,  fereastra: 900,  blocare: 900 },
  // 5 incercari / 15 min pe ACELASI email, apoi blocare 30 min. Opreste atacul
  // tintit pe un cont anume chiar daca atacatorul isi schimba IP-ul.
  loginEmail: { limita: 5,  fereastra: 900,  blocare: 1800 },
  // Inregistrarea trimite 2 emailuri Resend + confirmarea Supabase la fiecare apel.
  register:   { limita: 3,  fereastra: 3600, blocare: 3600 },
  // Resetarea trimite un email catre orice adresa data.
  forgot:     { limita: 3,  fereastra: 3600, blocare: 3600 },
} as const;

/*
 * Generarea codului, verificarea lui, plafonul de incercari si citirea/scrierea
 * campurilor MFA au trecut in `src/lib/auth/flux-mfa.ts`.
 *
 * Motivul: pasii care trebuie sa ruleze CU SESIUNEA NECONFIRMATA (verificarea
 * codului, retrimiterea, iesirea din cont) sunt acum rute /api/auth/**, nu
 * actiuni de server — vezi comentariul din src/lib/auth/poarta-mfa.ts despre
 * manifestul GLOBAL de actiuni. Acelasi cod e deci chemat si din rute, si de
 * aici, iar un modul `"use server"` nu poate gazdui ajutoare interne fara sa le
 * transforme in endpointuri publice.
 */


export async function login(formData: { email: string; password: string }) {
  const ip = await ipApelant();
  const email = formData.email.trim().toLowerCase();

  // Prima linie, in memorie: taie rafalele fara sa atinga baza.
  if (!rateLimit(`login:${ip}`, 12, 60_000)) {
    return { error: "Prea multe incercari. Incearca din nou peste un minut." };
  }

  // A doua linie, durabila si globala. Limitam pe DOUA chei independente: IP-ul
  // (opreste maturarea a multe conturi de la aceeasi sursa) si adresa de email
  // (opreste atacul tintit pe un cont anume, chiar daca IP-ul se roteste).
  const limIp = await consumaLimita(`login:ip:${ip}`, LIMITE.loginIp.limita, LIMITE.loginIp.fereastra, LIMITE.loginIp.blocare);
  if (!limIp.permis) return { error: mesajLimita(limIp) };

  const limEmail = await consumaLimita(`login:email:${email}`, LIMITE.loginEmail.limita, LIMITE.loginEmail.fereastra, LIMITE.loginEmail.blocare);
  if (!limEmail.permis) return { error: mesajLimita(limEmail) };

  const cookieStore = await cookies();

  /*
   * ---------------------------------------------------------------------------
   * CAUZA, si de ce clientul asta STRANGE cookie-urile in loc sa le scrie
   *
   * `signInWithPassword` intoarce o sesiune VALIDA. Pana la 05.08.2026
   * cookie-urile ei se scriau imediat, iar al doilea factor doar intarzia
   * redirectarea catre panou. Cine avea numai parola era, tehnic, autentificat:
   * nu trebuia decat sa NU urmeze redirectarea si sa cheme direct /api/**, o
   * actiune de server sau /admin (constatarile 1 si 2 din audit).
   *
   * Clientul de mai jos nu scrie nimic in cookie-uri: pune deoparte ce ar fi
   * scris. Dupa ce stim daca respectivul cont are al doilea factor, decidem:
   *   - MFA stins  -> se scriu, exact ca inainte, in aceeasi cerere. Pentru
   *     conturile fara MFA nu se schimba absolut nimic.
   *   - MFA pornit -> NU se scriu. Tokenurile pleaca sigilate spre browser
   *     (AES-256-GCM, cheie care nu paraseste serverul) si redevin sesiune abia
   *     dupa ce codul din email e verificat.
   * ---------------------------------------------------------------------------
   */
  const cookieuriSesiune: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(deScris) { cookieuriSesiune.push(...deScris); },
      },
    },
  );

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password: formData.password,
  });

  if (error || !authData.user || !authData.session) {
    return { error: "Email sau parola incorecta. Incearca din nou." };
  }

  const user = authData.user;
  const sesiune = authData.session;

  function scrieSesiunea() {
    for (const { name, value, options } of cookieuriSesiune) {
      cookieStore.set(name, value, options);
    }
  }

  // Autentificare reusita: stergem contoarele, ca utilizatorul legitim sa nu
  // ramana pedepsit pentru incercarile esuate de dinainte.
  await Promise.all([
    reseteazaLimita(`login:ip:${ip}`),
    reseteazaLimita(`login:email:${email}`),
  ]);

  /*
   * Profilul se citeste cu SERVICE ROLE, nu cu clientul utilizatorului.
   *
   * Doua motive. Unul: clientul de mai sus nu si-a persistat sesiunea nicaieri,
   * deci nu ne bazam pe el pentru o citire care decide o poarta de securitate.
   * Doi: `mfa_email_enabled` nu mai e in lista alba de SELECT a rolului
   * `authenticated` (2026-08-04-DUPA-DEPLOY-coloane-profil.sql).
   *
   * ESECUL E DELIBERAT „deschis" AICI si „inchis" IN POARTA: daca citirea cade,
   * autentificarea merge mai departe ca inainte (disponibilitate — nu blocam
   * toata lumea pentru o pana de baza), iar poarta, care are propria ei citire,
   * opreste sesiunea daca respectivul cont chiar are MFA. Cele doua straturi
   * gresesc in directii opuse, dinadins.
   */
  const profile = await citesteCampuriMfa(user.id);

  revalidatePath("/", "layout");

  if (profile?.mfa_email_enabled) {
    /*
     * Sigilam INAINTE de a decide ce facem cu cookie-urile, ca sa nu ramanem
     * intr-o stare din care omul nu mai poate nici intra, nici astepta.
     */
    let sigiliu: string | null = null;
    try {
      sigiliu = sigileazaSesiune({
        u: user.id,
        a: sesiune.access_token,
        r: sesiune.refresh_token,
        e: Date.now() + DURATA_ASTEPTARE_SEC * 1000,
      });
    } catch (e) {
      console.error("[mfa] sigilarea sesiunii in asteptare a esuat", e);
    }

    if (sigiliu) {
      /*
       * Sesiunea NU se emite. Stergem si eventualele cookie-uri de sesiune deja
       * aflate in browser (o autentificare mai veche, sau alt cont): numele lor
       * sunt exact cele pe care clientul tocmai voia sa le scrie, deci nu
       * ghicim nimic.
       */
      for (const { name } of cookieuriSesiune) cookieStore.delete(name);
      cookieStore.set(COOKIE_ASTEPTARE, sigiliu, optiuniCookieAsteptare());
    } else {
      /*
       * Plasa de siguranta: fara cheia de sigilare nu putem tine sesiunea
       * deoparte. O scriem ca inainte si ne bazam pe poarta din proxy, care o va
       * gasi neconfirmata si o va opri. Mai bine o poarta decat un om blocat
       * afara din contul lui.
       */
      scrieSesiunea();
    }

    // Codul se trimite DUPA ce sesiunea a fost pusa deoparte: daca trimiterea
    // esueaza (plafon atins), omul ajunge oricum pe /login/mfa, de unde poate
    // cere altul — dar fara sesiune valida in mana nimanui.
    await trimiteCodMfa(user.id, user.email!);

    cookieStore.set("mfa_pending", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: DURATA_ASTEPTARE_SEC, secure: process.env.NODE_ENV === "production" });
    redirect("/login/mfa");
  }

  // Fara al doilea factor: sesiunea se scrie chiar aici, ca pana acum.
  scrieSesiunea();

  if (!profile?.onboarding_completed) {
    cookieStore.delete("onboarding_done");
    redirect("/onboarding/details");
  }

  // Set cookie so proxy middleware skips onboarding DB check on redirect
  cookieStore.set("onboarding_done", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });

  redirect("/dashboard");
}

/*
 * `verifyMfaLogin` si retrimiterea codului de pe /login/mfa NU mai sunt actiuni
 * de server: sunt rutele POST /api/auth/mfa/verifica si /api/auth/mfa/retrimite.
 *
 * DE CE, pe scurt: sunt singurii pasi care trebuie sa ruleze CU SESIUNEA
 * NECONFIRMATA, iar poarta din proxy opreste orice actiune de server intr-o
 * astfel de sesiune. O scutire pe calea /login/mfa ar fi fost o usa deschisa:
 * id-ul unei actiuni se rezolva dintr-un manifest GLOBAL, nu pe pagina, deci un
 * POST catre calea scutita cu id-ul ORICAREI alte actiuni ar fi executat-o.
 * Explicatia lunga, cu referinte in node_modules, e in src/lib/auth/poarta-mfa.ts.
 */

/**
 * Trimite un cod pentru pornirea/oprirea MFA din Setari.
 *
 * Aici sesiunea e deja confirmata (altfel nici nu se ajunge in Setari), deci
 * ramane actiune de server. Retrimiterea de pe /login/mfa e alta cale.
 */
export async function sendMfaOtp(): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Neautorizat" };
  return await trimiteCodMfa(user.id, user.email);
}

export async function verifyAndEnableMfaEmail(code: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const rezultat = await verificaCodMfa(user.id, code);
  if ("error" in rezultat) return rezultat;

  /*
   * Pornirea MFA din Setari CONFIRMA sesiunea curenta.
   *
   * Altfel activarea s-ar intoarce impotriva utilizatorului: in clipa in care
   * `mfa_email_enabled` devine true, poarta ar gasi o sesiune fara confirmare si
   * l-ar arunca la /login/mfa — desi tocmai a dovedit ca are acces la email,
   * introducand codul de aici. Asta ESTE al doilea factor, trecut cu succes.
   *
   * Daca nu putem citi sesiunea, refuzam pornirea in loc sa lasam contul cu MFA
   * activ si nicio sesiune confirmata — adica blocat afara.
   */
  const idSesiune = await idSesiuneCurenta(supabase);
  if (!idSesiune) {
    console.error("[mfa] sesiunea curenta nu a putut fi identificata la pornirea MFA", { userId: user.id });
    return { error: "Nu am putut activa verificarea in doi pasi. Incearca din nou." };
  }

  await scrieCampuriMfa(user.id, { mfa_email_enabled: true });
  await confirmaSesiuneaMfa(user.id, idSesiune);
  uitaStareaMfa(user.id, idSesiune);
  return { success: true };
}

export async function verifyAndDisableMfaEmail(code: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const rezultat = await verificaCodMfa(user.id, code);
  if ("error" in rezultat) return rezultat;

  // Cu MFA stins poarta iese pe prima intrebare, deci confirmarile nu mai
  // inseamna nimic. Le stergem oricum: sa nu ramana o legatura veche care ar
  // „confirma" din start sesiunile existente daca MFA se reporneste maine.
  await scrieCampuriMfa(user.id, {
    mfa_email_enabled: false,
    mfa_otp: null,
    mfa_otp_expires_at: null,
    mfa_confirmat_la: null,
    mfa_sesiuni_confirmate: [],
  });
  uitaStareaMfa(user.id, await idSesiuneCurenta(supabase));
  return { success: true };
}

export async function register(formData: {
  full_name: string;
  email: string;
  password: string;
}) {
  const ip = await ipApelant();

  if (!rateLimit(`register:${ip}`, 5, 60_000)) {
    return { error: "Prea multe incercari. Incearca din nou peste un minut." };
  }
  const lim = await consumaLimita(`register:ip:${ip}`, LIMITE.register.limita, LIMITE.register.fereastra, LIMITE.register.blocare);
  if (!lim.permis) return { error: mesajLimita(lim, "Prea multe inregistrari de la aceasta adresa. Incearca mai tarziu.") };

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: { full_name: formData.full_name },
    },
  });

  if (error) {
    // Raspuns IDENTIC indiferent daca adresa exista sau nu. Mesajul de dinainte
    // („Exista deja un cont...") transforma formularul intr-un oracol: un atacator
    // putea verifica in masa care adrese sunt inregistrate pe platforma, ceea ce
    // e prima etapa a oricarui atac cu parole reutilizate.
    return {
      error: "Nu am putut finaliza inregistrarea. Verifica datele si incearca din nou.",
    };
  }

  // Send account welcome email + notify admin (fire-and-forget)
  sendAccountWelcomeEmail(formData.email, { name: formData.full_name }).catch(() => {});
  import("@/lib/email").then(({ sendAdminNewUserNotification }) => {
    sendAdminNewUserNotification({ name: formData.full_name, email: formData.email, createdAt: new Date().toISOString() }).catch(() => {});
  }).catch(() => {});

  // Clear stale onboarding cookie from previous session
  const cookieStore = await cookies();
  cookieStore.delete("onboarding_done");

  revalidatePath("/", "layout");
  redirect("/onboarding/details");
}

export async function forgotPassword(email: string) {
  const ip = await ipApelant();
  const adresa = email.trim().toLowerCase();

  if (!rateLimit(`forgot:${ip}`, 5, 60_000)) {
    // Raspuns de succes chiar si cand limitam: altfel diferenta de mesaj devine
    // tot un oracol de enumerare.
    return { success: true };
  }

  // Doua chei: IP-ul (bombardare de la o sursa) si adresa tinta (o singura
  // victima inundata cu emailuri de resetare de la mai multe IP-uri).
  const [limIp, limAdresa] = await Promise.all([
    consumaLimita(`forgot:ip:${ip}`, LIMITE.forgot.limita, LIMITE.forgot.fereastra, LIMITE.forgot.blocare),
    consumaLimita(`forgot:email:${adresa}`, LIMITE.forgot.limita, LIMITE.forgot.fereastra, LIMITE.forgot.blocare),
  ]);
  if (!limIp.permis || !limAdresa.permis) return { success: true };

  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(adresa, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  // Mereu acelasi raspuns, indiferent de rezultat: pagina afiseaza deja mesajul
  // neutru „Daca exista un cont cu aceasta adresa...". Un mesaj de eroare
  // diferentiat ar spune atacatorului care adrese sunt inregistrate.
  return { success: true };
}

export async function resetPassword(password: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Nu am putut reseta parola. Link-ul poate fi expirat." };
  }

  return { success: true };
}


/**
 * Schimbarea parolei din Setari.
 *
 * Cerea DOAR sesiunea, si se facea direct din browser cu
 * `supabase.auth.updateUser({ password })`. Orice sesiune imprumutata — laptop
 * lasat deschis, cookie exfiltrat, XSS — devenea preluare DEFINITIVA: atacatorul
 * punea alta parola, iar GoTrue inchide automat toate celelalte sesiuni, deci
 * proprietarul real era dat afara pe loc si nu mai putea intra.
 *
 * Acum: parola veche e obligatorie, iar o provocare MFA neterminata blocheaza
 * operatiunea.
 */
export async function schimbaParola(
  parolaVeche: string,
  parolaNoua: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Neautorizat" };

  if (parolaNoua.length < 8) return { error: "Parola noua trebuie sa aiba cel putin 8 caractere." };
  if (!parolaVeche) return { error: "Introdu parola actuala." };

  const lim = await consumaLimita(`schimba-parola:${user.id}`, 5, 900, 900);
  if (!lim.permis) return { error: mesajLimita(lim, "Prea multe incercari. Incearca mai tarziu.") };

  // Semantica noua: nu „exista un cod in curs?", ci „sesiunea asta a trecut de
  // al doilea factor?". Diferenta conta chiar aici: inainte, dupa 10 minute
  // provocarea expira si schimbarea parolei se debloca singura.
  if (await sesiuneCurentaNeconfirmata(user.id)) {
    return { error: "Finalizeaza autentificarea in doi pasi inainte de a schimba parola." };
  }

  /*
   * Verificarea parolei vechi se face pe un client SEPARAT, fara cookie-uri.
   * Cu clientul obisnuit, `signInWithPassword` ar rescrie sesiunea curenta — iar
   * la parola gresita ar putea chiar sa o strice.
   */
  const { createClient: clientCurat } = await import("@supabase/supabase-js");
  const verificator = clientCurat(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: eroareParola } = await verificator.auth.signInWithPassword({
    email: user.email,
    password: parolaVeche,
  });
  if (eroareParola) return { error: "Parola actuala este incorecta." };

  const { error } = await supabase.auth.updateUser({ password: parolaNoua });
  if (error) return { error: "Nu am putut schimba parola." };

  await reseteazaLimita(`schimba-parola:${user.id}`);
  return { success: true };
}

/*
 * `logout` NU mai e actiune de server: e ruta POST /api/auth/iesire.
 *
 * Iesirea din cont trebuie sa functioneze si dintr-o sesiune pe care poarta o
 * refuza — altfel omul ramane inchis intr-un panou care nu-i raspunde la nimic,
 * fara nicio usa. Rutele /api/auth/** sunt singurele scutite de poarta, tocmai
 * pentru asta. Formularele de deconectare trimit direct acolo, deci merg si fara
 * JavaScript.
 */

/**
 * Stergerea definitiva a contului.
 *
 * Doua lipsuri, amandoua cu consecinte reale:
 *
 *  1. Nu cerea NIMIC in plus fata de sesiune. O sesiune imprumutata putea sterge
 *     ireversibil contul, magazinele si comenzile. Acum cere parola.
 *  2. Nu anula abonamentul Stripe. Contul disparea din baza, dar abonamentul
 *     ramanea activ si clientul continua sa fie taxat luni la rand, fara sa mai
 *     aiba unde sa se conecteze ca sa-l opreasca.
 */
export async function deleteAccount(parola?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Neautorizat" };

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return { error: "Stergerea contului nu este disponibila momentan. Contactati suportul." };

  const lim = await consumaLimita(`sterge-cont:${user.id}`, 3, 900, 900);
  if (!lim.permis) return { error: mesajLimita(lim, "Prea multe incercari. Incearca mai tarziu.") };

  // Reconfirmarea parolei: operatiunea e IREVERSIBILA.
  if (!parola) return { error: "Introdu parola pentru a confirma stergerea." };
  const { createClient: clientCurat } = await import("@supabase/supabase-js");
  const verificator = clientCurat(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: eroareParola } = await verificator.auth.signInWithPassword({
    email: user.email,
    password: parola,
  });
  if (eroareParola) return { error: "Parola este incorecta." };

  const admin0 = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Anuleaza abonamentul INAINTE de stergere: dupa ce randul dispare nu mai
  // exista de unde afla `stripe_customer_id`, si clientul ramane taxat.
  const { data: profilPlata } = await admin0
    .from("users_profile").select("stripe_customer_id").eq("id", user.id).single();
  if (profilPlata?.stripe_customer_id) {
    try {
      const { stripe } = await import("@/lib/stripe");
      const abonamente = await stripe.subscriptions.list({
        customer: profilPlata.stripe_customer_id, status: "active", limit: 100,
      });
      for (const ab of abonamente.data) {
        await stripe.subscriptions.cancel(ab.id).catch(() => {});
      }
    } catch {
      // Stripe cazut nu trebuie sa blocheze stergerea contului; ramane in loguri.
      console.error("[deleteAccount] anularea abonamentului Stripe a esuat", { userId: user.id });
    }
  }

  // Delete user data from public schema (cascade handles related tables)
  await supabase.from("users_profile").delete().eq("id", user.id);

  // Delete auth user via admin client
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "Eroare la stergerea contului. Incearca din nou." };

  await supabase.auth.signOut();
  const cs = await cookies();
  cs.delete("onboarding_done");
  redirect("/login");
}

export async function trackOnboardingStep(step: "details" | "plan") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { createAdminClient: getAdmin } = await import("@/lib/supabase/admin");
  const admin = getAdmin();
  const stepOrder: Record<string, number> = { registered: 0, details: 1, plan: 2, completed: 3 };
  const { data } = await admin.from("users_profile").select("onboarding_step").eq("id", user.id).single();
  const currentStep = (data as unknown as { onboarding_step?: string })?.onboarding_step ?? "registered";
  if (stepOrder[step] > (stepOrder[currentStep] ?? 0)) {
    await admin.from("users_profile").update({ onboarding_step: step } as never).eq("id", user.id);
  }
}
