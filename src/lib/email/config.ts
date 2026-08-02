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
  /**
   * Unde ajung raspunsurile clientului.
   *
   * Adresa de expediere ramane a Edinio cand magazinul n-are SMTP propriu, si nu
   * are cum sa fie altfel: trimisa de pe domeniul lor prin serverul nostru, n-ar
   * trece de SPF si DKIM si ar ajunge la spam. Dar clientul care apasa
   * „Raspunde" trebuie sa scrie COMERCIANTULUI, nu intr-o cutie no-reply.
   */
  replyTo?: string;
}

/**
 * Ce scrie la expeditor: numele magazinului, adresa data.
 *
 * NUMELE e al magazinului, adresa ramane a Edinio cand comerciantul n-are server
 * propriu de email. Adresa nu are cum sa fie a lui: trimisa de pe domeniul lui
 * prin serverul nostru, n-ar trece de SPF si DKIM si ar ajunge la spam. Numele,
 * in schimb, e liber, si el e ce vede omul in lista de mesaje — adresa apare
 * abia daca deschide detaliile.
 *
 * Fiindca domeniul din `From` ramane acelasi cu cel semnat DKIM, Gmail NU pune
 * eticheta „via edinio.com". Fortand domeniul comerciantului, ar pune-o, si ar
 * arata mai rau decat adresa noastra.
 *
 * Numele vine de la comerciant si ajunge intr-un ANTET de email, deci se curata
 * inainte: o linie noua in el ar putea adauga anteturi de la sine (un `Bcc`
 * catre altcineva), iar ghilimelele si parantezele unghiulare rup sintaxa
 * adresei si mesajul nu mai pleaca deloc.
 */
export function fromLine(storeName: string | null | undefined, address: string): string {
  const nume = (storeName ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/["\\<>]/g, "")
    .trim()
    .slice(0, 78);
  return nume ? `"${nume}" <${address}>` : `Edinio.com <${address}>`;
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
  /** Emailul de contact al comerciantului, folosit ca Reply-To. */
  email?: string | null;
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
    replyTo: business.email?.trim() || undefined,
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
