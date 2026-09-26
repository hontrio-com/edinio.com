"use client";

import { createContext, useContext, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Play } from "lucide-react";
import type { BlockStyle } from "@/lib/pages/blocks.types";
import { ANIMATII } from "@/lib/pages/animatii";
import { CampCuloare } from "./CampCuloare";
import { CampImagine } from "./CampImagine";
import { Grup, Range, Segmentat, Select, Toggle } from "./campuri";

/** Reda animatia blocului selectat, in editor (vezi `cheieAnimatie` din PageBuilder). */
export const RedaAnimatia = createContext<(() => void) | null>(null);

type Ascuns = "width" | "align" | "bg" | "padding" | "box";

/*
  Aspectul comun al unui bloc: spatiere, latime, aliniere, fundal (culoare,
  degrade sau imagine), cutie, vizibilitate pe dispozitive. Plus animatia, in
  grupul ei. Totul se scrie in `block.style`; vezi `BlockShell`.
*/
export function ControaleAspect({ style, onChange, hide, showTextColor }: {
  style?: BlockStyle;
  onChange: (s: BlockStyle) => void;
  hide?: Ascuns[];
  showTextColor?: boolean;
}) {
  const h = (k: Ascuns) => !!hide?.includes(k);
  const s = style ?? {};
  const set = (p: Partial<BlockStyle>) => onChange({ ...s, ...p });
  /* „Imagine” aleasa, dar fara imagine inca: tinuta aici (26.09.2026). Dedusa numai din
     `bgImage`, alegerea sarea inapoi pe „Culoare” si campul de imagine nu aparea niciodata. */
  const [imagineAleasa, setImagineAleasa] = useState(false);
  const felFundal: "culoare" | "degrade" | "imagine" = s.bgImage || imagineAleasa ? "imagine" : s.bgGradient ? "degrade" : "culoare";

  return (
    <>
      <Grup titlu="Aspect">
        {!h("padding") && (
          <>
            <Select label="Spațiere sus și jos" value={s.padding ?? "md"} onChange={(v) => set({ padding: v })}
              options={[{ value: "none", label: "Fără" }, { value: "sm", label: "Mică" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }, { value: "xl", label: "Foarte mare" }, { value: "custom", label: "Personalizată" }]} />
            {s.padding === "custom" && <Range label="Spațiere" value={s.paddingCustom ?? 32} min={0} max={240} onChange={(v) => set({ paddingCustom: v })} />}
          </>
        )}
        {!h("width") && (
          <>
            <Select label="Lățime" value={s.width ?? "container"} onChange={(v) => set({ width: v })}
              options={[{ value: "narrow", label: "Îngustă (text)" }, { value: "container", label: "Standard" }, { value: "wide", label: "Lată" }, { value: "full", label: "Tot ecranul" }, { value: "custom", label: "Personalizată" }]} />
            {s.width === "custom" && <Range label="Lățime maximă" value={s.widthCustom ?? 960} min={320} max={1600} step={20} onChange={(v) => set({ widthCustom: v })} />}
          </>
        )}
        {!h("align") && (
          <Segmentat label="Aliniere" value={s.align ?? "left"} onChange={(v) => set({ align: v })}
            options={[
              { value: "left", label: <AlignLeft className="h-3.5 w-3.5" />, titlu: "Stânga" },
              { value: "center", label: <AlignCenter className="h-3.5 w-3.5" />, titlu: "Centru" },
              { value: "right", label: <AlignRight className="h-3.5 w-3.5" />, titlu: "Dreapta" },
            ]} />
        )}
        {showTextColor && <CampCuloare eticheta="Culoare text" valoare={s.textColor} onChange={(v) => set({ textColor: v })} poateFiGol />}

        {!h("bg") && (
          <>
            <Segmentat label="Fundal" value={felFundal}
              onChange={(v) => {
                setImagineAleasa(v === "imagine");
                if (v === "culoare") set({ bgGradient: null, bgImage: null });
                else if (v === "degrade") set({ bgImage: null, bgGradient: s.bgGradient ?? { from: "#07c527", to: "#0891b2", angle: 135 } });
                else set({ bgGradient: null, bgImage: s.bgImage ?? null, bgOverlay: s.bgOverlay ?? 40 });
              }}
              options={[{ value: "culoare", label: "Culoare" }, { value: "degrade", label: "Degradé" }, { value: "imagine", label: "Imagine" }]} />
            {felFundal === "culoare" && <CampCuloare eticheta="Culoare fundal" valoare={s.bg} onChange={(v) => set({ bg: v })} poateFiGol />}
            {felFundal === "degrade" && s.bgGradient && (
              <>
                <CampCuloare eticheta="De la" valoare={s.bgGradient.from} onChange={(v) => v && set({ bgGradient: { ...s.bgGradient!, from: v } })} />
                <CampCuloare eticheta="Până la" valoare={s.bgGradient.to} onChange={(v) => v && set({ bgGradient: { ...s.bgGradient!, to: v } })} />
                <Range label="Direcție" unit="°" value={s.bgGradient.angle ?? 135} min={0} max={360} step={15} onChange={(v) => set({ bgGradient: { ...s.bgGradient!, angle: v } })} />
              </>
            )}
            {felFundal === "imagine" && (
              <>
                <CampImagine eticheta="Imagine fundal" valoare={s.bgImage} onChange={(v) => set({ bgImage: v })} ajutor="Lată, cel puțin 1600 px. Textul se citește mai bine cu un strat întunecat." />
                <Range label="Strat întunecat" unit="%" value={s.bgOverlay ?? 40} min={0} max={80} step={5} onChange={(v) => set({ bgOverlay: v })} />
                <Toggle label="Imaginea stă pe loc la derulare (paralaxă)" checked={!!s.bgFixed} onChange={(v) => set({ bgFixed: v })} />
              </>
            )}
          </>
        )}

        {!h("box") && (
          <>
            <Toggle label="Conținut într-o cutie (card)" checked={!!s.boxed} onChange={(v) => set({ boxed: v })} ajutor="Fundal propriu, colțuri rotunjite și umbră, peste fundalul secțiunii." />
            {s.boxed && (
              <>
                <CampCuloare eticheta="Fundalul cutiei" valoare={s.boxBg} onChange={(v) => set({ boxBg: v })} poateFiGol />
                <Segmentat label="Colțuri" value={s.radius ?? "lg"} onChange={(v) => set({ radius: v })}
                  options={[{ value: "none", label: "Drepte" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }]} />
                <Segmentat label="Umbră" value={s.shadow ?? "none"} onChange={(v) => set({ shadow: v })}
                  options={[{ value: "none", label: "Fără" }, { value: "sm", label: "Fină" }, { value: "md", label: "Medie" }, { value: "lg", label: "Mare" }]} />
                <CampCuloare eticheta="Contur" valoare={s.borderColor} onChange={(v) => set({ borderColor: v })} poateFiGol />
              </>
            )}
          </>
        )}

        <Segmentat label="Se vede pe" value={s.hideOn ?? "toate"}
          onChange={(v) => set({ hideOn: v === "toate" ? null : (v as "mobile" | "desktop") })}
          options={[{ value: "toate", label: "Toate" }, { value: "mobile", label: "Doar desktop" }, { value: "desktop", label: "Doar telefon" }]} />
      </Grup>

      <ControaleAnimatie style={s} onChange={onChange} />
    </>
  );
}

