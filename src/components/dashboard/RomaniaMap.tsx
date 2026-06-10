"use client";

import { useRef, useEffect, useState } from "react";

export const COUNTY_CODE_MAP: Record<string, string> = {
  "Municipiul Bucuresti": "ROB",
  "Alba": "ROAB", "Arad": "ROAR", "Arges": "ROAG", "Bacau": "ROBC",
  "Bihor": "ROBH", "Bistrita-Nasaud": "ROBN", "Botosani": "ROBT",
  "Braila": "ROBR", "Brasov": "ROBV", "Buzau": "ROBZ",
  "Calarasi": "ROCL", "Caras-Severin": "ROCS",
  "Cluj": "ROCJ", "Constanta": "ROCT", "Covasna": "ROCV", "Dambovita": "RODB",
  "Dolj": "RODJ", "Galati": "ROGL", "Giurgiu": "ROGR", "Gorj": "ROGJ",
  "Harghita": "ROHR", "Hunedoara": "ROHD", "Ialomita": "ROIL", "Iasi": "ROIS",
  "Ilfov": "ROIF", "Maramures": "ROMM", "Mehedinti": "ROMH", "Mures": "ROMS",
  "Neamt": "RONT", "Olt": "ROOT", "Prahova": "ROPH", "Salaj": "ROSJ",
  "Satu Mare": "ROSM", "Sibiu": "ROSB", "Suceava": "ROSV", "Teleorman": "ROTR",
  "Timis": "ROTM", "Tulcea": "ROTL", "Vaslui": "ROVS", "Valcea": "ROVL",
  "Vrancea": "ROVN",
};

interface CountyEntry {
  county: string;
  code: string;
  orders: number;
}

interface Tooltip {
  x: number;
  y: number;
  county: string;
  orders: number;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function RomaniaMap({ svgContent, countyData, primaryColor }: {
  svgContent: string;
  countyData: CountyEntry[];
  primaryColor: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const maxOrders = Math.max(...countyData.map(d => d.orders), 1);

  // Build per-county color styles
  const { r, g, b } = hexToRgb(primaryColor.startsWith("#") ? primaryColor : "#1AB554");

  const styleRules = countyData.map(({ code, orders }) => {
    if (orders === 0) return `#${code} { fill: #e5e7eb; }`;
    const alpha = 0.12 + (orders / maxOrders) * 0.88;
    return `#${code} { fill: rgba(${r},${g},${b},${alpha.toFixed(2)}); }`;
  }).join("\n");

  const hoverRules = Object.values(COUNTY_CODE_MAP)
    .map(code => `#${code}:hover { filter: brightness(0.88); cursor: pointer; }`)
    .join("\n");

  const baseRules = Object.values(COUNTY_CODE_MAP)
    .filter(code => !countyData.find(d => d.code === code && d.orders > 0))
    .map(code => `#${code} { fill: #e5e7eb; }`)
    .join("\n");

  const fullStyle = `${baseRules}\n${styleRules}\n${hoverRules}\nsvg path { transition: filter 0.15s; }`;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const target = (e.target as Element).closest("[id]");
    if (!target) { setTooltip(null); return; }
    const code = target.id;
    const entry = countyData.find(d => d.code === code);
    if (!entry) { setTooltip(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      county: entry.county,
      orders: entry.orders,
    });
  }

  // Make SVG responsive by replacing hardcoded dimensions
  const responsiveSvg = svgContent
    .replace(/width="\d+"/, 'width="100%"')
    .replace(/height="\d+"/, 'height="auto"');

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTooltip(null)}
    >
      <style dangerouslySetInnerHTML={{ __html: fullStyle }} />
      <div
        className="w-full flex justify-center"
        dangerouslySetInnerHTML={{ __html: responsiveSvg }}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-sm"
          style={{
            left: Math.min(tooltip.x + 14, 600),
            top: tooltip.y - 48,
          }}
        >
          <p className="font-semibold text-gray-900">{tooltip.county}</p>
          <p className="text-gray-500">{tooltip.orders} {tooltip.orders === 1 ? "comanda" : "comenzi"}</p>
        </div>
      )}
    </div>
  );
}
