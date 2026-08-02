import { Resend } from "resend";
import { fromLine, type StoreEmailSender } from "./config";
import { sendViaSmtp } from "./smtp";
import { logError } from "@/lib/error-logger";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const EDINIO_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

/**
 * Deliver a store-facing email: via the merchant's SMTP when they've opted in
 * (sender.smtp present -> from their domain), else via Edinio's Resend (the
 * unchanged default). Best-effort: an SMTP failure falls back to Resend so the
 * email still goes out, and any failure is logged, never thrown into the caller.
 */
export async function deliverStoreEmail(
  sender: StoreEmailSender | undefined,
  msg: { to: string; subject: string; html: string; replyTo?: string },
): Promise<void> {
  const smtp = sender?.smtp;
  if (smtp) {
    try {
      const from = smtp.from_name ? `${smtp.from_name} <${smtp.from_email}>` : smtp.from_email;
      await sendViaSmtp(smtp, { from, to: msg.to, subject: msg.subject, html: msg.html, replyTo: smtp.reply_to || msg.replyTo });
      return;
    } catch (e) {
      logError({ action: "email.smtp", message: (e as Error).message, severity: "warning" });
      // fall through to Resend so the customer still receives the email
    }
  }
  if (!process.env.RESEND_API_KEY) return;
  // Numele magazinului la expeditor, si cand pleaca prin Resend-ul nostru: pana
  // acum scria „Edinio.com" in casuta clientului unui magazin care n-avea SMTP.
  await getResend().emails.send({
    from: fromLine(sender?.branding.storeName, EDINIO_ADDRESS),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    replyTo: sender?.replyTo ?? msg.replyTo,
  });
}
