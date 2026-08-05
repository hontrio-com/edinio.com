import type { CSSProperties, ReactNode } from "react";

/**
 * Fundalurile hero-ului: opt propuneri de lumină verde, toate STATICE.
 *
 * TEMPORAR, pentru ales. Ce era înainte: opt fascicule oblice care pulsau lent.
 * Clientul a cerut să nu se mai miște, altă formă, și mai ales **subtil**. Ca să
 * aibă din ce alege, aici sunt opt familii diferite; după alegere rămâne una
 * singură și restul fișierului se șterge.
 *
 * Reguli respectate de toate:
 * - se desenează din gradiente, SVG și blur, NU cu WebGL. O pânză redesenată la
 *   fiecare cadru, exact peste elementul cel mai important al paginii, pe un site
 *   care are și o pagină „Optimizare", ar fi fost o glumă proastă;
 * - zero animație, deci nici `prefers-reduced-motion` nu are ce opri;
 * - se randează pe server, nicio linie de JavaScript pe client;
 * - numerele sunt scrise de mână. `Math.random()` la randare ar da alt desen pe
 *   server față de client și ar rupe hidratarea.
 *
 * ═══ CÂT DE TARE ═══
 *
 * Fiecare variantă are un singur număr de reglat, la începutul ei. Cerința e
 * „subtil": lumina trebuie să se simtă când te uiți la titlu, nu să se vadă ca o
 * pată când te uiți la pagină. Pe alb pragul e jos — peste vreo 0,16 verdele
 * începe să se citească drept fundal colorat, nu drept lumină.
 *
 * Variantele au fost aduse toate la aceeași putere pe ecran, nu pe hârtie. Altfel
 * alegerea n-ar mai fi fost despre FORMĂ: s-ar fi ales cea care se vede mai bine,
 * nu cea care arată mai bine.
 */

const GREEN = "26, 181, 84";

/** Numele variantelor. Sursa unică; `Hero` și pagina de acasă își iau lista de aici. */
export const HERO_BACKGROUNDS = [
  "aura",
  "waves",
  "orbs",
  "grid",
  "dots",
  "rays",
  "spotlight",
  "topography",
] as const;

export type HeroBackground = (typeof HERO_BACKGROUNDS)[number];

/** Ce scrie pe despărțitorul de deasupra fiecărei variante. */
export const HERO_BACKGROUND_LABELS: Record<HeroBackground, string> = {
  aura: "Aura — un corp de lumina, descentrat",
  waves: "Valuri — unde late care traverseaza",
  orbs: "Orbi — sfere de lumina la adancimi diferite",
  grid: "Grila — linii de 1px care se sting spre margini",
  dots: "Puncte — matrice care se rareste",
  rays: "Raze — evantaiul de dinainte, fara pulsatie",
  spotlight: "Reflector — un con larg din tavan",
  topography: "Curbe de nivel — linii concentrice",
};

/**
 * Stingerea de jos, comună tuturor.
 *
 * Fără ea, lumina s-ar termina brusc undeva peste text și s-ar vedea o muchie
 * orizontală pe toată lățimea ecranului. Se stinge devreme fiindcă sub ea urmează
 * butoanele și rândul de text mic, care au nevoie de alb curat.
 */
const FADE =
  "linear-gradient(to bottom, black 0%, black 52%, rgba(0,0,0,0.55) 74%, transparent 97%)";

/**
 * Vinieta pentru variantele cu DESEN repetat (grilă, puncte, curbe).
 *
 * Un desen care merge până în marginile ecranului se citește ca tapet, nu ca
 * lumină. Strâns spre mijloc, se citește ca ceva care se stinge.
 *
 * Stă pe un înveliș separat, nu ca a doua mască pe același element: două măști
 * pe același element au nevoie de `mask-composite`, care nu se poartă la fel
 * peste tot. Două învelișuri se compun singure, peste tot.
 */
const VIGNETTE =
  "radial-gradient(78% 68% at 50% 22%, black 0%, black 34%, transparent 82%)";

/** Rama comună: acoperă capul secțiunii și se stinge în jos. */
function Layer({
  children,
  style,
  className = "",
}: {
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 h-[760px] ${className}`}
      style={{ maskImage: FADE, WebkitMaskImage: FADE, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * Aburul din spatele desenelor.
 *
 * Fără el, liniile și benzile plutesc pe alb gol și se văd ca obiecte. Cu el,
 * stau într-o lumină și se citesc ca parte din ea.
 */
function Haze({ strength = 0.08 }: { strength?: number }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(112% 82% at 42% -6%, rgba(${GREEN},${strength}) 0%, transparent 74%)`,
      }}
    />
  );
}

