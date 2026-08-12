import type { CSSProperties } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { LOGOS_CASETA, type LogoKey } from "@/lib/website/logos";
import { CasetaSigla } from "./CasetaSigla";

/**
 * Integrarile, ca doua benzi care curg in sensuri opuse.
 *
 * Ideea desenului: nu se enumera nimic, se ARATA cantitatea. Un om care vede
 * doua randuri de sigle trecand intelege „sunt multe si sunt marci pe care le
 * stiu" inainte sa citeasca un cuvant. Titlul spune restul intr-o propozitie.
 *
 * ═══ CE E DE STIUT DACA SE UMBLA LA EA ═══
 *
 * 1. **Totul e vizibil fara JavaScript.** Nu exista stare, nu exista efect la
 *    derulare. Cu animatiile oprite (`prefers-reduced-motion`, vezi `.banda` in
 *    globals.css) benzile stau pe loc si se citesc la fel de bine.
 * 2. **Nu se atinge globals.css.** Singurele animatii folosite sunt `.banda` +
 *    `.banda-stanga` / `.banda-dreapta`, deja acolo, plus tranzitii la hover.
 * 3. **Numarul din randul de jos e DERIVAT**, nu scris de mana: se schimba
 *    singur cand cineva adauga o sigla in `logos.ts`. Un numar scris de mana ar
 *    fi ramas in urma la prima integrare noua si nimeni n-ar fi observat.
 */

/*
  Verdele pentru TEXT — verdele de brand (#1AB554) are pe alb un contrast de
  2,6:1, sub pragul de citibilitate. #12874A e acelasi ton dus la 4,6:1. Aceeasi
  constanta si acelasi motiv ca in `TrustedProduct.tsx`; verdele PLIN ramane
  rezervat butonului din hero.
*/
const GREEN_TEXT = "#12874A";

/*
  Impartirea in doua benzi: pozitiile PARE sus, cele IMPARE jos.

  `ALL_LOGOS` vine grupat pe categorii (intai cei sase curieri, apoi cele cinci
  plati, s.a.m.d.). Taiat pur si simplu in doua jumatati, randul de sus ar fi
  fost „curieri + plati" si cel de jos „marketplace + pixeli" — adica doua benzi
  cu caracter diferit, iar cine se uita doar la una ar fi crezut ca atat facem.
  Alternand, fiecare banda ia din TOATE categoriile si amandoua arata la fel de
  variat.

  Diferenta de un element intre benzi e si ea utila: n-au aceeasi lungime, deci
  nu se pot suprapune periodic.

  Se porneste de la `LOGOS_CASETA`, nu de la `ALL_LOGOS`, si asta conteaza:
  casetele de aici sunt PATRATE, iar intr-un patrat o sigla foarte lata iese
  ilizibila. About You are raportul 9,13 si intr-o caseta de 84px ajungea la 6px
  inaltime, o mazgalitura. Socoteala si pragul sunt in `logos.ts`. Nu e o
  scoatere din oferta: About You ramane in `LOGO_GROUPS` si se numara mai jos, la
  „integrari" — doar nu se deseneaza intr-un patrat.
*/
const BANDA_SUS = LOGOS_CASETA.filter((_, i) => i % 2 === 0);
const BANDA_JOS = LOGOS_CASETA.filter((_, i) => i % 2 === 1);

/*
  De cate ori se repeta lista intr-o banda. Numarul e SOCOTIT, nu scris de mana,
  si asta e o reparatie: cu o constanta fixa, invariantul de mai jos tinea doar
  cat timp nimeni nu scotea sigle din `logos.ts`.

  Doua conditii:

  1. Animatia muta banda cu -50% din latimea ei. Ca bucla sa fie continua,
     continutul trebuie sa se repete cu perioada exact 50% — deci un numar PAR
     de copii, iar jumatatea aia e „unitatea" care se plimba.
  2. Jumatatea trebuie sa fie mai lata decat fereastra, altfel la capatul cursei
     traverseaza un gol prin banda.

  Pasul e masurat pe desktop, unde e cel mai mare: caseta 84 + spatiul 16 = 100px
  (pe telefon e 68 + 12 = 80, deci cere mai putine copii — socoteala pe desktop le
  acopera pe amandoua). Tinta e 1920, cea mai lata fereastra pe care o sustinem.

  Azi iese 4 pentru amandoua benzile (14 x 100 = 1400 si 13 x 100 = 1300 pe copie,
  deci jumatati de 2800 si 2600). Daca maine cineva scoate noua sigle, formula
  urca singura la 6 in loc sa lase un gol pe care nu l-ar observa nimeni pana in
  productie.
*/
const PAS_CASETA = 100;
const LATIME_MAXIMA = 1920;

