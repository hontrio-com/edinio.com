import { MapPin } from "lucide-react";
import { BlockShell, RAZA } from "../BlockShell";
import { SiglaGoogleMaps, SiglaWaze } from "./SigleleHartii";
import { embedGoogle, inaltimeaHartii, linkGoogleMaps, linkWaze } from "@/lib/pages/harta";
import type { MapBlock } from "@/lib/pages/blocks.types";

/**
 * Blocul de harta: cadrul Google, cu zoom si harta sau satelit; sub ea sau
 * peste ea, optional, adresa si butoanele de navigatie. Vezi `lib/pages/harta.ts`.
 */
export function MapBlockView({ block, color }: { block: MapBlock; color: string }) {
  const inaltime = inaltimeaHartii(block);
  const google = embedGoogle(block);
  if (!google) return null;

  const raza = RAZA[block.style?.radius ?? "lg"] ?? "rounded-2xl";
  const waze = block.wazeButton ? linkWaze(block) : null;
  const gmaps = block.googleButton ? linkGoogleMaps(block) : null;
  const peste = block.buttonsPos === "overlay";
  const plin = block.buttonsStyle !== "outline";

  const butoane = (waze || gmaps) && (
    <div className={`flex flex-wrap gap-2 ${peste ? "" : "mt-3 justify-center"}`}>
      {waze && (
        <a href={waze} target="_blank" rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5 ${plin ? "bg-white text-[#0b1f2a] ring-1 ring-black/10" : "border border-border bg-transparent text-foreground"}`}>
          <SiglaWaze className="h-5 w-5" /> Deschide în Waze
        </a>
      )}
      {gmaps && (
        <a href={gmaps} target="_blank" rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5 ${plin ? "bg-white text-[#1f1f1f] ring-1 ring-black/10" : "border border-border bg-transparent text-foreground"}`}>
          <SiglaGoogleMaps className="h-5 w-auto" /> Deschide în Google Maps
        </a>
      )}
    </div>
  );

  const adresa = block.showAddress && (block.label || block.query) && (
    <div className={`flex items-start gap-3 ${peste ? "" : "mt-4 justify-center text-center"}`}>
      <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
      <div className="text-sm">
        {block.label && <p className="font-semibold text-foreground">{block.label}</p>}
        {block.query && <p className="text-muted-foreground">{block.query}</p>}
      </div>
    </div>
  );

  return (
    <BlockShell style={{ width: "container", ...block.style }}>
      {/* `isolate`: cardul de peste harta (`z-[500]`) ramane in bloc; fara el trecea peste antetul lipicios si peste cos. */}
      <div className={`relative isolate overflow-hidden border border-border ${raza}`} style={{ height: inaltime }}>
        <iframe src={google} title={block.label || "Hartă"} className="h-full w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        {peste && (butoane || adresa) && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] flex flex-col items-start gap-2 pg-sm:inset-x-4 pg-sm:bottom-4">
            {adresa && <div className="pointer-events-auto rounded-xl bg-white/95 px-4 py-3 shadow-lg ring-1 ring-black/5">{adresa}</div>}
            {butoane && <div className="pointer-events-auto">{butoane}</div>}
          </div>
        )}
      </div>
      {!peste && adresa}
      {!peste && butoane}
    </BlockShell>
  );
}
