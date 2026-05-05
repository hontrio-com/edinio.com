export interface CheckoutPayload {
  courseId: string
  currency?: 'ron' | 'eur'
  successUrl?: string
  cancelUrl?: string
}

export interface CheckoutResponse {
  url: string | null
  error?: string
}