function numarDeCopii(nrSigle: number): number {
  /* Fara asta, o lista goala da `1920 / 0 = Infinity`, iar `Array.from` cu
     lungime infinita arunca RangeError si cade toata pagina. Un `LOGO_GROUPS`
     golit din greseala n-are voie sa doboare pagina de acasa. */
  if (nrSigle <= 0) return 0;

  const perCopie = nrSigle * PAS_CASETA;
  /* `2 *` forteaza paritatea ceruta de -50%; `max(2, …)` tine minimul de doua
     copii chiar si cand o singura copie ar acoperi ecranul. */
  return Math.max(2, 2 * Math.ceil(LATIME_MAXIMA / perCopie));
}

/*
  Stingerea de la capete. Procente, nu pixeli: pe un telefon de 320px o stingere
  fixa de 120px ar fi mancat un sfert din banda de fiecare parte, iar pe 1920 una
  de 24px n-ar fi taiat nimic. Asa raportul ramane acelasi la orice latime.

  `WebkitMaskImage` e obligatoriu langa ea: Safari sub 15.4 nu cunoaste
  `mask-image` neprefixat, iar fara masca banda apare taiata brusc in muchie.
*/
const MASCA =
  "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)";

export function IntegrationsBenzi() {
  return (
    <section className="bg-white py-20 lg:py-28">
      {/* ── Antetul, ingust si centrat ────────────────────────────────────── */}
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        {/*
          720, nu 640, si numarul e MASURAT. Titlul are 1054px la 44px bold, deci
          se rupe oricum in doua randuri; intrebarea e UNDE. La 640 se rupea la
          „de care ai / nevoie", adica in mijlocul unei expresii. Prima parte,
          pana la virgula, cere 689px — deci de la 700 in sus taietura cade
          singura pe virgula, unde si trebuie. 720 lasa 31px de rezerva, pentru
          cand un alt sistem randeaza fontul cu o idee mai lat.
          A doua parte are 356px, deci randul doi ramane vizibil mai scurt: lung
          apoi scurt, ceea ce se citeste ca decizie, nu ca text care s-a rupt.
        */}
        <div className="mx-auto max-w-[720px] text-center">
          {/*
            NU e `SectionEyebrow`, si e o decizie: aceea are culoarea fixata pe
            `text-ink-3`, iar aici eticheta trebuie sa fie verde. Schimbata la
            sursa, s-ar fi colorat si etichetele „Problema" / „Solutia", care
            sunt dinadins identice intre ele. Tipografia e insa copiata exact
            (13px, semibold, 0.18em), ca sa se citeasca din aceeasi familie.

            `pe-[0.18em]` compenseaza spatierea de dupa ULTIMA litera: pe un rand
            centrat, fara ea, cuvantul iese impins cu o jumatate de spatiere spre
            stanga. Acelasi motiv ca in `SectionEyebrow`.
          */}
          <p
            className="pe-[0.18em] text-[13px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: GREEN_TEXT }}
          >
            Integrări
          </p>

          {/*
            TEXTELE SUNT ALE CLIENTULUI, date cuvant cu cuvant (2026-08-07). I s-au
            propus cinci perechi de titlu si descriere si le-a respins pe toate.
            Nu le rescrie.

            NEGRU INTEGRAL, si e o corectura ceruta de client (2026-08-11).
            Partea a doua, „intr-un singur loc.", statea in `text-ink-3` +
            `font-medium` — un titlu in doua tonuri, singurul asa de pe pagina.
            Problema, Solutia, Comparatia, Preturile si Intrebarile frecvente
            sunt toate `text-ink` curat. Nu se reintroduce stingerea aici fara sa
            se schimbe si acolo: capetele de sectiune se citesc ca serie numai
            cat timp arata la fel.

            Nu are `<span className="block">` per rand ca celelalte titluri, si
            asta e dinadins: acolo clientul a dat textul rupt pe randuri, aici e
            o singura propozitie si taietura trebuie sa cada singura la virgula.
            Latimea de 720px de mai sus e masurata exact pentru asta.

            Sub 400px titlul se rupe oricum in patru randuri; nu incape altfel,
            iar prescurtarea lui ar insemna schimbarea textului clientului.
          */}
          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            Toate integrările de care ai nevoie, într-un singur loc.
          </h2>

          <p className="mx-auto mt-5 max-w-[520px] text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            Curieri, plăți online, facturare, marketing și marketplace-uri. Totul
            se activează direct din Edinio.
          </p>
        </div>
      </div>

      {/*
        Benzile stau IN AFARA containerului de 1200px, ca frati directi ai
        sectiunii. Asa ies pana in marginile ferestrei fara marje negative si
        fara niciun risc de depasire orizontala: latimea lor e chiar latimea
        paginii, iar ce iese din ele e taiat de `overflow-hidden`.
      */}
      {/*
        Fara `space-y`: distanta dintre benzi o dau acum marginile lor interioare
        (28 jos + 8 sus = 36px), care exista oricum ca sa incapa umbra.
        Adaugat peste ele, `space-y` ar fi impins randurile la peste 50px.

        Si conteaza sa NU fie mai mica de atat: umbra randului de sus coboara 24px.
        Daca randul al doilea ar veni mai aproape, tile-urile lui ar fi desenate
        PESTE umbra aia — banda a doua vine dupa in document — si umbra ar aparea
        doar prin golurile dintre casete, patat.
      */}
      <div className="mt-10 sm:mt-12">
        <Banda
          chei={BANDA_SUS}
          sens="stanga"
          durata="92s"
          eticheta="Servicii integrate, partea întâi"
        />
        {/*
          Durata ALTA, nu din capriciu: la aceeasi durata cele doua benzi ar avea
          practic aceeasi viteza si s-ar citi ca un singur mecanism oglindit.
          92s / 76s dau ~30 si ~34 px/s pe desktop — destul de aproape cat sa
          para acelasi ritm, destul de diferit cat sa nu se prinda trucul.
        */}
        <Banda
          chei={BANDA_JOS}
          sens="dreapta"
          durata="76s"
          eticheta="Servicii integrate, partea a doua"
          decalata
        />
      </div>

      {/* ── Randul discret de sub benzi ───────────────────────────────────── */}
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        {/*
          `text-ink-2`, nu `text-ink-3`, si e o corectura de citibilitate, nu de
          gust: #8A8A94 pe alb da 3,4:1, iar la 14px normal WCAG cere 4,5:1.
          #52525B da 7,6:1. Randul ramane discret din MARIME (14px langa 16-18px
          in restul sectiunii), nu din paloare — singurul mod de a fi discret care
          nu costa pe cineva propozitia. `text-ink-3` e in regula pe randul al
          doilea al titlului, unde corpul de 32-44px intra la „text mare" si
          pragul coboara la 3:1.
        */}
        <p className="mt-10 text-center text-[14px] leading-[1.6] text-ink-2 sm:mt-12">
          {/*
            Text dat de client, cuvant cu cuvant (2026-08-07), si e a treia forma:
            intai numarul exact derivat din `logos.ts`, apoi „peste 25", acum fara
            nicio cifra. A cerut de fiecare data mai putina precizie, deci nu o
            duce inapoi la un numar.

            De stiut: restul site-ului (`/integrari`, mega-meniul) spune inca
            „peste 25 de integrari". Nu se contrazic — „zeci" le cuprinde — dar
            daca se uniformizeaza vreodata, aici e locul care s-a schimbat ultima
            data.
          */}
          Zeci de integrări disponibile pentru magazinul tău online.{" "}
          <Link
            href="/integrari"
            className="font-medium underline decoration-1 underline-offset-[5px] transition-opacity duration-200 hover:opacity-70"
            style={{ color: GREEN_TEXT }}
          >
            Vezi toate integrările
          </Link>
        </p>
      </div>
    </section>
  );
}

