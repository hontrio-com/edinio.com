import Image from "next/image";
import { ChevronLeft, ImageIcon, Search, ShoppingBag } from "lucide-react";
import { PROBLEM_PRODUCT } from "@/lib/website/problem";

/**
 * Pagina de produs, așa cum arată pe telefon. Merge pe ecranul din `IPhoneMockup`.
 *
 * ═══ DE CE NU E `TrustedProduct`, ACEEAȘI DE PE PAGINA DE START ═══
 *
 * Fiindcă aceea e pe DOUĂ COLOANE — poza în stânga, detaliile în dreapta — și e
 * desenată pentru o ilustrație lată de 343px. Într-un ecran de telefon, lat de
 * 170, cele două coloane ar fi ieșit de câte 80px fiecare: nici poza nu s-ar mai
 * fi văzut, nici textul n-ar mai fi încăput. Pe telefon, o pagină de produs chiar
 * e ALTA: poza sus, pe toată lățimea, restul dedesubt.
 *
 * Ce NU se dublează sunt DATELE: numele, prețul, recenziile, variantele vin din
 * `PROBLEM_PRODUCT`, același obiect. Deci dacă se schimbă prețul, se schimbă în
 * amândouă locurile deodată.
 *
 * ═══ TOT CE E AICI SE MĂSOARĂ ÎN `cqw` ═══
 *
 * Adică în procente din LĂȚIMEA ECRANULUI, nu în pixeli. Aparatul se micșorează
 * odată cu cardul — de la ~170px lățime de ecran pe desktop la ~130 pe un card
 * îngust — iar cu pixeli ficși textul ar fi rămas la fel de mare și ar fi spart
 * pagina exact acolo unde e mai puțin loc.
 *
 * ⚠ Totul e mic dinadins, ca la ilustrația de pe pagina de start: trebuie
 * RECUNOSCUTĂ ca pagină de produs dintr-o privire, nu citită.
 */

/* Verdele pentru TEXT — verdele de brand (#1AB554) are pe alb 2,6:1, sub pragul
   de citibilitate. #12874A e același ton, dus la 4,6:1. Butonul poate rămâne pe
   verdele de brand: acolo textul e alb pe verde, nu verde pe alb. */
const GREEN_TEXT = "#12874A";

export function PaginaProdusMobil() {
  const p = PROBLEM_PRODUCT;

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/*
        Bara de stare. Ora în stânga, semnalul în dreapta, iar între ele stă
        insula — de aceea rândul are înălțimea ei plus respirația de deasupra, și
        de aceea cele două capete sunt împinse în margini.
      */}
      <div className="flex h-[12.5cqw] shrink-0 items-center justify-between px-[7cqw] pt-[3cqw]">
        <span className="text-[4.2cqw] font-semibold leading-none text-ink">9:41</span>
        <span className="flex items-center gap-[1.4cqw]">
          <SemnalWifi />
          <Baterie />
        </span>
      </div>

      {/* Bara magazinului: înapoi, numele, coșul. Fără ea, ecranul arată a poză
          de produs, nu a pagină dintr-un magazin. */}
      <div className="flex shrink-0 items-center justify-between px-[4cqw] pb-[2cqw]">
        <ChevronLeft className="h-[5cqw] w-[5cqw] text-ink-2" strokeWidth={2.2} />
        <span className="text-[4.4cqw] font-semibold leading-none text-ink">Magazin</span>
        <span className="flex items-center gap-[2cqw]">
          <Search className="h-[4.2cqw] w-[4.2cqw] text-ink-2" strokeWidth={2.2} />
          <ShoppingBag className="h-[4.2cqw] w-[4.2cqw] text-ink-2" strokeWidth={2.2} />
        </span>
      </div>

      {/* Poza, pe toată lățimea — așa e pe telefon. */}
      <div className="relative aspect-square w-full shrink-0 bg-tint-2">
        {p.image.src ? (
          <Image
            src={p.image.src}
            alt=""
            fill
            sizes="180px"
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-[2cqw] px-[6cqw] text-center">
            <ImageIcon className="h-[7cqw] w-[7cqw] text-ink-3" strokeWidth={1.5} />
            <span className="text-[4cqw] leading-tight text-ink-3">{p.image.hint}</span>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-[4.5cqw] pt-[3.5cqw]">
        <p className="text-[5.4cqw] font-semibold leading-[1.2] tracking-[-0.01em] text-ink">
          {p.name}
        </p>

        <span className="mt-[2cqw] flex items-center gap-[1.5cqw]">
          <Stele valoare={p.rating} />
          <span className="text-[3.8cqw] leading-none text-ink-3">({p.reviews})</span>
        </span>

        <p
          className="mt-[2.5cqw] text-[7.4cqw] font-bold leading-none tracking-[-0.02em]"
          style={{ color: GREEN_TEXT }}
        >
          {p.price}
        </p>
        <p className="mt-[1.2cqw] text-[3.8cqw] leading-none text-ink-3">{p.priceNote}</p>

        <p className="mt-[3.5cqw] text-[3.8cqw] font-medium leading-none text-ink-2">
          {p.variantLabel}
        </p>
        <span className="mt-[2cqw] flex gap-[1.6cqw]">
          {p.variants.map((varianta, i) => {
            const aleasa = i === p.selectedVariant;
            return (
              <span
                key={varianta}
                className="rounded-[2cqw] border px-[2.6cqw] py-[1.6cqw] text-[3.8cqw] leading-none"
                style={
                  aleasa
                    ? { borderColor: GREEN_TEXT, color: GREEN_TEXT, fontWeight: 600 }
                    : { borderColor: "#EAEAEE", color: "#52525B" }
                }
              >
                {varianta}
              </span>
            );
          })}
        </span>

        <span className="mt-[4cqw] grid h-[11cqw] shrink-0 place-items-center rounded-[3cqw] bg-primary text-[4.4cqw] font-semibold text-white">
          {p.cta}
        </span>
      </div>
    </div>
  );
}

