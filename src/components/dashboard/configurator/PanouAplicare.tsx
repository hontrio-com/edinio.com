"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, TriangleAlert, X } from "lucide-react";
import {
  aplicaLaCategorii, aplicaLaProduse, cautaProduseDeLegat, citesteAplicarea,
  scoateCategorii, scoateProduse,
  type Aplicare, type ProdusGasit, type ProdusScurt,
} from "@/lib/actions/configurator.actions";

/**
 * Pe ce produse se pune configuratorul.
 *
 * ═══ ⚠ SE SCRIE LA FIECARE GEST, NU LA UN BUTON „SALVEAZA" ═══
 *
 * Structura configuratorului e o ciorna care se publica; aplicarea NU e. Ea intra in vigoare pe
 * loc, fiindca raspunde la o intrebare de alta natura — „care produse", nu „cum arata". Un buton
 * de salvare aici ar fi facut ca doua lucruri care se schimba din acelasi ecran sa aiba doua
 * intelesuri diferite pentru „gata".
 *
 * De aceea fiecare gest isi asteapta raspunsul si abia apoi schimba lista de pe ecran. O lista
 * mutata inainte de raspuns ar fi aratat o legatura care nu s-a scris.
 *
 * ═══ ⚠ CE SPUNE ECRANUL CAND BAZA REFUZA ═══
 *
 * Un produs are cel mult UN configurator legat direct — o are chiar indexul din baza. Deci
 * cautarea arata din capul locului cine l-a luat deja, iar cand refuzul vine totusi la scriere,
 * se spune pe NUME care produse n-au intrat. Un „n-a mers" fara nume l-ar fi pus pe comerciant
 * sa ghiceasca dintre douazeci de bifate.
 */

