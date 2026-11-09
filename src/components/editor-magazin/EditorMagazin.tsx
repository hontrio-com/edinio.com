"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { DesignGallery } from "@/components/store-editor/DesignGallery";
import { RamaPreview, type Dispozitiv } from "@/components/store-editor/RamaPreview";
import { newProductSection } from "@/lib/store-sections";
import {
  blocuriLaCale, caleInText, completeazaBlocurileSectiunii, ID_BARA_ANUNT, mutaSectiuneaLa, schimbaBlocuriLaCale, schimbaBlocurile,
  removeSection, toateSectiunile, toggleSection, updateSection, type CaleContinut, type LocNou,
} from "@/lib/storefront/design/edit";
import { adaugaColoana, adaugaContinut, comutaBloc, duplicaContinut, esteContinut, schemaBlocurilor, stergeContinut } from "@/lib/storefront/design/blocuri";
import { resolveStyle } from "@/lib/storefront/design/defaults";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { PREFIX_PAGINA_PROPRIE, PREVIEW_MESSAGE, cheiaPaginiiProprii, despartireId, idBloc, isPreviewMessage } from "@/lib/storefront/design/preview-protocol";
import { firstVariant, sectionMeta } from "@/lib/storefront/design/registry";
import { aplicaTipulComenzii } from "@/lib/storefront/design/tip-comanda";
import { dateBlocuriInEditor } from "@/lib/actions/editor-pagini.actions";
import type { DateBlocuri } from "@/lib/pages/date-editor-pagina";
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
import { findBlock, insertAtTop, insertIntoColumn, updateBlockInTree } from "@/lib/pages/block-tree";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArborePagina, type TintaBloc } from "./ArborePagina";
import { ArboreSectiuni } from "./ArboreSectiuni";
import { BaraEditor } from "./BaraEditor";
import { GalerieAdauga } from "./GalerieAdauga";
import { IstoricVersiuni } from "./IstoricVersiuni";
import { PanouBloc } from "./PanouBloc";
import { numarVariante, PanouNod } from "./PanouNod";
import { integrariActive, PanouAdaugaBloc, PanouBlocComun, PanouBlocPagina, PanouPagina } from "./PanouriPagina";
import { PanouContinutLiber } from "./PanouContinutLiber";
import { PanouAdaugaColoana, PanouColoanaSubsol } from "./PanouColoanaSubsol";
import { PanouSablon } from "./PanouSablon";
import { PanouStil } from "./continut/PanouStil";
import { DeschideSetareaContext } from "./navigare";
import { FilaSetari } from "./setari/FilaSetari";
import { useSetariMagazin, type SetariInitiale } from "./setari/useSetariMagazin";
import { useCiornaDesign } from "./useCiornaDesign";
import { useContinutMagazin } from "./useContinutMagazin";
import { usePaginaProprie } from "./usePaginaProprie";
import type { CheieSetare } from "@/lib/editor-magazin/setari";
import { alegereDinClic, esteBloculUnic } from "@/lib/editor-magazin/continut-liber";
import {
  ceAdaugaPlusul, continutNou, puncteDeAdaugare, sectiuneNoua, tintaLangaBloc, type Adaugare, type ContextAdaugare,
} from "@/lib/editor-magazin/adaugare";
import { blocUnic } from "@/lib/storefront/design/continut-liber";
import { actiuniMeniu, aplicaPeDesign, operatiaPeBlocuri, tintaDinId, type CheieActiune, type TintaMeniu } from "@/lib/editor-magazin/meniu-contextual";
import { FurnizorLegaturi } from "@/components/pages/editor/CampLink";

