"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import {
  campuriSablon, CU_OPTIUNI, esteSablonFormular, esteTipCamp, MAX_CAMPURI, MAX_FORMULARE, MAX_OPTIUNI, SABLOANE_FORMULAR, type FormField,
} from "@/lib/pages/forms.types";
import type { Database } from "@/types/database.types";

type DB = SupabaseClient<Database>;

/* Limitele stau in `forms.types.ts` (MAX_CAMPURI, MAX_OPTIUNI), ca editorul sa le arate pe aceleasi. */

async function requireOwner(supabase: DB, businessId: string): Promise<{ userId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  return biz ? { userId: user.id } : null;
}

/**
 * Clamp/validate the field list coming from the editor (defensive, server-side).
 *
 * ⚠ 26.09.2026: cel mult `MAX_CAMPURI` campuri si `MAX_OPTIUNI` optiuni, tipul
 * pe lista alba, eticheta obligatorie, id-uri unice (doua campuri cu acelasi id
 * si-ar fi amestecat raspunsurile la validarea trimiterii).
 */
function sanitizeFields(fields: FormField[]): FormField[] {
  const vazute = new Set<string>();
  return (fields ?? [])
    .filter((f) => f && typeof f.label === "string" && f.label.trim())
    .slice(0, MAX_CAMPURI)
    .map((f, i) => {
      let id = String(f.id || "").replace(/[^\w-]/g, "").slice(0, 60) || `f_${i}`;
      while (vazute.has(id)) id = `${id}_${i}`;
      vazute.add(id);
      const optiuni = Array.isArray(f.options)
        ? [...new Set(f.options.map((o) => String(o).trim().slice(0, 120)).filter(Boolean))].slice(0, MAX_OPTIUNI)
        : undefined;
      return {
        id,
        label: String(f.label).trim().slice(0, 120),
        type: esteTipCamp(f.type) ? f.type : "text",
        width: f.width === "half" ? "half" as const : undefined,
        required: !!f.required,
        placeholder: f.placeholder ? String(f.placeholder).slice(0, 160) : "",
        helpText: f.helpText ? String(f.helpText).slice(0, 200) : undefined,
        options: optiuni,
      };
    });
}

/** Cate formulare are deja magazinul (limita `MAX_FORMULARE`). */
async function catePeMagazin(supabase: DB, businessId: string): Promise<number> {
  const { count } = await supabase.from("forms").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  return count ?? 0;
}

/* ─── Form CRUD ────────────────────────────────────────────────────────────── */

