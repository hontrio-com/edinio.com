import type { Metadata } from 'next'
import { AuthLayout } from '@/components/auth/auth-layout'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata: Metadata = { title: 'Recuperare parolă - Edinio' }

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Recuperează parola"
      subtitle="Îți trimitem un link de resetare pe email"
    >
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
