import {
  Html, Head, Body, Container, Section, Text,
  Button, Heading, Preview,
} from '@react-email/components'

interface UpsellStep3EmailProps {
  customerName: string
  upsellCourseName: string
  discountedPrice: number
  originalPrice: number
  discountPercent: number
  currency: string
  checkoutUrl: string
  language?: 'ro' | 'en'
}

export function UpsellStep3Email({
  customerName,
  upsellCourseName,
  discountedPrice,
  originalPrice,
  discountPercent,
  currency,
  checkoutUrl,
  language = 'ro',
}: UpsellStep3EmailProps) {
  const isRo = language === 'ro'

  return (
    <Html lang={language}>
      <Head />
      <Preview>
        {isRo
          ? `⏰ Ultimele ore - reducerea de ${discountPercent}% expiră astăzi`
          : `⏰ Last hours - ${discountPercent}% discount expires today`}
      </Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px' }}>
          <Section style={{ textAlign: 'center', marginBottom: '32px' }}>
            <Heading style={{ fontSize: '22px', fontWeight: '600', color: '#09090b' }}>edinio</Heading>
          </Section>

          <Section style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e4e4e7', padding: '32px' }}>
            <Text style={{ fontSize: '24px', fontWeight: '600', color: '#09090b', marginTop: 0, textAlign: 'center' }}>
              ⏰
            </Text>
            <Text style={{ fontSize: '16px', fontWeight: '600', color: '#09090b', textAlign: 'center' }}>
              {isRo ? 'Ultimele ore din ofertă' : 'Last hours of the offer'}
            </Text>
            <Text style={{ fontSize: '15px', color: '#3f3f46', lineHeight: '1.6' }}>
              {isRo
                ? `${customerName}, acesta este ultimul email pe care ți-l trimitem cu privire la această ofertă. Reducerea de ${discountPercent}% la „${upsellCourseName}" expiră în câteva ore.`
                : `${customerName}, this is the last email we're sending about this offer. The ${discountPercent}% discount on „${upsellCourseName}" expires in a few hours.`}
            </Text>

            <Section style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px 20px', margin: '20px 0', textAlign: 'center' }}>
              <Text style={{ fontSize: '13px', color: '#b91c1c', fontWeight: '600', margin: '0 0 8px' }}>
                {isRo ? '🔴 Ofertă expiră în curând' : '🔴 Offer expiring soon'}
              </Text>
              <Text style={{ fontSize: '28px', fontWeight: '700', color: '#09090b', margin: '0 0 4px' }}>
                {Math.round(discountedPrice / 100)} {currency.toUpperCase()}
              </Text>
              <Text style={{ fontSize: '13px', color: '#a1a1aa', margin: 0, textDecoration: 'line-through' }}>
                {isRo ? 'Prețul normal:' : 'Regular price:'} {Math.round(originalPrice / 100)} {currency.toUpperCase()}
              </Text>
            </Section>

            <Button
              href={checkoutUrl}
              style={{ backgroundColor: '#dc2626', color: '#fff', borderRadius: '8px', padding: '14px 28px', fontSize: '15px', fontWeight: '600', textDecoration: 'none', display: 'block', textAlign: 'center' }}
            >
              {isRo ? 'Cumpăr acum înainte să expire →' : 'Buy now before it expires →'}
            </Button>

            <Text style={{ fontSize: '12px', color: '#a1a1aa', textAlign: 'center', marginTop: '16px' }}>
              {isRo
                ? 'După expirare, prețul revine la normal. Nu mai trimitem alte emailuri despre această ofertă.'
                : 'After expiration, the price returns to normal. We will not send any more emails about this offer.'}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
