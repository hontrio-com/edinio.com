import { FileText, Inbox, TrendingUp } from "lucide-react";
import { acumCatTimp } from "@/lib/utils/format";
import type { StatisticaFormular } from "@/lib/pages/statistici-formulare";

/** Barele celor 30 de zile. Fara biblioteca: 30 de dreptunghiuri. */
export function BareZile({ peZile, inalt = 36 }: { peZile: number[]; inalt?: number }) {
  const max = Math.max(1, ...peZile);
  return (
    <div className="flex items-end gap-[2px]" style={{ height: inalt }} aria-hidden>
      {peZile.map((n, i) => (
        <span key={i} className={`w-full min-w-[3px] rounded-sm ${n ? "bg-primary" : "bg-muted"}`}
          style={{ height: n ? `${Math.max(12, (n / max) * 100)}%` : "12%" }} />
      ))}
    </div>
  );
}

/** Statistica unui formular, mare, in capul editorului de formular. */
export function PanouStatistica({ s }: { s: StatisticaFormular }) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Inbox className="h-3.5 w-3.5" /> Completări în total</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{s.total}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Ultimele 30 de zile</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{s.ultimele30}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">Ultima completare</p>
          <p className="mt-1 text-sm font-medium text-foreground">{s.ultima ? acumCatTimp(s.ultima) : "Niciuna încă"}</p>
        </div>
      </div>
      <div className="mt-4"><BareZile peZile={s.peZile} /></div>
      <p className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>acum 30 de zile</span><span>azi</span></p>
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        {s.pagini.length
          ? <>Pus pe: {s.pagini.map((p) => p.titlu).join(", ")}</>
          : "Nu e pus pe nicio pagină încă. Adaugă-l dintr-un bloc „Formular contact”."}
      </p>
    </div>
  );
}
