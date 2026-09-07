import type { NextConfig } from "next";

import { RE_GAZDA_PLATFORMA } from "./src/lib/platform-hosts";
import { CALITATE, LATIMI_ECRAN, LATIMI_MICI } from "./src/lib/latimi-imagini";

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

  ⚠ TOATE TREI OPRESC DESFASURAREA, de pe 01.09.2026. Doua le-am vazut eu in
  panou; a treia a fost confirmata de proprietar. Vezi nota de la lista de mai jos
  pentru de ce o confirmare pe cuvant a fost destul TOCMAI AICI.
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
  /*
    ⚠ MUTATA AICI PE 01.09.2026, dupa ce proprietarul platformei a confirmat ca
    „in Production am toate cheile cum trebuie". Nu am vazut-o eu in panou, cum am
    vazut celelalte doua — dar el s-a uitat, si el e sursa care conteaza.

    ⚠ SI DACA TOTUSI LIPSESTE, urmarea nu e tacuta: desfasurarea se opreste cu
    numele cheii scris in jurnalul de build, nu se strica nimic in productia care
    ruleaza deja. Asta face greseala ieftina si reversibila — de aceea am acceptat
    confirmarea pe cuvant aici, si nu as fi acceptat-o pentru ceva care doboara
    ce merge.
  */
  "RESEND_API_KEY",
  /*
    ⚠ MUTATA AICI PE 01.09.2026, dupa ce proprietarul a confirmat ca a pus-o in
    Vercel. De ea atarna si un TEXT LEGAL: cat timp cheia e obligatorie, nicio
    desfasurare de productie nu poate porni fara GA4 — deci politicile au voie sa
    spuna, la prezent, ca-l folosim. Legatura e verificata de proba din
    `securitate-audit.test.ts`, in amandoua sensurile.

    ⚠ SCOASA DE AICI, textele trebuie duse inapoi la forma cumpatata. Proba cade
    si o cere; nu o sterge, muta-o.
  */
  "NEXT_PUBLIC_EDINIO_GA4_MEASUREMENT_ID",
  /*
    ⚠ MUTATA AICI PE 07.09.2026, dupa ce galeata privata a fost creata in Cloudflare, variabila
    pusa in Vercel (Production si Preview) si drumul probat de la capat la capat: un fisier urcat
    din formularul public a aterizat CHIAR in `edinio-uploads-privat`, sub
    `products/customizations/`.

    ⚠ CAT TIMP A FOST DOAR ASTEPTATA, purtarea fara ea era exact cea de dinainte — deci o oprire de
    desfasurare ar fi fost o paguba mai mare decat cea pe care o apara. Acum e altfel: galeata
    EXISTA, iar lipsa variabilei ar trimite tacut pozele de familie ale cumparatorilor inapoi in
    galeata publica, pe un domeniu de pe care oricine are cheia intreaga ii poate lua octetii.

    ⚠ Deci o desfasurare fara ea se OPRESTE, cu numele cheii in jurnal: ieftin si reversibil. O
    intoarcere tacuta la depozitul public nu se vede niciodata.
  */
  "R2_BUCKET_PRIVAT",
] as const;

