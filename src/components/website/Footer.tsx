import Link from "next/link";

const FOOTER_LINKS = {
  Produs: [
    { href: "/#functionalitati", label: "Functionalitati" },
    { href: "/preturi", label: "Preturi" },
    { href: "/#cum-functioneaza", label: "Cum functioneaza" },
    { href: "/#faq", label: "Intrebari frecvente" },
  ],
  Companie: [
    { href: "/despre", label: "Despre noi" },
    { href: "/contact", label: "Contact" },
  ],
  Legal: [
    { href: "/termeni", label: "Termeni si conditii" },
    { href: "/confidentialitate", label: "Politica de confidentialitate" },
    { href: "/cookies", label: "Politica cookies" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-foreground text-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
                E
              </div>
              <span className="text-xl font-bold">Edinio</span>
            </div>
            <p className="text-sm text-background/60 leading-relaxed">
              Platforma completa pentru afaceri locale. Creeaza-ti magazinul
              online in cateva minute.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
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
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-background/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-background/40">
            &copy; {new Date().getFullYear()} Edinio. Toate drepturile
            rezervate.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/termeni"
              className="text-xs text-background/40 hover:text-background/60 transition-colors"
            >
              Termeni
            </Link>
            <Link
              href="/confidentialitate"
              className="text-xs text-background/40 hover:text-background/60 transition-colors"
            >
              Confidentialitate
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
