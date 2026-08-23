import { segmenteEvidentiate, type Bloc } from "@/lib/website/legal";
import Link from "next/link";

/**
 * Randarea blocurilor dintr-un document juridic.
 *
 * Componentă de SERVER: textul e fix, nu are nimic de ascultat. Singura bucată
 * de JavaScript de pe paginile astea e cuprinsul, care trebuie să știe unde ai
 * ajuns.
 *
 * ⚠ Nicăieri aici nu se schimbă textul. Numerotarea („10.4.") vine gata
 * despărțită din fișierele de conținut, iar îngroșările se fac tăind textul în
 * bucăți și lipindu-l la loc — vezi `segmenteEvidentiate`.
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

    case "subtitlu":
      /*
        `h3`, fiindcă articolul e `h2`. La Confidențialitate un articol are până
        la opt astfel de titluri („Dreptul de acces", „Dreptul la rectificare"…),
        iar fără ele documentul devine un bloc de text prin care nu poți sări.
        Nu intră în cuprins: 50 de articole plus ~60 de subtitluri ar face
        cuprinsul mai lung decât ce cuprinde.
      */
      return (
        <h3 className="mt-7 text-[15.5px] font-semibold leading-[1.4] text-ink first:mt-0">
          {bloc.nr ? (
            <span className="mr-1.5 tabular-nums font-medium text-ink-3">{bloc.nr}</span>
          ) : null}
          {bloc.text}
        </h3>
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
                {/* `whitespace-pre-line`: unde documentul rupe adresa pe două
                    rânduri, o lăsăm ruptă. */}
                <dd className="whitespace-pre-line text-[14.5px] leading-[1.6] text-ink">
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

    case "adresa":
      return (
        <address className="mt-4 rounded-[12px] border border-hairline bg-tint px-4 py-3.5 text-[14.5px] not-italic leading-[1.7] text-ink sm:px-5">
          {bloc.linii.map((linie, i) => (
            <span key={linie} className={i === 0 ? "block font-semibold" : "block"}>
              {linie}
            </span>
          ))}
        </address>
      );

    case "accent":
      return (
        /*
          Rezervat propozițiilor prin care documentul se declară EL ÎNSUȘI
          esențial. Verdele e `--primary`, nu verdele de marcă: #1AB554 are pe
          alb 2,70:1, sub pragul pentru text — aceeași regulă ca peste tot pe
          site. Doctrina celor doi verzi e în capul lui `globals.css`.
        */
        <p className="mt-5 rounded-r-[8px] border-l-2 border-l-primary bg-tint px-4 py-3.5 text-[15px] font-medium leading-[1.7] text-ink">
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

    case "trimiteri":
      return (
        /*
          Trimiteri catre alte documente ale site-ului. Randate ca o LISTA de
          linkuri, nu inghesuite in fraza de deasupra: la GDPR sunt doua, iar
          doua linkuri intr-un paragraf de sase randuri se pierd.

          ⚠ `next/link`, nu `<a>`: sunt cai interne, deci se navigheaza fara
          reincarcarea paginii — si asa cere si regula de lint a proiectului.
        */
        <ul className="mt-4 grid gap-2">
          {bloc.items.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="inline-flex items-center rounded-[8px] border border-hairline bg-tint px-3.5 py-2 text-[14.5px] font-medium text-ink transition-colors hover:bg-tint-2"
              >
                {t.text}
              </Link>
            </li>
          ))}
        </ul>
      );

    case "tabel":
      return <TabelLegal bloc={bloc} />;
  }
}

/**
 * Tabelele din Politica de Cookies.
 *
 * ═══ UN SINGUR `<table>`, CARE ÎȘI SCHIMBĂ DOAR `display` ═══
 *
 * De la `lg` în sus e tabel; sub `lg` fiecare RÂND devine o fișă, cu numele
 * coloanei deasupra fiecărei valori. Același tipar ca la tabelul de comparație
 * de pe pagina de start, și din același motiv:
 *
 * - **derularea pe orizontală** pică la „să se înțeleagă tot": tabelul rezumat
 *   are cinci coloane, iar pe 390px se văd două — cine nu ghicește că poate
 *   trage lateral crede că a citit tot;
 * - **două desene în pagină** (tabel + fișe, ascunse pe rând) ar însemna
 *   aceleași texte în două locuri, deci despărțite la prima corectură, și
 *   conținut citit de două ori de cititoarele de ecran.
 *
 * ⚠ Etichetele din fișe și antetul tabelului NU se suprapun niciodată: antetul
 * e `display:none` sub `lg`, etichetele sunt `display:none` peste. Deci la orice
 * lățime, numele coloanei ajunge la cititoarele de ecran exact o dată.
 */
function TabelLegal({ bloc }: { bloc: Extract<Bloc, { tip: "tabel" }> }) {
  return (
    <div className="mt-5">
      <div className="overflow-hidden rounded-[12px] border border-hairline">
        <table className="block w-full border-collapse text-left lg:table">
          <thead className="hidden lg:table-header-group">
            <tr className="bg-tint">
              {bloc.antet.map((cap) => (
                <th
                  key={cap}
                  scope="col"
                  className="border-b border-hairline px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3"
                >
                  {cap}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block lg:table-row-group">
            {bloc.randuri.map((rand) => (
              <tr
                key={rand[0]}
                className="block border-t border-hairline first:border-t-0 lg:table-row lg:border-t"
              >
                {rand.map((celula, j) => (
                  <td
                    key={bloc.antet[j]}
                    className="block px-4 pb-2 pt-2 align-top text-[14px] leading-[1.6] text-ink-2 first:pt-3 last:pb-3 lg:table-cell lg:px-4 lg:py-3 lg:first:pt-3 lg:last:pb-3"
                  >
                    <span className="mb-0.5 block text-[11.5px] uppercase tracking-[0.06em] text-ink-3 lg:hidden">
                      {bloc.antet[j]}
                    </span>
                    <span className={j === 0 ? "font-semibold text-ink" : undefined}>
                      {celula}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bloc.nota ? <p className="mt-2.5 text-[13px] text-ink-3">{bloc.nota}</p> : null}
    </div>
  );
}
