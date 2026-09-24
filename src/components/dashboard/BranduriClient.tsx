"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award, Check, GitMerge, Loader2, Pencil, Search, Trash2, X } from "lucide-react";
import { redenumesteBrandul, stergeBrandul, unesteBrandul } from "@/lib/actions/branduri.actions";
import { curataBrand, dubluriDeBrand, type BrandCuProduse } from "@/lib/dashboard/branduri";
import { pluralRo } from "@/lib/utils/format";

/**
 * Produse > Branduri.
 *
 * Brandurile NU sunt o lista separata: sunt valorile scrise pe produse
 * (`page_sections.google.brand`). Deci un brand exista cat timp are macar un
 * produs, si „a sterge un brand” inseamna a-l scoate de pe produsele lui. Un brand
 * nou se adauga din produs (campul Brand) sau din lista de produse, pe mai multe
 * deodata (bara de selectie > Brand).
 */

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";
const butonMic =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function BranduriClient({
  businessId,
  branduri,
  totalProduse,
}: {
  businessId: string;
  branduri: BrandCuProduse[];
  totalProduse: number;
}) {
  const router = useRouter();
  const [cautare, setCautare] = useState("");
  const [editez, setEditez] = useState<string | null>(null);
  const [numeNou, setNumeNou] = useState("");
  const [deSters, setDeSters] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const cuBrand = branduri.reduce((s, b) => s + b.produse, 0);
  const dubluri = useMemo(() => dubluriDeBrand(branduri), [branduri]);
  const vizibile = useMemo(() => {
    const t = cautare.trim().toLocaleLowerCase("ro");
    return t ? branduri.filter((b) => b.brand.toLocaleLowerCase("ro").includes(t)) : branduri;
  }, [branduri, cautare]);

  function ruleaza(cheie: string, fn: () => Promise<{ success: true; count: number } | { error: string }>, mesaj: (n: number) => string) {
    setLucreaza(cheie);
    startTransition(async () => {
      try {
        const r = await fn();
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
        toast.success(mesaj(r.count));
        setEditez(null);
        setDeSters(null);
        router.refresh();
      } catch {
        toast.error("Nu am putut salva. Verifica legatura la internet.");
      } finally {
        setLucreaza(null);
      }
    });
  }

  function salveazaNumele(vechi: string) {
    const nou = curataBrand(numeNou);
    if (!nou) {
      toast.error("Scrie noul nume al brandului.");
      return;
    }
    if (nou === vechi) {
      setEditez(null);
      return;
    }
    ruleaza(`nume:${vechi}`, () => redenumesteBrandul(businessId, vechi, nou), (n) =>
      n === 0 ? "Nicio schimbare." : `Brandul a fost redenumit la ${pluralRo(n, "produs", "produse")}.`);
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Branduri</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {branduri.length === 0
            ? "Niciun brand"
            : `${pluralRo(branduri.length, "brand", "branduri")} · ${cuBrand} din ${pluralRo(totalProduse, "produs", "produse")} au brand`}
        </p>
      </div>

      {branduri.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Award className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">Niciun produs nu are brand</p>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
            Adauga brandul din pagina produsului (sectiunea Organizare) sau pe mai multe produse deodata, din lista de produse.
          </p>
          <Link href="/dashboard/products" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white bg-primary hover:bg-primary/90 transition-colors">
            Mergi la produse
          </Link>
        </div>
      )}

      {/* Dublurile: acelasi brand scris diferit. In magazin apar ca doua filtre. */}
      {dubluri.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-foreground">Posibile dubluri</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Acelasi brand, scris diferit. In magazin apar ca doua branduri separate, deci clientii nu le vad produsele impreuna.
          </p>
          <ul className="space-y-2">
            {dubluri.map((grup) => {
              /* Tinta propusa: forma cu cele mai multe produse. */
              const tinta = [...grup].sort((a, b) => b.produse - a.produse)[0];
              return (
                <li key={tinta.brand} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground">
                    {grup.map((b) => `„${b.brand}” (${b.produse})`).join(", ")}
                  </span>
                  <button
                    type="button"
                    disabled={lucreaza !== null}
                    onClick={() => {
                      const din = grup.filter((b) => b.brand !== tinta.brand);
                      ruleaza(`uneste:${tinta.brand}`, async () => {
                        let total = 0;
                        for (const b of din) {
                          const r = await unesteBrandul(businessId, b.brand, tinta.brand);
                          if ("error" in r) return r;
                          total += r.count;
                        }
                        return { success: true as const, count: total };
                      }, (n) => `Unite in „${tinta.brand}”: ${pluralRo(n, "produs mutat", "produse mutate")}.`);
                    }}
                    className={butonMic}
                  >
                    {lucreaza === `uneste:${tinta.brand}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                    Uneste in „{tinta.brand}”
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {branduri.length >= 8 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={cautare}
            onChange={(e) => setCautare(e.target.value)}
            placeholder="Cauta un brand"
            aria-label="Cauta un brand"
            className={`${inputCls} pl-9 rounded-xl`}
          />
        </div>
      )}

      {branduri.length > 0 && (
        <ul className="rounded-xl border border-border bg-surface divide-y divide-border">
          {vizibile.length === 0 && <li className="px-4 py-6 text-sm text-center text-muted-foreground">Niciun brand gasit.</li>}
          {vizibile.map((b) => {
            const inEditare = editez === b.brand;
            const confirmare = deSters === b.brand;
            const ocupat = lucreaza !== null;
            return (
              <li key={b.brand} className="px-4 py-3">
                {inEditare ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      salveazaNumele(b.brand);
                    }}
                  >
                    <input
                      autoFocus
                      value={numeNou}
                      onChange={(e) => setNumeNou(e.target.value)}
                      maxLength={120}
                      aria-label={`Noul nume pentru ${b.brand}`}
                      className={`${inputCls} flex-1 min-w-[10rem]`}
                    />
                    <button type="submit" disabled={ocupat} className={butonMic}>
                      {lucreaza === `nume:${b.brand}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Salveaza
                    </button>
                    <button type="button" disabled={ocupat} onClick={() => setEditez(null)} className={butonMic}>
                      <X className="h-3.5 w-3.5" />
                      Renunta
                    </button>
                    <p className="w-full text-xs text-muted-foreground">
                      Se schimba la toate cele {pluralRo(b.produse, "produs", "produse")}. Daca scrii numele unui brand existent, produsele trec la el.
                    </p>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground break-words">{b.brand}</p>
                      <Link
                        href={`/dashboard/products?brand=${encodeURIComponent(b.brand)}`}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {pluralRo(b.produse, "produs", "produse")}
                      </Link>
                    </div>
                    {confirmare ? (
                      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Confirma stergerea brandului ${b.brand}`}>
                        <span className="text-xs text-foreground">Scoti brandul de pe {pluralRo(b.produse, "produs", "produse")}?</span>
                        <button
                          type="button"
                          autoFocus
                          disabled={ocupat}
                          onClick={() => ruleaza(`sterge:${b.brand}`, () => stergeBrandul(businessId, b.brand), (n) =>
                            `Brandul a fost scos de pe ${pluralRo(n, "produs", "produse")}.`)}
                          className={`${butonMic} border-destructive/40 text-destructive hover:bg-destructive/5`}
                        >
                          {lucreaza === `sterge:${b.brand}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Da, scoate
                        </button>
                        <button type="button" disabled={ocupat} onClick={() => setDeSters(null)} className={butonMic}>
                          Nu
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={ocupat}
                          onClick={() => { setEditez(b.brand); setNumeNou(b.brand); setDeSters(null); }}
                          className={butonMic}
                          aria-label={`Redenumeste ${b.brand}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Redenumeste
                        </button>
                        <button
                          type="button"
                          disabled={ocupat}
                          onClick={() => { setDeSters(b.brand); setEditez(null); }}
                          className={butonMic}
                          aria-label={`Sterge ${b.brand}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Sterge
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {branduri.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Stergerea scoate numai brandul de pe produse; produsele raman. Un brand nou se adauga din pagina produsului sau
          din lista de produse (selecteaza produsele, apoi Brand).
        </p>
      )}
    </div>
  );
}
