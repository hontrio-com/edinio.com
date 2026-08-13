import { SITEMAP_EXEMPLU, SITEMAP_GAZDA, type IntrareSitemap } from "@/lib/website/seo";

/**
 * Ilustrația celui de-al treilea card SEO: sitemapul magazinului, deschis în
 * browser.
 *
 * ═══ „IDENTIC 1 LA 1", CERUT DE CLIENT ═══
 *
 * Un sitemap deschis în browser NU e un tabel frumos și nici o listă de
 * legături: e XML brut, cu semnele lui, scris de mașină. Chrome îl arată ca
 * arbore, colorat, cu un rând cenușiu deasupra care spune că fișierul n-are
 * stil. Aia e realitatea, și aia e desenată aici — inclusiv rândul cenușiu.
 *
 * Tentația la un card de vânzare e să-l „aranjezi": pictograme, rânduri
 * frumoase, poate niște bife. Dar atunci n-ar mai fi un sitemap, ar fi desenul
 * nostru despre un sitemap, iar cine a deschis vreodată unul ar vedea imediat că
 * nu seamănă. Aici XML-ul urât E argumentul: se generează singur.
 *
 * ═══ CE SCRIE ÎN EL E LUAT DINTR-UNUL VIU ═══
 *
 * Câmpurile, ordinea, `changefreq` și `priority` sunt citite dintr-un sitemap
 * adevărat scos de Edinio (vezi `SITEMAP_EXEMPLU`), nu scrise din cap.
 *
 * ⚠ INDENTAREA E A FIȘIERULUI, NU A LUI CHROME, și e o alegere, nu o scăpare.
 * Generatorul nostru nu indentează: `<url>` și copiii lui stau toți la margine,
 * exact ca aici. Chrome, în schimb, ARANJEAZĂ arborele când îl arată — indentează
 * copiii și pune triunghiuri de strâns la elementele cu copii. Aici e forma
 * fișierului, cu rândul cenușiu al lui Chrome deasupra; clientul a văzut-o așa și
 * a spus că e bună. Dacă se cere vreodată chiar vederea lui Chrome, se adaugă
 * indentarea și triunghiurile la `<urlset>` și la fiecare `<url>`.
 *
 * ═══ CULORILE ═══
 *
 * Sunt ale vizualizatorului de XML din Chrome, nu ale noastre: numele de
 * element mov, numele de atribut cafeniu, valoarea de atribut albastră, textul
 * negru. Cine a deschis un sitemap le recunoaște fără să se uite la ce scrie.
 */

/* Vizualizatorul de XML din Chrome — aceleași valori, ca desenul să fie al lui. */
const MOV = "#881280"; // numele elementului, cu tot cu paranteze
const CAFENIU = "#994500"; // numele atributului
const ALBASTRU = "#1a1aa6"; // valoarea atributului
const NEGRU = "#000000"; // textul dintre etichete
const CENUSIU = "#5f6368";

