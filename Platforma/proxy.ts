import createMiddleware from 'next-intl/middleware'
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { routing } from './i18n/routing'
import {
  detectGeo,
  parseGeoCookie,
  serializeGeoCookie,
  GEO_COOKIE,
  GEO_COOKIE_MAX_AGE,
} from '@/lib/geo'

const intlMiddleware = createMiddleware(routing)

const protectedRoutes = ['/dashboard', '/curs']
const adminRoutes = ['/admin']

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

  const pathname = request.nextUrl.pathname
  const isProtected = protectedRoutes.some((r) => pathname.includes(r))
  const isAdmin = adminRoutes.some((r) => pathname.includes(r))

  // Redirect unauthenticated users
  if ((isProtected || isAdmin) && !user) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin role check
  if (isAdmin && user) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return request.cookies.get(name)?.value },
          set() {},
          remove() {},
        },
      }
    )
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Apply i18n routing
  const intlResponse = intlMiddleware(request)

  // Merge Supabase auth cookies into the response
  supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
    intlResponse.cookies.set(name, value)
  })

  // Geo detection — set once per 24h
  const existingCookie = request.cookies.get(GEO_COOKIE)?.value
  const existingGeo = parseGeoCookie(existingCookie)

  if (!existingGeo) {
    const geo = detectGeo(request)
    intlResponse.cookies.set(GEO_COOKIE, serializeGeoCookie(geo), {
      maxAge: GEO_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    })
    intlResponse.headers.set('x-edinio-language', geo.language)
    intlResponse.headers.set('x-edinio-currency', geo.currency)
    intlResponse.headers.set('x-edinio-country', geo.country)
  } else {
    intlResponse.headers.set('x-edinio-language', existingGeo.language)
    intlResponse.headers.set('x-edinio-currency', existingGeo.currency)
    intlResponse.headers.set('x-edinio-country', existingGeo.country)
  }

  return intlResponse
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|mp4|webm)).*)',
  ],
}
