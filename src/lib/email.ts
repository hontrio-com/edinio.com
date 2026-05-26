import { Resend } from "resend";
import { formatPrice } from "@/lib/utils/format";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.ro";

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
            <span style="font-size:22px;font-weight:800;color:#1AB554;letter-spacing:-0.5px;">edinio</span>
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
              <a href="${SITE_URL}" style="color:#1AB554;text-decoration:none;">edinio.ro</a>
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

