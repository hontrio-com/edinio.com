// Editable email preview for the WYSIWYG template editor. Renders the SAME
// store-branded shell the customer receives (via storeEmailShell), with sample
// order data for context, and marks the merchant-editable regions (title,
// message, button) as contenteditable + the logo as a click target. The editable
// texts show their raw {{tokens}} (not substituted) so editing keeps the merge
// fields; the structured parts use sample data. Client-safe (pure).

import { storeEmailShell } from "./store-shell";
import type { EmailBranding, EmailTemplateKind } from "./config";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function text(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

const SAMPLE = { nume_client: "Andrei Popescu", numar_comanda: "#0042" };

const DEFAULT_HEADING: Record<EmailTemplateKind, string> = {
  order_confirmation: "Comanda ta a fost plasata!",
  order_status: "Comanda ta a fost expediata",
  abandoned_cart: "Ti-au ramas produse in cos",
  new_order: "Comanda noua!",
  custom_message: "Mesaj nou",
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

export interface EditableValues {
  subject: string;
  heading?: string;   // when provided, the title is editable; otherwise a fixed sample title is shown
  intro: string;
  button?: string;    // when provided, the call-to-action label is editable
}

/** Full editable email HTML + resolved subject, for the in-place editor iframe. */
export function buildEditableEmail(
  kind: EmailTemplateKind,
  branding: EmailBranding,
  values: EditableValues,
  editable: boolean,
): { subject: string; html: string } {
  const color = /^#[0-9a-fA-F]{3,8}$/.test(branding.color) ? branding.color : "#1AB554";
  const subject = (values.subject || "").trim() || "(fara subiect)";

  const headingText = values.heading !== undefined ? values.heading : DEFAULT_HEADING[kind];
  const headingEditable = editable && values.heading !== undefined;
  const headingHtml = `<h2 ${headingEditable ? 'data-field="heading" contenteditable="true"' : ""} style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${text(headingText)}</h2>`;

  const introRaw = (values.intro ?? "").trim();
  const introInner = introRaw ? text(introRaw) : `Buna, ${SAMPLE.nume_client}!`;
  const introHtml = `<div ${editable ? 'data-field="intro" contenteditable="true"' : ""} style="font-size:14px;color:#71717a;line-height:1.7;margin:0 0 24px 0;min-height:22px;">${introInner}</div>`;

  const orderBox = (bg: string, bd: string, fg: string) =>
    `<div style="background:${bg};border:1px solid ${bd};border-radius:10px;padding:14px 18px;margin-bottom:20px;"><p style="margin:0;font-size:13px;color:${fg};font-weight:600;">Comanda ${SAMPLE.numar_comanda}</p></div>`;

  let body = "";
  if (kind === "order_confirmation") {
    body = orderBox("#f0fdf4", "#bbf7d0", "#16a34a") + sampleItems(color) + `<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:20px;"><p style="margin:0;font-size:13px;color:#71717a;">Metoda de plata: <strong>ramburs la livrare</strong></p></div>`;
  } else if (kind === "order_status") {
    body = `<div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:14px 18px;margin-bottom:16px;"><p style="margin:0;font-size:13px;color:#9333ea;font-weight:600;">Comanda ${SAMPLE.numar_comanda}</p><p style="margin:4px 0 0 0;font-size:13px;color:#9333ea;">Status: <strong>Expediata</strong></p></div><p style="margin:0;font-size:14px;color:#71717a;line-height:1.6;">Comanda ta este in drum spre tine.</p>`;
  } else if (kind === "abandoned_cart") {
    const btnLabel = values.button !== undefined ? values.button : "Finalizeaza comanda";
    const btnAttr = editable && values.button !== undefined ? 'data-field="button" contenteditable="true"' : "";
    body = sampleItems(color) + `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td align="center"><a href="#" ${btnAttr} style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;">${text(btnLabel)}</a></td></tr></table>`;
  } else {
    body = orderBox("#f0fdf4", "#bbf7d0", "#16a34a") + sampleItems(color) + `<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:16px;"><p style="margin:0;font-size:13px;color:#71717a;">Client: <strong>${SAMPLE.nume_client}</strong></p></div>`;
  }

  const content = `${headingHtml}${introHtml}${body}`;
  return { subject, html: storeEmailShell(branding, content, { editable }) };
}
