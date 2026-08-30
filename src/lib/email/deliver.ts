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
const EDINIO_FROM = `Edinio.com <${EDINIO_ADDRESS}>`;

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
  const brandat = fromLine(sender?.branding.storeName, EDINIO_ADDRESS);
  const replyTo = sender?.replyTo ?? msg.replyTo;

  const respins = await trimitePrinResend(brandat, replyTo, msg);
  if (!respins) return;

  /*
   * Marca nu are voie sa opreasca mesajul.
   *
   * Expeditorul si `Reply-To` sunt acum compuse din date scrise de comerciant.
   * Daca Resend respinge tocmai din cauza lor, clientul ar ramane fara emailul
   * de confirmare a comenzii — adica exact paguba pe care incercam sa o evitam
   * infrumusetand emailul. Asa ca se reincearca o data cu expeditorul simplu:
   * mai bine un email cu marca noastra decat niciunul.
   *
   * Se reincearca DOAR cand Resend a raspuns „nu il iau" (`error`), niciodata
   * cand apelul in sine a crapat: acolo mesajul poate sa fi plecat deja, iar o
   * reincercare l-ar trimite de doua ori.
   */
  if (brandat === EDINIO_FROM && !replyTo) throw new Error(respins);
  logError({
    action: "email.resend.brandRejected",
    message: respins,
    details: { from: brandat, hasReplyTo: !!replyTo },
    severity: "warning",
  });
  const respinsSiSimplu = await trimitePrinResend(EDINIO_FROM, undefined, msg);
  if (respinsSiSimplu) throw new Error(respinsSiSimplu);
}

/**
 * Trimite si intoarce MOTIVUL respingerii, sau `null` cand a plecat.
 *
 * SDK-ul Resend nu arunca la respingere, intoarce `{ data, error }`, iar codul
 * de aici ignora demult raspunsul: un email refuzat (adresa pe lista de
 * suprimare, antet invalid) disparea in tacere, si chiar raporta „trimis" catre
 * comerciant. Erorile de RETEA arunca in continuare, si trebuie sa arunce:
 * acolo nu se stie daca mesajul a plecat sau nu.
 */
async function trimitePrinResend(
  from: string,
  replyTo: string | undefined,
  msg: { to: string; subject: string; html: string },
): Promise<string | null> {
  const res = await getResend().emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    replyTo,
  });
  return res.error ? (res.error.message || "Resend a respins mesajul") : null;
}
