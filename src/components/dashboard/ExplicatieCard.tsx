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
export function ExplicatieCard({
  text,
  eticheta,
  intrebare = "Cum se calculeaza",
  marime = "normal",
}: {
  text: string;
  eticheta: string;
  /**
   * Inceputul numelui citit de cititorul de ecran. Pe cardurile din cap intrebarea
   * e „cum se calculeaza"; langa eticheta unui camp de formular e „ce se scrie aici".
   */
  intrebare?: string;
  /** „mic" langa eticheta unui camp, care e de 12px; „normal" pe cardurile din cap. */
  marime?: "mic" | "normal";
}) {
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
          aria-label={`${intrebare}: ${eticheta}`}
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
          className={`relative z-20 grid place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${marime === "mic" ? "h-5 w-5" : "h-6 w-6"}`}
        >
          <Info strokeWidth={1.6} className={marime === "mic" ? "h-[13px] w-[13px]" : "h-[15px] w-[15px]"} />
        </TooltipTrigger>
        {/*
          ⚠ Bula se agata de capatul din care creste locul liber. Pe cardurile din
          cap, semnul sta in coltul din DREAPTA, deci `align="end"` o tine in
          card. Langa eticheta unui camp, semnul sta in STANGA, iar `align="end"`
          o trimitea in afara panoului: jumatate din text cadea peste marginea de
          la stanga. Vazut in browser, nu in cod.
        */}
        <TooltipContent
          side="top"
          align={marime === "mic" ? "start" : "end"}
          className="max-w-[17rem] whitespace-pre-line leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
