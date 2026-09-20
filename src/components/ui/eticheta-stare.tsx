import { cn } from "@/lib/utils/cn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ETICHETA DE STARE
  ═══════════════════════════════════════════════════════════════════════════

  Un singur fel de eticheta pentru toate starile din panou: comenzi acum,
  restul pe rand. Pana acum fiecare ecran isi scria propriile clase
  („px-1.5 py-0.5 rounded-full text-[10px] font-semibold" intr-un loc,
  „px-2.5 py-1 rounded-full text-xs font-medium" in altul), asa ca aceeasi
  stare arata altfel de la o pagina la alta.

  ⚠ CULOAREA NU MAI E FUNDALUL, ci un punct.
  Sapte stari colorate cu fundal plin faceau tabelul sa arate ca un semafor:
  fiecare rand striga, deci niciunul nu se mai vedea. Punctul pastreaza citirea
  dintr-o privire (verde = livrat) fara sa umple ecranul de culoare.

  ⚠ TONUL, NU CULOAREA, se trece de la un ecran la altul. Ecranele spun „stare
  de asteptare", nu „galben": daca maine „In asteptare" trebuie sa fie altfel,
  se schimba aici, o data.
*/

export type TonEticheta =
  | "asteptare"   // ceva ce nu s-a intamplat inca
  | "info"        // luat in evidenta
  | "lucru"       // se lucreaza la el
  | "drum"        // a plecat, e pe drum
  | "bun"         // s-a terminat cu bine
  | "rau"         // s-a oprit, a esuat
  | "neutru";     // nici bun, nici rau

/*
  ⚠ Clasele se scriu INTREGI, nu compuse din bucati („bg-" + culoare):
  Tailwind citeste codul ca text si nu ar gasi niciodata o clasa lipita la
  rulare, deci culorile ar disparea din pachetul de stiluri.
*/
const PUNCT: Record<TonEticheta, string> = {
  asteptare: "bg-warning",
  info:      "bg-info",
  lucru:     "bg-purple-500",
  drum:      "bg-indigo-500",
  bun:       "bg-success",
  rau:       "bg-destructive",
  neutru:    "bg-muted-foreground/50",
};

export function EtichetaStare({
  ton, children, marime = "normal", className, title,
}: {
  ton: TonEticheta;
  children: React.ReactNode;
  marime?: "mic" | "normal";
  className?: string;
  /** Indrumare la trecerea cu mausul, acolo unde eticheta singura nu spune tot. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-muted/60 font-medium whitespace-nowrap text-foreground/80 ring-1 ring-foreground/8",
        marime === "mic" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", PUNCT[ton])} />
      {children}
    </span>
  );
}
