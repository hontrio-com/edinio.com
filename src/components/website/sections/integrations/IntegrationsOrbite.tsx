import Link from "next/link";
import { ArrowUpRight, Store } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { type LogoKey } from "@/lib/website/logos";
import { Logo } from "./Logo";
import { SectionEyebrow } from "../SectionEyebrow";

/**
 * Varianta „Orbite" a secțiunii de integrări.
 *
 * Trei arce subțiri pornesc dintr-un nod verde așezat jos, în mijloc, și se
 * desfășoară peste toată lățimea. Pe arce stau bule albe cu sigle. Antetul e
 * centrat și trece PESTE compoziție: arcele îi urcă prin spatele titlului.
 *
 * ═══ CUM STAU BULELE FIX PE ARCE, LA ORICE LĂȚIME ═══
 *
 * Asta e toată greutatea variantei, și se rezolvă cu o singură idee: arcele și
 * bulele trăiesc în ACELAȘI sistem de coordonate.
 *
 * Există o „lume" — un plan cu originea în colțul din stânga-sus, în care nodul
 * e la (600, 512) și orbitele sunt cercuri cu razele 170, 300 și 430 în jurul
 * lui. Arcele se desenează într-un `<svg>` al cărui `viewBox` e o fereastră
 * peste lumea asta. Bulele NU sunt în SVG — sunt `<div>`-uri absolute, dar
 * poziția lor se calculează din exact aceleași coordonate, împărțite la
 * fereastră: `left = (x - fereastra.x) / fereastra.w`.
 *
 * Ca cele două să se suprapună, containerul are `aspect-ratio` egal cu raportul
 * ferestrei, iar SVG-ul are `preserveAspectRatio="xMidYMid meet"`. Când
 * raporturile coincid, `meet` nu mai lasă nicio bandă goală: un punct din lume
 * cade în același loc și în SVG, și în procentele containerului. La orice
 * lățime, de la 320 la 1920.
 *
 * Deci ca să MUȚI o bulă schimbi unghiul ei în grade, nu procente. Punctul iese
 * din `punct(unghi, rază)`: 180° = capătul din stânga al orbitei, 90° = vârful,
 * 0° = capătul din dreapta. Atât timp cât raza e una dintre cele trei din
 * `RAZE`, bula rămâne matematic pe arc — nu se poate greși.
 *
 * ═══ DOUĂ FERESTRE, O SINGURĂ LUME ═══
 *
 * Aceeași lume e privită prin două ferestre. Cea lată (`0 0 1200 600`, raport
 * 2:1) arată tot; cea îngustă (`250 180 700 440`, raport ~1,6:1) e un decupaj
 * strâns în jurul nodului, pentru telefon.
 *
 * Nu e o dublare din comoditate. Cu o singură fereastră de 2:1, la 320px
 * compoziția ar avea 280x140 — o dungă în care nici bulele, nici arcele nu se
 * mai citesc. Decupajul strâns dă 280x176 cu jumătate din conținut, deci
 * elementele rămân la o mărime umană. Arcele intră și ies prin marginile
 * ferestrei, ceea ce chiar ajută: se citește că orbitele continuă dincolo de
 * ecran.
 *
 * Fereastra îngustă arată 4 bule, cea lată 6. Se schimbă la `sm`, nu la `lg`,
 * fiindcă de la 640px în sus decupajul strâns ar deveni mai înalt decât lat.
 *
 * Doar una dintre cele două e afișată la un moment dat (`sm:hidden` /
 * `hidden sm:block`), deci nici cititorul de ecran nu le vede pe amândouă, iar
 * siglele ascunse cu `display:none` și `loading="lazy"` nu se descarcă.
 *
 * ═══ ANTETUL PESTE COMPOZIȚIE, FĂRĂ SĂ DEPINDĂ DE CÂTE RÂNDURI ARE ═══
 *
 * De la `lg` în sus antetul stă peste compoziție. Suprapunerea NU se face
 * punându-le pe amândouă în aceeași celulă de grilă, deși ăsta e reflexul.
 *
 * Acolo antetul pornește din marginea de SUS a celulei, deci aerul dintre
 * ultimul lui rând și prima bulă iese ca „înălțimea compoziției până la bulă
 * MINUS înălțimea antetului" — adică depinde de cum se rupe textul. Descrierea
 * de acum umple aproape exact două rânduri la 520px; un font ceva mai lat, o
 * virgulă mutată sau un cuvânt în plus o trec pe trei, iar bula urcă peste link
 * fără ca cineva să fi atins geometria. E o suprapunere care se strică dintr-o
 * corectură de text, deci nu se poate lăsa așa.
 *
 * Aici cele două curg normal una după alta, iar compoziția e trasă în sus cu o
 * margine negativă FIXĂ, `lg:-mt-[250px]`. Așa distanța se măsoară de la
 * marginea de JOS a antetului, nu de la cea de sus, și rămâne aceeași oricâte
 * rânduri ar avea textul: dacă antetul crește, coboară compoziția odată cu el.
 *
 * De unde 250: la 1024px — lățimea cea mai strânsă, fiindcă acolo compoziția e
 * cea mai mică — prima bulă de sub antet (SmartBill, 150° pe orbita mică) are
 * marginea de sus la 305,6px de vârful compoziției. Cu 250 de suprapunere rămân
 * 55,6px de aer sub text. Peste 1024 doar crește — 118px la 1200 — fiindcă
 * antetul rămâne la 520px în timp ce compoziția se lățește.
 *
 * Se poate mări până la ~290 pentru o suprapunere mai adâncă. Peste 305, bulele
 * intră peste text la 1024px.
 *
 * ═══ FĂRĂ JAVASCRIPT ═══
 *
 * Server component. Tot ce se vede e în HTML de la prima pictură: unghiurile se
 * convertesc în procente la randare, pe server. Singura mișcare e la `hover`.
 */