/*
  Goala acum. Ramane ca loc pentru urmatoarea cheie a carei stare n-o cunoastem:
  se striga in jurnal, nu se opreste desfasurarea, pana cand cineva se uita.
*/
/*
  Goala acum. E locul pentru urmatoarea cheie a carei stare n-o cunoastem: se
  striga in jurnalul de build, nu se opreste desfasurarea, pana se uita cineva.
*/
const CHEI_ASTEPTATE: readonly string[] = [
  /*
    Goala din 07.09.2026: `R2_BUCKET_PRIVAT` si-a facut drumul intreg de aici in
    `CHEI_OBLIGATORII`, dupa ce galeata a fost creata si drumul probat. Lista ramane, ca loc pentru
    urmatoarea cheie a carei stare n-o cunoastem.
  */
];

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

  /*
    ⚠ MESAJUL E GENERAL, si a fost scris despre `email.ts`.

    Cat timp lista avea o singura cheie, textul putea numi urmarea ei. Cu a doua, el ar fi
    MINTIT — ar fi spus despre `R2_BUCKET_PRIVAT` ca „formularele raspund ca a mers fara sa plece
    niciun mesaj", ceea ce n-are nicio legatura. Ce trebuie sa afle cine citeste jurnalul e care
    cheie lipseste; de ce conteaza scrie langa ea, in lista.
  */
  for (const c of CHEI_ASTEPTATE) {
    if (!process.env[c]?.trim()) {
      console.warn(
        `[chei] ${c} lipseste din Production. Nu opresc desfasurarea — dar apararea pe care o ` +
          "aduce nu exista pana nu e pusa. Vezi nota de langa ea in `CHEI_ASTEPTATE`.",
      );
    }
  }

  /*
    ⚠ O GALEATA „PRIVATA" CARE E CHIAR CEA PUBLICA OPRESTE DESFASURAREA.

    Cheia lipsa e o aparare care inca nu exista — se STRIGA, si atat, fiindca purtarea fara ea e
    exact cea de pana acum. Cheia PUSA GRESIT e altceva: ea spune „gata, fisierele cumparatorilor
    sunt private" si nu sunt. Cine o pune se uita o data la panou, vede variabila acolo, si nu se
    mai intoarce niciodata — iar pozele de familie ale clientilor raman pe un domeniu public, cu
    convingerea ca nu sunt.

    ⚠ De aceea asta ARUNCA, spre deosebire de lista de mai sus: o desfasurare oprita cu numele
    cheii in jurnal e ieftina si reversibila; o falsa siguranta nu se vede niciodata.
  */
  const privat = process.env.R2_BUCKET_PRIVAT?.trim();
  if (privat && privat === process.env.R2_BUCKET_NAME?.trim()) {
    throw new Error(
      "[chei] R2_BUCKET_PRIVAT e chiar galeata publica (R2_BUCKET_NAME). Incarcarile "
        + "cumparatorilor ar fi ramas publice, dar configuratia ar fi aratat ca sunt private. "
        + "Creeaza o galeata separata, fara acces public, si pune numele ei aici.",
    );
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
    /*
      ═══ ⚠ FIECARE REDIRECTARE E LEGATA DE GAZDA PLATFORMEI (04.09.2026) ═══

      `redirects()` ruleaza INAINTEA proxy-ului (Next, „Execution order": headers,
      redirects, proxy) si, fara `has`, se aplica pe ORICE gazda — inclusiv pe
      domeniul propriu al unui comerciant, unde niciuna din adresele astea nu e a
      noastra.

      Nu e o teama, era deja viu: masurat in productie pe 04.09.2026,
      `https://bricosmart.ro/despre` si `https://esafe.ro/despre` raspundeau 308
      catre pagina lor de start, desi `/despre` e o pagina a PLATFORMEI, stearsa
      de noi. Un comerciant care isi face o pagina proprie cu adresa `/despre`,
      `/index` sau `/start` — toate permise de `validatePageSlug` — n-ar fi
      ajuns niciodata la ea: 308 inainte de orice, fara 404, fara nimic in jurnal.

      Expresia vine din `platform-hosts.ts`, ca sa nu existe o a doua lista de
      gazde ale platformei.
    */
    const doarPePlatforma = [{ type: "host" as const, value: RE_GAZDA_PLATFORMA }];
    return [
      { source: "/roadmap", destination: "/blog", permanent: true, has: doarPePlatforma },
      /*
        ⚠ `/start` A FOST ȘTEARSĂ PE 31.08.2026, la cererea clientului: pagina de
        aterizare a site-ului vechi, care nu mai era folosită în reclame.

        Redirectarea NU e de prisos. `/start` era în sitemap și răspundea 200 pe
        edinio.com, deci Google o știe și cineva o poate avea în semne de carte.
        Fără rândul ăsta, o adresă indexată devine 404 peste noapte.

        Aici, și nu în altă parte: nota de mai jos explică ce s-a întâmplat data
        trecută când două ramuri au adăugat fiecare câte un `redirects()`.
      */
      { source: "/start", destination: "/", permanent: true, has: doarPePlatforma },
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
      { source: "/despre", destination: "/", permanent: true, has: doarPePlatforma },
      { source: "/magazin-online", destination: "/", permanent: true, has: doarPePlatforma },
      /*
        ⚠ `/index` NU E O PAGINA DE-A NOASTRA, DAR RASPUNDEA 200.

        Masurat in productie pe 04.09.2026: `https://www.edinio.com/index`
        intorcea pagina de start intreaga, cu `x-matched-path: /` — Vercel
        serveste fisierul prerandat `index.html` si pentru calea `/index`. Deci
        aveam doua adrese cu acelasi continut, tinute laolalta doar de canonical.
        Nimic nu trimitea acolo, dar adresa e ghicita de crawlere si de scanere
        vechi de site.

        308, nu 404: pagina EXISTA la `/`, doar se cheama altfel.
      */
      { source: "/index", destination: "/", permanent: true, has: doarPePlatforma },
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
    /*
     * ═══ ⚠ FIECARE LATIME DIN LISTELE ASTEA E BANI, IN FIECARE LUNA ═══
     *
     * Loaderul nostru trimite imaginile prin redimensionatorul de la marginea Cloudflare
     * (`/cdn-cgi/image/width=W,quality=Q,format=auto/<cheie>`). Cloudflare factureaza
     * TRANSFORMARI UNICE, iar unic inseamna imagine × SET DE PARAMETRI — deci aceeasi poza
     * ceruta la 640 si la 828 e platita de doua ori. Si contorul se RESETEAZA lunar: rezultatul
     * ramane in cache, dar in ciclul urmator se numara din nou. Nu inchiriezi o poza taiata, ci
     * taietorul.
     *
     * Masurat pe 07.09.2026, dupa 9 zile din ciclu: 21.520 de transformari unice, 8,50 $, cu o
     * proiectie de 29,28 $ pe ciclu. Catalogul are 25.227 de imagini pe 7.004 produse active —
     * adica in jur de TREI latimi distincte cerute in medie pentru fiecare poza. Iar in acele
     * noua zile s-au creat doar 79 de produse: nu era continut nou, era chiar resetarea lunara.
     *
     * ⚠ CU `sizes` PUS, NEXT FACE `srcset` DIN AMANDOUA LISTELE. Vezi
     * `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`: `imageSizes`
     * „are concatenated with the array of device sizes". Cu implicitele (8 + 7) ieseau
     * CINCISPREZECE latimi posibile pentru fiecare poza, iar browserele chiar se imprastiau pe
     * ele: un telefon cerea 640, altul 750, altul 828 — trei fisiere aproape identice, trei
     * transformari platite.
     *
     * ⚠ CE S-A TAIAT, SI DE CE TOCMAI ASTEA:
     *   - tripleta 640/750/828 -> a ramas 640. Sunt latimi vecine intre care ochiul nu deosebeste
     *     nimic, dar factura da;
     *   - 1200/2048/3840 -> au ramas 1536 si 1920. 3840 se cerea de pe ecranele 4K la `100vw`,
     *     adica exact cea mai scumpa transformare, pentru o poza de produs;
     *   - din `imageSizes` au ramas patru: miniaturile cerute de interfata sunt intre 28 si 128 de
     *     pixeli, iar 384 le acopera si la trei ori densitatea.
     *
     * ⚠ VALORILE SUNT ALESE SA EXISTE SI IN `TREPTE_LATIME` din `src/app/api/img/route.ts`.
     * Nu e o coincidenta si nu se strica fara motiv: pasul urmator e sa PREGENERAM variantele in
     * R2 si sa le servim ca obiecte simple, ca sa nu se mai transforme nimic lunar. Aia merge
     * numai daca amandoua caile cer exact aceleasi latimi; una singura pe langa inseamna un
     * fisier care lipseste si o poza rupta.
     *
     * ⚠ SI CALITATEA SE FIXEAZA. Un singur `quality={90}` scapat intr-o componenta ar fi deschis
     * un set INTREG de variante noi, in paralel cu cele de 75 — dublarea facturii, fara ca nimic
     * sa arate altfel pe ecran. Masurat azi: zero apelanti cer alta calitate.
     */
    deviceSizes: [...LATIMI_ECRAN],
    imageSizes: [...LATIMI_MICI],
    qualities: [CALITATE],
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
        pinned to self". Codul si nota nu se potriveau. La stramtare am verificat
        toate formularele cu `action` DIN PROIECT — si acolo a fost greseala: nu
        formularele noastre conteaza, ci cele pe care le face un script tert in
        pagina.

        ═══ ⚠ CE A STRICAT `'self'` SINGUR, MASURAT IN PRODUCTIE PE 02.09.2026 ═══

        In consola de pe www.edinio.com:

          Sending form data to 'https://www.facebook.com/tr/' violates the
          following Content Security Policy directive: "form-action 'self'".
          The request has been blocked.

        Pixelul Meta trimite prin GET cat timp incape in adresa, si trece pe POST
        de formular cand nu mai incape. A doua cale era taiata — deci evenimentele
        mai incarcate se pierdeau, tacut. Nimic nu cadea si nimic nu se vedea in
        cod: se vedea numai in browser, pe productie.

        ⚠ SE DESCHIDE EXACT CAT TREBUIE. Nu inapoi la `https:` (orice gazda), ci
        numai gazda masurata ca fiind blocata. Iar nota de mai jos ramane
        adevarata: cat timp `script-src` are `'unsafe-inline'`, directiva asta
        cumpara putin — dar acum nu mai si costa.
      */
      "form-action 'self' https://www.facebook.com",
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
