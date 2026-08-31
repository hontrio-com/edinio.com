import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  /*
   * `/roadmap` a devenit `/blog` (2026-08-09).
   *
   * Redirectul nu e politete: pagina veche e in productie de luni de zile, deci
   * exista in indexul Google si in linkurile date pana acum. Fara el, fiecare
   * dintre ele ar da 404 in ziua unirii cu `main`, iar autoritatea adunata pe
   * adresa veche s-ar pierde. `permanent: true` = 308, adica exact ce spune
   * Google sa folosesti cand o adresa se muta definitiv.
   */
  async redirects() {
    return [
      { source: "/roadmap", destination: "/blog", permanent: true },
      /*
        ⚠ `/start` A FOST ȘTEARSĂ PE 31.08.2026, la cererea clientului: pagina de
        aterizare a site-ului vechi, care nu mai era folosită în reclame.

        Redirectarea NU e de prisos. `/start` era în sitemap și răspundea 200 pe
        edinio.com, deci Google o știe și cineva o poate avea în semne de carte.
        Fără rândul ăsta, o adresă indexată devine 404 peste noapte.

        Aici, și nu în altă parte: nota de mai jos explică ce s-a întâmplat data
        trecută când două ramuri au adăugat fiecare câte un `redirects()`.
      */
      { source: "/start", destination: "/", permanent: true },
    ];
  },
  /*
   * ⚠ AICI A FOST SI `/migrare` → `/`, ADUS DE `main`. E SCOS DINADINS.
   *
   * `main` il pusese pe 05.08.2026, cand pagina /migrare a fost stearsa: o
   * redirectie e purtarea buna pentru o adresa care mai traieste in reclame.
   * Dar ramura de site a REFACUT pagina, ca pagina de prezentare.
   *
   * Pastrat la unire, ar fi trimis cu 308 chiar pagina noua catre acasa —
   * adica munca a zece commituri ar fi fost de negasit in productie, fara
   * niciun 404 si fara nicio eroare care sa dea de banuit. Git nu semnalase
   * conflict: fiecare ramura adaugase cate un `redirects()`, iar imbinarea a
   * pus doua chei cu acelasi nume. Doar typecheck-ul a prins-o.
   *
   * Daca /migrare se scoate vreodata din nou, redirectia se pune la loc AICI,
   * in singurul `redirects()` care trebuie sa existe.
   */
  serverExternalPackages: ["@aws-sdk/client-s3", "sanitize-html", "sharp"],
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