export function ControaleAnimatie({ style, onChange }: { style?: BlockStyle; onChange: (s: BlockStyle) => void }) {
  const s = style ?? {};
  const set = (p: Partial<BlockStyle>) => onChange({ ...s, ...p });
  const activa = !!s.anim && s.anim !== "none";
  const reda = useContext(RedaAnimatia);
  return (
    <Grup titlu="Animație" insigna={activa ? ANIMATII.find((a) => a.cheie === s.anim)?.nume : undefined}>
      <Select label="La apariție" value={s.anim ?? "none"} onChange={(v) => set({ anim: v })}
        options={ANIMATII.map((a) => ({ value: a.cheie, label: a.nume }))}
        ajutor="Pornește când blocul intră în ecran, o singură dată. Vizitatorii care au cerut mai puțină mișcare în telefon îl văd direct." />
      {activa && (
        <>
          <Segmentat label="Viteză" value={s.animSpeed ?? "normal"} onChange={(v) => set({ animSpeed: v })}
            options={[{ value: "fast", label: "Rapidă" }, { value: "normal", label: "Normală" }, { value: "slow", label: "Lentă" }]} />
          <Range label="Întârziere" unit=" ms" value={s.animDelay ?? 0} min={0} max={1500} step={100} onChange={(v) => set({ animDelay: v })} />
          {reda && (
            <button type="button" onClick={reda}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted">
              <Play className="h-3.5 w-3.5" /> Redă animația
            </button>
          )}
        </>
      )}
    </Grup>
  );
}
