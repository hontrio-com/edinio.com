import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://edinio.ro";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Creare magazin online in cateva minute | Edinio - Platforma eCommerce Romania",
    template: "%s | Edinio",
  },
  description:
    "Creeaza un magazin online profesional la cheie, fara cunostinte tehnice. Integrari cu curierii, plati online, facturi si AWB-uri automate. Incepe gratuit, pret de la 99 lei/luna.",
  keywords: [
    "creare magazin online",
    "realizare magazin online",
    "creare site magazin online",
    "magazin online creare",
    "creare magazin online pret",
    "creare magazin online la cheie",
    "creare magazin online profesional",
    "dezvoltare magazin online",
    "pret site magazin online",
    "creare site online",
    "creare site de vanzari",
    "creeaza magazin online",
    "platforma ecommerce romania",
    "magazin online romania",
  ],
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
    title:
      "Creare magazin online in cateva minute | Edinio",
    description:
      "Creeaza un magazin online profesional la cheie, fara cunostinte tehnice. Integrari cu curierii, plati online, facturi si AWB-uri automate. Incepe gratuit.",
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
    title: "Creare magazin online in cateva minute | Edinio",
    description:
      "Creeaza un magazin online profesional la cheie. Integrari cu curierii, plati, facturi. Incepe gratuit.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: SITE_URL,
  },
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
      <head>
        <link rel="preconnect" href="https://rtefdpioqmowkdiybwrr.supabase.co" />
        <link rel="dns-prefetch" href="https://rtefdpioqmowkdiybwrr.supabase.co" />
      </head>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            classNames: {
              toast: "font-sans text-sm",
              error: "!duration-6000",
            },
          }}
        />
      </body>
    </html>
  );
}
