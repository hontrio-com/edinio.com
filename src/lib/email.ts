import { Resend } from "resend";
import { formatPrice } from "@/lib/utils/format";
import { escapeHtml as esc, escapeUrl } from "@/lib/utils/html-escape";
import type { StoreEmailSender } from "@/lib/email/config";
import { storeEmailShell } from "@/lib/email/store-shell";
import { deliverStoreEmail } from "@/lib/email/deliver";
import { renderTemplate } from "@/lib/email/templates";
import type { BillingCompany } from "@/lib/billing/company";
// Randurile de bani ale unei comenzi (Subtotal, extraoptiuni, reduceri, TVA) se
// construiesc INTR-UN SINGUR LOC, pentru amandoua emailurile. Vezi acolo de ce.
import { randuriDeBani, type BaniComanda } from "@/lib/email/order-totals";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
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

/*
 * Regula de escapare in acest fisier, ca sa nu se mai piarda (2026-08-04).
 *
 * Fiecare `${...}` din sabloane e de UNA din trei feluri:
 *   1. text variabil (nume de client, de produs, de magazin, cod de reducere,
 *      continut de tichet) -> trece prin `esc`. Fara exceptii: pana acum
 *      `sendOrderConfirmationToCustomer` nu escapa NIMIC, iar `placeOrder` e
 *      export „use server" cu adresa de destinatie aleasa de apelant.
 *   2. fragment HTML compus tot aici (`itemsRows`, `discountRow`, `intro`,
 *      `bodyHtml`, `rows`, `heading`) -> NU se escapeaza, altfel clientul
 *      primeste marcaj brut pe ecran. Sunt vreo cincisprezece.
 *   3. numar deja formatat (`formatPrice`, `toLocaleString`, cantitati) -> nu
 *      poate contine caractere speciale, se lasa in pace.
 *
 * Adresele din `href` care CONTIN date variabile trec prin `escapeUrl`, nu prin
 * `esc`: acolo escaparea inchide iesirea din atribut, dar nu opreste
 * `javascript:`. Cele compuse doar din `SITE_URL` si text fix se lasa asa cum
 * sunt — n-au ce sa poarte.
 *
 * SUBIECTELE nu se escapeaza niciodata — sunt anteturi de email, nu HTML, si
 * un „&amp;" acolo se vede ca atare in casuta destinatarului.
 */

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

/**
 * Trimite un email care vine DIN PARTEA MAGAZINULUI.
 *
 * Invelisul cu marca magazinului era legat de SMTP, nu de magazin: cine nu-si
 * conectase server propriu de email isi trimitea clientii cu logo Edinio, subsol
 * Edinio si expeditor „Edinio.com". Adica exact comerciantii care n-aveau cum sa
 * repare asta. Acum conteaza doar sa existe un magazin.
 *
 * SMTP-ul rimane ce a fost mereu: alegerea DRUMULUI pe care pleaca mesajul, si
 * singurul fel in care adresa poate fi chiar a lor. Marca, insa, e a lor
 * oricum.
 *
 * Fara magazin (emailuri ale Edinio catre comerciant: bun venit, cod de
 * verificare, abonament) ramane invelisul Edinio, fiindca acolo chiar Edinio
 * scrie.
 */
async function sendStoreOrEdinio(sender: StoreEmailSender | undefined, to: string, subject: string, content: string): Promise<void> {
  // Curatarea sta AICI, nu la fiecare apelant, fiindca subiectele care trec pe
  // aici sunt compuse din text scris de cumparator (`customer_name`) sau de
  // comerciant (sablonul lui cu `{{nume_client}}`, randat de `renderTemplate`,
  // care nu curata nimic). Un singur punct acopera si valoarea implicita, si
  // suprascrierea din sablon.
  const subiect = subiectSigur(subject);
  if (sender) {
    await deliverStoreEmail(sender, { to, subject: subiect, html: storeEmailShell(sender.branding, content) });
    return;
  }
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({ from: FROM, to, subject: subiect, html: baseTemplate(content) });
}

export function buildAdminNotifyHtml(name: string, message: string): string {
  return baseTemplate(`
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Mesaj de la echipa Edinio</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${name ? `, ${esc(name)}` : ""},</p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#18181b;line-height:1.6;white-space:pre-wrap;">${esc(message)}</p>
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
      <p style="margin:4px 0 0 0;font-size:13px;color:#15803d;">Trimis de pe: <strong>${esc(from)}</strong></p>
    </div>
    <p style="margin:0;font-size:13px;color:#71717a;">Cand vine o comanda noua in magazinul tau vei primi un email similar cu detaliile comenzii.</p>
  `);
}

export async function sendOrderConfirmationToCustomer(
  to: string,
  order: BaniComanda & {
    order_number: string;
    customer_name: string;
    business_name: string;
    payment_method?: string;
    store_url?: string;
  },
  sender?: StoreEmailSender,
) {
  if (!process.env.RESEND_API_KEY) return;

  const itemsRows = order.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;border-bottom:1px solid #f4f4f5;">${esc(i.name)} <span style="color:#a1a1aa;">x${i.quantity}</span></td>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;text-align:right;border-bottom:1px solid #f4f4f5;white-space:nowrap;">${formatPrice(i.price * i.quantity)}</td>
        </tr>`
    )
    .join("");

  /*
   * Randurile de bani, din `randuriDeBani` — aceeasi socoteala ca in emailul
   * comerciantului si ca in caseta din panou.
   *
   * „Subtotal" si „Optiuni extra" se sar: produsele sunt insirate mai sus unul
   * cate unul, extraoptiunile printre ele, deci suma lor e deja pe ecran. Randul
   * de TVA se ARATA acum si aici (pana pe 2026-08-03 lipsea cu totul): la
   * magazinele cu preturi fara TVA, produsele si transportul nu dadeau „Total de
   * plata" si nimic din email nu spunea de ce. Eticheta lui vine tot din
   * `totaluriComanda`, deci poarta cuvantul „inclus" cand cifra nu se aduna.
   */
  const totalsRows = randuriDeBani(order)
    .filter((r) => r.cheie !== "subtotal" && r.cheie !== "extras")
    .map((r) => {
      const col = r.verde ? "#16a34a" : "#71717a";
      return `<tr>
        <td style="padding-top:10px;font-size:14px;color:${col};">${esc(r.eticheta)}</td>
        <td style="padding-top:10px;font-size:14px;color:${col};text-align:right;white-space:nowrap;">${r.valoare}</td>
      </tr>`;
    })
    .join("");

  const paymentLabel = order.payment_method === "stripe"
    ? "Card online (Stripe)"
    : order.payment_method === "netopia"
      ? "Card online (Netopia)"
      : order.payment_method === "ipay"
        ? "Card bancar (BT iPay)"
        : order.payment_method === "klarna"
          ? "Klarna"
          : order.payment_method === "revolut"
            ? "Card online (Revolut)"
            : "ramburs la livrare";

  const { subject, intro, heading } = renderTemplate(sender, "order_confirmation", {
    subject: `Comanda ta ${order.order_number} a fost primita`,
    heading: "Comanda ta a fost plasata!",
    intro: `<p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Multumim, <strong>${esc(order.customer_name)}</strong>! Comanda ta la <strong>${esc(order.business_name)}</strong> a fost primita si va fi procesata in curand.</p>`,
  }, {
    // Variabilele de sablon pleaca NEESCAPATE: `renderTemplate` le inlocuieste
    // in textul comerciantului si escapeaza rezultatul. Escapate aici, ar iesi
    // „Jack&amp;amp;Jones".
    nume_client: order.customer_name,
    nume_magazin: order.business_name,
    numar_comanda: order.order_number,
    total: formatPrice(order.total),
  });
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${heading}</h2>
    ${intro}

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;box-sizing:border-box;overflow:hidden;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Comanda ${esc(order.order_number)}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td colspan="2" style="font-size:13px;color:#a1a1aa;padding-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Produsele tale</td>
      </tr>
      ${itemsRows}
      ${totalsRows}
      <tr>
        <td style="padding-top:10px;font-size:16px;font-weight:700;color:#18181b;border-top:2px solid #e4e4e7;">Total de plata</td>
        <td style="padding-top:10px;font-size:16px;font-weight:700;color:#1AB554;text-align:right;border-top:2px solid #e4e4e7;">${formatPrice(order.total)}</td>
      </tr>
    </table>

    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:20px;">
      <p style="margin:0;font-size:13px;color:#71717a;">Metoda de plata: <strong>${paymentLabel}</strong></p>
    </div>
    ${order.store_url ? `<p style="margin:20px 0 0 0;font-size:12px;color:#a1a1aa;text-align:center;">Ai dreptul sa te retragi din contract in 14 zile de la primire. <a href="${escapeUrl(`${order.store_url}/retur?order=${encodeURIComponent(order.order_number)}`)}" style="color:#71717a;text-decoration:underline;">Retrage-te din contract</a></p>` : ""}
  `;

  await sendStoreOrEdinio(sender, to, subject, content);
}

