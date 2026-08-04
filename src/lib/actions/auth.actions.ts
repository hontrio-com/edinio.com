"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendMfaOtpEmail, sendAccountWelcomeEmail } from "@/lib/email";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita, reseteazaLimita, mesajLimita } from "@/lib/utils/limita-durabila";
import { mfaInAsteptare } from "@/lib/auth/mfa";

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
  // Codul MFA are 6 cifre: fara plafon se ghiceste prin forta bruta.
  mfa:        { limita: 5,  fereastra: 900,  blocare: 900 },
} as const;

function generateOtp(): { otp: string; otpHash: string; expiresAt: string } {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return { otp, otpHash, expiresAt };
}

function verifyOtpHash(code: string, storedHash: string, expiresAt: string): boolean {
  if (new Date() > new Date(expiresAt)) return false;
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  const a = Buffer.from(hash);
  const b = Buffer.from(storedHash);
  // `timingSafeEqual` ARUNCA daca lungimile difera. Un `mfa_otp` stricat sau
  // gol in baza transforma o verificare esuata intr-o eroare 500 neprinsa.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Plafon pe incercarile de cod MFA.
 *
 * Codul are 6 cifre (1.000.000 de combinatii) si e valabil 10 minute. Fara
 * plafon, un atacator care are deja parola poate ghici codul prin forta bruta
 * — sesiunea e deja valida in acel punct, doar redirectarea il tine pe loc.
 */
async function limitaMfa(userId: string): Promise<{ error: string } | null> {
  const lim = await consumaLimita(`mfa:${userId}`, LIMITE.mfa.limita, LIMITE.mfa.fereastra, LIMITE.mfa.blocare);
  if (lim.permis) return null;
  return { error: mesajLimita(lim, "Prea multe coduri gresite. Incearca din nou mai tarziu.") };
}


/**
 * Scrierile pe campurile MFA trec OBLIGATORIU prin service role.
 *
 * `mfa_otp`, `mfa_otp_expires_at` si `mfa_email_enabled` sunt pe randul propriu
 * al utilizatorului, deci pana acum si le putea scrie singur cu cheia anon. Iar
 * dupa `signInWithPassword` sesiunea E DEJA valida — al doilea factor doar
 * intarzie redirectarea. Deci un atacator care avea numai parola putea:
 *   update({ mfa_email_enabled: false })                  -> stinge MFA de tot
 *   update({ mfa_otp: sha256("123456"), expires: viitor }) -> isi alege codul
 * si intra. Coloanele sunt acum revocate pentru rolul `authenticated`
 * (migrations/2026-08-04-blindare-mfa.sql), iar scrierile legitime trec pe aici.
 */
async function scrieCampuriMfa(
  userId: string,
  campuri: { mfa_otp?: string | null; mfa_otp_expires_at?: string | null; mfa_email_enabled?: boolean },
): Promise<void> {
  const { createAdminClient: getAdmin } = await import("@/lib/supabase/admin");
  await getAdmin().from("users_profile").update(campuri as never).eq("id", userId);
}


/**
 * Citirea campurilor MFA trece prin service role, ca si scrierea.
 *
 * `mfa_otp` e hash-ul codului in curs. Citibil de proprietarul randului, devine
 * o unealta pentru chiar atacul de care MFA ar trebui sa apere: cine are parola
 * primeste o sesiune valida (al doilea factor doar intarzie redirectarea), isi
 * citeste hash-ul si sparge 6 cifre offline in mai putin de o secunda.
 */
async function citesteCampuriMfa(userId: string): Promise<{
  mfa_email_enabled: boolean | null; mfa_otp: string | null; mfa_otp_expires_at: string | null;
  onboarding_completed?: boolean | null;
} | null> {
  const { createAdminClient: getAdmin } = await import("@/lib/supabase/admin");
  const { data } = await getAdmin()
    .from("users_profile")
    .select("mfa_email_enabled, mfa_otp, mfa_otp_expires_at, onboarding_completed")
    .eq("id", userId)
    .single();
  return data ?? null;
}

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

  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password: formData.password,
  });

  if (error || !authData.user) {
    return { error: "Email sau parola incorecta. Incearca din nou." };
  }

  const user = authData.user;

  // Autentificare reusita: stergem contoarele, ca utilizatorul legitim sa nu
  // ramana pedepsit pentru incercarile esuate de dinainte.
  await Promise.all([
    reseteazaLimita(`login:ip:${ip}`),
    reseteazaLimita(`login:email:${email}`),
  ]);

  const { data: profile } = await supabase
    .from("users_profile")
    .select("onboarding_completed, mfa_email_enabled")
    .eq("id", user.id)
    .single();

  revalidatePath("/", "layout");

  if (profile?.mfa_email_enabled) {
    const { otp, otpHash, expiresAt } = generateOtp();
    await scrieCampuriMfa(user.id, { mfa_otp: otpHash, mfa_otp_expires_at: expiresAt });
    await sendMfaOtpEmail(user.email!, otp);
    const cookieStore = await cookies();
    cookieStore.set("mfa_pending", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 10 * 60, secure: process.env.NODE_ENV === "production" });
    redirect("/login/mfa");
  }

  if (!profile?.onboarding_completed) {
    const cookieStore = await cookies();
    cookieStore.delete("onboarding_done");
    redirect("/onboarding/details");
  }

  // Set cookie so proxy middleware skips onboarding DB check on redirect
  const cookieStore = await cookies();
  cookieStore.set("onboarding_done", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });

  redirect("/dashboard");
}

