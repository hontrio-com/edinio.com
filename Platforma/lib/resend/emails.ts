import { Resend } from 'resend'
import { PurchaseConfirmationEmail } from '@/emails/purchase-confirmation'
import { createElement } from 'react'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'Edinio <noreply@edinio.com>'

export interface PurchaseEmailParams {
  to: string
  customerName: string
  courseName: string
  courseSlug: string
  isNewUser: boolean
  temporaryPassword?: string
  loginUrl: string
  dashboardUrl: string
}

export async function sendPurchaseConfirmationEmail(params: PurchaseEmailParams) {
  const { to, customerName, courseName } = params
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Acces activat: ${courseName}`,
    react: createElement(PurchaseConfirmationEmail, params),
  })
}

export async function sendWelcomeEmail({
  to,
  name,
}: {
  to: string
  name: string
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Bun venit pe Edinio!',
    html: `
      <h1>Salut, ${name}!</h1>
      <p>Contul tău pe <strong>Edinio</strong> a fost creat cu succes.</p>
      <p>Explorează cursurile noastre de AI și începe să construiești viitorul.</p>
      <p>Echipa Edinio</p>
    `,
  })
}
