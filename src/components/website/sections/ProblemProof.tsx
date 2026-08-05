import { Clock } from "lucide-react";
import { EYEBROW_TONES } from "./SectionEyebrow";

/**
 * VARIANTA A — „Dovada".
 *
 * Propunere pentru secțiunea Problema, pusă lângă celelalte două ca să se aleagă
 * una. Cea care pierde se șterge; cea care câștigă își mută textele în
 * `lib/website/problem.ts`, ca restul site-ului.
 *
 * Ideea: nu descrii durerea, o ARĂȚI. Norul de pastile spunea „comenzile se
 * pierd printre mesaje" și-ți cerea să-l crezi pe cuvânt. Aici omul vede firul
 * de conversație în care s-a pierdut comanda, cu ora la care clientul a plecat.
 * Cine vinde pe telefon recunoaște ecranul înainte să citească o literă.
 *
 * De asta artefactele sunt DESENATE, nu capturi: o captură reală se vede că e
 * din alt ecran, cu alte fonturi și alt gri, și arată a poză lipită. Desenate cu
 * aceiași tokeni ca restul paginii, se citesc ca parte din site.
 *
 * Secțiunea e statică dinadins. Cea de funcții, imediat dedesubt, se mișcă la
 * derulare; două secțiuni animate una după alta obosesc.
 */

/* Roșul vine tot de la etichetă, ca la varianta actuală: un singur loc. */
const { rgb: ALARM_RGB, text: ALARM_TEXT } = EYEBROW_TONES.alarm;

const TITLE = ["Produsul tău este bun.", "Magazinul online lasă de dorit."];

/*
 * Lead-ul e ALTUL decât la varianta actuală, dinadins. Acolo enumera tot ce e în
 * neregulă — și apoi pastilele enumerau încă o dată aceleași lucruri. Aici
 * artefactele duc enumerarea, deci lead-ul doar deschide ușa spre ele.
 */
const LEAD =
  "Nu-ți lipsesc clienții. Îți lipsește locul în care să cumpere singuri, fără să te întrebe pe tine. Așa arată o zi obișnuită.";

/**
 * Eticheta, scrisă local și fără triunghi.
 *
 * `SectionEyebrow` o centrează între două fire și cere o iconiță — potrivit
 * pentru un cap de secțiune centrat, nepotrivit aici, unde totul e aliniat la
 * stânga. Iar triunghiul de avertizare calcă regula „fără ornamente în fața
 * supratitlului".
 *
 * E copiată și în `ProblemEditorial.tsx` INTENȚIONAT: sunt două propuneri din
 * care una se șterge, iar o piesă comună ar lăsa un fișier orfan după alegere.
 * Când se alege câștigătoarea, eticheta se întoarce în `SectionEyebrow` ca
 * variantă aliniată la stânga, și tot atunci se potrivește cu perechea ei,
 * „Soluția".
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
    /* Fără spațiu jos: secțiunea de funcții stă pe același `tint` și își aduce
       propriul spațiu de sus. */
    <section className="bg-tint pt-16 lg:pt-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        {/*
          Capul e ASIMETRIC: titlul la stânga, lead-ul într-o coloană mai
          îngustă la dreapta, aliniate pe linia de jos. Simetria perfectă pe
          verticală — supratitlu, titlu, text, toate centrate — e desenul
          implicit al oricărei pagini scoase pe bandă.
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
        */}
        <div className="mt-11 grid gap-5 sm:mt-14 md:grid-cols-3 lg:mt-16 lg:gap-6">
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
            claim="Magazinul se încarcă în 6,8 secunde."
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
 * Rama unui artefact: fereastra sus, ce înseamnă jos.
 *
 * Marginea de jos a ferestrei se stinge în alb. Tăiat drept, fiecare artefact
 * s-ar termina exact la ultimul rând desenat și s-ar citi ca un desen complet,
 * adică mic; stins, se citește ca o fereastră spre ceva care continuă. Gradientul
 * e scris ca stil, nu `to-white`: în Tailwind-ul proiectului `to-<culoare>` iese
 * cu stopul transparent și nu se vede nimic.
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
      <div className="relative h-[286px] overflow-hidden rounded-[20px] border border-hairline bg-white sm:h-[300px]">
        {children}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
          style={{
            backgroundImage:
              "linear-gradient(to top, #FFFFFF 12%, rgba(255,255,255,0))",
          }}
        />
      </div>

      <figcaption className="mt-4 lg:mt-5">
        <p className="text-[15px] font-semibold leading-[1.35] text-ink sm:text-[16px]">
          {claim}
        </p>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-2">{detail}</p>
      </figcaption>
    </figure>
  );
}

