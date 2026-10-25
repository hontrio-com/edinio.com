"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { updateBusiness } from "@/lib/actions/business.actions";
import { cheiSchimbate, doarCheile } from "@/components/editor/chei-atinse";
import { cuCheilePc, cuColoanele } from "@/lib/editor-magazin/ciorna";
import { continutInitial, type ContinutPagina } from "@/lib/editor-magazin/continut";
import { CHEI_CONTINUT, NOD_STIL, type FelContinut } from "@/lib/editor-magazin/noduri";
import { pcCuCiorna } from "@/lib/storefront/design/continut-ciorna";
import type { CiornaDesign } from "./useCiornaDesign";

/**
 * Continutul magazinului in editorul unic: textele, listele si imaginile din `page_content` si
 * din `businesses`.
 *
 * Din etapa 6 (decizia lui: „Totul la „Publică””) continutul nu se mai salveaza in magazin din
 * fiecare nod: orice modificare intra in ciorna (`useCiornaDesign`, sub `continut`), langa design,
 * si ajunge la clienti la „Publică”. In ciorna stau doar cheile schimbate; una adusa inapoi la
 * valoarea publicata iese din ea (`cuCheilePc`).
 *
 * Imaginile noi (logo, favicon, bannere) se urca in clipa alegerii: ciorna tine adresa lor, nu
 * fisierul. Cat se urca, panoul arata fisierul local.
 */

export type NodContinut = FelContinut | typeof NOD_STIL;

export interface BannerItem { id: string; url: string; file: File | null; link?: string }

export interface MagazinPentruContinut {
  id: string;
  is_published: boolean;
}

async function urca(file: File, bucket: string): Promise<string | null> {
  const { uploadImage } = await import("@/lib/upload");
  const r = await uploadImage(file, bucket);
  return "error" in r ? null : r.url;
}

/** Faviconul se face patrat si PNG in browser, apoi se urca fara recomprimare. */
async function urcaFavicon(file: File): Promise<string | null> {
  const [{ processFavicon }, { uploadImage }] = await Promise.all([import("@/lib/utils/favicon"), import("@/lib/upload")]);
  const png = await processFavicon(file);
  const r = await uploadImage(png, "logos", undefined, { skipCompress: true });
  return "error" in r ? null : r.url;
}

const listaDeSiruri = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : [];

const HEX = /^#[0-9A-Fa-f]{6}$/;

type Imagine = { previzualizare: string | null; fisier: File | null };

