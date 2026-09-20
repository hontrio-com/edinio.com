"use client";

import { AlertTriangle, CreditCard, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { BandaCont, clasaButonBanda, type TonBanda } from "@/components/dashboard/BandaCont";

interface Props {
  /** Socotite pe server (vezi `@/lib/abonament-timp`), nu in randare: altfel
      serverul si browserul ar putea ajunge la doua numere diferite. */
  zileRamase: number;
}

/*
  Ultima treapta: magazinul se opreste, sau s-a oprit deja.

  ⚠ Vorbeste despre URMARE, nu despre cauza. „Plata a esuat" o spune deja banda
  dinainte (`PaymentPastDueBanner`); daca ar repeta-o si asta, comerciantul ar
  citi de doua ori aceeasi veste si n-ar intelege ce s-a schimbat intre timp.
  Aici noutatea e ca magazinul lui se inchide.
*/
export function GracePeriodBanner({ zileRamase }: Props) {
  const router = useRouter();
  const suspendat = zileRamase <= 0;

  /* Sub trei zile, atentionarea devine urgenta: de acolo incolo, pierderea
     magazinului nu mai e o posibilitate indepartata. */
  const ton: TonBanda = suspendat || zileRamase <= 3 ? "urgent" : "atentie";

  const titlu = suspendat
    ? "Magazinul tau este suspendat"
    : zileRamase === 1
      ? "Magazinul tau se suspenda maine"
      : `Magazinul tau se suspenda in ${zileRamase} zile`;

  const detaliu = suspendat
    ? "Nu mai este vizibil clientilor. Actualizeaza metoda de plata ca sa-l reactivezi imediat."
    : "Plata abonamentului nu a putut fi facuta. Actualizeaza metoda de plata ca sa ramana online.";

  return (
    <BandaCont
      ton={ton}
      pictograma={suspendat ? XCircle : AlertTriangle}
      titlu={titlu}
      detaliu={detaliu}
      actiune={
        <button
          type="button"
          onClick={() => router.push("/dashboard/settings#abonament")}
          className={clasaButonBanda(ton)}
        >
          <CreditCard className="h-3.5 w-3.5" />
          {suspendat ? "Reactiveaza acum" : "Actualizeaza plata"}
        </button>
      }
    />
  );
}
