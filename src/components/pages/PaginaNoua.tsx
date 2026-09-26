"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Check, FileText, HelpCircle, Loader2, Mail, Megaphone, Plus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { slugify } from "@/lib/utils/slugify";
import { createPage } from "@/lib/actions/page.actions";
import { problemaTitlului, validatePageSlug } from "@/lib/pages/reserved-slugs";
import { DESPRE_SABLOANE, SABLOANE, type Sablon } from "@/lib/pages/sabloane";
import { TIPURI_PAGINA_PROPRIE, type TipPaginaProprie } from "@/lib/pages/blocks.types";
import { useDialogAccesibil } from "@/components/dashboard/useDialogAccesibil";

const ICONITA: Record<Sablon, React.ElementType> = {
  goala: FileText, despre: Users, contact: Mail, faq: HelpCircle, prezentare: Megaphone, articol: BookOpen,
};

const campCls = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30";
const etichetaCls = "mb-1.5 block text-xs font-semibold text-foreground";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PAGINA NOUA                                                      (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: „acum e un chenar mic si simplu". Era titlu + link.

  Acum: un sablon de pornire, titlul si linkul (verificate PE LOC, cu aceleasi
  reguli ca pe server: nume de sistem, rute rezervate), tipul paginii (din el
  ies datele structurate pentru Google), descrierea pentru Google,
  si doua bife: publicata acum si pusa in meniu.

  ⚠ Verificarea de aici e doar ca omul sa afle inainte sa apese. Serverul
  (`createPage`) o face din nou, cu aceleasi functii: ce trece aici si pica
  acolo inseamna ca regulile s-au despartit.
*/
export function PaginaNoua({ businessId, adresaBaza, onClose }: {
  businessId: string;
  /** `https://edinio.com/<slug>` sau domeniul propriu, pentru previzualizarea linkului. */
  adresaBaza: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const cutia = useDialogAccesibil(true, onClose);
  const [sablon, setSablon] = useState<Sablon>("goala");
  const [titlu, setTitlu] = useState("");
  const [slug, setSlug] = useState("");
  const [slugAtins, setSlugAtins] = useState(false);
  const [tip, setTip] = useState<TipPaginaProprie>("pagina");
  const [descriere, setDescriere] = useState("");
  const [publicata, setPublicata] = useState(false);
  const [inMeniu, setInMeniu] = useState(true);
  const [seCreeaza, start] = useTransition();

  function alegeSablon(s: Sablon) {
    setSablon(s);
    setTip(DESPRE_SABLOANE[s].tip);
    const t = DESPRE_SABLOANE[s].titlu;
    if (t && !titlu.trim()) { setTitlu(t); if (!slugAtins) setSlug(slugify(t)); }
  }

  const eroareTitlu = titlu.trim().length >= 2 ? problemaTitlului(titlu) : null;
  const v = validatePageSlug(slug || titlu);
  const eroareSlug = (slug || titlu).trim() ? (v.ok ? null : v.error) : null;
  const gata = titlu.trim().length >= 2 && !eroareTitlu && !eroareSlug && !seCreeaza;

  function creeaza() {
    if (!gata) return;
    start(async () => {
      let res: Awaited<ReturnType<typeof createPage>>;
      try {
        res = await createPage({
          businessId, title: titlu.trim(), slug: slug.trim() || undefined,
          sablon, tip, publicata, inMeniu, descriere: descriere.trim() || undefined,
        });
      } catch {
        /* ⚠ Se poate sa fi fost creata si totusi sa nu stim. A doua apasare ar face a doua pagina. */
        toast.error(
          "Nu am primit răspuns de la server, deci nu știm dacă pagina s-a creat. Lista se reîncarcă: dacă apare acolo, s-a făcut. Uită-te întâi, ca să nu iasă două.",
          { duration: 12000 },
        );
        router.refresh();
        return;
      }
      if ("error" in res) { toast.error(res.error); return; }
      router.push(`/dashboard/pages/${res.pageId}/edit`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={cutia}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titlu`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl ring-1 ring-foreground/10 sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl"
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 id={`${id}-titlu`} className="text-base font-semibold text-foreground">Pagină nouă</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Alege de unde pornești. Totul se poate schimba apoi în editor.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Închide" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <fieldset>
            <legend className={etichetaCls}>Pornește de la</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SABLOANE.map((s) => {
                const Icon = ICONITA[s];
                const ales = sablon === s;
                return (
                  <button key={s} type="button" onClick={() => alegeSablon(s)} aria-pressed={ales}
                    className={cn("flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
                      ales ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/20 hover:bg-muted/40")}>
                    <span className={cn("grid h-8 w-8 place-items-center rounded-lg", ales ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span>
                      <span className="block text-[13px] font-medium leading-tight text-foreground">{DESPRE_SABLOANE[s].nume}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{DESPRE_SABLOANE[s].descriere}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-t`} className={etichetaCls}>Titlul paginii</label>
              <input id={`${id}-t`} autoFocus value={titlu} maxLength={120}
                onChange={(e) => { setTitlu(e.target.value); if (!slugAtins) setSlug(slugify(e.target.value)); }}
                placeholder="Ex: Despre noi" aria-invalid={!!eroareTitlu} className={cn(campCls, eroareTitlu && "border-destructive")} />
              {eroareTitlu && <p className="mt-1 text-[11px] text-destructive">{eroareTitlu}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-s`} className={etichetaCls}>Linkul</label>
              <input id={`${id}-s`} value={slug}
                /* Cratima de la capat ramane cat se scrie (26.09.2026): `slugify` o taia la fiecare tasta,
                   deci „despre-noi” nu se putea scrie de mana. Curatarea deplina, la iesirea din camp. */
                onChange={(e) => { const v = e.target.value; const c = slugify(v); setSlug(c && /[-\s_]$/.test(v) ? `${c}-` : c); setSlugAtins(true); }}
                onBlur={() => setSlug((s) => slugify(s))}
                placeholder="despre-noi" aria-invalid={!!eroareSlug} className={cn(campCls, "font-mono text-[13px]", eroareSlug && "border-destructive")} />
              {eroareSlug
                ? <p className="mt-1 text-[11px] text-destructive">{eroareSlug}</p>
                : <p className="mt-1 truncate text-[11px] text-muted-foreground">{adresaBaza}/{v.ok ? v.slug : "…"}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-tip`} className={etichetaCls}>Ce fel de pagină e</label>
              <select id={`${id}-tip`} value={tip} onChange={(e) => setTip(e.target.value as TipPaginaProprie)} className={campCls}>
                {TIPURI_PAGINA_PROPRIE.map((t) => <option key={t.valoare} value={t.valoare}>{t.eticheta}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">{TIPURI_PAGINA_PROPRIE.find((t) => t.valoare === tip)?.ajutor}</p>
            </div>
            <div>
              <label htmlFor={`${id}-d`} className={etichetaCls}>Descrierea pentru Google <span className="font-normal text-muted-foreground">(opțional)</span></label>
              <textarea id={`${id}-d`} value={descriere} onChange={(e) => setDescriere(e.target.value)} rows={3} maxLength={300}
                placeholder="Una-două fraze despre ce găsește omul pe pagină." className={cn(campCls, "resize-none")} />
              <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">{descriere.length}/160 recomandat</p>
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl bg-muted/40 p-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
              <input type="checkbox" checked={inMeniu} onChange={(e) => setInMeniu(e.target.checked)} className="h-4 w-4 rounded accent-green-600" />
              Pune-o în meniul magazinului
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
              <input type="checkbox" checked={publicata} onChange={(e) => setPublicata(e.target.checked)} className="h-4 w-4 rounded accent-green-600" />
              Publică imediat
            </label>
            {!publicata && <p className="ml-6 text-[11px] text-muted-foreground">Rămâne ciornă: o vezi doar tu până o publici din editor.</p>}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">Renunță</button>
          <button type="button" onClick={creeaza} disabled={!gata}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {seCreeaza ? <Loader2 className="h-4 w-4 animate-spin" /> : sablon === "goala" ? <Plus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            Creează și editează
          </button>
        </div>
      </div>
    </div>
  );
}
