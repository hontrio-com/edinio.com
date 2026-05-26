"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function login(formData: { email: string; password: string }) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
  });

  if (error) {
    return { error: "Email sau parola incorecta. Incearca din nou." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Autentificare esuata." };

  const { data: profile } = await supabase
    .from("users_profile")
    .select("onboarding_completed")
    .eq("id", user.id)
    .single();

  revalidatePath("/", "layout");

  if (!profile?.onboarding_completed) {
    redirect("/onboarding/details");
  }

  redirect("/dashboard");
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

  revalidatePath("/", "layout");
  redirect("/onboarding/details");
}

export async function forgotPassword(email: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
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
  redirect("/login");
}
