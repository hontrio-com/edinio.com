import { COMENZI_MIGRARE, STARI_COMANDA, type Comanda } from "@/lib/website/migrare";

/**
 * Ilustrația secțiunii „Comenzi": trei comenzi, ca niște înștiințări.
 *
 * ═══ CE A FOST ÎNAINTE, ȘI DE CE S-A SCHIMBAT ═══
 *
 * Un panou cu cap („Comenzi", „1.042 în total") și cinci rânduri de tabel
 * înăuntru, pereche cu arborele de categorii de deasupra. Clientul a cerut altceva
 * (19.08): fără chenarul din jur, doar câteva plăci mai mari, în stil înștiințare.
 *
 * Și e mai bine așa, dintr-un motiv care se vede abia când sunt una sub alta: cu
 * un al doilea panou-cu-cap la rând, secțiunile „Categorii" și „Comenzi" arătau ca
 * aceeași ilustrație cu alt conținut. Acum una e o listă ținută într-un panou, alta
 * sunt lucruri care tocmai s-au întâmplat — două feluri de a arăta date, nu unul
 * repetat.
 *
 * ═══ CE FACE O PLACĂ SĂ PARĂ ÎNȘTIINȚARE, NU RÂND DE TABEL ═══
 *
 * - **Plutește.** Umbra în patru straturi (`placa`), nu chenar de un fir. Un rând
 *   de tabel stă pe o coală; o înștiințare stă DEASUPRA ei. E singura deosebire
 *   care se vede fără să citești.
 * - **Spune CÂND.** „acum 4 min" e chiar lucrul care o face înștiințare — un rând
 *   de listă n-are nevoie de asta, o înștiințare fără asta nu e una.
 * - **Sunt puține și mari.** Trei, nu cinci. Cinci plăci plutitoare una sub alta
 *   redevin o listă, doar una fără chenar.
 * - **Nu se ating.** Spațiu adevărat între ele, ca între obiecte separate, nu
 *   linii despărțitoare ca între rândurile aceluiași lucru.
 *
 * ⚠ Nimic nu se apasă, ca la toate ilustrațiile de pe pagină: nicio stare de
 * hover, niciun buton. Un desen care reacționează promite ceva ce nu poate ține.
 *
 * ⚠ Toate trei sunt `aria-hidden`; ce se aude e propoziția de dedesubt.
 */
export function PanouComenzi() {
  return (
    <div className="mx-auto w-full max-w-[440px] lg:max-w-none">
      <p className="sr-only">
        Trei comenzi așa cum apar în administrarea magazinului: clientul, numărul
        comenzii, valoarea și starea fiecăreia.
      </p>

      {/*
        `gap-3.5`, nu mai strâns: sub vreo 12px, umbrele a două plăci vecine se
        ating și se citesc ca o singură formă cu o dungă la mijloc — adică exact
        rândul de tabel de care am scăpat.
      */}
      <div aria-hidden="true" className="flex flex-col gap-3.5">
        {COMENZI_MIGRARE.map((comanda) => (
          <Instiintare key={comanda.numar} comanda={comanda} />
        ))}
      </div>
    </div>
  );
}

function Instiintare({ comanda }: { comanda: Comanda }) {
  const stare = STARI_COMANDA[comanda.stare];

  return (
    /*
      `placa` ADUCE albul și umbra; nu se pune `bg-white` lângă ea. Aceeași umbră
      ca la plăcile din hero și ca la tabelul de comparație — pe tot site-ul, un
      obiect alb ridicat de pe pagină e ridicat la fel.
    */
    <div className="placa flex items-center gap-3.5 rounded-[16px] p-4 sm:gap-4 sm:p-[18px]">
      <Initiale nume={comanda.client} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[14.5px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[15px]">
            {comanda.client}
          </p>
          {/*
            Suma e cel mai apăsat lucru din placă. Într-o înștiințare despre o
            comandă, ea e vestea; numele spune de la cine, starea spune unde a
            ajuns, dar banii sunt motivul pentru care te uiți.
          */}
          <span className="shrink-0 text-[15px] font-bold tabular-nums tracking-[-0.02em] text-ink sm:text-[16px]">
            {comanda.total}
          </span>
        </div>

        <div className="mt-[7px] flex items-center justify-between gap-3">
          <p className="truncate text-[12px] leading-none text-ink-3">
            {/* Numărul cu cifre monospațiate, vremea nu: numerele stau unul sub
                altul și trebuie să se alinieze, „acum o oră" n-are ce alinia. */}
            <span className="tabular-nums">#{comanda.numar}</span>
            {" · "}
            {comanda.cand}
          </p>

          {/*
            Pastila stării. Lățime FIXĂ, nu pe măsura textului: „Livrată" are șapte
            litere și „În procesare" douăsprezece, iar pastile de lățimi diferite
            fac marginea din dreapta să șerpuiască de la o placă la alta.
          */}
          <span
            className="w-[92px] shrink-0 rounded-full px-2 py-[3px] text-center text-[11px] font-semibold leading-[1.45]"
            style={{ backgroundColor: stare.fond, color: stare.cerneala }}
          >
            {stare.text}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Cercul cu inițialele clientului.
 *
 * Inițialele se scot DIN NUME, nu se scriu în date: scrise separat, primul nume
 * schimbat ar fi lăsat în urmă niște litere care nu mai sunt ale nimănui.
 *
 * ⚠ Inițiale, nu poză. O fotografie de om într-o ilustrație de pe un site
 * comercial ridică imediat întrebarea „cine e ăsta"; două litere într-un cerc nu
 * ridică nicio întrebare și spun același lucru.
 */
function Initiale({ nume }: { nume: string }) {
  const litere = nume
    .split(" ")
    .slice(0, 2)
    .map((cuvant) => cuvant[0])
    .join("");

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint-2 text-[12.5px] font-semibold leading-none text-ink-2">
      {litere}
    </span>
  );
}