export function PanouSitemap() {
  const produse = SITEMAP_EXEMPLU.filter((i) => i.fel === "produs").length;

  return (
    <div className="@container">
      {/*
        Ce se aude și ce se indexează. XML-ul de dedesubt e ascuns: sunt adrese
        inventate, puse ca desen, iar un motor de căutare n-are ce face cu
        `www.exemplu.ro/product/...` găsit pe pagina noastră.
      */}
      <p className="sr-only">
        Exemplu de sitemap generat de Edinio: un fișier XML cu {SITEMAP_EXEMPLU.length}{" "}
        adrese ale magazinului&nbsp;— pagina de start, o categorie, {produse} produs
        și o pagină de politici&nbsp;— fiecare cu data ultimei modificări.
      </p>

      <div
        aria-hidden="true"
        className="overflow-hidden rounded-[14px] border border-hairline bg-white"
      >
        <BaraChrome />

        <div className="px-3 py-3 @[340px]:px-4">
          {/*
            Rândul pe care îl pune Chrome deasupra oricărui XML fără foaie de
            stil. E chiar textul lui, în românește. Fără el, imaginea ar fi doar
            „niște cod colorat"; cu el, e limpede pentru oricine a deschis
            vreodată un sitemap că se uită la unul adevărat.
          */}
          <p className="mb-2 text-[9.5px] leading-[1.45] @[340px]:text-[10.5px]" style={{ color: CENUSIU }}>
            Acest fișier XML nu pare să aibă informații despre stil asociate.
            Arborele documentului este afișat mai jos.
          </p>

          {/*
            ⚠ `whitespace-pre-wrap` plus rupere în cuvânt, nu tăiere.

            O adresă de produs are vreo 57 de semne; măsurat, panoul e de
            196-438px, adică vreo 32 de semne pe rând pe telefonul mic. Tăiată,
            adresa s-ar fi oprit în mijloc și nu s-ar mai fi văzut că e o adresă
            de produs — exact ce trebuie să se vadă. Rupt, se vede tot, iar
            browserele fac la fel cu XML-ul.
          */}
          <pre className="whitespace-pre-wrap break-words font-mono text-[9.5px] leading-[1.7] @[340px]:text-[10.5px]">
            <span style={{ color: MOV }}>{"<?xml "}</span>
            <span style={{ color: CAFENIU }}>version</span>
            <span style={{ color: MOV }}>=</span>
            <span style={{ color: ALBASTRU }}>&quot;1.0&quot;</span>{" "}
            <span style={{ color: CAFENIU }}>encoding</span>
            <span style={{ color: MOV }}>=</span>
            <span style={{ color: ALBASTRU }}>&quot;UTF-8&quot;</span>
            <span style={{ color: MOV }}>{"?>"}</span>
            {"\n"}
            <span style={{ color: MOV }}>{"<urlset "}</span>
            <span style={{ color: CAFENIU }}>xmlns</span>
            <span style={{ color: MOV }}>=</span>
            <span style={{ color: ALBASTRU }}>
              &quot;http://www.sitemaps.org/schemas/sitemap/0.9&quot;
            </span>
            <span style={{ color: MOV }}>{">"}</span>
            {"\n"}

            {SITEMAP_EXEMPLU.map((intrare) => (
              <Url key={intrare.cale || "acasa"} intrare={intrare} />
            ))}

            <span style={{ color: MOV }}>{"</urlset>"}</span>
          </pre>
        </div>
      </div>
    </div>
  );
}

/**
 * Bara de sus a lui Chrome, cerută „identică 1 la 1".
 *
 * ═══ CE GREȘEȘTE OARECINE CARE O DESENEAZĂ DIN MINTE ═══
 *
 * Prima formă de aici le greșea pe toate patru, și merită scrise, fiindcă sunt
 * chiar lucrurile pe care ochiul le recunoaște fără să le poată numi:
 *
 * 1. **LACĂTUL NU MAI EXISTĂ.** Chrome l-a scos în versiunea 117 și a pus în
 *    locul lui pictograma cu glisoare („tune"). Un lacăt desenat azi arată ca un
 *    Chrome de acum trei ani.
 * 2. **`https://` NU SE VEDE.** Chrome îl ascunde la adresele sigure. Scris, se
 *    citește ca o casetă de cod, nu ca o bară de adresă.
 * 3. **SCRISUL NU E MONOSPAȚIAT.** Bara folosește fontul de interfață al
 *    sistemului. Monospațiat e XML-ul de dedesubt, nu bara — și tocmai
 *    deosebirea dintre ele face desenul să pară un browser.
 * 4. **DOMENIUL E NEGRU, RESTUL CENUȘIU.** Chrome scoate în față gazda și stinge
 *    calea, ca să vezi pe ce site ești. Totul într-o culoare arată ca un câmp de
 *    text obișnuit.
 *
 * Plus pastila însăși: fundal #f1f3f4, rotunjită întreagă, FĂRĂ chenar.
 *
 * ⚠ PRAGURILE SUNT ALE PANOULUI, NU ALE FERESTREI (`@[340px]:`, nu `sm:`).
 *
 * Lățimea panoului NU crește odată cu fereastra: grila trece pe două coloane la
 * 768px, deci exact acolo panoul e cel mai îngust din tot șirul. Măsurat: 538px
 * la fereastră de 640, dar 293px la 768. Cu praguri de fereastră, la 768 bara
 * scotea toate pictogramele tocmai când avea cel mai puțin loc, iar adresa ieșea
 * tăiată — singura lățime din zece la care se rupea.
 *
 * Săgețile, reîncărcarea și steluța apar doar când panoul trece de 340px, cât îi
 * trebuie adresei ca să încapă întreagă lângă ele.
 */