export async function sendAbandonedCartRecovery(
  to: string,
  data: {
    storeName: string;
    recoverUrl: string;
    customerName?: string | null;
    items: { name: string; quantity: number; price: number; image_url?: string | null }[];
    total: number;
    color?: string;
    message?: string;
    discountCode?: string | null;
    unsubscribeUrl?: string | null;
  },
  sender?: StoreEmailSender,
) {
  if (!process.env.RESEND_API_KEY) return;
  // `primary_color` vine din setarile magazinului si intra intr-un atribut
  // `style`. Masurat 2026-08-04: toate cele 127 de magazine au azi un hex valid,
  // deci escaparea nu schimba nimic pe ecran, doar inchide iesirea din atribut.
  const color = esc(data.color || "#1AB554");
  const first = data.customerName?.trim().split(/\s+/)[0];

  const itemsRows = data.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;border-bottom:1px solid #f4f4f5;">${esc(i.name)} <span style="color:#a1a1aa;">x${i.quantity}</span></td>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;text-align:right;border-bottom:1px solid #f4f4f5;white-space:nowrap;">${formatPrice(i.price * i.quantity)}</td>
        </tr>`
    )
    .join("");

  const { subject, intro: tplIntro, heading, button } = renderTemplate(sender, "abandoned_cart", {
    subject: `${first ? `${first}, ai ` : "Ai "}uitat ceva in cos la ${data.storeName}`,
    heading: "Ti-au ramas produse in cos",
    intro: `<p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${first ? `, ${esc(first)}` : ""}! Ai lasat cateva produse in cosul tau la <strong>${esc(data.storeName)}</strong>. Le-am pastrat pentru tine &mdash; finalizeaza comanda inainte sa se epuizeze.</p>`,
    button: "Finalizeaza comanda",
  }, {
    nume_client: first ?? "",
    nume_magazin: data.storeName,
  });
  // Per-campaign message (recovery automation) takes priority over the template/default.
  //
  // Se escapeaza, ca si textul de sablon din `renderTemplate`: e acelasi text
  // scris de comerciant, si pana acum aceeasi valoare era escapata pe o cale si
  // nu si pe cealalta. Masurat 2026-08-04 in `store_settings.abandoned_cart_automation`,
  // de unde vine chiar campul asta: din 127 de magazine unul singur are
  // automatizarea pornita si NICIUN pas n-are text propriu, deci pe ecran nu se
  // schimba nimic.
  const intro = data.message?.trim()
    ? `<p style="margin:0 0 24px 0;font-size:14px;color:#3f3f46;line-height:1.6;white-space:pre-wrap;">${esc(data.message.trim())}</p>`
    : tplIntro;

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${heading}</h2>
    ${intro}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr><td colspan="2" style="font-size:13px;color:#a1a1aa;padding-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Cosul tau</td></tr>
      ${itemsRows}
      <tr>
        <td style="padding-top:10px;font-size:16px;font-weight:700;color:#18181b;border-top:2px solid #e4e4e7;">Total</td>
        <td style="padding-top:10px;font-size:16px;font-weight:700;color:${color};text-align:right;border-top:2px solid #e4e4e7;">${formatPrice(data.total)}</td>
      </tr>
    </table>
    ${data.discountCode ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
      <tr><td align="center" style="background:#f0fdf4;border:1px dashed #86efac;border-radius:10px;padding:14px;">
        <p style="margin:0 0 2px 0;font-size:12px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Cod reducere</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#15803d;letter-spacing:1px;">${esc(data.discountCode)}</p>
        <p style="margin:4px 0 0 0;font-size:12px;color:#16a34a;">Se aplica automat la finalizare.</p>
      </td></tr>
    </table>` : ""}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr><td align="center">
        <a href="${escapeUrl(data.recoverUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;">${button}</a>
      </td></tr>
    </table>
    ${data.unsubscribeUrl ? `
    <p style="margin:24px 0 0 0;font-size:11px;color:#a1a1aa;text-align:center;">
      Nu mai vrei aceste mesaje? <a href="${escapeUrl(data.unsubscribeUrl)}" style="color:#a1a1aa;">Dezaboneaza-te</a>
    </p>` : ""}
  `;

  await sendStoreOrEdinio(sender, to, subject, content);
}

export async function sendAccountWelcomeEmail(
  to: string,
  data: { name: string }
) {
  if (!process.env.RESEND_API_KEY) return;
  const dashboardUrl = `${SITE_URL}/onboarding/details`;
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Bine ai venit pe Edinio${data.name ? `, ${esc(data.name)}` : ""}!</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Contul tau a fost creat cu succes. Esti la un pas de a-ti lansa magazinul online.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Ce urmeaza?</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#71717a;">Configureaza-ti magazinul in cateva minute - adauga produse, personalizeaza designul si esti online.</p>
    </div>

    <div style="text-align:center;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Configureaza magazinul
      </a>
    </div>
  `;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Bine ai venit pe Edinio!",
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
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Felicitari${data.name ? `, ${esc(data.name)}` : ""}!</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Magazinul tau <strong>${esc(data.business_name)}</strong> a fost creat cu succes si este acum live pe Edinio.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Magazinul tau este online</p>
      <p style="margin:4px 0 0 0;font-size:13px;">
        <a href="${escapeUrl(storeUrl)}" style="color:#15803d;text-decoration:none;">${esc(storeUrl)}</a>
      </p>
    </div>

    <p style="margin:0 0 28px 0;font-size:14px;color:#71717a;">Urmatorul pas: adauga produse si configureaza-ti magazinul din panoul de control.</p>

    <div style="text-align:center;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Mergi la dashboard
      </a>
    </div>
  `;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: subiectSigur(`Magazinul tau ${data.business_name} este live!`),
    html: baseTemplate(content),
  });
}

export async function sendMfaOtpEmail(to: string, otp: string) {
  if (!process.env.RESEND_API_KEY) return;
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Cod de verificare</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Foloseste codul de mai jos pentru a confirma autentificarea in contul tau Edinio.</p>
    <div style="text-align:center;margin:28px 0;padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
      <span style="font-size:40px;font-weight:800;letter-spacing:10px;color:#1AB554;font-family:monospace;">${esc(otp)}</span>
    </div>
    <p style="margin:0;font-size:13px;color:#71717a;text-align:center;">Codul este valabil <strong>10 minute</strong>. Daca nu ai initiat tu aceasta autentificare, ignora acest email.</p>
  `;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${otp} — Codul tau de verificare Edinio`,
    html: baseTemplate(content),
  });
}

/** Notify a merchant about a new submission from a custom-page contact form. */
export async function sendPageFormEmail(
  to: string,
  data: { storeName: string; pageTitle: string; pageUrl?: string; fields: { label: string; value: string }[] },
) {
  if (!process.env.RESEND_API_KEY) return;
  const rows = data.fields
    .map(
      (f) => `
    <div style="margin:0 0 12px 0;">
      <p style="margin:0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">${esc(f.label)}</p>
      <p style="margin:2px 0 0 0;font-size:14px;color:#18181b;white-space:pre-wrap;">${esc(f.value) || "-"}</p>
    </div>`,
    )
    .join("");
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Mesaj nou de pe ${esc(data.storeName)}</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Trimis din formularul paginii "${esc(data.pageTitle)}".</p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:18px;">${rows}</div>
    ${data.pageUrl ? `<p style="margin:18px 0 0 0;font-size:13px;"><a href="${escapeUrl(data.pageUrl)}" style="color:#15803d;text-decoration:none;">Vezi pagina</a></p>` : ""}
  `;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Mesaj nou de pe ${subiectSigur(data.storeName)}`,
    html: baseTemplate(content),
  });
}

const SUPPORT_ADMIN_EMAIL = process.env.SUPPORT_ADMIN_EMAIL ?? "support@edinio.com";

/**
 * Unde ajung mesajele din formularul de pe `/contact`.
 *
 * NU e `SUPPORT_ADMIN_EMAIL`: acela e coada de tichete a clientilor care au deja
 * cont. Aici scriu oameni care inca nu sunt clienti, si adresa e chiar cea
 * afisata public pe site.
 */
const CONTACT_ADMIN_EMAIL = process.env.CONTACT_ADMIN_EMAIL ?? "contact@edinio.com";

export interface MesajDeContact {
  nume: string;
  email: string;
  telefon: string;
  mesaj: string;
}

/**
 * Mesajul din formularul public, catre noi.
 *
 * ⚠ `replyTo` e adresa OMULUI, nu a noastra. Fara el, „Raspunde" din clientul de
 * mail deschide un raspuns catre Edinio — adica noi catre noi — si abia dupa
 * aceea observi ca trebuie sa copiezi adresa de mana din corpul mesajului.
 * Cu el, tot fluxul de raspuns e o singura apasare.
 */
export function buildContactAdminHtml(data: MesajDeContact): string {
  const rand = (eticheta: string, valoare: string, href?: string) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
        <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">${esc(eticheta)}</span>
        <p style="margin:3px 0 0 0;font-size:15px;color:#18181b;font-weight:500;">${
          href ? `<a href="${esc(href)}" style="color:#18181b;text-decoration:none;">${esc(valoare)}</a>` : esc(valoare) || "-"
        }</p>
      </td>
    </tr>`;

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Mesaj nou de pe edinio.com</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Trimis din formularul de pe pagina de contact.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      ${rand("Nume complet", data.nume)}
      ${rand("Email", data.email, `mailto:${data.email}`)}
      ${rand("Telefon", data.telefon, `tel:${data.telefon.replace(/[\s.\-()]/g, "")}`)}
    </table>
    <p style="margin:24px 0 8px 0;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">Mesaj</p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:16px 18px;">
      <p style="margin:0;font-size:14px;color:#18181b;line-height:1.65;white-space:pre-wrap;">${esc(data.mesaj)}</p>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="mailto:${esc(data.email)}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Raspunde clientului
      </a>
    </div>
  `;
  return baseTemplate(content);
}

export async function sendContactMessageToAdmin(data: MesajDeContact): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to: CONTACT_ADMIN_EMAIL,
    replyTo: data.email,
    subject: `[Contact] ${data.nume || data.email}`,
    html: buildContactAdminHtml(data),
  });
}

/**
 * Confirmarea catre omul care a scris.
 *
 * ⚠ Ii dam INAPOI mesajul lui. Nu e umplutura: cine trimite un formular nu are
 * nicio dovada ca a plecat ceva, iar peste doua zile nu mai stie nici ce a
 * scris, nici daca a apasat. Copia e chitanta.
 *
 * NU promite un termen de raspuns. Programul e o afirmatie pe care o putem
 * sustine; „raspundem in 24 de ore" e una pe care n-a confirmat-o nimeni.
 */
export function buildContactConfirmationHtml(data: MesajDeContact & { program: string }): string {
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Am primit mesajul tau</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;line-height:1.6;">
      Buna${data.nume ? `, ${esc(data.nume.split(" ")[0])}` : ""}! Multumim ca ne-ai scris.
      Iti raspundem in programul de asistenta: <strong style="color:#18181b;">${esc(data.program)}</strong>.
    </p>
    <p style="margin:0 0 8px 0;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">Ce ne-ai trimis</p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:16px 18px;">
      <p style="margin:0;font-size:14px;color:#18181b;line-height:1.65;white-space:pre-wrap;">${esc(data.mesaj)}</p>
    </div>
    <p style="margin:24px 0 0 0;font-size:13px;color:#71717a;line-height:1.6;">
      Daca vrei sa adaugi ceva, raspunde direct la acest email.
      Ne gasesti si la telefon, la <a href="tel:+40750456809" style="color:#15803d;text-decoration:none;">0750 456 809</a>.
    </p>
  `;
  return baseTemplate(content);
}

