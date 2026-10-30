"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { cdnImage } from "@/lib/cdn-image";
import { menuItemHref } from "@/lib/pages/menu";
import { isExternalHref, resolveHref } from "@/lib/pages/href";
import { aboneazaNewsletter } from "@/lib/actions/page.actions";
import { radaciniCategorii } from "@/lib/storefront/categories-chrome";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { useStoreChrome, useStorefrontOptional } from "@/components/storefront/StorefrontProvider";
import type { BlockInstance } from "@/lib/storefront/design/types";

/**
 * Ce au in comun coloanele subsolului pe ambele asezari (pe coloane si centrat), etapa 11 din
 * `docs/editor-magazin/PLAN.md`: linkurile unei coloane dupa sursa ei, imaginea, newsletterul.
 *
 * Textele de aici sunt ale magazinului, deci fara diacritice, ca restul subsolului.
 */

/** Un text din reglaje, curatat de spatii; altceva decat text = gol. */
export const sir = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export interface LinkSubsol {
  cheie: string;
  href: string;
  eticheta: string;
  extern?: boolean;
}

/**
 * Linkurile unei coloane „Linkuri”: categoriile (cu „Toate produsele” in fata), paginile din meniu, sau cele alese
 * de om. Categoriile vin din catalogul paginii cand exista, altfel din lista adusa pentru subsol: fara a doua sursa,
 * coloana ar fi fost goala peste tot in afara paginii de magazin.
 */
export function useLinkuriColoanei(coloana: BlockInstance): LinkSubsol[] {
  const { basePath, catalogRoot, categoriiRoot, categoriiPePagina, menu, searchCategories } = useStoreChrome();
  const catalog = useStorefrontOptional();
  if (coloana.type !== "linkuri") return [];
  const s = coloana.settings;
  if (s.sursa === "categorii") {
    const cate = typeof s.cate === "number" ? s.cate : 6;
    const categorii = (
      catalog?.rootCategoryItems.map((c) => ({ key: c.key, name: c.name })) ??
      radaciniCategorii(searchCategories).map((c) => ({ key: c.key, name: c.name }))
    ).slice(0, cate);
    return [
      // Catalogul, nu radacina magazinului: `catalogRoot` vine deja fara slash final, deci linkul nu mai ia un 308.
      ...(s.toateProdusele !== false ? [{ cheie: "toate-produsele", href: catalogRoot, eticheta: "Toate produsele" }] : []),
      ...categorii.map((c) => ({ cheie: c.key, href: hrefCategorie(categoriiRoot, c.name, categoriiPePagina), eticheta: c.name })),
    ];
  }
  if (s.sursa === "pagini") {
    return menu
      .filter((m) => m.type === "page" || m.type === "link")
      .map((it) => ({ cheie: it.id, href: menuItemHref(it, basePath, categoriiRoot), eticheta: it.label }));
  }
  // Alese de om: adresele raman relative la magazin pana aici (`resolveHref`), ca la blocurile paginilor.
  const alese = Array.isArray(s.linkuri) ? s.linkuri : [];
  return alese.flatMap((l, i) => {
    const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
    const adresa = sir(o.adresa);
    if (!adresa) return [];
    return [{ cheie: `l${i}`, href: resolveHref(adresa, basePath), eticheta: sir(o.eticheta) || adresa, extern: isExternalHref(adresa) }];
  });
}

/** Ce se vede DOAR in editor in locul unei coloane goale: in magazin coloana dispare, aici trebuie gasita si aleasa. */
export function MesajGol({ cls, children }: { cls: string; children: ReactNode }) {
  return <p className={`${cls} italic`}>{children}</p>;
}