/* ─── Artefactul 1: firul de conversație ─────────────────────────────────────
   Fără siglă și fără verdele de la WhatsApp: forma e de ajuns ca să știi ce e,
   iar culorile împrumutate ar fi adus un brand străin în pagină.

   Roșul apare O SINGURĂ dată în tot artefactul, pe ultimul mesaj. Acolo se
   pierde comanda, deci acolo se uită omul. Colorate toate, n-ar mai însemna
   nimic. */
const MESSAGES: {
  side: "in" | "out";
  time: string;
  text: string;
  lost?: boolean;
}[] = [
  { side: "in", time: "10:42", text: "Bună! Mai aveți lampa solară pe stoc?" },
  { side: "in", time: "10:42", text: "Aș vrea 2 bucăți, livrare în Cluj" },
  { side: "out", time: "11:15", text: "Verific și revin" },
  { side: "in", time: "14:03", text: "?" },
  { side: "in", time: "16:20", text: "Am găsit în altă parte, mulțumesc", lost: true },
];

function ChatThread() {
  return (
    <div className="flex h-full flex-col bg-tint-2">
      <div className="flex items-center gap-2.5 border-b border-hairline bg-white px-3.5 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tint-2 text-[10px] font-semibold text-ink-2">
          AM
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold leading-tight text-ink">
            Andreea M.
          </p>
          <p className="text-[10px] leading-tight text-ink-3">văzut la 11:15</p>
        </div>
      </div>

      <ol className="flex-1 space-y-1.5 px-3.5 py-3">
        {MESSAGES.map((m) => (
          <li
            key={m.text}
            className={m.side === "out" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className="max-w-[86%] rounded-[12px] border px-2.5 py-1.5"
              style={
                m.lost
                  ? {
                      backgroundColor: `rgba(${ALARM_RGB},0.06)`,
                      borderColor: `rgba(${ALARM_RGB},0.2)`,
                    }
                  : m.side === "out"
                    ? { backgroundColor: "#F0F0F3", borderColor: "transparent" }
                    : { backgroundColor: "#FFFFFF", borderColor: "#EAEAEE" }
              }
            >
              <p
                className="text-[11.5px] leading-[1.4]"
                style={{ color: m.lost ? ALARM_TEXT : "#0A0A0A" }}
              >
                {m.text}
              </p>
              <p className="mt-0.5 text-right text-[9px] leading-none text-ink-3">
                {m.time}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ─── Artefactul 2: foaia de calcul ──────────────────────────────────────────
   Detaliul care vinde nu e grila, ci celula goală de pe rândul 3 și cursorul
   oprit pe rândul 4: cineva a plecat de la masă în mijlocul lucrului. */
const SHEET_ROWS: {
  client: string;
  total: string;
  invoice: string | null;
  editing?: boolean;
}[] = [
  { client: "Andreea M.", total: "178 lei", invoice: "4417" },
  { client: "Ionuț P.", total: "96 lei", invoice: "4418" },
  { client: "Maria D.", total: "245 lei", invoice: null },
  { client: "Radu C.", total: "312 lei", invoice: null, editing: true },
  { client: "Elena B.", total: "89 lei", invoice: null },
  { client: "Vlad T.", total: "154 lei", invoice: null },
];

const SHEET_COLS = "grid grid-cols-[22px_1fr_58px_50px]";

function Spreadsheet() {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-1.5 border-b border-hairline bg-tint-2 px-3 py-2">
        <span className="h-3 w-3 rounded-[2px] bg-ink-3/35" />
        <p className="truncate text-[10.5px] font-medium text-ink-2">
          facturi_august.xlsx
        </p>
      </div>

      <div className={`${SHEET_COLS} border-b border-hairline bg-tint-2 text-[9.5px] text-ink-3`}>
        {["", "A", "B", "C"].map((letter, i) => (
          <span
            key={i}
            className="border-e border-hairline px-1.5 py-1 text-center last:border-e-0"
          >
            {letter}
          </span>
        ))}
      </div>

      <div className={`${SHEET_COLS} border-b border-hairline text-[10px] font-semibold text-ink-2`}>
        <span className="border-e border-hairline bg-tint-2 px-1.5 py-1.5 text-center text-ink-3">
          1
        </span>
        {["Client", "Total", "Factură"].map((h) => (
          <span key={h} className="truncate border-e border-hairline px-2 py-1.5 last:border-e-0">
            {h}
          </span>
        ))}
      </div>

      {SHEET_ROWS.map((row, i) => (
        <div
          key={row.client}
          className={`${SHEET_COLS} border-b border-hairline text-[10.5px] text-ink`}
        >
          <span className="border-e border-hairline bg-tint-2 px-1.5 py-1.5 text-center text-[9.5px] text-ink-3">
            {i + 2}
          </span>
          <span className="truncate border-e border-hairline px-2 py-1.5">
            {row.client}
          </span>
          <span className="truncate border-e border-hairline px-2 py-1.5 tabular-nums">
            {row.total}
          </span>

          {/* Ultima coloană: fie numărul, fie golul, fie celula în care s-a
              oprit lucrul — un chenar de 2px, exact ca la cursorul din Excel. */}
          <span className="relative px-2 py-1.5 tabular-nums">
            {row.invoice}
            {row.editing ? (
              <span
                aria-hidden
                className="absolute inset-0 border-2"
                style={{ borderColor: ALARM_TEXT }}
              />
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Artefactul 3: magazinul care se încarcă ────────────────────────────────
   Scheletele sunt cenușii și nemișcate: un schelet care pulsează arată a
   încărcare îngrijită, adică exact pe dos decât ne trebuie. Aici trebuie să
   arate a pagină care ATÂRNĂ.

   Cifra 6,8 s e o ilustrare, nu o măsurătoare a cuiva anume. */
function SlowStore() {
  return (
    <div className="relative flex h-full flex-col bg-white">
      <div className="border-b border-hairline bg-tint-2 px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-[5px] w-[5px] rounded-full bg-ink-3/40" />
            ))}
          </span>
          <span className="flex-1 truncate rounded-full border border-hairline bg-white px-2.5 py-[3px] text-[9.5px] text-ink-3">
            magazinul-tau.ro
          </span>
        </div>

        {/* Bara de încărcare, oprită pe la o treime. */}
        <div className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full rounded-full"
            style={{ width: "34%", backgroundColor: ALARM_TEXT }}
          />
        </div>
      </div>

      <div className="flex-1 space-y-2.5 p-3.5">
        <div className="h-[104px] rounded-[10px] bg-tint-2" />
        <div className="h-2.5 w-4/5 rounded-full bg-tint-2" />
        <div className="h-2.5 w-3/5 rounded-full bg-tint-2" />
        <div className="h-2.5 w-2/5 rounded-full bg-tint-2" />
        <div className="h-7 w-24 rounded-[8px] bg-tint-2" />
      </div>

      {/* Cronometrul stă peste schelete, nu lângă ele: altfel s-ar citi ca o
          insignă a paginii, nu ca timpul pe care îl așteaptă clientul. */}
      <div className="pointer-events-none absolute inset-x-0 top-[46%] flex justify-center">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[12px] font-semibold tabular-nums shadow-sm"
          style={{
            borderColor: `rgba(${ALARM_RGB},0.22)`,
            color: ALARM_TEXT,
          }}
        >
          <Clock className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          6,8 s
        </span>
      </div>
    </div>
  );
}
