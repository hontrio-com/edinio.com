"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Monitor, Settings2, SlidersHorizontal, Smartphone, Undo2, X } from "lucide-react";
import { toast } from "sonner";
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

type Intrare = { kind: SectionKind; label: string; instante: SectionInstance[] };

/**
 * Catalogul de design-uri, pe sectiuni.
 *
 * Aici se alege CUM arata fiecare sectiune si se regleaza setarile ei. Ce
 * sectiuni exista si in ce ordine se aseaza ramane treaba editorului cu preview
 * live — sunt doua intrebari diferite, iar amestecul lor intr-un singur ecran
 * facea alegerea designului sa para o operatie de montaj.
 *
 * Design-urile stau unul sub altul, pe toata latimea: un header e o banda lata
 * si joasa, iar pe doua coloane ajungea prea mic ca sa se vada ce alegi.
 */
export function SectionDesignBrowser({
  businessId,
  slug,
  designInitial,
  designPublicat,
  numarCategorii,
}: {
  businessId: string;
  slug: string;
  designInitial: StoreDesign;
  designPublicat: StoreDesign;
  /** Cate categorii de nivel intai are magazinul; unele design-uri cer un minim. */
  numarCategorii: number;
}) {
  const [design, setDesign] = useState<StoreDesign>(designInitial);
  const [publicat, setPublicat] = useState<StoreDesign>(designPublicat);
  const [kindActiv, setKindActiv] = useState<SectionKind>("header");
  const [setariDeschise, setSetariDeschise] = useState(false);
  const [peMobil, setPeMobil] = useState(false);
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
      design.chrome.header,
      ...design.home,
      design.chrome.footer,
      design.product.page,
      design.commerce.productCard,
      design.commerce.cartDrawer,
      design.commerce.checkout,
    ];
    const dupaKind = new Map<SectionKind, Intrare>();
    for (const s of toate) {
      const meta = sectionMeta(s.kind);
      // Doar sectiunile pentru care exista un catalog de design-uri; restul se
      // regleaza mai departe din editorul magazinului.
      if (!meta?.inCatalog) continue;
      const existent = dupaKind.get(s.kind);
      if (existent) existent.instante.push(s);
      else dupaKind.set(s.kind, { kind: s.kind, label: meta.label, instante: [s] });
    }
    return dupaKind;
  }, [design]);

  const intrare = intrari.get(kindActiv) ?? intrari.values().next().value;
  // Prima instanta e reprezentanta tipului: designul se aplica oricum tuturor.
  const sectiune = intrare?.instante[0] ?? null;
  const meta = sectiune ? sectionMeta(sectiune.kind) : undefined;
  const variante = Object.entries(meta?.variants ?? {});
  const variantaActiva = sectiune ? meta?.variants[sectiune.variant] : undefined;
  const areSetari = (variantaActiva?.fields.length ?? 0) > 0;

  const aplica = useCallback((next: StoreDesign) => setDesign(next), []);

  /**
   * De ce nu poate fi ales un design, daca e cazul.
   *
   * Verificarea sta aici, langa alegere, nu in componenta de storefront:
   * comerciantul afla motivul inainte sa aplice ceva ce la el ar arata prost.
   */
  function motivIndisponibil(v: { requires?: { minCategories?: number } }): string | null {
    const min = v.requires?.minCategories;
    if (min && numarCategorii < min) {
      return `Ai nevoie de cel putin ${min} categorii (acum ai ${numarCategorii})`;
    }
    return null;
  }

  function alegeVarianta(variant: string, label: string) {
    if (!intrare) return;
    // Un tip cu mai multe instante (randurile de produse) le primeste pe toate:
    // designul e al tipului, iar doua randuri cu asezari diferite pe aceeasi
    // pagina arata a greseala, nu a alegere.
    let next = design;
    for (const s of intrare.instante) next = updateSection(next, s.id, { variant });
    aplica(next);
    toast.success(`Design ales: ${label}`, {
      description: "Apasa Publica in magazin ca sa il vada si clientii.",
    });
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
    // Spatiu jos cat bara de publicare plus bara de navigare de pe telefon,
    // altfel ultimul card ramane sub ele.
    <div className={`max-w-6xl mx-auto px-4 sm:px-6 py-5 ${areModificari ? "pb-44 lg:pb-28" : "pb-24 lg:pb-8"}`}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground">Design sectiuni</h1>
        <p className="text-sm text-muted-foreground">
          Alege cum arata fiecare parte a magazinului si regleaza-i setarile.
        </p>
      </div>

      {/* Sectiunile: sir derulabil pe telefon, coloana pe desktop. */}
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-6">
        <nav className="lg:sticky lg:top-6 lg:self-start -mx-4 px-4 lg:mx-0 lg:px-0 mb-4 lg:mb-0">
          <ul className="flex lg:flex-col gap-1.5 lg:gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                        onClick={() => { setKindActiv(i.kind); setSetariDeschise(false); }}
                        className={`shrink-0 h-11 px-3.5 lg:px-3 lg:w-full rounded-xl flex items-center gap-2 text-sm transition-colors whitespace-nowrap border lg:border-0 ${activ ? "bg-primary/10 text-primary font-semibold border-primary/30" : "text-foreground border-border hover:bg-muted"}`}>
                        <span className="truncate">{i.label}</span>
                        <span className={`text-[11px] tabular-nums lg:ml-auto ${activ ? "text-primary" : "text-muted-foreground"}`}>
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
              <div className="flex items-start gap-3 mb-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-foreground">{meta.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    Acum: {variantaActiva?.label ?? sectiune.variant}
                    {variante.length > 1 && ` - ${variante.length} variante`}
                  </p>
                  {/* La cos si la comanda, alegerea nu schimba doar aspectul, ci
                      si drumul clientului prin magazin. Merita spus raspicat,
                      inainte de a fi publicata. */}
                  {variantaActiva?.surface === "page" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Clientii ajung pe o pagina separata, cu adresa proprie. O gasesti si in Pagini.
                    </p>
                  )}
                </div>

                {/* Aproape tot traficul unui magazin vine de pe telefon, deci
                    alegerea designului nu se poate face doar dupa cum arata pe
                    desktop. */}
                <div className="shrink-0 flex items-center gap-0.5 p-0.5 rounded-xl border border-border">
                  {([["desktop", Monitor, "Pe calculator"], ["mobil", Smartphone, "Pe telefon"]] as const).map(([k, Icon, eticheta]) => {
                    const activ = (k === "mobil") === peMobil;
                    return (
                      <button key={k} type="button" onClick={() => setPeMobil(k === "mobil")} aria-label={eticheta} title={eticheta}
                        aria-pressed={activ}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${activ ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>

                {areSetari && (
                  <button type="button" onClick={() => setSetariDeschise(true)}
                    className="shrink-0 h-10 px-3.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors inline-flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Setari
                  </button>
                )}
              </div>

              {/* O singura coloana: un header e o banda lata, iar pe doua coloane
                  miniatura ajunge prea mica pentru a alege ceva. */}
              <div className={`grid gap-5 ${peMobil ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}>
                {variante.map(([id, v]) => (
                  <VariantCard
                    key={id}
                    slug={slug}
                    kind={sectiune.kind}
                    variantId={id}
                    label={v.label}
                    inaltime={v.previewHeight ?? INALTIME_IMPLICITA}
              latimeFixa={v.previewWidth}
                    activ={id === sectiune.variant}
                    peMobil={peMobil}
                    motivIndisponibil={motivIndisponibil(v)}
                    onPick={() => alegeVarianta(id, v.label)}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Magazinul nu are inca sectiuni de configurat.</p>
          )}
        </div>
      </div>

      {setariDeschise && sectiune && meta && (
        <PanouSetari
          titlu={`Setari ${meta.label.toLowerCase()}`}
          section={sectiune}
          onChange={(settings) => aplica(updateSection(design, sectiune.id, { settings }))}
          onInchide={() => setSetariDeschise(false)}
        />
      )}

      {areModificari && (
        <BaraPublicare salvez={salvez} publica={publica} onPublica={onPublica} onRenunta={onRenunta} />
      )}
    </div>
  );
}

/**
 * Bara de publicare, lipita jos cat timp exista modificari nepublicate.
 *
 * Un buton „Publica" asezat sus, langa titlu, trecea neobservat: comerciantul
 * alegea un design, vedea cardul marcat „Activ" si pleca convins ca l-a pus in
 * magazin. Bara spune raspicat ca inca nu e acolo si tine actiunea sub degete,
 * inclusiv pe telefon.
 */
function BaraPublicare({
  salvez,
  publica,
  onPublica,
  onRenunta,
}: {
  salvez: boolean;
  publica: boolean;
  onPublica: () => void;
  onRenunta: () => void;
}) {
  return (
    // Pe desktop bara incepe dupa meniul lateral, care e si el fixat: pe toata
    // latimea ecranului ar trece peste el.
    <div className="fixed right-0 left-0 lg:left-[var(--sidebar-width)] bottom-16 lg:bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">Modificarile nu sunt inca in magazin</p>
          <p className="text-xs text-muted-foreground truncate">
            {salvez ? "Se salveaza ciorna..." : "Clientii vad in continuare designul vechi."}
          </p>
        </div>
        <button type="button" onClick={onRenunta}
          className="shrink-0 h-11 px-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5">
          <Undo2 className="h-4 w-4" />
          <span className="hidden sm:inline">Renunta</span>
        </button>
        <button type="button" onClick={onPublica} disabled={publica}
          className="shrink-0 h-11 px-4 sm:px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity inline-flex items-center gap-2">
          {publica ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Publica<span className="hidden sm:inline"> in magazin</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Setarile sectiunii: panou lateral pe desktop, foaie de jos pe telefon.
 *
 * Pe ecran ingust o coloana alaturata ar fi lasat si design-urile si setarile
 * prea inguste, asa ca setarile urca peste, cum se asteapta oricine de la o
 * aplicatie de telefon.
 */
function PanouSetari({
  titlu,
  section,
  onChange,
  onInchide,
}: {
  titlu: string;
  section: SectionInstance;
  onChange: (settings: Record<string, unknown>) => void;
  onInchide: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onInchide(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onInchide]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onInchide} aria-hidden />
      {/* Foaie de jos pe telefon, sertar lipit in dreapta de la sm in sus.
          `sm:left-auto` anuleaza doar marginea din stanga a lui `inset-x-0`;
          inaltimea o da `sm:inset-y-0`, deci panoul tine tot ecranul. */}
      <div className="fixed z-50 bg-surface shadow-2xl flex flex-col
        inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl
        sm:inset-y-0 sm:left-auto sm:w-[380px] sm:max-h-none sm:rounded-t-none sm:border-l sm:border-border">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{titlu}</h3>
          <button type="button" onClick={onInchide} aria-label="Inchide setarile"
            className="ml-auto w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-6">
          <SectionSettings section={section} onChange={onChange} cuTitlu={false} />
        </div>
      </div>
    </>
  );
}
