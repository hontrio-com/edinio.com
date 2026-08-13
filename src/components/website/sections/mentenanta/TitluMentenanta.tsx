import { TITLU_MENTENANTA } from "@/lib/website/mentenanta-titlu";

/**
 * Titlul paginii „Mentenanță gratuită", cu cuvântul „tehnică" între paranteze
 * drepte.
 *
 * ═══ CE FACE PARANTEZELE SĂ NU PARĂ NIȘTE PARANTEZE ═══
 *
 * Cerut de client (13.08): „[ TEHNICA ] ceva gen să inspirăm ceva tehnic […]
 * dar fă să nu pară că sunt doar niște paranteze simple". Scrise pur și simplu,
 * două semne dintr-un font gros arată exact a greșeală de tastare. Ce le face
 * să se citească drept SEMN, nu literă, sunt patru lucruri împreună — niciunul
 * dintre ele nu ajunge singur:
 *
 * 1. **ALT FONT.** Sunt monospațiate (Geist Mono), în timp ce titlul e cu font
 *    obișnuit. Paranteza monospațiată e dreaptă, subțire și cu umeri egali —
 *    forma pe care ochiul a văzut-o de o mie de ori în cod. Din aceeași familie
 *    cu titlul, ar fi fost doar un semn de punctuație.
 * 2. **ALTĂ GROSIME.** Titlul e `bold`; parantezele sunt de 400. Un semn mai
 *    subțire decât cuvântul dinăuntru se așază în urma lui: cuvântul rămâne
 *    cuvânt, semnele devin ramă.
 * 3. **ALTĂ CULOARE.** Verdele mărcii. ⚠ Regula site-ului e că în titluri NU se
 *    colorează cuvinte — vezi nota din pagina „Optimizare". Aici nu se colorează
 *    niciun cuvânt: „tehnică" rămâne negru ca tot titlul, iar verdele stă pe
 *    două SEMNE. Regula nu e atinsă.
 * 4. **MAI ÎNALTE DECÂT LITERELE.** Întinse pe verticală, trec peste înălțimea
 *    literelor și strâng cuvântul între ele. Asta e ce le scoate din rândul
 *    punctuației: o paranteză obișnuită stă în interiorul rândului; una care îl
 *    depășește ține ceva.
 *
 * ⚠ TEXTUL CITIT RĂMÂNE ÎNTREG. `h1.textContent` iese „…partea [tehnică]." —
 * cu paranteze, fiindcă chiar asta a cerut clientul să se vadă, dar fără nimic
 * repetat sau lipsă. Lecția e de la titlul paginii „Optimizare", unde o primă
 * formă lăsase în h1 „RapidRapidRapid… Googleoogle.": ce se vede și ce se
 * citește se despărțiseră fără ca nimic să se plângă. Proba din
 * `mentenanta-titlu.test.ts` compară cele două.
 */

/* Cât de late sunt marginile dintre paranteză și cuvânt. Măsurat pe ecran:
   sub 0,04em parantezele se lipesc de literă și par un „t" stricat; peste 0,1em
   se desprind și par două semne răzlețe lângă un cuvânt. */
const RESPIRATIE = "0.055em";

export function TitluMentenanta() {
  return (
    <>
      {TITLU_MENTENANTA.inainte}{" "}
      {/*
        ⚠ `whitespace-nowrap` pe tot grupul: fără el, pe telefon paranteza de
        închidere putea rămâne singură pe rândul următor, iar punctul după ea.
        Măsurat la 320px, unde titlul se rupe în cinci rânduri.
      */}
      <span className="whitespace-nowrap">
        <Paranteza semn="[" latura="stanga" />
        {/*
          ⚠ Cuvântul e UMPLUT CU 0 ȘI 1, nu scris cu ele: covorul de cifre e
          tăiat pe forma literelor. De departe se citește ca un cuvânt negru
          obișnuit; de aproape se vede din ce e făcut. Socoteala dalei, și plasa
          pentru browserele care nu știu tăierea pe text, sunt la `.cuvant-binar`
          în `globals.css` — acolo, fiindcă are nevoie de `@supports`, iar un
          stil scris pe element nu poate avea.
        */}
        <span className="cuvant-binar">{TITLU_MENTENANTA.cuvant}</span>
        <Paranteza semn="]" latura="dreapta" />
      </span>
      {TITLU_MENTENANTA.dupa}
    </>
  );
}

function Paranteza({ semn, latura }: { semn: string; latura: "stanga" | "dreapta" }) {
  return (
    <span
      className="inline-block motion-reduce:animate-none animate-in fade-in duration-700 ease-out"
      style={{
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontWeight: 400,
        color: "var(--color-brand)",
        /* Mai mic ca literă, dar întins pe verticală: așa ajunge mai înalt decât
           cuvântul fără să se îngroașe odată cu el. */
        fontSize: "0.78em",
        transform: "scaleY(1.42)",
        /* Punctul de la care se întinde e mijlocul, ca să crească în amândouă
           părțile: întinsă de la linia de scris, ar fi ieșit doar în sus. */
        transformOrigin: "50% 52%",
        [latura === "stanga" ? "marginRight" : "marginLeft"]: RESPIRATIE,
        /* Intră dinspre cuvânt spre afară, ca și cum l-ar prinde. Mișcarea e de
           doi pixeli — cât să se simtă, nu cât să se vadă. */
        animationDelay: "220ms",
        animationFillMode: "backwards",
        ["--tw-enter-translate-x" as string]: latura === "stanga" ? "2px" : "-2px",
      }}
    >
      {semn}
    </span>
  );
}
