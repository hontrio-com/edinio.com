import type { PaymentMethodType } from "@/lib/payment-methods";

/**
 * Alegerea metodei de plata, in AMBELE formulare de comanda: pagina de finalizare
 * (`CheckoutForm`) si fereastra „Comanda acum" (`OrderModal`).
 *
 * Statea scrisa de doua ori, identic, cu aceeasi iconita de card pe fiecare procesator.
 * Acum fiecare metoda isi arata sigla reala, pe o placa ALBA, si pe tema inchisa:
 * siglele partenerilor sunt desenate pentru fond deschis (aceeasi regula ca in antetele
 * integrarilor din panou). Rambursul n-are sigla, deci are o imagine: coletul cu bani.
 *
 * Starea aleasa se vede prin chenar si prin punctul de alegere, nu printr-un fond colorat.
 */

type Sigla = {
  src: string;
  /** Inaltimea siglei pe placa: fiecare fisier are alt raport si alt aer in jurul desenului. */
  inaltime: string;
  /** Sigla Netopia e alba (pentru fond inchis); pe placa alba se inverseaza, ca in panou. */
  filtru?: string;
};

/*
 * Aceleasi fisiere ca in antetele integrarilor (`IntegrationHeader.tsx`). Nu se importa de acolo:
 * acela e cod de panou, iar vitrina nu trebuie sa-l traga dupa ea.
 */
const SIGLE: Record<PaymentMethodType, Sigla> = {
  /* Generata cu ElevenLabs (16.11.2026): colet de carton legat cu sfoara, cu bancnote in lei. */
  cash_on_delivery: { src: "/plati/ramburs.webp", inaltime: "h-12" },
  netopia: { src: "/integrations/netopia.svg", inaltime: "h-6", filtru: "invert(1)" },
  stripe: { src: "/integrations/stripe.svg", inaltime: "h-7" },
  ipay: { src: "/integrations/ipay-mic.webp", inaltime: "h-9" },
  klarna: { src: "/integrations/klarna.svg", inaltime: "h-[18px]" },
  revolut: { src: "/integrations/revolut.svg", inaltime: "h-[18px]" },
  tbi: { src: "/integrations/tbi.svg", inaltime: "h-8" },
};

export function AlegereMetodaPlata({
  metode,
  aleasa,
  onAlege,
  color,
}: {
  metode: { type: PaymentMethodType; label: string }[];
  aleasa: PaymentMethodType;
  onAlege: (metoda: PaymentMethodType) => void;
  color: string;
}) {
  return (
    <div className="@container space-y-2">
      <p className="text-sm font-semibold text-foreground">Metoda de plata</p>
      {/*
        ⚠ Coloanele dupa LATIMEA FORMULARULUI, nu a ecranului: aceeasi componenta sta in coloana
        paginii de finalizare (~520 px, trei coloane) si in fereastra „Comanda acum" (~380 px, doua),
        pe acelasi ecran de calculator.
      */}
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-3">
        {metode.map((m) => {
          const ales = m.type === aleasa;
          const sigla = SIGLE[m.type];
          return (
            // Starea aleasa se vede doar prin culoare: fara `aria-pressed`, cititorul de ecran
            // anunta sapte butoane identice.
            <button
              key={m.type}
              type="button"
              onClick={() => onAlege(m.type)}
              aria-pressed={ales}
              className="flex flex-col gap-2 rounded-xl border-2 bg-surface p-1.5 pb-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
              style={{ borderColor: ales ? color : "var(--color-border)" }}
            >
              <span className="flex h-14 items-center justify-center overflow-hidden rounded-lg bg-white px-3 ring-1 ring-black/5">
                {sigla && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sigla.src}
                    alt=""
                    className={`${sigla.inaltime} w-auto max-w-full object-contain`}
                    style={sigla.filtru ? { filter: sigla.filtru } : undefined}
                  />
                )}
              </span>
              <span className="flex items-start gap-2 px-1">
                <span
                  aria-hidden
                  className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                  style={{ borderColor: ales ? color : "var(--color-border)" }}
                >
                  {ales && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
                </span>
                <span className={`text-xs leading-snug ${ales ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>
                  {m.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
