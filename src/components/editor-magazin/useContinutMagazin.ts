"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { updateBusiness } from "@/lib/actions/business.actions";
import { updatePageContent } from "@/lib/actions/store.actions";
import { cheiSchimbate, doarCheile, scoateCheileConfirmate } from "@/components/editor/chei-atinse";
import { continutInitial, type ContinutPagina } from "@/lib/editor-magazin/continut";
import { NOD_STIL, type FelContinut } from "@/lib/editor-magazin/noduri";

/**
 * Continutul magazinului in editorul unic: textele, listele si imaginile care
 * stau in `page_content` si in `businesses`.
 *
 * Mutat din editorul vechi (`StoreEditor`, scos in etapa 2), cu regulile lui:
 *
 *  - Fiecare nod trimite DOAR cheile pe care le-a atins (`chei-atinse.ts`). Un
 *    comutator atins din curiozitate in alt nod nu pleaca in magazin odata cu el.
 *  - Salvarea citeste starea de ACUM, nu cea din clipa clicului: logo-ul si
 *    bannerele se urca intai, deci trec secunde in care omul mai schimba ceva.
 *  - Ce s-a modificat cat timp se salva ramane de trimis.
 *
 * Spre deosebire de design, continutul nu are ciorna: se salveaza in magazin.
 */

export type NodContinut = FelContinut | typeof NOD_STIL;

export interface BannerItem { id: string; url: string; file: File | null; link?: string }

export interface MagazinPentruContinut {
  id: string;
  logo_url: string | null;
  cover_url: string | null;
  primary_color: string | null;
  is_published: boolean;
  gallery: unknown;
}

