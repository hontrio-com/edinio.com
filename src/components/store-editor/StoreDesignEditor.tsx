"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, LayoutGrid, Loader2, Monitor, Plus, Smartphone, Tablet, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PageIcon } from "@/components/pages/icon-registry";
import { discardDesignDraft, publishDesign, saveDesignDraft } from "@/lib/actions/store-design.actions";
import { resolveStyle } from "@/lib/storefront/design/defaults";
import {
  addSection,
  addableKinds,
  duplicateSection,
  moveSection,
  removeSection,
  toggleSection,
  updateSection,
} from "@/lib/storefront/design/edit";
import { PREVIEW_MESSAGE, isPreviewMessage } from "@/lib/storefront/design/preview-protocol";
import { sectionMeta } from "@/lib/storefront/design/registry";
import type { DesignContext, SectionInstance, SectionKind, StoreDesign } from "@/lib/storefront/design/types";
import { SectionList } from "./SectionList";
import { DesignGallery } from "./DesignGallery";
import { SectionSettings } from "./SectionSettings";

type Dispozitiv = "mobil" | "tableta" | "desktop";

/**
 * Cate design-uri are sectiunea de ALES. Sub doua, galeria n-are ce arata.
 *
 * Sectiunile din afara catalogului dau zero, oricate variante ar avea in
 * registry: randul de produse are „grila" si „carusel", dar ele oglindesc
 * comutatorul din editorul magazinului, iar o galerie care nu schimba nimic ar
 * fi exact butonul mort pe care l-am scos.
 */
const numarVariante = (s: SectionInstance) => {
  const meta = sectionMeta(s.kind);
  return meta?.inCatalog ? Object.keys(meta.variants).length : 0;
};

const LATIMI: Record<Dispozitiv, string> = { mobil: "390px", tableta: "768px", desktop: "100%" };

/**
 * Editorul de design al magazinului.
 *
 * Panou de sectiuni la stanga, magazinul real la dreapta. Fiecare schimbare
 * ajunge in preview prin `postMessage`, deci se vede instant, fara salvare si
 * fara reincarcare — catalogul e deja in browser.
 *
 * Modificarile se strang intr-o ciorna pe care o vede doar proprietarul.
 * Magazinul public se schimba abia la Publica. Un magazin cu vanzari active nu
 * are voie sa se transforme sub ochii clientilor cat timp cineva se joaca cu
 * variantele.
 */
