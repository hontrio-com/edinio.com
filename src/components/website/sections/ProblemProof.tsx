import { EYEBROW_TONES } from "./SectionEyebrow";

/**
 * Secțiunea „Problema" — trei carduri, fiecare cu un panou care plutește peste o
 * perdea de lumină.
 *
 * Desenul vine dintr-o referință dată de client (2026-08-05): card cu chenar de
 * 1px și colț de 16px, înăuntru o zonă pătrată cu fascicule verticale estompate
 * sus și jos, peste ele un panou mic cu umbră, iar dedesubt titlu și descriere.
 * Referința era pe fundal negru; aici e mutată în alb.
 *
 * ═══ DE CE FASCICULELE SUNT VERZI, NU GRI ═══
 *
 * Nu e o alegere de gust, e singura care funcționează. Pe fundal închis, lumina
 * se face din dungi mai DESCHISE decât fundalul, iar ochiul o citește ca lumină.
 * Pe alb nu ai unde să mergi mai deschis, deci dungile trebuie să fie mai închise
 * decât fundalul — și dungi cenușii pe alb nu se citesc ca lumină, ci ca un cod
 * de bare. O culoare la transparență mică se citește în schimb tot ca lumină,
 * fiindcă schimbă tonul, nu doar luminozitatea.
 *
 * Verdele mai are un motiv: aceleași fascicule sunt deja în hero (`HeroBeams`),
 * așa că secțiunea nu aduce un efect nou, ci îl reia pe cel de sus.
 *
 * Tonul se schimbă dintr-un singur loc, `BEAM`. Pentru varianta roșie, cât timp
 * secțiunea descrie starea de dinainte: `EYEBROW_TONES.alarm.rgb`. Atenție însă
 * că roșul deschis pe alb dă roz, iar asta s-a mai încercat o dată la haloul de
 * sub titlu și a ieșit o cărămidă roz.
 *
 * ═══ CE S-A SCHIMBAT FAȚĂ DE VARIANTA DINAINTE ═══
 *
 * Erau trei capturi „1 la 1 cu realitatea" (WhatsApp, Excel, pagină fără CSS),
 * fiecare umplând cardul. Clientul le-a găsit prea brute. Acum sunt trei panouri
 * în limbajul nostru — alb, chenar subțire, tipografia site-ului — toate de
 * ACEEAȘI formă. Uniformitatea e jumătate din motivul pentru care referința arată
 * a lucru desenat de om: trei aparate diferite, cu trei forme diferite, se citesc
 * ca trei desene adunate, nu ca o serie.
 *
 * Ce se păstrează din varianta veche: conținutul. „Am găsit în altă parte" la
 * 16:20 rămâne partea care doare, indiferent în ce ramă stă.
 */

const { rgb: ALARM_RGB, text: ALARM_TEXT } = EYEBROW_TONES.alarm;

/** Tonul fasciculelor. Un singur loc; vezi comentariul de sus înainte să-l schimbi. */
const BEAM = EYEBROW_TONES.brand.rgb;

const TITLE = ["Produsul tău este bun.", "Magazinul online lasă de dorit."];

const LEAD =
  "Nu-ți lipsesc clienții. Îți lipsește locul în care să cumpere singuri, fără să te întrebe pe tine. Așa arată o zi obișnuită.";

/**
 * Eticheta, aliniată la stânga și fără triunghi.
 *
 * `SectionEyebrow` o centrează între două fire și cere o iconiță — potrivit
 * pentru un cap de secțiune centrat, nepotrivit aici, unde totul e la stânga.
 * Iar triunghiul de avertizare calcă regula „fără ornamente în fața
 * supratitlului".
 *
 * DE FĂCUT la următoarea trecere: mutată în `SectionEyebrow` ca variantă
 * aliniată la stânga, împreună cu perechea ei verde, „Soluția", de la funcții.
 * Cele două trebuie să arate identic, altfel nu se mai citește că a doua
 * răspunde la prima.
 */
