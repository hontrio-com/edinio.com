import type { CSSProperties } from "react";

/**
 * Fundalul hero-ului: mesh de lumină verde, în plutire lentă.
 *
 * Șase pete de lumină care se plimbă una peste alta. Ce se mișcă de fapt nu e
 * fiecare pată în parte, ci AMESTECUL dintre ele: unde se suprapun două, acolo
 * se aprinde; când se despart, se stinge. De aceea desenul nu pare că se repetă,
 * deși fiecare pată își reia drumul.
 *
 * ═══ CE A CERUT CLIENTUL, PE RÂND ═══
 *
 * 1. Întâi „să fie static" — am înțeles greșit și am oprit tot.
 * 2. Apoi lămurirea: **nu pulsație — mișcare**, de tip mesh gradient.
 *
 * Diferența e tot rostul fișierului: petele NU își schimbă nici mărimea, nici
 * puterea, doar poziția. O pată care se umflă și se dezumflă se citește ca puls
 * chiar și când o face lent; una care doar se mută se citește ca lumină care se
 * plimbă. Regula asta se rupe ușor din greșeală — dacă cineva adaugă `scale` sau
 * `opacity` în animație, se întoarce exact ce a fost respins.
 *
 * 3. Și, peste tot: **subtil**. Pe alb, pragul e jos — peste vreo 0,18 verdele
 * începe să se citească drept fundal colorat, nu drept lumină.
 *
 * ═══ CUM E FĂCUT ═══
 *
 * Din gradiente și blur, nu cu WebGL. Varianta cu `ogl` de pe reactbits arată
 * bine, dar pune o pânză care se redesenează la fiecare cadru exact peste
 * elementul cel mai important al paginii, plus o dependință de încărcat înainte
 * să se vadă titlul — pe un site care are și o pagină „Optimizare".
 *
 * Animația e CSS pur, deci secțiunea rămâne componentă de server: zero
 * JavaScript pe client. Drumurile și oprirea la `prefers-reduced-motion` stau în
 * `globals.css`, la `.hero-mesh-blob`.
 *
 * Numerele sunt scrise de mână. `Math.random()` la randare ar da alt desen pe
 * server față de client și ar rupe hidratarea, iar mesh-ul ar arăta altfel la
 * fiecare încărcare — adică niciodată cum a fost aprobat.
 */

/**
 * Cele trei verzuri.
 *
 * Nu unul singur: șase pete din aceeași culoare dau un nor verde uniform, în care
 * nu se mai vede că sunt mai multe. Trei tonuri apropiate — brandul, unul mai
 * deschis și unul care bate spre albastru — se amestecă în nuanțe intermediare
 * acolo unde se suprapun, și abia asta se citește ca „mesh".
 *
 * Toate stau în familia verdelui de brand. Cu un ton cald printre ele s-ar fi
 * văzut imediat ca gradient de șablon.
 */
const TONES = {
  brand: "26, 181, 84",
  light: "74, 214, 122",
  deep: "14, 155, 116",
} as const;

/**
 * Lățimea la care au fost desenate mărimile de mai jos.
 *
 * Toate diametrele și neclaritățile sunt scrise ca pixeli pe un ecran de 1440 și
 * convertite în `vw`, ca desenul să se micșoreze odată cu ecranul.
 *
 * ═══ DE CE, ȘI CE S-A STRICAT FĂRĂ ASTA ═══
 *
 * Prima versiune avea diametrele în pixeli FICȘI. Poziția e în procente, deci pe
 * orice lățime petele stau răsfirate la fel — dar mărimea lor nu se schimba. Pe
 * un telefon de 390px, o pată de 640px e mai lată decât tot ecranul: toate șase
 * ajungeau una peste alta, iar verdele lor se aduna. Șase straturi de 0,10-0,17
 * suprapuse dau vreo 0,55, adică de două ori cât pe desktop, unde la orice punct
 * se suprapun doar două-trei.
 *
 * Asta a și reclamat clientul: „pe mobil parcă e prea concentrat tot verdele ăla
 * pe mijloc, nu e așa subtil ca pe PC". Nu era o problemă de opacitate, ci de
 * proporție — de aceea nu se rezolva slăbind culoarea, ci micșorând petele.
 *
 * Neclaritatea se scalează ODATĂ cu diametrul, nu rămâne în pixeli. Altfel, pe
 * telefon, un blur de 84px peste o pată de 173px ar fi topit-o de tot.
 */
const REF_WIDTH = 1440;

/** Pixeli la 1440 → `vw`, cu o limită sus ca pe ecrane foarte late să nu crească la nesfârșit. */
function scaled(px: number): string {
  return `min(${((px / REF_WIDTH) * 100).toFixed(2)}vw, ${Math.round(px * 1.15)}px)`;
}

interface Blob {
  /** Poziția centrului, în procente din secțiune. */
  x: number;
  y: number;
  /** Diametrul în pixeli, măsurat pe un ecran de 1440. Se convertește în `vw`. */
  size: number;
  tone: keyof typeof TONES;
  alpha: number;
  /** Neclaritatea în pixeli, tot la 1440. Se scalează odată cu diametrul. */
  blur: number;
  /** Care dintre cele patru drumuri din `globals.css`. */
  path: "a" | "b" | "c" | "d";
  duration: number;
  /**
   * NEGATIV dinadins: pornește animația din mijlocul ei, nu de la capăt. Fără
   * asta, la încărcarea paginii toate șase pleacă din exact aceeași poziție și
   * primele secunde se vede o formație care se desface.
   */
  delay: number;
}

