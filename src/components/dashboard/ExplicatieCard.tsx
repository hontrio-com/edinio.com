"use client";

import { useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/*
  Semnul de intrebare de pe cardurile din capul panoului: cum se calculeaza,
  scris pe intelesul comerciantului.

  ⚠ DE CE E CONTROLAT, si nu lasat pe purtarea implicita.
  Implicit, un tooltip se deschide la trecerea cu mausul si la tastatura. Pe
  telefon nu exista niciuna: degetul atinge, nu „trece peste", deci explicatia
  n-ar fi putut fi citita deloc de pe telefon. Aici, apasarea o deschide si o
  inchide, iar `closeOnClick={false}` opreste inchiderea imediata care ar fi
  facut atingerea sa para ca nu face nimic.

  ⚠ `preventDefault` SI `stopPropagation`: butonul sta peste cardul care e, tot
  el, o legatura catre pagina de detalii. Fara ele, cererea unei explicatii ar fi
  dus omul pe alta pagina.
*/
export function ExplicatieCard({ text, eticheta }: { text: string; eticheta: string }) {
  const [deschis, setDeschis] = useState(false);
  /*
    ⚠ `triggerId` E OBLIGATORIU CAT TIMP `open` E CONTROLAT, si lipsa lui nu da
    nicio eroare: explicatia pur si simplu nu se deschidea, nici la maus, nici la
    apasare. Fara id, bula nu stie de care buton sa se agate, deci nu se
    randeaza deloc. Prins in browser, nu in cod.
  */
  const idButon = useId();
  const felApasarii = useRef<string>("mouse");

  return (
    <TooltipProvider>
      <Tooltip open={deschis} onOpenChange={setDeschis} triggerId={idButon}>
        <TooltipTrigger
          id={idButon}
          closeOnClick={false}
          aria-label={`Cum se calculeaza: ${eticheta}`}
          onPointerDown={(e) => { felApasarii.current = e.pointerType; }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            /*
              ⚠ CU MAUSUL, APASAREA DOAR DESCHIDE; NU COMUTA.
              Prima incercare comuta mereu, si cu mausul explicatia nu se vedea
              deloc: trecerea peste buton o deschidea deja, iar clicul de
              imediat dupa o inchidea la loc. Cu degetul nu exista „trecere
              peste", deci acolo comutarea e chiar singura cale de inchidere.
            */
            setDeschis((v) => (felApasarii.current === "touch" ? !v : true));
          }}
          className="relative z-20 grid h-6 w-6 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Info strokeWidth={1.6} className="h-[15px] w-[15px]" />
        </TooltipTrigger>
        <TooltipContent side="top" align="end" className="max-w-[17rem] whitespace-pre-line leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
