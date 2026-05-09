'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { GeoContext } from '@/lib/geo'
import { parseGeoCookie, GEO_COOKIE } from '@/lib/geo'

const GeoCtx = createContext<GeoContext>({
  country: 'RO',
  language: 'ro',
  currency: 'ron',
  isRomania: true,
})

export function GeoProvider({
  children,
  initialGeo,
}: {
  children: React.ReactNode
  initialGeo: GeoContext
}) {
  const [geo, setGeo] = useState<GeoContext>(initialGeo)

  useEffect(() => {
    const cookie = document.cookie
      .split('; ')
      .find((r) => r.startsWith(GEO_COOKIE + '='))
      ?.split('=')[1]
    const parsed = parseGeoCookie(cookie)
    if (parsed) setGeo(parsed)
  }, [])

  return <GeoCtx.Provider value={geo}>{children}</GeoCtx.Provider>
}

export function useGeo() {
  return useContext(GeoCtx)
}
