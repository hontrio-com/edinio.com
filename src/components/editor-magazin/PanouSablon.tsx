"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, LayoutTemplate, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductPicker } from "@/components/pages/ProductPicker";
import {
  atribuieLaSablon,
  categoriiAcoperite,
  MAX_NUME_SABLON,
  redenumesteSablon,
  seteazaProduseSablon,
  stergeSablon,
} from "@/lib/storefront/design/sabloane-produs";
import type { StoreDesign } from "@/lib/storefront/design/types";
import { Grup, Nota, inputCls } from "./continut/ui";
import type { CiornaDesign } from "./useCiornaDesign";

type Cat = { id: string; name: string; parent_id: string | null; sort_order?: number };

/** Categoriile in ordinea arborelui (parinte, apoi copiii lui), cu adancimea fiecareia. */
function inOrdineaArborelui(categorii: readonly Cat[]): { cat: Cat; adancime: number }[] {
  const ids = new Set(categorii.map((c) => c.id));
  const copii = new Map<string | null, Cat[]>();
  for (const c of categorii) {
    // Un parinte care nu mai exista: categoria se arata ca radacina, nu dispare.
    const parinte = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
    copii.set(parinte, [...(copii.get(parinte) ?? []), c]);
  }
  const ordine = (a: Cat, b: Cat) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ro");
  const out: { cat: Cat; adancime: number }[] = [];
  const vazute = new Set<string>();
  const coboara = (parinte: string | null, adancime: number) => {
    for (const c of [...(copii.get(parinte) ?? [])].sort(ordine)) {
      if (vazute.has(c.id)) continue;
      vazute.add(c.id);
      out.push({ cat: c, adancime });
      coboara(c.id, Math.min(adancime + 1, 6));
    }
  };
  coboara(null, 0);
  return out;
}

/**
 * Setarile unui sablon al paginii de produs (etapa 4b din `docs/editor-magazin/PLAN.md`): numele,
 * categoriile care il folosesc, produsele-exceptie si stergerea. Cum arata (designul, blocurile)
 * se regleaza din arbore, cu sablonul ales acolo. Totul e ciorna: ajunge in magazin la Publica.
 */
export function PanouSablon({ design, sablonId, ciorna, categorii, businessId, onInapoi, onSters }: {
  design: StoreDesign;
  sablonId: string;
  ciorna: CiornaDesign;
  categorii: Cat[];
  businessId: string;
  onInapoi: () => void;
  onSters: () => void;
}) {
  const sabloane = design.product.sabloane ?? [];
  const sablon = sabloane.find((s) => s.page.id === sablonId);
  const [nume, setNume] = useState(sablon?.nume ?? "");
  const [confirmaStergerea, setConfirmaStergerea] = useState(false);
  const ordonate = useMemo(() => inOrdineaArborelui(categorii), [categorii]);
  if (!sablon) return null;

  /** Sablonul la care e bifata direct fiecare categorie, cu numele lui. */
  const laSablon = new Map<string, string>();
  for (const s of sabloane) for (const c of s.categorii) laSablon.set(c, s.nume);
  const alteBifate = new Set(sabloane.filter((s) => s !== sablon).flatMap((s) => s.categorii));
  const acoperite = categoriiAcoperite(categorii, sablon.categorii, alteBifate);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onInapoi} aria-label="Înapoi la secțiuni"
          className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground leading-snug break-words">{sablon.nume}</h2>
          <p className="text-[11px] text-muted-foreground leading-snug">Șablon al paginii de produs</p>
        </div>
      </div>

      <Nota>
        Cum arată (designul, blocurile) reglezi din arbore, cu șablonul ales acolo. Aici alegi cine îl folosește.
        Totul ajunge în magazin după Publică.
      </Nota>

      <Grup titlu="Numele">
        <input type="text" value={nume} maxLength={MAX_NUME_SABLON} className={inputCls} aria-label="Numele șablonului"
          onChange={(e) => {
            setNume(e.target.value);
            ciorna.aplica((d: StoreDesign) => redenumesteSablon(d, sablonId, e.target.value), `nume-sablon:${sablonId}`);
          }} />
        <p className="text-[11px] text-muted-foreground">Se vede doar aici, în editor.</p>
      </Grup>

      <Grup titlu="Categoriile care îl folosesc">
        {ordonate.length === 0 ? (
          <Nota href="/dashboard/products/categories" eticheta="Produse > Categorii">Magazinul nu are încă nicio categorie.</Nota>
        ) : (
          <ul className="max-h-72 overflow-y-auto rounded-lg border border-border p-1.5 space-y-0.5">
            {ordonate.map(({ cat, adancime }) => {
              const bifata = sablon.categorii.includes(cat.id);
              const prinParinte = !bifata && acoperite.has(cat.id);
              const laAltul = !bifata && !prinParinte ? laSablon.get(cat.id) ?? null : null;
              return (
                <li key={cat.id}>
                  <label className="flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-muted/50 cursor-pointer"
                    style={{ paddingLeft: 8 + adancime * 16 }}>
                    <input type="checkbox" checked={bifata || prinParinte} disabled={prinParinte}
                      onChange={(e) => ciorna.aplica((d: StoreDesign) => atribuieLaSablon(d, sablonId, "categorii", cat.id, e.target.checked))}
                      className="accent-primary h-3.5 w-3.5 shrink-0" />
                    <span className="text-sm text-foreground truncate">{cat.name}</span>
                    {prinParinte && <span className="ml-auto text-[10px] text-muted-foreground shrink-0">prin părinte</span>}
                    {laAltul && <span className="ml-auto text-[10px] text-amber-600 shrink-0 truncate max-w-[45%]">acum: {laAltul}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          O categorie bifată aduce și subcategoriile ei. Bifată aici, o categorie trece de la alt șablon la acesta.
        </p>
      </Grup>

      <Grup titlu="Produse anume">
        <ProductPicker businessId={businessId} selectedIds={sablon.produse} maxim={100}
          onChange={(ids) => ciorna.aplica((d: StoreDesign) => seteazaProduseSablon(d, sablonId, ids))} />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Un produs ales aici folosește șablonul oricare i-ar fi categoria.
        </p>
      </Grup>

      <button type="button" onClick={() => setConfirmaStergerea(true)}
        className="w-full h-10 rounded-lg border border-destructive/30 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors inline-flex items-center justify-center gap-2">
        <Trash2 className="h-4 w-4" /> Șterge șablonul
      </button>

      <Dialog open={confirmaStergerea} onOpenChange={setConfirmaStergerea}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ștergi șablonul „{sablon.nume}”?</DialogTitle>
            <DialogDescription>
              Produsele lui trec pe șablonul Implicit, sau pe al altei categorii a lor. În magazin se vede după Publică.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmaStergerea(false)}>Nu</Button>
            <Button variant="destructive" onClick={() => {
              ciorna.aplica((d: StoreDesign) => stergeSablon(d, sablonId));
              setConfirmaStergerea(false);
              onSters();
            }}>
              Da, șterge-l
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
