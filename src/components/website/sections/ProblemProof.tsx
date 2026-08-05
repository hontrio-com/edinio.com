import { EYEBROW_TONES } from "./SectionEyebrow";

/**
 * Secțiunea „Problema" — trei artefacte în locul unui nor de plângeri.
 *
 * Nu descrie durerea, o ARATĂ. Un rând de pastile care spune „comenzile se pierd
 * printre mesaje" îți cere să-l crezi pe cuvânt; firul de conversație în care se
 * pierde comanda, cu ora la care clientul a plecat, se recunoaște înainte să
 * citești o literă.
 *
 * ═══ REGULA CARE ȚINE SECȚIUNEA ÎN PICIOARE ═══
 *
 * Artefactele trebuie să fie **1 la 1 cu realitatea**, cerut explicit de client
 * (2026-08-05): „extrem de realiste, nu vreau să pară AI". Totul de aici e
 * desenat după interfața adevărată, nu după amintirea ei. Ce le-ar strica pe
 * loc, în ordinea în care sar în ochi:
 *
 * 1. **Culori aproximate.** Verdele bulei de la WhatsApp e #D9FDD3, nu „un verde
 *    deschis". Bifele citite sunt #53BDEB. Tapetul e #EFE7DE. Bara de încărcare
 *    din Chrome e #1A73E8. Verdele selecției din Excel e #107C41.
 * 2. **Fonturi din site.** Fiecare artefact își impune fontul lui: Segoe UI /
 *    Roboto la WhatsApp, Calibri la Excel, Times New Roman la pagina fără CSS.
 *    Cu fontul paginii noastre peste tot, cele trei ar arăta ca trei desene ale
 *    aceluiași om — adică exact ca un mockup.
 * 3. **Alinierea din Excel.** Textul la stânga, numerele la DREAPTA. E primul
 *    lucru pe care îl greșește o reproducere din memorie și primul pe care îl
 *    vede cineva care stă zilnic în foi de calcul.
 * 4. **Schelete gri la încărcare.** Un site prost NU are stare de încărcare
 *    îngrijită. Ce se vede în realitate e pagina fără CSS: Times New Roman,
 *    linkuri albastre subliniate una sub alta, o poză care n-a venit. De asta
 *    artefactul 3 arată așa și nu cu dreptunghiuri gri rotunjite.
 * 5. **Insigne plutitoare peste captură.** Un „6,8 s" într-o pastilă așezată
 *    peste ecran e semnătura oricărui mockup. Cifra stă în textul de dedesubt,
 *    unde îi e locul; captura rămâne captură.
 * 6. **Estomparea marginii de jos.** Tot semn de mockup. Fiecare artefact e un
 *    dreptunghi întreg, cu bara lui de jos la locul ei, așa cum iese dintr-un
 *    telefon.
 *
 * Lățimile coloanelor NU sunt egale, tot din același motiv: două capturi de
 * telefon și una de calculator, puse la aceeași lățime, ies toate trei cu
 * proporții false. Telefoanele stau în coloane înguste, foaia de calcul în una
 * lată. Iese și o compoziție asimetrică, ceea ce oricum voiam.
 *
 * Secțiunea e statică și componentă de server. Cea de funcții, imediat dedesubt,
 * se mișcă la derulare; două secțiuni animate una după alta obosesc.
 */

/* Roșul vine de la etichetă, ca la restul paginii: un singur loc. */
const { rgb: ALARM_RGB, text: ALARM_TEXT } = EYEBROW_TONES.alarm;

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

        {/*
          Trei artefacte, fiecare pentru altă durere: unde stau comenzile, cine
          face hârtiile, cum arată magazinul. Nu cinci și nu cincisprezece —
          trei se rețin.

          Coloanele au lățimi diferite ca să respecte proporția aparatului din
          care vine fiecare captură. La `0.78 / 1.44 / 0.78`, într-un container
          de 1136px cu două goluri de 24px, ies 283 / 522 / 283 — telefoanele la
          283x500 sunt aproape de forma unui ecran adevărat.
        */}
        <div className="mt-11 grid gap-5 sm:mt-14 md:grid-cols-[0.78fr_1.44fr_0.78fr] lg:mt-16 lg:gap-6">
          <Artifact
            claim="Comenzile trăiesc în conversații."
            detail="Una s-a pierdut între „mai aveți pe stoc?” și „am găsit în altă parte”."
          >
            <ChatThread />
          </Artifact>

          <Artifact
            claim="Hârtiile le faci noaptea."
            detail="Vineri, 23:47. Facturile de azi, AWB-urile de mâine, stocul cine știe când."
          >
            <Spreadsheet />
          </Artifact>

          <Artifact
            claim="Magazinul se vede după 6,8 secunde."
            detail="Pe telefon, în mijlocul zilei. Clientul nu are răbdarea ta."
          >
            <SlowStore />
          </Artifact>
        </div>
      </div>
    </section>
  );
}

