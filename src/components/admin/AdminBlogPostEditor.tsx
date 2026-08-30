"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Upload, Plus, Trash2, Clock, Sparkles, HelpCircle,
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { GooglePreview, CharCounter } from "@/components/dashboard/SeoFields";
import { uploadImage } from "@/lib/upload";
import {
  SEO_DESCRIPTION_IDEAL_MIN, SEO_DESCRIPTION_MAX,
  SEO_TITLE_IDEAL_MIN, SEO_TITLE_MAX,
} from "@/lib/seo";
import {
  minuteDeCitit, slugDin, STARI,
  type ArticolBlog, type AutorBlog, type CategorieBlog, type IntrebareBlog, type StareArticol,
} from "@/lib/blog/types";
import { creeazaArticol, actualizeazaArticol, type ArticolInput } from "@/lib/actions/blog.actions";

const inputCls =
  "w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/20";

/** Antetul unei secțiuni din formular, cu lămurirea sub el. */
function Sectiune({ titlu, lamurire, children }: { titlu: string; lamurire?: string; children: React.ReactNode }) {
  return (
    <section className="pt-6 border-t border-zinc-200">
      <h2 className="text-sm font-semibold text-zinc-900">{titlu}</h2>
      {lamurire && <p className="mt-1 mb-3 text-xs text-zinc-500 max-w-2xl">{lamurire}</p>}
      <div className={lamurire ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

type Stare = {
  title: string;
  slug: string;
  slugScrisDeMana: boolean;
  excerpt: string;
  answer_summary: string;
  content_html: string;
  cover_url: string;
  cover_alt: string;
  author_id: string;
  category_id: string;
  status: StareArticol;
  /** Formatul `datetime-local`, adică fără fus. Vezi nota de la salvare. */
  publicatLa: string;
  is_featured: boolean;
  faq: IntrebareBlog[];
  seo_title: string;
  seo_description: string;
  canonical_url: string;
  noindex: boolean;
};

/** ISO → valoarea pe care o cere `<input type="datetime-local">`, în ora locală. */
function pentruInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dinStareInitiala(a: ArticolBlog | null): Stare {
  return {
    title: a?.title ?? "",
    slug: a?.slug ?? "",
    slugScrisDeMana: !!a,
    excerpt: a?.excerpt ?? "",
    answer_summary: a?.answer_summary ?? "",
    content_html: a?.content_html ?? "",
    cover_url: a?.cover_url ?? "",
    cover_alt: a?.cover_alt ?? "",
    author_id: a?.author_id ?? "",
    category_id: a?.category_id ?? "",
    status: a?.status ?? "draft",
    publicatLa: pentruInput(a?.published_at ?? null),
    is_featured: a?.is_featured ?? false,
    faq: Array.isArray(a?.faq) ? a.faq : [],
    seo_title: a?.seo_title ?? "",
    seo_description: a?.seo_description ?? "",
    canonical_url: a?.canonical_url ?? "",
    noindex: a?.noindex ?? false,
  };
}

export function AdminBlogPostEditor({
  articol,
  autori,
  categorii,
}: {
  articol: ArticolBlog | null;
  autori: AutorBlog[];
  categorii: CategorieBlog[];
}) {
  const router = useRouter();
  const [f, setF] = useState<Stare>(() => dinStareInitiala(articol));
  const [salveaza, setSalveaza] = useState(false);
  const [incarca, setIncarca] = useState(false);

  const pune = <K extends keyof Stare>(k: K, v: Stare[K]) => setF((s) => ({ ...s, [k]: v }));

  function schimbaTitlul(title: string) {
    setF((s) => ({ ...s, title, slug: s.slugScrisDeMana ? s.slug : slugDin(title) }));
  }

  async function incarcaCoperta(file: File) {
    setIncarca(true);
    const res = await uploadImage(file, "gallery", "blog");
    setIncarca(false);
    if ("error" in res) { toast.error(res.error); return; }
    pune("cover_url", res.url);
  }

  async function salveaza_(stareNoua?: StareArticol) {
    const status = stareNoua ?? f.status;
    setSalveaza(true);

    const intrare: ArticolInput = {
      title: f.title,
      slug: f.slug,
      excerpt: f.excerpt,
      answer_summary: f.answer_summary,
      content_html: f.content_html,
      cover_url: f.cover_url,
      cover_alt: f.cover_alt,
      author_id: f.author_id,
      category_id: f.category_id,
      status,
      /* `datetime-local` dă o oră FĂRĂ fus. `new Date(...)` o citește ca oră
         locală a browserului, care e chiar ce a vrut omul când a ales-o. */
      published_at: f.publicatLa ? new Date(f.publicatLa).toISOString() : null,
      is_featured: f.is_featured,
      faq: f.faq,
      seo_title: f.seo_title,
      seo_description: f.seo_description,
      canonical_url: f.canonical_url,
      noindex: f.noindex,
    };

    /* Ramurile sunt despărțite dinadins: cele două acțiuni întorc forme
       diferite, iar pe o singură variabilă de tip reunit `res.date` ajungea
       `unknown` și nu se putea citi id-ul articolului nou. */
    if (articol) {
      const res = await actualizeazaArticol(articol.id, intrare);
      setSalveaza(false);
      if ("error" in res) { toast.error(res.error); return; }
      if (stareNoua) pune("status", stareNoua);
      toast.success("Salvat.");
      router.refresh();
      return;
    }

    const res = await creeazaArticol(intrare);
    setSalveaza(false);
    if ("error" in res) { toast.error(res.error); return; }
    if (stareNoua) pune("status", stareNoua);
    toast.success("Articol creat.");
    /* `replace`, nu `push`: „înapoi" trebuie să ducă la lista de articole, nu
       la formularul gol de dinainte, care ar crea un al doilea articol. */
    router.replace(`/admin/blog/${res.date.id}`);
  }

  /*
    ═══ CEASUL NU SE CITEȘTE ÎN TIMPUL RANDĂRII ═══

    Aici era `Date.now()` scris direct în JSX, ca să se vadă dacă data aleasă e
    în viitor. React interzice asta pe bună dreptate: o funcție care întoarce
    altceva la fiecare apel face randarea să depindă de CÂND s-a întâmplat, nu
    de ce e în stare. Regula `react-hooks/purity` l-a prins.

    Citit o singură dată, la deschiderea editorului, momentul devine o valoare
    obișnuită din stare. A doua încercare a fost un efect care scria starea, și
    a picat la altă regulă (`set-state-in-effect`) — pe drept: nu era nimic din
    afară de urmărit, doar un moment de citit o dată.

    Un instantaneu de la deschidere e și mai corect decât unul care se
    reîmprospătează: întrebarea e „data aleasă e în viitor?", iar răspunsul n-are
    de ce să se schimbe sub ochii omului cât timp stă în formular.
  */
  const [deschisLa] = useState(() => Date.now());
  const programat =
    f.status === "published" && !!f.publicatLa
    && new Date(f.publicatLa).getTime() > deschisLa;

  const titluCatreGoogle = f.seo_title.trim() || f.title;
  const descriereCatreGoogle = f.seo_description.trim() || f.excerpt;
  const minute = minuteDeCitit(f.content_html);

  return (
    <div className="p-6 max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-6">
        <Link href="/admin/blog" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> Articole
        </Link>
        <span className="text-xs text-zinc-500">
          {STARI[f.status]}{minute ? ` · ${minute} min de citit` : ""}
        </span>
      </div>

      <div className="space-y-6">
        <div>
          <input type="text" value={f.title} onChange={(e) => schimbaTitlul(e.target.value)}
            placeholder="Titlul articolului"
            className="w-full text-2xl font-semibold text-zinc-900 placeholder:text-zinc-300 border-0 border-b border-zinc-200 pb-2 focus:outline-none focus:border-zinc-900" />
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <span>/blog/</span>
            <input type="text" value={f.slug}
              onChange={(e) => setF((s) => ({ ...s, slug: e.target.value, slugScrisDeMana: true }))}
              placeholder="adresa-articolului"
              className="flex-1 font-mono bg-transparent border-0 focus:outline-none text-zinc-600" />
          </div>
        </div>

        {/*
          ═══ RĂSPUNSUL SCURT, PENTRU MOTOARELE CARE RĂSPUND CU TEXT ═══

          Nu e un rezumat și nu e o introducere. E un răspuns care se ține pe
          picioarele lui: motoarele generative citează pasaje scoase din pagină,
          iar unul care spune „după cum vom vedea" nu poate fi citat singur.
          Regula practică e scrisă chiar sub câmp, ca să n-o caute nimeni.
        */}
        <Sectiune
          titlu="Răspunsul scurt"
          lamurire="Două-trei propoziții care răspund la întrebarea articolului și se înțeleg SINGURE, fără restul textului. Se arată în capul articolului, și e bucata pe care o citează ChatGPT, Perplexity sau răspunsurile din Google. Dacă îl citești rupt de articol și nu se înțelege, nu e bun încă."
        >
          <textarea value={f.answer_summary} rows={3}
            onChange={(e) => pune("answer_summary", e.target.value)}
            placeholder="Un magazin online pe Edinio se deschide în aceeași zi: alegi un plan, îți pui produsele și conectezi curierul. Nu ai nevoie de programator."
            className={inputCls + " resize-y"} />
        </Sectiune>

        <Sectiune titlu="Textul articolului">
          <RichTextEditor
            content={f.content_html}
            onChange={(html) => pune("content_html", html)}
            placeholder="Scrie articolul. Folosește titluri mari și mici: din ele se face cuprinsul."
          />
        </Sectiune>

        <Sectiune
          titlu="Întrebări frecvente"
          lamurire="Se arată la finalul articolului ȘI pleacă în datele structurate ca FAQPage, adică pot apărea direct în rezultatele Google. O întrebare fără răspuns nu se salvează: o structură care promite un răspuns inexistent e mai rea decât lipsa ei."
        >
          <div className="space-y-3">
            {f.faq.map((intrebare, i) => (
              <div key={i} className="p-3 border border-zinc-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <input type="text" value={intrebare.q}
                    onChange={(e) => pune("faq", f.faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x))}
                    placeholder="Cât costă?" className={inputCls} />
                  <button type="button"
                    onClick={() => pune("faq", f.faq.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea value={intrebare.a} rows={2}
                  onChange={(e) => pune("faq", f.faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x))}
                  placeholder="Răspunsul, întreg, fără să trimită în altă parte."
                  className={inputCls + " resize-y"} />
              </div>
            ))}
            <button type="button" onClick={() => pune("faq", [...f.faq, { q: "", a: "" }])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50">
              <Plus className="h-3.5 w-3.5" /> Adaugă întrebare
            </button>
          </div>
        </Sectiune>

        <Sectiune titlu="Imaginea de deschidere">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {f.cover_url ? (
                <Image src={f.cover_url} alt="" width={160} height={90}
                  className="h-[90px] w-40 rounded-lg object-cover border border-zinc-200" unoptimized />
              ) : (
                <div className="h-[90px] w-40 rounded-lg bg-zinc-100 border border-dashed border-zinc-300" />
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50 cursor-pointer">
                {incarca ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Încarcă
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const x = e.target.files?.[0]; if (x) incarcaCoperta(x); }} />
              </label>
              {f.cover_url && (
                <button type="button" onClick={() => pune("cover_url", "")}
                  className="text-xs text-zinc-500 hover:text-red-600">Scoate</button>
              )}
            </div>
            {f.cover_url && (
              <div>
                <input type="text" value={f.cover_alt}
                  onChange={(e) => pune("cover_alt", e.target.value)}
                  placeholder="Ce se vede în imagine" className={inputCls} />
                <p className="mt-1.5 text-xs text-zinc-500">
                  Textul acesta se citește cu voce tare pentru cine nu vede ecranul, și e singurul
                  lucru pe care îl înțelege Google despre imagine.
                </p>
              </div>
            )}
          </div>
        </Sectiune>

        <Sectiune titlu="Așezare">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Autor</label>
              <select value={f.author_id} onChange={(e) => pune("author_id", e.target.value)} className={inputCls}>
                <option value="">Fără autor</option>
                {autori.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Categorie</label>
              <select value={f.category_id} onChange={(e) => pune("category_id", e.target.value)} className={inputCls}>
                <option value="">Fără categorie</option>
                {categorii.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <label className="mt-4 inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={f.is_featured}
              onChange={(e) => pune("is_featured", e.target.checked)} className="h-4 w-4 accent-zinc-900" />
            <span className="text-sm text-zinc-700 inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Scoate-l în față pe pagina de blog
            </span>
          </label>

          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Rezumat pentru listă</label>
            <textarea value={f.excerpt} rows={2} onChange={(e) => pune("excerpt", e.target.value)}
              placeholder="Un rând, pentru cartonașul din lista de articole." className={inputCls + " resize-y"} />
          </div>
        </Sectiune>

        {/*
          ⚠ DATA VIITOARE ÎNSEAMNĂ PROGRAMAT, ȘI ATÂT. Nu există stare separată
          pentru asta, fiindcă o stare ar fi cerut un cron care s-o schimbe, iar
          un cron care nu pornește lasă articolul blocat pentru totdeauna.
        */}
        <Sectiune
          titlu="Publicarea"
          lamurire="Lăsată goală la publicare, data se pune singură pe momentul apăsării. Pusă în viitor, articolul se publică singur atunci, fără să mai intre nimeni aici."
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Stare</label>
              <select value={f.status} onChange={(e) => pune("status", e.target.value as StareArticol)} className={inputCls}>
                {(Object.keys(STARI) as StareArticol[]).map((s) => (
                  <option key={s} value={s}>{STARI[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Data publicării</label>
              <input type="datetime-local" value={f.publicatLa}
                onChange={(e) => pune("publicatLa", e.target.value)} className={inputCls} />
            </div>
          </div>

          {programat && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Programat. Nu se vede pe site până la data aleasă, chiar dacă starea scrie
              {" „Publicat”."}
            </p>
          )}
        </Sectiune>

        <Sectiune
          titlu="Cum apare în Google"
          lamurire="Lăsate goale, se folosesc titlul și rezumatul de mai sus."
        >
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-zinc-700">Titlu</label>
                <CharCounter len={titluCatreGoogle.length} idealMin={SEO_TITLE_IDEAL_MIN} max={SEO_TITLE_MAX} />
              </div>
              <input type="text" value={f.seo_title} onChange={(e) => pune("seo_title", e.target.value)}
                placeholder={f.title || "Titlul din capul paginii"} className={inputCls} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-zinc-700">Descriere</label>
                <CharCounter len={descriereCatreGoogle.length} idealMin={SEO_DESCRIPTION_IDEAL_MIN} max={SEO_DESCRIPTION_MAX} />
              </div>
              <textarea value={f.seo_description} rows={2} onChange={(e) => pune("seo_description", e.target.value)}
                placeholder={f.excerpt || "Rezumatul articolului"} className={inputCls + " resize-y"} />
            </div>

            <GooglePreview
              title={titluCatreGoogle}
              description={descriereCatreGoogle}
              url={`https://www.edinio.com/blog/${f.slug || "adresa-articolului"}`}
            />

            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Adresă canonică</label>
                <input type="text" value={f.canonical_url} onChange={(e) => pune("canonical_url", e.target.value)}
                  placeholder="doar dacă textul e publicat și altundeva" className={inputCls} />
              </div>
              <label className="flex items-end gap-2 pb-2 cursor-pointer">
                <input type="checkbox" checked={f.noindex}
                  onChange={(e) => pune("noindex", e.target.checked)} className="h-4 w-4 accent-zinc-900" />
                <span className="text-sm text-zinc-700">Ascunde-l de Google</span>
              </label>
            </div>
          </div>
        </Sectiune>
      </div>

      {/* Bara de salvare, lipită jos: un articol lung n-are de ce să fie derulat
          până la capăt pentru un buton. */}
      <div className="fixed bottom-0 inset-x-0 lg:left-[var(--admin-sidebar-width,240px)] bg-white border-t border-zinc-200 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-2">
          <button type="button" onClick={() => salveaza_()} disabled={salveaza}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50">
            {salveaza && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvează
          </button>
          {f.status !== "published" && (
            <button type="button" onClick={() => salveaza_("published")} disabled={salveaza}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50">
              Publică
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