export function useContinutMagazin({ magazin, ciorna }: { magazin: MagazinPentruContinut; ciorna: CiornaDesign }) {
  const { continut: inCiorna, continutPublicat, aplicaContinut } = ciorna;

  // ── Ce se vede pe ecran: publicatul, cu ciorna peste el ──
  const culoare = inCiorna.magazin.primary_color ?? continutPublicat.magazin.primary_color;
  const pc = useMemo(
    () => continutInitial(pcCuCiorna(continutPublicat.pc, inCiorna) as ContinutPagina, culoare),
    [continutPublicat.pc, inCiorna, culoare],
  );
  /** Ecranul, citibil intr-o actiune (doar cheia pasului din istoric; calculul se face pe ciorna). */
  const pcAcum = useRef(pc);
  useEffect(() => { pcAcum.current = pc; }, [pc]);
  const publicatAcum = useRef(continutPublicat);
  useEffect(() => { publicatAcum.current = continutPublicat; }, [continutPublicat]);

  /**
   * Scrie in ciorna. Calculul se face pe ciorna de ACUM (in reductor), nu pe cea din randare: doua
   * scrieri in acelasi eveniment nu se calca. Cheia pasului (doar pentru lipirea tastarii la
   * Anuleaza) se ia din ecran.
   */
  const seteaza = useCallback((nod: NodContinut, actualizare: (p: ContinutPagina) => ContinutPagina) => {
    const proba = actualizare(pcAcum.current);
    const chei = cheiSchimbate(pcAcum.current as Record<string, unknown>, proba as Record<string, unknown>).sort();
    if (chei.length === 0) return;
    const publicat = publicatAcum.current;
    aplicaContinut((c) => {
      const ecran = continutInitial(
        pcCuCiorna(publicat.pc, c) as ContinutPagina,
        c.magazin.primary_color ?? publicat.magazin.primary_color,
      );
      const urmator = actualizare(ecran);
      if (urmator === ecran) return c;
      const schimbate = cheiSchimbate(ecran as Record<string, unknown>, urmator as Record<string, unknown>);
      return cuCheilePc(c, doarCheile(urmator as Record<string, unknown>, schimbate), publicat);
    }, `continut:${nod}:${chei.join(",")}`);
  }, [aplicaContinut]);

  /** Are nodul modificari nepublicate (in ciorna)? */
  const areNesalvate = useCallback((nod: NodContinut): boolean => {
    const m = inCiorna.magazin;
    if (nod === NOD_STIL && (m.logo_url !== undefined || m.primary_color !== undefined)) return true;
    if (nod === "hero" && m.cover_url !== undefined) return true;
    if (nod === "galerie" && m.gallery !== undefined) return true;
    return (CHEI_CONTINUT[nod] ?? []).some((cheie) => cheie in inCiorna.pc);
  }, [inCiorna]);

  // ── Identitatea: logo, favicon, culoare ──
  /** Fisierul local cat se urca; dupa, adresa din ciorna. */
  const [logoLocal, setLogoLocal] = useState<string | null>(null);
  const [faviconLocal, setFaviconLocal] = useState<string | null>(null);
  const logo: Imagine = {
    previzualizare: logoLocal ?? (inCiorna.magazin.logo_url !== undefined ? inCiorna.magazin.logo_url : continutPublicat.magazin.logo_url),
    fisier: null,
  };
  const favicon: Imagine = { previzualizare: faviconLocal ?? ((pc.favicon_url as string | null | undefined) ?? null), fisier: null };

  const setLogo = useCallback((v: Imagine) => {
    if (!v.fisier) {
      aplicaContinut((c) => cuColoanele(c, { logo_url: v.previzualizare }, publicatAcum.current), "logo");
      return;
    }
    setLogoLocal(v.previzualizare);
    void urca(v.fisier, "logos").then((url) => {
      setLogoLocal(null);
      // Urcarea cazuta pastreaza logo-ul de dinainte, nu il sterge.
      if (!url) { toast.error("Nu am putut încărca logo-ul. Încearcă din nou."); return; }
      aplicaContinut((c) => cuColoanele(c, { logo_url: url }, publicatAcum.current), "logo");
    });
  }, [aplicaContinut]);

  const setFavicon = useCallback((v: Imagine) => {
    if (!v.fisier) {
      aplicaContinut((c) => cuCheilePc(c, { favicon_url: v.previzualizare }, publicatAcum.current), "favicon");
      return;
    }
    setFaviconLocal(v.previzualizare);
    void urcaFavicon(v.fisier).then((url) => {
      setFaviconLocal(null);
      if (!url) { toast.error("Nu am putut încărca iconița. Încearcă din nou."); return; }
      aplicaContinut((c) => cuCheilePc(c, { favicon_url: url }, publicatAcum.current), "favicon");
    });
  }, [aplicaContinut]);

  /** Doar un cod complet (`#RRGGBB`) intra in ciorna; panoul tine textul pe jumatate scris. */
  const setCuloare = useCallback((v: string) => {
    if (!HEX.test(v)) return;
    aplicaContinut((c) => cuColoanele(c, { primary_color: v }, publicatAcum.current), "culoare");
  }, [aplicaContinut]);

  // ── Bannerele hero-ului ──
  const coperta = inCiorna.magazin.cover_url !== undefined ? inCiorna.magazin.cover_url : continutPublicat.magazin.cover_url;
  /** Cele din ciorna (sau publicate), cu coperta veche cand magazinul n-are inca bannere. */
  const bannereCiorna = useMemo<BannerItem[]>(() => {
    const urls = listaDeSiruri(pc.hero_banners);
    const linkuri = Array.isArray(pc.hero_banner_links) ? pc.hero_banner_links : [];
    const lista = (urls.length ? urls : coperta ? [coperta] : []).slice(0, 5);
    return lista.map((url, i) => ({ id: `b${i}-${url}`, url, file: null, link: typeof linkuri[i] === "string" ? linkuri[i] : "" }));
  }, [pc.hero_banners, pc.hero_banner_links, coperta]);
  /** Cele alese din calculator, cat se urca: se vad la coada listei. */
  const [inUrcare, setInUrcare] = useState<BannerItem[]>([]);
  const inUrcareAcum = useRef(inUrcare);
  useEffect(() => { inUrcareAcum.current = inUrcare; }, [inUrcare]);
  const bannere = useMemo(() => [...bannereCiorna, ...inUrcare], [bannereCiorna, inUrcare]);
  const bannereAcum = useRef(bannere);
  useEffect(() => { bannereAcum.current = bannere; }, [bannere]);

  /** Lista urcata intra in ciorna: adresele, linkurile si coperta (primul banner), ca la salvarea de pana acum. */
  const scrieBannerele = useCallback((gata: BannerItem[]) => {
    const urls = gata.map((b) => b.url);
    const linkuri = gata.map((b) => (b.link ?? "").trim());
    aplicaContinut((c) => {
      const publicat = publicatAcum.current;
      const cuLista = cuCheilePc(c, { hero_banners: urls, hero_banner_links: linkuri }, publicat);
      return cuColoanele(cuLista, { cover_url: urls[0] ?? null }, publicat);
    }, "bannere");
  }, [aplicaContinut]);

  const setBannere = useCallback((fn: (b: BannerItem[]) => BannerItem[]) => {
    const urmatoarele = fn(bannereAcum.current);
    scrieBannerele(urmatoarele.filter((b) => !b.file));
    const deUrcat = urmatoarele.filter((b) => b.file);
    const noi = deUrcat.filter((b) => !inUrcareAcum.current.some((x) => x.id === b.id));
    setInUrcare(deUrcat);
    for (const b of noi) {
      void urca(b.file as File, "covers").then((url) => {
        // Scos intre timp din lista: rezultatul nu mai are unde merge.
        if (!inUrcareAcum.current.some((x) => x.id === b.id)) return;
        const ramas = inUrcareAcum.current.find((x) => x.id === b.id);
        setInUrcare((l) => l.filter((x) => x.id !== b.id));
        if (!url) { toast.error("Nu am putut încărca bannerul. Încearcă din nou."); return; }
        scrieBannerele([...bannereAcum.current.filter((x) => !x.file), { ...b, url, file: null, link: ramas?.link ?? b.link }]);
      });
    }
  }, [scrieBannerele]);

  // ── Galeria ──
  const galerie = inCiorna.magazin.gallery ?? continutPublicat.magazin.gallery;
  const galerieAcum = useRef(galerie);
  useEffect(() => { galerieAcum.current = galerie; }, [galerie]);
  const setGalerie = useCallback((fn: (g: string[]) => string[]) => {
    const urmatoarea = fn(galerieAcum.current);
    aplicaContinut((c) => cuColoanele(c, { gallery: urmatoarea }, publicatAcum.current), "galerie");
  }, [aplicaContinut]);

  /** Modifica pe loc: adaugarea si stergerea unui rand de produse. Din etapa 6, tot in ciorna. */
  const seteazaSiSalveaza = useCallback(async (nod: NodContinut, actualizare: (p: ContinutPagina) => ContinutPagina): Promise<boolean> => {
    seteaza(nod, actualizare);
    return true;
  }, [seteaza]);

  // ── Vizibilitatea magazinului: ramane pe loc, nu e o modificare de continut ──
  const [publicat, setPublicat] = useState(magazin.is_published);
  const [publicareInCurs, setPublicareInCurs] = useState(false);
  const comutaPublicarea = useCallback(async () => {
    setPublicareInCurs(true);
    let r: Awaited<ReturnType<typeof updateBusiness>>;
    try {
      r = await updateBusiness(magazin.id, { is_published: !publicat });
    } catch {
      setPublicareInCurs(false);
      toast.error("Nu am primit răspuns de la server. Reîncarcă pagina ca să vezi starea magazinului.");
      return;
    }
    setPublicareInCurs(false);
    if ("error" in r && r.error) { toast.error(r.error); return; }
    setPublicat(!publicat);
    toast.success(publicat ? "Magazinul a fost ascuns. Clienții nu îl mai pot vedea." : "Magazinul este acum vizibil pentru clienți.");
  }, [magazin.id, publicat]);

  return {
    pc,
    seteaza,
    areNesalvate,
    /** O imagine inca se urca: plecata acum, nu ajunge in ciorna. */
    incarc: logoLocal !== null || faviconLocal !== null || inUrcare.length > 0,
    logo,
    setLogo,
    favicon,
    setFavicon,
    culoare,
    setCuloare,
    bannere,
    setBannere,
    galerie,
    setGalerie,
    publicat,
    publicareInCurs,
    comutaPublicarea,
    seteazaSiSalveaza,
  };
}

export type ContinutMagazin = ReturnType<typeof useContinutMagazin>;
