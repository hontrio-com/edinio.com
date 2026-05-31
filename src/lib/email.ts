import { Resend } from "resend";
import { formatPrice } from "@/lib/utils/format";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const FROM = `Edinio.com <${FROM_EMAIL}>`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com";

export interface NotificationsConfig {
  notification_email: string;
  new_order: boolean;
}

export function parseNotificationsConfig(raw: Record<string, unknown>): NotificationsConfig {
  return {
    notification_email: typeof raw.notification_email === "string" ? raw.notification_email : "",
    new_order: raw.new_order !== false,
  };
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Edinio</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <!-- Logo / header -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <a href="${SITE_URL}" style="text-decoration:none;">
              <img src="${SITE_URL}/logo.png" width="44" height="44" alt="Edinio" style="display:inline-block;width:44px;height:auto;border:0;" />
            </a>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e4e4e7;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td align="center" style="padding-top:20px;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;">
              Edinio &mdash; Platforma ta de e-commerce &middot;
              <a href="${SITE_URL}" style="color:#1AB554;text-decoration:none;">edinio.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function buildAdminNotifyHtml(name: string, message: string): string {
  return baseTemplate(`
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Mesaj de la echipa Edinio</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${name ? `, ${name}` : ""},</p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#18181b;line-height:1.6;white-space:pre-wrap;">${message}</p>
    </div>
    <p style="margin:0;font-size:13px;color:#71717a;">Daca ai intrebari, raspunde direct la acest email.</p>
  `);
}

export function baseTemplateForTest(from: string): string {
  return baseTemplate(`
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Email de test</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Notificarile Edinio functioneaza corect.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:16px;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Configuratie activa</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#15803d;">Trimis de pe: <strong>${from}</strong></p>
    </div>
    <p style="margin:0;font-size:13px;color:#71717a;">Cand vine o comanda noua in magazinul tau vei primi un email similar cu detaliile comenzii.</p>
  `);
}

export async function sendOrderConfirmationToCustomer(
  to: string,
  order: {
    order_number: string;
    customer_name: string;
    total: number;
    items: { name: string; quantity: number; price: number }[];
    shipping_cost: number;
    business_name: string;
  }
) {
  if (!process.env.RESEND_API_KEY) return;

  const itemsRows = order.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;border-bottom:1px solid #f4f4f5;">${i.name} <span style="color:#a1a1aa;">x${i.quantity}</span></td>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;text-align:right;border-bottom:1px solid #f4f4f5;white-space:nowrap;">${formatPrice(i.price * i.quantity)}</td>
        </tr>`
    )
    .join("");

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Comanda ta a fost plasata!</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Multumim, <strong>${order.customer_name}</strong>! Comanda ta la <strong>${order.business_name}</strong> a fost primita si va fi procesata in curand.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;width:100%;box-sizing:border-box;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Comanda ${order.order_number}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td colspan="2" style="font-size:13px;color:#a1a1aa;padding-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Produsele tale</td>
      </tr>
      ${itemsRows}
      <tr>
        <td style="padding-top:10px;font-size:14px;color:#71717a;">Transport</td>
        <td style="padding-top:10px;font-size:14px;color:#71717a;text-align:right;">${order.shipping_cost === 0 ? "Gratuit" : formatPrice(order.shipping_cost)}</td>
      </tr>
      <tr>
        <td style="padding-top:10px;font-size:16px;font-weight:700;color:#18181b;border-top:2px solid #e4e4e7;">Total de plata</td>
        <td style="padding-top:10px;font-size:16px;font-weight:700;color:#1AB554;text-align:right;border-top:2px solid #e4e4e7;">${formatPrice(order.total)}</td>
      </tr>
    </table>

    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:20px;">
      <p style="margin:0;font-size:13px;color:#71717a;">Plata se face <strong>cash la livrare</strong>. Te rugam sa pregatesti suma exacta.</p>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Comanda ta ${order.order_number} a fost primita`,
    html: baseTemplate(content),
  });
}

