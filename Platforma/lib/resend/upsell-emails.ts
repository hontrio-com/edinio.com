import { Resend } from 'resend'
import { UpsellStep1Email } from '@/emails/upsell-step1'
import { UpsellStep2Email } from '@/emails/upsell-step2'
import { UpsellStep3Email } from '@/emails/upsell-step3'
import { UPSELL_DISCOUNT_INDIVIDUAL, UPSELL_DISCOUNT_BUNDLE } from '@/lib/upsell'

const resend = new Resend(process.env.RESEND_API_KEY)

interface SendUpsellEmailParams {
  step: 1 | 2 | 3
  to: string
  customerName: string
  purchasedCourseName: string
  upsellCourseName: string
  bundleName: string
  courseNames: string[]
  upsellCourseId?: string
  upsellCourseSlug?: string
  bundleId?: string
  bundleSlug?: string
  priceRon: number
  priceEur: number
  bundlePriceRon: number
  bundlePriceEur: number
  currency: 'ron' | 'eur'
  language: 'ro' | 'en'
}

export async function sendUpsellEmail(params: SendUpsellEmailParams) {
  const {
    step, to, customerName, purchasedCourseName, upsellCourseName,
    bundleName, courseNames, upsellCourseId, upsellCourseSlug,
    bundleId, bundleSlug, priceRon, priceEur, bundlePriceRon, bundlePriceEur,
    currency, language,
  } = params

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const discountIndividual = Math.round(UPSELL_DISCOUNT_INDIVIDUAL * 100)
  const discountBundle = Math.round(UPSELL_DISCOUNT_BUNDLE * 100)
  const isRo = language === 'ro'

  const originalPrice = currency === 'eur' ? priceEur : priceRon
  const discountedCoursePrice = Math.round(originalPrice * (1 - UPSELL_DISCOUNT_INDIVIDUAL))
  const originalBundlePrice = currency === 'eur' ? bundlePriceEur : bundlePriceRon
  const discountedBundlePrice = Math.round(originalBundlePrice * (1 - UPSELL_DISCOUNT_BUNDLE))
  const currencyLabel = currency === 'eur' ? 'EUR' : 'RON'

  const courseCheckoutUrl = `${appUrl}/api/upsell/checkout?courseId=${upsellCourseId}&currency=${currency}&discount=${discountIndividual}`
  const bundleCheckoutUrl = `${appUrl}/api/upsell/checkout?bundleId=${bundleId}&currency=${currency}&discount=${discountBundle}`

  try {
    if (step === 1 && upsellCourseSlug) {
      await resend.emails.send({
        from: `Edinio <${process.env.RESEND_FROM_EMAIL}>`,
        to,
        subject: isRo
          ? `🎯 Ofertă specială -${discountIndividual}%: ${upsellCourseName}`
          : `🎯 Special offer -${discountIndividual}%: ${upsellCourseName}`,
        react: UpsellStep1Email({
          customerName,
          purchasedCourseName,
          upsellCourseName,
          upsellCourseSlug,
          originalPrice,
          discountedPrice: discountedCoursePrice,
          discountPercent: discountIndividual,
          currency: currencyLabel,
          checkoutUrl: courseCheckoutUrl,
          language,
        }),
      })
    } else if (step === 2 && bundleSlug) {
      await resend.emails.send({
        from: `Edinio <${process.env.RESEND_FROM_EMAIL}>`,
        to,
        subject: isRo
          ? `📦 Bundle complet -${discountBundle}% — toate cursurile AI`
          : `📦 Complete bundle -${discountBundle}% — all AI courses`,
        react: UpsellStep2Email({
          customerName,
          bundleName,
          originalPrice: originalBundlePrice,
          discountedPrice: discountedBundlePrice,
          discountPercent: discountBundle,
          currency: currencyLabel,
          checkoutUrl: bundleCheckoutUrl,
          courseNames,
          language,
        }),
      })
    } else if (step === 3) {
      const isBundle = !upsellCourseSlug && bundleSlug
      await resend.emails.send({
        from: `Edinio <${process.env.RESEND_FROM_EMAIL}>`,
        to,
        subject: isRo
          ? '⏰ Ultimele ore — oferta expiră în curând'
          : '⏰ Last hours — offer expiring soon',
        react: UpsellStep3Email({
          customerName,
          upsellCourseName: isBundle ? bundleName : upsellCourseName,
          discountedPrice: isBundle ? discountedBundlePrice : discountedCoursePrice,
          originalPrice: isBundle ? originalBundlePrice : originalPrice,
          discountPercent: isBundle ? discountBundle : discountIndividual,
          currency: currencyLabel,
          checkoutUrl: isBundle ? bundleCheckoutUrl : courseCheckoutUrl,
          language,
        }),
      })
    }
  } catch (err) {
    console.error(`[UPSELL EMAIL STEP ${step}]`, err)
  }
}
