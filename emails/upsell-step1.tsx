import {
  Html, Head, Body, Container, Section, Text,
  Button, Heading, Preview,
} from '@react-email/components'

interface UpsellStep1EmailProps {
  customerName: string
  purchasedCourseName: string
  upsellCourseName: string
  upsellCourseSlug: string
  originalPrice: number
  discountedPrice: number
  discountPercent: number
  currency: string
  checkoutUrl: string
  language?: 'ro' | 'en'
}

export function UpsellStep1Email({
  customerName,
  purchasedCourseName,
  upsellCourseName,
  originalPrice,
  discountedPrice,
  discountPercent,
  currency,
  checkoutUrl,
  language = 'ro',
}: UpsellStep1EmailProps) {
  const isRo = language === 'ro'

  return (
    <Html lang={language}>
      <Head />
      <Preview>
        {isRo
          ? `${customerName}, ai o ofertă specială -${discountPercent}% pentru ${upsellCourseName}`
          : `${customerName}, special offer -${discountPercent}% for ${upsellCourseName}`}
      </Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px' }}>
          <Section style={{ textAlign: 'center', marginBottom: '32px' }}>
            <Heading style={{ fontSize: '22px', fontWeight: '600', color: '#09090b' }}>
              edinio
            </Heading>
          </Section>

          <Section style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e4e4e7', padding: '32px', marginBottom: '24px' }}>
            <Text style={{ fontSize: '16px', color: '#09090b', marginTop: 0 }}>
              {isRo ? `Salut, ${customerName}!` : `Hi ${customerName}!`}
            </Text>
            <Text style={{ fontSize: '15px', color: '#3f3f46', lineHeight: '1.6' }}>
              {isRo
                ? `Felicitări pentru achiziționarea cursului „${purchasedCourseName}"! 🎉`
                : `Congratulations on getting „${purchasedCourseName}"! 🎉`}
            </Text>
            <Text style={{ fontSize: '15px', color: '#3f3f46', lineHeight: '1.6' }}>
              {isRo
                ? `Mulți dintre cursanții noștri care au terminat ${purchasedCourseName} au continuat imediat cu ${upsellCourseName} — și rezultatele au fost mult mai bune când le-au combinat.`
                : `Many students who completed ${purchasedCourseName} immediately continued with ${upsellCourseName} — and results were much better when combined.`}
            </Text>

            <Section style={{ backgroundColor: '#f4f4f5', borderRadius: '10px', padding: '20px', margin: '24px 0', textAlign: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#71717a', margin: '0 0 8px' }}>
                {isRo ? 'Ofertă exclusivă, disponibilă 24h' : 'Exclusive offer, valid 24h'}
              </Text>
              <Text style={{ fontSize: '28px', fontWeight: '700', color: '#09090b', margin: '0 0 4px' }}>
                {Math.round(discountedPrice / 100)} {currency.toUpperCase()}
              </Text>
              <Text style={{ fontSize: '14px', color: '#a1a1aa', margin: '0 0 4px', textDecoration: 'line-through' }}>
                {Math.round(originalPrice / 100)} {currency.toUpperCase()}
              </Text>
              <Text style={{ fontSize: '13px', color: '#3B6D11', fontWeight: '600', margin: 0 }}>
                -{discountPercent}% {isRo ? 'reducere exclusivă' : 'exclusive discount'}
              </Text>
            </Section>

            <Button
              href={checkoutUrl}
              style={{ backgroundColor: '#18181b', color: '#ffffff', borderRadius: '8px', padding: '14px 28px', fontSize: '15px', fontWeight: '500', textDecoration: 'none', display: 'block', textAlign: 'center' }}
            >
              {isRo ? `Da, vreau ${upsellCourseName} →` : `Yes, I want ${upsellCourseName} →`}
            </Button>

            <Text style={{ fontSize: '12px', color: '#a1a1aa', textAlign: 'center', marginTop: '16px' }}>
              {isRo
                ? 'Oferta expiră în 24 de ore de la această primire.'
                : 'Offer expires 24 hours after receiving this email.'}
            </Text>
          </Section>

          <Text style={{ fontSize: '12px', color: '#a1a1aa', textAlign: 'center' }}>
            © {new Date().getFullYear()} Edinio ·{' '}
            <a href={`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`} style={{ color: '#71717a' }}>
              {isRo ? 'Accesează platforma' : 'Go to platform'}
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
