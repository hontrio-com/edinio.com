import {
  Html, Head, Body, Container, Section, Text,
  Button, Heading, Preview,
} from '@react-email/components'

interface UpsellStep2EmailProps {
  customerName: string
  bundleName: string
  originalPrice: number
  discountedPrice: number
  discountPercent: number
  currency: string
  checkoutUrl: string
  courseNames: string[]
  language?: 'ro' | 'en'
}

export function UpsellStep2Email({
  customerName,
  bundleName,
  originalPrice,
  discountedPrice,
  discountPercent,
  currency,
  checkoutUrl,
  courseNames,
  language = 'ro',
}: UpsellStep2EmailProps) {
  const isRo = language === 'ro'

  return (
    <Html lang={language}>
      <Head />
      <Preview>
        {isRo
          ? `Bundle complet cu -${discountPercent}% — toate cursurile AI într-un singur pachet`
          : `Complete bundle -${discountPercent}% — all AI courses in one package`}
      </Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px' }}>
          <Section style={{ textAlign: 'center', marginBottom: '32px' }}>
            <Heading style={{ fontSize: '22px', fontWeight: '600', color: '#09090b' }}>edinio</Heading>
          </Section>

          <Section style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e4e4e7', padding: '32px', marginBottom: '24px' }}>
            <Text style={{ fontSize: '16px', color: '#09090b', marginTop: 0 }}>
              {isRo ? `${customerName}, mai ai timp!` : `${customerName}, you still have time!`}
            </Text>
            <Text style={{ fontSize: '15px', color: '#3f3f46', lineHeight: '1.6' }}>
              {isRo
                ? `Am observat că nu ai profitat încă de oferta noastră de ieri. Vrem să ne asigurăm că nu ratezi ocazia — mai ales că azi îți oferim ceva și mai bun: bundle-ul complet cu -${discountPercent}%.`
                : `We noticed you haven't taken advantage of yesterday's offer yet. Today we're offering something even better: the complete bundle at -${discountPercent}%.`}
            </Text>

            <Section style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '16px 20px', margin: '20px 0' }}>
              <Text style={{ fontSize: '13px', fontWeight: '600', color: '#09090b', margin: '0 0 12px' }}>
                {isRo ? `${bundleName} include:` : `${bundleName} includes:`}
              </Text>
              {courseNames.map((name) => (
                <Text key={name} style={{ fontSize: '13px', color: '#3f3f46', margin: '0 0 6px' }}>
                  ✓ {name}
                </Text>
              ))}
            </Section>

            <Section style={{ textAlign: 'center', margin: '20px 0' }}>
              <Text style={{ fontSize: '32px', fontWeight: '700', color: '#09090b', margin: '0 0 4px' }}>
                {Math.round(discountedPrice / 100)} {currency.toUpperCase()}
              </Text>
              <Text style={{ fontSize: '14px', color: '#a1a1aa', margin: 0, textDecoration: 'line-through' }}>
                {Math.round(originalPrice / 100)} {currency.toUpperCase()}
              </Text>
              <Text style={{ fontSize: '13px', color: '#3B6D11', fontWeight: '600', marginTop: '4px' }}>
                {isRo
                  ? `Economisești ${Math.round((originalPrice - discountedPrice) / 100)} ${currency.toUpperCase()}`
                  : `You save ${Math.round((originalPrice - discountedPrice) / 100)} ${currency.toUpperCase()}`}
              </Text>
            </Section>

            <Button
              href={checkoutUrl}
              style={{ backgroundColor: '#18181b', color: '#fff', borderRadius: '8px', padding: '14px 28px', fontSize: '15px', fontWeight: '500', textDecoration: 'none', display: 'block', textAlign: 'center' }}
            >
              {isRo ? 'Vreau bundle-ul complet →' : 'Get the complete bundle →'}
            </Button>

            <Text style={{ fontSize: '12px', color: '#a1a1aa', textAlign: 'center', marginTop: '16px' }}>
              {isRo ? 'Oferta expiră în 48 de ore.' : 'Offer expires in 48 hours.'}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
