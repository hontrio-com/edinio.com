"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { resolveHref } from "@/lib/pages/href";
import { placileMozaic, type FondPlaca, type PlacaMozaic } from "@/lib/storefront/design/hero-teme";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/** Fondul si scrisul fiecarui fel de placa. „Inchis” e aproape negru, nu negru: pe el poza decupata are adancime. */
const FONDURI: Record<FondPlaca, { fond: string; scris: string; estompat: string }> = {
  inchis: { fond: "#0F1216", scris: "#FFFFFF", estompat: "rgba(255,255,255,0.72)" },
  principala: { fond: "var(--st-primary)", scris: "var(--st-primary-contrast)", estompat: "color-mix(in srgb, var(--st-primary-contrast) 78%, transparent)" },
  deschis: { fond: "color-mix(in srgb, var(--st-text) 7%, var(--st-surface))", scris: "var(--st-text)", estompat: "var(--st-muted)" },
};

/**
 * Locul fiecarei placi pe calculator (12 coloane, 2 randuri): prima mare, a doua inalta, ultimele doua mici una peste
 * alta. Cu mai putine placi, celelalte se intind: doua = jumatate-jumatate, trei = mare + doua mici.
 */
function locuri(cate: number): string[] {
  if (cate === 1) return ["lg:col-span-12 lg:row-span-2"];
  if (cate === 2) return ["lg:col-span-7 lg:row-span-2", "lg:col-span-5 lg:row-span-2"];
  if (cate === 3) return ["lg:col-span-7 lg:row-span-2", "lg:col-span-5", "lg:col-span-5"];
  return ["lg:col-span-5 lg:row-span-2", "lg:col-span-3 lg:row-span-2", "lg:col-span-4", "lg:col-span-4"];
}

/**
 * Bannerul „mozaic” (tema Terra, etapa 24 din `docs/editor-magazin/PLAN.md`, dupa XStore Electronic): pana la patru placi,
 * fiecare cu titlu, text, poza si link. Prima placa isi pune poza pe toata suprafata (o fotografie), celelalte o asaza
 * jos, in dreapta (pozele decupate ale produselor). Pe telefon vin una sub alta.
 *
 * Fara placi: doar H1-ul ascuns (ca la „Doar imagini”), ca pagina sa nu ramana fara titlu.
 */
export function HeroMozaic({ settings }: { settings: Record<string, unknown> }) {
  const { business, basePath } = useStoreChrome();
  const nume = business.store_name ?? business.business_name;
  const placi = placileMozaic(settings);
  const loc = locuri(placi.length);

  return (
    <section className="mx-auto px-4 pt-5 sm:pt-6" style={{ maxWidth: "var(--st-container)" }}>
      <h1 className="sr-only">
        {nume}
        {business.tagline ? ` - ${business.tagline}` : ""}
      </h1>
      {placi.length > 0 && (
        <div className="grid gap-3 lg:gap-4 lg:grid-cols-12 lg:grid-rows-2 lg:h-[clamp(30rem,40vw,36rem)]">
          {placi.map((p, i) => (
            <Placa key={i} placa={p} mare={i === 0} inalta={i === 1 && placi.length !== 3} cls={loc[i]} basePath={basePath} prioritate={i === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

function Placa({ placa, mare, inalta, cls, basePath, prioritate }: {
  placa: PlacaMozaic; mare: boolean; inalta: boolean; cls: string; basePath: string; prioritate: boolean;
}) {
  const ton = FONDURI[placa.fond];
  const href = placa.link ? resolveHref(placa.link, basePath) : null;
  const continut = (
    <>
      {placa.imagine && (
        mare ? (
          <>
            <Image src={placa.imagine} alt="" fill priority={prioritate} sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover group-hover:scale-[1.03] transition-transform duration-700" />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
          </>
        ) : (
          // Cutia pozei: jos, pe toata latimea la placa inalta; in dreapta, langa text, la cele mici (altfel o poza lata
          // ajungea peste text, gasit la proba).
          <span className={`absolute ${inalta ? "inset-x-4 bottom-4 h-[52%]" : "right-3 bottom-3 top-3 w-[44%]"}`}>
            <Image src={placa.imagine} alt="" fill sizes="(max-width: 1024px) 45vw, 22vw"
              className="object-contain object-bottom group-hover:scale-[1.05] origin-bottom transition-transform duration-500" />
          </span>
        )
      )}
      <span className={`relative z-10 flex flex-col ${mare ? "justify-center h-full max-w-[22rem]" : inalta ? "" : "max-w-[56%]"}`}>
        <span className={`block font-bold leading-tight tracking-tight ${mare ? "text-[28px] sm:text-[36px]" : "text-[20px] sm:text-[24px]"}`}
          style={{ fontFamily: "var(--st-font-heading)" }}>
          {placa.titlu}
        </span>
        {placa.text && <span className="mt-2 block text-[14px] sm:text-[15px] leading-snug max-w-[16rem]" style={{ color: ton.estompat }}>{placa.text}</span>}
        {href && (
          mare ? (
            <span className="mt-6 self-start inline-flex items-center gap-2 h-11 px-6 rounded-[var(--st-radius-btn)] text-[14px] font-semibold"
              style={{ backgroundColor: "var(--st-primary)", color: "var(--st-primary-contrast)" }}>
              Vezi detalii
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
            </span>
          ) : (
            <span className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold underline-offset-4 group-hover:underline">
              Cumpara acum
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" strokeWidth={2.2} />
            </span>
          )
        )}
      </span>
    </>
  );
  const clase = `group relative isolate overflow-hidden rounded-[var(--st-radius-lg)] p-6 sm:p-8 ${mare ? "min-h-[300px] sm:min-h-[380px]" : "min-h-[190px]"} lg:min-h-0 ${cls}`;
  const stil = { backgroundColor: ton.fond, color: ton.scris };
  return href ? <a href={href} className={clase} style={stil}>{continut}</a> : <div className={clase} style={stil}>{continut}</div>;
}