export async function createForm(
  businessId: string,
  name: string,
  /** 26.09.2026: sablonul de pornire. Necunoscut sau lipsa = „Contact”, ca pana acum. */
  sablon?: string,
): Promise<{ error: string } | { success: true; formId: string }> {
  const supabase = await createClient();
  if (!(await requireOwner(supabase, businessId))) return { error: "Neautorizat" };
  if ((await catePeMagazin(supabase, businessId)) >= MAX_FORMULARE) {
    return { error: `Poți avea cel mult ${MAX_FORMULARE} de formulare. Șterge unul pe care nu-l mai folosești.` };
  }
  const clean = name.trim().slice(0, 120) || "Formular nou";
  const cheie = esteSablonFormular(sablon) ? sablon : "contact";
  const s = SABLOANE_FORMULAR.find((x) => x.cheie === cheie)!;

  const { data, error } = await supabase
    .from("forms")
    .insert({
      business_id: businessId, name: clean, fields: campuriSablon(cheie) as never,
      submit_label: s.buton, success_message: s.multumire,
    })
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
    klaviyo_enabled?: boolean;
    /**
     * `updated_at` de la incarcare (26.09.2026, ca la pagini): salvarea trece numai
     * daca formularul n-a fost salvat intre timp din alt tab. Lipsa = fara verificare.
     */
    versiune?: string;
  },
): Promise<{ error: string; conflict?: true } | { success: true; versiune: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  // Resolve owning business (RLS also guards, but we want a clean error).
  const { data: form } = await supabase.from("forms").select("id, business_id").eq("id", formId).single();
  if (!form) return { error: "Formular negasit" };
  if (!(await requireOwner(supabase, form.business_id))) return { error: "Neautorizat" };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120) || "Formular";
  if (patch.fields !== undefined) {
    if (Array.isArray(patch.fields) && patch.fields.length > MAX_CAMPURI) {
      return { error: `Un formular poate avea cel mult ${MAX_CAMPURI} de câmpuri.` };
    }
    const curate = sanitizeFields(patch.fields);
    // Un camp de alegere obligatoriu fara nicio optiune facea formularul imposibil de trimis.
    const farOptiuni = curate.find((f) => f.required && CU_OPTIUNI.includes(f.type) && (f.options ?? []).length === 0);
    if (farOptiuni) return { error: `Câmpul „${farOptiuni.label}” e obligatoriu, dar nu are nicio opțiune.` };
    update.fields = curate;
  }
  if (patch.submit_label !== undefined) update.submit_label = patch.submit_label.trim().slice(0, 60) || "Trimite";
  if (patch.success_message !== undefined) update.success_message = patch.success_message.trim().slice(0, 400) || "Multumim!";
  if (patch.email_enabled !== undefined) update.email_enabled = !!patch.email_enabled;
  if (patch.email_to !== undefined) {
    const e = (patch.email_to ?? "").trim();
    if (e) {
      /*
       * ⚠ Numai adresa magazinului sau a contului (25.09.2026). Formularul e public
       * si emailul pleaca de pe expeditorul platformei: o adresa straina facea din
       * el un releu de spam. Aceeasi regula se aplica si la trimitere
       * (`submitPageForm`), fiindca in tabel se poate scrie si pe langa aceasta
       * actiune. Masurat: singurul formular cu adresa proprie folosea deja emailul
       * magazinului.
       */
      const { data: biz } = await supabase.from("businesses").select("email").eq("id", form.business_id).single();
      const permise = [biz?.email?.trim(), user.email?.trim()].filter(Boolean).map((x) => x!.toLowerCase());
      if (!permise.includes(e.toLowerCase())) {
        return { error: "Mesajele pot merge doar pe emailul magazinului sau pe cel al contului tău. Lasă câmpul gol ca să ajungă pe emailul magazinului." };
      }
    }
    update.email_to = e || null;
  }
  if (patch.mailchimp_enabled !== undefined) update.mailchimp_enabled = !!patch.mailchimp_enabled;
  if (patch.brevo_enabled !== undefined) update.brevo_enabled = !!patch.brevo_enabled;
  if (patch.klaviyo_enabled !== undefined) update.klaviyo_enabled = !!patch.klaviyo_enabled;

  let cerere = supabase.from("forms").update(update as never).eq("id", formId);
  if (patch.versiune) cerere = cerere.eq("updated_at", patch.versiune);
  const { data: salvat, error } = await cerere.select("updated_at");
  if (error) {
    logError({ action: "updateForm", message: error.message, details: { formId }, userId: user.id });
    return { error: "Eroare la salvarea formularului." };
  }
  if (!salvat || salvat.length === 0) {
    return { error: "Formularul a fost modificat între timp (în alt tab sau de altcineva). Reîncarcă pagina ca să vezi ultima versiune.", conflict: true };
  }
  revalidatePath("/dashboard/pages/forms");
  revalidatePath(`/dashboard/pages/forms/${formId}`);
  return { success: true, versiune: salvat[0].updated_at };
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
  if ((await catePeMagazin(supabase, src.business_id)) >= MAX_FORMULARE) {
    return { error: `Poți avea cel mult ${MAX_FORMULARE} de formulare. Șterge unul pe care nu-l mai folosești.` };
  }

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
    klaviyo_enabled: src.klaviyo_enabled,
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