export async function sendWelcomeEmail(
  to: string,
  data: { name: string; business_name: string; slug: string }
) {
  if (!process.env.RESEND_API_KEY) return;
  const storeUrl = `${SITE_URL}/${data.slug}`;
  const dashboardUrl = `${SITE_URL}/dashboard`;
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Felicitari${data.name ? `, ${data.name}` : ""}!</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Magazinul tau <strong>${data.business_name}</strong> a fost creat cu succes si este acum live pe Edinio.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Magazinul tau este online</p>
      <p style="margin:4px 0 0 0;font-size:13px;">
        <a href="${storeUrl}" style="color:#15803d;text-decoration:none;">${storeUrl}</a>
      </p>
    </div>

    <p style="margin:0 0 28px 0;font-size:14px;color:#71717a;">Urmatorul pas: adauga produse si configureaza-ti magazinul din panoul de control.</p>

    <div style="text-align:center;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Mergi la dashboard
      </a>
    </div>
  `;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Magazinul tau ${data.business_name} este live!`,
    html: baseTemplate(content),
  });
}

export async function sendMfaOtpEmail(to: string, otp: string) {
  if (!process.env.RESEND_API_KEY) return;
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Cod de verificare</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Foloseste codul de mai jos pentru a confirma autentificarea in contul tau Edinio.</p>
    <div style="text-align:center;margin:28px 0;padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
      <span style="font-size:40px;font-weight:800;letter-spacing:10px;color:#1AB554;font-family:monospace;">${otp}</span>
    </div>
    <p style="margin:0;font-size:13px;color:#71717a;text-align:center;">Codul este valabil <strong>10 minute</strong>. Daca nu ai initiat tu aceasta autentificare, ignora acest email.</p>
  `;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `${otp} — Codul tau de verificare Edinio`,
    html: baseTemplate(content),
  });
}

const SUPPORT_ADMIN_EMAIL = process.env.SUPPORT_ADMIN_EMAIL ?? "support@edinio.com";

export async function sendNewSupportTicketToAdmin(data: {
  ticketId: string;
  subject: string;
  category: string;
  priority: string;
  userEmail: string;
  businessName: string | null;
  content: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const categoryLabel: Record<string, string> = {
    technical: "Tehnic", billing: "Facturare", feature: "Cerere functionalitate", other: "Altele",
  };
  const priorityLabel: Record<string, string> = {
    low: "Scazuta", normal: "Normala", high: "Mare", urgent: "Urgenta",
  };
  const priorityColor: Record<string, string> = {
    low: "#71717a", normal: "#3b82f6", high: "#f97316", urgent: "#ef4444",
  };
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Tichet nou de suport</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Un client a deschis un tichet nou care necesita atentia ta.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding:10px 14px;background:#f4f4f5;border-radius:8px 8px 0 0;border-bottom:1px solid #e4e4e7;">
          <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.5px;">Subiect</span>
          <p style="margin:2px 0 0 0;font-size:15px;font-weight:600;color:#18181b;">${data.subject}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#f4f4f5;border-radius:0 0 8px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Categorie</span>
                <p style="margin:2px 0 0 0;font-size:13px;color:#3f3f46;">${categoryLabel[data.category] ?? data.category}</p>
              </td>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Prioritate</span>
                <p style="margin:2px 0 0 0;font-size:13px;font-weight:600;color:${priorityColor[data.priority] ?? "#3f3f46"};">${priorityLabel[data.priority] ?? data.priority}</p>
              </td>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Client</span>
                <p style="margin:2px 0 0 0;font-size:13px;color:#3f3f46;">${data.userEmail}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${data.businessName ? `<p style="margin:0 0 16px 0;font-size:13px;color:#71717a;">Magazin: <strong>${data.businessName}</strong></p>` : ""}
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#3f3f46;white-space:pre-wrap;">${data.content}</p>
    </div>
    <div style="text-align:center;">
      <a href="${SITE_URL}/dashboard/suport/${data.ticketId}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Vezi tichetul
      </a>
    </div>
  `;
  await resend.emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: `[Suport] ${data.subject} — ${data.userEmail}`,
    html: baseTemplate(content),
  });
}