/* ── 1. AURA ─────────────────────────────────────────────────────────────────
   Un singur corp de lumină, larg, descentrat spre stânga sus.

   Trei elipse suprapuse, nu una: o elipsă centrată e un cerc perfect simetric,
   adică vizibil ca formă geometrică. Trei, de mărimi și în locuri diferite, se
   citesc ca un corp de lumină, fiindcă marginea rezultată nu mai e cerc.

   Descentrată dinadins — lumina care vine de undeva anume are direcție, cea
   centrată pe titlu arată a halou pus acolo. */

const AURA_PEAK = 0.13;

function HeroAura() {
  const p = AURA_PEAK;

  return (
    <Layer
      style={{
        background: [
          `radial-gradient(120% 92% at 34% -8%, rgba(${GREEN},${p}) 0%, rgba(${GREEN},${(p * 0.42).toFixed(3)}) 38%, transparent 72%)`,
          `radial-gradient(72% 62% at 78% 6%, rgba(${GREEN},${(p * 0.55).toFixed(3)}) 0%, transparent 66%)`,
          `radial-gradient(46% 40% at 46% -2%, rgba(${GREEN},${(p * 0.5).toFixed(3)}) 0%, transparent 70%)`,
        ].join(", "),
        /* Blur peste gradiente care oricum sunt moi pare degeaba, dar nu e: pe o
           suprafață atât de mare, un gradient cu alfa mică iese în TREPTE pe
           ecranele pe 8 biți. */
        filter: "blur(26px)",
      }}
    />
  );
}

/* ── 2. VALURI ───────────────────────────────────────────────────────────────
   Unde late care traversează ecranul.

   Trasee SVG îngroșate și neclare, nu forme umplute: o formă umplută are burtă
   și margine, deci se vede ca obiect. Un traseu gros și neclar rămâne bandă de
   lumină. Capetele se sting, ca undele să nu înceapă și să nu se termine cu o
   muchie la marginea ecranului.

   `xMidYMid slice` și nu `none`: întins pe lățime, blur-ul se întinde și el, iar
   valurile ies turtite pe ecran lat și buboase pe ecran îngust. */

const WAVES_PEAK = 0.24;

const WAVES: { d: string; width: number; strength: number }[] = [
  { d: "M-160,168 C 220,54 560,258 900,150 S 1420,42 1620,138", width: 30, strength: 1 },
  { d: "M-160,264 C 180,150 600,368 940,246 S 1400,150 1620,236", width: 20, strength: 0.78 },
  { d: "M-160,356 C 260,258 580,452 920,344 S 1440,262 1620,340", width: 42, strength: 0.5 },
  { d: "M-160,452 C 200,368 620,536 960,442 S 1420,372 1620,438", width: 14, strength: 0.62 },
];

function HeroWaves() {
  return (
    <Layer className="overflow-hidden">
      <Haze strength={0.075} />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 760"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="hero-wave-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={`rgba(${GREEN},0)`} />
            <stop offset="18%" stopColor={`rgba(${GREEN},${WAVES_PEAK})`} />
            <stop offset="74%" stopColor={`rgba(${GREEN},${WAVES_PEAK})`} />
            <stop offset="100%" stopColor={`rgba(${GREEN},0)`} />
          </linearGradient>
          <filter id="hero-wave-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="19" />
          </filter>
        </defs>

        <g
          fill="none"
          stroke="url(#hero-wave-fade)"
          strokeLinecap="round"
          filter="url(#hero-wave-blur)"
        >
          {WAVES.map((wave) => (
            <path key={wave.d} d={wave.d} strokeWidth={wave.width} opacity={wave.strength} />
          ))}
        </g>
      </svg>
    </Layer>
  );
}

/* ── 3. ORBI ─────────────────────────────────────────────────────────────────
   Sfere de lumină la adâncimi diferite.

   Ce le desparte de aură: aura e UN corp, aici sunt mai multe, iar fiecare are
   propriul blur. Cele mari și foarte neclare stau în spate, cele mici și mai
   clare în față — de aici senzația de adâncime. Toate la același blur ar fi ieșit
   niște bule lipite pe sticlă. */