/**
 * Rama unui artefact: captura sus, ce înseamnă jos.
 *
 * Captura e un dreptunghi ÎNTREG, fără estompare la margine. Estomparea era
 * primul lucru care o dădea de gol ca desen: un ecran adevărat se termină cu
 * bara lui, nu se pierde în alb.
 *
 * Umbra e slabă și joasă, cât să ridice captura de pe câmpul `tint`. Una tare ar
 * fi făcut-o să plutească, adică iar mockup.
 */
function Artifact({
  claim,
  detail,
  children,
}: {
  claim: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex flex-col">
      <div
        className="h-[440px] overflow-hidden rounded-[14px] border border-hairline bg-white sm:h-[500px]"
        style={{
          boxShadow:
            "0 1px 1px rgba(10,10,10,0.04), 0 10px 24px -12px rgba(10,10,10,0.18)",
        }}
      >
        {children}
      </div>

      <figcaption className="mt-4 lg:mt-5">
        <p className="text-[15px] font-semibold leading-[1.35] text-ink sm:text-[16px]">
          {claim}
        </p>
        <p className="mt-1.5 max-w-[42ch] text-[13px] leading-[1.55] text-ink-2">
          {detail}
        </p>
      </figcaption>
    </figure>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Bara de stare Android, comună celor două capturi de telefon.
   ══════════════════════════════════════════════════════════════════════════ */

function AndroidStatusBar({ time }: { time: string }) {
  return (
    <div
      className="flex shrink-0 items-center justify-between px-3.5"
      style={{ height: 26, backgroundColor: "#FFFFFF", color: "#111B21" }}
    >
      <span className="text-[11.5px] font-medium tabular-nums">{time}</span>

      <span className="flex items-center gap-[5px]">
        {/* Semnal: patru trepte, ultima stinsă — plin peste tot arată a desen. */}
        <svg width="13" height="10" viewBox="0 0 13 10" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={i * 3.4}
              y={7 - i * 2.2}
              width="2.4"
              height={3 + i * 2.2}
              rx="0.6"
              fill={i === 3 ? "#C7CBD1" : "#111B21"}
            />
          ))}
        </svg>

        {/* Wi-Fi */}
        <svg width="13" height="10" viewBox="0 0 16 12" aria-hidden>
          <path
            d="M8 10.2a1.15 1.15 0 110-2.3 1.15 1.15 0 010 2.3zM8 5.6c1.74 0 3.32.71 4.46 1.86l-1.2 1.2A4.6 4.6 0 008 7.3a4.6 4.6 0 00-3.26 1.36l-1.2-1.2A6.28 6.28 0 018 5.6zm0-3.4c2.68 0 5.11 1.09 6.86 2.85l-1.2 1.2A8.05 8.05 0 008 3.9a8.05 8.05 0 00-5.66 2.35l-1.2-1.2A9.68 9.68 0 018 2.2z"
            fill="#111B21"
          />
        </svg>

        {/* Acumulator la 41%: plin arată a desen, gol arată a alarmă. */}
        <svg width="18" height="10" viewBox="0 0 22 11" aria-hidden>
          <rect
            x="0.6"
            y="0.6"
            width="18"
            height="9.8"
            rx="2.6"
            fill="none"
            stroke="#111B21"
            strokeWidth="1.1"
          />
          <rect x="2.2" y="2.2" width="7" height="6.6" rx="1.3" fill="#111B21" />
          <rect x="20" y="3.6" width="1.6" height="3.8" rx="0.8" fill="#111B21" />
        </svg>
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ARTEFACTUL 1 — firul de conversație
   ══════════════════════════════════════════════════════════════════════════

   Desenat după WhatsApp pe Android, temă deschisă. Valorile nu sunt aproximate:

   - tapet          #EFE7DE, cu desenele lui abia vizibile (4% opacitate)
   - bulă primită   #FFFFFF, colț 7.5px, umbră 0 1px .5px rgba(11,20,26,.13)
   - bulă trimisă   #D9FDD3, aceeași formă
   - codița         doar la PRIMA bulă dintr-un grup, sus, în afara bulei
   - ora            11px #667781, în bulă, la dreapta jos
   - bifele citite  #53BDEB (gri #667781 ar fi însemnat „doar livrat")
   - antet          alb, nume 16px #111B21, stare 12px #667781
   - bară de jos    câmp alb rotunjit pe #F0F2F5, buton verde #00A884

   Roșul nostru NU intră aici. O captură cu accente din paleta site-ului e o
   captură măsluită. Faptul că ultimul mesaj e cel care doare se vede din ce
   scrie și din ora lui, nu din culoare. */

const WA_FONT =
  '"Segoe UI", Roboto, "Helvetica Neue", -apple-system, sans-serif';

const WA_BUBBLE_SHADOW = "0 1px 0.5px rgba(11,20,26,0.13)";

const MESSAGES: {
  side: "in" | "out";
  time: string;
  text: string;
  /** Prima bulă dintr-un grup: numai ea poartă codița. */
  tail?: boolean;
}[] = [
  {
    side: "in",
    time: "10:42",
    text: "Bună ziua! Mai aveți lampa solară cu telecomandă?",
    tail: true,
  },
  { side: "in", time: "10:43", text: "Aș vrea 2 bucăți, livrare în Cluj-Napoca" },
  { side: "out", time: "11:15", text: "Bună! Verific și revin", tail: true },
  { side: "in", time: "14:03", text: "?", tail: true },
  { side: "in", time: "16:20", text: "Am găsit în altă parte, mulțumesc" },
];

function ChatThread() {
  return (
    <div className="flex h-full flex-col" style={{ fontFamily: WA_FONT }}>
      <AndroidStatusBar time="16:21" />

      {/* Antetul conversației */}
      <div
        className="flex shrink-0 items-center gap-2.5 px-2.5"
        style={{ height: 52, backgroundColor: "#FFFFFF" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"
            fill="#54656F"
          />
        </svg>

        {/* Poză de contact lipsă: WhatsApp pune silueta gri pe cerc gri. */}
        <span
          className="grid shrink-0 place-items-center rounded-full"
          style={{ width: 34, height: 34, backgroundColor: "#DFE5E7" }}
        >
          <svg width="34" height="34" viewBox="0 0 212 212" aria-hidden>
            <path
              d="M105.9 105.9a26.5 26.5 0 100-53 26.5 26.5 0 000 53zm0 13.2c-17.7 0-53 8.9-53 26.5v13.3h106v-13.3c0-17.6-35.3-26.5-53-26.5z"
              fill="#FFFFFF"
            />
          </svg>
        </span>

        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-[16px] leading-[1.2]"
            style={{ color: "#111B21", fontWeight: 500 }}
          >
            Andreea M.
          </span>
          <span
            className="block truncate text-[12px] leading-[1.35]"
            style={{ color: "#667781" }}
          >
            văzut ultima dată azi la 16:20
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-3.5 pe-1">
          {/* Cameră video */}
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path d="M15 8v8H5V8h10zm1-2H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 3.5V6l-4 3.5V7a1 1 0 00-1-1z" fill="#54656F" />
          </svg>
          {/* Telefon */}
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2z" fill="#54656F" />
          </svg>
          {/* Meniu */}
          <svg width="4" height="18" viewBox="0 0 4 18" aria-hidden>
            {[2, 9, 16].map((cy) => (
              <circle key={cy} cx="2" cy={cy} r="2" fill="#54656F" />
            ))}
          </svg>
        </span>
      </div>

      {/* Firul. Mesajele stau lipite de JOS, ca într-o conversație adevărată:
          golul rămâne sus, nu sub ultimul mesaj. */}
      <div
        className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden"
        style={{ backgroundColor: "#EFE7DE" }}
      >
        <ChatWallpaper />

        <div className="relative px-[9px] pb-2 pt-2">
          <div className="mb-2.5 flex justify-center">
            <span
              className="rounded-[7.5px] px-2.5 py-[5px] text-[12.5px] uppercase"
              style={{
                backgroundColor: "#FFFFFF",
                color: "#54656F",
                boxShadow: WA_BUBBLE_SHADOW,
              }}
            >
              Azi
            </span>
          </div>

          <ol className="space-y-[3px]">
            {MESSAGES.map((m) => (
              <li
                key={m.text}
                className={
                  m.side === "out"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
                style={{ marginTop: m.tail ? 8 : undefined }}
              >
                <span
                  className="relative max-w-[78%] rounded-[7.5px]"
                  style={{
                    backgroundColor: m.side === "out" ? "#D9FDD3" : "#FFFFFF",
                    boxShadow: WA_BUBBLE_SHADOW,
                    padding: "6px 7px 8px 9px",
                    /* Codița iese din bulă, deci colțul de deasupra ei nu se
                       rotunjește — altfel rămâne o crestătură între ele. */
                    borderTopLeftRadius:
                      m.tail && m.side === "in" ? 0 : undefined,
                    borderTopRightRadius:
                      m.tail && m.side === "out" ? 0 : undefined,
                  }}
                >
                  {m.tail ? <BubbleTail side={m.side} /> : null}

                  <span
                    className="block text-[14.2px]"
                    style={{ color: "#111B21", lineHeight: "19px" }}
                  >
                    {m.text}
                    {/*
                      Distanțierul invizibil — trucul din WhatsApp, copiat fiindcă
                      e singurul care se ține.

                      Ora trebuie să stea pe ultimul rând al textului, la dreapta,
                      ÎN bulă. Cu `float: right` mergea pentru mesajele lungi și
                      se rupea urât la cele scurte: elementele flotante nu intră
                      în lățimea intrinsecă a bulei, așa că la un mesaj de un
                      caracter bula se strângea cât „?", iar ora ateriza pe tapet,
                      în afara ei.

                      Distanțierul e aceeași oră (și aceleași bife), doar
                      ascunsă. Ține locul în rândul de text, deci bula se lățește
                      cât să încapă amândouă, iar dacă nu mai încap, trece singur
                      pe rândul următor — exact cum face aplicația. Ora adevărată
                      se așază peste el, poziționată absolut.
                    */}
                    <span
                      aria-hidden
                      className="invisible inline-flex items-center gap-[3px] ps-2 text-[11px]"
                    >
                      {m.time}
                      {m.side === "out" ? <ReadTicks /> : null}
                    </span>
                  </span>

                  <span
                    className="absolute bottom-[7px] right-[7px] flex items-center gap-[3px] text-[11px] leading-none"
                    style={{ color: "#667781" }}
                  >
                    {m.time}
                    {m.side === "out" ? <ReadTicks /> : null}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Bara de scris */}
      <div
        className="flex shrink-0 items-center gap-1.5 px-1.5"
        style={{ height: 56, backgroundColor: "#F0F2F5" }}
      >
        <span
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[24px] px-2.5"
          style={{ height: 42, backgroundColor: "#FFFFFF" }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 16.2a7.2 7.2 0 110-14.4 7.2 7.2 0 010 14.4zM8.9 10.9a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6zm6.2 0a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6zM12 17c2 0 3.7-1.2 4.4-3H7.6c.7 1.8 2.4 3 4.4 3z"
              fill="#54656F"
            />
          </svg>
          <span className="flex-1 truncate text-[15px]" style={{ color: "#8696A0" }}>
            Mesaj
          </span>
          {/* Agrafă, înclinată ca în aplicație */}
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M16.5 6.5v9.8a4.5 4.5 0 11-9 0V5.8a3 3 0 116 0v9.7a1.5 1.5 0 11-3 0V6.5H9.4v9a3 3 0 106 0V5.8a4.5 4.5 0 10-9 0v10.5a6 6 0 1012 0V6.5h-1.9z"
              fill="#54656F"
            />
          </svg>
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M9.4 5l-1.2 1.6H5A1.8 1.8 0 003.2 8.4v8.4c0 1 .8 1.8 1.8 1.8h14a1.8 1.8 0 001.8-1.8V8.4A1.8 1.8 0 0019 6.6h-3.2L14.6 5H9.4zm2.6 3.9a3.7 3.7 0 110 7.4 3.7 3.7 0 010-7.4zm0 1.7a2 2 0 100 4 2 2 0 000-4z"
              fill="#54656F"
            />
          </svg>
        </span>

        <span
          className="grid shrink-0 place-items-center rounded-full"
          style={{ width: 42, height: 42, backgroundColor: "#00A884" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 14.5a3 3 0 003-3V6a3 3 0 10-6 0v5.5a3 3 0 003 3zm5.3-3c0 3-2.5 5.1-5.3 5.1S6.7 14.5 6.7 11.5H5c0 3.4 2.7 6.2 6 6.7V21h2v-2.8c3.3-.5 6-3.3 6-6.7h-1.7z"
              fill="#FFFFFF"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

/**
 * Codița bulei. Stă în AFARA bulei, lipită de colțul de sus, exact ca în
 * aplicație — nu e un triunghi rotit sub bulă.
 */
function BubbleTail({ side }: { side: "in" | "out" }) {
  const incoming = side === "in";

  return (
    <svg
      width="8"
      height="13"
      viewBox="0 0 8 13"
      aria-hidden
      className="absolute top-0"
      style={{
        [incoming ? "left" : "right"]: -7,
        transform: incoming ? undefined : "scaleX(-1)",
      }}
    >
      <path
        d="M1.53 3.57L8 12.19V1H2.81C1.04 1 .47 2.16 1.53 3.57z"
        fill={incoming ? "#FFFFFF" : "#D9FDD3"}
      />
    </svg>
  );
}

/** Bifele de „citit". Albastre, nu gri: gri ar fi însemnat doar „livrat". */
function ReadTicks() {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden>
      <path
        d="M11.07.65a.45.45 0 00-.64.04L5.4 7.08 3.2 4.9a.45.45 0 10-.64.64l2.55 2.55c.19.19.5.17.67-.04L11.1 1.3a.45.45 0 00-.03-.65z"
        fill="#53BDEB"
      />
      <path
        d="M15.3.65a.45.45 0 00-.64.04L9.63 7.08 8.9 6.34l-.63.8.98.98c.19.19.5.17.67-.04L15.33 1.3a.45.45 0 00-.03-.65z"
        fill="#53BDEB"
      />
    </svg>
  );
}

/**
 * Tapetul. Desenele lui WhatsApp, la 4% — cât să se simtă textura, nu cât să se
 * uite cineva la ele. Un beige plat s-ar fi văzut imediat că nu e captură.
 */
function ChatWallpaper() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: 0.045 }}
    >
      <defs>
        <pattern
          id="wa-doodles"
          width="112"
          height="112"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-8)"
        >
          <g
            fill="none"
            stroke="#0B141A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* bulă de chat */}
            <path d="M8 12h16a3 3 0 013 3v8a3 3 0 01-3 3h-9l-5 4v-4H8a3 3 0 01-3-3v-8a3 3 0 013-3z" />
            {/* inimă */}
            <path d="M70 14c-2-3-7-3-8 1-1 4 5 8 8 10 3-2 9-6 8-10-1-4-6-4-8-1z" />
            {/* aparat foto */}
            <path d="M38 52h18a2 2 0 012 2v11a2 2 0 01-2 2H38a2 2 0 01-2-2V54a2 2 0 012-2z" />
            <circle cx="47" cy="59.5" r="4" />
            {/* notă muzicală */}
            <path d="M88 46v14" />
            <circle cx="84.5" cy="60" r="3.5" />
            <path d="M88 46l7-2v4l-7 2" />
            {/* ceas */}
            <circle cx="18" cy="86" r="9" />
            <path d="M18 81v5l3 2" />
            {/* avion de hârtie */}
            <path d="M62 84l26-8-10 22-5-9-11-5z" />
            {/* fulger */}
            <path d="M100 84l-6 9h5l-3 8" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wa-doodles)" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ARTEFACTUL 2 — foaia de calcul
   ══════════════════════════════════════════════════════════════════════════

   Desenat după Excel pentru Microsoft 365, temă deschisă, interfață în română.
   Ce trebuie să rămână așa cum e, fiindcă exact astea îl fac să treacă drept
   captură în fața cuiva care stă zilnic în foi de calcul:

   - Calibri, 11px. Cu fontul site-ului, întreaga foaie sună fals.
   - **Numerele la DREAPTA, textul la stânga.** Excel aliniază singur așa.
     Primul lucru pe care îl greșește o reproducere din memorie.
   - Capul de coloană și capul de rând ale celulei selectate se colorează, cu
     linie verde dedesubt. Fără asta, selecția pare un chenar desenat.
   - Celula selectată are mâner de umplere: pătrățelul verde din colțul de jos
     dreapta.
   - Caseta cu numele celulei arată D6, iar bara de formule e GOALĂ. Aici stă
     toată povestea: cineva a ajuns la factura lui Radu C. și s-a oprit.
   - Coloana E, începută și lăsată — antet scris, nicio valoare sub el.
   - Sub date urmează rânduri goale. O foaie care se termină fix la ultimul rând
     cu text nu există.
   - Bara de stare scrie „Gata", fiindcă interfața e în română. */

const XL_FONT = 'Calibri, "Segoe UI", system-ui, sans-serif';
const XL_GRID = "#E2E2E2";
const XL_HEADER_BG = "#F5F5F5";
const XL_GREEN = "#107C41";

/**
 * Coloanele. `width: 0` înseamnă „ia ce rămâne", dar cu un minim.
 *
 * Minimul contează: pe un ecran de 320px, cele patru coloane fixe plus rigla cu
 * numere lasă vreo 16px pentru „Client", adică o coloană strivită, care nu există
 * în realitate. Cu minim de 140px grila iese din fereastră și se taie la
 * dreapta — exact ce vezi într-o fereastră de Excel prea îngustă, unde ultimele
 * coloane rămân dincolo de margine.
 */
const SHEET_COLS = [
  { letter: "A", label: "Data", width: 52, numeric: false },
  { letter: "B", label: "Client", width: 0, numeric: false },
  { letter: "C", label: "Total", width: 62, numeric: true },
  { letter: "D", label: "Factură", width: 62, numeric: true },
  { letter: "E", label: "AWB", width: 62, numeric: true },
];

const SHEET_DATA: string[][] = [
  ["04.08", "Andreea M.", "178,00", "4417", ""],
  ["04.08", "Ionuț P.", "96,00", "4418", ""],
  ["04.08", "Mihaela S.", "412,50", "4419", ""],
  ["05.08", "Maria D.", "245,00", "", ""],
  ["05.08", "Radu C.", "312,00", "", ""],
  ["05.08", "Elena B.", "89,90", "", ""],
  ["05.08", "Vlad T.", "154,00", "", ""],
  ["05.08", "Cristina M.", "67,50", "", ""],
  ["05.08", "George A.", "228,00", "", ""],
  ["05.08", "Ioana P.", "133,00", "", ""],
];

/** Celula la care s-a oprit lucrul: rândul 6 al foii (Radu C.), coloana D. */
const ACTIVE = { col: 3, row: 6 };

/**
 * Câte rânduri goale se desenează sub date.
 *
 * Sunt MAI MULTE decât încap dinadins: ultimul rând se taie de marginea de jos a
 * zonei, exact ca într-o fereastră de Excel adevărată. Cu numărul potrivit
 * rămâneau 43px de alb curat sub ultimul rând, iar o foaie de calcul nu se
 * termină niciodată așa — grila merge până unde se termină fereastra.
 */
const EMPTY_ROWS = 14;

const XL_ROW_H = 20;
const XL_GUTTER_W = 26;

function Spreadsheet() {
  const gridTemplate = `${XL_GUTTER_W}px ${SHEET_COLS.map((c) =>
    c.width ? `${c.width}px` : "minmax(140px,1fr)",
  ).join(" ")}`;

  return (
    <div
      className="flex h-full flex-col"
      style={{ fontFamily: XL_FONT, backgroundColor: "#FFFFFF" }}
    >
      {/* Bara de titlu */}
      <div
        className="flex shrink-0 items-center gap-2 px-2.5"
        style={{ height: 28, backgroundColor: "#F3F2F1" }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
          <rect width="16" height="16" rx="2" fill="#107C41" />
          <path
            d="M4.3 4.4h2.1L8 6.9l1.6-2.5h2.1L9.2 8l2.5 3.6H9.6L8 9.1l-1.6 2.5H4.3L6.8 8 4.3 4.4z"
            fill="#FFFFFF"
          />
        </svg>
        <span
          className="min-w-0 flex-1 truncate text-[11.5px]"
          style={{ color: "#323130" }}
        >
          facturi_august.xlsx
        </span>
        <span
          className="flex shrink-0 items-center gap-3 text-[11px]"
          style={{ color: "#605E5C" }}
        >
          <span>&#8213;</span>
          <span>&#9723;</span>
          <span>&#10005;</span>
        </span>
      </div>

      {/* Bara de formule: caseta cu numele celulei, fx, câmpul gol */}
      <div
        className="flex shrink-0 items-stretch"
        style={{
          height: 24,
          backgroundColor: "#FFFFFF",
          borderBottom: `1px solid ${XL_GRID}`,
        }}
      >
        <span
          className="flex items-center px-2 text-[11px] tabular-nums"
          style={{
            width: 62,
            color: "#323130",
            borderRight: `1px solid ${XL_GRID}`,
          }}
        >
          D6
        </span>
        <span
          className="flex items-center px-2 text-[12px] italic"
          style={{ color: "#605E5C", borderRight: `1px solid ${XL_GRID}` }}
        >
          fx
        </span>
        <span className="flex-1" />
      </div>

      {/* Capetele de coloană */}
      <div
        className="grid shrink-0"
        style={{
          gridTemplateColumns: gridTemplate,
          height: 19,
          borderBottom: `1px solid #D0CFCE`,
        }}
      >
        {/* Colțul cu triunghiul de „selectează tot" */}
        <span
          className="relative"
          style={{
            backgroundColor: XL_HEADER_BG,
            borderRight: `1px solid #D0CFCE`,
          }}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            aria-hidden
            className="absolute bottom-[2px] right-[2px]"
          >
            <path d="M8 0v8H0z" fill="#A19F9D" />
          </svg>
        </span>

        {SHEET_COLS.map((col, i) => {
          const active = i === ACTIVE.col;
          return (
            <span
              key={col.letter}
              className="grid place-items-center text-[11px]"
              style={{
                backgroundColor: active ? "#D3E4DA" : XL_HEADER_BG,
                color: active ? XL_GREEN : "#444444",
                fontWeight: active ? 600 : 400,
                borderRight: `1px solid #D0CFCE`,
                boxShadow: active ? `inset 0 -2px 0 ${XL_GREEN}` : undefined,
              }}
            >
              {col.letter}
            </span>
          );
        })}
      </div>

      {/* Foaia */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* Rândul 1: antetul scris de om, îngroșat și cu fundal — așa arată în
            fiecare foaie ținută de mână. */}
        <SheetRow
          gridTemplate={gridTemplate}
          number={1}
          activeRow={ACTIVE.row === 1}
          cells={SHEET_COLS.map((c) => c.label)}
          header
        />

        {SHEET_DATA.map((cells, i) => (
          <SheetRow
            key={cells[1]}
            gridTemplate={gridTemplate}
            number={i + 2}
            activeRow={ACTIVE.row === i + 2}
            activeCol={ACTIVE.row === i + 2 ? ACTIVE.col : undefined}
            cells={cells}
          />
        ))}

        {Array.from({ length: EMPTY_ROWS }, (_, i) => (
          <SheetRow
            key={`empty-${i}`}
            gridTemplate={gridTemplate}
            number={SHEET_DATA.length + 2 + i}
            cells={SHEET_COLS.map(() => "")}
          />
        ))}
      </div>

      {/* Filele foii */}
      <div
        className="flex shrink-0 items-end gap-0 px-1.5"
        style={{
          height: 24,
          backgroundColor: "#FFFFFF",
          borderTop: `1px solid ${XL_GRID}`,
        }}
      >
        <span
          className="px-2.5 text-[11px]"
          style={{
            color: XL_GREEN,
            fontWeight: 600,
            lineHeight: "22px",
            boxShadow: `inset 0 -2px 0 ${XL_GREEN}`,
          }}
        >
          Foaie1
        </span>
        <span
          className="px-2.5 text-[11px]"
          style={{ color: "#605E5C", lineHeight: "22px" }}
        >
          Stoc
        </span>
        <span
          className="px-2 text-[13px]"
          style={{ color: "#605E5C", lineHeight: "22px" }}
        >
          +
        </span>
      </div>

      {/* Bara de stare */}
      <div
        className="flex shrink-0 items-center justify-between px-2.5 text-[11px]"
        style={{
          height: 20,
          backgroundColor: "#F3F2F1",
          color: "#605E5C",
          borderTop: `1px solid ${XL_GRID}`,
        }}
      >
        <span>Gata</span>
        <span className="tabular-nums">100%</span>
      </div>
    </div>
  );
}

function SheetRow({
  gridTemplate,
  number,
  cells,
  header,
  activeRow,
  activeCol,
}: {
  gridTemplate: string;
  number: number;
  cells: string[];
  header?: boolean;
  activeRow?: boolean;
  activeCol?: number;
}) {
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: gridTemplate, height: XL_ROW_H }}
    >
      <span
        className="grid place-items-center text-[11px] tabular-nums"
        style={{
          backgroundColor: activeRow ? "#D3E4DA" : XL_HEADER_BG,
          color: activeRow ? XL_GREEN : "#444444",
          fontWeight: activeRow ? 600 : 400,
          borderRight: `1px solid #D0CFCE`,
          borderBottom: `1px solid ${XL_GRID}`,
          boxShadow: activeRow ? `inset -2px 0 0 ${XL_GREEN}` : undefined,
        }}
      >
        {number}
      </span>

      {cells.map((value, i) => {
        const col = SHEET_COLS[i];
        const isActive = activeCol === i;

        return (
          <span
            key={col.letter}
            className="relative flex items-center truncate px-[5px] text-[11.5px]"
            style={{
              /* Aici se joacă totul: numerele la dreapta, textul la stânga.
                 Antetul scris de om rămâne la stânga chiar și peste coloane de
                 numere — Excel aliniază după CONȚINUT, iar „Total" e text. */
              justifyContent:
                !header && col.numeric ? "flex-end" : "flex-start",
              backgroundColor: header ? "#EFEFEF" : "#FFFFFF",
              color: "#000000",
              fontWeight: header ? 700 : 400,
              borderRight: `1px solid ${XL_GRID}`,
              borderBottom: `1px solid ${XL_GRID}`,
            }}
          >
            {value}

            {isActive ? (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{
                    inset: -1,
                    border: `2px solid ${XL_GREEN}`,
                  }}
                />
                {/* Mânerul de umplere */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{
                    right: -3,
                    bottom: -3,
                    width: 6,
                    height: 6,
                    backgroundColor: XL_GREEN,
                    border: "1px solid #FFFFFF",
                  }}
                />
              </>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ARTEFACTUL 3 — magazinul care se încarcă
   ══════════════════════════════════════════════════════════════════════════

   Chrome pe Android, cu pagina prinsă la jumătatea încărcării.

   Aici a fost cea mai mare capcană: prima versiune desenase dreptunghiuri gri
   rotunjite, adică schelete de încărcare. Un site prost NU ARE așa ceva —
   scheletele sunt semn de site făcut cu grijă. Ce vede omul în realitate, când
   HTML-ul a ajuns și CSS-ul nu, e pagina brută a browserului: Times New Roman,
   titlu mare îngroșat, linkuri albastre subliniate una sub alta, o linie
   orizontală, o poză care n-a venit. Oricine a prins vreodată un site la
   încărcare recunoaște ecranul ăsta, și nu poate fi confundat cu un desen.

   Restul detaliilor care contează:
   - bara de încărcare #1A73E8, oprită pe la o treime
   - bara de adresă e câmp rotunjit, cu iconița de informații în stânga
   - lângă meniu, pătratul cu numărul de file deschise
   - fără insignă „6,8 s" peste ecran: cifra stă în textul de dedesubt */

const SERIF = '"Times New Roman", Times, serif';
const CHROME_LINK = "#0000EE";

/**
 * Chenarul pe care îl pune browserul în locul unei poze care n-a ajuns.
 * Alături merge întotdeauna textul alternativ — sau, dacă nu există, numele
 * fișierului. Ăsta e semnul după care se recunoaște o pagină prinsă la
 * jumătatea încărcării.
 */
function BrokenImage() {
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{ width: 18, height: 18, border: "1px solid #B0B0B0" }}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
        <path d="M1 1h10v10H1z" fill="none" stroke="#9AA0A6" strokeWidth="1" />
        <path d="M1 8l3-3 2.5 2.5L9 5l2 2v4H1z" fill="#C4C7C5" />
        <circle cx="4" cy="3.6" r="1.1" fill="#C4C7C5" />
      </svg>
    </span>
  );
}

function SlowStore() {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "#FFFFFF" }}>
      <AndroidStatusBar time="13:07" />

      {/* Bara de unelte Chrome */}
      <div
        className="flex shrink-0 items-center gap-2 px-2"
        style={{ height: 48, backgroundColor: "#FFFFFF" }}
      >
        <span
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-3"
          style={{ height: 34, backgroundColor: "#F1F3F4" }}
        >
          {/* Iconița de reglaje din stânga adresei (Chrome nou) */}
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M3 7h10.1a3.5 3.5 0 016.8 0H21v2h-1.1a3.5 3.5 0 01-6.8 0H3V7zm0 8h1.1a3.5 3.5 0 016.8 0H21v2H10.9a3.5 3.5 0 01-6.8 0H3v-2z"
              fill="#5F6368"
            />
          </svg>
          <span
            className="min-w-0 flex-1 truncate text-[13.5px]"
            style={{ color: "#202124", fontFamily: WA_FONT }}
          >
            magazinul-tau.ro
          </span>
        </span>

        {/* Numărul de file deschise */}
        <span
          className="grid shrink-0 place-items-center rounded-[4px] text-[11px] font-bold tabular-nums"
          style={{
            width: 20,
            height: 20,
            border: "2px solid #5F6368",
            color: "#5F6368",
            fontFamily: WA_FONT,
          }}
        >
          7
        </span>

        <svg width="4" height="18" viewBox="0 0 4 18" aria-hidden className="shrink-0">
          {[2, 9, 16].map((cy) => (
            <circle key={cy} cx="2" cy={cy} r="2" fill="#5F6368" />
          ))}
        </svg>
      </div>

      {/* Bara de încărcare, oprită. */}
      <div className="relative shrink-0" style={{ height: 3, backgroundColor: "#FFFFFF" }}>
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: "31%", backgroundColor: "#1A73E8" }}
        />
      </div>

      {/* Pagina, așa cum arată înainte să vină CSS-ul. */}
      <div
        className="min-h-0 flex-1 overflow-hidden px-2 pt-2"
        style={{ fontFamily: SERIF, color: "#000000" }}
      >
        {/* Poza care n-a venit: chenarul cu textul alternativ, exact cum îl
            desenează browserul. */}
        <span className="mb-2 flex items-center gap-1.5">
          <BrokenImage />
          <span className="text-[13px]" style={{ color: "#5F6368" }}>
            logo-magazin.png
          </span>
        </span>

        <h1 className="text-[26px] font-bold leading-[1.15]">Magazinul Tău</h1>

        <p className="mt-1 text-[16px] leading-[1.3]">
          Bine ați venit! Livrare în toată țara.
        </p>

        {/* Meniul, nestilat: listă cu buline și linkuri albastre subliniate. */}
        <ul
          className="mt-3 list-disc text-[16px] leading-[1.45]"
          style={{ paddingInlineStart: 28 }}
        >
          {["Acasă", "Produse", "Despre noi", "Contact"].map((item) => (
            <li key={item}>
              <span style={{ color: CHROME_LINK, textDecoration: "underline" }}>
                {item}
              </span>
            </li>
          ))}
        </ul>

        <hr className="my-3" style={{ borderTop: "1px solid #CFCFCF" }} />

        <h2 className="text-[19px] font-bold leading-[1.2]">Produse recomandate</h2>

        {/* Încă două poze lipsă, una sub alta: fără CSS nu se mai așază pe rând. */}
        {["produs-1.jpg", "produs-2.jpg"].map((name) => (
          <span key={name} className="mt-2 flex items-center gap-1.5">
            <BrokenImage />
            <span className="text-[13px]" style={{ color: "#5F6368" }}>
              {name}
            </span>
          </span>
        ))}

        <p className="mt-2 text-[16px] leading-[1.35]">
          Lampă solară stradală &#8211; 49 lei
          <br />
          Set 2 lămpi solare &#8211; 89 lei
        </p>

        <hr className="my-3" style={{ borderTop: "1px solid #CFCFCF" }} />

        <h2 className="text-[19px] font-bold leading-[1.2]">Contact</h2>

        <p className="mt-1 text-[16px] leading-[1.35]">
          Telefon: 0722 145 380
          <br />
          Program: Luni &#8211; Vineri, 09:00 &#8211; 18:00
        </p>

        <p className="mt-2 text-[16px] leading-[1.35]">
          <span style={{ color: CHROME_LINK, textDecoration: "underline" }}>
            Termeni și condiții
          </span>
        </p>
      </div>
    </div>
  );
}