/* ─────────────────────────────────────────────────────────────────────────────
   LUMEA
   ────────────────────────────────────────────────────────────────────────── */

/** Centrul orbitelor. Aici stă nodul verde, jos și la mijloc. */
const NOD = { x: 600, y: 512 } as const;

/**
 * Razele celor trei orbite.
 *
 * Trei, nu mai multe: la patru arce desenul începe să semene cu o țintă. Cea mai
 * mare e 430 fiindcă atunci orbita se întinde pe x între 170 și 1030 — adică
 * lasă 170 de unități de aer de fiecare parte într-o lume de 1200 — iar vârful
 * ei cade la y=82, destul de sus cât să treacă pe după titlu.
 */
const RAZE = [170, 300, 430] as const;

/**
 * Capetele arcului, în grade (180° = stânga, 90° = sus, 0° = dreapta).
 *
 * Trec puțin de orizontala nodului, la 188° și -8°, ca să coboare sub el.
 * Oprite exact la 180/0 arătau ca un curcubeu așezat pe o linie invizibilă; cu
 * capetele lăsate în jos se citesc ca orbite privite dintr-o parte.
 */
const ARC_START = 188;
const ARC_STOP = -8;

/** Grosimea liniei e 1px REAL, vezi `vectorEffect` mai jos, nu 1 unitate de lume. */
const CULOARE_ARC = "#E8E8EE";

const VERDE_BRAND = "#1AB554";

/**
 * Cât „cerneală" are o siglă în bulă, în pixeli pătrați.
 *
 * NU `LOGO_AREA.tile` (1600), și e o socoteală, nu o preferință. Bula are 72px,
 * deci sigla nu poate depăși ~46px lățime fără să atingă marginea rotundă. La
 * 1600, trei dintre cele șase alese (FAN Courier, BT iPay, OLX — toate late) ies
 * peste 51px și le taie `maxWidth`, ceea ce le lasă cu o suprafață reală de
 * ~1250 în timp ce vecinele lor pătrate rămân la 1600. Adică exact inegalitatea
 * pe care o repară `logos.ts`.
 *
 * 1200 e cea mai mare arie la care nu se lovește NICIUNA de plafon, deci
 * egalizarea de suprafață chiar funcționează. Plafonul se atinge la raport
 * `46² / 1200 = 1,76`, iar cea mai lată dintre cele șase e OLX cu 1,73 — trece la
 * limită. (La 1250, unde era înainte, OLX ieșea de 46,5px și era deja tăiată.)
 *
 * Deci dacă schimbi siglele: peste raportul 1,76 sigla se lovește de plafon și
 * trebuie coborâtă aria sau aleasă alta.
 */