/** Coloana „Imagine”: latimea aleasa, cel mult cat coloana; cu link, cand are. `gol` = clasa mesajului din editor. */
export function ImagineSubsol({ coloana, gol }: { coloana: BlockInstance; gol: string | null }) {
  const { basePath } = useStoreChrome();
  const s = coloana.settings;
  const url = sir(s.imagine);
  if (!url) return gol ? <MesajGol cls={gol}>Alege imaginea din panou.</MesajGol> : null;
  const latime = typeof s.latime === "number" ? s.latime : 160;
  const link = sir(s.link);
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={cdnImage(url, Math.min(640, latime * 2))} alt={sir(s.alt)} style={{ width: latime, maxWidth: "100%" }} className="h-auto object-contain rounded-md" />;
  if (!link) return img;
  return (
    <a href={resolveHref(link, basePath)} {...(isExternalHref(link) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-block hover:opacity-80 transition-opacity">
      {img}
    </a>
  );
}

/**
 * Coloana „Newsletter”: emailul, acordul (cerut si pe server), butonul. Abonarea trece prin `aboneazaNewsletter`, care
 * cauta coloana in subsolul PUBLICAT (`blocDinMagazin`), nu crede cererea: mesajul ajunge in „Mesaje”, cu locul
 * „Subsol”, si la furnizorul conectat. In editor nu se trimite nimic (previzualizarea opreste oricum formularele).
 */
export function FormularNewsletterSubsol({ coloana, idSubsol, marunt, inchis, centrat = false }: {
  coloana: BlockInstance;
  idSubsol: string;
  marunt: string;
  inchis: boolean;
  centrat?: boolean;
}) {
  const { business, esteEditorDesign } = useStoreChrome();
  const [email, setEmail] = useState("");
  const [acord, setAcord] = useState(false);
  const [capcana, setCapcana] = useState("");
  const [trimit, setTrimit] = useState(false);
  const [gata, setGata] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);
  const buton = sir(coloana.settings.buton) || "Aboneaza-ma";

  async function trimite(e: FormEvent) {
    e.preventDefault();
    if (esteEditorDesign || trimit) return;
    if (!acord) { setEroare("Bifeaza acordul ca sa te poti abona."); return; }
    setTrimit(true);
    setEroare(null);
    try {
      const r = await aboneazaNewsletter({ businessId: business.id, blockId: coloana.id, cale: idSubsol, email, acord, honeypot: capcana });
      if ("error" in r) setEroare(r.error);
      else setGata(true);
    } catch {
      setEroare("Nu am putut trimite. Incearca din nou.");
    } finally {
      setTrimit(false);
    }
  }

  if (gata) return <p className={`mt-3 text-[13px] font-medium ${centrat ? "text-center" : ""}`}>Multumim, te-ai abonat.</p>;

  const camp = inchis
    ? "border-[var(--st-footer-text)]/20 bg-transparent text-[var(--st-footer-text)] placeholder:text-[var(--st-footer-text)]/40"
    : "border-[var(--st-border)] bg-[var(--st-bg)] text-[var(--st-text)] placeholder:text-[var(--st-muted)]";
  return (
    <form onSubmit={trimite} className={`mt-3 space-y-2 ${centrat ? "w-full max-w-sm" : ""}`} noValidate>
      <div className="flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresa ta de email"
          aria-label="Adresa ta de email" autoComplete="email"
          className={`min-w-0 flex-1 h-10 px-3 rounded-[var(--st-radius-btn)] border text-sm outline-none focus:ring-2 focus:ring-[var(--st-primary)]/30 ${camp}`} />
        <button type="submit" disabled={trimit}
          className="shrink-0 h-10 px-4 rounded-[var(--st-radius-btn)] text-sm font-semibold bg-[var(--st-primary)] text-[var(--st-primary-contrast)] hover:opacity-90 disabled:opacity-60 transition-opacity">
          {buton}
        </button>
      </div>
      <label className={`flex items-start gap-2 text-[11px] leading-snug text-left ${marunt}`}>
        <input type="checkbox" checked={acord} onChange={(e) => setAcord(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded accent-[var(--st-primary)]" />
        <span>Sunt de acord sa primesc emailuri cu noutati si oferte. Te poti dezabona oricand.</span>
      </label>
      {/* Capcana pentru roboti: oamenii nu o vad, deci n-o completeaza. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={capcana} onChange={(e) => setCapcana(e.target.value)}
        aria-hidden="true" className="hidden" />
      {eroare && <p role="alert" className="text-[11px] font-medium text-red-500">{eroare}</p>}
    </form>
  );
}
