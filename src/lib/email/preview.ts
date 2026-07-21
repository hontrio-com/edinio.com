// Live email preview for the template editor: renders the SAME store-branded
// shell the customer receives, with sample data, so a merchant sees exactly how
// the email looks as they edit. Client-safe (pure: only storeEmailShell + types).

import { storeEmailShell } from "./store-shell";
import type { EmailBranding, EmailTemplateKind } from "./config";

function subst(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => vars[String(k).toLowerCase()] ?? "");
}

const SAMPLE = {
  nume_client: "Andrei Popescu",
  numar_comanda: "#0042",
  total: "149,00 lei",
  status: "Expediata",
};

function sampleItems(color: string): string {
  const row = (n: string, q: number, p: string) =>
    `<tr><td style="padding:8px 0;font-size:14px;color:#3f3f46;border-bottom:1px solid #f4f4f5;">${n} <span style="color:#a1a1aa;">x${q}</span></td><td style="padding:8px 0;font-size:14px;color:#3f3f46;text-align:right;border-bottom:1px solid #f4f4f5;white-space:nowrap;">${p}</td></tr>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
    <tr><td colspan="2" style="font-size:13px;color:#a1a1aa;padding-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Produse</td></tr>
    ${row("Tricou premium", 1, "89,00 lei")}${row("Sapca brodata", 1, "60,00 lei")}
    <tr><td style="padding-top:10px;font-size:16px;font-weight:700;color:#18181b;border-top:2px solid #e4e4e7;">Total</td><td style="padding-top:10px;font-size:16px;font-weight:700;color:${color};text-align:right;border-top:2px solid #e4e4e7;">149,00 lei</td></tr>
  </table>`;
}

/** Build the full email HTML + resolved subject for a live preview with sample data. */
export function buildEmailPreview(
  kind: EmailTemplateKind,
  branding: EmailBranding,
  subjectTpl: string,
  introTpl: string,
): { subject: string; html: string } {
  const vars = { ...SAMPLE, nume_magazin: branding.storeName };
  const subject = subst(subjectTpl.trim() || "(fara subiect)", vars);
  const color = /^#[0-9a-fA-F]{3,8}$/.test(branding.color) ? branding.color : "#1AB554";

  const intro = introTpl.trim()
    ? `<div style="font-size:14px;color:#71717a;line-height:1.7;margin:0 0 24px 0;">${subst(introTpl, vars)}</div>`
    : `<p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna, ${SAMPLE.nume_client}!</p>`;

  let heading = "", body = "";
  if (kind === "order_confirmation") {
    heading = "Comanda ta a fost plasata!";
    body = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;"><p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Comanda ${SAMPLE.numar_comanda}</p></div>${sampleItems(color)}<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:20px;"><p style="margin:0;font-size:13px;color:#71717a;">Metoda de plata: <strong>ramburs la livrare</strong></p></div>`;
  } else if (kind === "order_status") {
    heading = "Comanda ta a fost expediata";
    body = `<div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:14px 18px;margin-bottom:16px;"><p style="margin:0;font-size:13px;color:#9333ea;font-weight:600;">Comanda ${SAMPLE.numar_comanda}</p><p style="margin:4px 0 0 0;font-size:13px;color:#9333ea;">Status: <strong>Expediata</strong></p></div><p style="margin:0;font-size:14px;color:#71717a;line-height:1.6;">Comanda ta este in drum spre tine.</p>`;
  } else if (kind === "abandoned_cart") {
    heading = "Ti-au ramas produse in cos";
    body = `${sampleItems(color)}<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td align="center"><a href="#" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;">Finalizeaza comanda</a></td></tr></table>`;
  } else {
    heading = "Comanda noua!";
    body = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:8px;"><p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Comanda ${SAMPLE.numar_comanda}</p></div>${sampleItems(color)}<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:16px;"><p style="margin:0;font-size:13px;color:#71717a;">Client: <strong>${SAMPLE.nume_client}</strong></p></div>`;
  }

  const content = `<h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${heading}</h2>${intro}${body}`;
  return { subject, html: storeEmailShell(branding, content) };
}
