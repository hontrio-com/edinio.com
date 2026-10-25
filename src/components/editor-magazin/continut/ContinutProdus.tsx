"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import type { ContinutMagazin } from "../useContinutMagazin";
import { EditorCarduri, EditorElemente, EditorIntrebari } from "./liste";
import { BaraSalvare, Grup, Nota, RandComutator, inputMicCls } from "./ui";

/**
 * Continutul paginii de produs: blocurile pe care le are pagina fiecarui produs.
 *
 * Mutat din panoul „Pagina produs” al editorului vechi. Comutatoarele de aici
 * raman: nu exista alt control pentru ele (pagina de produs e o singura sectiune
 * pana in etapa 4, cand se sparge in blocuri cu ochiul lor).
 */

const EFECTE = [
  { id: "none", eticheta: "Niciun efect" },
  { id: "pulse", eticheta: "Pulse" },
  { id: "shake", eticheta: "Shake" },
  { id: "bounce", eticheta: "Bounce" },
  { id: "glow", eticheta: "Glow" },
  { id: "heartbeat", eticheta: "Heartbeat" },
];

/** Miniatura animata a efectului de buton, ca omul sa vada ce alege. */
function PrevizualizareEfect({ id, eticheta, culoare, ales, onAlege }: {
  id: string; eticheta: string; culoare: string; ales: boolean; onAlege: () => void;
}) {
  const cls = "w-full py-1.5 text-[10px] font-bold text-white rounded-md text-center select-none";
  const buton = (() => {
    if (id === "pulse") return (
      <div className="relative">
        <motion.div className="absolute inset-0 rounded-md pointer-events-none" style={{ backgroundColor: culoare }}
          animate={{ opacity: [0.7, 0], scale: [1, 1.25] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }} />
        <div className={cls} style={{ backgroundColor: culoare }}>{eticheta}</div>
      </div>
    );
    if (id === "shake") return (
      <motion.div className={cls} style={{ backgroundColor: culoare }} animate={{ x: [0, -4, 4, -4, 4, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}>{eticheta}</motion.div>
    );
    if (id === "bounce") return (
      <motion.div className={cls} style={{ backgroundColor: culoare }} animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}>{eticheta}</motion.div>
    );
    if (id === "glow") return (
      <motion.div className={cls} style={{ backgroundColor: culoare }}
        animate={{ boxShadow: [`0px 1px 4px ${culoare}44`, `0px 2px 16px ${culoare}CC`, `0px 1px 4px ${culoare}44`] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>{eticheta}</motion.div>
    );
    if (id === "heartbeat") return (
      <motion.div className={cls} style={{ backgroundColor: culoare }} animate={{ scale: [1, 1.08, 1, 1.08, 1] }}
        transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.5 }}>{eticheta}</motion.div>
    );
    return <div className={cls} style={{ backgroundColor: culoare }}>{eticheta}</div>;
  })();
  return (
    <button type="button" onClick={onAlege} aria-pressed={ales} aria-label={`Efect: ${eticheta}`}
      className={cn("p-2 rounded-xl border-2 transition-colors overflow-hidden", ales ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
      {buton}
    </button>
  );
}

export function ContinutProdus({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza, culoare } = continut;
  const set = (fn: (p: typeof pc) => typeof pc) => seteaza("produs", fn);
  const beneficii = pc.benefits_section!;
  const pasi = pc.how_it_works_section!;
  const intrebari = pc.faq_section!;
  const livrare = pc.delivery_estimate!;

  return (
    <div className="space-y-6">
      <Nota>Blocurile de mai jos apar pe pagina fiecărui produs. Le vezi în dreapta pe un produs al tău.</Nota>

      <RandComutator titlu="Garanții (4 carduri)" pornit={pc.trust_badges_enabled !== false}
        onSchimba={(v) => set((p) => ({ ...p, trust_badges_enabled: v }))}>
        <EditorCarduri carduri={pc.trust_badges ?? []} onSchimba={(c) => set((p) => ({ ...p, trust_badges: c }))} />
      </RandComutator>

      <RandComutator titlu="Beneficii" pornit={beneficii.enabled}
        onSchimba={(v) => set((p) => ({ ...p, benefits_section: { ...p.benefits_section!, enabled: v } }))}>
        <EditorElemente titlu={beneficii.title} elemente={beneficii.items} eticheta="beneficiu"
          onTitlu={(title) => set((p) => ({ ...p, benefits_section: { ...p.benefits_section!, title } }))}
          onElemente={(items) => set((p) => ({ ...p, benefits_section: { ...p.benefits_section!, items } }))} />
      </RandComutator>

      <RandComutator titlu="Cum funcționează" pornit={pasi.enabled}
        onSchimba={(v) => set((p) => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, enabled: v } }))}>
        <EditorElemente titlu={pasi.title} elemente={pasi.steps} eticheta="pas" maxim={5} numerotate
          onTitlu={(title) => set((p) => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, title } }))}
          onElemente={(steps) => set((p) => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, steps } }))} />
      </RandComutator>

      <RandComutator titlu="Întrebări frecvente" pornit={intrebari.enabled}
        onSchimba={(v) => set((p) => ({ ...p, faq_section: { ...p.faq_section!, enabled: v } }))}>
        <EditorIntrebari titlu={intrebari.title} intrebari={intrebari.items}
          onTitlu={(title) => set((p) => ({ ...p, faq_section: { ...p.faq_section!, title } }))}
          onIntrebari={(items) => set((p) => ({ ...p, faq_section: { ...p.faq_section!, items } }))} />
      </RandComutator>

      <RandComutator titlu="Zoom pe imagine" ajutor="Mărește imaginea produsului când treci cu mouse-ul, pe calculator."
        pornit={pc.image_zoom?.enabled !== false}
        onSchimba={(v) => set((p) => ({ ...p, image_zoom: { enabled: v } }))} />

      <RandComutator titlu="Estimarea livrării" ajutor="Arată pe pagina produsului când ajunge comanda."
        pornit={livrare.enabled}
        onSchimba={(v) => set((p) => ({ ...p, delivery_estimate: { ...p.delivery_estimate!, enabled: v } }))}>
        <div className="space-y-2">
          <input type="text" value={livrare.text ?? "Estimare livrare"} className={inputMicCls} aria-label="Textul estimării"
            placeholder="Estimare livrare"
            onChange={(e) => set((p) => ({ ...p, delivery_estimate: { ...p.delivery_estimate!, text: e.target.value } }))} />
          {/* Cand zilele sunt declarate in Setari > Livrare, ELE se afiseaza si tot ele pleaca la Google. */}
          {pc.delivery_time?.enabled ? (
            <Nota href="/dashboard/settings?sectiune=livrare" eticheta="Setări > Livrare">
              Zilele vin din Setări &gt; Livrare &gt; Timp de livrare ({pc.delivery_time.handling_min + pc.delivery_time.transit_min}-{pc.delivery_time.handling_max + pc.delivery_time.transit_max} zile). Aceleași zile pleacă și la Google.
            </Nota>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] text-muted-foreground mb-1 block">Zile minim</span>
                <input type="number" min={1} max={30} value={livrare.min_days ?? 2} className={inputMicCls}
                  onChange={(e) => set((p) => ({ ...p, delivery_estimate: { ...p.delivery_estimate!, min_days: parseInt(e.target.value) || 2 } }))} />
              </label>
              <label className="block">
                <span className="text-[10px] text-muted-foreground mb-1 block">Zile maxim</span>
                <input type="number" min={1} max={30} value={livrare.max_days ?? 4} className={inputMicCls}
                  onChange={(e) => set((p) => ({ ...p, delivery_estimate: { ...p.delivery_estimate!, max_days: parseInt(e.target.value) || 4 } }))} />
              </label>
            </div>
          )}
        </div>
      </RandComutator>

      <RandComutator titlu="Contor de vizitatori" ajutor="Câte persoane se uită acum la produs. Oprit din start."
        pornit={pc.show_social_proof === true} onSchimba={(v) => set((p) => ({ ...p, show_social_proof: v }))} />

      <RandComutator titlu="Eticheta „Calitate verificată”" ajutor="Eticheta cu stele de pe pagina produsului. Oprită din start."
        pornit={pc.show_quality_badge === true} onSchimba={(v) => set((p) => ({ ...p, show_quality_badge: v }))} />

      <Grup titlu="Efectul butonului „Comandă acum”">
        <div className="grid grid-cols-3 gap-2">
          {EFECTE.map(({ id, eticheta }) => (
            <PrevizualizareEfect key={id} id={id} eticheta={eticheta} culoare={culoare} ales={(pc.button_effect ?? "none") === id}
              onAlege={() => set((p) => ({ ...p, button_effect: id }))} />
          ))}
        </div>
      </Grup>

      <BaraSalvare continut={continut} nod="produs" />
    </div>
  );
}