export async function sendContactConfirmationToCustomer(
  data: MesajDeContact & { program: string },
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    /* Raspunsul lui vine la noi, nu la adresa de expediere. */
    replyTo: CONTACT_ADMIN_EMAIL,
    subject: "Am primit mesajul tau - Edinio",
    html: buildContactConfirmationHtml(data),
  });
}

export interface CerereDeMigrare {
  nume: string;
  email: string;
  telefon: string;
  platforma: string;
  produse: string;
  /** Poate fi gol: e singurul câmp neobligatoriu din formular. */
  mentiuni: string;
}

/**
 * Cererea de migrare, către noi.
 *
 * ⚠ MERGE LA `CONTACT_ADMIN_EMAIL`, nu la `SUPPORT_ADMIN_EMAIL`. Cel de-al doilea
 * e coada de tichete a clienților care AU deja cont; aici scrie cineva care încă
 * nu e client. Varianta dinainte (de pe pagina de campanie, ștearsă) trimitea la
 * suport, adică o cerere de vânzare ateriza în coada de asistență tehnică.
 *
 * ⚠ `replyTo` e adresa OMULUI, nu a noastră. Fără el, „Răspunde" din clientul de
 * mail deschide un răspuns către Edinio — noi către noi.
 */
export function buildMigrationLeadHtml(data: CerereDeMigrare): string {
  const rand = (eticheta: string, valoare: string, href?: string) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
        <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">${esc(eticheta)}</span>
        <p style="margin:3px 0 0 0;font-size:15px;color:#18181b;font-weight:500;">${
          href ? `<a href="${esc(href)}" style="color:#18181b;text-decoration:none;">${esc(valoare)}</a>` : esc(valoare) || "-"
        }</p>
      </td>
    </tr>`;

  /* Mențiunile lipsesc de tot când n-a scris nimic — un chenar gol cu titlu
     deasupra se citește ca o rubrică pe care am uitat s-o completăm noi. */
  const mentiuni = data.mentiuni
    ? `
    <p style="margin:24px 0 8px 0;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">Alte mentiuni</p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:16px 18px;">
      <p style="margin:0;font-size:14px;color:#18181b;line-height:1.65;white-space:pre-wrap;">${esc(data.mentiuni)}</p>
    </div>`
    : "";

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Cerere noua de migrare</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Trimisa din formularul de pe pagina de migrare.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      ${rand("Nume complet", data.nume)}
      ${rand("Telefon", data.telefon, `tel:${data.telefon.replace(/[\s.\-()]/g, "")}`)}
      ${rand("Email", data.email, `mailto:${data.email}`)}
      ${rand("Platforma actuala", data.platforma)}
      ${rand("Numar aproximativ de produse", data.produse)}
    </table>
    ${mentiuni}
    <div style="text-align:center;margin-top:24px;">
      <a href="tel:${esc(data.telefon.replace(/[\s.\-()]/g, ""))}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Suna clientul
      </a>
    </div>
  `;
  return baseTemplate(content);
}

