import type { LucideIcon } from "lucide-react";

/**
 * Eticheta de deasupra titlului unei secțiuni: un cuvânt într-o pastilă, prins
 * între două fire subțiri care se sting spre exterior.
 *
 * Stă într-un fișier al ei pentru că e o PERECHE, nu un ornament repetat.
 * „Problema" e roșie, „Soluția" e verde, una sub alta pe aceeași pagină, și
 * numai fiindcă arată identic se citește că a doua răspunde la prima. Dacă
 * fiecare secțiune și-ar fi desenat-o pe a ei, s-ar fi despărțit la prima
 * retușare a uneia dintre ele.
 */

/**
 * Cele doua tonuri, singurul loc in care sunt scrise.
 *
 * `text` e mai inchis decat `rgb` INTENTIONAT. Verdele de brand, #1AB554, are
 * pe alb un contrast de 2,6:1, adica sub prag pentru text: la 12px iese o
 * eticheta pe care n-o citesti. Verdele de aici e acelasi ton, dus la 4,6:1.
 * `rgb` rimane cel de brand, pentru chenar si pentru inel, unde nu se citeste
 * nimic si conteaza doar culoarea.
 */
export const EYEBROW_TONES = {
  alarm: { rgb: "205, 46, 46", text: "#C0322F" },
  brand: { rgb: "26, 181, 84", text: "#12874A" },
} as const;

export type EyebrowTone = keyof typeof EYEBROW_TONES;

/**
 * Firele de langa pastila, stinse spre exterior.
 *
 * Scrise ca stil, nu ca `to-hairline` / `to-ink/12`: clasele astea ies din
 * Tailwind cu stopul transparent, deci firul nu se vede DELOC, desi
 * `bg-gradient-to-*` si `border-hairline` merg. Verificat pe `backgroundImage`
 * calculat, nu din ochi.
 */
const HAIRLINE_FADE = (direction: "right" | "left") =>
  `linear-gradient(to ${direction}, transparent, rgba(10,10,10,0.13))`;

interface SectionEyebrowProps {
  label: string;
  icon: LucideIcon;
  tone: EyebrowTone;
}

export function SectionEyebrow({ label, icon: Icon, tone }: SectionEyebrowProps) {
  const { rgb, text } = EYEBROW_TONES[tone];

  return (
    <div className="flex items-center justify-center gap-3">
      {/* Pe telefon firele dispar: n-ar avea loc si ar strange pastila la mijloc. */}
      <span
        aria-hidden
        className="hidden h-px w-20 sm:block lg:w-32"
        style={{ backgroundImage: HAIRLINE_FADE("right") }}
      />

      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-white px-3.5 py-1.5 text-[12px] font-medium"
        style={{
          borderColor: `rgba(${rgb},0.22)`,
          color: text,
          /* Inelul din jur: o singura umbra, nu un al doilea chenar de desenat. */
          boxShadow: `0 0 0 5px rgba(${rgb},0.05)`,
        }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {label}
      </span>

      <span
        aria-hidden
        className="hidden h-px w-20 sm:block lg:w-32"
        style={{ backgroundImage: HAIRLINE_FADE("left") }}
      />
    </div>
  );
}
