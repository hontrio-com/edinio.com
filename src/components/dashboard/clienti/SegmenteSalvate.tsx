"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { adresaSegmentului, descrieCriteriile } from "@/lib/customers/segmente";
import { stergeSegment, type SegmentSalvat } from "@/lib/actions/customer-segments.actions";

/*
  ⚠ „Șterge” de aici scoate INTREBAREA, nu oamenii. Butonul sta langa o cifra cu
  clienti in ea, si asta e exact felul de vecinatate care face pe cineva sa creada
  ca sterge clientii. De-aia intrebarea de confirmare o spune pe litere.
*/

export function SegmenteSalvate({
  businessId,
  segmente,
  cifre,
}: {
  businessId: string;
  segmente: SegmentSalvat[];
  cifre: { id: string; cati: number | null }[];
}) {
  const router = useRouter();
  const [sterge, startStergere] = useTransition();
  const [careSeSterge, setCareSeSterge] = useState<string | null>(null);

  function cere(s: SegmentSalvat) {
    if (!window.confirm(
      `Ștergi segmentul „${s.nume}”?\n\n`
      + "Se șterge doar filtrul salvat. Clienții rămân toți în magazin, "
      + "împreună cu comenzile lor.",
    )) return;

    setCareSeSterge(s.id);
    startStergere(async () => {
      let r: Awaited<ReturnType<typeof stergeSegment>>;
      try {
        r = await stergeSegment(businessId, s.id);
      } catch (e) {
        toast.error("Nu am primit răspuns: " + (e as Error).message);
        setCareSeSterge(null);
        return;
      }
      setCareSeSterge(null);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`Segmentul „${s.nume}” a fost șters.`);
      router.refresh();
    });
  }

  return (
    <ul className="mt-3 space-y-2">
      {segmente.map((s) => {
        const cati = cifre.find((c) => c.id === s.id)?.cati ?? null;
        const aici = sterge && careSeSterge === s.id;
        return (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{s.nume}</p>
              <p className="truncate text-xs text-muted-foreground">
                {descrieCriteriile(s.criterii)}
              </p>
            </div>

            {cati !== null && (
              <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {cati}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {cati === 1 ? "client" : "clienți"}
                </span>
              </span>
            )}

            <Link
              href={adresaSegmentului(s.criterii)}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
            >
              Vezi <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <button
              type="button"
              onClick={() => cere(s)}
              disabled={aici}
              aria-label={`Șterge segmentul ${s.nume}`}
              className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              {aici ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
