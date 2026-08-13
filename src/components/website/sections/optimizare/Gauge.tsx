import { cn } from "@/lib/utils/cn";

/**
 * Cadranul din componenta trimisă de client, desenat după captura lui.
 *
 * ═══ CE ANUME FACE DESENUL ĂSTA, ȘI NU ALTUL ═══
 *
 * Prima formă era cea a uneltei Google: inel plin, arc peste el, fără spații.
 * Clientul a trimis captura și a spus limpede că nu seamănă. Ce deosebește
 * desenul lui, în ordinea în care sar în ochi:
 *
 *   1. **Degrade pe arc** — aceeași culoare de la 30% opacitate la 100%. Nu două
 *      culori: una singură, care prinde putere pe măsură ce arcul urcă.
 *   2. **Spații între cele două arce.** Restul până la 100 e desenat separat, în
 *      gri, cu câte un gol la fiecare capăt. Fără goluri ar fi fost un inel
 *      întreg în două culori; cu ele se citesc ca două piese.
 *   3. **Gradații** pe dinăuntru, opt liniuțe scurte și foarte stinse.
 *   4. **Cifra stă ÎN cadran**, neagră și mare.
 *
 * ⚠ O ABATERE, măsurată: în captura clientului eticheta e ÎNĂUNTRU, sub cifră.
 * Acolo cadranul are 200px. Ale noastre stau într-o ilustrație de card și au
 * 64-86px, iar la mărimea aia o etichetă înăuntru ar ieși de 6-8px — „Accesibilitate"
 * ar fi o dâră. Deci eticheta a coborât SUB cadran, la 11px, unde se citește.
 * Restul desenului e neatins.
 *
 * ═══ DE CE NU E COMPONENTA LUI, LITERAL ═══
 *
 * Fiindcă aducea `framer-motion` în pachetul trimis către browser — vreo 40KB
 * comprimat — pentru o ilustrație, pe pagina care se numește „Optimizare" și care
 * arată tocmai un scor de viteză. Ar fi fost gluma pe care o poate verifica
 * oricine cu unealta din desen.
 *
 * Restul componentei (inele multiple, praguri, cadrane la sfert și la jumătate,
 * halou) n-are niciun folos aici. S-a păstrat ce se VEDE și cum se mișcă —
 * inclusiv arcul, mutat în `lib/website/optimizare.ts`.
 *
 * ═══ COMPONENTĂ PURĂ ═══
 *
 * N-are stare și n-are efecte: primește valoarea deja animată. Cine o animează e
 * panoul, cu o singură buclă pentru toate patru — nu patru bucle care se trezesc
 * separat.
 */

/** Raza inelului, în unitățile cutiei de 100. */
const RAZA = 42;
const GROSIME = 9;
/** Cât gol rămâne la fiecare capăt, în procente din tur. Ca în componenta lui. */
const GOL = 4;
const GRADATII = 8;
/**
 * Sub atâta lungime, arcul nu se mai desenează deloc.
 *
 * ⚠ NU e o economie, e o corectură. Capetele sunt rotunde (`stroke-linecap`),
 * iar un capăt rotund adaugă o jumătate de grosime dincolo de capătul liniei —
 * deci un arc de lungime ZERO nu dispare, ci se desenează ca un PUNCT. La un scor
 * de 100 restul gri e zero, și fără pragul ăsta rămânea un punct gri lipit de
 * vârful cadranului; la pornire, când toate sunt pe zero, rămâneau patru puncte
 * verzi.
 */
const PRAG_DESEN = 0.5;

