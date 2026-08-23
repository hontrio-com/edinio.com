import Image from "next/image";
import { Heart, ImageIcon } from "lucide-react";
import { PROBLEM_PRODUCT } from "@/lib/website/problem";
import { VERDE_CITIBIL } from "@/lib/website/linii";

/**
 * Ilustrația din al treilea card: o pagină de produs care are tot ce trebuie.
 *
 * Cardul vorbește despre încredere, iar încrederea nu se poate DESENA ca simbol —
 * se vede din detalii: prețul cu TVA scris lângă el, recenzii cu număr, variantele
 * la vedere, un buton fără echivoc. De aceea ilustrația e o pagină de produs
 * întreagă, la scară mică, nu o iconiță cu un scut.
 *
 * ═══ CE E DE ȘTIUT DACĂ SE UMBLĂ LA EA ═══
 *
 * 1. **Totul e mic dinadins.** Zona are 343x257 pe desktop, adică vreo un sfert
 *    din cât ar avea o pagină de produs adevărată. Mărimile de aici (12px titlu,
 *    8px etichete) nu sunt greșeli: ilustrația trebuie RECUNOSCUTĂ ca pagină de
 *    produs dintr-o privire, nu citită. Dacă se mărește textul, nu mai încape
 *    nimic și dispare tocmai ce o face credibilă — densitatea.
 * 2. **Verdele prețului NU e verdele de marcă.** #1AB554 are pe alb un contrast
 *    de 2,70:1, adică sub prag pentru text — la 14px iese un preț pe care nu-l
 *    citești. Se folosește `--primary` (#008236), care are 4,95:1. Butonul verde
 *    e tot el: 2,70:1 e sub prag și în celălalt sens, deci nici text alb pe
 *    verdele de marcă nu se citește.
 * 3. **Fără „În stoc".** Era în macheta de la care am pornit; clientul a cerut-o
 *    scoasă, mai curat așa.
 * 4. **`aria-hidden` pe tot.** Ilustrația repetă ce scrie în descrierea cardului.
 *    Anunțate, prețul și recenziile inventate ar fi sunat a produs real de
 *    vânzare.
 *
 * Fără animație, ca și la al doilea card: primul are deja firul care sosește.
 */

/* Verdele pentru TEXT, luat din `lib/website/linii.ts`.

   Era declarat aici, si in inca patru fisiere, cu acelasi comentariu copiat
   langa fiecare: `#12874A`, ales fiindca verdele de marca (#1AB554) are pe alb
   2,70:1, sub prag. Alegerea era buna, dar `--primary` era deja acolo si are
   4,95:1. Doctrina celor doi verzi ramasi e in capul lui `globals.css`. */
const GREEN_TEXT = VERDE_CITIBIL;