export async function sendMigrationLeadToAdmin(data: CerereDeMigrare): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to: CONTACT_ADMIN_EMAIL,
    replyTo: data.email,
    subject: `[Migrare] ${data.nume} - ${data.platforma} (${data.produse} produse)`,
    html: buildMigrationLeadHtml(data),
  });
}

/**
 * Confirmarea către omul care a cerut migrarea.
 *
 * ⚠ Îi dăm ÎNAPOI ce a completat, ca la formularul de contact: cine trimite un
 * formular n-are nicio dovadă că a plecat ceva.
 *
 * NU promite un termen. „Te sunăm în 24 de ore" e o afirmație pe care n-a
 * confirmat-o nimeni; „ne uităm peste magazin și te căutăm" e ce chiar facem.
 */
export function buildMigrationConfirmationHtml(data: CerereDeMigrare): string {
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Am primit cererea ta de migrare</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;line-height:1.6;">
      Buna${data.nume ? `, ${esc(data.nume.split(" ")[0])}` : ""}! Ne uitam peste magazinul tau de pe
      <strong style="color:#18181b;">${esc(data.platforma)}</strong> si te cautam la telefon ca sa stabilim
      cum si cand facem mutarea.
    </p>
    <p style="margin:0 0 8px 0;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">Ce ne-ai trimis</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
          <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">Platforma actuala</span>
          <p style="margin:3px 0 0 0;font-size:15px;color:#18181b;font-weight:500;">${esc(data.platforma)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;">
          <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;">Numar aproximativ de produse</span>
          <p style="margin:3px 0 0 0;font-size:15px;color:#18181b;font-weight:500;">${esc(data.produse)}</p>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0 0;font-size:13px;color:#71717a;line-height:1.6;">
      Daca vrei sa adaugi ceva, raspunde direct la acest email.
      Ne gasesti si la telefon, la <a href="tel:+40750456809" style="color:#15803d;text-decoration:none;">0750 456 809</a>.
    </p>
  `;
  return baseTemplate(content);
}

export async function sendMigrationConfirmationToCustomer(data: CerereDeMigrare): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    /* Răspunsul lui vine la noi, nu la adresa de expediere. */
    replyTo: CONTACT_ADMIN_EMAIL,
    subject: "Am primit cererea ta de migrare - Edinio",
    html: buildMigrationConfirmationHtml(data),
  });
}

/*
 * ⚠ `sendMigrationLeadToAdmin` A FOST READUSA PE 30.08.2026, CU PLAFOANELE CERUTE.
 *
 * Fusese stearsa pe 05.08 odata cu pagina /migrare, iar nota de atunci spunea:
 * „nu o readuce fara sa aduci si plafoanele", fiindca singurul ei apelant era o
 * actiune de server PUBLICA, fara autentificare si fara nicio limita, care
 * trimitea email pe cheia Resend a platformei. Nota mai spunea ca nu era
 * exploatabila doar fiindca modulul ramasese orfan, si ca s-ar rupe la loc, in
 * tacere, „in ziua in care cineva refacea pagina".
 *
 * Ziua aceea a venit: ramura de site a refacut /migrare ca pagina de site, cu
 * formular viu. Nu s-a rupt la loc fiindca `migration.actions.ts` a fost rescrisa
 * odata cu ea: plafon de rata pe IP in PRIMA linie (3 la 60s), validare, si
 * reCAPTCHA — aceeasi croiala ca formularul de contact.
 *
 * Deci previziunea din nota veche s-a adeverit intocmai, iar conditia pe care o
 * punea e indeplinita. Nu scoate plafonul din actiune fara sa stergi si asta.
 */

/**
 * O problema de domeniu, asa cum o produce cronul de reconciliere.
 *
 * `alNostru` e campul care schimba TOT, si lipsa lui e jumatate din incidentul
 * esafe.ro (10.08.2026). Doua situatii care arata identic din afara cer raspunsuri
 * opuse de la comerciant:
 *   - domeniul e deja indreptat catre noi si NOI n-am terminat configurarea:
 *     el nu are ce sa faca, si orice instructiune de DNS trimisa lui e o pista
 *     falsa care il tine si mai mult cazut;
 *   - DNS-ul lui nu raspunde deloc (registrar expirat, zona stearsa): acolo noi
 *     nu putem intra, si doar el poate repara.
 *
 * `problem` e diagnosticul tehnic si ajunge NUMAI la suport. Catre comerciant
 * pleaca `pasi`, in cuvintele lui.
 */
export type DomeniuStricat = {
  /** Numele magazinului, pentru cine citeste alerta la suport. */
  store: string;
  /** Slugul: adresa de rezerva de pe edinio.com, care merge si cu domeniul mort. */
  slug: string | null;
  domain: string;
  /** Diagnosticul tehnic. Pentru suport, nu pentru comerciant. */
  problem: string;
  /** Ce are de facut comerciantul, pe intelesul lui. Poate fi gol. */
  pasi: string[];
  /** `true` cand domeniul e delegat catre noi, deci reparatia e a NOASTRA. */
  alNostru: boolean;
  /** Adresa proprietarului magazinului, cand o stim. */
  ownerEmail?: string | null;
  /**
   * Adresa proprietarului e chiar pe domeniul cazut, deci alerta NU are cum sa
   * ajunga la el: cu nameserverele mute pica si MX-ul. Suportul trebuie sa stie
   * ca trebuie sunat, nu doar scris.
   */
  ownerEmailPeDomeniu?: boolean;
};

/** Un domeniu despre care nu am putut afla nimic. Nici sanatos, nici stricat. */
export type DomeniuNeverificat = { domain: string; motiv: string };

/**
 * Alerta catre SUPORT pentru domenii custom care nu functioneaza.
 *
 * Se cheama DOAR din cronul orar (`/api/cron/domains-reconcile`), deci nu are
 * suprafata publica si nu-i trebuie plafon — spre deosebire de
 * `sendMigrationLeadToAdmin` de mai sus. Continutul e compus integral aici din
 * date interne; nimic din el nu vine dintr-un formular.
 *
 * Franarea (un email la 12 ore, per destinatar) sta la apelant, fiindca acolo e
 * baza de date in care se tine marcajul.
 */
export async function sendBrokenDomainsToAdmin(
  items: DomeniuStricat[],
  neverificate: DomeniuNeverificat[] = [],
) {
  if (!process.env.RESEND_API_KEY) return;
  if (items.length === 0 && neverificate.length === 0) return;

  const rows = items
    .map(
      (it) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
        <p style="margin:0;font-size:15px;color:#18181b;font-weight:600;">${esc(it.domain)}</p>
        <p style="margin:2px 0 0 0;font-size:13px;color:#71717a;">${esc(it.store)}</p>
        <p style="margin:6px 0 0 0;font-size:13px;color:${it.alNostru ? "#dc2626" : "#b45309"};">
          <strong>${it.alNostru ? "AL NOSTRU" : "de reparat la client"}</strong> &mdash; ${esc(it.problem)}
        </p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#71717a;">
          ${it.ownerEmail
            ? `Proprietar: ${esc(it.ownerEmail)}`
            : "PROPRIETARUL NU POATE FI ANUNTAT: magazinul nu are nicio adresa de email."}
          ${it.ownerEmailPeDomeniu
            ? ` &mdash; <strong style="color:#dc2626;">adresa e pe domeniul cazut, deci emailul NU ajunge. Suna-l.</strong>`
            : ""}
        </p>
      </td>
    </tr>`,
    )
    .join("");

  /*
   * Sectiunea asta exista fiindca lipsa ei a tinut esafe.ro cazut ore intregi:
   * un domeniu despre care nu se putea citi nimic cadea in „asteptam clientul",
   * o categorie care prin proiectare nu alerteaza pe nimeni. „Nu stiu" nu mai are
   * voie sa fie tacut.
   */
  const bloculNeverificat = neverificate.length
    ? `
    <p style="margin:24px 0 8px 0;font-size:13px;font-weight:600;color:#a16207;">
      ${neverificate.length} ${neverificate.length === 1 ? "domeniu pe care NU l-am putut verifica" : "domenii pe care NU le-am putut verifica"}
    </p>
    <p style="margin:0 0 10px 0;font-size:12px;color:#71717a;">Nu sunt declarate nici sanatoase, nici stricate. Daca revin la fiecare rulare, citirea e stricata, nu domeniul.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;overflow:hidden;">
      ${neverificate
        .map(
          (n) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #fef3c7;">
          <p style="margin:0;font-size:14px;color:#18181b;font-weight:600;">${esc(n.domain)}</p>
          <p style="margin:2px 0 0 0;font-size:12px;color:#92400e;">${esc(n.motiv)}</p>
        </td>
      </tr>`,
        )
        .join("")}
    </table>`
    : "";

  const titlu =
    items.length === 0
      ? "Domenii neverificate"
      : items.length === 1
        ? "Un domeniu nu functioneaza"
        : `${items.length} domenii nu functioneaza`;

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${titlu}</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Reconcilierea automata face doar reparatii care adauga. Ce e marcat „AL NOSTRU" inseamna ca domeniul e deja indreptat catre Vercel si asteapta o interventie de la noi — pana atunci e cazut complet, si site, si email.</p>
    ${rows
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">${rows}</table>`
      : ""}
    ${bloculNeverificat}
  `;

  const subiect = items.length
    ? `[Domenii] ${items.length} ${items.length === 1 ? "domeniu cazut" : "domenii cazute"}`
    : `[Domenii] ${neverificate.length} neverificate`;

  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: subiect,
    html: baseTemplate(content),
  });
}

/**
 * Aceeasi problema, spusa PROPRIETARULUI magazinului.
 *
 * Pana pe 10.08.2026 alerta pleca exclusiv catre `SUPPORT_ADMIN_EMAIL`, adica in
 * aceeasi cutie cu tichetele si cu notificarile de utilizator nou — iar omul al
 * carui magazin era cazut nu afla niciodata. eSafe a stat inaccesibil o zi
 * intreaga fara ca proprietarul sa primeasca un rand.
 *
 * Aici nu intra niciun diagnostic tehnic: comerciantul primeste doar ce inseamna
 * pentru el (magazinul e inchis pe domeniul lui), ce are de facut, si adresa de
 * rezerva pe care poate trimite clientii chiar acum.
 */
export async function sendBrokenDomainToOwner(to: string, items: DomeniuStricat[]) {
  if (!process.env.RESEND_API_KEY || items.length === 0) return;

  const blocuri = items
    .map((it) => {
      const rezerva = it.slug ? `${SITE_URL}/${it.slug}` : SITE_URL;
      const pasi = it.pasi.length
        ? `<ol style="margin:12px 0 0 0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.7;">${it.pasi
            .map((p) => `<li style="margin-bottom:4px;">${esc(p)}</li>`)
            .join("")}</ol>`
        : "";
      return `
      <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:18px;margin-bottom:16px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#18181b;">${esc(it.domain)}</p>
        <p style="margin:8px 0 0 0;font-size:14px;color:#3f3f46;line-height:1.6;">
          ${
            it.alNostru
              ? "Ai facut deja tot ce tinea de tine: domeniul este indreptat catre noi. Configurarea de la noi nu este insa gata, si pana o terminam domeniul nu raspunde. Ne ocupam."
              : "Domeniul nu raspunde deloc, asa ca nici magazinul si nici emailul de pe el nu functioneaza. Ce trebuie schimbat este la firma de la care ai domeniul, iar acolo nu putem intra noi in locul tau."
          }
        </p>
        ${pasi}
        <p style="margin:14px 0 0 0;font-size:13px;color:#71717a;">
          Pana se rezolva, magazinul tau este deschis si functioneaza la adresa
          <a href="${escapeUrl(rezerva)}" style="color:#15803d;text-decoration:none;font-weight:600;">${esc(rezerva)}</a>.
          Poti trimite clientii acolo fara nicio grija.
        </p>
      </div>`;
    })
    .join("");

  const unul = items.length === 1;
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${unul ? "Domeniul tau nu functioneaza" : "Domeniile tale nu functioneaza"}</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Verificam din ora in ora domeniile conectate la Edinio. La ${unul ? "domeniul tau" : "domeniile tale"} am gasit o problema si vrem sa afli de la noi, nu de la un client care nu a putut intra in magazin.</p>
    ${blocuri}
    <div style="text-align:center;margin-top:24px;">
      <a href="${SITE_URL}/dashboard/settings" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Deschide setarile de domeniu
      </a>
    </div>
    <p style="margin:20px 0 0 0;font-size:13px;color:#71717a;">Daca ceva nu iti este clar, raspunde la acest email si te ajutam noi.</p>
  `;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: subiectSigur(unul ? `Domeniul ${items[0].domain} nu functioneaza` : `${items.length} domenii ale magazinului tau nu functioneaza`),
    html: baseTemplate(content),
  });
}

