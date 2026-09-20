"use client";

import { NUMELE_STARII, stareaCosului, type SemneleCosului } from "@/lib/abandoned/starea-cosului";

/*
  ⚠ ACEEASI ETICHETA CA IN TOT PANOUL: punct colorat pe fundal neutru, nu
  pastila plina. Hotararea lui din 20.09.2026, si tine si aici: intr-un tabel
  de treizeci de randuri, treizeci de pastile pline fac pagina sa tipe.
*/
const PUNCT: Record<string, string> = {
  muted: "bg-muted-foreground/50",
  info: "bg-info",
  success: "bg-success",
};

export function EticheraStare({ cos }: { cos: SemneleCosului }) {
  const stare = stareaCosului(cos);
  const { titlu, ton } = NUMELE_STARII[stare];
  return (
    <span
      title={NUMELE_STARII[stare].explicatie}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNCT[ton]}`} />
      {titlu}
    </span>
  );
}
