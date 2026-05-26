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

export const metadata: Metadata = {
  title: {
    default: "Edinio - Mini-Site si Mini-Store pentru afaceri locale",
    template: "%s | Edinio",
  },
  description:
    "Creeaza un mini-site profesional cu programare online sau un magazin online complet in mai putin de 10 minute.",
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