export function PanouAplicare({ configuratorId }: { configuratorId: string }) {
  const [aplicare, setAplicare] = useState<Aplicare | null>(null);
  const [seIncarca, setSeIncarca] = useState(true);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, incepe] = useTransition();

  const reincarca = useCallback(async () => {
    const r = await citesteAplicarea(configuratorId);
    if ("error" in r) { setEroare(r.error); return false; }
    setEroare(null);
    setAplicare(r.aplicare);
    return true;
  }, [configuratorId]);

  useEffect(() => {
    let viu = true;
    void citesteAplicarea(configuratorId).then((r) => {
      if (!viu) return;
      if ("error" in r) setEroare(r.error);
      else setAplicare(r.aplicare);
      setSeIncarca(false);
    });
    // ⚠ Raspunsul unei cereri de la un configurator parasit nu se mai pune pe ecran.
    return () => { viu = false; };
  }, [configuratorId]);

  function fa(lucrare: () => Promise<string | null>) {
    incepe(async () => {
      const gresit = await lucrare();
      if (gresit) { toast.error(gresit); return; }
      await reincarca();
    });
  }

  if (seIncarca) {
    return (
      <p className="flex items-center gap-2 px-4 py-12 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se incarca aplicarea…
      </p>
    );
  }

  if (eroare || !aplicare) {
    return (
      <p className="mx-4 my-6 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
        {eroare ?? "Nu am putut citi aplicarea."}
      </p>
    );
  }

  const legateDirect = new Set(aplicare.produse.map((p) => p.id));
  const excluse = new Set(aplicare.excluse.map((p) => p.id));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4">
      {/* ── Categorii ───────────────────────────────────────────────────── */}
      <section aria-labelledby="apl-categorii" className="space-y-3">
        <div>
          <h2 id="apl-categorii" className="text-sm font-semibold text-foreground">Categorii</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Se aplica tuturor produselor din categorie si din subcategoriile ei, inclusiv celor
            adaugate mai tarziu.
          </p>
        </div>

        {aplicare.categorii.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nicio categorie.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {aplicare.categorii.map((c) => (
              <li key={c}>
                <Pastila
                  eticheta={c}
                  dezactivat={lucreaza}
                  onScoate={() => fa(async () => {
                    const r = await scoateCategorii(configuratorId, [c]);
                    return "error" in r ? r.error : null;
                  })}
                />
              </li>
            ))}
          </ul>
        )}

        <AlegeCategorie
          disponibile={aplicare.categoriiDisponibile.filter((c) => !aplicare.categorii.includes(c))}
          dezactivat={lucreaza}
          onAlege={(c) => fa(async () => {
            const r = await aplicaLaCategorii(configuratorId, [c]);
            if ("error" in r) return r.error;
            if (r.necunoscute.length) return `Categoria „${r.necunoscute[0]}” nu mai exista in magazin.`;
            return null;
          })}
        />
      </section>

      {/* ── Produse legate direct ───────────────────────────────────────── */}
      <section aria-labelledby="apl-produse" className="space-y-3">
        <div>
          <h2 id="apl-produse" className="text-sm font-semibold text-foreground">Produse</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Legatura directa bate categoria. Un produs poate avea un singur configurator legat direct.
          </p>
        </div>

        <ListaProduse
          produse={aplicare.produse}
          gol="Niciun produs legat direct."
          dezactivat={lucreaza}
          onScoate={(id) => fa(async () => {
            const r = await scoateProduse(configuratorId, [id]);
            return "error" in r ? r.error : null;
          })}
        />

        <Cautare
          configuratorId={configuratorId}
          dezactivat={lucreaza}
          deja={legateDirect}
          etichetaAdauga="Leaga"
          onAdauga={(id) => fa(async () => {
            const r = await aplicaLaProduse(configuratorId, [id], "direct");
            if ("error" in r) return r.error;
            if (r.refuzate.length) return `„${r.refuzate[0].nume}” e deja legat de alt configurator.`;
            return null;
          })}
        />
      </section>

      {/* ── Excluderi ───────────────────────────────────────────────────── */}
      <section aria-labelledby="apl-excluse" className="space-y-3">
        <div>
          <h2 id="apl-excluse" className="text-sm font-semibold text-foreground">Produse scoase</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Produse din categoriile de mai sus care NU primesc configuratorul. Asa poti scoate un
            produs fara sa-l muti din categoria lui.
          </p>
        </div>

        <ListaProduse
          produse={aplicare.excluse}
          gol="Niciun produs scos."
          dezactivat={lucreaza}
          onScoate={(id) => fa(async () => {
            const r = await scoateProduse(configuratorId, [id]);
            return "error" in r ? r.error : null;
          })}
        />

        <Cautare
          configuratorId={configuratorId}
          dezactivat={lucreaza}
          deja={excluse}
          etichetaAdauga="Scoate"
          arataLuatDe={false}
          onAdauga={(id) => fa(async () => {
            const r = await aplicaLaProduse(configuratorId, [id], "exclus");
            return "error" in r ? r.error : null;
          })}
        />
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PIESE
   ═══════════════════════════════════════════════════════════════════════════ */

