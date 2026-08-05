/**
 * Fundalul hero-ului: un evantai de raze verzi, STATIC.
 *
 * Desenul e cel dinainte, ales de client dintre opt propuneri (aură, valuri,
 * orbi, grilă, puncte, raze, reflector, curbe de nivel — 920fec0, toate în
 * istoric dacă se cer înapoi). S-au schimbat două lucruri față de el:
 *
 * 1. **Nu mai pulsează.** Razele respirau lent, fiecare cu durata și decalajul
 *    ei. Cerut explicit: „să fie static". Odată cu ele a plecat și animația
 *    `hero-ray` din `globals.css`, deci `prefers-reduced-motion` n-are ce opri.
 * 2. **E mai stins.** Cerut la fel de explicit: „așa subtil". Lumina trebuie să
 *    se simtă când te uiți la titlu, nu să se vadă ca o pată când te uiți la
 *    pagină.
 *
 * Desenat din gradiente și blur, nu cu WebGL. Varianta cu `ogl` de pe reactbits
 * arată bine, dar pune o pânză care se redesenează la fiecare cadru exact peste
 * elementul cel mai important al paginii, plus o dependință de încărcat înainte
 * să se vadă titlul — pe un site care are și o pagină „Optimizare". Aici totul se
 * randează pe server, nu cere nicio linie de JavaScript pe client și nu costă
 * nimic la derulare.
 *
 * Unghiurile sunt scrise de mână, nu generate: `Math.random()` la randare ar da
 * alt desen pe server față de client și ar rupe hidratarea.
 */

const GREEN = "26, 181, 84";

/**
 * Cât de tare se vede lumina. Singurul număr de reglat.
 *
 * Pe alb pragul lui „subtil" e jos: peste vreo 0,16 înmulțit cu opacitatea unei
 * raze, verdele începe să se citească drept fundal colorat, nu drept lumină.
 */
const RAY_COLOR = `rgba(${GREEN},0.3)`;

/**
 * Stingerea de jos.
 *
 * Fără ea, razele s-ar termina brusc undeva peste text și s-ar vedea o muchie
 * orizontală pe toată lățimea ecranului. Se stinge devreme fiindcă sub ea urmează
 * butoanele și rândul de text mic, care au nevoie de alb curat.
 */
const FADE =
  "linear-gradient(to bottom, black 0%, black 52%, rgba(0,0,0,0.55) 74%, transparent 97%)";

interface Ray {
  /** Unghiul față de verticală. Negativ = spre stânga. */
  angle: number;
  /** Lățimea razei la bază, în procente din secțiune. */
  width: number;
  opacity: number;
  blur: number;
  /** Deplasare pe orizontală față de centru, în procente. */
  offset: number;
}

/**
 * Evantaiul.
 *
 * Larg (de la -62° la 8°) și cu fiecare rază slabă, ca lumina să acopere toată
 * lățimea fără să devină o pată verde în mijloc.
 *
 * Amestecul de late-și-difuze cu înguste-și-clare e intenționat: numai difuze,
 * iese o ceață; numai clare, ies dungi de gard. Câteva ascuțite printre cele moi
 * dau senzația de fascicul.
 */
const SWEEP: Ray[] = [
  { angle: -62, width: 16, opacity: 0.18, blur: 40, offset: -48 },
  { angle: -52, width: 5, opacity: 0.24, blur: 15, offset: -38 },
  { angle: -43, width: 12, opacity: 0.19, blur: 32, offset: -27 },
  { angle: -33, width: 3.2, opacity: 0.26, blur: 10, offset: -15 },
  { angle: -23, width: 14, opacity: 0.16, blur: 36, offset: -2 },
  { angle: -13, width: 4, opacity: 0.24, blur: 12, offset: 14 },
  { angle: -3, width: 10, opacity: 0.18, blur: 28, offset: 30 },
  { angle: 8, width: 13, opacity: 0.15, blur: 34, offset: 46 },
];

export function HeroRays() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[760px] overflow-hidden"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    >
      {/*
        Aburul de sub raze. Lat cât toată secțiunea, nu doar cât titlul: un halou
        strâmt și tare se citește ca o pată pusă acolo, unul larg și slab se
        citește ca lumină. Fără el, razele plutesc pe alb gol și se văd ca dungi.
      */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(112% 82% at 42% -6%, rgba(${GREEN},0.07) 0%, transparent 74%)`,
        }}
      />

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
    </div>
  );
}
