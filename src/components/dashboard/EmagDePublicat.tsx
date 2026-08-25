"use client";

import { useEffect, useState, useTransition } from "react";
import { Paginatie } from "./Paginatie";
import { Loader2, PackagePlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  produseDePublicatEmag, publicaProduseleEmag, salveazaMarcaEmag, type ListaDePublicat,
} from "@/lib/actions/emag.actions";

/**
 * Produsele care nu-s încă pe eMAG.
 *
 * ═══ ⚠ DE CE EXISTĂ ECRANUL ĂSTA ═══
 *
 * Lista de oferte arată doar ce EXISTĂ deja pe eMAG. Un produs nepublicat nu apărea
 * nicăieri în ecranele eMAG — deci nu exista niciun loc din care să-l trimiți.
 *
 * Pentru un catalog care n-a fost niciodată acolo, asta însemna că nu exista NICIO
 * cale în masă. Măsurat pe un magazin real: 1353 de produse, 0 oferte, niciun drum.
 *
 * ═══ ⚠ SE ALEG PRODUSELE, NU SE PUBLICĂ TOT ═══
 *
 * Un buton „publică tot" pe un catalog de o mie de produse e o apăsare din care nu te
 * mai poți întoarce: eMAG n-are ștergere de oferte, doar retragere. De aceea se bifează
 * anume ce pleacă, iar „alege tot ce se vede" bifează pagina, nu catalogul.
 */

