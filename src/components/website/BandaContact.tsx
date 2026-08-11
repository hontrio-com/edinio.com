import Link from "next/link";
import { Mail, Phone, SquarePen } from "lucide-react";
import { EMAIL, FORMULAR, TELEFON, type CaleDeContact } from "@/lib/website/contact";

/**
 * Banda cu cele trei căi de contact: telefon, e-mail, formular.
 *
 * ═══ O PLACĂ CU TREI CELULE, NU TREI CARDURI ═══
 *
 * Trei carduri cu iconiță în pătrat colorat e chiar tiparul pe care clientul
 * l-a tăiat de fiecare dată — e primul din lista „ce se citește ca vibe coded"
 * din notițe, alături de rândurile de bife și numerele în bulină. Ochiul îl
 * recunoaște înainte de primul cuvânt.
 *
 * Aici e UN singur lucru cu trei intrări: aceeași placă albă și aceeași umbră
 * ca la întrebările de deasupra, iar celulele sunt despărțite doar prin linii
 * subțiri. Exact structura plăcii de întrebări, întoarsă pe orizontală — de
 * aceea cele două se citesc ca o pereche, nu ca două secțiuni alăturate.
 *
 * ═══ ICONIȚELE SUNT STINSE, NU COLORATE ═══
 *
 * `text-ink-3`, fără fundal, fără cerc. Verdele rămâne al butonului din hero-ul
 * paginii de start; trei pete de verde aici ar concura cu el și n-ar spune
 * nimic în plus — pictograma e oricum dublată de eticheta de sub ea.
 *
 * ═══ TOATĂ CELULA E ȚINTĂ ═══
 *
 * Nu doar numărul. Pe telefon, o țintă de 44px pe toată lățimea celulei e
 * diferența dintre „apeși" și „nimerești". Eticheta („Telefon") stă ÎN interiorul
 * linkului aici — spre deosebire de subsol, unde prefixul e în afara lui:
 * acolo linkul e chiar numărul și eticheta ar fi format-o din greșeală; aici
 * ținta e celula întreagă, deci eticheta face parte din ea.
 */

const CAI: { cale: CaleDeContact; eticheta: string; Icoana: typeof Phone }[] = [
  { cale: TELEFON, eticheta: "Telefon", Icoana: Phone },
  { cale: EMAIL, eticheta: "Email", Icoana: Mail },
  { cale: FORMULAR, eticheta: "Formular", Icoana: SquarePen },
];

export function BandaContact({ className }: { className?: string }) {
  return (
    <div
      /*
        `overflow-hidden` ține colțurile rotunjite peste celulele dinăuntru;
        fără el, prima și ultima celulă ies în colțurile plăcii la hover.
      */
      className={`placa overflow-hidden rounded-[16px] ${className ?? ""}`}
    >
      <div className="grid sm:grid-cols-3">
        {CAI.map(({ cale, eticheta, Icoana }, i) => {
          const continut = (
            <>
              <Icoana
                aria-hidden="true"
                strokeWidth={1.75}
                className="h-[18px] w-[18px] shrink-0 text-ink-3 transition-colors duration-200 group-hover:text-ink-2"
              />
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                  {eticheta}
                </span>
                {/*
                  `truncate` pe adresă: „contact@edinio.com" cere ~130px, iar
                  celula are ~250px pe desktop — încape. Dar dacă se schimbă
                  vreodată adresa într-una lungă, mai bine se taie decât să
                  împingă celula și să strice cele trei coloane egale.
                */}
                <span className="mt-0.5 block truncate text-[15px] font-medium text-ink">
                  {cale.label}
                </span>
              </span>
            </>
          );

          /*
            Liniile despărțitoare: pe telefon celulele stau una sub alta, deci
            linia e DEASUPRA (fără prima); de la `sm` stau alături, deci linia
            trece la STÂNGA. Scrise pe copil, nu ca `divide-*` pe părinte —
            `divide-` cu o culoare din temă e exact familia de utilitare care a
            ieșit deja transparentă o dată în proiectul ăsta.
          */
          const clase = [
            "group flex items-center gap-3 px-5 py-4 transition-colors duration-200 hover:bg-tint sm:px-6 sm:py-5",
            i > 0 ? "border-t border-hairline sm:border-t-0 sm:border-l" : "",
          ].join(" ");

          /* `tel:` și `mailto:` NU trec prin `next/link`: routerul încearcă să
             le trateze ca rute interne. Aceeași notă ca în `Footer.tsx`. */
          return cale.extern ? (
            <a key={eticheta} href={cale.href} className={clase}>
              {continut}
            </a>
          ) : (
            <Link key={eticheta} href={cale.href} className={clase}>
              {continut}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
