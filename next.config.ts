import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.b-cdn.net' },
      { protocol: 'https', hostname: 'vz-*.b-cdn.net' },
    ],
  },
}

export default withNextIntl(nextConfig)