/**
 * Subiect curatat pentru antetul `Subject:`.
 *
 * `data.subject` e scris integral de utilizator si intra direct in antet.
 * Aceeasi clasa pe care proiectul a tratat-o deja la `fromLine`: un CR sau LF
 * strecurat acolo inseamna injectie de anteturi de email. Taiem si lungimea, ca
 * un subiect de 10.000 de caractere sa nu ajunga in antet.
 *
 * Cat valoreaza, exact: injectia propriu-zisa e INCHISA de ambele transporturi —
 * nodemailer inlocuieste CR/LF cu spatiu inainte de a scrie antetul, iar Resend
 * primeste subiectul ca sir intr-un JSON si compune MIME-ul la el. Garda asta e
 * deci igiena si consecventa (un subiect ramane un subiect, de o linie si de
 * lungime rezonabila), nu bariera care opreste un atac. Pana pe 05.08.2026 era
 * chemata doar pe doua din caile de suport, desi restul primeau la fel de mult
 * text de la utilizator; acum trece prin ea tot ce contine text strain.
 */
function subiectSigur(brut: string): string {
  return (brut ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
}

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
          <p style="margin:2px 0 0 0;font-size:15px;font-weight:600;color:#18181b;">${esc(data.subject)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#f4f4f5;border-radius:0 0 8px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Categorie</span>
                <p style="margin:2px 0 0 0;font-size:13px;color:#3f3f46;">${categoryLabel[data.category] ?? esc(data.category)}</p>
              </td>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Prioritate</span>
                <p style="margin:2px 0 0 0;font-size:13px;font-weight:600;color:${priorityColor[data.priority] ?? "#3f3f46"};">${priorityLabel[data.priority] ?? esc(data.priority)}</p>
              </td>
              <td style="width:33%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Client</span>
                <p style="margin:2px 0 0 0;font-size:13px;color:#3f3f46;">${esc(data.userEmail)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${data.businessName ? `<p style="margin:0 0 16px 0;font-size:13px;color:#71717a;">Magazin: <strong>${esc(data.businessName)}</strong></p>` : ""}
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#3f3f46;white-space:pre-wrap;">${esc(data.content)}</p>
    </div>
    <div style="text-align:center;">
      <a href="${escapeUrl(`${SITE_URL}/dashboard/suport/${data.ticketId}`)}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Vezi tichetul
      </a>
    </div>
  `;
  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: `[Suport] ${subiectSigur(data.subject)} — ${data.userEmail}`,
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
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;"><strong>${esc(data.userEmail)}</strong> a raspuns la tichetul <em>${esc(data.subject)}</em>.</p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#3f3f46;white-space:pre-wrap;">${esc(data.content)}</p>
    </div>
    <div style="text-align:center;">
      <a href="${escapeUrl(`${SITE_URL}/dashboard/suport/${data.ticketId}`)}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Raspunde
      </a>
    </div>
  `;
  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: `[Suport] RE: ${subiectSigur(data.subject)} — ${data.userEmail}`,
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
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Echipa Edinio a raspuns la tichetul tau: <strong>${esc(data.subject)}</strong>.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#15803d;white-space:pre-wrap;">${esc(data.content)}</p>
    </div>
    <div style="text-align:center;">
      <a href="${escapeUrl(ticketUrl)}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Raspunde sau vezi conversatia
      </a>
    </div>
  `;
  await getResend().emails.send({
    from: FROM,
    to: data.to,
    subject: `Raspuns la tichetul tau: ${subiectSigur(data.subject)}`,
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
  entityType?: "pf" | "pj";
  cnp?: string;
  cui?: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  // Fragment HTML (are `&middot;`), deci se escapeaza doar CUI-ul si CNP-ul din el.
  const registrantLine = data.entityType === "pj"
    ? `Persoana juridica${data.cui ? ` &middot; CUI ${esc(data.cui)}` : ""}`
    : `Persoana fizica${data.cnp ? ` &middot; CNP ${esc(data.cnp)}` : ""}`;
  const adminUrl = `${SITE_URL}/admin/domenii`;
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Comanda noua de domeniu</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Un client a comandat un domeniu care trebuie inregistrat manual.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:18px;font-weight:700;color:#16a34a;font-family:monospace;">${esc(data.domain)}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:10px 14px;background:#f4f4f5;border-radius:8px 8px 0 0;border-bottom:1px solid #e4e4e7;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:50%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Titular</span>
                <p style="margin:2px 0 0 0;font-size:14px;font-weight:600;color:#18181b;">${esc(data.customerName)}</p>
                <p style="margin:2px 0 0 0;font-size:13px;color:#71717a;">${esc(data.customerEmail)}</p>
                <p style="margin:2px 0 0 0;font-size:12px;color:#71717a;">${registrantLine}</p>
              </td>
              <td style="width:50%;vertical-align:top;">
                <span style="font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;">Magazin</span>
                <p style="margin:2px 0 0 0;font-size:14px;font-weight:600;color:#18181b;">${esc(data.businessName)}</p>
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
                <p style="margin:2px 0 0 0;font-size:13px;color:#3f3f46;">${esc(data.tld)}</p>
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
  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: subiectSigur(`[Domeniu] Comanda noua: ${data.domain} — ${data.customerName}`),
    html: baseTemplate(content),
  });
}

export async function sendAdminNewUserNotification(data: {
  name: string;
  email: string;
  createdAt: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const date = new Date(data.createdAt).toLocaleString("ro-RO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Cont nou creat</h2>
    <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Un utilizator nou s-a inregistrat pe Edinio.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:16px;">
      <p style="margin:0;font-size:14px;color:#18181b;"><strong>${esc(data.name)}</strong></p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#71717a;">${esc(data.email)}</p>
      <p style="margin:4px 0 0 0;font-size:12px;color:#a1a1aa;">${date}</p>
    </div>
  `;
  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: `[Edinio] Cont nou: ${subiectSigur(data.name)} (${data.email})`,
    html: baseTemplate(content),
  });
}