/** Filele panoului din stanga; „Setări” din etapa 8 (lista lui, 27.10.2026). */
export type FilaEditor = "sectiuni" | "stil" | "setari";

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
  pagini, paginaAcasa, paginaInitiala, sectiuneInitiala, iesire, setariInitiale, filaInitiala = "sectiuni", setareInitiala = null,
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
  /** Fila „Setări” (etapa 8): datele magazinului, formularul de comanda, catalogul, din baza. */
  setariInitiale: SetariInitiale;
  /** Fila si setarea cerute in adresa (`?fila=setari&setare=...`): din Setari, din ghiduri. */
  filaInitiala?: FilaEditor;
  setareInitiala?: CheieSetare | null;
}) {
  const router = useRouter();
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

  // ── Setarile magazinului (etapa 8): salvate direct, fiecare cu butonul ei ──
  /*
   * Dupa o salvare: previzualizarea (numele, contactul, formularul se vad in magazin) si datele editorului
   * de pe server (sloganul intra in derivarea hero-ului), ca ecranul sa nu ramana pe valorile de la intrare.
   */
  const dupaSalvareSetari = useCallback(() => {
    reincarcaAcum.current();
    router.refresh();
  }, [router]);
  const setari = useSetariMagazin({ businessId: magazin.id, initiale: setariInitiale, dupaSalvare: dupaSalvareSetari });

  /**
   * Designul cu tipul de checkout SALVAT in Setări > Comanda (etapa 15), ca in magazin (`resolveDesign`): dupa el merg
   * previzualizarea, adresa ei si nodurile din panou. Ciorna ramane neatinsa: tipul nu sta in design, deci nu e o
   * modificare de publicat.
   */
  const tipComanda = setari.formular.tipSalvat;
  const designViu = useMemo(() => aplicaTipulComenzii(design, tipComanda), [design, tipComanda]);

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
    () => adresaPrevizualizarii(pagina, designViu, paginiAfisate, { sablon: sablonActiv, slug: slugSablon }),
    [pagina, designViu, paginiAfisate, sablonActiv, slugSablon],
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
  const [fila, setFila] = useState<FilaEditor>(filaInitiala);
  /** Setarea deschisa in fila „Setări”; `null` = lista lor. */
  const [setareDeschisa, setSetareDeschisa] = useState<CheieSetare | null>(setareInitiala);
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
  /** Locul ales cu „+” din previzualizare pentru galeria „Adaugă” (etapa 10); `null` = locul de azi. */
  const [locAdaugare, setLocAdaugare] = useState<{ loc: LocNou; text: string } | null>(null);
  /** „+” de sub produs / de pe Pagina Magazin: blocul ales intra intr-un „Conținut liber” nou, acolo. */
  const [continutNouCerut, setContinutNouCerut] = useState<Extract<Adaugare, { fel: "continut-nou" }> | null>(null);
  /** Lista „Adaugă coloană” a subsolului (etapa 11), cu locul ales: din arbore (la capat) sau din „+”. */
  const [coloanaNouaCeruta, setColoanaNouaCeruta] = useState<Extract<Adaugare, { fel: "coloana-subsol" }> | null>(null);
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

  /** O nota („se completeaza la Informații generale”) deschide setarea pe loc, in fila ei. */
  const deschideSetarea = useCallback((cheie: CheieSetare) => {
    setFila("setari");
    setSetareDeschisa(cheie);
    setVedereMobil("panou");
  }, []);

  /** Nodurile paginii alese, plus ce e comun tuturor paginilor. */
  const noduri = useMemo<SectionInstance[]>(() => [
    ...(designViu.chrome.announcement ? [designViu.chrome.announcement] : []),
    designViu.chrome.header,
    ...sectiunilePaginii(designViu, pagina, paginiAfisate, sablonActiv),
    designViu.chrome.footer,
  ], [designViu, pagina, paginiAfisate, sablonActiv]);
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

  // ── „Conținut liber” (etapa 9) ──
  /** Containerul deschis: o sectiune `continut_liber` a paginii principale, sau un bloc-container al paginii. */
  const caleLiber = useMemo<CaleContinut | null>(() => {
    if (!sectiuneSelectata) return null;
    if (sectiuneSelectata.kind === "continut_liber") return { sectiune: sectiuneSelectata.id, bloc: null };
    const schema = schemaBlocurilor(sectiuneSelectata.kind, sectiuneSelectata.variant);
    return blocDeschis && schema && esteContinut(schema, blocDeschis.type) ? { sectiune: sectiuneSelectata.id, bloc: blocDeschis.id } : null;
  }, [sectiuneSelectata, blocDeschis]);
  // In `useMemo`, ca `findBlock` mai sus: un apel liber in randare facea React Compiler sa piarda stabilitatea setterelor.
  const cheieLiber = useMemo(() => (caleLiber ? caleInText(caleLiber) : null), [caleLiber]);
  /** Blocul deschis si tinta unui bloc nou, legate de containerul lor: alt container nu le mosteneste. */
  const [liber, setLiber] = useState<{ cheie: string; bloc: string | null; tinta: TintaBloc | null } | null>(null);
  const liberAici = useMemo(() => (liber && liber.cheie === cheieLiber ? liber : null), [liber, cheieLiber]);
  const blocuriLibere = useMemo(() => (caleLiber ? blocuriLaCale(design, caleLiber) ?? [] : []), [design, caleLiber]);
  const blocLiberDeschis = useMemo(() => findBlock(blocuriLibere, liberAici?.bloc ?? null), [blocuriLibere, liberAici]);
  /** Un container de pe Acasa cu un singur bloc: se deschide direct pe el, iar „Înapoi” duce in arbore (etapa 13). */
  const unBlocPeAcasa = !!caleLiber && !caleLiber.bloc && blocuriLibere.length === 1;
  /**
   * Panoul deschis e chiar acel bloc unic, nu unul dintr-o coloana a lui (`esteBloculUnic`): doar atunci „Șterge” din
   * capul panoului scoate tot continutul, iar „Înapoi” duce in arbore. Pentru un bloc din coloane, panoul e cel
   * obisnuit, cu „Înapoi” spre lista continutului. In `useMemo`, ca `findBlock` mai sus (React Compiler).
   */
  const blocUnicDeschis = useMemo(
    () => !!caleLiber && !caleLiber.bloc && esteBloculUnic(blocuriLibere, blocLiberDeschis?.id),
    [caleLiber, blocuriLibere, blocLiberDeschis],
  );
  /** Unde sta continutul deschis, in cuvinte, pentru capul panourilor. */
  const locLiber = useMemo(() => {
    if (!sectiuneSelectata || !caleLiber) return "";
    if (!caleLiber.bloc) return "Pagina principală";
    const schema = schemaBlocurilor(sectiuneSelectata.kind, sectiuneSelectata.variant);
    const zona = schema?.zone.find((z) => z.id === (blocDeschis ? schema.tipuri[blocDeschis.type]?.zona : undefined));
    return [sectionMeta(sectiuneSelectata.kind)?.label, zona?.label].filter(Boolean).join(" · ");
  }, [sectiuneSelectata, caleLiber, blocDeschis]);

  // ── Ce se trimite catre previzualizare ──
  /**
   * Stilul se rezolva cu ce e PE ECRAN, ciorna peste publicat: o culoare, un font sau un fundal nou
   * se vede in dreapta pe loc, prin mesaj, inainte ca ciorna sa ajunga in baza.
   */
  const ctxStil = useMemo(() => contextCuCiorna(ciorna.ctxPublicat, ciorna.continut), [ciorna.ctxPublicat, ciorna.continut]);

  const trimiteAcum = useRef({ design: designViu, ctxStil });
  useEffect(() => { trimiteAcum.current = { design: designViu, ctxStil }; }, [designViu, ctxStil]);
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
  useEffect(() => { trimiteDesignul(); }, [designViu, ctxStil, trimiteDesignul]);

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
   * „Conținut liber” (etapa 9): datele blocurilor (produse, formulare, pachete, integrari, legaturi) se
   * cer o singura data, cand se deschide primul continut sau cand le cere previzualizarea
   * (`cereDateBlocuri`), si pleaca in cadru; reluarile animatiilor, la fiecare „Redă animația”.
   */
  const [dateBlocuri, setDateBlocuri] = useState<DateBlocuri | null>(null);
  const dateBlocuriAcum = useRef<DateBlocuri | null>(null);
  useEffect(() => { dateBlocuriAcum.current = dateBlocuri; }, [dateBlocuri]);
  const cerDateBlocuri = useRef(false);
  const cereDateBlocuri = useCallback(() => {
    if (dateBlocuriAcum.current || cerDateBlocuri.current) return;
    cerDateBlocuri.current = true;
    dateBlocuriInEditor(magazin.id)
      .then((d) => { if (d) setDateBlocuri(d); })
      .catch(() => toast.error("Nu am putut încărca datele blocurilor. Verifică legătura la internet și deschide din nou conținutul."))
      .finally(() => { cerDateBlocuri.current = false; });
  }, [magazin.id]);
  const trimiteDateBlocuri = useCallback(() => {
    const d = dateBlocuriAcum.current;
    if (!d) return;
    rama.current?.contentWindow?.postMessage({
      [PREVIEW_MESSAGE]: "dateBlocuri",
      date: { products: d.products, bundles: d.pachete, forms: d.forms, plati: d.integrari.plati, curieri: d.integrari.curieri },
    }, window.location.origin);
  }, []);
  useEffect(() => { trimiteDateBlocuri(); }, [dateBlocuri, trimiteDateBlocuri]);
  useEffect(() => { if (caleLiber) cereDateBlocuri(); }, [caleLiber, cereDateBlocuri]);
  const reluariAcum = useRef(reluari);
  useEffect(() => { reluariAcum.current = reluari; }, [reluari]);
  const trimiteReluari = useCallback(() => {
    rama.current?.contentWindow?.postMessage({ [PREVIEW_MESSAGE]: "reluari", reluari: reluariAcum.current }, window.location.origin);
  }, []);
  useEffect(() => { trimiteReluari(); }, [reluari, trimiteReluari]);

  /*
   * Conturul din previzualizare (etapa 3): nodul deschis in panou, doar pe fila
   * Sectiuni, si randul din arbore de sub mouse, doar cand arborele se vede. Ce
   * se deseneaza decide previzualizarea (`ConturEditor`); selectia ramane aici.
   */
  let selectatVazut: string | null = null;
  if (fila === "sectiuni") {
    // Un bloc al paginii proprii: sectiunea ei e chiar cheia paginii (`pagina:<id>`).
    if (idPagina && blocPaginaDeschis) selectatVazut = idBloc(pagina, blocPaginaDeschis.id);
    // Un bloc dintr-un „Conținut liber” (etapa 9): `<cale>/<bloc>`, ca marcajul din previzualizare.
    else if (cheieLiber && blocLiberDeschis) selectatVazut = idBloc(cheieLiber, blocLiberDeschis.id);
    else if (sectiuneSelectata) selectatVazut = blocDeschis ? idBloc(sectiuneSelectata.id, blocDeschis.id) : sectiuneSelectata.id;
  }
  // In panoul unui „Conținut liber” (etapa 9) randurile blocurilor se vad sub mouse, ca in arborele unei pagini.
  const pesteVazut = caleLiber && !blocLiberDeschis && !liberAici?.tinta ? peste
    : sectiuneSelectata || blocPaginaDeschis || setariPaginii || tintaBloc ? null : peste;
  /*
   * „+” din previzualizare (etapa 10): unde se arata il hotaraste editorul, din design si pagina, si pleaca odata cu
   * evidentierea; clicul vine inapoi ca „adauga” si se verifica pe aceeasi lista (`ceAdaugaPlusul`).
   */
  const blocuriPaginii = paginaDeschisa.stare?.blocks ?? null;
  const ctxAdaugare = useMemo<ContextAdaugare>(() => ({
    pagina, magazin: paginiAfisate, sablon: sablonActiv, paginaAcasaProprie: !!paginaAcasa, blocuriPagina: blocuriPaginii,
  }), [pagina, paginiAfisate, sablonActiv, paginaAcasa, blocuriPaginii]);
  const puncteAdaugare = useMemo(() => puncteDeAdaugare(design, ctxAdaugare), [design, ctxAdaugare]);
  const evidentiereAcum = useRef({ selectat: selectatVazut, peste: pesteVazut, adaugare: puncteAdaugare });
  useEffect(() => {
    evidentiereAcum.current = { selectat: selectatVazut, peste: pesteVazut, adaugare: puncteAdaugare };
  }, [selectatVazut, pesteVazut, puncteAdaugare]);
  const trimiteEvidentierea = useCallback(() => {
    rama.current?.contentWindow?.postMessage(
      { [PREVIEW_MESSAGE]: "evidentiere", ...evidentiereAcum.current },
      window.location.origin,
    );
  }, []);
  useEffect(() => { trimiteEvidentierea(); }, [selectatVazut, pesteVazut, puncteAdaugare, trimiteEvidentierea]);

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
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
    /*
     * Etapa 13 (cerut de el): un „Conținut liber” cu un SINGUR bloc se deschide direct pe blocul lui.
     * Butonul pus cu „+” e, pentru om, un buton; lista containerului cu un rand era un pas degeaba.
     */
    const sectiune = design.home.find((s) => s.id === id);
    const unic = sectiune?.kind === "continut_liber" ? blocUnic(sectiune.settings) : null;
    if (unic) {
      const cheie = caleInText({ sectiune: id, bloc: null });
      setLiber({ cheie, bloc: unic.id, tinta: null });
      arataInPrevizualizare(idBloc(cheie, unic.id));
      return;
    }
    setLiber(null);
    arataInPrevizualizare(id);
  }, [arataInPrevizualizare, design.home]);

  const selecteazaBloc = useCallback((idSectiune: string, idBlocului: string) => {
    setPeste(null);
    setSelectat(idSectiune);
    setBlocSelectat(idBlocului);
    setLiber(null);
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
    arataInPrevizualizare(idBloc(idSectiune, idBlocului));
  }, [arataInPrevizualizare]);

  const inapoiLaArbore = useCallback(() => {
    setSelectat(null);
    setBlocSelectat(null);
    setLiber(null);
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
  }, []);

  /**
   * Sterge „Conținut liber”-ul deschis: pe Acasa e o sectiune, sub produs si pe Pagina Magazin un bloc al
   * paginii. Etapa 13 (cerut de el, „vreau să apară și Șterge”): pana acum, pe Acasa se stergea doar din
   * arbore. Prin ciorna, deci „Anulează” il aduce inapoi.
   */
  const stergeContinutulDeschis = () => {
    if (!caleLiber) return;
    const cale = caleLiber;
    ciorna.aplica((d: StoreDesign) => (cale.bloc
      ? schimbaBlocurile(d, cale.sectiune, (l, sch) => stergeContinut(l, sch, cale.bloc!))
      : removeSection(d, cale.sectiune)));
    inapoiLaArbore();
    toast.success("Conținutul a fost șters. Îl aduci înapoi cu „Anulează”, din bara de sus.");
  };

  /** Pagina principala are lista ei de sectiuni in arbore: acolo meniul de clic dreapta le muta, ascunde, sterge. */
  const listaAcasa = pagina === "acasa" && !paginiAfisate.unSingurProdus;

  /**
   * O actiune aleasa din meniul de clic dreapta (08.11.2026), deja verificata pe lista elementului. Prin ciorna (sau
   * istoricul paginii proprii), deci „Anulează” o desface; dupa o stergere, mesajul are chiar butonul.
   */
  const executaActiunea = useCallback((tinta: TintaMeniu, cheie: CheieActiune) => {
    const anuleazaPas = tinta.fel === "pagina" ? paginaDeschisa.anuleaza : ciorna.anuleaza;
    if (tinta.fel === "pagina") {
      const op = operatiaPeBlocuri(cheie, tinta.bloc);
      if (!op) return;
      aplicaPeEcran((s) => ({ ...s, blocks: op(s.blocks) }), cheie === "sus" || cheie === "jos" ? "ordine-pagina" : `${cheie}:${tinta.bloc}`);
      if (cheie === "sterge" && blocPagina === tinta.bloc) setBlocPagina(null);
    } else {
      const idSectiune = tinta.fel === "bloc" ? tinta.sectiune : tinta.fel === "liber" ? tinta.cale.sectiune : tinta.id;
      // Cheile arborelui: mutarile si ochiul se aduna intr-un singur pas, ca acolo.
      const cheieIstoric = cheie === "sus" || cheie === "jos" ? (tinta.fel === "sectiune" ? "ordine" : "ordine-blocuri")
        : cheie === "ascunde" || cheie === "arata" ? `ochi-meniu:${idSectiune}` : undefined;
      ciorna.aplica((d: StoreDesign) => aplicaPeDesign(d, tinta, cheie), cheieIstoric);
      // Panoul deschis pe ce s-a sters ar fi ramas fara nod.
      if (cheie === "sterge" && selectat === idSectiune) inapoiLaArbore();
    }
    if (cheie === "sterge") {
      toast.success("Șters.", { action: { label: "Anulează", onClick: () => anuleazaPas() }, duration: 8000 });
    }
  }, [aplicaPeEcran, blocPagina, ciorna, inapoiLaArbore, paginaDeschisa.anuleaza, selectat]);

  const schimbaPagina = useCallback((p: CheiePagina) => {
    setPagina(p);
    setSelectat(null);
    setBlocSelectat(null);
    setLiber(null);
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
    setPeste(null);
    setGalerieDesign(null);
    setAdaugaDeschis(false);
    setLocAdaugare(null);
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

  /**
   * O versiune readusa a intrat in ciorna (etapa 7): panoul deschis poate fi al unei sectiuni care in
   * versiune nu exista, deci inapoi la arbore, si previzualizarea in fata (pe telefon e ascunsa sub
   * panou). De pe o pagina proprie, editorul trece pe „Acasă”: acolo Anuleaza e al designului, deci
   * scoate versiunea; pe pagina ar fi desfacut un pas al paginii (sau ar fi fost oprit). O pagina
   * nesalvata intreaba inainte, ca la orice schimbare de pagina.
   */
  const dupaVersiuneReadusa = useCallback(() => {
    setIstoricDeschis(false);
    setSelectat(null);
    setBlocSelectat(null);
    setLiber(null);
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
    setGalerieDesign(null);
    setAdaugaDeschis(false);
    setLocAdaugare(null);
    setSetariSablon(false);
    setVedereMobil("previzualizare");
    if (idPagina) cerePagina("acasa");
  }, [idPagina, cerePagina]);

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

  /**
   * „+” apasat in previzualizare (etapa 10): galeria peste previzualizare pe Acasa, altfel „Adaugă un bloc” in
   * panou, la locul ales. Pe telefon editorul trece singur unde se alege.
   */
  const deschideAdaugarea = useCallback((a: Adaugare) => {
    setFila("sectiuni");
    setPeste(null);
    setGalerieDesign(null);
    setSetariSablon(false);
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
    if (a.fel === "sectiune") {
      setLocAdaugare({ loc: a.loc, text: `Se adaugă ${a.unde === "jos" ? "sub" : "deasupra"} „${a.eticheta}”.` });
      setAdaugaDeschis(true);
      setVedereMobil("previzualizare");
      // Blocurile de integrare din galerie stiu abia cu datele daca integrarea lor e pornita.
      cereDateBlocuri();
      return;
    }
    setAdaugaDeschis(false);
    setLocAdaugare(null);
    setVedereMobil("panou");
    if (a.fel === "bloc-pagina") {
      setSelectat(null);
      setBlocSelectat(null);
      setLiber(null);
      setSetariPaginii(false);
      setBlocPagina(null);
      setTintaBloc(a.tinta);
      return;
    }
    setTintaBloc(null);
    if (a.fel === "bloc-liber") {
      setSelectat(a.cale.sectiune);
      setBlocSelectat(a.cale.bloc);
      setLiber({ cheie: caleInText(a.cale), bloc: null, tinta: a.tinta });
      return;
    }
    setSelectat(null);
    setBlocSelectat(null);
    setLiber(null);
    if (a.fel === "coloana-subsol") {
      setColoanaNouaCeruta(a);
      return;
    }
    setContinutNouCerut(a);
    cereDateBlocuri();
  }, [cereDateBlocuri]);

  // ── Mesajele din previzualizare ──
  useEffect(() => {
    function laMesaj(e: MessageEvent) {
      if (e.origin !== window.location.origin || !isPreviewMessage(e.data)) return;
      const tip = e.data[PREVIEW_MESSAGE];
      if (tip === "adauga") {
        // Din cadru: forma se verifica, iar locul se cauta pe lista punctelor, nu se crede.
        const { id, unde } = e.data;
        if (typeof id !== "string" || (unde !== "sus" && unde !== "jos")) return;
        const a = ceAdaugaPlusul(design, ctxAdaugare, id, unde);
        if (a) deschideAdaugarea(a);
      }
      else if (tip === "ready") {
        trimiteDesignul();
        trimitePagina(true);
        trimiteDateBlocuri();
        trimiteReluari();
      }
      // „Conținut liber” (etapa 9): previzualizarea are continut si ii trebuie datele blocurilor.
      else if (tip === "cereDateBlocuri") {
        if (dateBlocuriAcum.current) trimiteDateBlocuri();
        else cereDateBlocuri();
      }
      else if (tip === "conturGata") trimiteEvidentierea();
      else if (tip === "select") alege(e.data.sectionId);
      // Clic dreapta pe un element (08.11.2026): intrarile meniului lui, inapoi la previzualizare, care il deseneaza.
      else if (tip === "meniu") {
        const { id, x, y } = e.data;
        if (typeof id !== "string" || typeof x !== "number" || typeof y !== "number") return;
        const tinta = tintaDinId(design, id, listaAcasa);
        const actiuni = tinta ? actiuniMeniu(design, tinta, blocuriPaginii) : [];
        rama.current?.contentWindow?.postMessage({ [PREVIEW_MESSAGE]: "meniuActiuni", id, x, y, actiuni }, window.location.origin);
      }
      else if (tip === "actiune") {
        // Din cadru: actiunea se cauta din nou pe lista elementului de ACUM, nu se crede.
        const { id, cheie } = e.data;
        if (typeof id !== "string" || typeof cheie !== "string") return;
        const tinta = tintaDinId(design, id, listaAcasa);
        if (!tinta || !actiuniMeniu(design, tinta, blocuriPaginii).some((a) => a.cheie === cheie && !a.dezactivata)) return;
        if (cheie === "editeaza") alege(id);
        else executaActiunea(tinta, cheie as CheieActiune);
      }
    }

    /** Clic pe un element din previzualizare (sau „Editează” din meniul lui): nodul lui, in panou. */
    function alege(idDinCadru: string) {
      /*
       * Sectiunea poate sta pe alta pagina decat cea aleasa: pe „Coșul” cu cos
       * in sertar, previzualizarea arata prima pagina. Atunci editorul trece pe
       * pagina ei, altfel clicul n-ar fi avut ce nod sa deschida.
       */
      // Un bloc vine ca `<sectiune>/<bloc>` (`preview-protocol.ts`).
      const { sectiune: id, bloc } = despartireId(idDinCadru);
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
      /*
       * Un bloc dintr-un „Conținut liber” (etapa 9): pe pagina principala vine ca `<sectiune>/<bloc>`, cu
       * sectiunea `continut_liber`; sub produs si pe Pagina Magazin, ca `<pagina>/<continut>/<bloc>`.
       * Se deschide continutul, cu blocul ales in panou.
       */
      const { blocStructural, interior } = alegereDinClic(design, id, bloc);
      setSelectat(id);
      setBlocSelectat(blocStructural);
      setLiber(interior ? { ...interior, tinta: null } : null);
      setContinutNouCerut(null);
      setColoanaNouaCeruta(null);
      setVedereMobil("panou");
    }
    window.addEventListener("message", laMesaj);
    return () => window.removeEventListener("message", laMesaj);
  }, [trimiteDesignul, trimiteEvidentierea, trimitePagina, trimiteDateBlocuri, trimiteReluari, cereDateBlocuri, design, pagina, paginiAfisate, paginaDeschisa.modificata, schimbaPagina, ctxAdaugare, deschideAdaugarea, listaAcasa, blocuriPaginii, executaActiunea]);

  const adaugaSectiune = useCallback(async (kind: SectionKind) => {
    const loc = locAdaugare?.loc;
    setAdaugaDeschis(false);
    setLocAdaugare(null);
    if (kind === "product_row") {
      // Randul traieste in continut: intra in ciorna, iar designul se re-deriva in acelasi pas
      // (`aplicaContinut`), deci la urmatoarea randare randul e si in arbore, si selectat.
      const rand = newProductSection("selected");
      // Din „+” (etapa 10): derivarea il pune inaintea catalogului, de unde vine la locul ales, sub ACEEASI cheie,
      // deci Anulează scoate tot dintr-o apasare.
      const cheie = loc ? `adauga-rand:${rand.id}` : undefined;
      const ok = await continut.seteazaSiSalveaza("rand", (p) => ({ ...p, product_sections: [...(p.product_sections ?? []), rand] }), cheie);
      if (ok && loc) ciorna.aplica((d: StoreDesign) => mutaSectiuneaLa(d, rand.id, loc), cheie);
      if (ok) setSelectat(rand.id);
      return;
    }
    const r = sectiuneNoua(design, kind, loc);
    if (!r) return;
    ciorna.aplica(r.design);
    setSelectat(r.id);
    setBlocSelectat(null);
    // „Conținut liber” (etapa 9): gol, deci paleta de blocuri, nu un panou fara nimic in el.
    setLiber(kind === "continut_liber" ? { cheie: r.id, bloc: null, tinta: { fel: "sus", index: 0 } } : null);
  }, [continut, design, ciorna, locAdaugare]);

  /** Un bloc ales in galerie (etapa 10, „Secțiuni și blocuri”): intra intr-un „Conținut liber” nou, deschis pe el. */
  const adaugaBlocDinGalerie = useCallback((tip: BlockType) => {
    const bloc = createBlock(tip, { inColumn: false });
    const r = sectiuneNoua(design, "continut_liber", locAdaugare?.loc, bloc);
    setAdaugaDeschis(false);
    setLocAdaugare(null);
    if (!r) return;
    ciorna.aplica(r.design);
    setPeste(null);
    setSelectat(r.id);
    setBlocSelectat(null);
    setLiber({ cheie: r.id, bloc: bloc.id, tinta: null });
    setVedereMobil("panou");
  }, [design, ciorna, locAdaugare]);

  /** Blocul ales dupa un „+” de sub produs / de pe Pagina Magazin: intr-un „Conținut liber” nou, la locul ales. */
  const adaugaInContinutNou = useCallback((tip: BlockType) => {
    const a = continutNouCerut;
    if (!a) return;
    const bloc = createBlock(tip, { inColumn: false });
    const r = continutNou(design, a, bloc);
    if (!r) {
      toast.error("Poți avea cel mult 10 blocuri „Conținut liber” pe o pagină.");
      return;
    }
    ciorna.aplica(r.design);
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
    setPeste(null);
    setSelectat(a.sectiune);
    setBlocSelectat(r.id);
    setLiber({ cheie: caleInText({ sectiune: a.sectiune, bloc: r.id }), bloc: bloc.id, tinta: null });
  }, [continutNouCerut, design, ciorna]);

  /** Un „Conținut liber” nou intr-o zona a paginii de produs sau a Paginii Magazin (etapa 9), deschis pe paleta. */
  const adaugaContinutInZona = useCallback((idSectiune: string, tip: string) => {
    const sectiune = toateSectiunile(design).find((s) => s.id === idSectiune);
    const inainte = new Set((sectiune?.blocks ?? []).map((b) => b.id));
    const urmator = schimbaBlocurile(design, idSectiune, (l, sch) => adaugaContinut(l, sch, tip));
    if (urmator === design) {
      toast.error("Poți avea cel mult 10 blocuri „Conținut liber” pe o pagină.");
      return;
    }
    ciorna.aplica(urmator);
    const nou = toateSectiunile(urmator).find((s) => s.id === idSectiune)?.blocks?.find((b) => !inainte.has(b.id));
    if (!nou) return;
    setPeste(null);
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
    setSelectat(idSectiune);
    setBlocSelectat(nou.id);
    setLiber({ cheie: `${idSectiune}/${nou.id}`, bloc: null, tinta: { fel: "sus", index: 0 } });
  }, [design, ciorna]);

  /** Un bloc nou in continutul deschis, la tinta aleasa (etapa 9); se deschide pe loc. */
  const adaugaBlocLiber = useCallback((tip: BlockType) => {
    const t = liberAici?.tinta;
    if (!caleLiber || !cheieLiber || !t) return;
    const nou = createBlock(tip, { inColumn: t.fel === "coloana" });
    ciorna.aplica((d: StoreDesign) => schimbaBlocuriLaCale(d, caleLiber, (bs) => (
      t.fel === "sus" ? insertAtTop(bs, t.index, nou) : insertIntoColumn(bs, t.idColoane, t.coloana, t.index, nou)
    )));
    setLiber({ cheie: cheieLiber, bloc: nou.id, tinta: null });
  }, [liberAici, caleLiber, cheieLiber, ciorna]);

  /** Lista „Adaugă coloană” a subsolului din arbore (etapa 11): coloana noua intra la capat. */
  const deschideAdaugaColoana = useCallback(() => {
    setPeste(null);
    setSelectat(null);
    setBlocSelectat(null);
    setLiber(null);
    setContinutNouCerut(null);
    setColoanaNouaCeruta({ fel: "coloana-subsol", loc: {}, locText: "la capătul subsolului" });
  }, []);

  /** Coloana aleasa in lista (etapa 11): intra la locul cerut si i se deschide panoul. */
  const adaugaColoanaSubsol = useCallback((tip: string) => {
    const cerere = coloanaNouaCeruta;
    if (!cerere) return;
    const subsol = design.chrome.footer;
    const inainte = new Set((subsol.blocks ?? []).map((b) => b.id));
    const urmator = schimbaBlocurile(design, subsol.id, (l, sch) => adaugaColoana(l, sch, tip, cerere.loc));
    if (urmator === design) return;
    ciorna.aplica(urmator);
    setColoanaNouaCeruta(null);
    const noua = urmator.chrome.footer.blocks?.find((b) => !inainte.has(b.id));
    if (!noua) return;
    setPeste(null);
    setSelectat(subsol.id);
    setBlocSelectat(noua.id);
  }, [coloanaNouaCeruta, design, ciorna]);

  /*
   * Adresele din coloanele subsolului se aleg cu sugestiile paginilor si categoriilor, iar newsletterul cere un
   * furnizor conectat: amandoua vin din datele blocurilor, cerute o data, cand se deschide o coloana sau lista.
   */
  const coloanaDeschisa = sectiuneSelectata?.kind === "footer" && !!blocDeschis;
  useEffect(() => { if (coloanaNouaCeruta || coloanaDeschisa) cereDateBlocuri(); }, [coloanaNouaCeruta, coloanaDeschisa, cereDateBlocuri]);
  // Linkurile bannerelor din Hero au sugestii (etapa 13): paginile, categoriile si produsele vin din aceleasi date.
  const heroDeschis = sectiuneSelectata?.kind === "hero";
  useEffect(() => { if (heroDeschis) cereDateBlocuri(); }, [heroDeschis, cereDateBlocuri]);

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
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
    setSetariSablon(true);
  }, [design, ciorna]);

  const alegeSablon = useCallback((id: string | null) => {
    setSablonEditat(id);
    setSelectat(null);
    setBlocSelectat(null);
    setContinutNouCerut(null);
    setColoanaNouaCeruta(null);
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

  const sectiuneGalerie = galerieDesign ? toateSectiunile(designViu).find((s) => s.id === galerieDesign) ?? null : null;
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
    <DeschideSetareaContext.Provider value={deschideSetarea}>
    <div className="flex flex-col h-full overflow-hidden">
      <BaraEditor
        pagina={pagina} onPagina={cerePagina} ciorna={ciorna}
        dispozitiv={dispozitiv} onDispozitiv={setDispozitiv} onReincarca={reincarca} adresaPublica={adresaPublica}
        publicat={continut.publicat} publicareInCurs={continut.publicareInCurs} onComutaPublicarea={continut.comutaPublicarea}
        continutNesalvat={continut.incarc || paginaDeschisa.modificata || setari.nesalvate.length > 0} seIncarca={continut.incarc} vedereMobil={vedereMobil} onVedereMobil={setVedereMobil} ingust={ecranIngust}
        paginiProprii={paginiAfisate.paginiProprii}
        anulare={istoricPagina ?? undefined}
        laIesire={iesire}
        onIstoric={() => setIstoricDeschis(true)}
      />
      {istoricDeschis && (
        <IstoricVersiuni businessId={magazin.id} ciorna={ciorna} ocupat={continut.incarc}
          onInchide={() => setIstoricDeschis(false)} onReadusa={dupaVersiuneReadusa} />
      )}

      {/*
        Cat se publica sau se renunta, panoul si previzualizarea nu primesc nimic: ce s-ar fi
        modificat intre timp ar fi fost calcat de ciorna golita la intoarcere (vezi `blocata`).
      */}
      <div className="flex flex-1 min-h-0" inert={ciorna.blocata}>
        <aside className={`w-full lg:w-[360px] shrink-0 flex-col border-r border-border bg-surface ${vedereMobil === "previzualizare" ? "hidden lg:flex" : "flex"}`}>
          <div className="px-3 pt-3 flex gap-1 border-b border-border" role="tablist">
            {([["sectiuni", "Secțiuni"], ["stil", "Stil"], ["setari", "Setări"]] as const).map(([cheie, eticheta]) => (
              <button key={cheie} type="button" role="tab" aria-selected={fila === cheie} onClick={() => setFila(cheie)}
                className={`h-9 px-3 -mb-px text-sm font-medium border-b-2 transition-colors ${fila === cheie ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {eticheta}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            {fila === "setari" ? (
              <FilaSetari setari={setari} deschisa={setareDeschisa} onDeschide={setSetareDeschisa} onInapoi={() => setSetareDeschisa(null)} />
            ) : fila === "stil" ? (
              <PanouStil continut={continut} cardul={{
                sectiune: designViu.commerce.productCard,
                numar: numarVariante(designViu.commerce.productCard),
                onSchimba: () => { setGalerieDesign(designViu.commerce.productCard.id); setVedereMobil("previzualizare"); },
              }} />
            ) : continutNouCerut && !dateBlocuri ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : continutNouCerut && dateBlocuri ? (
              // „+” de sub produs / de pe Pagina Magazin (etapa 10): blocul ales intra intr-un „Conținut liber” nou.
              <PanouAdaugaBloc tinta={{ fel: "sus", index: 0 }} locText={continutNouCerut.locText} date={dateBlocuri} inapoiLa="secțiuni"
                onBloc={adaugaInContinutNou} onInapoi={() => setContinutNouCerut(null)} />
            ) : coloanaNouaCeruta ? (
              // Lista „Adaugă coloană” a subsolului (etapa 11): din arbore sau din „+” de pe o coloana.
              <PanouAdaugaColoana subsol={design.chrome.footer} date={dateBlocuri} locText={coloanaNouaCeruta.locText}
                onAlege={adaugaColoanaSubsol} onInapoi={() => setColoanaNouaCeruta(null)} />
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
              <PanouAdaugaBloc tinta={tintaBloc} date={paginaDeschisa.date} estePaginaAcasa={paginaDeschisa.date.estePaginaAcasa}
                onBloc={adaugaBlocPagina} onAcasa={adaugaAcasaPagina} onInapoi={() => setTintaBloc(null)} />
            ) : idPagina && setariPaginii && paginaDeschisa.date && paginaDeschisa.stare ? (
              <PanouPagina stare={paginaDeschisa.stare} pagina={paginaDeschisa} date={paginaDeschisa.date} onInapoi={() => setSetariPaginii(false)} />
            ) : idPagina && blocPaginaDeschis && paginaDeschisa.date ? (
              <PanouBlocPagina key={blocPaginaDeschis.id} bloc={blocPaginaDeschis} pagina={paginaDeschisa} date={paginaDeschisa.date}
                titluPagina={paginaDeschisa.stare?.titlu ?? ""} onInapoi={() => setBlocPagina(null)}
                onRedaAnimatia={() => setReluari((r) => ({ ...r, [blocPaginaDeschis.id]: (r[blocPaginaDeschis.id] ?? 0) + 1 }))} />
            ) : caleLiber && cheieLiber && sectiuneSelectata && (liberAici?.tinta || blocLiberDeschis) && !dateBlocuri ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : caleLiber && cheieLiber && liberAici?.tinta && dateBlocuri ? (
              <PanouAdaugaBloc tinta={liberAici.tinta} date={dateBlocuri} inapoiLa={unBlocPeAcasa ? "bloc" : "conținut"} onBloc={adaugaBlocLiber}
                laSfarsit="La sfârșitul conținutului"
                onInapoi={() => setLiber({ cheie: cheieLiber, bloc: unBlocPeAcasa ? blocuriLibere[0].id : null, tinta: null })} />
            ) : caleLiber && cheieLiber && blocLiberDeschis && dateBlocuri ? (
              <PanouBlocComun key={blocLiberDeschis.id} bloc={blocLiberDeschis} date={dateBlocuri} loc={locLiber}
                inapoiLa={blocUnicDeschis ? "secțiuni" : "conținut"}
                onSchimba={(patch, cheie) => ciorna.aplica(
                  (d: StoreDesign) => schimbaBlocuriLaCale(d, caleLiber, (bs) => updateBlockInTree(bs, blocLiberDeschis.id, patch)),
                  cheie,
                )}
                onInapoi={blocUnicDeschis ? inapoiLaArbore : () => setLiber({ cheie: cheieLiber, bloc: null, tinta: null })}
                actiuneSus={blocUnicDeschis ? (
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setLiber({
                        cheie: cheieLiber,
                        bloc: null,
                        tinta: tintaLangaBloc(blocuriLibere, blocLiberDeschis.id, "jos") ?? { fel: "sus", index: blocuriLibere.length },
                      })}
                      className="flex-1 h-10 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors inline-flex items-center justify-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Adaugă alt bloc aici
                    </button>
                    {/* Blocul e singur in container, deci a-l sterge inseamna a sterge sectiunea. */}
                    <button type="button" onClick={stergeContinutulDeschis}
                      className="shrink-0 h-10 px-3 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors inline-flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" /> Șterge
                    </button>
                  </div>
                ) : undefined}
                onRedaAnimatia={() => setReluari((r) => ({ ...r, [blocLiberDeschis.id]: (r[blocLiberDeschis.id] ?? 0) + 1 }))} />
            ) : caleLiber && cheieLiber && sectiuneSelectata ? (
              <PanouContinutLiber
                key={cheieLiber}
                loc={locLiber}
                ascuns={caleLiber.bloc ? blocDeschis?.enabled === false : !sectiuneSelectata.enabled}
                blocuri={blocuriLibere}
                cheie={cheieLiber}
                blocSelectat={null}
                onSelectBloc={(id) => { setPeste(null); setLiber({ cheie: cheieLiber, bloc: id, tinta: null }); arataInPrevizualizare(idBloc(cheieLiber, id)); }}
                onAdauga={(t) => { setPeste(null); setLiber({ cheie: cheieLiber, bloc: null, tinta: t }); }}
                onPeste={setPeste}
                schimba={(fn, ch) => ciorna.aplica((d: StoreDesign) => schimbaBlocuriLaCale(d, caleLiber, fn), ch)}
                onInapoi={inapoiLaArbore}
                onComutaOchi={() => (caleLiber.bloc
                  ? ciorna.aplica((d: StoreDesign) => schimbaBlocurile(d, caleLiber.sectiune, (l, sch) => comutaBloc(l, sch, caleLiber.bloc!)), `ochi-bloc:${cheieLiber}`)
                  : ciorna.aplica((d: StoreDesign) => toggleSection(d, caleLiber.sectiune), `ochi:${caleLiber.sectiune}`))}
                onDuplica={caleLiber.bloc ? () => ciorna.aplica((d: StoreDesign) => schimbaBlocurile(d, caleLiber.sectiune, (l, sch) => duplicaContinut(l, sch, caleLiber.bloc!))) : undefined}
                onSterge={stergeContinutulDeschis}
              />
            ) : sectiuneSelectata && blocDeschis && sectiuneSelectata.kind === "footer" ? (
              <PanouColoanaSubsol key={blocDeschis.id} subsol={sectiuneSelectata} coloana={blocDeschis} ciorna={ciorna} date={dateBlocuri}
                onInapoi={inapoiLaArbore} />
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
              /* Sugestiile campurilor de link din panou (bannerele din Hero, etapa 13); fara date, campul ramane text simplu. */
              <FurnizorLegaturi value={dateBlocuri ? { businessId: dateBlocuri.business.id, ...dateBlocuri.legaturi } : null}>
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
              </FurnizorLegaturi>
            ) : (
              <div className="pb-6">
                <ArboreSectiuni
                  ciorna={ciorna} pagina={pagina} magazin={paginiAfisate} selectat={selectat} onSelect={selecteaza} onPeste={setPeste}
                  blocSelectat={blocSelectat} onSelectBloc={selecteazaBloc} onAdaugaContinut={adaugaContinutInZona} onAdaugaColoana={deschideAdaugaColoana}
                  tipComanda={tipComanda}
                  nesalvat={nesalvat} onAdauga={() => { setLocAdaugare(null); setAdaugaDeschis(true); setVedereMobil("previzualizare"); cereDateBlocuri(); }}
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
            <GalerieAdauga design={design} slug={magazin.slug} loc={locAdaugare?.text} onAdauga={(k) => void adaugaSectiune(k)}
              onBloc={adaugaBlocDinGalerie} integrareActiva={integrariActive(dateBlocuri)}
              faraContinutLiber={!!paginaAcasa}
              onInchide={() => { setAdaugaDeschis(false); setLocAdaugare(null); }} />
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
    </DeschideSetareaContext.Provider>
  );
}