export function TrustedProduct() {
  const p = PROBLEM_PRODUCT;

  return (
    <div aria-hidden className="flex h-full w-full items-center p-2 sm:p-2.5">
      <div
        className="w-full rounded-[10px] border border-hairline bg-white p-2 sm:p-2.5"
        style={{
          boxShadow:
            "0 1px 1px rgba(10,10,10,0.03), 0 8px 18px -10px rgba(10,10,10,0.16)",
        }}
      >
        <div className="grid grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] gap-2 sm:gap-2.5">
          {/* ── Stânga: poza ── */}
          <div className="relative aspect-square overflow-hidden rounded-[8px] bg-tint-2">
            {p.image.src ? (
              <Image
                src={p.image.src}
                alt=""
                fill
                sizes="140px"
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
                <ImageIcon className="h-4 w-4 text-ink-3" strokeWidth={1.5} />
                <span className="text-[8px] leading-tight text-ink-3">
                  {p.image.hint}
                </span>
              </div>
            )}

            {/* Inimioara. Un detaliu mic, dar e primul lucru care spune „pagină
                de produs" și nu „poză cu un parfum". */}
            <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-white shadow-sm">
              <Heart className="h-2 w-2" style={{ color: GREEN_TEXT }} strokeWidth={2.4} />
            </span>
          </div>

          {/* ── Dreapta: tot ce dă încredere ── */}
          <div className="flex flex-col">
            <p className="text-[11px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink">
              {p.name}
            </p>

            <span className="mt-1 flex items-center gap-1">
              <Stars value={p.rating} />
              <span className="text-[8px] text-ink-3">({p.reviews})</span>
            </span>

            <p
              className="mt-1.5 text-[14px] font-bold leading-none tracking-[-0.02em]"
              style={{ color: GREEN_TEXT }}
            >
              {p.price}
            </p>
            <p className="mt-[3px] text-[8px] text-ink-3">{p.priceNote}</p>

            <span className="my-1.5 block h-px bg-hairline" />

            <p className="text-[8px] font-medium text-ink-2">{p.variantLabel}</p>

            <span className="mt-1 flex gap-1">
              {p.variants.map((variant, index) => {
                const selected = index === p.selectedVariant;
                return (
                  <span
                    key={variant}
                    className="rounded-[5px] border px-1.5 py-[3px] text-[8px] leading-none"
                    style={
                      selected
                        ? { borderColor: GREEN_TEXT, color: GREEN_TEXT, fontWeight: 600 }
                        : { borderColor: "#EAEAEE", color: "#52525B" }
                    }
                  >
                    {variant}
                  </span>
                );
              })}
            </span>

            <span className="mt-2 grid h-[22px] place-items-center rounded-[6px] bg-primary text-[9px] font-semibold text-white">
              {p.cta}
            </span>

            {/*
              Rândul cu plata în rate, sub buton — acolo îl pun și magazinele
              adevărate: după ce omul s-a hotărât să cumpere, nu înainte.

              Depinde de o integrare care încă nu era gata când s-a scris. Vezi
              nota de la `installments` din `lib/website/problem.ts`.

              Fără blocurile negru-portocaliu din bannerele TBI. Ele sunt făcute
              pentru un banner de 600x150; aici avem 158px lățime, iar două
              dreptunghiuri colorate ar fi tras tot ochiul din card către o marcă
              străină. Un rând mărunt cu sigla lor lasă accentul pe butonul verde,
              care e al nostru.
            */}
            <span className="mt-1.5 flex items-center justify-center gap-1">
              <span className="text-[7.5px] leading-none text-ink-3">
                {p.installments.label}
              </span>
              <Image
                src={p.installments.logo}
                alt=""
                width={41}
                height={18}
                unoptimized
                /* Sigla e 1168x512. Înălțime fixă, lățime liberă — la lățime
                   fixă s-ar fi turtit. */
                className="h-[9px] w-auto"
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Cele cinci stele, cu jumătăți.
 *
 * Jumătatea se face dintr-o stea galbenă tăiată la 50% peste una gri, nu dintr-o
 * a doua formă desenată: la 4,5 din 5, o stea „aproape plină" ar fi ieșit
 * altfel decât cea de lângă ea, iar diferența se vede chiar și la 9px.
 */
function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-[1px]">
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, value - index));

        return (
          <span key={index} className="relative block h-[9px] w-[9px]">
            <Star color="#E3E3E8" />
            {fill > 0 ? (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                {/* Lățime fixă pe steaua dinăuntru: altfel s-ar strânge odată cu
                    învelișul și jumătatea ar ieși o stea îngustă, nu una tăiată. */}
                <span className="block h-[9px] w-[9px]">
                  <Star color="#F5B301" />
                </span>
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function Star({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 19" className="h-[9px] w-[9px]" fill={color}>
      <path d="M10 0l2.9 6.2 6.6.9-4.8 4.8 1.2 6.8L10 15.4 4.1 18.7l1.2-6.8L.5 7.1l6.6-.9z" />
    </svg>
  );
}
