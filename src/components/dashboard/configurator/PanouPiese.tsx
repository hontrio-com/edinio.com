"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  creeazaPiesa, listeazaPiese, schimbaPiesa, type RandPiesa,
} from "@/lib/actions/configurator.actions";
import { cautaProduseDePiesa } from "@/lib/actions/configurator.actions";
import { Camp, INTRARE, IntrareNumar, Probleme } from "./bucati";

/**
 * Piesele consumate de configurator: balamale, silicon, ore de manopera.
 *
 * ═══ ⚠ DE CE E O FILA A CONFIGURATORULUI, SI NU O PAGINA DE CATALOG ═══
 *
 * O piesa NU e un produs de vandut. E un rand de stoc: comerciantul nu vrea s-o vada in grila,
 * in feeduri sau in cautarea de produse, si de aceea produsul din care iese ea se tine STINS
 * dinadins. Pusa in catalog, ar fi aparut in toate patru.
 *
 * ═══ ⚠ DOUA NUMERE, SI NUMAI UNUL PLEACA VREODATA DIN PANOU ═══
 *
 * `Pret pe bucata` e cat plateste CUMPARATORUL pe bucata consumata: se ingheata la publicare si
 * de acolo il socotesc si browserul, si serverul — de aceea pretul aratat si cel incasat sunt
 * acelasi numar.
 *
 * `Cost pe bucata` e cat platim NOI la furnizor. Nu se compileaza, nu se serveste, nu pleaca
 * nicaieri in afara ecranului asta. E aici doar ca sa poata comerciantul sa-si vada marja.
 *
 * ═══ ⚠ STOCUL PIESEI E STOCUL UNUI PRODUS ═══
 *
 * Nu exista al doilea fel de stoc in platforma, si nici nu trebuie: rezervarea e o singura
 * instructiune atomica, iar un al doilea fel ar fi cerut a doua ordine de lacate. Deci piesa
 * arata catre un produs obisnuit. Fara produs, ea COSTA dar nu scade nimic — exact ce trebuie
 * pentru o ora de manopera sau un consumabil socotit la litru.
 */
export function PanouPiese({ onSchimbat }: {
  /**
   * ⚠ Anunta builderul ca lista s-a schimbat, ca inspectorul de optiuni sa vada piesa NOUA
   * fara reincarcarea paginii. Fara el, comerciantul face o piesa aici, trece la „Structura”,
   * si n-o gaseste — apoi o face inca o data.
   */
  onSchimbat: () => void;
}) {
  const [randuri, setRanduri] = useState<RandPiesa[] | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [lucreaza, incepe] = useTransition();

  const reincarca = () => {
    void listeazaPiese().then((r) => {
      if ("error" in r) setProblema(r.error);
      else { setRanduri(r.randuri); setProblema(null); onSchimbat(); }
    });
  };

  useEffect(reincarca, []);

  const adauga = () => incepe(async () => {
    const r = await creeazaPiesa({ nume: "Piesa noua", pretBucata: 0 });
    if ("error" in r) setProblema(r.error);
    else reincarca();
  });

  if (!randuri) {
    return <p className="text-sm text-muted-foreground">Se incarca piesele...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Piesele consumate</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          O usa configurata poate consuma patru balamale. Aici spui ce piese exista si cat costa;
          in fila „Structura” legi fiecare optiune de piesa pe care o consuma.
        </p>
      </div>

      <Probleme probleme={problema ? [problema] : []} />

      {randuri.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          N-ai nicio piesa. Adauga una daca vrei ca o alegere sa scada ceva din depozit.
        </p>
      )}

      <ul className="space-y-2">
        {randuri.map((r) => (
          <Piesa key={r.id} piesa={r} onSchimbat={reincarca} onProblema={setProblema} />
        ))}
      </ul>

      <button
        type="button"
        onClick={adauga}
        disabled={lucreaza}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Adauga o piesa
      </button>
    </div>
  );
}