/**
 * Cele șase pete.
 *
 * Cele mari și foarte neclare stau în spate, cele mici și mai clare în față —
 * de aici senzația de adâncime. Toate la același blur ar fi ieșit niște bule
 * lipite pe sticlă.
 *
 * Duratele sunt numere prime. Cu durate apropiate sau multiple una din alta,
 * cele șase s-ar reîntâlni des în aceeași așezare și reluarea s-ar vedea; cu
 * numere prime, tura comună e de ore.
 *
 * ═══ VITEZA, REGLATĂ CU MĂSURĂTORI, NU DIN OCHI ═══
 *
 * Durata singură nu spune NIMIC despre cât de repede se mișcă o pată: cursa e în
 * procente din pată, deci aceeași durată dă viteze diferite la mărimi diferite.
 * Iar accelerarea `ease-in-out` face ca viteza de la mijlocul unui segment să fie
 * mult peste medie. De aceea numerele de aici vin din browser, nu din cap:
 *
 * - prima încercare, durate de 30-47s și cursă de 8%: **1,7px pe secundă**, adică
 *   nu se vedea că se mișcă nimic decât dacă stăteai cu ochii pe pată;
 * - a doua, durate de 13-37s și cursă de 18% — am dublat și cursa, și viteza:
 *   **vârfuri de 44px pe secundă**, pete care fugeau prin fundal;
 * - acum: vârfuri între 7,5 și 22px pe secundă, cea mai iute fiind pata cea mare
 *   de 640px — care e și cea mai neclară, deci mișcarea ei se citește ca lumină
 *   care se plimbă, nu ca obiect care trece. Observi că trăiește dacă rămâi pe
 *   pagină, dar nu-ți ia ochii de pe titlu.
 *
 * GREȘEALA DE MĂSURARE, ca să n-o repete nimeni: prima verificare a luat o
 * singură probă de 3 secunde și a dat „totul e în regulă". Cu `ease-in-out` și
 * șase pete în faze diferite, o probă scurtă prinde pe cele mai multe în dreptul
 * unui capăt de cursă, unde stau aproape pe loc. Trebuie mai multe probe, pe o
 * fereastră mai lungă, și se ia VÂRFUL, nu media.
 */
const BLOBS: Blob[] = [
  { x: 20, y: -6, size: 640, tone: "brand", alpha: 0.17, blur: 84, path: "a", duration: 43, delay: -7 },
  { x: 60, y: 4, size: 560, tone: "light", alpha: 0.15, blur: 74, path: "b", duration: 53, delay: -19 },
  { x: 86, y: -10, size: 480, tone: "deep", alpha: 0.12, blur: 66, path: "c", duration: 47, delay: -31 },
  { x: 42, y: 24, size: 520, tone: "brand", alpha: 0.12, blur: 78, path: "d", duration: 59, delay: -44 },
  { x: 8, y: 28, size: 420, tone: "light", alpha: 0.11, blur: 62, path: "b", duration: 37, delay: -13 },
  { x: 74, y: 32, size: 380, tone: "deep", alpha: 0.1, blur: 56, path: "c", duration: 31, delay: -26 },
];

/**
 * Stingerea de jos.
 *
 * Fără ea, lumina s-ar termina brusc undeva peste text și s-ar vedea o muchie
 * orizontală pe toată lățimea ecranului. Se stinge devreme fiindcă sub ea urmează
 * butoanele și rândul de text mic, care au nevoie de alb curat.
 */
const FADE =
  "linear-gradient(to bottom, black 0%, black 52%, rgba(0,0,0,0.55) 74%, transparent 97%)";

function blobStyle(blob: Blob): CSSProperties {
  const rgb = TONES[blob.tone];
  const size = scaled(blob.size);

  return {
    left: `${blob.x}%`,
    top: `${blob.y}%`,
    width: size,
    height: size,
    /*
      Centrarea pe punctul de ancorare se face din margini negative, nu din
      `translate(-50%,-50%)`: `transform` e ocupat de animație, iar prima cheie a
      animației ar șterge centrarea și toate șase ar sări cu jumătate din lățimea
      lor în momentul în care pornesc.
    */
    marginLeft: `calc(${size} * -0.5)`,
    marginTop: `calc(${size} * -0.5)`,
    background: `radial-gradient(circle, rgba(${rgb},${blob.alpha}) 0%, rgba(${rgb},${(blob.alpha * 0.38).toFixed(3)}) 48%, transparent 72%)`,
    filter: `blur(${scaled(blob.blur)})`,
    ["--mesh-path" as string]: `hero-mesh-${blob.path}`,
    ["--mesh-duration" as string]: `${blob.duration}s`,
    ["--mesh-delay" as string]: `${blob.delay}s`,
  };
}

export function HeroMesh() {
  return (
    <div
      aria-hidden
      /*
        Înălțimea scade pe telefon odată cu hero-ul: acolo, conținutul se termină
        pe la 600px, iar o zonă de lumină de 760px ar fi împins stingerea de jos
        mult sub buton, unde n-o mai vede nimeni.
      */
      className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden sm:h-[680px] lg:h-[760px]"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    >
      {/*
        Aburul de dedesubt, nemișcat. Fără el, între pete rămân goluri de alb
        curat prin care se vede că sunt obiecte separate care se plimbă. Cu el,
        tot capul secțiunii stă într-o lumină, iar petele doar o îngroașă pe
        alocuri.
      */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(112% 82% at 42% -6%, rgba(${TONES.brand},0.06) 0%, transparent 74%)`,
        }}
      />

      {BLOBS.map((blob) => (
        <div
          key={`${blob.x}-${blob.y}`}
          className="hero-mesh-blob absolute rounded-full"
          style={blobStyle(blob)}
        />
      ))}
    </div>
  );
}
