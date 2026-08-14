"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Info, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { salveazaFeeduriFacebook, numaraProduseFeed } from "@/lib/actions/facebook-feeds.actions";
import type { RegulaFeed } from "@/lib/facebook/feeduri";
import { SelectorProduseFeed } from "@/components/dashboard/SelectorProduseFeed";

export interface CategorieAleasa {
  id: string;
  name: string;
  /** Adancimea in arbore, doar pentru indentare. */
  nivel: number;
}

/**
 * Feeduri Meta segmentate: catalog pe categorie, pe o selectie, sau pe conditii.
 *
 * ⚠ Ecranul spune INTAI ca pentru reclame nu e nevoie de el.
 *
 * Cererea obisnuita — „vreau catalog doar pe categoria X, ca sa fac reclama la
 * ea" — se rezolva in Commerce Manager cu un Product Set, in doua minute si fara
 * nimic de intretinut: feedul nostru trimite deja categoria fiecarui produs.
 * Un feed separat e pentru cataloage cu adevarat separate. Daca n-am scrie asta
 * aici, am impinge comerciantul catre munca in plus si catre cataloage duplicate.
 */
export function FacebookFeeduriClient({
  bazaFeed,
  feeduriInitiale,
  categorii,
  totalProduse,
}: {
  /** `https://magazin.ro/facebook-catalog.xml`, fara parametri. */
  bazaFeed: string;
  feeduriInitiale: RegulaFeed[];
  categorii: CategorieAleasa[];
  totalProduse: number;
}) {
  const [feeduri, setFeeduri] = useState<RegulaFeed[]>(feeduriInitiale);
  const [deschis, setDeschis] = useState<number | null>(null);
  const [numarate, setNumarate] = useState<Record<string, number>>({});
  /* Care selector e deschis: „<index>:produse" sau „<index>:excluse". */
  const [selector, setSelector] = useState<string | null>(null);
  const [salveaza, startSalvare] = useTransition();

  const copiaza = (v: string) => { navigator.clipboard?.writeText(v); toast.success("Adresa copiata."); };
  const adresa = (f: RegulaFeed) => `${bazaFeed}?feed=${encodeURIComponent(f.cheie)}`;

  function schimba(i: number, patch: Partial<RegulaFeed>) {
    setFeeduri((v) => v.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  }

  function adauga() {
    setFeeduri((v) => [...v, { cheie: "", nume: "", categorii: [], produse: [], excluse: [] }]);
    setDeschis(feeduri.length);
  }

  function sterge(i: number) {
    setFeeduri((v) => v.filter((_, k) => k !== i));
    setDeschis(null);
  }

  function salveaza_() {
    /* Un feed fara nume n-ar primi nici cheie, deci n-ar putea fi cerut. */
    if (feeduri.some((f) => !f.nume.trim())) {
      toast.error("Fiecare feed are nevoie de un nume.");
      return;
    }
    startSalvare(async () => {
      const r = await salveazaFeeduriFacebook(feeduri);
      if ("error" in r) { toast.error(r.error); return; }
      /* Cheile vin inapoi de la server: acolo se genereaza si se dezambiguizeaza. */
      setFeeduri(r.feeduri);
      toast.success("Feeduri salvate.");
    });
  }

  async function numara(i: number) {
    const r = await numaraProduseFeed(feeduri[i]);
    if ("error" in r) { toast.error(r.error); return; }
    setNumarate((v) => ({ ...v, [String(i)]: r.total }));
    if (r.total === 0) {
      toast.warning("Feedul asta n-ar avea niciun produs. Verifica regulile inainte sa-l folosesti.");
    }
  }

  return (
    <div className="space-y-6">
      <Callout variant="info" icon={Info} title="Pentru reclame nu ai nevoie de un feed nou">
        Daca vrei doar sa faci reclama la o parte din produse, creeaza in Commerce Manager un{" "}
        <strong>Product Set</strong> si filtreaza dupa <code className="rounded bg-muted px-1">product_type</code>:
        trimitem deja categoria fiecarui produs. Se actualizeaza singur si nu ai nimic de intretinut.
        Feedurile de mai jos sunt pentru cand ai nevoie de un <strong>catalog separat</strong> — alta agentie,
        alt brand, sau o selectie de campanie.
      </Callout>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Feeduri segmentate</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={adauga}>
            <Plus className="h-3.5 w-3.5" /> Feed nou
          </Button>
        </div>

        {/* Feedul implicit: exista mereu, nu se poate sterge. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <span className="text-sm text-foreground">Toate produsele</span>
          <span className="text-xs text-muted-foreground">{totalProduse}</span>
          <input readOnly value={bazaFeed} onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 py-1.5 font-mono text-[11px]" />
          <Button type="button" variant="outline" size="sm" onClick={() => copiaza(bazaFeed)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>

        {feeduri.length === 0 && (
          <p className="px-5 py-6 text-center text-xs text-muted-foreground">
            Niciun feed segmentat. Cel de mai sus trimite tot catalogul.
          </p>
        )}

        {feeduri.map((f, i) => (
          <div key={i} className="border-b border-border last:border-b-0">
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <input
                value={f.nume}
                onChange={(e) => schimba(i, { nume: e.target.value })}
                placeholder="Numele feedului"
                className="h-8 w-48 rounded-lg border border-input bg-background px-2 text-sm"
              />
              {f.cheie ? (
                <>
                  <input readOnly value={adresa(f)} onFocus={(e) => e.target.select()}
                    className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 py-1.5 font-mono text-[11px]" />
                  <Button type="button" variant="outline" size="sm" onClick={() => copiaza(adresa(f))}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <span className="flex-1 text-xs text-muted-foreground">Adresa se genereaza la salvare.</span>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => setDeschis(deschis === i ? null : i)}>
                {deschis === i ? "Ascunde" : "Reguli"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => sterge(i)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>

            {deschis === i && (
              <div className="space-y-4 bg-muted/30 px-5 py-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-foreground">Categorii</p>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    O categorie aleasa aduce si subcategoriile ei.
                  </p>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-2">
                    {categorii.length === 0 && (
                      <p className="p-2 text-[11px] text-muted-foreground">
                        Magazinul n-are categorii. Foloseste selectia de produse.
                      </p>
                    )}
                    {categorii.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 py-0.5 text-xs"
                        style={{ paddingLeft: `${c.nivel * 14}px` }}>
                        <input
                          type="checkbox"
                          checked={(f.categorii ?? []).includes(c.id)}
                          onChange={(e) => schimba(i, {
                            categorii: e.target.checked
                              ? [...(f.categorii ?? []), c.id]
                              : (f.categorii ?? []).filter((x) => x !== c.id),
                          })}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Produse</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setSelector(selector === `${i}:produse` ? null : `${i}:produse`)}>
                      Alege produse{(f.produse?.length ?? 0) > 0 ? ` (${f.produse!.length})` : ""}
                    </Button>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setSelector(selector === `${i}:excluse` ? null : `${i}:excluse`)}>
                      Exclude produse{(f.excluse?.length ?? 0) > 0 ? ` (${f.excluse!.length})` : ""}
                    </Button>
                  </div>

                  {selector === `${i}:produse` && (
                    <SelectorProduseFeed
                      titlu="Produse incluse"
                      descriere="Se ADUNA cu ce vine din categorii. Fara categorii si fara produse, feedul trimite tot catalogul."
                      alese={f.produse ?? []}
                      onSchimba={(ids) => schimba(i, { produse: ids })}
                      onInchide={() => setSelector(null)}
                    />
                  )}
                  {selector === `${i}:excluse` && (
                    <SelectorProduseFeed
                      titlu="Produse excluse"
                      descriere="Exclusul bate tot: e singurul mod de a scoate un produs din reclame fara sa-l dezactivezi in magazin."
                      alese={f.excluse ?? []}
                      onSchimba={(ids) => schimba(i, { excluse: ids })}
                      onInchide={() => setSelector(null)}
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!!f.doarInStoc}
                      onChange={(e) => schimba(i, { doarInStoc: e.target.checked })} />
                    Doar produse in stoc
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Pret minim</span>
                    <input type="number" min={0} value={f.pretMin ?? ""}
                      onChange={(e) => schimba(i, { pretMin: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2" />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Pret maxim</span>
                    <input type="number" min={0} value={f.pretMax ?? ""}
                      onChange={(e) => schimba(i, { pretMax: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2" />
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => numara(i)}>
                    Cate produse intra?
                  </Button>
                  {numarate[String(i)] !== undefined && (
                    <span className={`text-xs ${numarate[String(i)] === 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {numarate[String(i)]} {numarate[String(i)] === 1 ? "produs" : "produse"}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Fara nicio regula, feedul trimite tot catalogul.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={salveaza_} disabled={salveaza}>
          {salveaza ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {salveaza ? "Se salveaza..." : "Salveaza feedurile"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Dupa salvare, schimbarile ajung la Meta la urmatoarea citire programata. Nu trebuie sa reintri in Commerce Manager.
        </p>
      </div>

      <Callout variant="warning" title="Un feed, un catalog">
        Nu pune doua feeduri care au produse comune ca surse in <strong>acelasi</strong> catalog Meta:
        acelasi produs ar veni din doua parti si Meta intra in conflict. Fie cate un catalog pentru
        fiecare feed, fie feeduri care nu se suprapun.
      </Callout>
    </div>
  );
}
