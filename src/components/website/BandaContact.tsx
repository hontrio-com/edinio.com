import Link from "next/link";
import { Mail, Phone, SquarePen } from "lucide-react";
import { WhatsAppIcon } from "@/components/website/WhatsAppIcon";
import {
  EMAIL,
  FORMULAR,
  TELEFON,
  WHATSAPP,
  type CaleDeContact,
} from "@/lib/website/contact";

/**
 * Banda cu trei căi de contact, ca o singură placă.
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
 * Culoarea și trecerea stau pe ÎNVELIȘUL iconiței, nu pe fiecare iconiță în
 * parte: altfel regula „iconițele sunt stinse" s-ar fi rescris la fiecare
 * folosire, iar a doua oară s-ar fi scris altfel.
 *
 * ═══ TOATĂ CELULA E ȚINTĂ ═══
 *
 * Nu doar numărul. Pe telefon, o țintă de 44px pe toată lățimea celulei e
 * diferența dintre „apeși" și „nimerești". Eticheta („Telefon") stă ÎN interiorul
 * linkului aici — spre deosebire de subsol, unde prefixul e în afara lui:
 * acolo linkul e chiar numărul și eticheta ar fi format-o din greșeală; aici
 * ținta e celula întreagă, deci eticheta face parte din ea.
 *
 * ═══ CĂILE SUNT ARGUMENT, NU SCRISE ÎNĂUNTRU ═══
 *
 * ⚠ Centrul de ajutor își avea, până la auditul din 23.08, propria bandă:
 * `BandaAjutor`, făcută din trei carduri cu iconiță în cerc — exact tiparul pe
 * care fișierul ăsta îl evită dinadins, și scris chiar sub comentariul care
 * explică de ce nu se face așa. Motivul dublurii era mărunt: acolo a treia cale
 * e WhatsApp, nu formularul.
 *
 * Deci lista e acum argument, cu cele trei obișnuite ca implicit. O componentă,
 * o rețetă vizuală, iar ce diferă chiar de la o pagină la alta se dă din afară.
 */

/** O intrare din bandă: calea, cum se numește pe ecran și pictograma ei. */
export interface IntrareBanda {
  cale: CaleDeContact;
  eticheta: string;
  /* Nodul întreg, nu componenta: pictogramele din `lucide` primesc `strokeWidth`,
     iar sigla WhatsApp e un traseu scris de noi, care nu primește. Culoarea o dă
     învelișul, deci aici rămâne doar mărimea. */
  icoana: React.ReactNode;
}

const MARIME_ICOANA = "h-[18px] w-[18px]";

/** Telefon, e-mail, formular. Ce se vede pe `/preturi` și `/intrebari-frecvente`. */
export const CAI_IMPLICITE: IntrareBanda[] = [
  {
    cale: TELEFON,
    eticheta: "Telefon",
    icoana: <Phone strokeWidth={1.75} className={MARIME_ICOANA} aria-hidden="true" />,
  },
  {
    cale: EMAIL,
    eticheta: "Email",
    icoana: <Mail strokeWidth={1.75} className={MARIME_ICOANA} aria-hidden="true" />,
  },
  {
    cale: FORMULAR,
    eticheta: "Formular",
    icoana: <SquarePen strokeWidth={1.75} className={MARIME_ICOANA} aria-hidden="true" />,
  },
];

/**
 * Telefon, WhatsApp, e-mail. Ce cere schița centrului de ajutor, în ordinea ei.
 *
 * Formularul lipsește dinadins: în centrul de ajutor, omul a citit deja un ghid
 * și n-a rezolvat. Acolo vrea pe cineva acum, nu un mesaj la care se răspunde
 * mai târziu.
 */
export const CAI_AJUTOR: IntrareBanda[] = [
  {
    cale: TELEFON,
    eticheta: "Telefon",
    icoana: <Phone strokeWidth={1.75} className={MARIME_ICOANA} aria-hidden="true" />,
  },
  {
    cale: WHATSAPP,
    eticheta: "WhatsApp",
    /* Sigla poartă `aria-hidden` în ea, deci nu se mai pune aici. */
    icoana: <WhatsAppIcon className={MARIME_ICOANA} />,
  },
  {
    cale: EMAIL,
    eticheta: "Email",
    icoana: <Mail strokeWidth={1.75} className={MARIME_ICOANA} aria-hidden="true" />,
  },
];

export function BandaContact({
  className,
  cai = CAI_IMPLICITE,
}: {
  className?: string;
  cai?: IntrareBanda[];
}) {
  return (
    <div
      /*
        `overflow-hidden` ține colțurile rotunjite peste celulele dinăuntru;
        fără el, prima și ultima celulă ies în colțurile plăcii la hover.
      */
      className={`placa overflow-hidden rounded-[16px] ${className ?? ""}`}
    >
      <div className="grid sm:grid-cols-3">
        {cai.map(({ cale, eticheta, icoana }, i) => {
          const continut = (
            <>
              <span className="flex shrink-0 text-ink-3 transition-colors duration-200 group-hover:text-ink-2">
                {icoana}
              </span>
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
