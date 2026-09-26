"use client";

import type { BlockStyle, MapBlock } from "@/lib/pages/blocks.types";
import { inaltimeaHartii, zoomul } from "@/lib/pages/harta";
import { SiglaGoogleMaps, SiglaWaze } from "../blocks/SigleleHartii";
import { ControaleAspect } from "./ControaleAspect";
import { Grup, Range, Segmentat, Text, Toggle } from "./campuri";

export function SetariHarta({ block: b, patch, setStyle }: {
  block: MapBlock;
  patch: (p: Partial<MapBlock>) => void;
  setStyle: (s: BlockStyle) => void;
}) {
  return (
    <div className="space-y-4">
      <Text label="Adresa" value={b.query} onChange={(v) => patch({ query: v })} placeholder="Strada, număr, oraș" ajutor="Scrie și orașul, ca Google să găsească locul exact." />

      <Range label="Zoom" unit="" value={zoomul(b)} min={3} max={20} onChange={(v) => patch({ zoom: v })} />
      <Segmentat label="Tip" value={b.mapType ?? "roadmap"} onChange={(v) => patch({ mapType: v })}
        options={[{ value: "roadmap", label: "Hartă" }, { value: "satellite", label: "Satelit" }]} />
      <Range label="Înălțime" value={inaltimeaHartii(b)} min={160} max={900} step={10} onChange={(v) => patch({ height: v })} />

      <Grup titlu="Butoane de navigație" deschisImplicit>
        <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-foreground">
          <input type="checkbox" checked={!!b.wazeButton} onChange={(e) => patch({ wazeButton: e.target.checked })} className="h-4 w-4 rounded accent-green-600" />
          <SiglaWaze className="h-5 w-5" /> Buton Waze
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-foreground">
          <input type="checkbox" checked={!!b.googleButton} onChange={(e) => patch({ googleButton: e.target.checked })} className="h-4 w-4 rounded accent-green-600" />
          <SiglaGoogleMaps className="h-5 w-auto" /> Buton Google Maps
        </label>
        {(b.wazeButton || b.googleButton) && (
          <>
            <Segmentat label="Stil butoane" value={b.buttonsStyle ?? "solid"} onChange={(v) => patch({ buttonsStyle: v })}
              options={[{ value: "solid", label: "Albe" }, { value: "outline", label: "Contur" }]} />
            <Segmentat label="Unde stau" value={b.buttonsPos ?? "below"} onChange={(v) => patch({ buttonsPos: v })}
              options={[{ value: "below", label: "Sub hartă" }, { value: "overlay", label: "Peste hartă" }]} />
          </>
        )}
        <p className="text-[11px] text-muted-foreground">Pe telefon deschid direct aplicația, cu traseul până la tine.</p>
      </Grup>

      <Grup titlu="Adresa sub hartă">
        <Toggle label="Arată adresa" checked={!!b.showAddress} onChange={(v) => patch({ showAddress: v })} />
        {b.showAddress && <Text label="Numele locului" value={b.label} onChange={(v) => patch({ label: v })} placeholder="Ex: Showroom Casa Lumen" />}
      </Grup>

      <Segmentat label="Colțurile hărții" value={b.style?.radius ?? "lg"} onChange={(v) => setStyle({ ...b.style, radius: v })}
        options={[{ value: "none", label: "Drepte" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }]} />
      <ControaleAspect style={b.style} onChange={setStyle} hide={["align", "box"]} />
    </div>
  );
}