function Pastila({ eticheta, dezactivat, onScoate }: {
  eticheta: string; dezactivat: boolean; onScoate: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-sm">
      {eticheta}
      <button
        type="button" onClick={onScoate} disabled={dezactivat}
        aria-label={`Scoate ${eticheta}`}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

function ListaProduse({ produse, gol, dezactivat, onScoate }: {
  produse: ProdusScurt[]; gol: string; dezactivat: boolean; onScoate: (id: string) => void;
}) {
  if (produse.length === 0) return <p className="text-sm text-muted-foreground">{gol}</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {produse.map((p) => (
        <li key={p.id} className="flex items-center gap-3 px-3 py-2">
          <Miniatura produs={p} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">{p.nume}</span>
            {p.categorie && (
              <span className="block truncate text-xs text-muted-foreground">{p.categorie}</span>
            )}
          </span>
          <button
            type="button" onClick={() => onScoate(p.id)} disabled={dezactivat}
            aria-label={`Scoate ${p.nume}`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Miniatura({ produs }: { produs: ProdusScurt }) {
  if (!produs.imagine) {
    return <span className="h-8 w-8 shrink-0 rounded bg-muted" aria-hidden />;
  }
  return (
    <>
      {/*
        ⚠ `<img>`, nu `next/image`: adresa vine din catalog si poate fi orice gazda, iar o
        miniatura de 32px dintr-o lista de panou nu merita o trecere prin optimizator. `alt` e gol
        dinadins — numele produsului sta chiar alaturi, si citit de doua ori ar fi zgomot.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={produs.imagine} alt=""
        className="h-8 w-8 shrink-0 rounded object-cover" loading="lazy"
      />
    </>
  );
}

function AlegeCategorie({ disponibile, dezactivat, onAlege }: {
  disponibile: string[]; dezactivat: boolean; onAlege: (c: string) => void;
}) {
  const [aleasa, setAleasa] = useState("");

  if (disponibile.length === 0) {
    return <p className="text-xs text-muted-foreground">Toate categoriile magazinului sunt deja legate.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="apl-alege-categorie" className="sr-only">Alege o categorie</label>
      <select
        id="apl-alege-categorie" value={aleasa} onChange={(e) => setAleasa(e.target.value)}
        disabled={dezactivat}
        className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
      >
        <option value="">Alege o categorie…</option>
        {disponibile.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button
        type="button"
        onClick={() => { if (aleasa) { onAlege(aleasa); setAleasa(""); } }}
        disabled={dezactivat || !aleasa}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden /> Adauga
      </button>
    </div>
  );
}

/**
 * Cautarea de produse.
 *
 * ⚠ Cauta la APASARE, nu la fiecare tasta. Un catalog are zeci de mii de produse, iar o cerere
 * pe litera ar fi insemnat sase cereri pentru un cuvant, din care cinci aruncate.
 */
function Cautare({ configuratorId, dezactivat, deja, etichetaAdauga, arataLuatDe = true, onAdauga }: {
  configuratorId: string;
  dezactivat: boolean;
  deja: Set<string>;
  etichetaAdauga: string;
  arataLuatDe?: boolean;
  onAdauga: (id: string) => void;
}) {
  const [termen, setTermen] = useState("");
  const [rezultate, setRezultate] = useState<ProdusGasit[] | null>(null);
  const [cauta, incepeCautarea] = useTransition();

  function laCautare() {
    incepeCautarea(async () => {
      const r = await cautaProduseDeLegat(configuratorId, termen);
      if ("error" in r) { toast.error(r.error); return; }
      setRezultate(r.produse);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`apl-cauta-${etichetaAdauga}`} className="sr-only">Cauta un produs</label>
        <input
          id={`apl-cauta-${etichetaAdauga}`}
          value={termen}
          onChange={(e) => setTermen(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); laCautare(); } }}
          placeholder="Cauta un produs dupa nume"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="button" onClick={laCautare} disabled={cauta}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40"
        >
          {cauta ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          Cauta
        </button>
      </div>

      {rezultate && rezultate.length === 0 && (
        <p className="text-sm text-muted-foreground" role="status">Niciun produs gasit.</p>
      )}

      {rezultate && rezultate.length > 0 && (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {rezultate.map((p) => {
            const luat = arataLuatDe && !!p.luatDe;
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <Miniatura produs={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{p.nume}</span>
                  {luat ? (
                    <span className="flex items-center gap-1 truncate text-xs text-amber-700">
                      {/* ⚠ Culoarea nu e singurul semn: e si o pictograma, si textul spune de ce. */}
                      <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
                      Legat deja de „{p.luatDe}”
                    </span>
                  ) : p.categorie ? (
                    <span className="block truncate text-xs text-muted-foreground">{p.categorie}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => onAdauga(p.id)}
                  disabled={dezactivat || luat || deja.has(p.id)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
                >
                  {deja.has(p.id) ? "Adaugat" : etichetaAdauga}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
