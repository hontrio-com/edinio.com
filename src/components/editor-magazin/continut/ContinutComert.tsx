"use client";

import type { ContinutMagazin } from "../useContinutMagazin";
import { BaraSalvare, Nota, RandComutator, inputMicCls } from "./ui";

/**
 * Cardul de produs si cosul: reglaje care se vad pe orice pagina cu produse.
 *
 * Stateau in panoul „Pagina principala” al editorului vechi, desi cardul apare
 * si in catalog, si in randuri, si in cautare.
 */

export function ContinutCard({ continut, faraSalvare = false }: { continut: ContinutMagazin; faraSalvare?: boolean }) {
  const { pc, seteaza } = continut;
  const set = (fn: (p: typeof pc) => typeof pc) => seteaza("card", fn);
  return (
    <div className="space-y-5">
      <RandComutator titlu="Categoria pe card" ajutor="Arată categoria produsului pe cardurile din magazin."
        pornit={pc.show_category_badges !== false} onSchimba={(v) => set((p) => ({ ...p, show_category_badges: v }))} />
      <RandComutator titlu="Eticheta „Nou”" ajutor="Apare singură pe produsele adăugate recent."
        pornit={pc.new_badge?.enabled !== false}
        onSchimba={(v) => set((p) => ({ ...p, new_badge: { ...p.new_badge!, enabled: v } }))}>
        <label className="block">
          <span className="text-[10px] text-muted-foreground mb-1 block">Câte zile e „nou” un produs</span>
          <input type="number" min={1} max={90} value={pc.new_badge?.days ?? 7} className={inputMicCls}
            onChange={(e) => set((p) => ({ ...p, new_badge: { ...p.new_badge!, days: parseInt(e.target.value) || 7 } }))} />
        </label>
      </RandComutator>
      <RandComutator titlu="Intervalul de preț la produsele cu variante"
        ajutor={pc.price_range_display?.enabled !== false
          ? "Produsele cu mai multe prețuri arată „De la X - Y lei”."
          : "Se arată doar prețul cel mai mic."}
        pornit={pc.price_range_display?.enabled !== false}
        onSchimba={(v) => set((p) => ({ ...p, price_range_display: { enabled: v } }))} />
      {!faraSalvare && <BaraSalvare continut={continut} nod="card" />}
    </div>
  );
}

export function ContinutCos({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;
  return (
    <div className="space-y-5">
      <RandComutator titlu="Bara de coș pe telefon" ajutor="Un buton fix jos, cu numărul de produse și totalul."
        pornit={pc.sticky_cart_bar?.enabled !== false}
        onSchimba={(v) => seteaza("cos", (p) => ({ ...p, sticky_cart_bar: { enabled: v } }))} />
      <Nota href="/dashboard/settings?sectiune=livrare" eticheta="Setări > Livrare">
        Pragul de livrare gratuită și comanda minimă, pe care le arată coșul, se aleg din Setări.
      </Nota>
      <BaraSalvare continut={continut} nod="cos" />
    </div>
  );
}
