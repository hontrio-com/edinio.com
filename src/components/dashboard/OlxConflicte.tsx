"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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

/*
  ⚠ CITIREA ADUCE CEL MULT CINCIZECI, SI ASTA SE VEDE (22.09.2026)

  `getOlxConflicts` are `.limit(50)`. Cat timp lista se golea numai in ecran, cu un filtru local,
  un comerciant cu saizeci de conflicte rezolva cincizeci si citea dedesubt „Nu mai e niciun
  conflict", peste bulina rosie care ii spunea, cu doua randuri mai sus, ca mai are zece. Doua
  afirmatii contrare in acelasi ecran, iar cea linistitoare era cea falsa.

  ⚠ Acum lista se RECITESTE dupa fiecare alegere, deci urmatoarele cincizeci urca singure. Si cat
  timp mai sunt, se scrie cate se arata din cate sunt: numarul intreg il stie deja parintele, din
  aceeasi interogare care aprinde bulina.
*/
export default function OlxConflicte({
  businessId, total, onRezolvat,
}: {
  businessId: string;
  /** Cate conflicte are magazinul in total, numarate in baza de `getOlxStatus`. */
  total: number;
  onRezolvat: () => void;
}) {
  const [conflicte, setConflicte] = useState<OlxConflict[] | null>(null);
  const [lucreaza, startLucru] = useTransition();

  /* Panoul se poate inchide inainte sa raspunda citirea, si atunci n-are cine primi raspunsul. */
  const viu = useRef(true);
  useEffect(() => { viu.current = true; return () => { viu.current = false; }; }, []);

  const incarca = useCallback(() => {
    void getOlxConflicts(businessId).then((r) => {
      if (!viu.current) return;
      setConflicte("error" in r ? [] : r.conflicte);
      if ("error" in r) toast.error(r.error);
    });
  }, [businessId]);

  useEffect(incarca, [incarca]);

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
      {total > conflicte.length && (
        <p className="text-xs text-muted-foreground">
          Se arată {conflicte.length} din {total}. Rezolvă-le pe acestea și urcă singure următoarele.
        </p>
      )}
      {conflicte.map((c) => (
        <div key={c.offerId} className="rounded-xl ring-1 ring-foreground/10 bg-card p-3">
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
                    let r: Awaited<ReturnType<typeof rezolvaConflictOlx>>;
                    try {
                      r = await rezolvaConflictOlx(businessId, c.offerId, id);
                    } catch {
                      /* ⚠ Rezolva un conflict intre anunt si produs. */
                      toast.error(
                        "Nu am primit raspuns de la server, deci nu stim daca conflictul s-a rezolvat. "
                        + "Reimprospateaza lista de conflicte inainte sa incerci din nou.",
                        { duration: 12000 },
                      );
                      return;
                    }
                    if ("error" in r) { toast.error(r.error); return; }
                    toast.success(`Se păstrează anunțul ${id}. Restul se retrag.`);
                    /* ⚠ Se RECITESTE, nu se taie randul din ecran: altfel al cincizeci si unulea
                       n-ar fi urcat niciodata. Vezi nota de la începutul fișierului. */
                    incarca();
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