const ARIE_SIGLA = 1200;
const LATIME_MAX_SIGLA = 46;

interface Punct {
  x: number;
  y: number;
}

/** Punctul de pe orbita `raza`, la `unghi` grade. Y-ul e inversat: în SVG crește în jos. */
function punct(unghi: number, raza: number): Punct {
  const rad = (unghi * Math.PI) / 180;
  return {
    x: NOD.x + raza * Math.cos(rad),
    y: NOD.y - raza * Math.sin(rad),
  };
}

/**
 * Traseul unui arc, de la `ARC_START` la `ARC_STOP`.
 *
 * Steagurile din `A`: `1 1` = arcul mare (mătură 196°, deci peste 180) și sensul
 * acelor de ceasornic pe ecran, adică prin vârf. Cu `0 1` ar trece pe dedesubt,
 * pe sub nod.
 */
function traseu(raza: number): string {
  const a = punct(ARC_START, raza);
  const b = punct(ARC_STOP, raza);
  const r = (n: number) => Math.round(n * 100) / 100;
  return `M ${r(a.x)} ${r(a.y)} A ${raza} ${raza} 0 1 1 ${r(b.x)} ${r(b.y)}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   FERESTRELE
   ────────────────────────────────────────────────────────────────────────── */

interface Vedere {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Toată lumea. Raport 2:1. */
const VEDERE_LATA: Vedere = { x: 0, y: 0, w: 1200, h: 600 };

/**
 * Decupaj strâns în jurul nodului, pentru sub 640px. Raport ~1,59:1.
 *
 * Lățimea de 700 nu e rotunjită la ochi: la 320px ecran, containerul are 280px,
 * deci o bulă de 43px ajunge să măsoare 108 unități de lume. Cu o fereastră mai
 * largă (900+) bulele se ating între ele și ating nodul. 700 e cea mai largă
 * fereastră la care rămâne aer între ele la 320px.
 */
const VEDERE_INGUSTA: Vedere = { x: 250, y: 180, w: 700, h: 440 };

/** Un punct din lume, exprimat în procente din fereastră. Perechea lui `viewBox`. */
function pozitie(p: Punct, v: Vedere) {
  return {
    left: `${((p.x - v.x) / v.w) * 100}%`,
    top: `${((p.y - v.y) / v.h) * 100}%`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   BULELE
   ────────────────────────────────────────────────────────────────────────── */

interface Bula {
  k: LogoKey;
  /** Grade: 180° = capătul din stânga al orbitei, 90° = vârful, 0° = dreapta. */
  unghi: number;
  raza: number;
}

/**
 * Cele șase bule ale ferestrei late — șase categorii diferite din `LOGO_GROUPS`,
 * ca să se vadă din desen că integrările nu sunt toate de același fel.
 *
 * ═══ DE CE STAU TOATE JOS ═══
 *
 * Unghiurile nu sunt alese estetic, sunt REZULTATUL unei condiții: nicio bulă nu
 * are voie să atingă antetul, la nicio lățime. Cazul cel mai strâns e fix la
 * 1024px, prima lățime la care cele două se suprapun și totodată cea la care
 * compoziția e cea mai mică: 960x480, deci scara lume→pixel e 0,8.
 *
 * Pe VERTICALĂ condiția e ținută de suprapunerea fixă de 250px (vezi nota de
 * sus), nu de unghiuri: sub ultimul rând de text rămân 55,6px la 1024px, oricâte
 * rânduri ar avea antetul. Ce se verifică aici e doar cât de sus urcă fiecare
 * bulă în compoziție, măsurat de la vârful ei, la 1024px:
 *   150° pe 170 → marginea de sus la 305,6px  ← cea mai sus dintre cele de sub text
 *   167° pe 300 → 319,6px
 *   160° pe 430 → 255,9px, adică PESTE linia de jos a antetului
 *
 * Ultima scapă PE LATERAL, și de-aia are voie să urce: centrul ei cade la x=157px,
 * iar cutia antetului (520px, centrată în 960) începe abia la 220px — deci
 * marginea din dreapta a bulei, 192,7px, rămâne la 27px de ea. Textul propriu-zis
 * e centrat și mult mai îngust decât cutia, deci aerul văzut e mai mare. Și
 * oglinda ei la dreapta, la 20°.
 *
 * Consecința e că partea de sus a compoziției rămâne goală, cu arcele singure.
 * Nu e o scăpare: acolo stă titlul, iar orbitele care îi trec prin spate sunt
 * exact efectul dorit. Dacă urci vreo bulă peste 250px de vârful compoziției fără
 * să iasă lateral din cei 220px, o urci peste text.
 */
const BULE_LATE: Bula[] = [
  { k: "fanCourier", unghi: 160, raza: RAZE[2] },
  { k: "mailchimp", unghi: 167, raza: RAZE[1] },
  { k: "smartbill", unghi: 150, raza: RAZE[0] },
  { k: "ipay", unghi: 30, raza: RAZE[0] },
  { k: "googleAnalytics", unghi: 13, raza: RAZE[1] },
  { k: "olx", unghi: 20, raza: RAZE[2] },
];

/**
 * Patru bule pentru telefon, tot pe orbite — doar unghiurile sunt altele, ca să
 * intre în decupajul îngust cu aer între ele.
 *
 * Sub `sm` antetul stă DEASUPRA compoziției, nu peste ea, deci aici nu mai există
 * condiția de ocolire a textului; singura condiție e să nu se atingă între ele.
 * La 320px (bule de 43px, adică 108 unități de lume) distanțele sunt: 27px între
 * bula de pe orbita mijlocie și cea interioară, 22px între cea interioară și nod.
 */
const BULE_INGUSTE: Bula[] = [
  { k: "fanCourier", unghi: 155, raza: RAZE[1] },
  { k: "smartbill", unghi: 125, raza: RAZE[0] },
  { k: "ipay", unghi: 55, raza: RAZE[0] },
  { k: "googleAnalytics", unghi: 25, raza: RAZE[1] },
];

/**
 * Bulele și nodul au o mărime FIXĂ — 72px și 80px — micșorată în trepte cu
 * `scale`.
 *
 * Nu clase de lățime pe fiecare prag, fiindcă sigla dinăuntru e desenată de
 * `<Logo>` la o înălțime în pixeli, calculată o singură dată. Cu `scale` se
 * micșorează bula și sigla ei în același raport, deci proporția rămâne aceeași
 * peste tot; cu clase de lățime ar fi trebuit patru `<Logo>` per bulă.
 *
 * `scale` nu strică poziționarea: în CSS `translate` se aplică ÎNAINTEA lui
 * `scale`, cu procente raportate la mărimea nescalată, deci centrul cercului
 * rămâne exact pe punctul de pe arc, oricare ar fi treapta.
 *
 * Fiecare fereastră are trepte proprii, și nu e o inconsecvență: aceiași pixeli
 * înseamnă cu totul altceva în cele două. La 640px, fereastra lată arată 1200 de
 * unități în 592px, deci o bulă de 54px acoperă 109 unități și rămâne la 13px de
 * vecina ei; la 50px acoperă 102 și rămân 22. Fereastra îngustă arată doar 700
 * de unități, deci acolo aceiași 54px sunt de două ori mai mici în lume.
 */
const SCARA_INGUSTA = "scale-[0.6] min-[400px]:scale-75";
const SCARA_LATA = "scale-[0.7] md:scale-[0.875] lg:scale-100";

export function IntegrationsOrbite() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        {/*
          Antetul si compozitia sunt doua blocuri unul sub altul, in flux normal.
          Suprapunerea de la `lg` in sus se face tragand compozitia in sus cu o
          margine negativa, nu bagandu-le pe amandoua in aceeasi celula de grila
          — motivul e in nota de sus: asa aerul dintre ultimul rand de text si
          prima bula nu mai depinde de cate randuri are antetul.

          `z-10` tine antetul deasupra compozitiei desi vine primul in DOM.
          Ordinea din DOM e cea de citire (titlu, apoi siglele); ordinea de
          pictura o decide z-index-ul. Antetul e `relative z-10`, iar radacina
          compozitiei e `relative` fara z-index, deci antetul castiga.
        */}
        <div className="relative z-10 mx-auto max-w-[520px] text-center">
          <SectionEyebrow label="Integrări" />

          {/*
            Doua randuri la 520px latime, dar nu mai e o limita dura: de cand
            compozitia e trasa in sus cu o margine negativa FIXA, un rand in plus
            coboara compozitia odata cu textul, nu bulele peste el.

            Titlul de acum se rupe in doua si nu ajunge la trei decat sub ~400px
            latime, unde oricum s-a trecut demult pe `text-[32px]` si pe asezarea
            stivuita, fara suprapunere.
          */}
          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            Peste 25 de integrări, gata de pornit.
          </h2>

          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            Curieri, plăți online, facturare, marketplace și marketing. Le
            activezi cu un comutator, fără programator.
          </p>

          {/*
            Legatura e TEXT, nu buton: butonul verde plin ramane doar in hero.
            Verdele e #12874A, nu #1AB554 — verdele de brand are 2,6:1 pe alb,
            deci sub prag pentru text. Nodul de mai jos, care e o suprafata, nu
            text, il pastreaza pe cel de brand.

            Sageata se departeaza cu 2px pe diagonala la hover: singura miscare
            din sectiune si se face din `transition`, fara `@keyframes`.
          */}
          <Link
            href="/integrari"
            className="group mt-8 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#12874A] transition-colors duration-200 hover:text-[#0E6B3A]"
          >
            Vezi toate integrările
            <ArrowUpRight
              className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2}
              aria-hidden
            />
          </Link>
        </div>

        {/*
          `-mt-[250px]` DOAR de la `lg`. Sub 1024px compozitia sta cuminte sub
          antet, si nu din lene: la 768px compozitia are 360px inaltime, iar
          prima bula incepe la 225px de varful ei — deci cei 250 ar urca-o peste
          text. Cu o valoare mai mica ar merge geometric, dar din compozitie ar
          mai ramane vizibila o fasie de sub 150px, adica o dunga. De la 1024,
          unde compozitia are 480px, suprapunerea are din ce sa se ia.
        */}
        <div className="mt-12 sm:mt-14 lg:-mt-[250px]">
          <Compozitie
            id="ingust"
            vedere={VEDERE_INGUSTA}
            bule={BULE_INGUSTE}
            scara={SCARA_INGUSTA}
            className="sm:hidden"
          />
          <Compozitie
            id="lat"
            vedere={VEDERE_LATA}
            bule={BULE_LATE}
            scara={SCARA_LATA}
            className="hidden sm:block"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Arcele, bulele și nodul, privite printr-o fereastră.
 *
 * `id` intră în numele degradeurilor, și e obligatoriu. Cele două instanțe sunt
 * amândouă în pagină (una ascunsă cu `display:none`), fiecare cu câte un degrade
 * pe orbită. Fără prefix, cele șase ar fi trei perechi cu același `id`, iar
 * `url(#…)` îl ia întotdeauna pe primul din document — adică decupajul îngust ar
 * primi stingerea calculată pentru fereastra lată, iar orbita mare s-ar reteza
 * brusc la marginea telefonului în loc să se stingă.
 */
function Compozitie({
  id,
  vedere,
  bule,
  scara,
  className,
}: {
  id: string;
  vedere: Vedere;
  bule: Bula[];
  scara: string;
  className?: string;
}) {
  /*
    Degradeul stinge arcele la capete, ca sa nu se termine cu o taietura seaca.

    Cate unul PE ORBITA, nu unul singur pe toate trei, si asta chiar se vede.
    Un singur degrade intins peste orbita mare (170..1030 in fereastra lata) isi
    pune stingerea in dreptul ei: orbita mica, care se termina la x=430 si 770,
    cade in zona plina a degradeului si se opreste brusc, la opacitate 1, in mijloc
    de alb. Cu un degrade pe orbita, fiecare se stinge la CAPETELE EI.

    Marginile sunt taiate la fereastra, ca stingerea sa nu cada in afara ecranului
    si arcul sa se reteze la marginea telefonului: in fereastra ingusta orbita mare
    se stinge la 250..950, adica exact pe muchia decupajului, deci pare ca orbita
    continua dincolo de ecran, ceea ce e si adevarat.

    Extremele pe x ale unui arc sunt 600±raza fiindca trece prin 180° si prin 0°.
  */
  const degrade = (raza: number) => `orbite-${id}-${raza}`;

  return (
    <div
      className={cn("relative w-full", className)}
      /* Acelasi raport ca `viewBox`-ul. Asta face ca procentele bulelor si
         coordonatele SVG-ului sa cada in acelasi loc — vezi nota de sus. */
      style={{ aspectRatio: `${vedere.w} / ${vedere.h}` }}
    >
      <svg
        viewBox={`${vedere.x} ${vedere.y} ${vedere.w} ${vedere.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          {RAZE.map((raza) => (
            <linearGradient
              key={raza}
              id={degrade(raza)}
              gradientUnits="userSpaceOnUse"
              x1={Math.max(vedere.x, NOD.x - raza)}
              y1={0}
              x2={Math.min(vedere.x + vedere.w, NOD.x + raza)}
              y2={0}
            >
              <stop offset="0" stopColor={CULOARE_ARC} stopOpacity="0" />
              <stop offset="0.2" stopColor={CULOARE_ARC} stopOpacity="1" />
              <stop offset="0.8" stopColor={CULOARE_ARC} stopOpacity="1" />
              <stop offset="1" stopColor={CULOARE_ARC} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {RAZE.map((raza) => (
          <path
            key={raza}
            d={traseu(raza)}
            fill="none"
            stroke={`url(#${degrade(raza)})`}
            strokeWidth={1}
            strokeLinecap="round"
            /* Fara asta, grosimea se scaleaza odata cu `viewBox`-ul: la 320px
               scara e 1:2,5, deci linia ar ajunge la 0,4px si ar disparea in
               gri. `non-scaling-stroke` o tine la 1px real la orice latime. */
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {bule.map((bula) => (
        <div
          key={bula.k}
          className={cn(
            "absolute flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-white",
            scara,
          )}
          style={{
            ...pozitie(punct(bula.unghi, bula.raza), vedere),
            /* Inelul alb de 4px e „chenarul" cerut: arcul se opreste vizual
               inainte sa atinga bula, deci bula pare asezata PESTE orbita, nu
               taiata de ea. Umbra e foarte moale si trasa in jos — pe alb, o
               umbra prea intunecata face cercul sa para decupat. */
            boxShadow:
              "0 0 0 4px #FFFFFF, 0 12px 28px -14px rgba(9, 9, 20, 0.35)",
          }}
        >
          <Logo k={bula.k} area={ARIE_SIGLA} maxWidth={LATIME_MAX_SIGLA} />
        </div>
      ))}

      {/*
        Nodul: singurul verde plin din sectiune, si sta jos, in centrul din care
        pornesc orbitele. Pictograma e un magazin, fiindca el e punctul din care
        pleaca toate legaturile, nu una dintre ele. Verdele e cel de brand,
        #1AB554, nu cel corectat pentru text: aici e o suprafata pe care sta o
        pictograma alba, deci contrastul se masoara fata de alb, nu fata de fond.
      */}
      <div
        className={cn(
          "absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
          scara,
        )}
        style={{
          ...pozitie(NOD, vedere),
          backgroundColor: VERDE_BRAND,
          boxShadow:
            "0 0 0 6px #FFFFFF, 0 14px 34px -12px rgba(26, 181, 84, 0.55)",
        }}
      >
        <Store className="h-8 w-8 text-white" strokeWidth={1.75} aria-hidden />
      </div>
    </div>
  );
}
