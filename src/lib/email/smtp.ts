import nodemailer from "nodemailer";
import type { SmtpConfig } from "./config";

// A fresh transport per send (SMB transactional volume is low; avoids caching stale
// credentials). Never a module-scope singleton bound to one store's config.
function transport(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
}

export async function sendViaSmtp(
  smtp: SmtpConfig,
  msg: { from: string; to: string; subject: string; html: string; replyTo?: string },
): Promise<void> {
  await transport(smtp).sendMail({
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    replyTo: msg.replyTo,
  });
}

/** Verify credentials + connection (used by the "send test" / connect flow). */
export async function verifySmtp(smtp: SmtpConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await transport(smtp).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
