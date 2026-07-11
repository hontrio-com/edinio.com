"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { defaultFormFields, type FormField } from "@/lib/pages/forms.types";
import type { Database } from "@/types/database.types";

type DB = SupabaseClient<Database>;

const MAX_FIELDS = 40;

async function requireOwner(supabase: DB, businessId: string): Promise<{ userId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  return biz ? { userId: user.id } : null;
}

/** Clamp/validate the field list coming from the editor (defensive, server-side). */
function sanitizeFields(fields: FormField[]): FormField[] {
  return (fields ?? []).slice(0, MAX_FIELDS).map((f) => ({
    id: String(f.id || ""),
    label: String(f.label ?? "").slice(0, 120),
    type: f.type,
    required: !!f.required,
    placeholder: f.placeholder ? String(f.placeholder).slice(0, 160) : "",
    helpText: f.helpText ? String(f.helpText).slice(0, 200) : undefined,
    options: Array.isArray(f.options) ? f.options.slice(0, 50).map((o) => String(o).slice(0, 120)) : undefined,
  }));
}

/* ─── Form CRUD ────────────────────────────────────────────────────────────── */

export async function createForm(
  businessId: string,
  name: string,
): Promise<{ error: string } | { success: true; formId: string }> {
  const supabase = await createClient();
  if (!(await requireOwner(supabase, businessId))) return { error: "Neautorizat" };
  const clean = name.trim() || "Formular nou";

  const { data, error } = await supabase
    .from("forms")
    .insert({ business_id: businessId, name: clean, fields: defaultFormFields() as never })
    .select("id")
    .single();
  if (error || !data) {
    logError({ action: "createForm", message: error?.message ?? "no row", details: { businessId } });
    return { error: "Eroare la crearea formularului." };
  }
  revalidatePath("/dashboard/pages/forms");
  return { success: true, formId: data.id };
}

export async function updateForm(
  formId: string,
  patch: {
    name?: string;
    fields?: FormField[];
    submit_label?: string;
    success_message?: string;
    email_enabled?: boolean;
    email_to?: string | null;
    mailchimp_enabled?: boolean;
    brevo_enabled?: boolean;
  },
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  // Resolve owning business (RLS also guards, but we want a clean error).
  const { data: form } = await supabase.from("forms").select("id, business_id").eq("id", formId).single();
  if (!form) return { error: "Formular negasit" };
  if (!(await requireOwner(supabase, form.business_id))) return { error: "Neautorizat" };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim() || "Formular";
  if (patch.fields !== undefined) update.fields = sanitizeFields(patch.fields);
  if (patch.submit_label !== undefined) update.submit_label = patch.submit_label.trim().slice(0, 60) || "Trimite";
  if (patch.success_message !== undefined) update.success_message = patch.success_message.trim().slice(0, 400) || "Multumim!";
  if (patch.email_enabled !== undefined) update.email_enabled = !!patch.email_enabled;
  if (patch.email_to !== undefined) {
    const e = (patch.email_to ?? "").trim();
    update.email_to = e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
  }
  if (patch.mailchimp_enabled !== undefined) update.mailchimp_enabled = !!patch.mailchimp_enabled;
  if (patch.brevo_enabled !== undefined) update.brevo_enabled = !!patch.brevo_enabled;

  const { error } = await supabase.from("forms").update(update as never).eq("id", formId);
  if (error) {
    logError({ action: "updateForm", message: error.message, details: { formId }, userId: user.id });
    return { error: "Eroare la salvarea formularului." };
  }
  revalidatePath("/dashboard/pages/forms");
  revalidatePath(`/dashboard/pages/forms/${formId}`);
  return { success: true };
}

export async function deleteForm(formId: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: form } = await supabase.from("forms").select("id, business_id").eq("id", formId).single();
  if (!form) return { error: "Formular negasit" };
  if (!(await requireOwner(supabase, form.business_id))) return { error: "Neautorizat" };

  const { error } = await supabase.from("forms").delete().eq("id", formId);
  if (error) return { error: "Eroare la stergerea formularului." };
  revalidatePath("/dashboard/pages/forms");
  return { success: true };
}

export async function duplicateForm(formId: string): Promise<{ error: string } | { success: true; formId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: src } = await supabase.from("forms").select("*").eq("id", formId).single();
  if (!src) return { error: "Formular negasit" };
  if (!(await requireOwner(supabase, src.business_id))) return { error: "Neautorizat" };

  const { data, error } = await supabase.from("forms").insert({
    business_id: src.business_id,
    name: `${src.name} (copie)`,
    fields: src.fields as never,
    submit_label: src.submit_label,
    success_message: src.success_message,
    email_enabled: src.email_enabled,
    email_to: src.email_to,
    mailchimp_enabled: src.mailchimp_enabled,
    brevo_enabled: src.brevo_enabled,
  }).select("id").single();
  if (error || !data) return { error: "Eroare la duplicarea formularului." };
  revalidatePath("/dashboard/pages/forms");
  return { success: true, formId: data.id };
}

/* ─── Submission management (Messages) ─────────────────────────────────────── */

export async function updateSubmission(
  submissionId: string,
  fields: { label: string; value: string }[],
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const clean = (fields ?? [])
    .filter((f) => f && typeof f.label === "string")
    .slice(0, 40)
    .map((f) => ({ label: String(f.label).slice(0, 120), value: String(f.value ?? "").slice(0, 5000) }));

  // Owner UPDATE is enforced by RLS; a non-owner update matches no rows.
  const { data, error } = await supabase
    .from("page_form_submissions")
    .update({ data: { fields: clean } as never })
    .eq("id", submissionId)
    .select("id");
  if (error) return { error: "Eroare la salvare." };
  if (!data || data.length === 0) return { error: "Neautorizat" };
  revalidatePath("/dashboard/pages/messages");
  return { success: true };
}

export async function toggleSubmissionRead(
  submissionId: string,
  isRead: boolean,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data, error } = await supabase
    .from("page_form_submissions")
    .update({ is_read: isRead })
    .eq("id", submissionId)
    .select("id");
  if (error) return { error: "Eroare la salvare." };
  if (!data || data.length === 0) return { error: "Neautorizat" };
  revalidatePath("/dashboard/pages/messages");
  return { success: true };
}

export async function deleteSubmission(submissionId: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  // No owner DELETE policy on submissions — verify ownership, then delete via service role.
  const admin = createAdminClient();
  const { data: sub } = await admin.from("page_form_submissions").select("id, business_id").eq("id", submissionId).single();
  if (!sub) return { error: "Mesaj negasit" };
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", sub.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Neautorizat" };

  const { error } = await admin.from("page_form_submissions").delete().eq("id", submissionId);
  if (error) return { error: "Eroare la stergere." };
  revalidatePath("/dashboard/pages/messages");
  return { success: true };
}
