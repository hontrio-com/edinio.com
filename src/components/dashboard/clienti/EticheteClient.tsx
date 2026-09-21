import { AlertTriangle, Moon, Repeat, Sparkles, Upload, UserPlus } from "lucide-react";

import {
  DESPRE_ETICHETA, eticheteleClientului, faraIdentitate,
  type ClientDeEtichetat, type FelEticheta, type PraguriEtichete,
} from "@/lib/customers/etichete";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ETICHETELE UNUI CLIENT, PE ECRAN
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ REGULILE NU SUNT AICI. Stau in `lib/customers/etichete.ts`, cu masuratorile
  care le-au hotarat, si se probeaza acolo. Aici e doar cum arata.

  ⚠ FIECARE ISI POARTA EXPLICATIA in `title`: un badge pe care comerciantul nu-l
  intelege il pune sa ghiceasca, si sa ia hotarari despre un om pe baza unei
  ghiciri. „Risc de retur" mai ales.

  ⚠ CULORILE VIN DIN JETOANELE TEMEI, nu scrise de mana. Singura care iese din
  neutru e cea de risc, si iese DINADINS: e singura care spune ceva rau despre
  un om, deci trebuie sa se vada ca e altfel.
*/

const CUM_ARATA: Record<FelEticheta, { icon: typeof Repeat; clase: string }> = {
  nou: { icon: UserPlus, clase: "text-success bg-success/10 border-success/20" },
  recurent: { icon: Repeat, clase: "text-info bg-info/10 border-info/20" },
  vip: { icon: Sparkles, clase: "text-primary bg-primary/10 border-primary/20" },
  inactiv: { icon: Moon, clase: "text-muted-foreground bg-muted border-border" },
  importat: { icon: Upload, clase: "text-muted-foreground bg-muted border-border" },
  "risc-retur": { icon: AlertTriangle, clase: "text-destructive bg-destructive/10 border-destructive/20" },
};

export function EticheteClient({
  client, cheie, praguri, marime = "mic", clasa,
}: {
  client: ClientDeEtichetat;
  /** Cheia de grupare. Cand incepe cu `order:`, omul n-are nici telefon, nici email. */
  cheie?: string;
  praguri?: PraguriEtichete;
  /** `mic` in lista, `normal` in fisa. */
  marime?: "mic" | "normal";
  clasa?: string;
}) {
  const etichete = eticheteleClientului(client, praguri);
  const nuAreContact = !!cheie && faraIdentitate(cheie);
  if (etichete.length === 0 && !nuAreContact) return null;

  return (
    <>
      {etichete.map((fel) => {
        const { icon: Icon, clase } = CUM_ARATA[fel];
        const { text, explicatie } = DESPRE_ETICHETA[fel];
        return (
          <span
            key={fel}
            title={explicatie}
            className={[
              "inline-flex flex-shrink-0 items-center gap-1 rounded-full border font-semibold",
              marime === "mic" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
              clase,
              clasa ?? "",
            ].join(" ")}
          >
            <Icon className={marime === "mic" ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {text}
          </span>
        );
      })}

      {/*
        ⚠ CAND SE TREZESTE CAPCANA, SE VEDE. O comanda fara telefon SI fara email
        devine un „client" al ei, iar doua comenzi ale aceluiasi om nu se vor uni
        niciodata. Masurat pe productie la 21.09.2026: zero cazuri. Fara semnul asta,
        numarul de clienti s-ar umfla incet cu oameni care nu exista, si nimic n-ar
        da vreo eroare.
      */}
      {nuAreContact && (
        <span
          title={
            "Comanda n-a avut nici telefon, nici email, deci clientul ăsta e de fapt o singură "
            + "comandă. Dacă același om mai cumpără, va apărea ca alt client."
          }
          className={[
            "inline-flex flex-shrink-0 items-center gap-1 rounded-full border font-semibold",
            marime === "mic" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
            "text-warning bg-warning/10 border-warning/20",
          ].join(" ")}
        >
          <AlertTriangle className={marime === "mic" ? "h-2.5 w-2.5" : "h-3 w-3"} />
          Fără contact
        </span>
      )}
    </>
  );
}