export async function sendAdminNewStoreNotification(data: {
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  slug: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Magazin nou creat</h2>
    <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Un utilizator si-a creat magazinul pe Edinio.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:16px;">
      <p style="margin:0;font-size:14px;color:#18181b;"><strong>${esc(data.businessName)}</strong></p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#71717a;">${esc(data.ownerName)} (${esc(data.ownerEmail)})</p>
      <p style="margin:6px 0 0 0;font-size:13px;">
        <a href="${escapeUrl(`${SITE_URL}/${data.slug}`)}" style="color:#1AB554;text-decoration:none;font-weight:600;">edinio.com/${esc(data.slug)}</a>
      </p>
    </div>
  `;
  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_ADMIN_EMAIL,
    subject: `[Edinio] Magazin nou: ${subiectSigur(data.businessName)} (${data.ownerEmail})`,
    html: baseTemplate(content),
  });
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: "Ramburs la curier",
  stripe: "Card online (Stripe)",
  netopia: "Card online (Netopia)",
  ipay: "Card bancar (BT iPay)",
  klarna: "Klarna",
  revolut: "Card online (Revolut)",
};

export async function sendNewOrderEmail(
  to: string,
  order: BaniComanda & {
    order_number: string;
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    payment_method?: string;
    business_name: string;
    order_id: string;
    address?: string | null;
    city?: string | null;
    county?: string | null;
    courier_label?: string | null;
    delivery_type?: string | null;
    locker_name?: string | null;
    custom_fields?: Record<string, string> | null;
    billing_company?: BillingCompany | null;
  },
  sender?: StoreEmailSender,
) {
  if (!process.env.RESEND_API_KEY) return;

  const sectionLabel = (t: string) =>
    `<tr><td colspan="2" style="font-size:13px;color:#a1a1aa;padding:18px 0 8px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-top:1px solid #f4f4f5;">${t}</td></tr>`;
  const infoRow = (label: string, value: string) =>
    `<tr><td style="padding:3px 0;font-size:14px;color:#71717a;width:140px;vertical-align:top;">${label}</td><td style="padding:3px 0;font-size:14px;color:#18181b;font-weight:500;vertical-align:top;">${value}</td></tr>`;
  const totalRow = (label: string, value: string, opts: { bold?: boolean; color?: string; border?: boolean } = {}) => {
    const fs = opts.bold ? "16px" : "14px";
    const fw = opts.bold ? "font-weight:700;" : "";
    const col = opts.color ?? "#71717a";
    const bd = opts.border ? "border-top:2px solid #e4e4e7;" : "";
    return `<tr><td style="padding-top:10px;font-size:${fs};${fw}color:${col};${bd}">${label}</td><td style="padding-top:10px;font-size:${fs};${fw}color:${col};text-align:right;${bd}white-space:nowrap;">${value}</td></tr>`;
  };

  const itemsRows = order.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;border-bottom:1px solid #f4f4f5;">${esc(i.name)} <span style="color:#a1a1aa;">x${i.quantity}</span></td>
          <td style="padding:8px 0;font-size:14px;color:#3f3f46;text-align:right;border-bottom:1px solid #f4f4f5;white-space:nowrap;">${formatPrice(i.price * i.quantity)}</td>
        </tr>`
    )
    .join("");

  /*
   * Randurile de bani, din `randuriDeBani`. Aici se pastreaza si „Subtotal", si
   * randul de extraoptiuni care lipsea: `orders.subtotal` NU le contine, desi
   * `itemsRows` de deasupra le insira ca produse. Randul de mai jos e singurul
   * loc din email in care cei 5 lei ai „Comenzii cu Prioritate" de pe #0073 intra
   * in coloana.
   *
   * Nota „din care TVA" de la coada tabelului a plecat: era mereu dedesubtul
   * Totalului, deci nu spunea nimic la magazinele cu preturi FARA TVA, unde suma
   * chiar se adauga. Acum e un rand ca oricare altul, iar eticheta lui spune
   * „inclus" cand nu se aduna.
   */
  const totalsRows = randuriDeBani(order)
    .map((r) => totalRow(esc(r.eticheta), r.valoare, r.verde ? { color: "#16a34a" } : {}))
    .join("");

  const addrParts = [order.address, order.city, order.county]
    .map((x) => (x ? String(x).trim() : ""))
    .filter(Boolean)
    .map(esc)
    .join(", ");
  const deliveryRows = [
    addrParts ? infoRow("Adresa", addrParts) : "",
    order.courier_label ? infoRow("Curier", esc(order.courier_label)) : "",
    order.locker_name ? infoRow("Punct ridicare", esc(order.locker_name)) : "",
  ].join("");

  const pmLabel = order.payment_method
    ? PAYMENT_METHOD_LABELS[order.payment_method] ?? esc(order.payment_method)
    : "—";
  const pmStatus = order.payment_method === "cash_on_delivery"
    ? "Se incaseaza la livrare"
    : "In asteptarea confirmarii platii";

  // Comanda pe firma: comerciantul trebuie sa vada datele de facturare inca din
  // notificare, ca sa nu deschida panoul doar ca sa afle daca emite pe persoana
  // fizica sau pe firma. Numele de mai sus ramane persoana de contact.
  const firma = order.billing_company ?? null;
  const customerRows = [
    infoRow("Nume", esc(order.customer_name)),
    infoRow("Telefon", esc(order.customer_phone)),
    order.customer_email ? infoRow("Email", esc(order.customer_email)) : "",
    firma ? infoRow("Firma", esc(firma.company_name)) : "",
    firma
      ? infoRow(
          "CUI",
          esc(firma.vat_payer ? `RO${firma.cui}` : firma.cui) +
            // Fara confirmare, denumirea si statutul de TVA sunt cele scrise de
            // client. Se spune AICI, in notificare, nu doar in panou: emailul e
            // ce citeste comerciantul inainte sa emita factura.
            (firma.verified ? "" : ' <span style="color:#b45309;">(date neconfirmate la ANAF)</span>') +
            (firma.inactive ? ' <span style="color:#b45309;">(firma inactiva fiscal)</span>' : "")
        )
      : "",
    firma && firma.reg_com ? infoRow("Reg. com.", esc(firma.reg_com)) : "",
    firma && (firma.address || firma.city || firma.county)
      ? infoRow("Sediu", esc([firma.address, firma.city, firma.county].filter(Boolean).join(", ")))
      : "",
  ].join("");

  const customRows = order.custom_fields && Object.keys(order.custom_fields).length
    ? Object.entries(order.custom_fields).map(([k, v]) => infoRow(esc(k), esc(v))).join("")
    : "";

  const dashboardUrl = `${SITE_URL}/dashboard/orders/${order.order_id}`;

  const { subject, intro, heading } = renderTemplate(sender, "new_order", {
    subject: `Comanda noua ${order.order_number} - ${order.customer_name}`,
    heading: "Comanda noua!",
    intro: `<p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Ai primit o comanda noua la magazinul <strong>${esc(order.business_name)}</strong>.</p>`,
  }, {
    nume_magazin: order.business_name,
    numar_comanda: order.order_number,
    nume_client: order.customer_name,
    total: formatPrice(order.total),
  });
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${heading}</h2>
    ${intro}

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:8px;box-sizing:border-box;overflow:hidden;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Comanda ${esc(order.order_number)}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${sectionLabel("Client")}
      ${customerRows}
      ${deliveryRows ? sectionLabel("Livrare") + deliveryRows : ""}
      ${sectionLabel("Plata")}
      ${infoRow("Metoda", pmLabel)}
      ${infoRow("Status", pmStatus)}
      ${customRows ? sectionLabel("Detalii suplimentare") + customRows : ""}
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
      <tr>
        <td colspan="2" style="font-size:13px;color:#a1a1aa;padding-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Produse</td>
      </tr>
      ${itemsRows}
      ${totalsRows}
      ${totalRow("Total", formatPrice(order.total), { bold: true, color: "#1AB554", border: true })}
    </table>

    <div style="text-align:center;margin-top:28px;">
      <a href="${escapeUrl(dashboardUrl)}" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Vezi comanda in dashboard
      </a>
    </div>
  `;

  await sendStoreOrEdinio(sender, to, subject, content);
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
    store_url?: string;
  },
  sender?: StoreEmailSender,
) {
  if (!process.env.RESEND_API_KEY) return;

  const cfg = STATUS_CONFIG[order.status];
  if (!cfg) return;

  // Right of withdrawal is most relevant once the parcel is on its way / received.
  const returnLink = order.store_url && (order.status === "shipped" || order.status === "delivered")
    ? `<p style="margin:20px 0 0 0;font-size:12px;color:#a1a1aa;text-align:center;">Ai dreptul sa te retragi din contract in 14 zile de la primire. <a href="${escapeUrl(`${order.store_url}/retur?order=${encodeURIComponent(order.order_number)}`)}" style="color:#71717a;text-decoration:underline;">Retrage-te din contract</a></p>`
    : "";

  const awbSection = order.status === "shipped" && order.awb
    ? `<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:16px;">
        <p style="margin:0;font-size:13px;color:#71717a;">Numar AWB: <strong style="color:#18181b;font-family:monospace;">${esc(order.awb)}</strong></p>
      </div>`
    : "";

  const { subject, intro } = renderTemplate(sender, "order_status", {
    subject: `${cfg.subject} — ${order.order_number}`,
    intro: `<p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna, <strong>${esc(order.customer_name)}</strong>! Iti trimitem un update despre comanda ta la <strong>${esc(order.business_name)}</strong>.</p>`,
  }, {
    nume_client: order.customer_name,
    nume_magazin: order.business_name,
    numar_comanda: order.order_number,
    status: cfg.label,
  });
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${cfg.subject}</h2>
    ${intro}

    <div style="background:${cfg.bgColor};border:1px solid ${cfg.borderColor};border-radius:10px;padding:14px 18px;margin-bottom:16px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:13px;color:${cfg.color};font-weight:600;">Comanda ${esc(order.order_number)}</p>
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
    ${returnLink}
  `;

  await sendStoreOrEdinio(sender, to, subject, content);
}

