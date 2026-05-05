import { useTranslations } from 'next-intl'

export default function UpsellPage() {
  const t = useTranslations('thank_you')
  return (
    <main className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold mb-4">{t('special_offer')}</h1>
    </main>
  )
}