function Piesa({ piesa, onSchimbat, onProblema }: {
  piesa: RandPiesa;
  onSchimbat: () => void;
  onProblema: (s: string | null) => void;
}) {
  const [nume, setNume] = useState(piesa.nume);
  const [, incepe] = useTransition();

  const scrie = (x: Parameters<typeof schimbaPiesa>[1]) => incepe(async () => {
    const r = await schimbaPiesa(piesa.id, x);
    if ("error" in r) onProblema(r.error);
    else { onProblema(null); onSchimbat(); }
  });

  return (
    <li className={`space-y-2 rounded-lg border border-border/70 p-3 ${piesa.activa ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-2">
        <input
          value={nume}
          onChange={(e) => setNume(e.target.value)}
          onBlur={() => nume.trim() && nume !== piesa.nume && scrie({ nume })}
          aria-label={`Numele piesei ${piesa.nume}`}
          className={INTRARE}
        />
        {/*
          ⚠ SE STINGE, NU SE STERGE. Versiunile publicate poarta `componenta.id` inghetat: stearsa,
          validarea ar fi raportat-o ca FANTOMA la urmatoarea publicare a oricarui configurator
          care o cere — iar comerciantul ar fi citit pe ecran ca o piesa pe care tocmai a scos-o
          dinadins e o greseala. Stinsa, ramane citibila si se poate reaprinde.
        */}
        <button
          type="button"
          onClick={() => incepe(async () => {
            const r = await schimbaPiesa(piesa.id, { activa: !piesa.activa });
            if ("error" in r) onProblema(r.error);
            else onSchimbat();
          })}
          title={piesa.activa ? "Scoate din vanzare" : "Pune la loc in vanzare"}
          aria-label={piesa.activa ? `Scoate piesa ${piesa.nume} din vanzare` : `Reaprinde piesa ${piesa.nume}`}
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Camp eticheta="Pret pe bucata (lei)" ajutor="Cat plateste cumparatorul.">
          <IntrareNumar
            valoare={piesa.pretBucata}
            onSchimba={(n) => scrie({ pretBucata: n ?? 0 })}
            eticheta={`Pretul pe bucata al piesei ${piesa.nume}`}
          />
        </Camp>
        <Camp eticheta="Cost pe bucata (lei)" ajutor="Cat platesti tu. Nu pleaca nicaieri.">
          <IntrareNumar
            valoare={piesa.costBucata ?? undefined}
            onSchimba={(n) => scrie({ costBucata: n ?? null })}
            eticheta={`Costul pe bucata al piesei ${piesa.nume}`}
          />
        </Camp>
      </div>

      <ProdusulPiesei piesa={piesa} onAlege={(id) => scrie({ productId: id })} />

      {!piesa.activa && (
        <p className="text-[11px] text-muted-foreground">
          Scoasa din vanzare. Comenzile vechi o poarta mai departe; configuratoarele noi n-o mai pot alege.
        </p>
      )}
    </li>
  );
}

/**
 * Din ce produs iese piesa de pe raft.
 *
 * ⚠ CAUTARE, NU O LISTA. Un magazin are mii de produse, iar piesele sunt tocmai cele stinse — pe
 * care selectorul obisnuit de produse al configuratorului nu le-ar gasi niciodata, fiindca el
 * filtreaza `is_active = true`.
 */
function ProdusulPiesei({ piesa, onAlege }: { piesa: RandPiesa; onAlege: (id: string | null) => void }) {
  const [cauta, setCauta] = useState("");
  const [gasite, setGasite] = useState<{ id: string; name: string }[]>([]);

  /*
   * ⚠ GOLIREA SE FACE TOT IN INTARZIERE, nu sincron in efect.
   *
   * `setGasite([])` chemat de-a dreptul in corpul efectului declanseaza o a doua randare
   * inainte ca prima sa se aseze — la fiecare tasta, pe un ecran care are deja o lista sub el.
   * Pus in acelasi `setTimeout` ca si cautarea, se intampla o singura data, dupa ce omul s-a
   * oprit din tastat.
   */
  useEffect(() => {
    let viu = true;
    const t = setTimeout(() => {
      if (cauta.trim().length < 2) { if (viu) setGasite([]); return; }
      void cautaProduseDePiesa(cauta).then((r) => {
        if (viu && "produse" in r) setGasite(r.produse.slice(0, 8));
      });
    }, 250);
    return () => { viu = false; clearTimeout(t); };
  }, [cauta]);

  if (piesa.productId) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Scade din:</span>
        <span className="font-medium text-foreground">
          {piesa.produsNume ?? "produs sters"}
        </span>
        <button
          type="button"
          onClick={() => onAlege(null)}
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          scoate
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="mb-0.5 block text-[11px] text-muted-foreground">
          Din ce produs iese de pe raft (lasa gol daca nu se tine pe stoc)
        </span>
        <input
          value={cauta}
          onChange={(e) => setCauta(e.target.value)}
          placeholder="Cauta produsul dupa nume..."
          aria-label={`Cauta produsul din care iese piesa ${piesa.nume}`}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
        />
      </label>
      {gasite.length > 0 && (
        <ul className="space-y-1">
          {gasite.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => { onAlege(p.id); setCauta(""); setGasite([]); }}
                className="w-full rounded-md px-2 py-1 text-left text-xs text-foreground hover:bg-muted"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
