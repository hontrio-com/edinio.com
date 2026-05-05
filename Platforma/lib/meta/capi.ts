interface CAPIEvent {
  eventName: 'Purchase' | 'InitiateCheckout' | 'ViewContent' | 'AddToCart'
  eventTime: number
  userData: {
    email?: string
    clientIpAddress?: string
    clientUserAgent?: string
    fbp?: string
    fbc?: string
  }
  customData?: {
    value?: number
    currency?: string
    contentIds?: string[]
    contentName?: string
  }
  eventSourceUrl?: string
}

export async function sendCAPIEvent(event: CAPIEvent) {
  if (!process.env.META_PIXEL_ID || !process.env.META_ACCESS_TOKEN) return

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime,
        event_source_url: event.eventSourceUrl,
        user_data: {
          em: event.userData.email
            ? [await hashSHA256(event.userData.email.toLowerCase())]
            : undefined,
          client_ip_address: event.userData.clientIpAddress,
          client_user_agent: event.userData.clientUserAgent,
          fbp: event.userData.fbp,
          fbc: event.userData.fbc,
        },
        custom_data: event.customData,
        action_source: 'website',
      },
    ],
    test_event_code: process.env.META_TEST_EVENT_CODE,
  }

  try {
    await fetch(
      `https://graph.facebook.com/v19.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
  } catch (err) {
    console.error('Meta CAPI error:', err)
  }
}

async function hashSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
