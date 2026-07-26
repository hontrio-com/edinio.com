"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Settings2, SlidersHorizontal, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { PageIcon } from "@/components/pages/icon-registry";
import { discardDesignDraft, publishDesign, saveDesignDraft } from "@/lib/actions/store-design.actions";
import { updateSection } from "@/lib/storefront/design/edit";
import { sectionMeta } from "@/lib/storefront/design/registry";
import type { SectionInstance, SectionKind, StoreDesign } from "@/lib/storefront/design/types";
import { SectionSettings } from "./SectionSettings";
import { INALTIME_IMPLICITA, VariantCard } from "./VariantCard";

/** Grupurile in care se aseaza sectiunile in bara laterala. */
const GRUPURI = [
  { scope: "chrome", label: "Cap si subsol" },
  { scope: "home", label: "Pagina magazinului" },
  { scope: "product", label: "Pagina de produs" },
  { scope: "commerce", label: "Cos si comanda" },
] as const;

type Intrare = { kind: SectionKind; label: string; icon: string; instante: SectionInstance[] };

/**
 * Catalogul de design-uri, pe sectiuni.
 *
 * Aici se alege CUM arata fiecare sectiune si se regleaza setarile ei. Ce
 * sectiuni exista si in ce ordine se aseaza ramane treaba editorului cu preview
 * live — sunt doua intrebari diferite, iar amestecul lor intr-un singur ecran
 * facea alegerea designului sa para o operatie de montaj.
 *
 * Modificarile intra in aceeasi ciorna ca in editor, deci se pot incerca aici si
 * publica de oriunde.
 */
