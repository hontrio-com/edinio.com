import type { TonEticheta } from "@/components/ui/eticheta-stare";

/** Starile unei campanii SMS, cum se spun pe ecran. Un singur tabel pentru lista si pentru fisa. */
export const DESPRE_STARE: Record<string, { text: string; ton: TonEticheta }> = {
  in_curs: { text: "Se trimite", ton: "lucru" },
  sent:    { text: "Trimisă", ton: "bun" },
  partial: { text: "Parțial", ton: "asteptare" },
  failed:  { text: "Eșuată", ton: "rau" },
  oprita:  { text: "Oprită", ton: "neutru" },
};