export async function verifyMfaLogin(code: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesiune expirata. Autentifica-te din nou." };

  const profile = await citesteCampuriMfa(user.id);

  const depasit = await limitaMfa(user.id);
  if (depasit) return depasit;

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Autentifica-te din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) {
    return { error: "Cod incorect sau expirat." };
  }

  await reseteazaLimita(`mfa:${user.id}`);
  await scrieCampuriMfa(user.id, { mfa_otp: null, mfa_otp_expires_at: null });
  const cookieStore = await cookies();
  cookieStore.delete("mfa_pending");
  revalidatePath("/", "layout");

  if (!profile.onboarding_completed) redirect("/onboarding/details");
  redirect("/dashboard");
}

export async function sendMfaOtp(): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Neautorizat" };

  // Retrimiterea codului trimite un email de fiecare data.
  const lim = await consumaLimita(`mfa-trimite:${user.id}`, 4, 900, 900);
  if (!lim.permis) return { error: mesajLimita(lim, "Prea multe coduri cerute. Incearca mai tarziu.") };

  const { otp, otpHash, expiresAt } = generateOtp();
  await scrieCampuriMfa(user.id, { mfa_otp: otpHash, mfa_otp_expires_at: expiresAt });
  await sendMfaOtpEmail(user.email, otp);
  return { success: true };
}

export async function verifyAndEnableMfaEmail(code: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const profile = await citesteCampuriMfa(user.id);

  const depasit = await limitaMfa(user.id);
  if (depasit) return depasit;

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Incearca din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) return { error: "Cod incorect sau expirat." };

  await reseteazaLimita(`mfa:${user.id}`);
  await scrieCampuriMfa(user.id, { mfa_email_enabled: true, mfa_otp: null, mfa_otp_expires_at: null });
  return { success: true };
}

export async function verifyAndDisableMfaEmail(code: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const profile = await citesteCampuriMfa(user.id);

  const depasit = await limitaMfa(user.id);
  if (depasit) return depasit;

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Incearca din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) return { error: "Cod incorect sau expirat." };

  await reseteazaLimita(`mfa:${user.id}`);
  await scrieCampuriMfa(user.id, { mfa_email_enabled: false, mfa_otp: null, mfa_otp_expires_at: null });
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

  const profil = await citesteCampuriMfa(user.id);
  if (mfaInAsteptare(profil)) {
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

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("mfa_pending");
  cookieStore.delete("onboarding_done");
  cookieStore.delete("impersonare");
  revalidatePath("/", "layout");
  redirect("/login");
}

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
