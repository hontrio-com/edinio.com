import { useTranslations } from 'next-intl'

export default function ContactPage() {
  const t = useTranslations('nav')
  return (
    <main className="container mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold">{t('contact')}</h1>
    </main>
  )
}
