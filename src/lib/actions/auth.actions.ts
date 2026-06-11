"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendMfaOtpEmail, sendAccountWelcomeEmail } from "@/lib/email";

function generateOtp(): { otp: string; otpHash: string; expiresAt: string } {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return { otp, otpHash, expiresAt };
}

function verifyOtpHash(code: string, storedHash: string, expiresAt: string): boolean {
  if (new Date() > new Date(expiresAt)) return false;
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

export async function login(formData: { email: string; password: string }) {
  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
  });

  if (error || !authData.user) {
    return { error: "Email sau parola incorecta. Incearca din nou." };
  }

  const user = authData.user;

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

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Autentifica-te din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) {
    return { error: "Cod incorect sau expirat." };
  }

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

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Incearca din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) return { error: "Cod incorect sau expirat." };

  await supabase.from("users_profile").update({ mfa_email_enabled: true, mfa_otp: null, mfa_otp_expires_at: null }).eq("id", user.id);
  return { success: true };
}

export async function verifyAndDisableMfaEmail(code: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: profile } = await supabase
    .from("users_profile").select("mfa_otp, mfa_otp_expires_at").eq("id", user.id).single();

  if (!profile?.mfa_otp || !profile?.mfa_otp_expires_at) return { error: "Codul a expirat. Incearca din nou." };
  if (!verifyOtpHash(code.trim(), profile.mfa_otp, profile.mfa_otp_expires_at)) return { error: "Cod incorect sau expirat." };

  await supabase.from("users_profile").update({ mfa_email_enabled: false, mfa_otp: null, mfa_otp_expires_at: null }).eq("id", user.id);
  return { success: true };
}

export async function register(formData: {
  full_name: string;
  email: string;
  password: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: { full_name: formData.full_name },
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "Exista deja un cont cu aceasta adresa de email." };
    }
    return { error: "Inregistrarea a esuat. Incearca din nou." };
  }

  // Send account welcome email (fire-and-forget)
  sendAccountWelcomeEmail(formData.email, { name: formData.full_name }).catch(() => {});

  // Clear stale onboarding cookie from previous session
  const cookieStore = await cookies();
  cookieStore.delete("onboarding_done");

  revalidatePath("/", "layout");
  redirect("/onboarding/details");
}

export async function forgotPassword(email: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: "Nu am putut trimite email-ul de resetare. Incearca din nou." };
  }

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

export async function trackOnboardingStep(step: "details" | "customize" | "plan") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Use admin client (onboarding_step not in generated types yet, and RLS may block)
  const { createAdminClient: getAdmin } = await import("@/lib/supabase/admin");
  const admin = getAdmin();
  const stepOrder: Record<string, number> = { registered: 0, details: 1, customize: 2, plan: 3, completed: 4 };
  const { data } = await admin.from("users_profile").select("onboarding_step").eq("id", user.id).single();
  const currentStep = (data as unknown as { onboarding_step?: string })?.onboarding_step ?? "registered";
  if (stepOrder[step] > (stepOrder[currentStep] ?? 0)) {
    await admin.from("users_profile").update({ onboarding_step: step } as never).eq("id", user.id);
  }
}