export async function sendSupportReplyToAdmin(data: {
  ticketId: string;
  subject: string;
  userEmail: string;
  content: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const emailContent = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Raspuns nou la tichet</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;"><strong>${data.userEmail}</strong> a raspuns la tichetul <em>${data.subject}</em>.</p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#3f3f46;white-space:pre-wrap;">${data.content}</p>
    </div>
    <div style="text-align:center;">
      <a href="${SITE_URL}/dashboard/suport/${data.ticketId}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Raspunde
      </a>
    </div>
  `;
  await resend.emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: `[Suport] RE: ${data.subject} — ${data.userEmail}`,
    html: baseTemplate(emailContent),
  });
}

export async function sendAgentReplyToUser(data: {
  to: string;
  ticketId: string;
  subject: string;
  content: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const ticketUrl = `${SITE_URL}/dashboard/suport/${data.ticketId}`;
  const emailContent = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Raspuns la tichetul tau</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Echipa Edinio a raspuns la tichetul tau: <strong>${data.subject}</strong>.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#15803d;white-space:pre-wrap;">${data.content}</p>
    </div>
    <div style="text-align:center;">
      <a href="${ticketUrl}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Raspunde sau vezi conversatia
      </a>
    </div>
  `;
  await resend.emails.send({
    from: FROM,
    to: data.to,
    subject: `Raspuns la tichetul tau: ${data.subject}`,
    html: baseTemplate(emailContent),
  });
}

export async function sendDomainOrderToAdmin(data: {
  orderId: string;
  domain: string;
  tld: string;
  period: number;
  totalPrice: number;
  customerName: string;
  customerEmail: string;
  businessName: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const adminUrl = `${SITE_URL}/admin/domenii`;
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Comanda noua de domeniu</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Un client a comandat un domeniu care trebuie inregistrat manual.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:18px;font-weight:700;color:#16a34a;font-family:monospace;">${data.domain}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:10px 14px;background:#f4f4f5;border-radius:8px 8px 0 0;border-bottom:1px solid #e4e4e7;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:50%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Client</span>
                <p style="margin:2px 0 0 0;font-size:14px;font-weight:600;color:#18181b;">${data.customerName}</p>
                <p style="margin:2px 0 0 0;font-size:13px;color:#71717a;">${data.customerEmail}</p>
              </td>
              <td style="width:50%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Magazin</span>
                <p style="margin:2px 0 0 0;font-size:14px;font-weight:600;color:#18181b;">${data.businessName}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#f4f4f5;border-radius:0 0 8px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Extensie</span>
                <p style="margin:2px 0 0 0;font-size:13px;color:#3f3f46;">${data.tld}</p>
              </td>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Perioada</span>
                <p style="margin:2px 0 0 0;font-size:13px;color:#3f3f46;">${data.period} ${data.period === 1 ? "an" : "ani"}</p>
              </td>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Total</span>
                <p style="margin:2px 0 0 0;font-size:13px;font-weight:700;color:#1AB554;">${data.totalPrice} lei</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <div style="text-align:center;">
      <a href="${adminUrl}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Gestioneaza comanda
      </a>
    </div>
  `;
  await resend.emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: `[Domeniu] Comanda noua: ${data.domain} — ${data.customerName}`,
    html: baseTemplate(content),
  });
}

export async function sendNewOrderEmail(
  to: string,
  order: {
    order_number: string;
    customer_name: string;
    customer_phone: string;
    total: number;
    items: { name: string; quantity: number; price: number }[];
    shipping_cost: number;
    business_name: string;
    order_id: string;
  }
) {
  if (!process.env.RESEND_API_KEY) return;

  const itemsRows = order.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;border-bottom:1px solid #f4f4f5;">${i.name} <span style="color:#a1a1aa;">x${i.quantity}</span></td>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;text-align:right;border-bottom:1px solid #f4f4f5;white-space:nowrap;">${formatPrice(i.price * i.quantity)}</td>
        </tr>`
    )
    .join("");

  const dashboardUrl = `${SITE_URL}/dashboard/orders/${order.order_id}`;

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Comanda noua!</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Ai primit o comanda noua la magazinul <strong>${order.business_name}</strong>.</p>

    <!-- Order badge -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;display:inline-block;width:100%;box-sizing:border-box;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Comanda ${order.order_number}</p>
    </div>

    <!-- Customer info -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="font-size:13px;color:#a1a1aa;padding-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Client</td>
      </tr>
      <tr>
        <td style="font-size:15px;color:#18181b;font-weight:600;">${order.customer_name}</td>
      </tr>
      <tr>
        <td style="font-size:14px;color:#71717a;">${order.customer_phone}</td>
      </tr>
    </table>

    <!-- Items -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td colspan="2" style="font-size:13px;color:#a1a1aa;padding-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Produse</td>
      </tr>
      ${itemsRows}
      <tr>
        <td style="padding-top:10px;font-size:14px;color:#71717a;">Transport</td>
        <td style="padding-top:10px;font-size:14px;color:#71717a;text-align:right;">${order.shipping_cost === 0 ? "Gratuit" : formatPrice(order.shipping_cost)}</td>
      </tr>
      <tr>
        <td style="padding-top:10px;font-size:16px;font-weight:700;color:#18181b;border-top:2px solid #e4e4e7;">Total</td>
        <td style="padding-top:10px;font-size:16px;font-weight:700;color:#1AB554;text-align:right;border-top:2px solid #e4e4e7;">${formatPrice(order.total)}</td>
      </tr>
    </table>

    <!-- CTA -->
    <div style="text-align:center;margin-top:28px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Vezi comanda in dashboard
      </a>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Comanda noua ${order.order_number} - ${order.customer_name}`,
    html: baseTemplate(content),
  });
}

// ── Order status change → Customer ──────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; subject: string; color: string; bgColor: string; borderColor: string; message: string }> = {
  confirmed: {
    label: "Confirmata",
    subject: "Comanda ta a fost confirmata",
    color: "#2563eb",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
    message: "Comanda ta a fost confirmata si este in curs de pregatire. Te vom notifica cand va fi expediata.",
  },
  shipped: {
    label: "Expediata",
    subject: "Comanda ta a fost expediata",
    color: "#9333ea",
    bgColor: "#faf5ff",
    borderColor: "#e9d5ff",
    message: "Comanda ta a fost expediata si este in drum spre tine.",
  },
  delivered: {
    label: "Livrata",
    subject: "Comanda ta a fost livrata",
    color: "#16a34a",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    message: "Comanda ta a fost livrata cu succes. Multumim ca ai cumparat de la noi!",
  },
  cancelled: {
    label: "Anulata",
    subject: "Comanda ta a fost anulata",
    color: "#dc2626",
    bgColor: "#fef2f2",
    borderColor: "#fecaca",
    message: "Comanda ta a fost anulata. Daca ai intrebari, te rugam sa ne contactezi.",
  },
};

export async function sendOrderStatusToCustomer(
  to: string,
  order: {
    order_number: string;
    customer_name: string;
    total: number;
    status: string;
    business_name: string;
    awb?: string | null;
  }
) {
  if (!process.env.RESEND_API_KEY) return;

  const cfg = STATUS_CONFIG[order.status];
  if (!cfg) return;

  const awbSection = order.status === "shipped" && order.awb
    ? `<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:16px;">
        <p style="margin:0;font-size:13px;color:#71717a;">Numar AWB: <strong style="color:#18181b;font-family:monospace;">${order.awb}</strong></p>
      </div>`
    : "";

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${cfg.subject}</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna, <strong>${order.customer_name}</strong>! Iti trimitem un update despre comanda ta la <strong>${order.business_name}</strong>.</p>

    <div style="background:${cfg.bgColor};border:1px solid ${cfg.borderColor};border-radius:10px;padding:14px 18px;margin-bottom:16px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:13px;color:${cfg.color};font-weight:600;">Comanda ${order.order_number}</p>
            <p style="margin:4px 0 0 0;font-size:13px;color:${cfg.color};">Status: <strong>${cfg.label}</strong></p>
          </td>
          <td style="text-align:right;vertical-align:top;">
            <p style="margin:0;font-size:15px;font-weight:700;color:${cfg.color};">${formatPrice(order.total)}</p>
          </td>
        </tr>
      </table>
    </div>

    <p style="margin:0;font-size:14px;color:#71717a;line-height:1.6;">${cfg.message}</p>
    ${awbSection}
  `;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${cfg.subject} — ${order.order_number}`,
    html: baseTemplate(content),
  });
}

// ── Subscription activated → User ───────────────────────────────────────────

export async function sendSubscriptionActivatedEmail(
  to: string,
  data: { name: string; plan: string; expiresAt: string }
) {
  if (!process.env.RESEND_API_KEY) return;

  const formattedDate = new Date(data.expiresAt).toLocaleDateString("ro-RO", {
    day: "numeric", month: "long", year: "numeric",
  });

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Abonamentul tau este activ!</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Felicitari${data.name ? `, ${data.name}` : ""}! Plata a fost procesata cu succes.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Plan ${data.plan}</p>
            <p style="margin:4px 0 0 0;font-size:13px;color:#15803d;">Activ pana la: <strong>${formattedDate}</strong></p>
          </td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 28px 0;font-size:14px;color:#71717a;">Acum ai acces la toate functionalitatile incluse in planul tau. Succes cu vanzarile!</p>

    <div style="text-align:center;">
      <a href="${SITE_URL}/dashboard" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Mergi la dashboard
      </a>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Abonamentul ${data.plan} a fost activat`,
    html: baseTemplate(content),
  });
}

