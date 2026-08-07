"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCautareIntarziata } from "@/lib/hooks/cautare-intarziata";
import { Check, Search, Sparkles, X } from "lucide-react";
import {
  applyAboutYouCategoryMap, saveAboutYouCategoryMapEntry, searchAboutYouCategories,
  suggestAboutYouCategoryMap, type SugestieMapare,
} from "@/lib/actions/aboutyou.actions";
import type { AboutYouCategory, AboutYouCategoryMapEntry } from "@/lib/aboutyou/types";

// Calea About You vine cu bare verticale („Fashion|Women|…"). Pentru citit,
// sagetile sunt mai bune, iar radacina „Fashion" nu spune nimic nimanui.
function caleCitibila(path: string): string {
  const bucati = path.split("|").map((b) => b.trim()).filter(Boolean);
  return (bucati[0] === "Fashion" ? bucati.slice(1) : bucati).join(" › ");
}

export function AboutYouCategoryMapping({
  businessId, edinioCategories, mapped,
}: {
  businessId: string;
  edinioCategories: string[];
  mapped: Record<string, AboutYouCategoryMapEntry>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [sugestii, setSugestii] = useState<Record<string, SugestieMapare> | null>(null);
  const [sePotriveste, setSePotriveste] = useState(false);
  // Cautarea e intarziata si pazita impotriva raspunsurilor vechi; numele locale
  // raman ca inainte, ca restul componentei sa nu se schimbe.
  const { termen: query, setTermen: setQuery, rezultat, seCauta: searching, reseteaza } =
    useCautareIntarziata<AboutYouCategory[]>(async (q) => {
      const res = await searchAboutYouCategories(businessId, q);
      if ("error" in res) { toast.error(res.error); return null; }
      return res.categories;
    });
  const results = rezultat ?? [];

  if (edinioCategories.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
        Adaugă categorii produselor tale ca să le poți mapa la categoriile About You.
      </div>
    );
  }

  const nemapate = edinioCategories.filter((c) => !mapped[c]);

  const potrivesteAutomat = () => {
    setSePotriveste(true);
    startTransition(async () => {
      const res = await suggestAboutYouCategoryMap(businessId, edinioCategories);
      setSePotriveste(false);
      if ("error" in res) { toast.error(res.error); return; }
      const dupaCategorie: Record<string, SugestieMapare> = {};
      for (const s of res.sugestii) dupaCategorie[s.edinioCategory] = s;
      setSugestii(dupaCategorie);
      const sigure = res.sugestii.filter((s) => s.sigura && !s.mapataDeja).length;
      const propuse = res.sugestii.filter((s) => !s.sigura && !s.mapataDeja && s.optiuni.length > 0).length;
      if (sigure === 0 && propuse === 0) {
        toast.info("Nu am găsit potriviri. Caută manual categoria About You.");
        return;
      }
      toast.success(
        sigure > 0
          ? `${sigure} ${sigure === 1 ? "categorie se poate mapa" : "categorii se pot mapa"} automat.`
          : `${propuse} ${propuse === 1 ? "propunere" : "propuneri"} de verificat.`,
      );
    });
  };

  const aplicaSigure = () => {
    startTransition(async () => {
      const res = await applyAboutYouCategoryMap(businessId, edinioCategories);
      if ("error" in res) { toast.error(res.error); return; }
      if (res.aplicate === 0) {
        toast.info("Nicio potrivire suficient de sigură. Alege manual din propuneri.");
        return;
      }
      toast.success(`${res.aplicate} ${res.aplicate === 1 ? "categorie mapată" : "categorii mapate"}.`);
      router.refresh();
    });
  };

  const alege = (cat: string, entry: AboutYouCategoryMapEntry) => {
    startTransition(async () => {
      const res = await saveAboutYouCategoryMapEntry(businessId, cat, entry);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Categorie mapată.");
      setOpenFor(null); reseteaza();
      setSugestii((prev) => {
        if (!prev?.[cat]) return prev;
        const next = { ...prev };
        delete next[cat];
        return next;
      });
      router.refresh();
    });
  };

  const unmap = (cat: string) => {
    startTransition(async () => {
      const res = await saveAboutYouCategoryMapEntry(businessId, cat, null);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Mapare eliminată.");
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-base font-semibold text-foreground">Mapare categorii</h2>
        <div className="flex items-center gap-2">
          {sugestii && (
            <button
              onClick={aplicaSigure}
              disabled={pending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              Aplică potrivirile sigure
            </button>
          )}
          <button
            onClick={potrivesteAutomat}
            disabled={pending || nemapate.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {sePotriveste ? "Se caută..." : "Potrivește automat"}
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Leagă fiecare categorie din magazin de o categorie About You. Produsele preiau automat maparea.
        Categoriile About You sunt în engleză — „Potrivește automat” traduce și caută în locul tău.
      </p>

      <div className="divide-y divide-border">
        {edinioCategories.map((cat) => {
          const m = mapped[cat];
          const isOpen = openFor === cat;
          const s = sugestii?.[cat];
          const propuneri = !m && s ? s.optiuni : [];
          return (
            <div key={cat} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{cat}</p>
                  {m ? (
                    <p className="text-xs text-green-700 flex items-center gap-1 mt-0.5">
                      <Check className="h-3 w-3 flex-shrink-0" /> {caleCitibila(m.label)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Nemapat</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m && (
                    <button onClick={() => unmap(cat)} disabled={pending}
                      className="text-xs text-muted-foreground hover:text-red-600 disabled:opacity-60">
                      Elimină
                    </button>
                  )}
                  <button
                    onClick={() => { setOpenFor(isOpen ? null : cat); reseteaza(); }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    {m ? "Schimbă" : "Caută"}
                  </button>
                </div>
              </div>

              {propuneri.length > 0 && (
                <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                    {s?.sigura ? "Potrivire găsită" : "Propuneri — verifică înainte de a alege"}
                  </p>
                  <div className="space-y-1">
                    {propuneri.map((o, i) => (
                      <button
                        key={o.category_id}
                        onClick={() => alege(cat, { category_id: o.category_id, label: o.label })}
                        disabled={pending}
                        className="w-full flex items-center justify-between gap-3 rounded-md bg-background px-2.5 py-1.5 text-left hover:bg-muted disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs text-foreground truncate">{caleCitibila(o.label)}</span>
                          <span className="block text-[10px] text-muted-foreground">{o.motiv}</span>
                        </span>
                        <span
                          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            i === 0 && s?.sigura ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {Math.round(o.scor * 100)}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!m && s && s.optiuni.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nicio potrivire automată. Caută manual categoria About You.
                </p>
              )}

              {isOpen && (
                <div className="mt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Caută categoria About You (ex. rochii, genți, handbag)"
                      className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm"
                    />
                    {query && (
                      <button onClick={() => { reseteaza(); }} className="absolute right-3 top-2.5">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {searching && <p className="text-xs text-muted-foreground mt-2">Se caută...</p>}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Nicio categorie găsită pentru „{query.trim()}”. Încearcă alt cuvânt.
                    </p>
                  )}
                  {results.length > 0 && (
                    <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                      {results.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => alege(cat, { category_id: r.id, label: r.path || r.name })}
                          disabled={pending}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                        >
                          {caleCitibila(r.path || r.name)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