// ── Custom message from merchant → Customer ─────────────────────────────────

export async function sendCustomerMessage(
  to: string,
  data: { subject: string; message: string; businessName: string; orderNumber: string },
  sender?: StoreEmailSender,
): Promise<{ success: true } | { error: string }> {
  if (!process.env.RESEND_API_KEY) return { error: "Serviciul de email nu este configurat." };

  const bodyHtml = esc(data.message).replace(/\n/g, "<br />");
  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">${esc(data.subject)}</h2>
    <p style="margin:0 0 20px 0;font-size:12px;color:#a1a1aa;">Mesaj de la <strong>${esc(data.businessName)}</strong> · Comanda ${esc(data.orderNumber)}</p>
    <p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.7;">${bodyHtml}</p>
  `;

  try {
    await sendStoreOrEdinio(sender, to, data.subject, content);
    return { success: true };
  } catch {
    return { error: "Trimiterea emailului a esuat. Incearca din nou." };
  }
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
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Felicitari${data.name ? `, ${esc(data.name)}` : ""}! Plata a fost procesata cu succes.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Plan ${esc(data.plan)}</p>
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

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Abonamentul ${data.plan} a fost activat`,
    html: baseTemplate(content),
  });
}

// ── Payment recovered → User ────────────────────────────────────────────────
// Trimis cand o plata esuata reuseste (reincercare Stripe sau plata manuala a
// facturii restante). Confirma reactivarea abonamentului.

