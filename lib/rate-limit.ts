import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest } from 'next/server'

let redis: Redis | null = null
const ratelimiters: Record<string, Ratelimit> = {}

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

type WindowStr = `${number} s` | `${number} m` | `${number} h` | `${number} d`

const LIMITS: Record<string, { requests: number; window: WindowStr }> = {
  checkout:  { requests: 5,  window: '1 m' },
  auth:      { requests: 10, window: '5 m' },
  api:       { requests: 60, window: '1 m' },
  payout:    { requests: 3,  window: '1 d' },
  badges:    { requests: 30, window: '1 m' },
  'video-url': { requests: 60, window: '1 m' },
}

export async function rateLimit(
  req: NextRequest,
  type: keyof typeof LIMITS
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const r = getRedis()
  if (!r) return { success: true, remaining: 999, reset: 0 }

  if (!ratelimiters[type]) {
    const { requests, window } = LIMITS[type]
    ratelimiters[type] = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(requests, window),
      analytics: true,
    })
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'

  const result = await ratelimiters[type].limit(`${type}:${ip}`)
  return { success: result.success, remaining: result.remaining, reset: result.reset }
}

export function rateLimitResponse(reset: number) {
  return new Response(
    JSON.stringify({ error: 'Prea multe cereri. Încearcă mai târziu.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}
