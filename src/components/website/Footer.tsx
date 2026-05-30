import Image from "next/image";
import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/#functionalitati", label: "Functionalitati" },
  { href: "/#demo", label: "Demo interactiv" },
  { href: "/#preturi", label: "Preturi" },
  { href: "/#faq", label: "Intrebari frecvente" },
];

const LEGAL_LINKS = [
  { href: "/termeni", label: "Termeni si conditii" },
  { href: "/confidentialitate", label: "Politica de confidentialitate" },
  { href: "/cookies", label: "Politica cookies" },
  { href: "/gdpr", label: "GDPR" },
];

export function Footer() {
  return (
    <footer className="bg-foreground text-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Col 1: Logo + descriere */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
                E
              </div>
              <span className="text-xl font-bold">Edinio</span>
            </div>
            <p className="text-sm text-background/60 leading-relaxed">
              Platforma completa pentru magazine online. Creeaza-ti magazinul in cateva minute, cu mentenanta gratuita pe viata si suport 7 zile din 7.
            </p>
          </div>

          {/* Col 2: Produs */}
          <div>
            <h4 className="text-sm font-semibold mb-4">Produs</h4>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-background/60 hover:text-background transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Contact */}
          <div>
            <h4 className="text-sm font-semibold mb-4">Contact</h4>
            <ul className="space-y-2.5 text-sm text-background/60">
              <li>SC VOID SFT GAMES SRL</li>
              <li>CUI: 43474393</li>
              <li>
                <a href="tel:+40750456809" className="hover:text-background transition-colors">
                  0750 456 809
                </a>
              </li>
              <li>
                <a href="mailto:contact@edinio.com" className="hover:text-background transition-colors">
                  contact@edinio.com
                </a>
              </li>
              <li>Matasari, Jud. Gorj</li>
              <li>Str. Progresului, Nr. 2</li>
            </ul>
          </div>

          {/* Col 4: Legal */}
          <div>
            <h4 className="text-sm font-semibold mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-background/60 hover:text-background transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-background/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-background/40">
            &copy; {new Date().getFullYear()} Edinio. Toate drepturile rezervate.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://anpc.ro/ce-ستe-sal/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/anpc-sal.avif"
                alt="ANPC SAL"
                width={180}
                height={50}
                className="h-10 w-auto opacity-60 hover:opacity-100 transition-opacity"
              />
            </a>
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/anpc-sol.avif"
                alt="ANPC SOL"
                width={180}
                height={50}
                className="h-10 w-auto opacity-60 hover:opacity-100 transition-opacity"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