export async function sendPaymentRecoveredEmail(
  to: string,
  data: { name: string; plan: string; expiresAt: string }
) {
  if (!process.env.RESEND_API_KEY) return;

  const formattedDate = new Date(data.expiresAt).toLocaleDateString("ro-RO", {
    day: "numeric", month: "long", year: "numeric",
  });

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Plata a reusit. Abonamentul este activ din nou!</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${data.name ? `, ${esc(data.name)}` : ""}. Am procesat cu succes plata pentru abonamentul tau <strong>${esc(data.plan)}</strong>. Iti multumim!</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Plan ${esc(data.plan)}</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#15803d;">Activ pana la: <strong>${formattedDate}</strong></p>
    </div>

    <p style="margin:0 0 28px 0;font-size:14px;color:#71717a;">Magazinul tau ramane activ si vizibil pentru clienti. Nu mai ai nimic de facut.</p>

    <div style="text-align:center;">
      <a href="${SITE_URL}/dashboard" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Mergi la dashboard
      </a>
    </div>
  `;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Plata pentru abonamentul ${data.plan} a reusit`,
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
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${data.name ? `, ${esc(data.name)}` : ""}. Am incercat sa procesam plata pentru abonamentul tau <strong>${esc(data.plan)}</strong>, dar aceasta nu a reusit.</p>

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

  await getResend().emails.send({
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
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${data.name ? `, ${esc(data.name)}` : ""}. Abonamentul tau Edinio a fost anulat din cauza unei plati esuate.</p>

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

  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Magazinul tau Edinio va fi suspendat",
    html: baseTemplate(content),
  });
}

// ── Retragere din contract (OUG 18/2026) ────────────────────────────────────
// Confirmarea catre client este ceruta de lege pe "suport durabil" (email cu
// timestamp). Emailul catre comerciant il anunta despre noua cerere de retur.

const REFUND_METHOD_LABELS: Record<string, string> = {
  iban: "Transfer bancar (IBAN)",
  card: "Pe cardul folosit la plata",
  original: "Aceeasi metoda de plata",
};

function returnItemsRows(items: { name: string; quantity: number }[]): string {
  return items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;font-size:14px;color:#3f3f46;border-bottom:1px solid #f4f4f5;">${esc(i.name)} <span style="color:#a1a1aa;">x${i.quantity}</span></td></tr>`,
    )
    .join("");
}

/** Durable-medium confirmation of a withdrawal request, sent to the customer. */
/**
 * Confirmarea de retragere catre CLIENT, ceruta de lege pe suport durabil.
 *
 * Mergea direct la Resend, cu invelisul si expeditorul Edinio, si nici macar nu
 * primea magazinul: era singurul email de client care ramanea Edinio chiar si la
 * comerciantii cu SMTP propriu. Acum trece pe acelasi drum ca restul.
 */
export async function sendReturnConfirmationToCustomer(
  to: string,
  data: {
    order_number: string;
    customer_name?: string | null;
    business_name: string;
    items: { name: string; quantity: number }[];
    reason?: string | null;
    receivedAt: string;
  },
  sender?: StoreEmailSender,
) {
  const first = data.customer_name?.trim().split(/\s+/)[0];
  const when = new Date(data.receivedAt).toLocaleString("ro-RO", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Cererea ta de retragere a fost inregistrata</h2>
    <p style="margin:0 0 24px 0;font-size:14px;color:#71717a;">Buna${first ? `, ${esc(first)}` : ""}! Am primit cererea ta de retragere din contract pentru comanda <strong>${esc(data.order_number)}</strong> la <strong>${esc(data.business_name)}</strong>. Acest email confirma primirea cererii pe suport durabil, conform legii.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:24px;box-sizing:border-box;overflow:hidden;">
      <p style="margin:0;font-size:13px;color:#16a34a;font-weight:600;">Comanda ${esc(data.order_number)}</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#15803d;">Inregistrata la: <strong>${when}</strong></p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr><td style="font-size:13px;color:#a1a1aa;padding-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Produse pentru retur</td></tr>
      ${returnItemsRows(data.items)}
    </table>
    ${data.reason && data.reason.trim() ? `<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-bottom:20px;"><p style="margin:0;font-size:13px;color:#71717a;">Motiv (optional): <span style="color:#18181b;">${esc(data.reason)}</span></p></div>` : ""}

    <p style="margin:0;font-size:14px;color:#71717a;line-height:1.6;">Vom analiza cererea si te vom contacta cu pasii urmatori (instructiuni de returnare si rambursare). Ai la dispozitie 14 zile de la primirea produsului pentru a-l returna. Rambursarea se face in maximum 14 zile de la primirea cererii.</p>
  `;

  await sendStoreOrEdinio(sender, to, `Cerere de retragere inregistrata - ${data.order_number}`, content);
}

/** Notify the merchant about a new withdrawal (return) request. */
export async function sendReturnRequestToMerchant(
  to: string,
  data: {
    order_number: string;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
    business_name: string;
    items: { name: string; quantity: number }[];
    reason?: string | null;
    refund_method?: string | null;
    refund_iban?: string | null;
    receivedAt: string;
  }
) {
  if (!process.env.RESEND_API_KEY) return;
  const infoRow = (label: string, value: string) =>
    `<tr><td style="padding:3px 0;font-size:14px;color:#71717a;width:140px;vertical-align:top;">${label}</td><td style="padding:3px 0;font-size:14px;color:#18181b;font-weight:500;vertical-align:top;">${value}</td></tr>`;
  const when = new Date(data.receivedAt).toLocaleString("ro-RO", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const refundLabel = data.refund_method ? REFUND_METHOD_LABELS[data.refund_method] ?? esc(data.refund_method) : "";

  const detailRows = [
    infoRow("Comanda", esc(data.order_number)),
    infoRow("Client", esc(data.customer_name) || "-"),
    data.customer_email ? infoRow("Email", esc(data.customer_email)) : "",
    data.customer_phone ? infoRow("Telefon", esc(data.customer_phone)) : "",
    infoRow("Data cererii", when),
    refundLabel ? infoRow("Rambursare", refundLabel) : "",
    data.refund_iban ? infoRow("IBAN", esc(data.refund_iban)) : "",
  ].join("");

  const content = `
    <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#18181b;">Cerere de retragere (retur)</h2>
    <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">Un client si-a exercitat dreptul de retragere din contract la <strong>${esc(data.business_name)}</strong>. Trebuie sa procesezi returul si rambursarea in termenul legal.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${detailRows}
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      <tr><td style="font-size:13px;color:#a1a1aa;padding:14px 0 8px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-top:1px solid #f4f4f5;">Produse returnate</td></tr>
      ${returnItemsRows(data.items)}
    </table>
    ${data.reason && data.reason.trim() ? `<div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 18px;margin-top:16px;"><p style="margin:0;font-size:13px;color:#71717a;">Motiv: <span style="color:#18181b;">${esc(data.reason)}</span></p></div>` : ""}

    <div style="text-align:center;margin-top:28px;">
      <a href="${SITE_URL}/dashboard/returns" style="display:inline-block;background:#1AB554;color:#ffffff;font-weight:700;font-size:15px;padding:13px 32px;border-radius:10px;text-decoration:none;">
        Vezi cererile de retur
      </a>
    </div>
  `;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: subiectSigur(`Cerere de retur ${data.order_number} - ${data.customer_name ?? ""}`),
    html: baseTemplate(content),
  });
}

