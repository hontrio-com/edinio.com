import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// ⚠ FĂRĂ import de CSS AICI — vezi nota din `website.css`. Fiecare grup de rute
// își importă foaia lui: prezentarea pe `website.css`, restul pe `globals.css`.
// Un import aici ar aduce toate utilitarele înapoi peste tot.

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  /* Aceeasi socoteala ca la Inter, in `(website)/layout.tsx`: 29.288 de octeti
     ies din coada de dinaintea foii de stil, iar `swap` plus rezerva cu metrici
     potrivite fac ca nimic sa nu se vada. */
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  /*
    ⚠ NU SE PREÎNCARCĂ — 23.108 octeți pe fiecare pagină, pentru două pagini care
    chiar îl folosesc.

    ⚠ CORECTARE, 01.09.2026. Nota de aici a spus până acum că `font-mono` nu apare
    „niciodată pe site-ul de prezentare". FALS, și verificat: apare pe
    `/optimizare` (blocul de sitemap din `PanouSitemap.tsx:96`) și pe
    `/mentenanta-gratuita` (titlul din `TitluMentenanta.tsx:79`, prin
    `--font-mono`, care e legat de `--font-geist-mono` în `stil-comun.css:1527`).
    În HTML-ul construit: 2 apariții pe prima, 4 pe a doua, 0 pe restul.

    Hotărârea rămâne aceeași, dar din motivul adevărat: DOUĂ din optsprezece
    pagini publice îl folosesc, și niciuna pentru conținutul principal — un bloc
    de cod și un titlu decorativ. Preîncărcarea l-ar fi pus în calea critică a
    tuturor celorlalte șaisprezece.

    `preload: false` nu-l scoate: acolo unde e chiar folosit, browserul îl cere
    când dă peste regula CSS. Costul mutat e o clipă cu fontul de rezervă, pe
    exact acele două elemente.
  */
  preload: false,
});

const SITE_URL = "https://www.edinio.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Creare magazin online rapid | Edinio",
    template: "%s | Edinio",
  },
  description:
    "Creeaza un magazin online profesional fara cunostinte tehnice. Plati online, curierat, facturi si AWB-uri automate. Incepe gratuit cu Edinio.",
  /*
    ⚠ `keywords` A FOST SCOS pe 04.09.2026, si NU se pune la loc.

    Cele 14 expresii nu faceau nimic pentru Google (le ignora din 2009) si erau
    un semnal de spam pentru Bing. Dar motivul principal e altul: metadata
    radacinii se mosteneste de TOT ce randeaza aplicatia, deci expresiile de
    marketing ale platformei ajungeau si pe domeniile proprii ale
    comerciantilor — masurat pe bricosmart.ro, unde pagina magazinului purta
    „creare magazin online, realizare magazin online, …".
    ((public)/[slug]/[pageSlug]/page.tsx isi pune propriile `keywords`, ale
    comerciantului, si nu e atins de asta.)
  */
  authors: [{ name: "Edinio", url: SITE_URL }],
  creator: "Edinio",
  publisher: "Edinio",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "ro_RO",
    url: SITE_URL,
    siteName: "Edinio",
    title: "Creare magazin online rapid | Edinio",
    description:
      "Creeaza un magazin online profesional fara cunostinte tehnice. Plati online, curierat, facturi si AWB-uri automate. Incepe gratuit cu Edinio.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Edinio - Platforma de creare magazin online",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Creare magazin online rapid | Edinio",
    description:
      "Creeaza un magazin online profesional fara cunostinte tehnice. Plati online, curierat, facturi si AWB-uri automate. Incepe gratuit cu Edinio.",
    images: ["/og-image.png"],
  },
  // Fara `alternates` implicit aici. Metadata radacinii se mosteneste intreaga
  // de orice pagina care nu o redeclara, iar paginile de magazin fara canonical
  // propriu (cos, finalizare, retur, confirmare, politici, previzualizare) ar fi
  // anuntat crawlerului ca adresa lor canonica e edinio.com, inclusiv de pe
  // domeniul propriu al comerciantului: canonical intre domenii, pe pagini care
  // se declara in acelasi timp noindex. Toate paginile de prezentare isi pun
  // fiecare canonical-ul ei, deci nu pierd nimic; restul rutelor raman pe
  // propria adresa, ceea ce e si raspunsul corect.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ro"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        ⚠ AICI ERA UN `preconnect` + `dns-prefetch` CĂTRE SUPABASE, scos pe
        31.08.2026. Costul lui în octeți era mic (110 gzip), dar ce cumpăra era
        ZERO pe paginile publice: niciunul dintre cele 13 fișiere JS ale paginii
        de start nu atinge Supabase, deci browserul deschidea DNS + TCP + TLS
        către un server pe care vizitatorul putea să nu-l folosească niciodată.

        Pe un telefon, în primele secunde, o conexiune deschisă degeaba
        concurează cu fonturile și cu imaginile care chiar se văd.

        ⚠ DACĂ SE PUNE LA LOC, se pune în layoutul care CHIAR are nevoie —
        `(dashboard)`, `(auth)` — nu în rădăcină, care e părintele tuturor.
        Iar `dns-prefetch` lângă `preconnect` era oricum de prisos: al doilea îl
        cuprinde pe primul.
      */}
      {/*
        ⚠ AICI ERA `<Toaster>`, mutat pe 31.08.2026 în aspectele care chiar au
        nevoie de el: `(auth)`, `(dashboard)`, `(admin)`, `(onboarding)` și
        `/reactivare`. Din rădăcină ajungea peste TOT — inclusiv pe site-ul de
        prezentare, pe centrul de ajutor și pe magazinele comercianților, adică
        9 kB gzip de JavaScript pentru un vizitator care n-are de unde să
        declanșeze o notificare.

        Măsurat prin urmărirea importurilor, nu din ochi: 0 din 28 de rute ale
        site-ului de prezentare ajung la `sonner`, 0 din 15 ale magazinelor.

        ⚠ CINE VREA SĂ-L PUNĂ LA LOC AICI: nu rezolvă nimic, ci strică din nou.
        Ruta nouă care are nevoie de notificări își pune `<NotificariToast />`
        în aspectul ei, iar `notificari-montate.test.ts` spune exact care rută a
        rămas descoperită — fiindcă altfel greșeala e tăcută.
      */}
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