const ORBS: { x: number; y: number; size: number; alpha: number; blur: number }[] = [
  { x: 16, y: -6, size: 460, alpha: 0.16, blur: 70 },
  { x: 62, y: 4, size: 380, alpha: 0.13, blur: 56 },
  { x: 88, y: -12, size: 300, alpha: 0.11, blur: 44 },
  { x: 38, y: 26, size: 240, alpha: 0.1, blur: 34 },
  { x: 74, y: 34, size: 170, alpha: 0.12, blur: 24 },
  { x: 5, y: 30, size: 200, alpha: 0.09, blur: 40 },
];

function HeroOrbs() {
  return (
    <Layer className="overflow-hidden">
      {ORBS.map((orb) => (
        <div
          key={`${orb.x}-${orb.y}`}
          className="absolute rounded-full"
          style={{
            left: `${orb.x}%`,
            top: `${orb.y}%`,
            width: orb.size,
            height: orb.size,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, rgba(${GREEN},${orb.alpha}) 0%, rgba(${GREEN},${(orb.alpha * 0.34).toFixed(3)}) 52%, transparent 74%)`,
            filter: `blur(${orb.blur}px)`,
          }}
        />
      ))}
    </Layer>
  );
}

/* ── 4. GRILĂ ────────────────────────────────────────────────────────────────
   Linii de 1px, verzi și foarte slabe, stinse spre margini.

   Liniile sunt scrise cu `repeating-linear-gradient`, nu cu un SVG repetat:
   ies exact de un pixel la orice densitate de ecran și nu se îngroașă pe retina.

   Pasul e 56px. Sub 40 arată a hârtie milimetrică, peste 80 nu se mai citește ca
   grilă, ci ca patru linii rătăcite. */

const GRID_LINE = `rgba(${GREEN},0.13)`;
const GRID_STEP = 56;

function HeroGrid() {
  return (
    <Layer className="overflow-hidden">
      <Haze strength={0.075} />

      <div
        className="absolute inset-0"
        style={{ maskImage: VIGNETTE, WebkitMaskImage: VIGNETTE }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: [
              `repeating-linear-gradient(to right, ${GRID_LINE} 0 1px, transparent 1px ${GRID_STEP}px)`,
              `repeating-linear-gradient(to bottom, ${GRID_LINE} 0 1px, transparent 1px ${GRID_STEP}px)`,
            ].join(", "),
          }}
        />
      </div>
    </Layer>
  );
}

/* ── 5. PUNCTE ───────────────────────────────────────────────────────────────
   Matrice de puncte care se rărește spre margini.

   Aceeași familie cu grila, dar mai puțin sever: punctele n-au direcție, deci nu
   trag ochiul pe orizontală sau pe verticală ca liniile.

   Punctul e de 1,4px la pas de 26. Mai mare, iese pistrui; mai des, iese o
   suprafață cenușie și nu se mai văd punctele. */

function HeroDots() {
  return (
    <Layer className="overflow-hidden">
      <Haze strength={0.075} />

      <div
        className="absolute inset-0"
        style={{ maskImage: VIGNETTE, WebkitMaskImage: VIGNETTE }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(rgba(${GREEN},0.32) 1.4px, transparent 1.5px)`,
            backgroundSize: "26px 26px",
          }}
        />
      </div>
    </Layer>
  );
}

/* ── 6. RAZE ─────────────────────────────────────────────────────────────────
   Evantaiul care era pe site până acum, fără pulsație.

   Rămâne în listă tocmai fiindcă e desenul de dinainte: dacă supărarea era doar
   de la mișcare, nu de la formă, asta e varianta care o rezolvă cu cea mai mică
   schimbare.

   Evantaiul e larg (de la -62° la 8°) și fiecare rază e slabă, ca lumina să
   acopere toată lățimea fără să devină o pată verde în mijloc. Amestecul de
   late-și-difuze cu înguste-și-clare e intenționat: numai difuze iese o ceață,
   numai clare ies dungi de gard. */

const RAY_COLOR = `rgba(${GREEN},0.3)`;

const SWEEP: { angle: number; width: number; opacity: number; blur: number; offset: number }[] = [
  { angle: -62, width: 16, opacity: 0.18, blur: 40, offset: -48 },
  { angle: -52, width: 5, opacity: 0.24, blur: 15, offset: -38 },
  { angle: -43, width: 12, opacity: 0.19, blur: 32, offset: -27 },
  { angle: -33, width: 3.2, opacity: 0.26, blur: 10, offset: -15 },
  { angle: -23, width: 14, opacity: 0.16, blur: 36, offset: -2 },
  { angle: -13, width: 4, opacity: 0.24, blur: 12, offset: 14 },
  { angle: -3, width: 10, opacity: 0.18, blur: 28, offset: 30 },
  { angle: 8, width: 13, opacity: 0.15, blur: 34, offset: 46 },
];

function HeroRays() {
  return (
    <Layer className="overflow-hidden">
      <Haze strength={0.07} />

      {SWEEP.map((ray) => (
        <div
          key={ray.angle}
          className="absolute"
          style={{
            top: "-30%",
            left: `${50 + ray.offset}%`,
            width: `${ray.width}%`,
            height: "150%",
            transformOrigin: "top center",
            transform: `translateX(-50%) rotate(${ray.angle}deg)`,
            background: `linear-gradient(to bottom, ${RAY_COLOR} 0%, transparent 72%)`,
            filter: `blur(${ray.blur}px)`,
            opacity: ray.opacity,
          }}
        />
      ))}
    </Layer>
  );
}

/* ── 7. REFLECTOR ────────────────────────────────────────────────────────────
   Un con larg de lumină, din tavan, ușor înclinat.

   Diferența față de aură: conul are LATURI, deci o direcție limpede — se vede de
   unde vine lumina. Aura e o prezență, reflectorul e un gest.

   Desenat ca trapez, nu ca gradient: un gradient cu laturi drepte nu se poate
   face fără să tai muchii undeva. Trapezul blurat le pierde singur. */

function HeroSpotlight() {
  return (
    <Layer className="overflow-hidden">
      <Haze strength={0.06} />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 760"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="hero-spot-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`rgba(${GREEN},0.26)`} />
            <stop offset="46%" stopColor={`rgba(${GREEN},0.12)`} />
            <stop offset="100%" stopColor={`rgba(${GREEN},0)`} />
          </linearGradient>
          <filter id="hero-spot-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="46" />
          </filter>
        </defs>

        <g filter="url(#hero-spot-blur)" fill="url(#hero-spot-fade)">
          {/* Conul mare, înclinat spre dreapta. */}
          <path d="M470,-40 L700,-40 L1180,700 L120,700 Z" />
          {/* Un al doilea con, mai îngust și decalat: singur, primul arată ca un
              triunghi desenat. Doi, suprapuși, arată a lumină. */}
          <path d="M560,-40 L660,-40 L900,700 L330,700 Z" opacity="0.7" />
        </g>
      </svg>
    </Layer>
  );
}

/* ── 8. CURBE DE NIVEL ───────────────────────────────────────────────────────
   Linii concentrice, ca pe o hartă.

   Cea mai puțin obișnuită dintre cele opt și singura cu un desen care se
   citește ca desen, nu ca lumină difuză. E și cea mai riscantă: dacă cercurile
   ies prea regulate, arată a țintă. De aceea fiecare elipsă e altfel turtită și
   ușor mutată față de precedenta, iar grupul e întors puțin. */

const CONTOURS = [
  { rx: 120, ry: 96, dx: 0, dy: 0 },
  { rx: 200, ry: 152, dx: -14, dy: 8 },
  { rx: 286, ry: 208, dx: -34, dy: 20 },
  { rx: 378, ry: 262, dx: -58, dy: 34 },
  { rx: 476, ry: 320, dx: -86, dy: 50 },
  { rx: 580, ry: 380, dx: -118, dy: 68 },
  { rx: 692, ry: 444, dx: -154, dy: 88 },
  { rx: 812, ry: 512, dx: -194, dy: 110 },
];

function HeroTopography() {
  return (
    <Layer className="overflow-hidden">
      <Haze strength={0.07} />

      <div
        className="absolute inset-0"
        style={{ maskImage: VIGNETTE, WebkitMaskImage: VIGNETTE }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1440 760"
          preserveAspectRatio="xMidYMid slice"
        >
          <g
            fill="none"
            stroke={`rgba(${GREEN},0.22)`}
            strokeWidth="1.25"
            transform="rotate(-9 620 200)"
          >
            {CONTOURS.map((c) => (
              <ellipse
                key={c.rx}
                cx={620 + c.dx}
                cy={200 + c.dy}
                rx={c.rx}
                ry={c.ry}
              />
            ))}
          </g>
        </svg>
      </div>
    </Layer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

const BACKGROUNDS: Record<HeroBackground, () => React.JSX.Element> = {
  aura: HeroAura,
  waves: HeroWaves,
  orbs: HeroOrbs,
  grid: HeroGrid,
  dots: HeroDots,
  rays: HeroRays,
  spotlight: HeroSpotlight,
  topography: HeroTopography,
};

export function HeroBackground({ variant }: { variant: HeroBackground }) {
  const Background = BACKGROUNDS[variant];
  return <Background />;
}