export function SectionDesignBrowser({
  businessId,
  slug,
  designInitial,
  designPublicat,
}: {
  businessId: string;
  slug: string;
  designInitial: StoreDesign;
  designPublicat: StoreDesign;
}) {
  const [design, setDesign] = useState<StoreDesign>(designInitial);
  const [publicat, setPublicat] = useState<StoreDesign>(designPublicat);
  const [kindActiv, setKindActiv] = useState<SectionKind>("header");
  const [instantaActiva, setInstantaActiva] = useState(0);
  const [setariDeschise, setSetariDeschise] = useState(false);
  const [salvez, setSalvez] = useState(false);
  const [publica, setPublica] = useState(false);

  /** Ultima ciorna ajunsa in baza. Ref, nu stare: nu trebuie sa re-randeze. */
  const salvat = useRef<StoreDesign>(designInitial);

  const areModificari = useMemo(
    () => JSON.stringify(design) !== JSON.stringify(publicat),
    [design, publicat],
  );

  // Efectul depinde DOAR de design. Indicatorul de salvare pe care il scrie
  // trebuie sa ramana in afara dependentelor, altfel se re-declanseaza singur.
  useEffect(() => {
    if (design === salvat.current) return;
    const id = setTimeout(async () => {
      setSalvez(true);
      const res = await saveDesignDraft(businessId, design);
      setSalvez(false);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      salvat.current = design;
    }, 1000);
    return () => clearTimeout(id);
  }, [design, businessId]);

  useEffect(() => {
    if (!areModificari) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [areModificari]);

  // Sectiunile magazinului, grupate pe tip. Un tip poate avea mai multe
  // instante (randurile de produse), deci fiecare intrare le pastreaza pe toate.
  const intrari = useMemo(() => {
    const toate = [
      ...(design.chrome.announcement ? [design.chrome.announcement] : []),
      design.chrome.header,
      ...design.home,
      design.chrome.footer,
    ];
    const dupaKind = new Map<SectionKind, Intrare>();
    for (const s of toate) {
      const meta = sectionMeta(s.kind);
      if (!meta) continue;
      const existent = dupaKind.get(s.kind);
      if (existent) existent.instante.push(s);
      else dupaKind.set(s.kind, { kind: s.kind, label: meta.label, icon: meta.icon, instante: [s] });
    }
    return dupaKind;
  }, [design]);

  const intrare = intrari.get(kindActiv) ?? intrari.values().next().value;
  const sectiune = intrare?.instante[Math.min(instantaActiva, intrare.instante.length - 1)] ?? null;
  const meta = sectiune ? sectionMeta(sectiune.kind) : undefined;
  const variante = Object.entries(meta?.variants ?? {});
  const variantaActiva = sectiune ? meta?.variants[sectiune.variant] : undefined;

  const aplica = useCallback((next: StoreDesign) => setDesign(next), []);

  function alegeVarianta(variant: string) {
    if (!sectiune) return;
    aplica(updateSection(design, sectiune.id, { variant }));
    toast.success("Design aplicat in ciorna");
  }

  async function onPublica() {
    setPublica(true);
    const res = await publishDesign(businessId);
    setPublica(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setPublicat(design);
    salvat.current = design;
    toast.success("Designul e live in magazin");
  }

  async function onRenunta() {
    const res = await discardDesignDraft(businessId);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setDesign(publicat);
    salvat.current = publicat;
    toast.success("Modificarile au fost anulate");
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">Design sectiuni</h1>
          <p className="text-sm text-muted-foreground">
            Alege cum arata fiecare parte a magazinului si regleaza-i setarile.
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
            {salvez ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Se salveaza...</>
            ) : areModificari ? (
              "Modificari nepublicate"
            ) : (
              <><Check className="h-3.5 w-3.5" /> Publicat</>
            )}
          </span>
          {areModificari && (
            <button type="button" onClick={onRenunta}
              className="h-10 px-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5">
              <Undo2 className="h-4 w-4" />
              <span className="hidden sm:inline">Renunta</span>
            </button>
          )}
          <button type="button" onClick={onPublica} disabled={!areModificari || publica}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2">
            {publica && <Loader2 className="h-4 w-4 animate-spin" />}
            Publica
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-6">
        {/* Bara de sectiuni: coloana pe desktop, sir derulabil pe telefon. */}
        <nav className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {GRUPURI.map((g) => {
              const dinGrup = [...intrari.values()].filter((i) => sectionMeta(i.kind)?.scope === g.scope);
              if (dinGrup.length === 0) return null;
              return (
                <li key={g.scope} className="contents lg:block">
                  <p className="hidden lg:block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-4 pb-1">
                    {g.label}
                  </p>
                  {dinGrup.map((i) => {
                    const activ = i.kind === intrare?.kind;
                    const nrVariante = Object.keys(sectionMeta(i.kind)?.variants ?? {}).length;
                    return (
                      <button key={i.kind} type="button"
                        onClick={() => { setKindActiv(i.kind); setInstantaActiva(0); setSetariDeschise(false); }}
                        className={`w-full shrink-0 h-11 px-3 rounded-xl flex items-center gap-2.5 text-sm transition-colors whitespace-nowrap ${activ ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted"}`}>
                        <PageIcon name={i.icon} className="h-4 w-4 shrink-0" />
                        <span className="truncate">{i.label}</span>
                        <span className={`ml-auto text-[11px] tabular-nums ${activ ? "text-primary" : "text-muted-foreground"}`}>
                          {nrVariante}
                        </span>
                      </button>
                    );
                  })}
                </li>
              );
            })}
          </ul>

          <Link href="/dashboard/editor/design"
            className="mt-4 hidden lg:flex h-10 px-3 rounded-xl border border-border items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <SlidersHorizontal className="h-4 w-4" />
            Ordinea sectiunilor
          </Link>
        </nav>

        <div className="min-w-0">
          {sectiune && meta ? (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="min-w-0">
                  <h2 className="font-semibold text-foreground">{meta.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    Design activ: {variantaActiva?.label ?? sectiune.variant} - {variante.length}{" "}
                    {variante.length === 1 ? "varianta disponibila" : "variante disponibile"}
                  </p>
                </div>

                {/* Un tip cu mai multe instante (randurile de produse) are nevoie
                    de un selector: setarile sunt ale instantei, nu ale tipului. */}
                {intrare && intrare.instante.length > 1 && (
                  <div className="flex items-center gap-1">
                    {intrare.instante.map((s, i) => (
                      <button key={s.id} type="button" onClick={() => setInstantaActiva(i)}
                        className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors ${i === instantaActiva ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                        {String(s.settings.title || `${meta.label} ${i + 1}`)}
                      </button>
                    ))}
                  </div>
                )}

                <button type="button" onClick={() => setSetariDeschise((v) => !v)}
                  disabled={(variantaActiva?.fields.length ?? 0) === 0}
                  className="ml-auto h-10 px-4 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors inline-flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Setari
                </button>
              </div>

              <div className={`grid gap-5 ${setariDeschise ? "xl:grid-cols-[1fr_300px]" : "xl:grid-cols-2"}`}>
                <div className={`grid gap-5 ${setariDeschise ? "" : "xl:col-span-2 xl:grid-cols-2"}`}>
                  {variante.map(([id, v]) => (
                    <VariantCard
                      key={id}
                      slug={slug}
                      kind={sectiune.kind}
                      variantId={id}
                      label={v.label}
                      tags={v.tags}
                      inaltime={v.previewHeight ?? INALTIME_IMPLICITA}
                      activ={id === sectiune.variant}
                      onPick={() => alegeVarianta(id)}
                    />
                  ))}
                </div>

                {setariDeschise && (
                  <aside className="xl:sticky xl:top-6 xl:self-start rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        Setari {meta.label.toLowerCase()}
                      </h3>
                      <button type="button" onClick={() => setSetariDeschise(false)} aria-label="Inchide setarile"
                        className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <SectionSettings
                      section={sectiune}
                      onChange={(settings) => aplica(updateSection(design, sectiune.id, { settings }))}
                    />
                  </aside>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Magazinul nu are inca sectiuni de configurat.</p>
          )}
        </div>
      </div>
    </div>
  );
}
