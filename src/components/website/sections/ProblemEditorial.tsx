import { EYEBROW_TONES } from "./SectionEyebrow";

/**
 * VARIANTA B — „Editoriala".
 *
 * A doua propunere pentru secțiunea Problema. Cea care pierde se șterge; cea
 * care câștigă își mută textele în `lib/website/problem.ts`.
 *
 * Ideea: se citește ca un raport, nu ca o reclamă. Titlul stă pe loc în stânga
 * cât timp lista curge prin dreapta, iar plângerile sunt rânduri într-un tabel
 * cu fire de 1px — numerotate, etichetate, nemișcate.
 *
 * Trei lucruri pe care norul de pastile nu le avea:
 *
 * 1. **Ierarhie.** Cincisprezece pastile la aceeași greutate se citeau ca un nor
 *    de cuvinte: citeai trei și treceai mai departe. Șapte rânduri numerotate se
 *    citesc pe toate, fiindcă lista arată că se termină.
 * 2. **Un strat de informație în plus.** Eticheta din dreapta fiecărui rând
 *    (COMENZI, STOC, LIVRARE...) spune din ce parte a treburilor vine durerea.
 *    Pastilele nu spuneau decât plângerea.
 * 3. **Un pod către secțiunea următoare.** Cele șapte categorii sunt exact cele
 *    pe care le acoperă funcțiile de dedesubt, în aceeași ordine. Problema pune
 *    întrebările, soluția le răspunde una câte una.
 *
 * Zero animație. Secțiunea de funcții, imediat dedesubt, se mișcă la derulare;
 * două secțiuni animate una după alta obosesc.
 */

/* Roșul e SINGURUL din secțiune și stă doar în etichetă. La varianta actuală
   cele cincisprezece pastile erau toate roșii, la 7% — ieșea spălăcit și a
   casetă de alertă. Aici negativul vine din ce scrie, nu din culoare. */
const { rgb: ALARM_RGB, text: ALARM_TEXT } = EYEBROW_TONES.alarm;

const TITLE = ["Produsul tău este bun.", "Magazinul online lasă de dorit."];

const LEAD =
  "Pierzi comenzi în fiecare zi, nu din cauza produsului. Astea sunt lucrurile pe care le auzim cel mai des, de la oameni care vând bine și pierd la capătul celălalt.";

/**
 * Cele șapte rânduri.
 *
 * Șapte, nu cincisprezece. Din cincisprezece, omul citea trei; șapte se citesc
 * până la capăt, fiindcă se vede unde se termină.
 *
 * `tag` nu e ornament: e coloana a doua a unui tabel. Ordinea urmează drumul
 * unei comenzi prin firmă — intră, se caută în stoc, pleacă, se facturează, se
 * încasează — și abia la urmă vin cele două despre site.
 */
const ROWS: { text: string; tag: string }[] = [
  {
    text: "Comenzile vin pe WhatsApp și pe Facebook, la ore diferite, de la oameni diferiți.",
    tag: "Comenzi",
  },
  {
    text: "Stocul de pe site nu e cel din depozit, iar diferența o afli de la client.",
    tag: "Stoc",
  },
  {
    text: "AWB-urile le scrii de mână, unul câte unul, în trei interfețe de curier.",
    tag: "Livrare",
  },
  {
    text: "Facturile le faci seara, în Excel, după ce se închide magazinul.",
    tag: "Facturare",
  },
  {
    text: "Nu poți încasa cu cardul, așa că jumătate din comenzi pleacă la ramburs.",
    tag: "Plăți",
  },
  {
    text: "Site-ul se încarcă greu pe telefon, exact acolo unde vin toți clienții.",
    tag: "Viteză",
  },
  {
    text: "Fiecare modificare cere un programator, iar mentenanța costă cât abonamentul.",
    tag: "Mentenanță",
  },
];

/**
 * Eticheta, fără triunghi și aliniată la stânga.
 *
 * Copiată din `ProblemProof.tsx` INTENȚIONAT: sunt două propuneri din care una
 * se șterge, iar o piesă comună ar lăsa un fișier orfan după alegere. Când se
 * alege câștigătoarea, se întoarce în `SectionEyebrow` și se potrivește cu
 * perechea ei, „Soluția".
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

export function ProblemEditorial() {
  return (
    /* Fără card. La varianta actuală, cardul alb exista doar ca să aibă ce tăia
       pastilele care ieșeau din el — un mijloc tehnic îmbrăcat în decizie de
       design. Aici nu mai are ce să țină, deci nu mai e. */
    <section className="bg-tint pt-16 lg:pt-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-20">
          {/*
            Titlul stă pe loc cât curge lista. Nu e un efect: e ce face diferența
            între „o listă de reproșuri" și „o listă de reproșuri la o singură
            afirmație", fiindcă afirmația rămâne în câmpul vizual cât citești
            dovezile. Pe telefon nu se lipește nimic, coloanele se pun una sub
            alta.
          */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow />

            <h2 className="mt-5 text-[30px] font-bold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[42px] lg:text-[44px]">
              {TITLE.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>

            <p className="mt-5 max-w-[420px] text-pretty text-[15px] leading-[1.65] text-ink-2 sm:text-[16px]">
              {LEAD}
            </p>
          </div>

          {/*
            Tabelul. Firele merg dintr-o margine în alta, inclusiv deasupra
            primului rând și sub ultimul: un tabel care se închide arată terminat,
            unul deschis la capete arată tăiat.
          */}
          <ul className="border-b border-hairline lg:-mt-2">
            {ROWS.map((row, index) => (
              <li
                key={row.tag}
                className="grid grid-cols-[26px_minmax(0,1fr)] items-baseline gap-x-3 border-t border-hairline py-4 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:gap-x-5 sm:py-5"
              >
                <span className="text-[12px] font-medium leading-[1.5] tabular-nums text-ink-3 sm:text-[13px]">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <p className="text-pretty text-[15px] leading-[1.5] text-ink sm:text-[17px]">
                  {row.text}
                </p>

                {/* Pe telefon eticheta dispare: pe 390px ar fi strâns textul la
                    două cuvinte pe rând. Informația e utilă, nu esențială. */}
                <span className="hidden whitespace-nowrap text-[10.5px] font-medium uppercase leading-[1.6] tracking-[0.09em] text-ink-3 sm:block">
                  {row.tag}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
