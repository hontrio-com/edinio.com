"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DesignGallery } from "@/components/store-editor/DesignGallery";
import { RamaPreview, type Dispozitiv } from "@/components/store-editor/RamaPreview";
import { newProductSection } from "@/lib/store-sections";
import { addSection, ID_BARA_ANUNT, toateSectiunile, updateSection } from "@/lib/storefront/design/edit";
import { resolveStyle } from "@/lib/storefront/design/defaults";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { PREVIEW_MESSAGE, isPreviewMessage } from "@/lib/storefront/design/preview-protocol";
import { firstVariant } from "@/lib/storefront/design/registry";
import type { SectionInstance, SectionKind, StoreDesign } from "@/lib/storefront/design/types";
import { contextDesign } from "@/lib/editor-magazin/derivare";
import type { FelContinut } from "@/lib/editor-magazin/noduri";
import { adresaPrevizualizarii, paginaSectiunii, sectiunilePaginii, type CheiePagina, type MagazinPentruPagini } from "@/lib/editor-magazin/pagini";
import { ArboreSectiuni } from "./ArboreSectiuni";
import { BaraEditor } from "./BaraEditor";
import { GalerieAdauga } from "./GalerieAdauga";
import { PanouNod } from "./PanouNod";
import { PanouStil } from "./continut/PanouStil";
import { useCiornaDesign } from "./useCiornaDesign";
import { useContinutMagazin, type SalvareContinut } from "./useContinutMagazin";

type Cat = { id: string; name: string; parent_id: string | null; sort_order?: number };

