import { segmenteEvidentiate, type Bloc } from "@/lib/website/termeni";

/**
 * Randarea blocurilor dintr-un document juridic.
 *
 * Componentă de SERVER: textul e fix, nu are nimic de ascultat. Singura bucată
 * de JavaScript de pe pagină e cuprinsul, care trebuie să știe unde ai ajuns.
 *
 * ⚠ Nicăieri aici nu se schimbă textul. Numerotarea („10.4.") vine gata
 * despărțită din `termeni.ts`, iar îngroșările se fac tăind textul în bucăți și
 * lipindu-l la loc — vezi `segmenteEvidentiate`.
 */
export function BlocuriLegal({ blocuri }: { blocuri: Bloc[] }) {
  return (
    <>
      {blocuri.map((bloc, i) => (
        <BlocLegal key={i} bloc={bloc} />
      ))}
    </>
  );
}

function BlocLegal({ bloc }: { bloc: Bloc }) {
  switch (bloc.tip) {
    case "paragraf":
      return (
        <p className="mt-4 text-[15px] leading-[1.75] text-ink-2 first:mt-0">
          {bloc.nr ? (
            /*
              Numărul stă în afara frazei, stins. Într-un contract el e adresa
              clauzei — „conform art. 34.3" trebuie să găsească exact ce
              trimite — dar nu e text de citit, deci nu concurează cu fraza.
            */
            <span className="mr-1.5 font-medium tabular-nums text-ink-3">{bloc.nr}</span>
          ) : null}
          {segmenteEvidentiate(bloc.text, bloc.evidenta).map((seg, i) =>
            seg.tare ? (
              <strong key={i} className="font-semibold text-ink">
                {seg.text}
              </strong>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      );

    case "lista":
      return (
        <ul className="mt-3 space-y-1.5 pl-5">
          {bloc.items.map((item) => (
            /*
              Punctul e desenat din `::marker`, nu dintr-un element propriu:
              așa rândul care se rupe pe două linii se aliniază singur sub
              text, nu sub punct.
            */
            <li
              key={item}
              className="list-disc text-[15px] leading-[1.7] text-ink-2 marker:text-ink-3"
            >
              {item}
            </li>
          ))}
        </ul>
      );

    case "definitii":
      return (
        <dl className="mt-4 space-y-3.5">
          {bloc.items.map((d) => (
            /*
              `dt` și `dd` afișate în linie: fraza clientului e „Termenul
              înseamnă ...", un singur enunț. Despărțite pe două rânduri s-ar
              citi ca un titlu urmat de altceva.
            */
            <div key={d.termen} className="text-[15px] leading-[1.75] text-ink-2">
              <dt className="inline font-semibold text-ink">{d.termen}</dt>{" "}
              <dd className="inline">{d.text}</dd>
            </div>
          ))}
        </dl>
      );

    case "date":
      return (
        <dl className="mt-5 divide-y divide-hairline overflow-hidden rounded-[12px] border border-hairline">
          {bloc.items.map((rand) =>
            /*
              Rândul fără etichetă e denumirea firmei: în document ea stă
              singură, fără niciun cuvânt în față. Se desenează ca antet al
              fișei, nu ca pereche etichetă–valoare, tocmai ca să nu fie
              nevoie să-i inventez o etichetă.
            */
            rand.eticheta === undefined ? (
              <p
                key={rand.valoare}
                className="bg-tint px-4 py-3 text-[15px] font-semibold text-ink sm:px-5"
              >
                {rand.valoare}
              </p>
            ) : (
              <div
                key={rand.eticheta}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-4 sm:px-5"
              >
                <dt className="text-[13.5px] text-ink-3">{rand.eticheta}</dt>
                <dd className="text-[14.5px] leading-[1.6] text-ink">
                  {rand.href ? (
                    <a href={rand.href} className="underline-offset-2 hover:underline">
                      {rand.valoare}
                    </a>
                  ) : (
                    rand.valoare
                  )}
                </dd>
              </div>
            ),
          )}
        </dl>
      );

    case "accent":
      return (
        /*
          Rezervat propozițiilor prin care documentul se declară EL ÎNSUȘI
          esențial. Verdele e #12874A, nu verdele de marcă: #1AB554 are pe alb
          2,6:1, sub pragul pentru text — aceeași regulă ca peste tot pe site.
        */
        <p className="mt-5 rounded-r-[8px] border-l-2 border-l-[#12874A] bg-tint px-4 py-3.5 text-[15px] font-medium leading-[1.7] text-ink">
          {bloc.text}
        </p>
      );

    case "email":
      return (
        <p className="mt-4">
          <a
            href={`mailto:${bloc.adresa}`}
            className="inline-flex items-center rounded-[8px] border border-hairline bg-tint px-3.5 py-2 text-[14.5px] font-medium text-ink transition-colors hover:bg-tint-2"
          >
            {bloc.adresa}
          </a>
        </p>
      );
  }
}
