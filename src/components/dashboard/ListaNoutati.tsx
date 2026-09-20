"use client";

import { useState } from "react";
import { ChevronDown, Pin } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { acumCatTimp } from "@/lib/utils/format";
import { AnnouncementArticle, type ArticleData } from "@/components/dashboard/AnnouncementArticle";

/*
  Noutatile din panou: ultimele cinci, cate un rand fiecare.

  Pana acum se vedea UN singur anunt, desfasurat cu totul, cu poza si cu tot
  textul: ocupa jumatate de ecran si ascundea restul. Acum se vad cinci titluri
  cu cate o vorba de rezumat, iar cel care intereseaza se deschide pe loc.

  ⚠ CONTINUTUL INTREG NU SE ADUCE LA CERERE, vine odata cu pagina. Anunturile
  sunt cinci, scurte, si deja citite de pe server; o cerere in plus la fiecare
  apasare ar fi insemnat o asteptare acolo unde nu e nimic de asteptat.
*/

export type RandNoutate = {
  id: string;
  titlu: string;
  rezumat: string;
  data: string | null;
  fixat: boolean;
  articol: ArticleData;
};

export function ListaNoutati({ noutati }: { noutati: RandNoutate[] }) {
  /* Nimic deschis la inceput: lista e de citit dintr-o privire, nu de parcurs. */
  const [deschis, setDeschis] = useState<string | null>(null);

  if (noutati.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {noutati.map((n, i) => {
        const eDeschis = deschis === n.id;
        return (
          <div key={n.id} className={cn(i > 0 && "border-t border-border")}>
            <button
              type="button"
              onClick={() => setDeschis(eDeschis ? null : n.id)}
              aria-expanded={eDeschis}
              className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {n.fixat && (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning ring-1 ring-warning/20">
                      <Pin className="h-2.5 w-2.5" /> Important
                    </span>
                  )}
                  <span className="truncate text-sm font-medium text-foreground">{n.titlu}</span>
                </div>
                {/*
                  Rezumatul si data stau impreuna, si se opresc la doua randuri.

                  ⚠ Taiat la UN rand, pe telefon nu mai ramaneau decat vreo cinci
                  cuvinte: masurat pe o fereastra de 390px, din rezumat se
                  ascundeau 253 de pixeli din 300. Doua randuri incap si acolo, iar
                  pe ecran lat tot un rand ies.
                */}
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {n.data && <span className="text-muted-foreground/80">{acumCatTimp(n.data)} · </span>}
                  {n.rezumat}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
                  eDeschis && "rotate-180",
                )}
              />
            </button>

            {eDeschis && (
              <div className="border-t border-border bg-muted/20 px-5 py-4">
                <AnnouncementArticle data={n.articol} faraRama />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