export function EmagDePublicat({ businessId }: { businessId: string }) {
  const [date, setDate] = useState<ListaDePublicat | null>(null);
  const [categorie, setCategorie] = useState("");
  const [cautare, setCautare] = useState("");
  const [pagina, setPagina] = useState(1);
  const [alese, setAlese] = useState<Set<string>>(new Set());
  const [seIncarca, incepe] = useTransition();

  function incarca(p = pagina, c = categorie, q = cautare) {
    incepe(async () => {
      const r = await produseDePublicatEmag(businessId, {
        categorie: c || undefined,
        cautare: q || undefined,
        pagina: p,
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setDate(r);
      setPagina(r.pagina);
    });
  }

  useEffect(() => {
    incarca(1, "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  function comuta(id: string) {
    setAlese((v) => {
      const nou = new Set(v);
      if (nou.has(id)) nou.delete(id); else nou.add(id);
      return nou;
    });
  }

  const peEcran = date?.produse ?? [];
  /* ⚠ Numai cele cu categoria legată pot pleca. Bifate degeaba, eMAG le-ar fi respins
     una câte una și omul ar fi văzut o sută de eșecuri identice. */
  const potPleca = peEcran.filter((p) => p.categorieMapata);
  const toateAlese = potPleca.length > 0 && potPleca.every((p) => alese.has(p.id));

  function comutaToate() {
    setAlese((v) => {
      const nou = new Set(v);
      if (toateAlese) for (const p of potPleca) nou.delete(p.id);
      else for (const p of potPleca) nou.add(p.id);
      return nou;
    });
  }

  function publica() {
    const ids = [...alese];
    if (!window.confirm(
      `Public ${ids.length} ${ids.length === 1 ? "produs" : "produse"} pe eMAG.\n\n`
      + "eMAG nu șterge oferte. O ofertă publicată se poate doar retrage de la vânzare.\n"
      + "Validarea lor durează ore.",
    )) return;

    incepe(async () => {
      const r = await publicaProduseleEmag(businessId, ids);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setAlese(new Set());
      toast.success(
        `${r.puse} ${r.puse === 1 ? "produs pus" : "produse puse"} la rând. `
        + "Pleacă în următoarele minute; validarea la eMAG durează ore.",
      );
      incarca();
    });
  }

  if (date === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Se caută produsele nepublicate…
        </p>
      </div>
    );
  }

  /* Tot catalogul e pe eMAG. O carte goală n-are ce spune. */
  if (date.total === 0 && !categorie && !cautare) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <PackagePlus className="h-4 w-4" /> Produse care nu-s încă pe eMAG
          </h3>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            {date.total} {date.total === 1 ? "produs" : "produse"}. Alegi tu ce trimiți.
            Ține minte că eMAG nu șterge oferte, doar le retrage de la vânzare.
          </p>
        </div>
        <button
          type="button"
          onClick={() => incarca()}
          disabled={seIncarca}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
        >
          {seIncarca ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reîmprospătează
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
          value={categorie}
          onChange={(e) => { setCategorie(e.target.value); incarca(1, e.target.value, cautare); }}
          disabled={seIncarca}
        >
          <option value="">Toate categoriile</option>
          {date.categorii.map((c) => (
            <option key={c.nume} value={c.nume}>
              {/* ⚠ Se spune CARE categorii nu-s legate, chiar în meniu. Altfel omul
                  alege una, bifează, apasă, și abia atunci află. */}
              {c.nume} ({c.cate}){c.mapata ? "" : " (nelegată)"}
            </option>
          ))}
        </select>

        <input
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
          placeholder="Caută după nume sau SKU"
          value={cautare}
          onChange={(e) => setCautare(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") incarca(1, categorie, cautare); }}
        />

        {potPleca.length > 0 && (
          <button
            type="button"
            onClick={comutaToate}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            {toateAlese ? "Deselectează pagina" : `Alege pagina (${potPleca.length})`}
          </button>
        )}

        {alese.size > 0 && (
          <button
            type="button"
            onClick={publica}
            disabled={seIncarca}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {seIncarca && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Publică {alese.size} {alese.size === 1 ? "produs" : "produse"}
          </button>
        )}
      </div>

      {peEcran.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nimic aici cu filtrele astea.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {peEcran.map((p) => (
            <li key={p.id} className="flex items-start gap-3 py-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                checked={alese.has(p.id)}
                disabled={!p.categorieMapata}
                onChange={() => comuta(p.id)}
                aria-label={`Alege ${p.nume}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{p.nume}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.sku ? <span className="font-mono">{p.sku}</span> : "fără SKU"}
                  {p.categorie ? ` · ${p.categorie}` : ""}
                  {" · "}
                  <span className="tabular-nums">{p.pret.toFixed(2)}</span>
                  {" · "}
                  <span className="tabular-nums">{p.stoc}</span> buc.
                </p>
                {/* ⚠ Motivul, pe rândul care nu poate pleca. Un checkbox stins fără
                    explicație l-ar fi pus pe om să creadă că e un defect. */}
                {!p.categorieMapata && (
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                    Categoria „{p.categorie ?? "fără categorie"}” nu e legată de nicio categorie eMAG.
                    Leag-o mai sus, la maparea categoriilor.
                  </p>
                )}
                {/*
                  ⚠ MARCA SE SCRIE AICI, nu în fișa produsului.
                  eMAG o cere la orice produs nou, iar fără ea publicarea se oprește. Mesajul
                  era corect, dar drumul era lung: închizi ecranul eMAG, deschizi fișa, cauți
                  secțiunea Google, scrii un cuvânt, salvezi, te întorci. Pentru zece produse,
                  de zece ori.

                  ⚠ Un CÂMP, nu un selector ca la Trendyol: acolo marca e un id din catalogul
                  LOR, aici eMAG primește text liber.
                */}
                {!p.marca && <CampMarca businessId={businessId} produsId={p.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Paginatie
        pagina={pagina}
        pagini={Math.max(1, Math.ceil(date.total / Math.max(1, date.pePagina)))}
        laSchimbare={(p) => incarca(p)}
        seIncarca={seIncarca}
        rezumat={`${(pagina - 1) * date.pePagina + 1}–${Math.min(pagina * date.pePagina, date.total)} din ${date.total}`}
      />

      {/* ⚠ Bifele NU se păstrează între pagini prin întâmplare — se păstrează anume, și
          se spune. Altfel cineva bifează 40 de produse pe trei pagini, apasă, și nu
          înțelege de ce numărul e mai mare decât ce vede. */}
      {alese.size > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {alese.size} alese, inclusiv de pe alte pagini.
        </p>
      )}
    </div>
  );
}

/**
 * Câmpul de marcă pentru un produs care n-are.
 *
 * ⚠ Se scrie în același loc ca din fișa produsului (`page_sections.google.brand`), nu
 * într-un câmp al integrării: două locuri pentru aceeași valoare se despart, iar
 * despărțirea s-ar vedea abia când eMAG ar primi altă marcă decât cea de pe site.
 */
function CampMarca({ businessId, produsId }: { businessId: string; produsId: string }) {
  const [valoare, setValoare] = useState("");
  const [salvata, setSalvata] = useState<string | null>(null);
  const [seSalveaza, incepe] = useTransition();

  function salveaza() {
    const v = valoare.trim();
    if (!v) {
      toast.error("Scrie marca produsului.");
      return;
    }
    incepe(async () => {
      const r = await salveazaMarcaEmag(businessId, produsId, v);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      /* ⚠ Rândul rămâne pe ecran, doar își schimbă înfățișarea: o listă care sare sub
         degetul omului la fiecare salvare face imposibilă completarea a zece produse. */
      setSalvata(r.marca);
      toast.success(`Marca „${r.marca}” s-a salvat.`);
    });
  }

  if (salvata) {
    return (
      <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
        Marcă salvată: <span className="font-medium">{salvata}</span>
      </p>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-xs text-amber-700 dark:text-amber-400">
        Produsul n-are marcă, iar eMAG o cere.
      </span>
      <input
        className="w-40 rounded-lg border border-border bg-background px-2 py-1 text-xs"
        placeholder="ex. Josera"
        value={valoare}
        maxLength={255}
        disabled={seSalveaza}
        onChange={(e) => setValoare(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") salveaza(); }}
        aria-label="Marca produsului"
      />
      <button
        type="button"
        onClick={salveaza}
        disabled={seSalveaza || !valoare.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-60"
      >
        {seSalveaza && <Loader2 className="h-3 w-3 animate-spin" />}
        Salvează
      </button>
    </div>
  );
}