// ── Payment failed → User ───────────────────────────────────────────────────

export async function sendPaymentFailedEmail(
  to: string,
  data: { name: string; plan: string }
) {
  if (!process.env.RESEND_API_KEY) return;

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Plata nu a putut fi procesata</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${data.name ? `, ${data.name}` : ""}. Am incercat sa procesam plata pentru abonamentul tau <strong>${data.plan}</strong>, dar aceasta nu a reusit.</p>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#dc2626;font-weight:600;">Plata esuata</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#b91c1c;">Te rugam sa actualizezi metoda de plata pentru a evita suspendarea magazinului.</p>
    </div>

    <p style="margin:0 0 28px 0;font-size:14px;color:#71717a;">Stripe va reincerca automat plata in urmatoarele zile. Daca problema persista, actualizeaza datele cardului din setari.</p>

    <div style="text-align:center;">
      <a href="${SITE_URL}/dashboard/settings" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Actualizeaza metoda de plata
      </a>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Plata pentru abonamentul Edinio nu a reusit",
    html: baseTemplate(content),
  });
}

// ── Store suspended → User ──────────────────────────────────────────────────

export async function sendStoreSuspendedEmail(
  to: string,
  data: { name: string; graceUntil: string }
) {
  if (!process.env.RESEND_API_KEY) return;

  const formattedDate = new Date(data.graceUntil).toLocaleDateString("ro-RO", {
    day: "numeric", month: "long", year: "numeric",
  });

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Magazinul tau va fi suspendat</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${data.name ? `, ${data.name}` : ""}. Abonamentul tau Edinio a fost anulat din cauza unei plati esuate.</p>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#dc2626;font-weight:600;">Perioada de gratie: pana la ${formattedDate}</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#b91c1c;">Dupa aceasta data, magazinul tau nu va mai fi vizibil pentru clienti.</p>
    </div>

    <p style="margin:0 0 28px 0;font-size:14px;color:#71717a;">Pentru a reactiva magazinul, reaboneaza-te din panoul de control. Toate datele tale (produse, comenzi, setari) sunt pastrate.</p>

    <div style="text-align:center;">
      <a href="${SITE_URL}/dashboard/settings" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Reaboneaza-te acum
      </a>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Magazinul tau Edinio va fi suspendat",
    html: baseTemplate(content),
  });
}

