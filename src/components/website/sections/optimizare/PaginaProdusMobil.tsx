import Image from "next/image";
import { ChevronLeft, ImageIcon, Search, ShoppingBag } from "lucide-react";
import { PRODUS_MOBIL } from "@/lib/website/optimizare";

/**
 * Pagina de produs, așa cum arată pe telefon. Merge pe ecranul din `IPhoneMockup`.
 *
 * ═══ DE CE NU E `TrustedProduct`, ACEEAȘI DE PE PAGINA DE START ═══
 *
 * Fiindcă aceea e pe DOUĂ COLOANE — poza în stânga, detaliile în dreapta — și e
 * desenată pentru o ilustrație lată de 343px. Într-un ecran de telefon, lat de
 * ~140, cele două coloane ar fi ieșit de câte 65px fiecare: nici poza nu s-ar mai
 * fi văzut, nici textul n-ar mai fi încăput. Pe telefon, o pagină de produs chiar
 * E alta: poza sus, pe toată lățimea, restul dedesubt.
 *
 * Și produsul e altul, dat de client: un blender, nu parfumul de pe pagina de
 * start. Datele stau în `PRODUS_MOBIL`.
 *
 * ═══ TOT CE E AICI SE MĂSOARĂ ÎN `cqw` ═══
 *
 * Adică în procente din LĂȚIMEA ECRANULUI, nu în pixeli. Aparatul se micșorează
 * odată cu cardul, iar cu pixeli ficși textul ar fi rămas la fel de mare și ar fi
 * spart pagina exact acolo unde e mai puțin loc.
 *
 * ⚠ Totul e mic dinadins, ca la ilustrația de pe pagina de start: trebuie
 * RECUNOSCUTĂ ca pagină de produs dintr-o privire, nu citită.
 */

/* Verdele pentru TEXT — verdele de brand (#1AB554) are pe alb 2,6:1, sub pragul
   de citibilitate. #12874A e același ton, dus la 4,6:1. Butonul poate rămâne pe
   verdele de brand: acolo textul e alb pe verde, nu verde pe alb. */
const GREEN_TEXT = "#12874A";

export function PaginaProdusMobil() {
  const p = PRODUS_MOBIL;

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <BaraDeStare />

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
        <p className="text-[5.6cqw] font-semibold leading-[1.2] tracking-[-0.01em] text-ink">
          {p.name}
        </p>

        <span className="mt-[2cqw] flex items-center gap-[1.5cqw]">
          <Stele valoare={p.rating} />
          <span className="text-[3.8cqw] leading-none text-ink-3">({p.reviews})</span>
        </span>

        <p
          className="mt-[2.5cqw] text-[7.6cqw] font-bold leading-none tracking-[-0.02em]"
          style={{ color: GREEN_TEXT }}
        >
          {p.price}
        </p>
        <p className="mt-[1.2cqw] text-[3.8cqw] leading-none text-ink-3">{p.priceNote}</p>

        <span className="mt-[4cqw] grid h-[11.5cqw] shrink-0 place-items-center rounded-[3cqw] bg-primary text-[4.4cqw] font-semibold text-white">
          {p.cta}
        </span>

        {/*
          Rândul cu plata în rate, sub buton — la fel ca pe pagina de start, cerut
          de client. Acolo îl pun și magazinele adevărate: după ce omul s-a
          hotărât să cumpere, nu înainte.

          Fără blocurile negru-portocaliu din bannerele TBI: alea sunt făcute
          pentru un banner de 600x150, iar aici avem un ecran de ~137px. Două
          dreptunghiuri colorate ar fi tras tot ochiul din pagină către o marcă
          străină. Un rând mărunt lasă accentul pe butonul verde, care e al nostru.
        */}
        <span className="mt-[2.5cqw] flex items-center justify-center gap-[1.2cqw]">
          <span className="text-[3.4cqw] leading-none text-ink-3">
            {p.installments.label}
          </span>
          {/* Sigla e 1168x512. Înălțime fixă, lățime liberă — la lățime fixă s-ar
              fi turtit. */}
          <Image
            src={p.installments.logo}
            alt=""
            width={41}
            height={18}
            unoptimized
            className="h-[4.2cqw] w-auto"
          />
        </span>
      </div>
    </div>
  );
}

/**
 * Bara de stare a iOS, desenată după captura trimisă de client.
 *
 * ⚠ CE ERA GREȘIT ÎNAINTE, punct cu punct — clientul a spus că „detaliile nu sunt
 * 1 la 1" și a trimis reperul:
 *
 *   1. **Bateria era pe trei sferturi.** La aparat, în capturi, e PLINĂ. Acum
 *      umplerea ia toată lățimea dinăuntru.
 *   2. **Era și un semn de wi-fi.** În reper nu există: doar semnalul și bateria.
 *      L-am scos.
 *   3. **Ora era 9:41** (ora din reclamele Apple). În reper scrie 10:00.
 *
 * Desenul bateriei e cel al iOS: contur stins, umplere în culoarea textului, și
 * un vârf mic în dreapta, tot stins. Nu un dreptunghi plin — conturul e ce o face
 * să se citească drept baterie și nu drept pastilă.
 */
function BaraDeStare() {
  return (
    <div className="flex h-[12.5cqw] shrink-0 items-center justify-between px-[7cqw] pt-[3cqw]">
      <span className="text-[4.4cqw] font-semibold leading-none text-ink">10:00</span>

      <span className="flex items-center gap-[2cqw]">
        {/* Semnalul: patru bare care cresc. */}
        <span className="flex items-end gap-[0.5cqw]">
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className="w-[1cqw] rounded-[0.3cqw] bg-ink"
              style={{ height: `${1.1 + n * 0.75}cqw` }}
            />
          ))}
        </span>

        {/*
          Bateria: contur, umplere completă, vârf.

          ⚠ FĂRĂ SPAȚIU ÎNTRE CORP ȘI VÂRF. Prima formă avea `gap`, iar clientul
          a văzut golul imediat — la iPhone vârful e LIPIT de contur, nu alături
          de el.

          Restul numerelor vin din glifa iOS, unde corpul are ~25x13pt, conturul
          1pt, iar vârful 1,5x4pt. În procente din corp: raport 1,92, contur 7,7%
          din înălțime, vârf de 31% din înălțime și 6% din lățime. Conturul era
          și el prea gros — 12,5% în loc de 7,7 — și făcea bateria să pară
          desenată cu carioca.
        */}
        <span className="flex items-center">
          <span className="flex h-[4.4cqw] w-[8.4cqw] items-center rounded-[1.35cqw] border-[0.4cqw] border-ink/35 p-[0.38cqw]">
            <span className="h-full w-full rounded-[0.7cqw] bg-ink" />
          </span>
          <span className="h-[1.35cqw] w-[0.55cqw] rounded-r-[0.3cqw] bg-ink/35" />
        </span>
      </span>
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
