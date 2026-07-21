// Per-store email configuration: custom SMTP sender + template overrides, stored
// in store_settings.email_config (owner-only RLS). Everything is opt-in — with no
// SMTP enabled, store emails keep the Edinio sender + Edinio branding (default).

import { storeBaseUrl } from "@/lib/seo";

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;        // true = implicit TLS (465), false = STARTTLS (587)
  user: string;
  pass: string;
  from_email: string;
  from_name: string;
  reply_to?: string;
}

export type EmailTemplateKind =
  | "order_confirmation" | "order_status" | "abandoned_cart" | "custom_message" | "new_order";

export interface EmailTemplateOverride {
  subject?: string;
  heading?: string;       // plain text: the big title inside the email
  intro?: string;         // plain text (line breaks kept): the merchant's message/greeting
  button?: string;        // plain text: the call-to-action label (where the email has one)
}

// Email-level branding overrides (shared by every email kind), so a merchant can
// use a logo / accent color specific to their emails without touching the store.
export interface EmailBrandingOverride {
  logo?: string | null;
  color?: string;
}

export interface EmailConfig {
  smtp?: Partial<SmtpConfig>;
  templates?: Partial<Record<EmailTemplateKind, EmailTemplateOverride>>;
  branding?: EmailBrandingOverride;
}

export interface EmailBranding {
  storeName: string;
  logoUrl: string | null;
  color: string;
  storeUrl: string;
}

export interface StoreEmailSender {
  smtp?: SmtpConfig;      // present only when SMTP is enabled + complete -> custom send
  branding: EmailBranding;
  templates: Partial<Record<EmailTemplateKind, EmailTemplateOverride>>;
}

export function parseEmailConfig(raw: unknown): EmailConfig {
  const c = (raw ?? {}) as EmailConfig;
  return { smtp: c.smtp, templates: c.templates, branding: c.branding };
}

/** SMTP is usable only when enabled and every required field is present. */
export function smtpReady(smtp: Partial<SmtpConfig> | undefined): smtp is SmtpConfig {
  return !!(smtp?.enabled && smtp.host && smtp.port && smtp.user && smtp.pass && smtp.from_email);
}

export interface SenderBusiness {
  store_name: string | null;
  business_name: string;
  logo_url: string | null;
  primary_color: string | null;
  slug: string;
  custom_domain: string | null;
}

export function buildStoreSender(emailConfig: EmailConfig, business: SenderBusiness): StoreEmailSender {
  const smtp = emailConfig.smtp;
  const bo = emailConfig.branding;
  return {
    smtp: smtpReady(smtp) ? smtp : undefined,
    branding: {
      storeName: business.store_name || business.business_name,
      // Email-specific logo/color override, falling back to the store's own.
      logoUrl: bo?.logo ? bo.logo : business.logo_url,
      color: bo?.color || business.primary_color || "#1AB554",
      storeUrl: storeBaseUrl({ slug: business.slug, custom_domain: business.custom_domain }),
    },
    templates: emailConfig.templates ?? {},
  };
}

// Provider presets so "Google Workspace / M365 / Zoho / cPanel" feel like dedicated
// options while sharing one SMTP engine.
export const SMTP_PRESETS: { id: string; label: string; host: string; port: number; secure: boolean; hint?: string }[] = [
  { id: "google", label: "Google Workspace / Gmail", host: "smtp.gmail.com", port: 465, secure: true, hint: "Foloseste o parola de aplicatie (App Password) daca ai verificarea in 2 pasi activata." },
  { id: "microsoft", label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, secure: false },
  { id: "zoho", label: "Zoho Mail", host: "smtp.zoho.eu", port: 465, secure: true },
  { id: "custom", label: "Alt server (cPanel / hosting propriu)", host: "", port: 465, secure: true },
];