export interface MagazinEditor {
  id: string;
  slug: string;
  nume: string;
  customDomain: string | null;
  isPublished: boolean;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string | null;
  tagline: string | null;
  features: unknown;
  gallery: unknown;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Sub pragul `md`, unde bara isi ascunde butoanele de dispozitiv. */
const INTEROGARE_INGUST = "(max-width: 767px)";
function abonareEcranIngust(anunta: () => void) {
  const mq = window.matchMedia(INTEROGARE_INGUST);
  mq.addEventListener("change", anunta);
  return () => mq.removeEventListener("change", anunta);
}
const citesteEcranIngust = () => window.matchMedia(INTEROGARE_INGUST).matches;

/** Focusul e intr-un camp de scris? Atunci Ctrl+Z e al campului, nu al editorului. */
function inCampDeScris(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Editorul unic al magazinului (etapa 2, 25.10.2026).
 *
 * Un ecran in locul a trei: arborele paginii in stanga, previzualizarea vie in
 * dreapta, bara de sus cu pagina aleasa, Anuleaza / Refa si Publica. Leaga doua
 * lucruri care pana acum traiau pe ecrane diferite:
 *
 *  - ciorna de design (`useCiornaDesign`): ce sectiuni, in ce ordine, cu ce
 *    design. Ajunge la clienti la „Publica”.
 *  - continutul (`useContinutMagazin`): textele, listele, imaginile. Se salveaza
 *    din nodul lui, direct in magazin.
 *
 * ⚠ CUSATURA DINTRE ELE: dupa o salvare de continut, designul derivat din
 * continut (randuri, hero) se recalculeaza (`rederivaDupaContinut`), iar
 * previzualizarea se reincarca, fiindca magazinul randeaza continutul pe server.
 */
export function EditorMagazin({
  magazin, pageContent, designInitial, designPublicat, cioarnaInitiala, categorii, planGratuit,
  pagini, paginaAcasa, paginaInitiala, sectiuneInitiala,
}: {
  magazin: MagazinEditor;
  pageContent: Record<string, unknown>;
  designInitial: StoreDesign;
  designPublicat: StoreDesign;
  cioarnaInitiala: StoreDesign | null;
  categorii: Cat[];
  planGratuit: boolean;
  pagini: MagazinPentruPagini;
  paginaAcasa: { id: string; titlu: string; publicata: boolean } | null;
  paginaInitiala: CheiePagina;
  sectiuneInitiala: string | null;
}) {
  const ciorna = useCiornaDesign({
    businessId: magazin.id, designInitial, publicatInitial: designPublicat, cioarnaInitiala,
  });

  // ── Pagina aleasa si adresa previzualizarii ei ──
  const [pagina, setPagina] = useState<CheiePagina>(paginaInitiala);
  const design = ciorna.design;
  const adresa = useMemo(() => adresaPrevizualizarii(pagina, design, pagini), [pagina, design, pagini]);

  // ── Previzualizarea ──
  const rama = useRef<HTMLIFrameElement>(null);
  const [cheieRama, setCheieRama] = useState(0);
  /** Unde e cadrul ACUM. Navigarea prin `replace` nu schimba `src`, deci se tine aici. */
  const adresaInRama = useRef(adresa);
  const [src, setSrc] = useState(adresa);
  const remonteaza = useCallback(() => {
    setSrc(adresaInRama.current);
    setCheieRama((k) => k + 1);
  }, []);
  /**
   * `reload()`, nu remontare: browserul pastreaza pozitia derularii, deci cine
   * regla o sectiune de la jumatatea paginii nu e aruncat in capul ei dupa fiecare
   * salvare. Cade pe remontare daca reincarcarea nu e permisa.
   */
  const reincarca = useCallback(() => {
    try {
      const w = rama.current?.contentWindow;
      if (w) { w.location.reload(); return; }
    } catch { /* cade pe remontare */ }
    remonteaza();
  }, [remonteaza]);
  /*
   * Adresa urmeaza pagina aleasa si designul ei (un cos ales „pagina” are pagina
   * lui). `replace`, nu `src` nou: pasii prin previzualizare n-au ce cauta in
   * istoricul ferestrei mari, altfel butonul Inapoi al browserului ar desface
   * navigarea din cadru in loc sa scoata omul din editor.
   */
  useEffect(() => {
    if (adresa === adresaInRama.current) return;
    adresaInRama.current = adresa;
    try {
      const w = rama.current?.contentWindow;
      if (w) { w.location.replace(adresa); return; }
    } catch { /* cade pe remontare, cu adresa noua */ }
    remonteaza();
  }, [adresa, remonteaza]);

  // ── Continutul, si re-derivarea designului dupa fiecare salvare ──
  const [continutSalvat, setContinutSalvat] = useState<SalvareContinut>({
    pageContent, primaryColor: magazin.primaryColor, coverUrl: magazin.coverUrl,
  });
  const { rederivaDupaContinut } = ciorna;
  const onSalvat = useCallback((s: SalvareContinut) => {
    setContinutSalvat(s);
    rederivaDupaContinut(contextDesign({
      primaryColor: s.primaryColor, pageContent: s.pageContent, features: magazin.features,
      coverUrl: s.coverUrl, tagline: magazin.tagline,
    }));
    reincarca();
  }, [rederivaDupaContinut, magazin.features, magazin.tagline, reincarca]);
  const continut = useContinutMagazin({
    magazin: {
      id: magazin.id, logo_url: magazin.logoUrl, cover_url: magazin.coverUrl, primary_color: magazin.primaryColor,
      is_published: magazin.isPublished, gallery: magazin.gallery,
    },
    pageContentInitial: pageContent,
    onSalvat,
  });

  // ── Ecranul ──
  const [fila, setFila] = useState<"sectiuni" | "stil">("sectiuni");
  /*
   * Sectiunea ceruta in adresa (`?sectiune=`, din ghiduri si din Pagini), doar
   * daca exista pe pagina ceruta: altfel panoul s-ar deschide pe un nod gol.
   */
  const [selectat, setSelectat] = useState<string | null>(() => {
    if (!sectiuneInitiala) return null;
    const laPornire = [
      ...(designInitial.chrome.announcement ? [designInitial.chrome.announcement] : []),
      designInitial.chrome.header,
      ...sectiunilePaginii(designInitial, paginaInitiala, pagini),
      designInitial.chrome.footer,
    ];
    return laPornire.some((s) => s.id === sectiuneInitiala) ? sectiuneInitiala : null;
  });
  /** Randul din arbore de sub mouse: conturul lui se vede in previzualizare. */
  const [peste, setPeste] = useState<string | null>(null);
  const [galerieDesign, setGalerieDesign] = useState<string | null>(null);
  const [adaugaDeschis, setAdaugaDeschis] = useState(false);
  const [dispozitiv, setDispozitiv] = useState<Dispozitiv>("desktop");
  /*
   * Pe un ecran ingust butoanele de dispozitiv lipsesc din bara, iar magazinul de
   * calculator, micsorat la latimea telefonului, nu se mai putea citi (vazut pe
   * 390 px, 25.10.2026). Acolo previzualizarea e mereu cea de telefon.
   */
  const ecranIngust = useSyncExternalStore(abonareEcranIngust, citesteEcranIngust, () => false);
  const dispozitivVazut: Dispozitiv = ecranIngust ? "mobil" : dispozitiv;
  const [vedereMobil, setVedereMobil] = useState<"panou" | "previzualizare">("panou");

  /** Nodurile paginii alese, plus ce e comun tuturor paginilor. */
  const noduri = useMemo<SectionInstance[]>(() => [
    ...(design.chrome.announcement ? [design.chrome.announcement] : []),
    design.chrome.header,
    ...sectiunilePaginii(design, pagina, pagini),
    design.chrome.footer,
  ], [design, pagina, pagini]);
  /**
   * Bara de anunt poate lipsi din design. Nodul ei ramane deschis cu o sectiune
   * de umplutura, ca omul sa-i poata scrie textul si sa o aprinda din ochi.
   */
  const sectiuneSelectata = useMemo<SectionInstance | null>(() => {
    if (!selectat) return null;
    const gasita = noduri.find((s) => s.id === selectat);
    if (gasita) return gasita;
    if (selectat === ID_BARA_ANUNT && !design.chrome.announcement) {
      return { id: ID_BARA_ANUNT, kind: "announcement", variant: firstVariant("announcement") ?? "marquee", enabled: false, settings: {} };
    }
    return null;
  }, [selectat, noduri, design.chrome.announcement]);

  // Un nod disparut (un rand sters, o sectiune scoasa prin Anuleaza) nu are panou:
  // `sectiuneSelectata` e `null`, deci se vede arborele, fara stare de curatat.

  // ── Ce se trimite catre previzualizare ──
  /**
   * Stilul se rezolva cu culoarea, fonturile si fundalul de PE ECRAN, nu din baza:
   * asa o culoare noua se vede in dreapta inainte de salvare, ca designul.
   */
  const ctxStil = useMemo(() => contextDesign({
    primaryColor: HEX.test(continut.culoare) ? continut.culoare : continutSalvat.primaryColor,
    pageContent: {
      ...continutSalvat.pageContent,
      font_titluri: continut.pc.font_titluri,
      font_text: continut.pc.font_text,
      store_bg_color: continut.pc.store_bg_color,
    },
    features: magazin.features,
    coverUrl: continutSalvat.coverUrl,
    tagline: magazin.tagline,
  }), [continut.culoare, continut.pc.font_titluri, continut.pc.font_text, continut.pc.store_bg_color, continutSalvat, magazin.features, magazin.tagline]);

  const trimiteAcum = useRef({ design, ctxStil });
  useEffect(() => { trimiteAcum.current = { design, ctxStil }; }, [design, ctxStil]);
  const trimiteDesignul = useCallback(() => {
    const { design: d, ctxStil: c } = trimiteAcum.current;
    rama.current?.contentWindow?.postMessage(
      { [PREVIEW_MESSAGE]: "design", design: d, style: resolveStyle(d.style, c) },
      window.location.origin,
    );
  }, []);
  /*
   * ⚠ Fara poarta „previzualizarea e gata”: dupa o navigare, pagina noua n-ar mai
   * fi avut ascultator, iar poarta ramasa deschisa ar fi inghetat totul. Un mesaj
   * trimis prea devreme se pierde, si e in regula: pagina cere designul singura,
   * prin „ready”. Vezi `preview-protocol.ts`.
   */
  useEffect(() => { trimiteDesignul(); }, [design, ctxStil, trimiteDesignul]);

  /*
   * Conturul din previzualizare (etapa 3): nodul deschis in panou, doar pe fila
   * Sectiuni, si randul din arbore de sub mouse, doar cand arborele se vede. Ce
   * se deseneaza decide previzualizarea (`ConturEditor`); selectia ramane aici.
   */
  const selectatVazut = fila === "sectiuni" && sectiuneSelectata ? sectiuneSelectata.id : null;
  const pesteVazut = sectiuneSelectata ? null : peste;
  const evidentiereAcum = useRef({ selectat: selectatVazut, peste: pesteVazut });
  useEffect(() => { evidentiereAcum.current = { selectat: selectatVazut, peste: pesteVazut }; }, [selectatVazut, pesteVazut]);
  const trimiteEvidentierea = useCallback(() => {
    rama.current?.contentWindow?.postMessage(
      { [PREVIEW_MESSAGE]: "evidentiere", ...evidentiereAcum.current },
      window.location.origin,
    );
  }, []);
  useEffect(() => { trimiteEvidentierea(); }, [selectatVazut, pesteVazut, trimiteEvidentierea]);

  /** Adu sectiunea in dreptul ochilor, in previzualizare. */
  const arataInPrevizualizare = useCallback((id: string) => {
    rama.current?.contentWindow?.postMessage({ [PREVIEW_MESSAGE]: "scrollTo", sectionId: id }, window.location.origin);
  }, []);

  // ── Anuleaza / Refa din tastatura ──
  const { anuleaza, reface } = ciorna;
  useEffect(() => {
    function laTasta(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || inCampDeScris(e.target)) return;
      const tasta = e.key.toLowerCase();
      if (tasta === "z" && !e.shiftKey) { e.preventDefault(); anuleaza(); }
      else if ((tasta === "z" && e.shiftKey) || tasta === "y") { e.preventDefault(); reface(); }
    }
    window.addEventListener("keydown", laTasta);
    return () => window.removeEventListener("keydown", laTasta);
  }, [anuleaza, reface]);

  // ── Actiuni ──
  const selecteaza = useCallback((id: string) => {
    // Arborele dispare sub panou fara sa mai primeasca „mouse-ul a iesit”.
    setPeste(null);
    setSelectat(id);
    arataInPrevizualizare(id);
  }, [arataInPrevizualizare]);

  const schimbaPagina = useCallback((p: CheiePagina) => {
    setPagina(p);
    setSelectat(null);
    setPeste(null);
    setGalerieDesign(null);
    setAdaugaDeschis(false);
  }, []);

  // ── Mesajele din previzualizare ──
  useEffect(() => {
    function laMesaj(e: MessageEvent) {
      if (e.origin !== window.location.origin || !isPreviewMessage(e.data)) return;
      const tip = e.data[PREVIEW_MESSAGE];
      if (tip === "ready") trimiteDesignul();
      else if (tip === "conturGata") trimiteEvidentierea();
      else if (tip === "select") {
        /*
         * Sectiunea poate sta pe alta pagina decat cea aleasa: pe „Coșul” cu cos
         * in sertar, previzualizarea arata prima pagina. Atunci editorul trece pe
         * pagina ei, altfel clicul n-ar fi avut ce nod sa deschida.
         */
        const id = e.data.sectionId;
        const unde = paginaSectiunii(design, id, pagina, pagini);
        if (!unde) return;
        if (unde !== pagina) schimbaPagina(unde);
        setFila("sectiuni");
        setPeste(null);
        setSelectat(id);
        setVedereMobil("panou");
      }
    }
    window.addEventListener("message", laMesaj);
    return () => window.removeEventListener("message", laMesaj);
  }, [trimiteDesignul, trimiteEvidentierea, design, pagina, pagini, schimbaPagina]);

  const adaugaSectiune = useCallback(async (kind: SectionKind) => {
    setAdaugaDeschis(false);
    if (kind === "product_row") {
      // Randul traieste in continut: se adauga acolo si se salveaza pe loc, iar
      // re-derivarea il aduce in arbore, inaintea catalogului.
      const rand = newProductSection("selected");
      const ok = await continut.seteazaSiSalveaza("rand", (p) => ({ ...p, product_sections: [...(p.product_sections ?? []), rand] }));
      // Re-derivarea s-a cerut in `onSalvat`, inaintea raspunsului de aici: la
      // urmatoarea randare randul e si in design, si selectat.
      if (ok) setSelectat(rand.id);
      return;
    }
    const inainte = new Set(design.home.map((s) => s.id));
    const urmator = addSection(design, kind);
    ciorna.aplica(urmator);
    const nou = urmator.home.find((s) => !inainte.has(s.id));
    if (nou) setSelectat(nou.id);
  }, [continut, design, ciorna]);

  /** Cate bannere are magazinul, pentru design-urile de hero care cer cel putin unul. */
  const numarBannere = resolveHeroBanners(continutSalvat.pageContent, continutSalvat.coverUrl).banners.length;
  const motivIndisponibil = useCallback((v: { requires?: { minBanners?: number } }): string | null => {
    const min = v.requires?.minBanners;
    if (!min || numarBannere >= min) return null;
    return numarBannere === 0
      ? "Ai nevoie de cel puțin un banner. Adaugă-l la secțiunea Banner principal, apoi alege designul."
      : `Ai nevoie de cel puțin ${min} bannere (acum ai ${numarBannere}).`;
  }, [numarBannere]);

  const sectiuneGalerie = galerieDesign ? toateSectiunile(design).find((s) => s.id === galerieDesign) ?? null : null;
  const adresaPublica = magazin.customDomain
    ? `https://${magazin.customDomain}`
    : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/${magazin.slug}`;
  const nesalvat = useCallback((fel: FelContinut | null) => (fel ? continut.areNesalvate(fel) : false), [continut]);

  return (
    /*
      Inaltimea ecranului MINUS bara de sus a panoului (3.5rem) si, pe telefon,
      bara de navigare de jos (5rem): altfel partea de jos a ramei se taia si
      aparea a doua bara de derulare, a paginii.
    */
    <div className="flex flex-col h-[calc(100dvh-3.5rem-5rem)] lg:h-[calc(100dvh-3.5rem)] overflow-hidden">
      <BaraEditor
        pagina={pagina} onPagina={schimbaPagina} ciorna={ciorna}
        dispozitiv={dispozitiv} onDispozitiv={setDispozitiv} onReincarca={reincarca} adresaPublica={adresaPublica}
        publicat={continut.publicat} publicareInCurs={continut.publicareInCurs} onComutaPublicarea={continut.comutaPublicarea}
        continutNesalvat={continut.oriceNesalvat} vedereMobil={vedereMobil} onVedereMobil={setVedereMobil}
      />

      <div className="flex flex-1 min-h-0">
        <aside className={`w-full lg:w-[360px] shrink-0 flex-col border-r border-border bg-surface ${vedereMobil === "previzualizare" ? "hidden lg:flex" : "flex"}`}>
          <div className="px-3 pt-3 flex gap-1 border-b border-border" role="tablist">
            {([["sectiuni", "Secțiuni"], ["stil", "Stil"]] as const).map(([cheie, eticheta]) => (
              <button key={cheie} type="button" role="tab" aria-selected={fila === cheie} onClick={() => setFila(cheie)}
                className={`h-9 px-3 -mb-px text-sm font-medium border-b-2 transition-colors ${fila === cheie ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {eticheta}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            {fila === "stil" ? (
              <PanouStil continut={continut} />
            ) : sectiuneSelectata ? (
              <PanouNod
                key={sectiuneSelectata.id}
                sectiune={sectiuneSelectata}
                ciorna={ciorna}
                continut={continut}
                onInapoi={() => setSelectat(null)}
                onSchimbaDesignul={(id) => { setGalerieDesign(id); setVedereMobil("previzualizare"); }}
                businessId={magazin.id}
                categorii={categorii}
                planGratuit={planGratuit}
                laStil={() => setFila("stil")}
                onRandSters={() => setSelectat(null)}
              />
            ) : (
              <div className="pb-6">
                <ArboreSectiuni
                  ciorna={ciorna} pagina={pagina} magazin={pagini} selectat={selectat} onSelect={selecteaza} onPeste={setPeste}
                  nesalvat={nesalvat} onAdauga={() => { setAdaugaDeschis(true); setVedereMobil("previzualizare"); }}
                  paginaAcasa={paginaAcasa}
                />
              </div>
            )}
          </div>
        </aside>

        <main className={`relative flex-1 min-w-0 flex-col bg-muted/30 ${vedereMobil === "previzualizare" || galerieDesign || adaugaDeschis ? "flex" : "hidden lg:flex"}`}>
          {sectiuneGalerie && (
            <DesignGallery
              section={sectiuneGalerie}
              slug={magazin.slug}
              motivIndisponibil={motivIndisponibil}
              onClose={() => setGalerieDesign(null)}
              onPick={(variant) => {
                ciorna.aplica((d: StoreDesign) => updateSection(d, sectiuneGalerie.id, { variant }));
                setGalerieDesign(null);
                setVedereMobil("previzualizare");
              }}
            />
          )}
          {adaugaDeschis && (
            <GalerieAdauga design={design} slug={magazin.slug} onAdauga={(k) => void adaugaSectiune(k)}
              onInchide={() => setAdaugaDeschis(false)} />
          )}
          <div className="flex-1 overflow-hidden flex justify-center p-3 lg:p-5">
            <div className="h-full w-full bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
              <RamaPreview src={src} dispozitiv={dispozitivVazut} cheie={cheieRama} rama={rama} titlu="Previzualizarea magazinului" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

