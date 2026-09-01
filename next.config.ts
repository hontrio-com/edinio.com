import type { NextConfig } from "next";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CHEILE CARE TREBUIE SA EXISTE INAINTE SA PLECE O DESFASURARE DE PRODUCTIE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE LA BUILD, SI NU LA RULARE. Verificarea din `recaptcha.ts` e scrisa
  dinadins sa TREACA fara cheie: mai bine formularul merge decat sa refuze clienti
  adevarati fiindca a uitat cineva o variabila in panou. Alegerea e buna — dar
  inseamna ca o configurare gresita nu doboara nimic, doar stinge captcha in
  tacere, si singurul semn e un rand in jurnal pe care nu-l citeste nimeni.

  Locul potrivit pentru „fail-closed" e deci desfasurarea, nu cererea omului.

  ⚠ SI NUMAI LA BUILD. Daca ar arunca si la pornirea serverului, o variabila care
  lipseste dintr-un motiv oarecare ar transforma o captcha stinsa intr-o platforma
  cazuta — adica o paguba mai mare decat cea pe care o apara. De aceea se uita la
  faza: `phase-production-build`.

  ⚠ SI NUMAI PE INFRASTRUCTURA LOR. CI-ul face `cp .env.example .env.local`, iar
  acolo cheile sunt GOALE dinadins (se poarta ca lipsa, exact ce vrem la probe).
  Fara discriminatorul potrivit, verificarea asta ar face CI-ul rosu pentru chiar
  purtarea pe care o vrem acolo. Care e discriminatorul potrivit — si de ce NU e
  `VERCEL_ENV` singur — scrie in corpul functiei, unde am invatat-o pe pielea mea.

  Ce stinge fiecare cheie, lipsind:
    RECAPTCHA_SECRET_KEY            serverul nu mai verifica nimic
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY  browserul nu mai cere token
    RESEND_API_KEY                  `email.ts` iese devreme; formularul pare ca a
                                    mers, dar nu pleaca niciun mesaj

  ⚠ DAR NU TOATE TREI OPRESC DESFASURAREA. Vezi cele doua liste de mai jos: se
  opreste doar pe ce am VAZUT ca exista in panou.
*/
/*
  ⚠ DOUA LISTE, SI IMPARTIREA NU E ARBITRARA.

  `OBLIGATORII` sunt cheile pe care le-am VAZUT in panoul Vercel, pe Production
  (captura din 01.09.2026, adaugate pe 11 august). Pentru ele, o oprire nu poate
  strica nimic: daca sunt acolo azi, verificarea trece azi.

  `ASTEPTATE` e cheia pe care NU am putut-o vedea. In `.env.local` de pe masina de
  lucru e GOALA (`RESEND_API_KEY=""`), iar in Vercel nu stiu. Sa opresc
  desfasurarea pe o cheie a carei stare n-o cunosc ar fi exact paguba impotriva
  careia e scrisa paza asta — doar in celalalt sens. Deci se STRIGA in jurnalul
  de build, nu se opreste.

  ⚠ CAND SE CONFIRMA `RESEND_API_KEY` in panou, se muta in prima lista.
*/
const CHEI_OBLIGATORII = [
  "RECAPTCHA_SECRET_KEY",
  "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
] as const;

const CHEI_ASTEPTATE = ["RESEND_API_KEY"] as const;

function verificaCheileDeProductie(faza: string): void {
  /*
    ⚠ `CI` E DISCRIMINATORUL, NU `VERCEL_ENV` SINGUR — si am aflat-o pe pielea mea:
    prima varianta a acestei functii a STRICAT `npm run build` pe masina de lucru.
    Cauza: `vercel env pull` scrie in `.env.local` si `VERCEL_ENV="production"`,
    deci conditia era adevarata si local.

    `CI` nu e in `.env.local` si nici in `.env.example` (verificat), dar il pune
    Vercel la fiecare build. Cele doua impreuna inseamna „build adevarat de
    productie pe infrastructura lor", nu „cineva a tras variabilele la el".
  */
  if (!process.env.CI) return;
  if (process.env.VERCEL_ENV !== "production") return;
  if (faza !== "phase-production-build") return;

  for (const c of CHEI_ASTEPTATE) {
    if (!process.env[c]?.trim()) {
      console.warn(
        `[chei] ${c} lipseste din Production. Nu opresc desfasurarea — dar fara ea ` +
          "`email.ts` iese devreme, iar formularele raspund ca a mers fara sa plece niciun mesaj.",
      );
    }
  }

  const lipsa = CHEI_OBLIGATORII.filter((c) => !process.env[c]?.trim());
  if (lipsa.length === 0) return;

  throw new Error(
    [
      `Desfasurare de productie oprita: lipsesc ${lipsa.length} variabile din Vercel.`,
      ...lipsa.map((c) => `  - ${c}`),
      "",
      "Fiecare, lipsind, stinge in TACERE o aparare: captcha nu mai verifica, sau",
      "emailurile nu mai pleaca desi formularul raspunde ca a mers.",
      "Se pun in Settings > Environment Variables, pe Production, si se reia desfasurarea.",
    ].join("\n"),
  );
}

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
      /*
        ⚠ `/despre` ȘI `/magazin-online`, șterse pe 01.09.2026. Clientul: „le
        ștergem momentan, poate pe viitor o să le adăugăm."

        Amândouă răspundeau 200 și erau în sitemap, deci Google le știe. Aveau
        conținut adevărat — 78 kB și 70 kB de HTML — nu erau pagini goale.

        ⚠ DACĂ SE ADAUGĂ LA LOC, ȘTERGE ȘI RÂNDURILE ASTEA. O pagină nouă la o
        adresă care mai are redirectare e trimisă cu 308 către acasă, fără niciun
        404 și fără nicio eroare care să dea de bănuit — exact ce era să pățească
        `/migrare`, vezi nota de mai jos.
      */
      { source: "/despre", destination: "/", permanent: true },
      { source: "/magazin-online", destination: "/", permanent: true },
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
      /*
        ⚠ ERA `'self' https:`, iar comentariul de mai sus spunea „form-action
        pinned to self". Codul si nota nu se potriveau. Verificat inainte de
        schimbare: toate formularele cu `action` din proiect posteaza relativ, si
        niciun magazin de client nu are formular catre alt domeniu.

        ⚠ SI SA FIE LIMPEDE CE CUMPARA: aproape nimic, cat timp `script-src` are
        `'unsafe-inline'` si `https:`. Se schimba fiindca o nota mincinoasa e mai
        scumpa decat o directiva larga, nu fiindca inchide un atac.
      */
      "form-action 'self'",
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

/*
  Se exporta o FUNCTIE, nu obiectul: numai asa Next da `faza`, si numai asa
  verificarea de mai sus stie ca e la build si nu la pornirea serverului.
*/
export default function config(faza: string): NextConfig {
  verificaCheileDeProductie(faza);
  return nextConfig;
}
