import { useTranslations } from 'next-intl'

export default function CheckoutPage() {
  const t = useTranslations('checkout')
  return (
    <main className="container mx-auto px-4 py-16 max-w-lg">
      <h1 className="text-3xl font-bold mb-6">{t('title')}</h1>
      <p className="text-muted-foreground">{t('secure_payment')}</p>
    </main>
  )
}