/** Cele cinci stele, cu jumătăți. Aceeași socoteală ca la `TrustedProduct`. */
function Stele({ valoare }: { valoare: number }) {
  return (
    <span className="flex gap-[0.5cqw]">
      {[0, 1, 2, 3, 4].map((i) => {
        const plin = Math.max(0, Math.min(1, valoare - i));
        return (
          <span key={i} className="relative block h-[4cqw] w-[4cqw]">
            <Stea culoare="#E3E3E8" />
            {plin > 0 ? (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${plin * 100}%` }}
              >
                {/* Lățime fixă pe steaua dinăuntru: altfel s-ar strânge odată cu
                    învelișul și jumătatea ar ieși o stea îngustă, nu una tăiată. */}
                <span className="block h-[4cqw] w-[4cqw]">
                  <Stea culoare="#F5B301" />
                </span>
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function Stea({ culoare }: { culoare: string }) {
  return (
    <svg viewBox="0 0 20 19" className="h-full w-full" fill={culoare}>
      <path d="M10 0l2.9 6.2 6.6.9-4.8 4.8 1.2 6.8L10 15.4 4.1 18.7l1.2-6.8L.5 7.1l6.6-.9z" />
    </svg>
  );
}

/** Semnalul și wi-fi-ul din bara de stare: patru bare și un evantai. */
function SemnalWifi() {
  return (
    <span className="flex items-end gap-[1.2cqw]">
      <span className="flex items-end gap-[0.4cqw]">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className="w-[0.9cqw] rounded-[0.3cqw] bg-ink"
            style={{ height: `${1 + n * 0.75}cqw` }}
          />
        ))}
      </span>
      <svg viewBox="0 0 16 12" className="h-[3.4cqw] w-[4.5cqw]" fill="none">
        <path
          d="M8 10.6 6.1 8.5a2.8 2.8 0 0 1 3.8 0L8 10.6Zm-4-4.4A7.2 7.2 0 0 1 12 6.2l-1.4 1.5a5.2 5.2 0 0 0-5.2 0L4 6.2Zm-2.2-2.4a10.3 10.3 0 0 1 12.4 0l-1.4 1.5a8.3 8.3 0 0 0-9.6 0L1.8 3.8Z"
          fill="#0A0A0A"
        />
      </svg>
    </span>
  );
}

/** Bateria: contur, vârf și umplere. */
function Baterie() {
  return (
    <span className="flex items-center gap-[0.5cqw]">
      <span className="relative flex h-[4cqw] w-[7.6cqw] items-center rounded-[1.2cqw] border-[0.5cqw] border-ink/35 p-[0.6cqw]">
        <span className="h-full w-[72%] rounded-[0.5cqw] bg-ink" />
      </span>
      <span className="h-[1.4cqw] w-[0.7cqw] rounded-r-[0.4cqw] bg-ink/35" />
    </span>
  );
}