function Eyebrow() {
  return (
    <span
      className="inline-flex items-center rounded-full border bg-white px-3 py-1 text-[12px] font-medium"
      style={{
        borderColor: `rgba(${ALARM_RGB},0.22)`,
        color: ALARM_TEXT,
        boxShadow: `0 0 0 5px rgba(${ALARM_RGB},0.05)`,
      }}
    >
      Problema
    </span>
  );
}

export function ProblemProof() {
  return (
    /* Fără spațiu jos: secțiunea de funcții vine imediat și își aduce propriul
       spațiu de sus. Puse amândouă, s-ar aduna și ar rămâne o gaură în mijlocul
       paginii. */
    <section className="bg-white pt-16 lg:pt-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        {/*
          Capul e ASIMETRIC: titlul la stânga, lead-ul într-o coloană mai îngustă
          la dreapta, aliniate pe linia de jos. Simetria perfectă pe verticală —
          supratitlu, titlu, text, toate centrate — e desenul implicit al
          oricărei pagini scoase pe bandă.
        */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-end lg:gap-16">
          <div>
            <Eyebrow />
            <h2 className="mt-5 text-[30px] font-bold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[42px] lg:text-[46px]">
              {TITLE.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>
          </div>

          <p className="text-pretty text-[15px] leading-[1.65] text-ink-2 sm:text-[17px] lg:pb-1.5">
            {LEAD}
          </p>
        </div>

        <div className="mt-11 grid gap-5 sm:mt-14 md:grid-cols-3 lg:mt-16 lg:gap-6">
          <ProofCard
            title="Comenzile trăiesc în conversații."
            detail="Una s-a pierdut între „mai aveți pe stoc?” și „am găsit în altă parte”."
            beamSeed={0}
          >
            <MessagesPanel />
          </ProofCard>

          <ProofCard
            title="Hârtiile le faci noaptea."
            detail="Vineri, 23:47. Facturile de azi, AWB-urile de mâine, stocul cine știe când."
            beamSeed={1}
          >
            <InvoicesPanel />
          </ProofCard>

          <ProofCard
            title="Magazinul se vede după 6,8 secunde."
            detail="Pe telefon, în mijlocul zilei. Clientul nu are răbdarea ta."
            beamSeed={2}
          >
            <SpeedPanel />
          </ProofCard>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Cardul
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un card: perdeaua de lumină cu panoul plutind peste ea, apoi textul.
 *
 * Colțurile sunt 16px afară și 10px înăuntru, cu 6px între ele. Nu sunt cifre
 * alese la întâmplare: ca două colțuri concentrice să pară paralele, raza
 * interioară trebuie să fie cea exterioară minus distanța dintre ele. Cu aceeași
 * rază în amândouă părțile, colțul din interior arată prea rotund.
 */
function ProofCard({
  title,
  detail,
  beamSeed,
  children,
}: {
  title: string;
  detail: string;
  beamSeed: number;
  children: React.ReactNode;
}) {
  return (
    <article
      className="proof-card flex flex-col rounded-[16px] border border-hairline bg-white"
      style={{
        boxShadow:
          "0 1px 1px rgba(10,10,10,0.03), 0 10px 24px -14px rgba(10,10,10,0.14)",
      }}
    >
      <div className="p-1.5">
        {/*
          `isolate` ține amestecul granulelor înăuntru. Fără el, `mix-blend-mode`
          de pe stratul de granule caută fundalul până la primul strat de
          stivuire de deasupra și ar fi înnegrit și pagina din jurul cardului.
        */}
        <div className="relative isolate aspect-square overflow-hidden rounded-[10px] bg-tint">
          <Beams seed={beamSeed} />
          <Grain />

          {/*
            Panoul plutește peste lumină, nu stă lipit de fundul zonei. Lăsat
            până la marginile zonei, ar fi acoperit fix partea din perdea care se
            vede cel mai bine; cu 80% rămân dungi pe lângă el, de o parte și de
            alta.

            `perspective` stă pe părintele DIRECT al panoului. Pusă mai sus, pe
            zona întreagă, `rotateX` iese turtire, nu înclinare — aceeași
            capcană ca la teancul de carduri de la funcții.
          */}
          <div
            className="absolute inset-0 grid place-items-center p-4 sm:p-5"
            style={{ perspective: "900px" }}
          >
            {/* Înclinarea și îndreptarea la hover stau în `globals.css`, la
                `.proof-panel`. Vezi comentariul de acolo: scrise ca utilitare pe
                element, se băteau cap în cap cu `transform-gpu`. */}
            <div className="proof-panel w-full max-w-[80%]">{children}</div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-6 pt-4 sm:px-5 sm:pb-7 sm:pt-5">
        <h3 className="text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink sm:text-[18px]">
          {title}
        </h3>
        <p className="mt-2 text-[14px] leading-[1.5] text-ink-2 sm:text-[14.5px]">
          {detail}
        </p>
      </div>
    </article>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Perdeaua de fascicule
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dungile. Poziția, lățimea, puterea și înălțimea vârfului, scrise de mână.
 *
 * Scrise, nu generate cu `Math.random()`, din două motive: la randare pe server
 * ar fi ieșit alte numere decât în browser și React ar fi reclamat nepotrivirea,
 * iar la fiecare încărcare a paginii perdeaua ar fi arătat altfel — adică
 * niciodată așa cum ai aprobat-o.
 *
 * Fiecare rând e `[stânga %, lățime px, putere, vârf %]`.
 *
 * PUTERILE. Prima încercare le-a pus între 0,04 și 0,18, adică valorile care ar
 * fi fost potrivite pe fundal negru — iar pe alb perdeaua a ieșit INVIZIBILĂ.
 * Motivul e același cu cel de la începutul fișierului: pe negru, o dungă la 0,15
 * e mult mai deschisă decât fundalul și sare în ochi; pe alb, aceeași dungă abia
 * schimbă tonul. Aici merg între 0,10 și 0,42. Și mai scad o dată, fiindcă masca
 * de sus-jos și stingerea proprie a fiecărei dungi se ÎNMULȚESC: o dungă de 0,40
 * ajunge pe la 0,20 acolo unde e cel mai tare.
 *
 * VÂRFURILE, între 40% și 80%, sunt ce face perdeaua să nu arate a gard. Toate
 * dungile cu vârful la aceeași înălțime dau un grilaj; la înălțimi diferite, unele
 * par mai aproape și altele mai departe.
 *
 * Cele câteva dungi tari stau răsfirate, nu una lângă alta: un pâlc de dungi
 * puternice se citește ca o pată, nu ca lumină.
 */
type Beam = [number, number, number, number];

const BEAM_FIELDS: Beam[][] = [
  [
    [3, 2, 0.14, 44], [8, 5, 0.30, 66], [13, 2, 0.12, 32], [18, 3, 0.21, 78],
    [23, 6, 0.38, 52], [30, 2, 0.13, 38], [35, 4, 0.26, 72], [40, 2, 0.10, 30],
    [45, 7, 0.42, 60], [53, 3, 0.19, 40], [58, 2, 0.12, 80], [63, 5, 0.31, 50],
    [70, 2, 0.14, 34], [75, 3, 0.22, 74], [80, 6, 0.36, 56], [87, 2, 0.12, 36],
    [92, 4, 0.24, 68], [97, 2, 0.14, 46],
  ],
  [
    [2, 4, 0.24, 70], [7, 2, 0.12, 36], [12, 6, 0.36, 54], [19, 3, 0.19, 80],
    [24, 2, 0.11, 30], [29, 5, 0.30, 62], [36, 2, 0.14, 42], [41, 7, 0.40, 50],
    [49, 3, 0.17, 34], [54, 2, 0.12, 76], [59, 4, 0.28, 58], [65, 6, 0.38, 44],
    [72, 2, 0.12, 32], [77, 3, 0.21, 72], [82, 2, 0.14, 40], [88, 5, 0.31, 64],
    [94, 3, 0.19, 48], [98, 2, 0.12, 34],
  ],
  [
    [4, 3, 0.19, 56], [9, 2, 0.12, 32], [15, 7, 0.40, 48], [23, 3, 0.22, 74],
    [28, 2, 0.11, 38], [33, 5, 0.33, 62], [39, 2, 0.14, 30], [44, 3, 0.20, 80],
    [50, 6, 0.38, 44], [57, 2, 0.12, 36], [62, 4, 0.26, 70], [68, 2, 0.14, 42],
    [73, 5, 0.33, 54], [79, 3, 0.19, 34], [84, 2, 0.12, 76], [89, 6, 0.36, 50],
    [95, 2, 0.14, 40], [99, 3, 0.21, 66],
  ],
];

const BEAM_MASK =
  "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgb(0,0,0) 22%, rgb(0,0,0) 76%, rgba(0,0,0,0) 100%)";

/**
 * Granulația de peste perdea.
 *
 * În referință, fasciculele nu sunt gradiente netede — au granule. Nu e un
 * ornament: în original lumina e desenată de un shader pe `<canvas>`, iar
 * zgomotul vine odată cu ea. Fără el, un gradient CSS pe suprafață mare arată
 * prea curat, ca o suprafață vopsită, și în plus face DUNGI de banding acolo
 * unde trece de la o nuanță la alta. Granulele rup exact banding-ul ăla.
 *
 * Făcută cu `feTurbulence` într-un SVG de 140px pus ca fundal care se repetă, nu
 * cu o poză: nu aduce nicio cerere în plus și nu are ce se încărca greșit.
 *
 * `stitchTiles='stitch'` e obligatoriu. Fără el, zgomotul se taie la marginea
 * plăcii, iar la repetare se vede o grilă de 140px pe toată zona.
 *
 * `feColorMatrix saturate 0` scoate culoarea: `feTurbulence` scoate din fabrică
 * zgomot COLORAT, iar peste verdele nostru ar fi ieșit puncte roșii și albastre.
 */
const GRAIN_TILE = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>" +
    "<filter id='g'>" +
    "<feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/>" +
    "</filter>" +
    "<rect width='140' height='140' filter='url(%23g)'/>" +
    "</svg>",
)}`;

/** Stingerea unei singure dungi, cu vârful acolo unde i s-a cerut. */
function beamGradient(alpha: number, peak: number) {
  const start = Math.max(0, peak - 46);
  const rise = Math.max(1, peak - 20);
  const fall = Math.min(99, peak + 20);

  return `linear-gradient(to bottom,
    rgba(${BEAM},0) 0%,
    rgba(${BEAM},0) ${start}%,
    rgba(${BEAM},${(alpha * 0.34).toFixed(3)}) ${rise}%,
    rgba(${BEAM},${alpha}) ${peak}%,
    rgba(${BEAM},${(alpha * 0.42).toFixed(3)}) ${fall}%,
    rgba(${BEAM},0) 100%)`;
}

/**
 * Perdeaua.
 *
 * Trei lucruri o țin să arate a lumină și nu a grilaj:
 *
 * 1. **Masca de sus și de jos.** `linear-gradient(0deg, transparent, negru 50%,
 *    transparent)`: dungile nu se termină nicăieri, se sting. Tăiate drept la
 *    marginea zonei, s-ar fi văzut că sunt dreptunghiuri.
 * 2. **Neclaritatea.** Un fascicul cu margini tăiate e o bară. Cu `blur` de
 *    câțiva pixeli, marginile se pierd și rămâne strălucirea.
 * 3. **Fiecare dungă are propria stingere pe verticală**, cu vârful în treimea
 *    de jos. Toate la fel de puternice pe toată înălțimea ar fi dat un gard.
 *
 * Fiecare card primește altă perdea (`seed`). Aceeași perdea de trei ori se vede
 * imediat, mai ales că stau una lângă alta.
 */
function Beams({ seed }: { seed: number }) {
  const field = BEAM_FIELDS[seed % BEAM_FIELDS.length];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        /*
          Referința folosea `transparent 0% → negru 50% → transparent 100%`, adică
          un vârf ascuțit exact la mijloc. Pe fundal negru merge, fiindcă lumina e
          oricum tare. Pe alb, vârful ăla taie din putere peste tot în afară de o
          singură linie, iar perdeaua abia se ghicea. Aici masca are PLATOU: se
          stinge tot la capete, dar între 22% și 76% e întreagă.
        */
        maskImage: BEAM_MASK,
        WebkitMaskImage: BEAM_MASK,
      }}
    >
      {/* Strălucirea largă de dedesubt: fără ea, dungile plutesc pe un fundal
          gol și se văd ca obiecte. Cu ea, stau într-o lumină. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(80% 62% at 50% 58%, rgba(${BEAM},0.20) 0%, rgba(${BEAM},0.075) 50%, transparent 82%)`,
        }}
      />

      {/* Neclaritatea e mică dinadins. La 3px dungile se topeau într-o spălătură
          verde; la 1,5px se văd ca fascicule, dar marginile tot nu sunt tăiate. */}
      <div className="absolute inset-0" style={{ filter: "blur(1.5px)" }}>
        {field.map(([left, width, alpha, peak]) => (
          <span
            key={`${left}-${width}`}
            className="absolute top-0 bottom-0"
            style={{
              left: `${left}%`,
              width,
              background: beamGradient(alpha, peak),
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Stratul de granule.
 *
 * Stă peste perdea și peste tot fundalul zonei, dar SUB panou: granulele care
 * ar trece și peste panou l-ar face să pară murdar, nu texturat.
 *
 * `multiply` în loc de o simplă transparență: pe alb, granulele trebuie să
 * ÎNTUNECE punctual, nu să acopere cu gri. Cu opacitate simplă, zgomotul ar fi
 * albit fasciculele și ar fi rămas o ceață peste ele.
 *
 * OPACITATEA e singurul lucru de reglat aici, `GRAIN_OPACITY`. Prima încercare a
 * pus 0,32 și a ieșit dezastru: zgomotul din `feTurbulence` are luminanța medie
 * pe la jumătate, deci înmulțit peste tot a transformat zona într-un câmp cenușiu
 * și a înecat fasciculele.
 *
 * Pe fundal închis, granulația se vede oricât de discretă ar fi. Pe alb nu are
 * cum: trebuie să stea la limita vizibilului, cât s-o simți ca textură fără s-o
 * vezi ca puncte.
 *
 * MASCA e la fel de importantă ca opacitatea. Întinsă uniform peste toată zona,
 * granulația cenușea și colțurile care trebuie să rămână albe curate — pe alb,
 * `multiply` întunecă întotdeauna în medie, n-are cum altfel. Cu `overlay` sau
 * `soft-light` n-ar întuneca, dar peste un fundal aproape alb formula lor nu mai
 * face aproape nimic, deci granulația ar dispărea de tot.
 *
 * Soluția e să nu fie peste tot: aceeași mască ca la perdea, deci textura stă
 * doar acolo unde e lumină. Așa arată și în referință — granulele vin din
 * shaderul care desenează lumina, nu din fundal.
 */
const GRAIN_OPACITY = 0.16;

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `url("${GRAIN_TILE}")`,
        backgroundSize: "140px 140px",
        mixBlendMode: "multiply",
        opacity: GRAIN_OPACITY,
        maskImage: BEAM_MASK,
        WebkitMaskImage: BEAM_MASK,
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Panourile
   ══════════════════════════════════════════════════════════════════════════

   Toate trei au ACEEAȘI ramă și aceeași densitate: un cap, trei-patru rânduri,
   o pastilă de stare la capătul fiecăruia. Uniformitatea e jumătate din motivul
   pentru care referința arată a serie și nu a trei desene adunate.

   Roșul apare doar în pastilele care spun că s-a pierdut ceva. Pus pe fiecare
   rând, n-ar mai fi însemnat nimic. */

function Panel({
  head,
  children,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="w-full rounded-[10px] border border-hairline bg-white"
      /*
        Trei umbre, nu una. Un panou înclinat cu o singură umbră arată lipit pe
        fundal: prima e contactul, strâns și aproape; a doua e volumul; a treia,
        lungă și coborâtă, e umbra aruncată pe perdea. Fără cea de-a treia,
        înclinarea se vede dar panoul nu pare că stă DEASUPRA a ceva.
      */
      style={{
        boxShadow:
          "0 1px 2px rgba(10,10,10,0.05), 0 8px 16px -6px rgba(10,10,10,0.12), 0 28px 46px -18px rgba(10,10,10,0.28)",
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        {head}
      </div>
      <div className="divide-y divide-hairline">{children}</div>
    </div>
  );
}

function PanelHead({ label, note }: { label: string; note?: string }) {
  return (
    <>
      <span className="truncate text-[11.5px] font-semibold text-ink">
        {label}
      </span>
      {note ? (
        <span className="shrink-0 text-[10.5px] tabular-nums text-ink-3">
          {note}
        </span>
      ) : null}
    </>
  );
}

/** Un rând: ce s-a întâmplat la stânga, în ce stare a rămas la dreapta. */
function Row({
  main,
  sub,
  pill,
  alarm,
}: {
  main: string;
  sub?: string;
  pill: string;
  alarm?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-[9px]">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] leading-[1.35] text-ink">
          {main}
        </span>
        {sub ? (
          <span className="block truncate text-[10px] leading-[1.35] text-ink-3">
            {sub}
          </span>
        ) : null}
      </span>

      <span
        className="shrink-0 whitespace-nowrap rounded-full px-2 py-[3px] text-[9.5px] font-medium"
        style={
          alarm
            ? {
                backgroundColor: `rgba(${ALARM_RGB},0.08)`,
                color: ALARM_TEXT,
              }
            : { backgroundColor: "#F1F1F4", color: "#6B6B76" }
        }
      >
        {pill}
      </span>
    </div>
  );
}

function MessagesPanel() {
  return (
    <Panel head={<PanelHead label="Mesaje" note="azi" />}>
      <Row main="Mai aveți lampa pe stoc?" sub="Andreea M. · 10:42" pill="fără răspuns" alarm />
      <Row main="Aș vrea 2 bucăți, în Cluj" sub="Andreea M. · 10:43" pill="fără răspuns" alarm />
      <Row main="Când ajunge coletul?" sub="Ionuț P. · 12:18" pill="fără răspuns" alarm />
      <Row main="Am găsit în altă parte" sub="Andreea M. · 16:20" pill="pierdut" alarm />
    </Panel>
  );
}

function InvoicesPanel() {
  return (
    <Panel head={<PanelHead label="Facturi de emis" note="23:47" />} >
      <Row main="Andreea M." sub="178,00 lei · 04.08" pill="emisă" />
      <Row main="Maria D." sub="245,00 lei · 05.08" pill="lipsă" alarm />
      <Row main="Radu C." sub="312,00 lei · 05.08" pill="lipsă" alarm />
      <Row main="Elena B." sub="89,90 lei · 05.08" pill="lipsă" alarm />
    </Panel>
  );
}

/**
 * Al treilea panou are alt cuprins, dar aceeași ramă: un cap, apoi rânduri cu
 * stare la capăt. Cifra mare stă în locul primului rând, fiindcă e singurul
 * lucru care contează aici.
 */
function SpeedPanel() {
  return (
    <Panel head={<PanelHead label="magazinul-tau.ro" note="pe telefon" />}>
      <div className="flex items-baseline gap-1.5 px-3 pb-2 pt-2.5">
        <span
          className="text-[26px] font-bold leading-none tabular-nums tracking-[-0.02em]"
          style={{ color: ALARM_TEXT }}
        >
          6,8
        </span>
        <span className="text-[12px] font-medium" style={{ color: ALARM_TEXT }}>
          secunde
        </span>
        <span className="ms-auto self-center text-[10px] text-ink-3">
          până se vede ceva
        </span>
      </div>

      <Row main="Prima imagine" sub="ar trebui sub 2,5 s" pill="4,1 s" alarm />
      <Row main="Poate fi atins" sub="ar trebui sub 3 s" pill="6,8 s" alarm />
      <Row main="Verificat de Google" sub="pe conexiune mobilă" pill="slab" alarm />
    </Panel>
  );
}
