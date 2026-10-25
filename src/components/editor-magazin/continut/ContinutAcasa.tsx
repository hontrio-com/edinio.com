"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Upload, X } from "lucide-react";
import { MediaPicker } from "@/components/media/MediaPicker";
import { ProductPicker } from "@/components/pages/ProductPicker";
import { MAX_ORDINE_MANUALA, type ModAsezare, type ModRest } from "@/lib/storefront/asezare";
import { MAX_HERO_BANNERS } from "@/lib/storefront/design/hero-banners";
import type { ContinutMagazin } from "../useContinutMagazin";
import { EditorCarduri, EditorElemente, EditorRecenzii } from "./liste";
import { BaraSalvare, Grup, Nota, RandComutator, inputCls, inputMicCls } from "./ui";

/**
 * Continutul sectiunilor paginii principale, fiecare sub nodul ei.
 *
 * Mutat din „Identitate vizuala” (bannerele) si „Pagina principala” ale
 * editorului vechi. Comutatoarele de pornire ale sectiunilor n-au venit odata cu
 * continutul: vizibilitatea o da ochiul din arbore (`PLAN.md`, decizia 2).
 */

/** Numele omenesc al fiecarei asezari, pentru eticheta „Implicit (…)”. */
const ETICHETE_ASEZARE: Record<string, string> = {
  newest: "cele mai noi",
  price_asc: "preț crescător",
  price_desc: "preț descrescător",
  name_asc: "alfabetic A-Z",
  popular: "recomandate primele",
};

export function ContinutHero({ continut }: { continut: ContinutMagazin }) {
  const { bannere, setBannere } = continut;
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerDeschis, setPickerDeschis] = useState(false);
  const idNou = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const muta = (id: string, dir: -1 | 1) => setBannere((l) => {
    const i = l.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.length) return l;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  return (
    <div className="space-y-5">
      <Grup titlu={`Bannere (maximum ${MAX_HERO_BANNERS})`}>
        {bannere.map((b, i) => (
          <div key={b.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 h-24 rounded-lg overflow-hidden border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.url} alt="" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" aria-label="Mută sus" disabled={i === 0} onClick={() => muta(b.id, -1)}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Mută jos" disabled={i === bannere.length - 1} onClick={() => muta(b.id, 1)}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Șterge bannerul" onClick={() => setBannere((l) => l.filter((x) => x.id !== b.id))}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-red-500 hover:bg-red-50">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <input type="text" value={b.link ?? ""} className={inputMicCls} aria-label={`Linkul bannerului ${i + 1}`}
              placeholder="Link la apăsare (opțional): /produse, /contact sau https://..."
              onChange={(e) => setBannere((l) => l.map((x) => (x.id === b.id ? { ...x, link: e.target.value } : x)))} />
          </div>
        ))}
        {bannere.length < MAX_HERO_BANNERS && (
          <>
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-full h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:bg-primary/5 transition-colors">
              <Upload className="h-4 w-4" />
              <span className="text-xs">Adaugă banner ({bannere.length}/{MAX_HERO_BANNERS})</span>
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" aria-label="Încarcă un banner"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setBannere((l) => (l.length >= MAX_HERO_BANNERS ? l : [...l, { id: idNou(), url: URL.createObjectURL(f), file: f }]));
                e.target.value = "";
              }} />
            <button type="button" onClick={() => setPickerDeschis(true)} className="text-[11px] font-medium text-primary hover:text-primary/80">
              Alege din Biblioteca Media
            </button>
            <MediaPicker open={pickerDeschis} onClose={() => setPickerDeschis(false)} multiple accept="image" bucket="covers"
              excludeUrls={bannere.map((b) => b.url)}
              onSelect={(urls) => setBannere((l) => [...l, ...urls.map((url) => ({ id: idNou(), url, file: null, link: "" }))].slice(0, MAX_HERO_BANNERS))} />
          </>
        )}
        <p className="text-[10px] text-muted-foreground">Recomandat 16:9 (de exemplu 1920x1080). Cu mai multe bannere, se afișează ca un carusel.</p>
      </Grup>
      <Nota>Cum arată hero-ul (doar imagini, text peste imagine, cu categorii) alegi mai sus, la Design.</Nota>
      <BaraSalvare continut={continut} nod="hero" />
    </div>
  );
}