/**
 * O banda: un rand de casete care aluneca intr-un sens si se stinge la capete.
 *
 * `decalata` o impinge cu o jumatate de caseta spre stanga. Fara asta, cele doua
 * benzi ar avea casetele in aceleasi coloane si, cum se misca invers, s-ar vedea
 * ca o grila care se desface — exact impresia de „truc" pe care o evitam.
 *
 * Deplasarea sta pe UN INVELIS, nu pe elementul `.banda`: acela isi are deja
 * `transform` ocupat de animatie, iar un `translate` pus tot pe el ar fi fost
 * suprascris la primul cadru.
 */
function Banda({
  chei,
  sens,
  durata,
  eticheta,
  decalata,
}: {
  chei: LogoKey[];
  sens: "stanga" | "dreapta";
  /** Cat dureaza o bucla intreaga, ca sir CSS. Vezi `--banda-durata`. */
  durata: string;
  /** Ce aude cine nu vede banda. Doar prima copie e anuntata. */
  eticheta: string;
  decalata?: boolean;
}) {
  /* Per banda, nu global: cele doua au lungimi diferite (14 si 13), deci pot
     cere numere diferite de copii. Vezi `numarDeCopii`. */
  const copii = numarDeCopii(chei.length);

  return (
    <div
      /*
        `pt-2 pb-7` NU e spatiere, e LOC PENTRU UMBRA, si repara un defect pe care
        clientul l-a vazut imediat: umbra casetelor se termina brusc, cu o linie
        dreapta, de-a lungul intregii benzi.

        Cauza: containerul are `overflow-hidden`, de care banda are nevoie ca sa-si
        taie continutul care curge. Fara padding, inaltimea lui era exact cat o
        caseta, iar umbra — care iese sub caseta — cadea in afara cutiei si era
        retezata. Nu era umbra prost aleasa, era umbra taiata.

        Cati pixeli: umbra de inaltime e `0 10px 22px -8px`, deci coboara sub
        caseta 10 + 22 - 8 = 24px. 28 (`pb-7`) acopera si mai lasa o rezerva. Sus
        iese doar 4px (-10 + 22 - 8), deci 8 ajung.
        Daca se schimba vreodata umbra din `.caseta-sigla`, se recalculeaza si
        astea — altfel taietura revine, si e greu de banuit de unde vine.
      */
      className="overflow-hidden pt-2 pb-7"
      style={{ maskImage: MASCA, WebkitMaskImage: MASCA }}
    >
      <div
        className={cn(
          "relative",
          /* Jumatate de caseta: 34px din 68 pe telefon, 42 din 84 pe desktop. */
          decalata && "-left-[34px] sm:-left-[42px]",
        )}
      >
        <div
          className={cn(
            "banda",
            sens === "stanga" ? "banda-stanga" : "banda-dreapta",
          )}
          style={{ "--banda-durata": durata } as CSSProperties}
        >
          {Array.from({ length: copii }, (_, copie) => (
            <ul
              key={copie}
              /*
                `role="list"` explicit: preflight-ul Tailwind pune
                `list-style: none`, iar Safari scoate atunci rolul implicit de
                lista. Fara el, VoiceOver nu mai anunta „lista cu 14 elemente".
              */
              role="list"
              aria-label={copie === 0 ? eticheta : undefined}
              /*
                Copiile de dupa prima exista doar ca bucla sa nu sara; anuntate,
                ar fi citit fiecare marca de cate ori se repeta lista.
              */
              aria-hidden={copie > 0 ? true : undefined}
              className="flex shrink-0"
            >
              {chei.map((cheie) => (
                <li
                  key={cheie}
                  /*
                    Spatiul dintre casete sta ca PADDING pe element, nu ca `gap`
                    pe rand, si asta chiar conteaza. Cu `gap`, latimea totala e
                    `n*caseta + (n-1)*spatiu`, iar jumatatea ei cade cu o
                    jumatate de spatiu langa inceputul copiei urmatoare: bucla
                    sare cu 8px la fiecare ciclu, exact cat sa se vada si sa nu
                    se inteleaga de ce. Cu padding, unitatea care se repeta e
                    fix `caseta + spatiu` si -50% cade la milimetru.
                  */
                  className="pr-3 sm:pr-4"
                >
                  <Caseta cheie={cheie} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * O caseta cu o sigla: patrat cu colturi rotunde, alb, ridicat doar prin umbra.
 *
 * Desenul si socoteala latimii utile stau in `CasetaSigla`, folosita si de
 * campul plutitor din hero-ul paginii „Integrari". Aici raman doar marimea si
 * rotunjirea, adica singurele care difera intre cele doua locuri.
 */
function Caseta({ cheie }: { cheie: LogoKey }) {
  return (
    <CasetaSigla
      cheie={cheie}
      className="h-[68px] w-[68px] rounded-[16px] sm:h-[84px] sm:w-[84px]"
    />
  );
}
