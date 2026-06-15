import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@aws-sdk/client-s3", "sanitize-html"],
  experimental: {
    serverActions: {
      // Product-import CSV uploads go through a Server Action; the default 1MB
      // body cap silently rejects real feeds (a 500-product CSV is ~1.2MB).
      bodySizeLimit: "8mb",
    },
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "react-day-picker",
      "framer-motion",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
    ],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  images: {
    loader: "custom",
    loaderFile: "./src/lib/supabase-image-loader.ts",
  },
  async headers() {
    // Permissive where third parties need it (Stripe, Netopia, FB/TikTok/Google
    // pixels, Supabase realtime), but locks the dangerous directives: no plugins,
    // base-uri/form-action pinned to self, framing restricted to same origin.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https:",
      "frame-ancestors 'self'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        source: "/:path*.(jpg|jpeg|png|gif|svg|webp|avif|ico|woff|woff2)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
