import Link from "next/link";
import { AlertTriangle, Clock, Zap } from "lucide-react";
import { BandaCont, clasaButonBanda, type TonBanda } from "@/components/dashboard/BandaCont";
import { formatDate } from "@/lib/utils/format";

interface Props {
  planExpiresAt: string;
  /** Socotite pe server (vezi `@/lib/abonament-timp`), nu in randare. */
  zileRamase: number;
}

/*
  Cat a mai ramas din perioada de testare.

  ⚠ ACEEASI FORMA ca la plata esuata si la suspendare (`BandaCont`): pana acum
  fiecare avea propriul desen, iar banda asta era un degrade rosu-portocaliu la
  trei zile, adica mai tipatoare decat suspendarea propriu-zisa.

  ⚠ Treptele urmeaza cat de aproape e pierderea magazinului, nu cat de tare vrem
  sa vindem: peste 3 zile e o informare, sub 3 zile o atentionare, expirat e
  urgenta.
*/
export function TrialBanner({ planExpiresAt, zileRamase }: Props) {
  /* Departe de final, banda n-are ce spune: panoul nu e loc de reclama. */
  if (zileRamase > 15) return null;

  const expirat = zileRamase <= 0;
  const urgent = zileRamase <= 3;
  const ton: TonBanda = expirat ? "urgent" : urgent ? "atentie" : "informare";

  const titlu = expirat
    ? "Perioada de testare a expirat"
    : `${zileRamase} ${zileRamase === 1 ? "zi ramasa" : "zile ramase"} din perioada de testare`;

  const detaliu = expirat
    ? "Magazinul tau nu mai este vizibil clientilor. Alege un plan ca sa-l repornesti."
    : <>Alege un plan pana pe {formatDate(planExpiresAt)} ca sa ramai online. Anulezi oricand.</>;

  return (
    <BandaCont
      ton={ton}
      pictograma={expirat ? AlertTriangle : Clock}
      titlu={titlu}
      detaliu={detaliu}
      actiune={
        <Link href="/dashboard/settings#abonament" className={clasaButonBanda(ton)}>
          <Zap className="h-3.5 w-3.5" />
          Alege un plan
        </Link>
      }
    />
  );
}
