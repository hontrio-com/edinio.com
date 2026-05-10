import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface PurchaseConfirmationEmailProps {
  customerName: string
  courseName: string
  courseSlug: string
  isNewUser: boolean
  temporaryPassword?: string
  loginUrl: string
  dashboardUrl: string
}

export function PurchaseConfirmationEmail({
  customerName,
  courseName,
  courseSlug: _courseSlug,
  isNewUser,
  temporaryPassword,
  loginUrl,
  dashboardUrl,
}: PurchaseConfirmationEmailProps) {
  return (
    <Html lang="ro">
      <Head />
      <Preview>Acces activat: {courseName} - bun venit pe Edinio!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={logoText}>edinio</Text>

          <Heading style={heading}>
            {isNewUser ? `Bun venit, ${customerName}!` : `Mulțumim, ${customerName}!`}
          </Heading>

          <Text style={paragraph}>
            Accesul tău la cursul <strong>{courseName}</strong> a fost activat.
            {isNewUser ? ' Am creat automat un cont pentru tine.' : ''}
          </Text>

          {isNewUser && temporaryPassword && (
            <Section style={credentialsBox}>
              <Text style={credentialsTitle}>Datele tale de autentificare</Text>
              <Text style={credentialsText}>
                <strong>Email:</strong> (adresa la care ai primit acest email)
              </Text>
              <Text style={credentialsText}>
                <strong>Parolă temporară:</strong>{' '}
                <code style={codeStyle}>{temporaryPassword}</code>
              </Text>
              <Text style={credentialsNote}>
                Te rugăm să îți schimbi parola după prima autentificare.
              </Text>
            </Section>
          )}

          <Section style={{ textAlign: 'center', marginTop: '32px' }}>
            <Button
              href={isNewUser ? loginUrl : dashboardUrl}
              style={button}
            >
              {isNewUser ? 'Autentifică-te și începe' : 'Accesează cursul'}
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Ai întrebări? Scrie-ne la{' '}
            <a href="mailto:support@edinio.com" style={link}>
              support@edinio.com
            </a>
          </Text>
          <Text style={footer}>© {new Date().getFullYear()} Edinio. Toate drepturile rezervate.</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 32px',
  maxWidth: '560px',
  borderRadius: '8px',
  marginTop: '40px',
  marginBottom: '40px',
}

const logoText = {
  fontSize: '28px',
  fontWeight: '800',
  color: '#16a34a',
  margin: '0 0 24px',
  letterSpacing: '-0.5px',
}

const heading = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#111827',
  margin: '0 0 16px',
}

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 24px',
}

const credentialsBox = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
}

const credentialsTitle = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#166534',
  margin: '0 0 12px',
}

const credentialsText = {
  fontSize: '14px',
  color: '#15803d',
  margin: '0 0 8px',
}

const credentialsNote = {
  fontSize: '12px',
  color: '#6b7280',
  margin: '12px 0 0',
}

const codeStyle = {
  backgroundColor: '#dcfce7',
  padding: '2px 6px',
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '14px',
}

const button = {
  backgroundColor: '#111827',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600',
  padding: '14px 28px',
  textDecoration: 'none',
}

const hr = {
  borderColor: '#e5e7eb',
  margin: '32px 0 24px',
}

const footer = {
  fontSize: '13px',
  color: '#9ca3af',
  margin: '0 0 8px',
}

const link = {
  color: '#6366f1',
  textDecoration: 'underline',
}
