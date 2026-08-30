import { Inter } from "next/font/google";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Footer } from "@/components/website/Footer";
import { StickyContact } from "@/components/website/StickyContact";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";
import { butonVerde } from "@/lib/website/buton";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

/**
 * Învelișul centrului de ajutor.
 *
 * ═══ DE CE UN GRUP DE RUTE PROPRIU, NU UN LAYOUT ÎN `(website)` ═══
 *
 * Cerut de client (30.08): în centrul de ajutor nu se mai pune bara de sus a
 * site-ului, ci doar trei butoane. Un layout imbricat NU poate scoate ce
 * desenează layoutul părinte, deci cât timp `/ajutor` stătea sub `(website)`,
 * `SiteHeader` venea odată cu el, orice s-ar fi scris dedesubt.
 *
 * De aceea secțiunea s-a mutat în `(ajutor)`. Grupurile de rute nu apar în
 * adresă, deci paginile rămân la `/ajutor`, `/ajutor/<categorie>` și
 * `/ajutor/<categorie>/<ghid>`. Nicio adresă nu se schimbă, niciun link nu se rupe.
 *
 * ⚠ Motivul din spatele cererii e mutarea pe `ajutor.edinio.com`. Când vine, aici
 * se schimbă un singur lucru: cele trei linkuri de mai jos trebuie să devină
 * absolute (`https://www.edinio.com/...`), fiindcă de pe subdomeniu `/login` ar
 * duce la `ajutor.edinio.com/login`, care nu există. Fișierul ăsta e trecut în
 * lista din `lib/website/ajutor.ts`, ca să nu se uite.
 *
 * ═══ BARA E COMPONENTĂ DE SERVER ═══
 *
 * `SiteHeader` e componentă de client: are meniuri mari care se deschid la
 * trecerea mouse-ului, stare de derulare, meniu de telefon. Aici nu e nimic de
 * apăsat în afară de trei linkuri, deci nu pleacă niciun JavaScript către om
 * pentru bara asta. Pe un centru de ajutor, unde omul vine cu o problemă și
 * deschide pagina de pe telefon, asta se simte.
 */
export default function AjutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} bg-white`}>
      <PlatformMetaPixel />
      <PlatformTikTokPixel />

      <header className="sticky top-0 z-50 border-b border-hairline bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between gap-3 px-5 sm:px-6 lg:px-8">
          {/* Sigla duce în capul centrului de ajutor, nu pe site: aici e casa
              omului cât timp caută un răspuns. */}
          <Logo href="/ajutor" size="sm" />

          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[14px] font-medium text-ink-2 transition-colors duration-150 hover:text-ink sm:px-3.5"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              {/* Pe ecran mic rămâne doar „Pagina principală”: textul întreg
                  împinge celelalte două butoane în afara barei pe telefon. */}
              <span className="hidden sm:inline">Înapoi pe pagina principală</span>
              <span className="sm:hidden">Pagina principală</span>
            </Link>

            <Link
              href="/login"
              className="rounded-full px-2.5 py-2 text-[14px] font-medium text-ink-2 transition-colors duration-150 hover:text-ink sm:px-3.5"
            >
              Conectează-te
            </Link>

            <Link href="/register" className={butonVerde("bara")}>
              Începe gratuit
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