export function Gauge({
  aratat,
  eticheta,
  culoare,
  className,
}: {
  /** Cât se desenează acum, 0-100. În repaus e egal cu scorul. */
  aratat: number;
  eticheta: string;
  /** Culoarea arcului. Vine din prag (vezi `culoareScor`), nu se alege aici. */
  culoare: string;
  /** Mărimea cadranului. Tot de aici vine și mărimea cifrei, prin `cqw`. */
  className?: string;
}) {
  const procent = Math.max(0, Math.min(100, aratat));
  const circumferinta = 2 * Math.PI * RAZA;
  const perProcent = circumferinta / 100;

  /* Arcul valorii pleacă din vârf și merge în sensul acelor de ceas. */
  const arcValoare = procent * perProcent;
  /*
    Restul, minus câte un gol la fiecare capăt. `max(0, …)` nu e prisos: la un
    scor de 100 ar fi ieșit negativ, iar un `stroke-dasharray` negativ e valoare
    invalidă — browserul desenează atunci inelul ÎNTREG, adică fix pe dos.
  */
  const arcRest = Math.max(0, (100 - procent - GOL * 2) * perProcent);

  /* Identificator propriu pentru degrade: sunt patru cadrane în aceeași pagină,
     iar `url(#…)` ia mereu primul element cu acel `id`. */
  const idDegrade = `grad-${eticheta.replace(/[^a-zA-Z]/g, "")}`;

  const gradatii = Array.from({ length: GRADATII }, (_, i) => {
    const unghi = (i / GRADATII) * 2 * Math.PI - Math.PI / 2;
    const razaExt = RAZA - GROSIME / 2;
    const razaInt = razaExt - 5;
    return {
      x1: 50 + razaInt * Math.cos(unghi),
      y1: 50 + razaInt * Math.sin(unghi),
      x2: 50 + razaExt * Math.cos(unghi),
      y2: 50 + razaExt * Math.sin(unghi),
    };
  });

  return (
    /*
      TOT cadranul e ascuns pentru tehnologiile de asistare, inclusiv cifra și
      eticheta. Nu e o scăpare: cifra URCĂ, iar un cititor de ecran ar fi anunțat
      zeci de numere în drum spre 96. Ce se aude e o singură propoziție cu toate
      patru scorurile, scrisă în panou — vezi `PanouPageSpeed`.
    */
    /*
      ⚠ Lățimea vine pe CERCUL dinăuntru, nu pe rădăcină, și e o corectură
      măsurată: cu ea pe rădăcină, eticheta era strânsă la lățimea cercului, iar
      „Accesibilitate" se rupea pe două rânduri de îndată ce cercul cobora sub
      ~78px. Rândul în plus înălța tot panoul cu 14px și îl scotea din ilustrație.
      Așa eticheta se poate întinde pe toată coloana grilei și rămâne pe un rând.
    */
    <div className="flex w-full flex-col items-center" aria-hidden="true">
      {/*
        `@container`: cifra se măsoară în `cqw`, adică în procente din LĂȚIMEA
        CADRANULUI, nu din ecran. Așa același cadran arată la fel la 62px pe
        tabletă și la 86 pe desktop, fără trei seturi de mărimi de text.
      */}
      <div className={cn("@container relative aspect-square", className)}>
      <svg viewBox="0 0 100 100" className="h-full w-full" focusable="false">
        <defs>
          {/*
            Degradeul e ORIZONTAL în cutia cercului, iar cercul e rotit cu -90°,
            deci pe ecran urcă dinspre stânga-jos spre dreapta-sus — exact ca în
            captură. Se rotește odată cu forma, fiindcă e în coordonatele ei.
          */}
          <linearGradient id={idDegrade} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={culoare} stopOpacity="0.3" />
            <stop offset="100%" stopColor={culoare} stopOpacity="1" />
          </linearGradient>
        </defs>

        {gradatii.map((g) => (
          <line
            key={`${g.x1.toFixed(2)}-${g.y1.toFixed(2)}`}
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke="currentColor"
            strokeWidth="1"
            className="text-ink-3"
            opacity="0.35"
          />
        ))}

        {/*
          Restul până la 100, în gri. Desenat OGLINDIT (`scale(1 -1)`) și pornit cu
          un gol înaintea vârfului: așa cele două arce se despart la AMÂNDOUĂ
          capetele, nu doar la unul. Aceeași socoteală ca în componenta clientului.
        */}
        {arcRest > PRAG_DESEN ? (
          <circle
            cx="50"
            cy="50"
            r={RAZA}
            fill="none"
            stroke="currentColor"
            className="text-ink-3"
            strokeOpacity={0.34}
            strokeWidth={GROSIME}
            strokeLinecap="round"
            strokeDasharray={`${arcRest} ${circumferinta}`}
            transform={`rotate(${-90 - GOL * 3.6} 50 50) scale(1 -1) translate(0 -100)`}
          />
        ) : null}

        {/* Arcul valorii. `rotate(-90)` îl pornește de la ora 12; fără el ar începe
            de la ora 3, ca orice cerc SVG. */}
        {arcValoare > PRAG_DESEN ? (
          <circle
            cx="50"
            cy="50"
            r={RAZA}
            fill="none"
            stroke={`url(#${idDegrade})`}
            strokeWidth={GROSIME}
            strokeLinecap="round"
            strokeDasharray={`${arcValoare} ${circumferinta}`}
            transform="rotate(-90 50 50)"
          />
        ) : null}
      </svg>

      {/*
        Cifra stă în HTML, peste desen, nu în `<text>` SVG: prinde fontul paginii
        fără să-l declari a doua oară, se poate mări din setările browserului, și
        rămâne text obișnuit.

        E NEAGRĂ, ca în captură — nu verde. Verdele stă în inel, unde n-are nimic
        de citit; pe alb, verdele ăla ar da sub 2:1 la o cifră.
      */}
        <span className="absolute inset-0 flex items-center justify-center text-[32cqw] font-bold leading-none tabular-nums text-ink">
          {Math.round(aratat)}
        </span>
      </div>

      <span className="mt-1.5 text-center text-[11px] leading-[1.25] text-ink-2 sm:text-[11.5px]">
        {eticheta}
      </span>
    </div>
  );
}