export function ContinutUsp({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;
  return (
    <div className="space-y-5">
      <Grup titlu="Cardurile benzii">
        <EditorCarduri carduri={pc.store_trust_badges ?? []}
          onSchimba={(c) => seteaza("usp", (p) => ({ ...p, store_trust_badges: c }))} />
      </Grup>
      <BaraSalvare continut={continut} nod="usp" />
    </div>
  );
}

export function ContinutCautare({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;
  return (
    <div className="space-y-5">
      <RandComutator titlu="Sortare" ajutor="Lista „Cele mai noi / Preț crescător...”. Pagina Magazin nu e afectată."
        pornit={pc.sort_options?.enabled !== false}
        onSchimba={(v) => seteaza("cautare", (p) => ({ ...p, sort_options: { ...p.sort_options, enabled: v } }))} />
      <RandComutator titlu="Filtre" ajutor="Butonul „Filtre” și panoul lui. Pagina Magazin nu e afectată."
        pornit={pc.filter_options?.enabled !== false}
        onSchimba={(v) => seteaza("cautare", (p) => ({ ...p, filter_options: { enabled: v } }))} />
      <BaraSalvare continut={continut} nod="cautare" />
    </div>
  );
}

export function ContinutRecomandate({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;
  return (
    <div className="space-y-5">
      <Grup titlu="Titlul rândului">
        <input type="text" value={pc.featured_section_title ?? "Recomandate"} className={inputCls} aria-label="Titlul rândului Recomandate"
          placeholder="Recomandate" onChange={(e) => seteaza("recomandate", (p) => ({ ...p, featured_section_title: e.target.value }))} />
      </Grup>
      <Nota href="/dashboard/products" eticheta="Mergi la Produse">
        În rând apar produsele marcate „Popular”. Le marchezi din lista de produse.
      </Nota>
      <BaraSalvare continut={continut} nod="recomandate" />
    </div>
  );
}

export function ContinutCatalog({ continut, businessId }: { continut: ContinutMagazin; businessId: string }) {
  const { pc, seteaza } = continut;
  const ordine = pc.home_order ?? {};
  const pune = (patch: Partial<NonNullable<typeof pc.home_order>>) => seteaza("catalog", (p) => ({ ...p, home_order: { ...p.home_order, ...patch } }));
  return (
    <div className="space-y-5">
      <Grup titlu="Așezarea produselor">
        <p className="text-[11px] text-muted-foreground">
          În ce ordine se văd produsele pe prima pagină. Vizitatorul poate alege oricând altfel, din lista de sortare. Pagina Magazin nu e afectată.
        </p>
        <select value={ordine.mod ?? ""} className={inputCls} aria-label="Așezarea produselor"
          onChange={(e) => pune({ mod: e.target.value as ModAsezare })}>
          {/* „Implicit” cade pe `sort_options.default_sort`, care nu e la toti „cele mai noi”. */}
          <option value="">Implicit ({ETICHETE_ASEZARE[pc.sort_options?.default_sort ?? "newest"] ?? "cele mai noi"})</option>
          <option value="newest">Cele mai noi</option>
          <option value="price_asc">Preț crescător</option>
          <option value="price_desc">Preț descrescător</option>
          <option value="name_asc">Alfabetic A-Z</option>
          <option value="popular">Recomandate primele</option>
          <option value="random">Amestecat</option>
          <option value="manual">Ordinea mea</option>
        </select>
        {ordine.mod === "random" && (
          <p className="text-[10px] text-muted-foreground p-2 bg-muted/40 rounded-lg">
            Ordinea se schimbă o dată pe zi și e aceeași pentru toți vizitatorii cât ține ziua. Așa produsele se rotesc, dar pagina 2 arată mai departe ce trebuie.
          </p>
        )}
        {ordine.mod === "manual" && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground">Produsele alese aici apar primele, în ordinea de mai jos. Restul catalogului vine după ele.</p>
            <ProductPicker businessId={businessId} reordonabil maxim={MAX_ORDINE_MANUALA}
              selectedIds={ordine.ids ?? []} onChange={(ids) => pune({ ids })} />
            <label className="block">
              <span className="text-[10px] font-medium text-muted-foreground block mb-1">Restul produselor</span>
              <select value={ordine.rest ?? "newest"} className={inputMicCls} onChange={(e) => pune({ rest: e.target.value as ModRest })}>
                <option value="newest">Cele mai noi</option>
                <option value="price_asc">Preț crescător</option>
                <option value="price_desc">Preț descrescător</option>
                <option value="name_asc">Alfabetic A-Z</option>
                <option value="popular">Recomandate primele</option>
                <option value="random">Amestecat</option>
              </select>
            </label>
          </div>
        )}
      </Grup>
      <Nota href="/dashboard/settings?sectiune=catalog" eticheta="Setări > Catalog">
        Ce produse apar în magazin (fără imagini, fără stoc, categorii goale) alegi din Setări.
      </Nota>
      <BaraSalvare continut={continut} nod="catalog" />
    </div>
  );
}

export function ContinutBeneficii({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;
  const s = pc.store_benefits_section!;
  const pune = (patch: Partial<typeof s>) => seteaza("beneficii", (p) => ({ ...p, store_benefits_section: { ...p.store_benefits_section!, ...patch } }));
  return (
    <div className="space-y-5">
      <EditorElemente titlu={s.title} elemente={s.items} eticheta="beneficiu"
        onTitlu={(title) => pune({ title })} onElemente={(items) => pune({ items })} />
      {s.items.length === 0 && <Nota>Secțiunea nu apare în magazin cât timp n-are niciun beneficiu.</Nota>}
      <BaraSalvare continut={continut} nod="beneficii" />
    </div>
  );
}

export function ContinutRecenzii({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;
  const s = pc.reviews_section!;
  const pune = (patch: Partial<typeof s>) => seteaza("recenzii", (p) => ({ ...p, reviews_section: { ...p.reviews_section!, ...patch } }));
  return (
    <div className="space-y-5">
      <EditorRecenzii titlu={s.title} recenzii={s.items}
        onTitlu={(title) => pune({ title })} onRecenzii={(items) => pune({ items })}
        urca={async (f) => {
          const { uploadImage } = await import("@/lib/upload");
          const r = await uploadImage(f, "avatars");
          return "error" in r ? null : r.url;
        }} />
      {s.items.length === 0 && <Nota>Secțiunea nu apare în magazin cât timp n-are nicio recenzie.</Nota>}
      <BaraSalvare continut={continut} nod="recenzii" />
    </div>
  );
}

/**
 * Imaginile galeriei (`businesses.gallery`).
 *
 * Nou in etapa 2: sectiunea „Galerie” exista, dar nimic din panou nu-i putea
 * pune imagini (comutatorul vechi traia intr-un ecran demontat), deci era mereu
 * goala. In productie, pe 25.10.2026: zero magazine cu imagini in galerie.
 */
export function ContinutGalerie({ continut }: { continut: ContinutMagazin }) {
  const { galerie, setGalerie } = continut;
  const [pickerDeschis, setPickerDeschis] = useState(false);
  const muta = (i: number, dir: -1 | 1) => setGalerie((l) => {
    const j = i + dir;
    if (j < 0 || j >= l.length) return l;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  return (
    <div className="space-y-5">
      <Grup titlu={`Imagini (${galerie.length})`}>
        <div className="grid grid-cols-3 gap-2">
          {galerie.map((url, i) => (
            <div key={url} className="relative group rounded-lg overflow-hidden border border-border bg-muted aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 bg-black/40">
                <button type="button" aria-label={`Mută imaginea ${i + 1} mai în față`} disabled={i === 0} onClick={() => muta(i, -1)}
                  className="w-6 h-6 rounded bg-white/90 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="h-3 w-3" /></button>
                <button type="button" aria-label={`Șterge imaginea ${i + 1}`} onClick={() => setGalerie((l) => l.filter((_, j) => j !== i))}
                  className="w-6 h-6 rounded bg-white/90 flex items-center justify-center text-red-500"><X className="h-3 w-3" /></button>
                <button type="button" aria-label={`Mută imaginea ${i + 1} mai în spate`} disabled={i === galerie.length - 1} onClick={() => muta(i, 1)}
                  className="w-6 h-6 rounded bg-white/90 flex items-center justify-center disabled:opacity-30"><ChevronRight className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setPickerDeschis(true)}
          className="w-full h-12 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:bg-primary/5 transition-colors">
          Adaugă imagini din Biblioteca Media
        </button>
        <MediaPicker open={pickerDeschis} onClose={() => setPickerDeschis(false)} multiple accept="image" bucket="gallery"
          excludeUrls={galerie} onSelect={(urls) => setGalerie((l) => [...l, ...urls.filter((u) => !l.includes(u))])} />
      </Grup>
      {galerie.length === 0 && <Nota>Secțiunea nu apare în magazin cât timp galeria e goală.</Nota>}
      <BaraSalvare continut={continut} nod="galerie" />
    </div>
  );
}

