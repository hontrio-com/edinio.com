"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseEmailConfig, smtpReady, type SmtpConfig, type EmailConfig } from "@/lib/email/config";
import { sendViaSmtp, verifySmtp } from "@/lib/email/smtp";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function owns(supabase: ServerClient, businessId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", userId).single();
  return !!data;
}

async function loadConfig(supabase: ServerClient, businessId: string): Promise<EmailConfig> {
  const { data } = await supabase.from("store_settings").select("email_config").eq("business_id", businessId).single();
  return parseEmailConfig(data?.email_config);
}

async function saveConfig(supabase: ServerClient, businessId: string, config: EmailConfig): Promise<boolean> {
  const { data: existing } = await supabase.from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await supabase.from("store_settings")
      .update({ email_config: config as never, updated_at: new Date().toISOString() }).eq("business_id", businessId);
    return !error;
  }
  const { error } = await supabase.from("store_settings").insert({ business_id: businessId, email_config: config as never });
  return !error;
}

export interface SmtpInput {
  enabled: boolean; host: string; port: number; secure: boolean;
  user: string; pass: string; from_email: string; from_name: string; reply_to?: string;
}

// The password is write-only: the UI sends it only when the merchant typed a new
// one; a blank pass keeps whatever is already stored.
export async function updateSmtpConfig(businessId: string, input: SmtpInput): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await owns(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(supabase, businessId);
  const prevPass = config.smtp?.pass ?? "";
  const smtp: SmtpConfig = {
    enabled: input.enabled,
    host: input.host.trim(),
    port: Number(input.port) || 465,
    secure: !!input.secure,
    user: input.user.trim(),
    pass: input.pass.trim() || prevPass,
    from_email: input.from_email.trim(),
    from_name: input.from_name.trim(),
    reply_to: input.reply_to?.trim() || undefined,
  };

  // Verify before enabling, so a broken sender is never saved as active.
  if (smtp.enabled) {
    if (!smtpReady(smtp)) return { error: "Completeaza toate campurile (server, port, utilizator, parola, email expeditor)." };
    const v = await verifySmtp(smtp);
    if (!v.ok) return { error: `Conexiunea SMTP a esuat: ${v.error}` };
  }

  const ok = await saveConfig(supabase, businessId, { ...config, smtp });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function sendTestEmail(businessId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await owns(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const smtp = (await loadConfig(supabase, businessId)).smtp;
  if (!smtpReady(smtp)) return { error: "Configureaza si salveaza SMTP-ul mai intai." };

  const from = smtp.from_name ? `${smtp.from_name} <${smtp.from_email}>` : smtp.from_email;
  try {
    await sendViaSmtp(smtp, {
      from,
      to: smtp.from_email,
      subject: "Test — email configurat corect",
      html: `<div style="font-family:sans-serif;padding:24px;"><h2 style="margin:0 0 8px;">Functioneaza!</h2><p style="color:#52525b;">Emailul tau propriu este configurat corect. De acum, emailurile magazinului catre clienti pleaca de pe aceasta adresa.</p></div>`,
    });
    return { success: true };
  } catch (e) {
    return { error: `Trimiterea a esuat: ${(e as Error).message}` };
  }
}
