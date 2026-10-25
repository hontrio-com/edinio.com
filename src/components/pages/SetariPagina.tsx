"use client";

import { SeoImageField } from "@/components/dashboard/SeoImageField";
import { GooglePreview, CharCounter } from "@/components/dashboard/SeoFields";
import { SEO_TITLE_IDEAL_MIN, SEO_TITLE_MAX, SEO_DESCRIPTION_IDEAL_MIN, SEO_DESCRIPTION_MAX } from "@/lib/seo";
import { TIPURI_PAGINA_PROPRIE, type Block, type PageSeo, type TipPaginaProprie } from "@/lib/pages/blocks.types";
import { sugestiiSeo, type Nivel } from "@/lib/pages/sugestii-seo";

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

/**
 * Setarile unei pagini proprii: titlul, adresa, SEO si CSS-ul ei.
 *
 * Mutate din `PageBuilder` (25.10.2026) ca sa le foloseasca si editorul unic (etapa 5 din
 * `docs/editor-magazin/PLAN.md`), fara o a doua copie.
 */
export function SetariPagina({ title, slug, seo, css, publicBase, blocks, onTitle, onSlug, onSeo, onCss }: {
  title: string; slug: string; seo: PageSeo; css: string; publicBase: string; blocks: Block[];
  onTitle: (v: string) => void; onSlug: (v: string) => void; onSeo: (v: PageSeo) => void; onCss: (v: string) => void;
}) {
  // `initialSeo` e un cast brut peste o coloana `Json`: o valoare veche sau
  // necunoscuta la `tip` trebuie sa cada pe implicit, nu sa lase selectul gol.
  const tipPaginaSelectat = TIPURI_PAGINA_PROPRIE.some((t) => t.valoare === seo.tip) ? seo.tip! : "pagina";
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-foreground mb-1.5">Titlu pagina</label>
        <input value={title} onChange={(e) => onTitle(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-foreground mb-1.5">Link (slug)</label>
        <input value={slug} onChange={(e) => onSlug(e.target.value)} className={inputCls} />
        <p className="text-[11px] text-muted-foreground mt-1 break-all">{publicBase}/{slug}</p>
      </div>
      <div className="pt-2 border-t border-border">
        <p className="text-xs font-semibold text-foreground mb-2">SEO</p>

        {/*
          CE ESTE pagina: se declara, nu se ghiceste.
          Din alegerea asta ies datele structurate ale paginii publice: un articol
          primeste titlu de articol, imagine si data publicarii; o pagina de blog
          isi listeaza automat articolele. Implicitul ramane „Pagina obisnuita”,
          deci nicio pagina existenta nu-si schimba intelesul de la sine.
        */}
        <div className="mb-3">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Ce este aceasta pagina?</label>
          <select
            value={tipPaginaSelectat}
            onChange={(e) => onSeo({ ...seo, tip: e.target.value as TipPaginaProprie })}
            className={inputCls}
          >
            {TIPURI_PAGINA_PROPRIE.map((t) => (
              <option key={t.valoare} value={t.valoare}>{t.eticheta}</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">
            {TIPURI_PAGINA_PROPRIE.find((t) => t.valoare === tipPaginaSelectat)?.ajutor}
          </p>
        </div>

        {tipPaginaSelectat === "articol" && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Autor (optional)</label>
              <input value={seo.autor ?? ""} onChange={(e) => onSeo({ ...seo, autor: e.target.value })} placeholder="Numele magazinului" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Data publicarii (optional)</label>
              {/* Gol = data la care s-a creat pagina. Campul e pentru articolele
                  aduse de pe un site vechi, care au o data reala, alta. */}
              <input type="date" value={seo.dataPublicarii ?? ""} onChange={(e) => onSeo({ ...seo, dataPublicarii: e.target.value })} className={inputCls} />
            </div>
          </div>
        )}

        <SugestiiSeo title={title} slug={slug} seo={seo} blocks={blocks} />

        <div className="mb-3">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Cuvântul cheie principal (opțional)</label>
          <input value={seo.focusKeyword ?? ""} onChange={(e) => onSeo({ ...seo, focusKeyword: e.target.value })} placeholder="Ex: lampadare din lemn" className={inputCls} />
          <p className="text-[11px] text-muted-foreground mt-1">Căutarea pentru care vrei să apară pagina. Nu se afișează nicăieri; sugestiile de mai sus verifică dacă apare unde trebuie.</p>
        </div>

        <div className="mb-3">
          <GooglePreview
            title={seo.title?.trim() || title || "Titlu pagina"}
            description={seo.description?.trim() || ""}
            url={`${publicBase}/${slug}`}
          />
        </div>

        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-muted-foreground">Titlu SEO (optional)</label>
            <CharCounter len={(seo.title ?? "").length} idealMin={SEO_TITLE_IDEAL_MIN} max={SEO_TITLE_MAX} />
          </div>
          <input value={seo.title ?? ""} onChange={(e) => onSeo({ ...seo, title: e.target.value })} placeholder={title || "Titlu pentru Google"} className={inputCls} />
        </div>

        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-muted-foreground">Descriere SEO (optional)</label>
            <CharCounter len={(seo.description ?? "").length} idealMin={SEO_DESCRIPTION_IDEAL_MIN} max={SEO_DESCRIPTION_MAX} />
          </div>
          <textarea value={seo.description ?? ""} onChange={(e) => onSeo({ ...seo, description: e.target.value })} placeholder="Descriere scurta pentru rezultatele Google..." rows={2} className={`${inputCls} resize-none`} />
        </div>
        <input value={seo.keywords ?? ""} onChange={(e) => onSeo({ ...seo, keywords: e.target.value })} placeholder="Cuvinte cheie (optional, separate prin virgula)" className={`${inputCls} mt-2`} />
        <p className="text-[11px] text-muted-foreground mt-1">Cuvintele cheie sunt aproape ignorate de Google azi: contează mai mult titlul, descrierea și imaginea de mai jos.</p>
        <div className="mt-3">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Imagine la distribuire (Facebook/WhatsApp)</label>
          <SeoImageField value={seo.ogImage} onChange={(v) => onSeo({ ...seo, ogImage: v })} folder="pages-og" />
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-foreground cursor-pointer select-none">
          <input type="checkbox" checked={!!seo.noindex} onChange={(e) => onSeo({ ...seo, noindex: e.target.checked })} className="w-4 h-4 rounded accent-green-600" />
          Ascunde din motoarele de cautare (noindex)
        </label>
        <details className="mt-3 rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">SEO avansat</summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Titlu la distribuire (Facebook, WhatsApp)</label>
              <input value={seo.ogTitle ?? ""} onChange={(e) => onSeo({ ...seo, ogTitle: e.target.value })} placeholder={seo.title || title} className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Descriere la distribuire</label>
              <textarea value={seo.ogDescription ?? ""} onChange={(e) => onSeo({ ...seo, ogDescription: e.target.value })} rows={2} placeholder={seo.description || "Ca descrierea pentru Google"} className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Adresă canonică</label>
              <input value={seo.canonical ?? ""} onChange={(e) => onSeo({ ...seo, canonical: e.target.value })} placeholder={`${publicBase}/${slug}`} className={inputCls} />
              <p className="text-[11px] text-muted-foreground mt-1">Doar dacă pagina e o copie a alteia: spune-i lui Google care e originalul. Gol = adresa acestei pagini.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={!!seo.nofollow} onChange={(e) => onSeo({ ...seo, nofollow: e.target.checked })} className="w-4 h-4 rounded accent-green-600" />
              Google să nu urmeze legăturile de pe pagină (nofollow)
            </label>
          </div>
        </details>
      </div>
      <div className="pt-2 border-t border-border">
        <label className="block text-xs font-semibold text-foreground mb-1.5">CSS personalizat (pagina)</label>
        <textarea value={css} onChange={(e) => onCss(e.target.value)} placeholder=".clasa { color: red; }" rows={5} className={`${inputCls} font-mono text-xs resize-none`} />
        <p className="text-[11px] text-muted-foreground mt-1">Se aplica doar pe aceasta pagina.</p>
      </div>
    </div>
  );
}


/* Sugestiile SEO ale paginii, cu scor. Se recalculeaza la fiecare modificare, fara nicio cerere. */
const CULOARE_NIVEL: Record<Nivel, string> = { bine: "bg-success", atentie: "bg-warning", problema: "bg-destructive" };

function SugestiiSeo(p: { title: string; slug: string; seo: PageSeo; blocks: Block[] }) {
  const { scor, sugestii } = sugestiiSeo(p);
  const ton = scor >= 80 ? "text-success" : scor >= 55 ? "text-warning" : "text-destructive";
  const deRezolvat = sugestii.filter((x) => x.nivel !== "bine").length;
  return (
    <details className="mb-3 rounded-lg border border-border" open={deRezolvat > 0}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-xs font-semibold text-foreground">Sugestii SEO</span>
        <span className={`text-sm font-bold tabular-nums ${ton}`}>{scor}/100</span>
      </summary>
      <ul className="space-y-2 border-t border-border px-3 py-3">
        {sugestii.map((x, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground/85">
            <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${CULOARE_NIVEL[x.nivel]}`} />
            {x.text}
          </li>
        ))}
      </ul>
    </details>
  );
}
