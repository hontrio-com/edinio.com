import Image from "next/image";
import { ImageIcon } from "lucide-react";
import type { Captura } from "@/lib/website/ajutor";

/**
 * O captură de ecran dintr-un ghid, sau locul ei, cât timp poza nu există.
 *
 * ═══ SUBSTITUENTUL NU E O POZĂ LIPSĂ, E O SARCINĂ SCRISĂ ═══
 *
 * Clientul a cerut (19.08) substituenți pentru capturi, de înlocuit la sfârșit.
 * Un dreptunghi gri ar fi arătat ca o poză care nu s-a încărcat, iar cine face
 * capturile n-ar fi știut ce anume să fotografieze. Aici scrie chiar textul din
 * `alt`, adică descrierea ecranului care trebuie prins, plus calea unde se pune
 * fișierul.
 *
 * ⚠ LOCUL E REZERVAT DE LA ÎNCEPUT, la raportul dat. Substituentul și poza
 * adevărată ocupă exact aceeași înălțime, deci la înlocuire nu se mișcă nimic din
 * pagină. Fără asta, fiecare captură adăugată ar fi împins în jos tot ce urmează.
 *
 * ⚠ `alt` E SCRIS ODATĂ CU SUBSTITUENTUL, nu odată cu poza. Lăsat pentru mai
 * târziu, ajunge „captura1” la toate, iar cine nu vede ecranul rămâne fără pas.
 */
export function CapturaGhid({ captura }: { captura: Captura }) {
  /* `paddingBottom` procentual, nu `aspect-ratio`: ține înălțimea rezervată
     înainte să se știe ceva despre fișier, la fel pentru substituent și pentru
     poză, pe orice browser. */
  const inaltime = `${(1 / captura.raport) * 100}%`;

  if (captura.src) {
    return (
      <figure className="relative mt-4 w-full overflow-hidden rounded-[10px] border border-hairline bg-tint">
        <div style={{ paddingBottom: inaltime }} />
        <Image
          src={captura.src}
          alt={captura.alt}
          fill
          /* Loader-ul proiectului lasă neatinse imaginile locale. */
          unoptimized
          className="object-cover"
        />
      </figure>
    );
  }

  return (
    <div
      /*
        `aria-hidden`, fiindcă nu e conținut: e o însemnare pentru noi. Cine
        ascultă pagina aude pasul, care e întreg și fără poză. Un cititor de ecran
        care ar fi citit „Aici vine captura de ecran” ar fi anunțat o lipsă din
        redacție ca și cum ar fi fost o instrucțiune.
      */
      aria-hidden="true"
      className="relative mt-4 w-full overflow-hidden rounded-[10px] border border-dashed border-hairline bg-tint"
    >
      <div style={{ paddingBottom: inaltime }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <ImageIcon className="h-5 w-5 text-ink-3" />
        <p className="text-[13px] font-medium text-ink-2">{captura.alt}</p>
        <p className="text-[12px] text-ink-3">Aici vine captura de ecran.</p>
      </div>
    </div>
  );
}
