"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOlxConflicts, rezolvaConflictOlx, type OlxConflict } from "@/lib/actions/olx.actions";

/*
  ⚠ ALEGEREA E A OMULUI, EXECUȚIA E A NOASTRĂ (01.09.2026)

  Când un produs vandabil are două anunțuri vii cu același `external_id`, sincronizarea se
  oprește pe el. Motivul e că întrebarea „care dintre ele e cel bun?" n-are răspuns tehnic:

      anunț 111 — activ, 1.240 de vizualizări, două conversații, promovare plătită
      anunț 222 — activ, 17 vizualizări, nimic

  Un cron n-are cum să știe asta. Ecranul ăsta îi arată ce are de ales, cu link către fiecare
  anunț ca să se poată uita înainte să hotărască — iar după apăsare celălalt se retrage.

  ⚠ Nu se preselectează niciunul. Un buton „recomandat" ar fi tot o alegere făcută de noi, doar
  că îmbrăcată în sugestie.
*/

export default function OlxConflicte({
  businessId, onRezolvat,
}: { businessId: string; onRezolvat: () => void }) {
  const [conflicte, setConflicte] = useState<OlxConflict[] | null>(null);
  const [lucreaza, startLucru] = useTransition();

  useEffect(() => {
    let anulat = false;
    void getOlxConflicts(businessId).then((r) => {
      if (anulat) return;
      setConflicte("error" in r ? [] : r.conflicte);
      if ("error" in r) toast.error(r.error);
    });
    return () => { anulat = true; };
  }, [businessId]);

  if (conflicte === null) {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Se încarcă…
      </p>
    );
  }
  if (conflicte.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">Nu mai e niciun conflict.</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      {conflicte.map((c) => (
        <div key={c.offerId} className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-semibold text-foreground">
            {c.productName ?? "Produs șters"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Uită-te la fiecare anunț înainte să alegi: unul dintre ele poate avea vizualizări,
            mesaje sau o promovare plătită.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {c.iduri.map((id) => (
              <div key={id} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
                <a
                  href={`https://www.olx.ro/d/oferta/${id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Anunț {id} <ExternalLink className="h-3 w-3" />
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={lucreaza}
                  onClick={() => startLucru(async () => {
                    const r = await rezolvaConflictOlx(businessId, c.offerId, id);
                    if ("error" in r) { toast.error(r.error); return; }
                    toast.success(`Se păstrează anunțul ${id}. Restul se retrag.`);
                    setConflicte((v) => (v ?? []).filter((x) => x.offerId !== c.offerId));
                    onRezolvat();
                  })}
                >
                  {lucreaza ? <Loader2 className="h-3 w-3 animate-spin" /> : "Păstrează"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