export function StoreDesignEditor({
  businessId,
  slug,
  designInitial,
  designPublicat,
  ctx,
}: {
  businessId: string;
  slug: string;
  /** Ciorna daca exista, altfel designul publicat: de unde reia comerciantul. */
  designInitial: StoreDesign;
  /** Ce vad clientii acum. Diferenta fata de el inseamna modificari nepublicate. */
  designPublicat: StoreDesign;
  ctx: DesignContext;
  /** Cate categorii de nivel intai vede vizitatorul; unele design-uri cer un minim. */
}) {
  const [design, setDesign] = useState<StoreDesign>(designInitial);
  const [publicat, setPublicat] = useState<StoreDesign>(designPublicat);
  const [selectat, setSelectat] = useState<string | null>(null);
  const [dispozitiv, setDispozitiv] = useState<Dispozitiv>("desktop");
  const [vedereMobil, setVedereMobil] = useState<"panou" | "preview">("panou");
  const [salvez, setSalvez] = useState(false);
  const [publica, setPublica] = useState(false);
  const [paletaDeschisa, setPaletaDeschisa] = useState(false);
  const [galerie, setGalerie] = useState<string | null>(null);

  const iframe = useRef<HTMLIFrameElement>(null);
  const gataDePreview = useRef(false);
  /** Ultima ciorna ajunsa efectiv in baza. Ref, nu stare: nu trebuie sa re-randeze. */
  const salvat = useRef<StoreDesign>(designInitial);
  /**
   * Fiecare Publica sau Renunta incepe o „epoca" noua.
   *
   * O autosalvare pornita inainte de ele ajungea in baza DUPA, si reinvia ciorna
   * exact cand tocmai fusese golita: bara „modificari nepublicate" reaparea din
   * senin, iar Renunta parea ca n-a facut nimic.
   */
  const epoca = useRef(0);

  /**
   * Exista modificari nepublicate?
   *
   * Comparatie pe continut, nu pe identitate de obiect: fiecare editare produce
   * un obiect nou, deci `!==` ar raspunde mereu „da", iar la incarcarea unei
   * cioarne identice cu publicatul ar raspunde gresit „da" si aici.
   */
  const areModificari = useMemo(
    () => JSON.stringify(design) !== JSON.stringify(publicat),
    [design, publicat],
  );

  // Trimite designul curent in preview. Se apeleaza la fiecare schimbare si cand
  // iframe-ul anunta ca s-a montat.
  const trimite = useCallback(
    (d: StoreDesign) => {
      if (!gataDePreview.current) return;
      iframe.current?.contentWindow?.postMessage(
        { [PREVIEW_MESSAGE]: "design", design: d, style: resolveStyle(d.style, ctx) },
        window.location.origin,
      );
    },
    [ctx],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !isPreviewMessage(event.data)) return;
      const msg = event.data;
      if (msg[PREVIEW_MESSAGE] === "ready") {
        gataDePreview.current = true;
        trimite(design);
      } else if (msg[PREVIEW_MESSAGE] === "select") {
        setSelectat(msg.sectionId);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [design, trimite]);

  /**
   * Salvarea cioarnei, amanata: reordonarea prin tragere produce zeci de
   * schimbari pe secunda, iar fiecare ar fi insemnat o scriere in baza.
   *
   * Efectul depinde DOAR de `design`. Orice stare pe care o scrie el (indicatorul
   * de salvare) trebuie tinuta in afara dependentelor, altfel se re-declanseaza
   * singur si salveaza la nesfarsit.
   */
  useEffect(() => {
    if (design === salvat.current) return;
    const gen = epoca.current;
    const baza = salvat.current;
    const id = setTimeout(async () => {
      if (gen !== epoca.current) return;
      setSalvez(true);
      const res = await saveDesignDraft(businessId, design, baza);
      setSalvez(false);
      if (gen !== epoca.current) return;
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      salvat.current = design;
    }, 1200);
    return () => clearTimeout(id);
  }, [design, businessId]);

  // Iesirea din pagina cu modificari nepublicate merita un avertisment.
  useEffect(() => {
    if (!areModificari) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [areModificari]);

  const aplica = useCallback(
    (next: StoreDesign) => {
      setDesign(next);
      trimite(next);
    },
    [trimite],
  );

  function selecteaza(id: string) {
    setSelectat(id);
    iframe.current?.contentWindow?.postMessage(
      { [PREVIEW_MESSAGE]: "scrollTo", sectionId: id },
      window.location.origin,
    );
  }

  async function onPublica() {
    epoca.current += 1;
    setPublica(true);
    const res = await publishDesign(businessId, design);
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
    epoca.current += 1;
    const res = await discardDesignDraft(businessId);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    aplica(publicat);
    salvat.current = publicat;
    toast.success("Modificarile au fost anulate");
  }

  const toateSectiunile = [
    ...(design.chrome.announcement ? [design.chrome.announcement] : []),
    design.chrome.header,
    ...design.home,
    design.chrome.footer,
  ];
  const sectiuneSelectata = toateSectiunile.find((s) => s.id === selectat) ?? null;
  const sectiuneGalerie = toateSectiunile.find((s) => s.id === galerie) ?? null;
  const deAdaugat = addableKinds(design);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Panoul de sectiuni */}
      <div className={`w-full lg:w-[380px] shrink-0 flex flex-col border-r border-border bg-surface ${vedereMobil === "preview" ? "hidden lg:flex" : "flex"}`}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <Link href="/dashboard/editor/sectiuni" aria-label="Inapoi la Design sectiuni"
            className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-foreground truncate">Ordinea sectiunilor</h1>
            <p className="text-xs text-muted-foreground">
              {salvez ? "Se salveaza..." : areModificari ? "Modificari nepublicate" : "Totul e publicat"}
            </p>
          </div>
          <button type="button" onClick={() => setVedereMobil("preview")}
            className="lg:hidden shrink-0 h-9 px-3 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            Vezi
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <SectionList
            sections={toateSectiunile}
            selectedId={selectat}
            onSelect={selecteaza}
            onMove={(from, to) => {
              // Indicii din lista afisata includ partea fixa; reordonarea e doar
              // pe sectiunile din pagina, deci scadem decalajul.
              const offset = (design.chrome.announcement ? 1 : 0) + 1;
              aplica(moveSection(design, from - offset, to - offset));
            }}
            onToggle={(id) => aplica(toggleSection(design, id))}
            onDuplicate={(id) => aplica(duplicateSection(design, id))}
            onRemove={(id) => aplica(removeSection(design, id))}
            primaMutabila={(design.chrome.announcement ? 1 : 0) + 1}
            ultimaMutabila={(design.chrome.announcement ? 1 : 0) + design.home.length}
          />

          {sectiuneSelectata && numarVariante(sectiuneSelectata) > 1 && (
            <button type="button" onClick={() => setGalerie(sectiuneSelectata.id)}
              className="mt-3 w-full h-11 rounded-xl border border-border bg-surface text-sm font-medium text-foreground hover:bg-muted transition-colors inline-flex items-center justify-center gap-2">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              Schimba designul ({numarVariante(sectiuneSelectata)} variante)
            </button>
          )}

          {sectiuneSelectata && (
            <SectionSettings
              section={sectiuneSelectata}
              onChange={(settings) => aplica(updateSection(design, sectiuneSelectata.id, { settings }))}
            />
          )}

          {deAdaugat.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setPaletaDeschisa((v) => !v)}
                className="w-full h-11 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors inline-flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                Adauga sectiune
              </button>
              {paletaDeschisa && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {deAdaugat.map((kind) => (
                    <button key={kind} type="button"
                      onClick={() => { aplica(addSection(design, kind as SectionKind)); setPaletaDeschisa(false); }}
                      className="h-11 px-3 rounded-lg border border-border bg-surface text-left text-sm hover:bg-muted transition-colors inline-flex items-center gap-2">
                      <PageIcon name={sectionMeta(kind)?.icon ?? "Square"} className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{sectionMeta(kind)?.label ?? kind}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-3 py-3 border-t border-border flex items-center gap-2">
          <button type="button" onClick={onRenunta} disabled={!areModificari}
            className="h-11 px-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none inline-flex items-center gap-1.5">
            <Undo2 className="h-4 w-4" />
            Renunta
          </button>
          <button type="button" onClick={onPublica} disabled={!areModificari || publica}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-30 disabled:pointer-events-none inline-flex items-center justify-center gap-2">
            {publica ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Publica
          </button>
        </div>
      </div>

      {/* Preview, cu galeria de design-uri deschizandu-se peste el */}
      <div className={`relative flex-1 flex-col bg-muted/30 ${vedereMobil === "preview" || galerie ? "flex" : "hidden lg:flex"}`}>
        {sectiuneGalerie && (
          <DesignGallery
            section={sectiuneGalerie}
            slug={slug}
            onPick={(variant) => {
              aplica(updateSection(design, sectiuneGalerie.id, { variant }));
              setGalerie(null);
            }}
            onClose={() => setGalerie(null)}
          />
        )}
        <div className="px-4 py-2.5 border-b border-border bg-surface flex items-center gap-2">
          <button type="button" onClick={() => setVedereMobil("panou")}
            className="lg:hidden h-9 px-3 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            Sectiuni
          </button>
          <div className="flex bg-muted rounded-lg p-0.5 gap-0.5 ml-auto">
            {([["mobil", Smartphone], ["tableta", Tablet], ["desktop", Monitor]] as const).map(([d, Icon]) => (
              <button key={d} type="button" onClick={() => setDispozitiv(d)} aria-label={d}
                className={`h-8 w-9 rounded-md flex items-center justify-center transition-colors ${
                  dispozitiv === d ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto flex justify-center p-3 lg:p-5">
          <div className="h-full bg-surface rounded-xl border border-border shadow-sm overflow-hidden transition-[width] duration-200"
            style={{ width: LATIMI[dispozitiv], maxWidth: "100%" }}>
            <iframe ref={iframe} src={`/${slug}?preview=1`} title="Previzualizare magazin" className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
