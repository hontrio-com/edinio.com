"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import type { ContinutMagazin } from "../useContinutMagazin";
import { EditorElemente, EditorIntrebari } from "./liste";
import { Grup, Nota, RandComutator, inputMicCls } from "./ui";
import { EXEMPLU_CONTOR } from "@/lib/storefront/contor-vizitatori";

/**
 * Continutul unui bloc din pagina de produs (etapa 4 din `docs/editor-magazin/PLAN.md`).
 *
 * Fiecare bloc cu continut de scris isi are aici editorul (nodurile `produs_*` din `noduri.ts`);
 * ce scrie omul intra in ciorna si ajunge la clienti la „Publică” (etapa 6). Celelalte spun de unde vine ce arata:
 * fisa produsului, Oferte sau Setari. Comutatoarele de vizibilitate nu mai sunt:
 * le inlocuieste ochiul blocului, singurul control (decizia 4).
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

const DIN_FISA = "Se completează din fișa fiecărui produs.";

/**
 * Comutatorul estimarii de livrare, cu textul si zilele ei. Il au doua blocuri: „Estimarea livrării” la
 * Clasic si caseta „Detalii produs” la Detaliat, unde estimarea e un rand al casetei.
 */
function EstimareaLivrarii({ continut }: { continut: ContinutMagazin }) {
  const { pc, seteaza } = continut;
  const livrare = pc.delivery_estimate!;
  const set = (fn: (p: typeof pc) => typeof pc) => seteaza("produs_livrare", fn);
  return (
    <RandComutator titlu="Arată estimarea livrării" ajutor="Când ajunge comanda, pe pagina produsului. În designul Detaliat apare în caseta „Detalii produs”."
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
  );
}

export function ContinutBloc({ tip, continut }: { tip: string; continut: ContinutMagazin }) {
  const { pc, seteaza, culoare } = continut;

  switch (tip) {
    case "beneficii": {
      const beneficii = pc.benefits_section!;
      return (
        <div className="space-y-4">
          <EditorElemente titlu={beneficii.title} elemente={beneficii.items} eticheta="beneficiu"
            onTitlu={(title) => seteaza("produs_beneficii", (p) => ({ ...p, benefits_section: { ...p.benefits_section!, title } }))}
            onElemente={(items) => seteaza("produs_beneficii", (p) => ({ ...p, benefits_section: { ...p.benefits_section!, items } }))} />
        </div>
      );
    }
    case "cum_functioneaza": {
      const pasi = pc.how_it_works_section!;
      return (
        <div className="space-y-4">
          <EditorElemente titlu={pasi.title} elemente={pasi.steps} eticheta="pas" maxim={5} numerotate
            onTitlu={(title) => seteaza("produs_pasi", (p) => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, title } }))}
            onElemente={(steps) => seteaza("produs_pasi", (p) => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, steps } }))} />
        </div>
      );
    }
    case "intrebari": {
      const intrebari = pc.faq_section!;
      return (
        <div className="space-y-4">
          <EditorIntrebari titlu={intrebari.title} intrebari={intrebari.items}
            onTitlu={(title) => seteaza("produs_intrebari", (p) => ({ ...p, faq_section: { ...p.faq_section!, title } }))}
            onIntrebari={(items) => seteaza("produs_intrebari", (p) => ({ ...p, faq_section: { ...p.faq_section!, items } }))} />
        </div>
      );
    }
    case "livrare":
      return <div className="space-y-4"><EstimareaLivrarii continut={continut} /></div>;
    /*
     * La Detaliat estimarea e un rand din caseta, nu un bloc al ei: fara comutatorul de aici, cine
     * foloseste Detaliat n-avea de unde s-o porneasca (gasit la ghidurile din 28.10.2026).
     */
    case "detalii":
      return (
        <div className="space-y-4">
          <Nota href="/dashboard/products" eticheta="Produse">Codul, codul EAN, categoria și greutatea vin din fișa fiecărui produs.</Nota>
          <EstimareaLivrarii continut={continut} />
        </div>
      );
    case "cumparare":
      return (
        <div className="space-y-4">
          <Grup titlu="Efectul butonului „Comandă acum”">
            <div className="grid grid-cols-3 gap-2">
              {EFECTE.map(({ id, eticheta }) => (
                <PrevizualizareEfect key={id} id={id} eticheta={eticheta} culoare={culoare} ales={(pc.button_effect ?? "none") === id}
                  onAlege={() => seteaza("produs_cumparare", (p) => ({ ...p, button_effect: id }))} />
              ))}
            </div>
          </Grup>
          <Nota>Butonul „Adaugă în coș” îl pornești sau îl oprești din setările Paginii de produs.</Nota>
        </div>
      );
    case "incredere":
      return <Nota>Textele garanțiilor (plata, livrarea, returul) sunt fixe deocamdată.</Nota>;
    /*
     * Etapa 12: contorul numara oameni adevarati. Ce numara il alege comerciantul (raspunsul lui:
     * „Alege comerciantul”), implicit ultimele 24 de ore: „Acum” ar fi gol la 95% din vizite.
     */
    case "dovada": {
      const fereastra = pc.social_proof_window === "now" ? "now" : "day";
      return (
        <div className="space-y-4">
          <Grup titlu="Ce numără">
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "day", eticheta: "Ultimele 24 de ore" },
                { id: "now", eticheta: "Acum" },
              ] as const).map(({ id, eticheta }) => (
                <button key={id} type="button" aria-pressed={fereastra === id}
                  onClick={() => seteaza("produs_dovada", (p) => ({ ...p, social_proof_window: id }))}
                  className={cn("rounded-lg border-2 px-2 py-2 text-xs font-medium transition-colors",
                    fereastra === id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40")}>
                  {eticheta}
                </button>
              ))}
            </div>
          </Grup>
          <Nota>
            Numărul e real: câți oameni diferiți au deschis produsul, fără cel care se uită și fără roboți.
            „Acum” înseamnă ultimele 15 minute. Când nu e nimeni, contorul nu apare. În previzualizare vezi
            atunci un exemplu ({EXEMPLU_CONTOR}).
          </Nota>
        </div>
      );
    }
    case "insigna":
      return <Nota>Eticheta cu stele de lângă titlu.</Nota>;
    case "oferte":
    case "set":
      return <Nota href="/dashboard/offers" eticheta="Oferte">Ofertele le creezi și le așezi din Oferte.</Nota>;
    case "contact":
      return <Nota setare="general" eticheta="Setări > Informații generale">Telefonul și WhatsApp-ul vin din fila Setări, de la Informații generale.</Nota>;
    /* Pe un produs obisnuit ochiul lor nu schimba nimic in previzualizare: nota spune de ce. */
    case "pachet":
      return (
        <Nota href="/dashboard/products" eticheta="Produse">
          Apare doar la produsele de tip pachet, lângă preț. Componentele le alegi în fișa pachetului.
        </Nota>
      );
    case "continut_pachet":
      return (
        <Nota href="/dashboard/products" eticheta="Produse">
          Apare doar la produsele de tip pachet, ca listă mare sub produs. Componentele le alegi în fișa pachetului.
        </Nota>
      );
    case "rezumat":
      return (
        <Nota href="/dashboard/products" eticheta="Produse">
          {DIN_FISA} Câte rânduri arată rezumatul alegi în setările Paginii de produs.
        </Nota>
      );
    default:
      return <Nota href="/dashboard/products" eticheta="Produse">{DIN_FISA}</Nota>;
  }
}