/** Ce se schimba in magazin dupa o salvare reusita: din asta se re-deriva designul. */
export interface SalvareContinut {
  pageContent: Record<string, unknown>;
  primaryColor: string | null;
  coverUrl: string | null;
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

export function useContinutMagazin({
  magazin,
  pageContentInitial,
  onSalvat,
}: {
  magazin: MagazinPentruContinut;
  pageContentInitial: Record<string, unknown>;
  /** Chemata dupa fiecare salvare reusita, cu continutul ASA CUM E ACUM IN BAZA. */
  onSalvat: (s: SalvareContinut) => void;
}) {
  const culoareInitiala = magazin.primary_color ?? "#07c527";
  const [pc, setPcBrut] = useState<ContinutPagina>(() => continutInitial(pageContentInitial as ContinutPagina, culoareInitiala));
  /**
   * Continutul de pe ecran, citibil dupa un `await` si scris ODATA cu starea, la
   * fiecare scriere. Printr-un efect ar fi ramas in urma o randare: o salvare
   * pornita imediat dupa o modificare ar fi trimis continutul de dinainte.
   */
  const pcAcum = useRef(pc);
  const scrie = useCallback((urmator: ContinutPagina) => {
    pcAcum.current = urmator;
    setPcBrut(urmator);
  }, []);

  /**
   * Continutul asa cum e IN BAZA, din care se re-deriva designul.
   *
   * Nu starea de pe ecran: o modificare nesalvata dintr-un alt nod nu e in
   * magazin, deci nici ciorna nu are voie sa fie derivata din ea.
   */
  const inBaza = useRef<Record<string, unknown>>({ ...pageContentInitial });
  const culoareInBaza = useRef<string | null>(magazin.primary_color);
  const copertaInBaza = useRef<string | null>(magazin.cover_url);
  const logoInBaza = useRef<string | null>(magazin.logo_url);

  /** Ce cheie a atins fiecare nod: sursa salvarii, mutata in pasi (`chei-atinse.ts`). */
  const cheiAtinse = useRef<Record<string, Set<string>>>({});
  /**
   * Cate chei nesalvate are fiecare nod, IN STARE: din ea se deseneaza punctele
   * „nesalvat”. Ref-ul de mai sus nu se citeste in randare.
   */
  const [numarAtinse, setNumarAtinse] = useState<Record<string, number>>({});
  const oglindeste = useCallback(() => {
    setNumarAtinse(Object.fromEntries(Object.entries(cheiAtinse.current).map(([n, set]) => [n, set.size])));
  }, []);
  const [seSalveaza, setSeSalveaza] = useState<NodContinut | null>(null);
  const [salvatAcum, setSalvatAcum] = useState<NodContinut | null>(null);

  // ── Identitatea: logo, favicon, culoare ──
  const [logo, setLogo] = useState<{ previzualizare: string | null; fisier: File | null }>({ previzualizare: magazin.logo_url, fisier: null });
  const [favicon, setFavicon] = useState<{ previzualizare: string | null; fisier: File | null }>({
    previzualizare: (pageContentInitial.favicon_url as string | null | undefined) ?? null, fisier: null,
  });
  const [culoare, setCuloare] = useState(culoareInitiala);
  const [identitateAtinsa, setIdentitateAtinsa] = useState(false);

  // ── Bannerele hero-ului ──
  const bannereInitiale = (): BannerItem[] => {
    const urls = listaDeSiruri(pageContentInitial.hero_banners);
    const linkuri = Array.isArray(pageContentInitial.hero_banner_links) ? pageContentInitial.hero_banner_links : [];
    const lista = (urls.length ? urls : magazin.cover_url ? [magazin.cover_url] : []).slice(0, 5);
    return lista.map((url, i) => ({ id: `init-${i}`, url, file: null, link: typeof linkuri[i] === "string" ? linkuri[i] : "" }));
  };
  const [bannere, setBannereBrut] = useState<BannerItem[]>(bannereInitiale);
  const [bannereAtinse, setBannereAtinse] = useState(false);

  // ── Galeria ──
  const [galerie, setGalerieBrut] = useState<string[]>(() => listaDeSiruri(magazin.gallery));
  const [galerieAtinsa, setGalerieAtinsa] = useState(false);

  // ── Vizibilitatea magazinului ──
  const [publicat, setPublicat] = useState(magazin.is_published);
  const [publicareInCurs, setPublicareInCurs] = useState(false);

  /** Scrie in continut si noteaza nodul care a facut-o. */
  const seteaza = useCallback((nod: NodContinut, actualizare: (p: ContinutPagina) => ContinutPagina) => {
    const inainte = pcAcum.current;
    const urmator = actualizare(inainte);
    if (urmator === inainte) return;
    scrie(urmator);
    const set = (cheiAtinse.current[nod] ??= new Set<string>());
    for (const cheie of cheiSchimbate(inainte as Record<string, unknown>, urmator as Record<string, unknown>)) set.add(cheie);
    oglindeste();
  }, [scrie, oglindeste]);

  type Imagine = { previzualizare: string | null; fisier: File | null };
  const setLogoAtins = useCallback((v: Imagine) => { setLogo(v); setIdentitateAtinsa(true); }, []);
  const setFaviconAtins = useCallback((v: Imagine) => { setFavicon(v); setIdentitateAtinsa(true); }, []);
  const setCuloareAtinsa = useCallback((v: string) => { setCuloare(v); setIdentitateAtinsa(true); }, []);
  const setBannere = useCallback((fn: (b: BannerItem[]) => BannerItem[]) => { setBannereBrut(fn); setBannereAtinse(true); }, []);
  const setGalerie = useCallback((fn: (g: string[]) => string[]) => { setGalerieBrut(fn); setGalerieAtinsa(true); }, []);

  /** Are nodul modificari care nu sunt inca in magazin? */
  const areNesalvate = useCallback((nod: NodContinut): boolean => {
    if (nod === NOD_STIL && identitateAtinsa) return true;
    if (nod === "hero" && bannereAtinse) return true;
    if (nod === "galerie" && galerieAtinsa) return true;
    return (numarAtinse[nod] ?? 0) > 0;
  }, [numarAtinse, identitateAtinsa, bannereAtinse, galerieAtinsa]);

  // Iesirea cu continut nesalvat merita un avertisment, ca la design.
  const areOrice = identitateAtinsa || bannereAtinse || galerieAtinsa || Object.values(numarAtinse).some((n) => n > 0);
  useEffect(() => {
    if (!areOrice) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [areOrice]);

  const anuntaSalvarea = useCallback((nod: NodContinut, trimisInBaza: Record<string, unknown>) => {
    inBaza.current = { ...inBaza.current, ...trimisInBaza };
    setSalvatAcum(nod);
    setTimeout(() => setSalvatAcum((n) => (n === nod ? null : n)), 2000);
    onSalvat({ pageContent: inBaza.current, primaryColor: culoareInBaza.current, coverUrl: copertaInBaza.current });
  }, [onSalvat]);

  /** Trimite cheile atinse ale nodului, si numai pe ele. */
  const salveazaChei = useCallback(async (nod: NodContinut, inPlus: Record<string, unknown> = {}): Promise<boolean> => {
    const chei = (cheiAtinse.current[nod] ??= new Set<string>());
    const trimis = { ...doarCheile(pcAcum.current as Record<string, unknown>, chei), ...inPlus };
    if (Object.keys(trimis).length === 0) return true;
    let r: Awaited<ReturnType<typeof updatePageContent>>;
    try {
      r = await updatePageContent(magazin.id, trimis);
    } catch {
      toast.error("Nu am primit răspuns de la server, deci nu știm dacă s-a salvat. Reîncarcă pagina înainte să salvezi din nou.");
      return false;
    }
    if ("error" in r) { toast.error(r.error); return false; }
    // Doar cheile ajunse in baza cu valoarea de ACUM: ce s-a schimbat intre timp ramane de trimis.
    scoateCheileConfirmate(chei, trimis, pcAcum.current as Record<string, unknown>);
    oglindeste();
    anuntaSalvarea(nod, trimis);
    return true;
  }, [magazin.id, anuntaSalvarea, oglindeste]);

  /** Logo, favicon si culoare (in `businesses`), plus cheile nodului „stil”. */
  const salveazaIdentitate = useCallback(async () => {
    // Urcarea cazuta pastreaza logo-ul din baza, nu il sterge.
    let logoUrl: string | null = logo.previzualizare;
    if (logo.fisier) logoUrl = (await urca(logo.fisier, "logos")) ?? logoInBaza.current;
    else if (logoUrl?.startsWith("blob:")) logoUrl = logoInBaza.current;

    let faviconUrl: string | null = favicon.previzualizare;
    if (favicon.fisier) faviconUrl = await urcaFavicon(favicon.fisier);

    const culoareDeSalvat = /^#[0-9A-Fa-f]{6}$/.test(culoare) ? culoare : culoareInBaza.current ?? "#07c527";
    let r: Awaited<ReturnType<typeof updateBusiness>>;
    try {
      r = await updateBusiness(magazin.id, { logo_url: logoUrl, primary_color: culoareDeSalvat });
    } catch {
      toast.error("Nu am primit răspuns de la server, deci nu știm dacă s-a salvat. Reîncarcă pagina înainte să salvezi din nou.");
      return;
    }
    if ("error" in r && r.error) { toast.error(r.error); return; }
    culoareInBaza.current = culoareDeSalvat;
    logoInBaza.current = logoUrl;
    setLogo({ previzualizare: logoUrl, fisier: null });
    setFavicon({ previzualizare: faviconUrl, fisier: null });
    setIdentitateAtinsa(false);
    // `favicon_url` traieste in `page_content`: se scrie odata cu cheile nodului.
    const ok = await salveazaChei(NOD_STIL, { favicon_url: faviconUrl });
    // ⚠ Si in copia din ecran, nu doar in miniatura: altfel o salvare viitoare
    // a nodului ar fi trimis valoarea veche peste cea tocmai urcata.
    if (ok) scrie({ ...pcAcum.current, favicon_url: faviconUrl });
  }, [logo, favicon, culoare, magazin.id, salveazaChei, scrie]);

  /** Bannerele hero-ului: se urca cele noi, in ordine, cu linkurile lor. */
  const salveazaBannere = useCallback(async () => {
    const urls: string[] = [];
    const linkuri: string[] = [];
    for (const b of bannere) {
      const url = b.file ? await urca(b.file, "covers") : b.url;
      if (url) { urls.push(url); linkuri.push((b.link ?? "").trim()); }
    }
    const coperta = urls[0] ?? null;
    let r: Awaited<ReturnType<typeof updateBusiness>>;
    try {
      r = await updateBusiness(magazin.id, { cover_url: coperta });
    } catch {
      toast.error("Nu am primit răspuns de la server, deci nu știm dacă s-a salvat. Reîncarcă pagina înainte să salvezi din nou.");
      return;
    }
    if ("error" in r && r.error) { toast.error(r.error); return; }
    copertaInBaza.current = coperta;
    const ok = await salveazaChei("hero", { hero_banners: urls, hero_banner_links: linkuri });
    if (!ok) return;
    setBannereBrut(urls.map((url, i) => ({ id: `salvat-${i}`, url, file: null, link: linkuri[i] ?? "" })));
    setBannereAtinse(false);
    scrie({ ...pcAcum.current, hero_banners: urls, hero_banner_links: linkuri });
  }, [bannere, magazin.id, salveazaChei, scrie]);

  /** Imaginile galeriei (`businesses.gallery`). */
  const salveazaGaleria = useCallback(async () => {
    let r: Awaited<ReturnType<typeof updateBusiness>>;
    try {
      r = await updateBusiness(magazin.id, { gallery: galerie });
    } catch {
      toast.error("Nu am primit răspuns de la server, deci nu știm dacă s-a salvat. Reîncarcă pagina înainte să salvezi din nou.");
      return;
    }
    if ("error" in r && r.error) { toast.error(r.error); return; }
    setGalerieAtinsa(false);
    anuntaSalvarea("galerie", {});
  }, [galerie, magazin.id, anuntaSalvarea]);

  /**
   * Modifica si salveaza pe loc: pentru adaugarea si stergerea unui rand de
   * produse, care nu au sens ca modificari „nesalvate”.
   *
   * ⚠ Ref-ul se scrie AICI, nu prin efect. Efectul care il tine la zi ruleaza
   * dupa desenare, deci o salvare pornita imediat dupa `seteaza` ar fi citit
   * continutul de dinainte: randul sters ar fi plecat in baza tot in lista.
   */
  const seteazaSiSalveaza = useCallback(async (nod: NodContinut, actualizare: (p: ContinutPagina) => ContinutPagina): Promise<boolean> => {
    const inainte = pcAcum.current;
    const urmator = actualizare(inainte);
    scrie(urmator);
    const set = (cheiAtinse.current[nod] ??= new Set<string>());
    for (const cheie of cheiSchimbate(inainte as Record<string, unknown>, urmator as Record<string, unknown>)) set.add(cheie);
    oglindeste();
    setSeSalveaza(nod);
    try {
      return await salveazaChei(nod);
    } finally {
      setSeSalveaza(null);
    }
  }, [salveazaChei, scrie, oglindeste]);

  /** Salveaza nodul, pe drumul potrivit lui. */
  const salveaza = useCallback(async (nod: NodContinut) => {
    setSeSalveaza(nod);
    try {
      if (nod === NOD_STIL) await salveazaIdentitate();
      else if (nod === "hero") await salveazaBannere();
      else if (nod === "galerie") await salveazaGaleria();
      else await salveazaChei(nod);
    } finally {
      setSeSalveaza(null);
    }
  }, [salveazaIdentitate, salveazaBannere, salveazaGaleria, salveazaChei]);

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
    oriceNesalvat: areOrice,
    salveaza,
    seSalveaza,
    salvatAcum,
    logo,
    setLogo: setLogoAtins,
    favicon,
    setFavicon: setFaviconAtins,
    culoare,
    setCuloare: setCuloareAtinsa,
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
