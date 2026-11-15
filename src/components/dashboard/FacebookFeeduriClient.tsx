"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Info, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Sectiune } from "@/components/dashboard/integrare/PaginaIntegrare";
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

  const copiaza = (v: string) => { navigator.clipboard?.writeText(v); toast.success("Adresa a fost copiată."); };
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
      let r: Awaited<ReturnType<typeof salveazaFeeduriFacebook>>;
      try {
        r = await salveazaFeeduriFacebook(feeduri);
      } catch {
        /* ⚠ Cheile feedurilor vin inapoi DE LA SERVER (`setFeeduri(r.feeduri)`), deci la o cadere
           lista de pe ecran ramane cea dinainte. Nu cerem reincarcare: ar sterge ce a scris omul. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca feedurile s-au salvat. Apasa din nou pe salvare: trimitem toata "
          + "lista, deci a doua apasare nu strica nimic.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in r) { toast.error(r.error); return; }
      /* Cheile vin inapoi de la server: acolo se genereaza si se dezambiguizeaza. */
      setFeeduri(r.feeduri);
      toast.success("Feedurile au fost salvate.");
    });
  }

  async function numara(i: number) {
    const r = await numaraProduseFeed(feeduri[i]);
    if ("error" in r) { toast.error(r.error); return; }
    setNumarate((v) => ({ ...v, [String(i)]: r.total }));
    if (r.total === 0) {
      toast.warning("Feedul acesta n-ar avea niciun produs. Verifică regulile înainte să-l folosești.");
    }
  }

  return (
    <Sectiune pas={3} titlu="Feeduri segmentate" descriere="Cataloage separate, pe categorii, pe o selecție de produse sau pe condiții.">
      <Callout variant="info" icon={Info} title="Pentru reclame nu ai nevoie de un feed nou">
        Dacă vrei doar să faci reclamă la o parte din produse, creează în Commerce Manager un{" "}
        <strong>Product Set</strong> și filtrează după <code className="rounded bg-muted px-1">product_type</code>:
        trimitem deja categoria fiecărui produs. Feedurile de mai jos sunt pentru un <strong>catalog separat</strong>:
        altă agenție, alt brand sau o selecție de campanie.
      </Callout>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="h-4 w-4 text-muted-foreground" /> Feedurile tale
          </p>
          <Button type="button" size="sm" variant="outline" onClick={adauga}>
            <Plus /> Feed nou
          </Button>
        </div>

        {/* Feedul implicit: exista mereu, nu se poate sterge. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-sm text-foreground">Toate produsele</span>
          <span className="text-xs tabular-nums text-muted-foreground">{totalProduse}</span>
          <input readOnly aria-label="Adresa feedului cu toate produsele" value={bazaFeed} onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 py-1.5 font-mono text-[11px]" />
          <Button type="button" variant="outline" size="icon-sm" aria-label="Copiază adresa" onClick={() => copiaza(bazaFeed)}>
            <Copy />
          </Button>
        </div>

        {feeduri.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Niciun feed segmentat. Cel de mai sus trimite tot catalogul.
          </p>
        )}

        {feeduri.map((f, i) => (
          <div key={i} className="border-b border-border last:border-b-0">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <input
                value={f.nume}
                aria-label="Numele feedului"
                onChange={(e) => schimba(i, { nume: e.target.value })}
                placeholder="Numele feedului"
                className="h-8 w-48 rounded-lg border border-input bg-background px-2 text-sm"
              />
              {f.cheie ? (
                <>
                  <input readOnly aria-label={`Adresa feedului ${f.nume}`} value={adresa(f)} onFocus={(e) => e.target.select()}
                    className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 py-1.5 font-mono text-[11px]" />
                  <Button type="button" variant="outline" size="icon-sm" aria-label="Copiază adresa" onClick={() => copiaza(adresa(f))}>
                    <Copy />
                  </Button>
                </>
              ) : (
                <span className="flex-1 text-xs text-muted-foreground">Adresa apare după salvare.</span>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => setDeschis(deschis === i ? null : i)}>
                {deschis === i ? "Ascunde" : "Reguli"}
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Șterge feedul" onClick={() => sterge(i)}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>

            {deschis === i && (
              <div className="space-y-4 bg-muted/30 px-4 py-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-foreground">Categorii</p>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    O categorie aleasă aduce și subcategoriile ei.
                  </p>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-2">
                    {categorii.length === 0 && (
                      <p className="p-2 text-[11px] text-muted-foreground">
                        Magazinul n-are categorii. Folosește selecția de produse.
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
                      descriere="Se ADUNĂ cu ce vine din categorii. Fără categorii și fără produse, feedul trimite tot catalogul."
                      alese={f.produse ?? []}
                      onSchimba={(ids) => schimba(i, { produse: ids })}
                      onInchide={() => setSelector(null)}
                    />
                  )}
                  {selector === `${i}:excluse` && (
                    <SelectorProduseFeed
                      titlu="Produse excluse"
                      descriere="Excluderea bate tot: e singurul mod de a scoate un produs din reclame fără să-l dezactivezi în magazin."
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
                    Doar produse în stoc
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Preț minim</span>
                    <input type="number" min={0} value={f.pretMin ?? ""}
                      onChange={(e) => schimba(i, { pretMin: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2" />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Preț maxim</span>
                    <input type="number" min={0} value={f.pretMax ?? ""}
                      onChange={(e) => schimba(i, { pretMax: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2" />
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => numara(i)}>
                    Câte produse intră?
                  </Button>
                  {numarate[String(i)] !== undefined && (
                    <span className={`text-xs ${numarate[String(i)] === 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {numarate[String(i)]} {numarate[String(i)] === 1 ? "produs" : "produse"}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Fără nicio regulă, feedul trimite tot catalogul.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={salveaza_} disabled={salveaza}>
          {salveaza && <Loader2 className="animate-spin" />}
          Salvează feedurile
        </Button>
        <p className="text-xs text-muted-foreground">
          Schimbările ajung la Meta la următoarea citire programată. Nu trebuie să reintri în Commerce Manager.
        </p>
      </div>

      <Callout variant="warning" title="Un feed, un catalog">
        Nu pune două feeduri care au produse comune ca surse în <strong>același</strong> catalog Meta:
        același produs ar veni din două părți și Meta intră în conflict. Fie câte un catalog pentru
        fiecare feed, fie feeduri care nu se suprapun.
      </Callout>
    </Sectiune>
  );
}
