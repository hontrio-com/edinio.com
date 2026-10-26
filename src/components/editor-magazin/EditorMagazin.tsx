"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DesignGallery } from "@/components/store-editor/DesignGallery";
import { RamaPreview, type Dispozitiv } from "@/components/store-editor/RamaPreview";
import { newProductSection } from "@/lib/store-sections";
import { addSection, completeazaBlocurileSectiunii, ID_BARA_ANUNT, toateSectiunile, updateSection } from "@/lib/storefront/design/edit";
import { resolveStyle } from "@/lib/storefront/design/defaults";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { PREFIX_PAGINA_PROPRIE, PREVIEW_MESSAGE, cheiaPaginiiProprii, despartireId, idBloc, isPreviewMessage } from "@/lib/storefront/design/preview-protocol";
import { firstVariant } from "@/lib/storefront/design/registry";
import { adaugaSablon, categoriiAcoperite, MAX_SABLOANE } from "@/lib/storefront/design/sabloane-produs";
import { produsPentruSablon } from "@/lib/actions/editor-sabloane.actions";
import { toast } from "sonner";
import type { SectionInstance, SectionKind, StoreDesign } from "@/lib/storefront/design/types";
import { contextCuCiorna, type ContinutCiorna } from "@/lib/storefront/design/continut-ciorna";
import type { FelContinut } from "@/lib/editor-magazin/noduri";
import {
  adresaPrevizualizarii, estePaginaProprie, idPaginaProprie, paginaProprie, paginaSectiunii, sectiunilePaginii,
  type CheiePagina, type MagazinPentruPagini, type PaginaProprieEditor,
} from "@/lib/editor-magazin/pagini";
import { createBlock, createBlockAcasa, type BlockType, type SectiuneAcasa } from "@/lib/pages/blocks.types";
import { findBlock, insertAtTop, insertIntoColumn } from "@/lib/pages/block-tree";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArborePagina, type TintaBloc } from "./ArborePagina";
import { ArboreSectiuni } from "./ArboreSectiuni";
import { BaraEditor } from "./BaraEditor";
import { GalerieAdauga } from "./GalerieAdauga";
import { IstoricVersiuni } from "./IstoricVersiuni";
import { PanouBloc } from "./PanouBloc";
import { PanouNod } from "./PanouNod";
import { PanouAdaugaBloc, PanouBlocPagina, PanouPagina } from "./PanouriPagina";
import { PanouSablon } from "./PanouSablon";
import { PanouStil } from "./continut/PanouStil";
import { useCiornaDesign } from "./useCiornaDesign";
import { useContinutMagazin } from "./useContinutMagazin";
import { usePaginaProprie } from "./usePaginaProprie";

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
 * dreapta, bara de sus cu pagina aleasa, Anuleaza / Refa si Publica.
 *
 * Din etapa 6 (decizia lui: „Totul la „Publică””) o singura ciorna tine si designul, si
 * continutul nepublicat (`useCiornaDesign`); `useContinutMagazin` e doar fata ei pentru
 * panourile de continut. Totul ajunge la clienti la „Publică”.
 *
 * ⚠ CUSATURA: designul se schimba in previzualizare prin mesaje, pe loc; continutul il randeaza
 * magazinul pe server (din ciorna, in modul editor), deci previzualizarea se reincarca dupa ce o
 * modificare de continut ajunge in baza (`onContinutInBaza`). Culoarea, fonturile si fundalul
 * ajung si pe loc, prin stil.
 */
