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
    await supabase.from("users_profile").update({ mfa_otp: otpHash, mfa_otp_expires_at: expiresAt }).eq("id", user.id);
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

  const { data: profile } = await supabase
    .from("users_profile")
    .select("mfa_otp, mfa_otp_expires_at, onboarding_completed")
    .eq("id", user.id)
    .single();

  const depasit = await limitaMfa(user.id);
  if (depasit) return depasit;

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Autentifica-te din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) {
    return { error: "Cod incorect sau expirat." };
  }

  await reseteazaLimita(`mfa:${user.id}`);
  await supabase.from("users_profile").update({ mfa_otp: null, mfa_otp_expires_at: null }).eq("id", user.id);
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
  await supabase.from("users_profile").update({ mfa_otp: otpHash, mfa_otp_expires_at: expiresAt }).eq("id", user.id);
  await sendMfaOtpEmail(user.email, otp);
  return { success: true };
}

export async function verifyAndEnableMfaEmail(code: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: profile } = await supabase
    .from("users_profile").select("mfa_otp, mfa_otp_expires_at").eq("id", user.id).single();

  const depasit = await limitaMfa(user.id);
  if (depasit) return depasit;

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Incearca din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) return { error: "Cod incorect sau expirat." };

  await reseteazaLimita(`mfa:${user.id}`);
  await supabase.from("users_profile").update({ mfa_email_enabled: true, mfa_otp: null, mfa_otp_expires_at: null }).eq("id", user.id);
  return { success: true };
}

export async function verifyAndDisableMfaEmail(code: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: profile } = await supabase
    .from("users_profile").select("mfa_otp, mfa_otp_expires_at").eq("id", user.id).single();

  const depasit = await limitaMfa(user.id);
  if (depasit) return depasit;

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Incearca din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) return { error: "Cod incorect sau expirat." };

  await reseteazaLimita(`mfa:${user.id}`);
  await supabase.from("users_profile").update({ mfa_email_enabled: false, mfa_otp: null, mfa_otp_expires_at: null }).eq("id", user.id);
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

export async function deleteAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return { error: "Stergerea contului nu este disponibila momentan. Contactati suportul." };

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