function BaraChrome() {
  const adresa = SITEMAP_GAZDA.replace("https://", "");

  return (
    <div className="flex items-center gap-1 border-b border-hairline bg-white px-2 py-[7px] @[340px]:gap-[6px] @[340px]:px-[10px]">
      {/* Înapoi, înainte, reîncarcă — în ordinea lor, cenușii. */}
      <span className="hidden shrink-0 items-center gap-[6px] pr-1 @[340px]:flex">
        <Pictograma cale="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />
        <Pictograma
          cale="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z"
          intoarsa
        />
        <Pictograma cale="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z" />
      </span>

      {/* Pastila. Fundal cenușiu deschis, rotunjită întreagă, fără chenar. */}
      <span className="flex min-w-0 flex-1 items-center gap-[6px] rounded-full bg-[#f1f3f4] px-[9px] py-[5px] @[340px]:px-3 @[340px]:py-[6px]">
        {/* Glisoarele, cele care au luat locul lacătului în Chrome 117. */}
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px] shrink-0 fill-[#5f6368] @[340px]:h-[14px] @[340px]:w-[14px]">
          <path d="M3 17v2h6v-2zM3 5v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z" />
        </svg>

        {/*
          Adresa: gazda neagră, calea cenușie. Nu se taie cu `truncate` — la
          196px s-ar fi oprit chiar în mijlocul gazdei, adică fix partea pe care
          Chrome o scoate în față.
        */}
        <span className="min-w-0 truncate text-[11px] leading-[1.4] @[340px]:text-[12.5px]">
          <span style={{ color: "#202124" }}>{adresa}</span>
          <span style={{ color: CENUSIU }}>/sitemap.xml</span>
        </span>
      </span>

      {/* Steluța de favorite, la capătul din dreapta al barei. */}
      <span className="hidden shrink-0 pl-1 @[340px]:block">
        <Pictograma cale="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </span>
    </div>
  );
}

function Pictograma({ cale, intoarsa }: { cale: string; intoarsa?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[14px] w-[14px] shrink-0 fill-[#5f6368] @[340px]:h-[15px] @[340px]:w-[15px]"
      style={intoarsa ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d={cale} />
    </svg>
  );
}

function Url({ intrare }: { intrare: IntrareSitemap }) {
  return (
    <>
      <Eticheta nume="url" />
      {"\n"}
      <Rand nume="loc" valoare={`${SITEMAP_GAZDA}${intrare.cale}`} />
      <Rand nume="lastmod" valoare={intrare.lastmod} />
      <Rand nume="changefreq" valoare={intrare.changefreq} />
      <Rand nume="priority" valoare={intrare.priority} />
      <Eticheta nume="url" inchisa />
      {"\n"}
    </>
  );
}

/** Un rând întreg: `<nume>valoare</nume>`. */
function Rand({ nume, valoare }: { nume: string; valoare: string }) {
  return (
    <>
      <Eticheta nume={nume} />
      <span style={{ color: NEGRU }}>{valoare}</span>
      <Eticheta nume={nume} inchisa />
      {"\n"}
    </>
  );
}

/**
 * O etichetă, cu tot cu paranteze.
 *
 * ⚠ PARANTEZELE INTRĂ ÎN CULOAREA NUMELUI, nu rămân negre. Așa le arată Chrome,
 * iar diferența se vede: cu paranteze negre, XML-ul capătă un aer de „cod
 * colorat de noi" în loc de ecran de browser.
 */
function Eticheta({ nume, inchisa }: { nume: string; inchisa?: boolean }) {
  return <span style={{ color: MOV }}>{inchisa ? `</${nume}>` : `<${nume}>`}</span>;
}