export function EditorMagazin({
  magazin, pageContent, designInitial, designPublicat, cioarnaInitiala, continutCiornaInitial, categorii, planGratuit,
  pagini, paginaAcasa, paginaInitiala, sectiuneInitiala, iesire,
}: {
  magazin: MagazinEditor;
  pageContent: Record<string, unknown>;
  designInitial: StoreDesign;
  designPublicat: StoreDesign;
  /** Ce scrie in coloana de ciorna (designul cu `continut`); `null` cand e goala. */
  cioarnaInitiala: unknown;
  /** Continutul nepublicat din ciorna, la intrare. */
  continutCiornaInitial: ContinutCiorna;
  categorii: Cat[];
  planGratuit: boolean;
  pagini: MagazinPentruPagini;
  paginaAcasa: { id: string; titlu: string; publicata: boolean } | null;
  paginaInitiala: CheiePagina;
  sectiuneInitiala: string | null;
  /** Unde duce „Ieși” (`iesireaEditorului`). */
  iesire: string;
}) {
  /** Reincarcarea previzualizarii, definita mai jos (are nevoie de cadru). */
  const reincarcaAcum = useRef<() => void>(() => {});
  const laContinutInBaza = useCallback(() => reincarcaAcum.current(), []);
  const ciorna = useCiornaDesign({
    businessId: magazin.id, designInitial, publicatInitial: designPublicat, cioarnaInitiala,
    continutInitial: continutCiornaInitial,
    continutPublicatInitial: {
      pc: pageContent,
      magazin: {
        logo_url: magazin.logoUrl,
        cover_url: magazin.coverUrl,
        primary_color: magazin.primaryColor ?? "#07c527",
        gallery: Array.isArray(magazin.gallery) ? magazin.gallery.filter((u): u is string => typeof u === "string" && !!u) : [],
      },
    },
    features: magazin.features,
    tagline: magazin.tagline,
    onContinutInBaza: laContinutInBaza,
  });

  // ── Pagina aleasa si adresa previzualizarii ei ──
  const [pagina, setPagina] = useState<CheiePagina>(paginaInitiala);
  const design = ciorna.design;

  // ── Sablonul paginii de produs editat (etapa 4b) ──
  /** `null` = Implicit. Un sablon sters (sau scos prin Anuleaza) cade singur pe Implicit. */
  const [sablonEditat, setSablonEditat] = useState<string | null>(null);
  const sablonActiv = design.product.sabloane?.some((s) => s.page.id === sablonEditat) ? sablonEditat : null;
  /** Panoul sablonului (nume, categorii, produse) deschis in locul arborelui. */
  const [setariSablon, setSetariSablon] = useState(false);
  /**
   * Un produs care chiar foloseste sablonul editat, pentru previzualizare. Cererea e un SIR (id,
   * exceptiile, numele categoriilor acoperite): se reface doar cand se schimba ce acopera sablonul,
   * nu la fiecare modificare de design.
   */
  const cerereProdus = useMemo(() => {
    const s = design.product.sabloane?.find((x) => x.page.id === sablonActiv);
    if (!s) return null;
    const alte = new Set((design.product.sabloane ?? []).filter((x) => x !== s).flatMap((x) => x.categorii));
    const acoperite = categoriiAcoperite(categorii, s.categorii, alte);
    return JSON.stringify({ id: s.page.id, produse: s.produse, nume: categorii.filter((c) => acoperite.has(c.id)).map((c) => c.name) });
  }, [design.product.sabloane, sablonActiv, categorii]);
  const [produsSablon, setProdusSablon] = useState<{ cerere: string; slug: string | null } | null>(null);
  useEffect(() => {
    if (!cerereProdus) return;
    const { produse, nume } = JSON.parse(cerereProdus) as { produse: string[]; nume: string[] };
    let anulat = false;
    produsPentruSablon(magazin.id, produse, nume)
      .then((slug) => { if (!anulat) setProdusSablon({ cerere: cerereProdus, slug }); })
      .catch(() => { /* ramane produsul obisnuit, cu sablonul impus */ });
    return () => { anulat = true; };
  }, [cerereProdus, magazin.id]);
  const slugSablon = produsSablon && produsSablon.cerere === cerereProdus ? produsSablon.slug : null;

  // ── Pagina proprie deschisa (etapa 5) ──
  /** Paginile proprii, cu ce s-a salvat de aici peste lista de la incarcare (titlu, adresa, publicare). */
  const [paginiSalvate, setPaginiSalvate] = useState<Record<string, PaginaProprieEditor>>({});
  const paginiAfisate = useMemo<MagazinPentruPagini>(
    () => ({ ...pagini, paginiProprii: (pagini.paginiProprii ?? []).map((p) => paginiSalvate[p.id] ?? p) }),
    [pagini, paginiSalvate],
  );
  const idPagina = idPaginaProprie(pagina);
  const paginaDeschisa = usePaginaProprie(idPagina);
  const { salveaza: salveazaPaginaDeschisa, aplica: aplicaPeEcran, inchide: inchidePagina } = paginaDeschisa;
  /** Blocul paginii deschis in panou, setarile paginii, si unde se adauga urmatorul bloc. */
  const [blocPagina, setBlocPagina] = useState<string | null>(null);
  const [setariPaginii, setSetariPaginii] = useState(false);
  const [tintaBloc, setTintaBloc] = useState<TintaBloc | null>(null);
  /** De cate ori s-a cerut „Redă animația”, pe bloc; pleaca in cadru cu blocurile. */
  const [reluari, setReluari] = useState<Record<string, number>>({});
  // In `useMemo`: un apel liber al lui `findBlock` in randare facea React Compiler sa trateze tot ce
  // deriva din el ca valoare schimbatoare, si pierdea stabilitatea setterelor din tot componentul.
  const starePagina = paginaDeschisa.stare;
  const blocPaginaDeschis = useMemo(() => (starePagina ? findBlock(starePagina.blocks, blocPagina) : null), [starePagina, blocPagina]);

  const adresa = useMemo(
    () => adresaPrevizualizarii(pagina, design, paginiAfisate, { sablon: sablonActiv, slug: slugSablon }),
    [pagina, design, paginiAfisate, sablonActiv, slugSablon],
  );

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

  // ── Continutul: tot in ciorna (etapa 6); previzualizarea se reincarca dupa ce ajunge in baza ──
  useEffect(() => { reincarcaAcum.current = reincarca; }, [reincarca]);
  const continut = useContinutMagazin({ magazin: { id: magazin.id, is_published: magazin.isPublished }, ciorna });

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
  /** Blocul deschis in panou (etapa 4), din sectiunea `selectat`. */
  const [blocSelectat, setBlocSelectat] = useState<string | null>(null);
  /** Randul din arbore de sub mouse: conturul lui se vede in previzualizare. */
  const [peste, setPeste] = useState<string | null>(null);
  const [galerieDesign, setGalerieDesign] = useState<string | null>(null);
  const [adaugaDeschis, setAdaugaDeschis] = useState(false);
  /** Istoricul publicarilor (etapa 7), deschis peste editor. */
  const [istoricDeschis, setIstoricDeschis] = useState(false);
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
    ...sectiunilePaginii(design, pagina, paginiAfisate, sablonActiv),
    design.chrome.footer,
  ], [design, pagina, paginiAfisate, sablonActiv]);
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
  // La fel un bloc care nu mai e al sectiunii (alta varianta, fara el).
  const blocDeschis = (blocSelectat && sectiuneSelectata?.blocks?.find((b) => b.id === blocSelectat)) || null;

  // ── Ce se trimite catre previzualizare ──
  /**
   * Stilul se rezolva cu ce e PE ECRAN, ciorna peste publicat: o culoare, un font sau un fundal nou
   * se vede in dreapta pe loc, prin mesaj, inainte ca ciorna sa ajunga in baza.
   */
  const ctxStil = useMemo(() => contextCuCiorna(ciorna.ctxPublicat, ciorna.continut), [ciorna.ctxPublicat, ciorna.continut]);

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
   * Pagina proprie (etapa 5): blocurile de pe ecran pleaca in cadru la fiecare modificare, iar datele
   * de previzualizare (produse, pachete, formulare, plati, curieri) doar la deschidere si la fiecare
   * „ready”, ca tastarea sa nu care de fiecare data zecile de produse. Vezi `PaginaVie`.
   */
  const paginaAcum = useRef({ id: idPagina, stare: paginaDeschisa.stare, date: paginaDeschisa.date, reluari });
  useEffect(() => {
    paginaAcum.current = { id: idPagina, stare: paginaDeschisa.stare, date: paginaDeschisa.date, reluari };
  }, [idPagina, paginaDeschisa.stare, paginaDeschisa.date, reluari]);
  const trimitePagina = useCallback((cuDate: boolean) => {
    const { id, stare, date, reluari: r } = paginaAcum.current;
    if (!id || !stare || !date) return;
    rama.current?.contentWindow?.postMessage({
      [PREVIEW_MESSAGE]: "pagina", id, blocks: stare.blocks, css: stare.css, reluari: r,
      ...(cuDate ? { date: { products: date.products, bundles: date.pachete, forms: date.forms, plati: date.integrari.plati, curieri: date.integrari.curieri } } : {}),
    }, window.location.origin);
  }, []);
  useEffect(() => { trimitePagina(false); }, [paginaDeschisa.stare, reluari, trimitePagina]);
  useEffect(() => { trimitePagina(true); }, [paginaDeschisa.date, trimitePagina]);

  /*
   * Conturul din previzualizare (etapa 3): nodul deschis in panou, doar pe fila
   * Sectiuni, si randul din arbore de sub mouse, doar cand arborele se vede. Ce
   * se deseneaza decide previzualizarea (`ConturEditor`); selectia ramane aici.
   */
  let selectatVazut: string | null = null;
  if (fila === "sectiuni") {
    // Un bloc al paginii proprii: sectiunea ei e chiar cheia paginii (`pagina:<id>`).
    if (idPagina && blocPaginaDeschis) selectatVazut = idBloc(pagina, blocPaginaDeschis.id);
    else if (sectiuneSelectata) selectatVazut = blocDeschis ? idBloc(sectiuneSelectata.id, blocDeschis.id) : sectiuneSelectata.id;
  }
  const pesteVazut = sectiuneSelectata || blocPaginaDeschis || setariPaginii || tintaBloc ? null : peste;
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
  /*
   * Pe o pagina proprie, pasul inapoi e al paginii (istoricul ei); al designului cand panoul arata o
   * sectiune a designului (antetul, subsolul), ca Anuleaza sa desfaca ce se vede in panou.
   */
  const istoricPagina = idPagina && !sectiuneSelectata ? paginaDeschisa : null;
  const anuleaza = istoricPagina ? istoricPagina.anuleaza : ciorna.anuleaza;
  const reface = istoricPagina ? istoricPagina.reface : ciorna.reface;
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
    setBlocSelectat(null);
    arataInPrevizualizare(id);
  }, [arataInPrevizualizare]);

  const selecteazaBloc = useCallback((idSectiune: string, idBlocului: string) => {
    setPeste(null);
    setSelectat(idSectiune);
    setBlocSelectat(idBlocului);
    arataInPrevizualizare(idBloc(idSectiune, idBlocului));
  }, [arataInPrevizualizare]);

  const inapoiLaArbore = useCallback(() => {
    setSelectat(null);
    setBlocSelectat(null);
  }, []);

  /**
   * O versiune readusa a intrat in ciorna: panoul deschis poate fi al unei sectiuni care in versiune
   * nu exista, deci inapoi la arbore, si previzualizarea in fata (pe telefon e ascunsa sub panou).
   */
  const dupaVersiuneReadusa = useCallback(() => {
    setIstoricDeschis(false);
    setSelectat(null);
    setBlocSelectat(null);
    setGalerieDesign(null);
    setAdaugaDeschis(false);
    setSetariSablon(false);
    setVedereMobil("previzualizare");
  }, []);

  const schimbaPagina = useCallback((p: CheiePagina) => {
    setPagina(p);
    setSelectat(null);
    setBlocSelectat(null);
    setPeste(null);
    setGalerieDesign(null);
    setAdaugaDeschis(false);
    setSetariSablon(false);
    setBlocPagina(null);
    setSetariPaginii(false);
    setTintaBloc(null);
    // Pagina proprie lasata (salvata sau cu modificarile renuntate) nu ramane in memorie: la intoarcere
    // se citeste din nou, altfel modificarile renuntate ar fi reaparut pe ecran.
    inchidePagina();
  }, [inchidePagina]);

  /**
   * Alta pagina, cand cea proprie deschisa are modificari nesalvate: intai intrebarea. Altfel munca
   * se pierdea fara semn, fiindca editorul tine o singura pagina proprie deschisa.
   */
  const [schimbareCeruta, setSchimbareCeruta] = useState<CheiePagina | null>(null);
  const cerePagina = useCallback((p: CheiePagina) => {
    if (p === pagina) return;
    if (paginaDeschisa.modificata) {
      setSchimbareCeruta(p);
      return;
    }
    schimbaPagina(p);
  }, [pagina, paginaDeschisa.modificata, schimbaPagina]);

  /** Salveaza pagina proprie; dupa reusita, lista din „Editezi” si adresa previzualizarii o urmeaza. */
  const salveazaPagina = useCallback(async (): Promise<boolean> => {
    if (!idPagina) return true;
    const salvata = await salveazaPaginaDeschisa();
    if (!salvata) return false;
    setPaginiSalvate((m) => ({ ...m, [idPagina]: { id: idPagina, titlu: salvata.titlu, slug: salvata.slug, publicata: salvata.publicata } }));
    return true;
  }, [idPagina, salveazaPaginaDeschisa]);

  const adaugaBlocPagina = useCallback((tip: BlockType) => {
    const t = tintaBloc;
    if (!t) return;
    const nou = createBlock(tip, { inColumn: t.fel === "coloana" });
    aplicaPeEcran((s) => ({
      ...s,
      blocks: t.fel === "sus" ? insertAtTop(s.blocks, t.index, nou) : insertIntoColumn(s.blocks, t.idColoane, t.coloana, t.index, nou),
    }));
    setTintaBloc(null);
    setBlocPagina(nou.id);
  }, [tintaBloc, aplicaPeEcran]);

  /** O sectiune a paginii principale, numai sus, nu in coloane (are latimea ei). */
  const adaugaAcasaPagina = useCallback((sectiune: SectiuneAcasa) => {
    const t = tintaBloc;
    if (!t || t.fel !== "sus") return;
    const nou = createBlockAcasa(sectiune);
    aplicaPeEcran((s) => ({ ...s, blocks: insertAtTop(s.blocks, t.index, nou) }));
    setTintaBloc(null);
    setBlocPagina(nou.id);
  }, [tintaBloc, aplicaPeEcran]);

  // ── Mesajele din previzualizare ──
  useEffect(() => {
    function laMesaj(e: MessageEvent) {
      if (e.origin !== window.location.origin || !isPreviewMessage(e.data)) return;
      const tip = e.data[PREVIEW_MESSAGE];
      if (tip === "ready") {
        trimiteDesignul();
        trimitePagina(true);
      }
      else if (tip === "conturGata") trimiteEvidentierea();
      else if (tip === "select") {
        /*
         * Sectiunea poate sta pe alta pagina decat cea aleasa: pe „Coșul” cu cos
         * in sertar, previzualizarea arata prima pagina. Atunci editorul trece pe
         * pagina ei, altfel clicul n-ar fi avut ce nod sa deschida.
         */
        // Un bloc vine ca `<sectiune>/<bloc>` (`preview-protocol.ts`).
        const { sectiune: id, bloc } = despartireId(e.data.sectionId);
        const unde = paginaSectiunii(design, id, pagina, paginiAfisate);
        if (!unde) return;
        if (unde !== pagina) {
          // Pagina proprie nesalvata: intai intrebarea. Clicul nu se reia: dupa raspuns editorul e pe
          // pagina sectiunii, iar sectiunea se alege din nou.
          if (paginaDeschisa.modificata) {
            setSchimbareCeruta(unde);
            return;
          }
          schimbaPagina(unde);
        }
        // Continutul sau un bloc al paginii proprii (etapa 5): panoul blocului, nu al unei sectiuni.
        if (estePaginaProprie(unde) && id.startsWith(PREFIX_PAGINA_PROPRIE)) {
          setFila("sectiuni");
          setPeste(null);
          setSelectat(null);
          setBlocSelectat(null);
          setSetariPaginii(false);
          setTintaBloc(null);
          setBlocPagina(bloc);
          setVedereMobil("panou");
          return;
        }
        // Pagina unui sablon de produs: arborele trece pe sablonul ei (4b).
        if (unde === "produs") setSablonEditat(design.product.sabloane?.some((s) => s.page.id === id) ? id : null);
        setSetariSablon(false);
        setFila("sectiuni");
        setPeste(null);
        setSelectat(id);
        setBlocSelectat(bloc);
        setVedereMobil("panou");
      }
    }
    window.addEventListener("message", laMesaj);
    return () => window.removeEventListener("message", laMesaj);
  }, [trimiteDesignul, trimiteEvidentierea, trimitePagina, design, pagina, paginiAfisate, paginaDeschisa.modificata, schimbaPagina]);

  const adaugaSectiune = useCallback(async (kind: SectionKind) => {
    setAdaugaDeschis(false);
    if (kind === "product_row") {
      // Randul traieste in continut: intra in ciorna, iar designul se re-deriva in acelasi pas
      // (`aplicaContinut`), deci la urmatoarea randare randul e si in arbore, si selectat.
      const rand = newProductSection("selected");
      const ok = await continut.seteazaSiSalveaza("rand", (p) => ({ ...p, product_sections: [...(p.product_sections ?? []), rand] }));
      if (ok) setSelectat(rand.id);
      return;
    }
    const inainte = new Set(design.home.map((s) => s.id));
    const urmator = addSection(design, kind);
    ciorna.aplica(urmator);
    const nou = urmator.home.find((s) => !inainte.has(s.id));
    if (nou) setSelectat(nou.id);
  }, [continut, design, ciorna]);

  /** Un sablon nou al paginii de produs, pornit de la Implicit, deschis pe loc in setarile lui (4b). */
  const sablonNou = useCallback(() => {
    const r = adaugaSablon(design, `Șablon ${(design.product.sabloane?.length ?? 0) + 1}`);
    if (!r) {
      toast.error(`Poți avea cel mult ${MAX_SABLOANE} șabloane.`);
      return;
    }
    ciorna.aplica(r.design);
    setSablonEditat(r.id);
    setSelectat(null);
    setBlocSelectat(null);
    setSetariSablon(true);
  }, [design, ciorna]);

  const alegeSablon = useCallback((id: string | null) => {
    setSablonEditat(id);
    setSelectat(null);
    setBlocSelectat(null);
    setSetariSablon(false);
  }, []);

  /** Cate bannere are magazinul, pentru design-urile de hero care cer cel putin unul. */
  const numarBannere = resolveHeroBanners(ctxStil.pageContent, ctxStil.coverUrl ?? null).banners.length;
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
      Tot ecranul (25.10.2026): fara cadrul panoului (`CadruPanou`), editorul umple
      `main`, care e ecranul minus, cel mult, bara de impersonare. Inainte scadea
      bara de sus si meniul de jos, dar nu si bannerul de abonament, iar pagina
      capata a doua bara de derulare.
    */
    <div className="flex flex-col h-full overflow-hidden">
      <BaraEditor
        pagina={pagina} onPagina={cerePagina} ciorna={ciorna}
        dispozitiv={dispozitiv} onDispozitiv={setDispozitiv} onReincarca={reincarca} adresaPublica={adresaPublica}
        publicat={continut.publicat} publicareInCurs={continut.publicareInCurs} onComutaPublicarea={continut.comutaPublicarea}
        continutNesalvat={continut.incarc || paginaDeschisa.modificata} vedereMobil={vedereMobil} onVedereMobil={setVedereMobil} ingust={ecranIngust}
        paginiProprii={paginiAfisate.paginiProprii}
        anulare={istoricPagina ?? undefined}
        laIesire={iesire}
        onIstoric={() => setIstoricDeschis(true)}
      />
      {istoricDeschis && (
        <IstoricVersiuni businessId={magazin.id} ciorna={ciorna} ocupat={continut.incarc}
          onInchide={() => setIstoricDeschis(false)} onReadusa={dupaVersiuneReadusa} />
      )}

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
            ) : setariSablon && sablonActiv ? (
              <PanouSablon
                key={sablonActiv}
                design={design}
                sablonId={sablonActiv}
                ciorna={ciorna}
                categorii={categorii}
                businessId={magazin.id}
                onInapoi={() => setSetariSablon(false)}
                onSters={() => { setSetariSablon(false); setSablonEditat(null); }}
              />
            ) : idPagina && tintaBloc && paginaDeschisa.date ? (
              <PanouAdaugaBloc tinta={tintaBloc} date={paginaDeschisa.date} onBloc={adaugaBlocPagina} onAcasa={adaugaAcasaPagina}
                onInapoi={() => setTintaBloc(null)} />
            ) : idPagina && setariPaginii && paginaDeschisa.date && paginaDeschisa.stare ? (
              <PanouPagina stare={paginaDeschisa.stare} pagina={paginaDeschisa} date={paginaDeschisa.date} onInapoi={() => setSetariPaginii(false)} />
            ) : idPagina && blocPaginaDeschis && paginaDeschisa.date ? (
              <PanouBlocPagina key={blocPaginaDeschis.id} bloc={blocPaginaDeschis} pagina={paginaDeschisa} date={paginaDeschisa.date}
                titluPagina={paginaDeschisa.stare?.titlu ?? ""} onInapoi={() => setBlocPagina(null)}
                onRedaAnimatia={() => setReluari((r) => ({ ...r, [blocPaginaDeschis.id]: (r[blocPaginaDeschis.id] ?? 0) + 1 }))} />
            ) : sectiuneSelectata && blocDeschis ? (
              <PanouBloc
                key={`${sectiuneSelectata.id}/${blocDeschis.id}`}
                sectiune={sectiuneSelectata}
                bloc={blocDeschis}
                ciorna={ciorna}
                continut={continut}
                onInapoi={inapoiLaArbore}
              />
            ) : sectiuneSelectata ? (
              <PanouNod
                key={sectiuneSelectata.id}
                sectiune={sectiuneSelectata}
                ciorna={ciorna}
                continut={continut}
                onInapoi={inapoiLaArbore}
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
                  ciorna={ciorna} pagina={pagina} magazin={paginiAfisate} selectat={selectat} onSelect={selecteaza} onPeste={setPeste}
                  blocSelectat={blocSelectat} onSelectBloc={selecteazaBloc}
                  nesalvat={nesalvat} onAdauga={() => { setAdaugaDeschis(true); setVedereMobil("previzualizare"); }}
                  paginaAcasa={paginaAcasa}
                  sablon={sablonActiv} onSablon={alegeSablon} onSablonNou={sablonNou} onSetariSablon={() => setSetariSablon(true)}
                  onDeschidePagina={(id) => cerePagina(cheiaPaginiiProprii(id))}
                  titluPagina={estePaginaProprie(pagina) ? (paginaDeschisa.stare?.titlu || paginaProprie(pagina, paginiAfisate)?.titlu) : undefined}
                  continutPagina={estePaginaProprie(pagina) ? (
                    <ArborePagina
                      cheie={pagina}
                      pagina={paginaDeschisa}
                      blocSelectat={blocPagina}
                      setariDeschise={setariPaginii}
                      onSelectBloc={(id) => { setPeste(null); setSetariPaginii(false); setBlocPagina(id); arataInPrevizualizare(idBloc(pagina, id)); }}
                      onSetari={() => { setPeste(null); setBlocPagina(null); setSetariPaginii(true); }}
                      onAdauga={(t) => { setPeste(null); setTintaBloc(t); }}
                      onPeste={setPeste}
                    />
                  ) : undefined}
                />
              </div>
            )}
          </div>
          {/* Pagina proprie se salveaza explicit, ca in editorul de pagini: direct in magazin (etapa 5). */}
          {idPagina && paginaDeschisa.stare && (
            <div className="shrink-0 border-t border-border bg-surface px-4 py-2.5 flex items-center gap-3">
              <p className={`flex-1 min-w-0 text-[11px] leading-snug ${paginaDeschisa.modificata ? "text-amber-600" : "text-muted-foreground"}`}>
                {paginaDeschisa.modificata ? "Pagina are modificări nesalvate. Salvarea o duce direct în magazin." : "Pagina e salvată."}
              </p>
              <Button size="sm" disabled={!paginaDeschisa.modificata || paginaDeschisa.salvez} onClick={() => void salveazaPagina()}>
                {paginaDeschisa.salvez ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvează pagina
              </Button>
            </div>
          )}
        </aside>

        <main className={`relative flex-1 min-w-0 flex-col bg-muted/30 ${vedereMobil === "previzualizare" || galerieDesign || adaugaDeschis ? "flex" : "hidden lg:flex"}`}>
          {sectiuneGalerie && (
            <DesignGallery
              section={sectiuneGalerie}
              slug={magazin.slug}
              motivIndisponibil={motivIndisponibil}
              onClose={() => setGalerieDesign(null)}
              onPick={(variant) => {
                // Blocurile urmeaza varianta pe loc (Clasic si Detaliat au alte zone):
                // altfel arborele ar fi aratat lista variantei vechi pana la o recitire.
                ciorna.aplica((d: StoreDesign) => completeazaBlocurileSectiunii(
                  updateSection(d, sectiuneGalerie.id, { variant }), sectiuneGalerie.id, ctxStil.pageContent,
                ));
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

      {/* Alta pagina, cu pagina proprie nesalvata: munca nu se pierde fara intrebare (etapa 5). */}
      {/* Cat se salveaza, fereastra ramane: altfel pagina s-ar fi schimbat sub un „Rămân” apasat intre timp. */}
      <Dialog open={schimbareCeruta !== null} onOpenChange={(deschis) => { if (!deschis && !paginaDeschisa.salvez) setSchimbareCeruta(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagina „{paginaDeschisa.stare?.titlu ?? ""}” are modificări nesalvate</DialogTitle>
            <DialogDescription>Dacă treci la altă pagină fără să o salvezi, modificările se pierd.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={paginaDeschisa.salvez} onClick={() => setSchimbareCeruta(null)}>Rămân</Button>
            <Button variant="outline" disabled={paginaDeschisa.salvez} onClick={() => {
              const p = schimbareCeruta;
              setSchimbareCeruta(null);
              if (p) schimbaPagina(p);
            }}>
              Renunță la ele
            </Button>
            <Button disabled={paginaDeschisa.salvez} onClick={async () => {
              const p = schimbareCeruta;
              if (!(await salveazaPagina())) return;
              setSchimbareCeruta(null);
              if (p) schimbaPagina(p);
            }}>
              Salvează și treci
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

