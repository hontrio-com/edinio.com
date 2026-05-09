import { NextRequest } from 'next/server'

export interface GeoContext {
  country: string
  language: 'ro' | 'en'
  currency: 'ron' | 'eur'
  isRomania: boolean
}

export function detectGeo(request: NextRequest): GeoContext {
  // 1. Cloudflare header
  const cfCountry = request.headers.get('cf-ipcountry')?.toUpperCase()

  // 2. Vercel geo header
  const vercelCountry = request.headers.get('x-vercel-ip-country')?.toUpperCase()

  // 3. Accept-Language fallback
  const acceptLanguage = request.headers.get('accept-language') ?? ''
  const primaryLang = acceptLanguage.split(',')[0]?.split(';')[0]?.trim().toLowerCase()

  const country = cfCountry ?? vercelCountry ?? detectCountryFromLanguage(primaryLang)

  const isRomania = country === 'RO' || country === 'MD'
  const language: 'ro' | 'en' = isRomania ? 'ro' : 'en'
  const currency: 'ron' | 'eur' = isRomania ? 'ron' : 'eur'

  return { country: country ?? 'UNKNOWN', language, currency, isRomania }
}

function detectCountryFromLanguage(lang: string): string {
  if (!lang) return 'UNKNOWN'
  if (lang.startsWith('ro')) return 'RO'
  if (lang.startsWith('de')) return 'DE'
  if (lang.startsWith('fr')) return 'FR'
  if (lang.startsWith('es')) return 'ES'
  if (lang.startsWith('it')) return 'IT'
  return 'GB'
}

export const GEO_COOKIE = 'edinio-geo'
export const GEO_COOKIE_MAX_AGE = 60 * 60 * 24 // 24 ore

export function parseGeoCookie(value: string | undefined): GeoContext | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value))
    if (parsed.language && parsed.currency && parsed.country) return parsed as GeoContext
    return null
  } catch {
    return null
  }
}

export function serializeGeoCookie(geo: GeoContext): string {
  return encodeURIComponent(JSON.stringify(geo))
}
