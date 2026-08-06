import Link from "next/link";
import { ArrowRight, Plug } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LOGO_AREA, type LogoKey } from "@/lib/website/logos";
import { SectionEyebrow } from "../SectionEyebrow";
import { Logo } from "./Logo";

/**
 * Integrări, varianta editorială: un antet pe două coloane, apoi un rând de
 * fișe care iese din ecran.
 *
 * ═══ DE UNDE VINE SENZAȚIA CĂ RÂNDUL CONTINUĂ ═══
 *
 * Din geometrie, nu din umbre sau degradeuri la margini. Rândul nu stă în
 * containerul de 1200px: ține toată lățimea ferestrei, iar fișele sunt
 * dimensionate în PROCENTE din lățimea vizibilă, alese dinadins ca să nu iasă
 * niciodată un număr întreg. La orice lățime rămâne o fișă tăiată de marginea
 * din dreapta — vezi `CARD_WIDTH` pentru socoteală.
 *
 * ═══ E UN SCROLLER, LA TOATE LĂȚIMILE ═══
 *
 * Nu doar pe telefon. Un rând care iese din ecran și e TĂIAT ar ascunde
 * definitiv patru fișe pe desktop, iar regula casei e că tot conținutul se vede
 * fără JavaScript. Derularea nativă pe orizontală rezolvă amândouă: rândul se
 * vede că merge mai departe ȘI se poate ajunge la capătul lui, fără o linie de
 * cod care rulează în browser.
 *
 * Ce NU se poate face fără JavaScript: să pornească deja derulat, ca să fie
 * tăiate amândouă capetele din prima. Un scroller începe la 0. Singura cale de
 * a tăia și stânga în repaus e să împingi conținutul în afara originii de
 * derulare, iar acolo devine INACCESIBIL — adică jumătatea din stânga a primei
 * fișe n-ar putea fi văzută niciodată. Așa că în repaus capătul din stânga e
 * lipit de marginea ferestrei; de la prima atingere a rândului sunt tăiate
 * amândouă.
 *
 * ═══ BARA DE DERULARE RĂMÂNE VIZIBILĂ ═══
 *
 * Proiectul are `.scrollbar-hide` și e tentant. Nu se folosește aici: fișele nu
 * conțin niciun link, deci nu există nimic la care să ajungi cu Tab, iar pe
 * desktop bara e singurul semn că rândul se poate derula. Ascunsă, ultimele
 * patru fișe ar exista în pagină fără ca nimeni să bănuiască. Dacă apare
 * vreodată un rând de săgeți, atunci se poate ascunde.
 */

interface EditorialCard {
  logo: LogoKey;
  /** Categoria, scurtă și cu majuscule. Vezi `LOGO_GROUPS` pentru împărțire. */
  category: string;
  title: string;
  description: string;
}

/**
 * Opt integrări, șapte categorii diferite.
 *
 * Alegerea nu e după cât de cunoscută e sigla, ci după acoperire: fiecare fișă
 * aduce alt tip de treabă pe care platforma o face în locul tău. Doi curieri, și
 * numai fiindcă acolo se vede cel mai bine diferența (AWB la ușă vs. locker).
 *
 * Textele descriu ce se întâmplă, la persoana a doua, fără adjective. Dacă
 * adaugi una, păstrează tonul: verb + rezultat, nu „soluție completă".
 */
const CARDS: EditorialCard[] = [
  {
    logo: "fanCourier",
    category: "CURIERI",
    title: "AWB generat automat",
    description: "Comanda pleacă la curier fără să deschizi alt site.",
  },
  {
    logo: "stripe",
    category: "PLĂȚI",
    title: "Plată cu cardul",
    description: "Banii ajung direct în contul tău, fără să treacă prin noi.",
  },
  {
    logo: "smartbill",
    category: "FACTURARE",
    title: "Factură la fiecare comandă",
    description: "Se emite singură când clientul plătește, cu seria ta.",
  },
  {
    logo: "sameday",
    category: "CURIERI",
    title: "Livrare la easybox",
    description: "Clientul își alege lockerul în pagina de comandă.",
  },
  {
    logo: "notice",
    category: "SMS",
    title: "SMS când pleacă coletul",
    description: "Clientul primește numărul AWB pe telefon, fără să-l scrii tu.",
  },
  {
    logo: "mailchimp",
    category: "EMAIL",
    title: "Lista crește singură",
    description: "Cine cumpără intră în lista ta, cu acordul lui.",
  },
  {
    logo: "googleMerchant",
    category: "MARKETING",
    title: "Produsele ajung în Google",
    description: "Catalogul urcă singur și ține pasul cu prețurile tale.",
  },
  {
    logo: "trendyol",
    category: "MARKETPLACE",
    title: "Vinzi și pe Trendyol",
    description: "Aceleași produse și același stoc, dintr-un singur loc.",
  },
];

/**
 * Cât de lată e o fișă, ca fracțiune din lățimea VIZIBILĂ a rândului.
 *
 * Procent, nu `vw`, și e o decizie: `100vw` include bara de derulare verticală
 * a paginii, deci pe desktop socoteala ar fi ieșit cu ~15px mai lată decât
 * ecranul. Procentul se raportează la lățimea reală a scrollerului.
 *
 * Fiecare prag e ales ca numărul de fișe vizibile să cadă LÂNGĂ o jumătate,
 * niciodată lângă un întreg — dacă a n-a fișă s-ar termina fix pe marginea
 * ecranului, rândul ar părea că se sfârșește acolo, și tot efectul se pierde:
 *
 *   <500      76%    →  1,3 fișe   (320px: fișa are 243px)
 *   500-639   56%    →  1,8        (639px: 358px)
 *   640-1023  41%    →  2,4        (768px: 315px)
 *   1024-1279 28,5%  →  3,5        (1024px: 292px)
 *   1280-1535 22,2%  →  4,5        (1440px: 320px)
 *   1536+     17,5%  →  5,7        (1920px: 336px)
 *
 * Lățimea fișei rămâne între 243 și 420px peste tot, deci titlul de 2-4 cuvinte
 * și descrierea de două rânduri se comportă la fel la orice ecran.
 */
const CARD_WIDTH =
  "w-[76%] min-[500px]:w-[56%] sm:w-[41%] lg:w-[28.5%] xl:w-[22.2%] 2xl:w-[17.5%]";

/**
 * Caroiajul de puncte din dreapta antetului.
 *
 * E FUNDAL, nu ilustrație: nu spune nimic, doar ține coloana din dreapta să nu
 * fie goală. De aceea e `aria-hidden` și de aceea dispare complet sub `lg`, în
 * loc să fie înghesuit — la o lățime mică ar deveni o bandă de puncte care
 * concurează cu titlul.
 *
 * Punctele sunt un `radial-gradient` repetat, iar forma moale vine din
 * `mask-image`: o elipsă care trece de la opac la transparent, deci caroiajul
 * se stinge în alb pe toate laturile. Fără mască ar avea patru muchii drepte și
 * s-ar citi ca o casetă.
 *
 * `WebkitMaskImage` stă lângă `maskImage` pentru Safari mai vechi de 15.4, unde
 * varianta fără prefix nu există. Nu se poate scoate doar pentru că arată
 * redundant.
 *
 * Griul punctelor nu e ales cu ochiul: e `--color-ink-3` (#8A8A94, jetonul casei
 * pentru etichete) la 38% peste alb. Scris ca `rgba()`, nu ca `var()`, fiindcă
 * `radial-gradient` are nevoie de canalul alfa, iar tokenul e opac; și nu ca
 * `color-mix()`, care ar fi ridicat pragul la Safari 16.2 degeaba. Dacă paleta
 * se schimbă, aici se recalculează — nu se ghicește alt gri.
 */
function DotField() {
  return (
    <div
      aria-hidden
      className="hidden h-[280px] w-full lg:block xl:h-[320px]"
      style={{
        backgroundImage:
          "radial-gradient(circle at center, rgba(138, 138, 148, 0.38) 1.35px, transparent 1.45px)",
        backgroundSize: "16px 16px",
        maskImage:
          "radial-gradient(ellipse 58% 58% at 52% 50%, #000 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0.2) 70%, transparent 88%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 58% 58% at 52% 50%, #000 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0.2) 70%, transparent 88%)",
      }}
    />
  );
}

export function IntegrationsEditorial() {
  return (
    <section className="bg-white py-20 lg:py-28">
      {/* ── Antetul, în container ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        {/*
          Coloanele nu sunt egale: textul ia partea mai mică (0,92 din 2), iar
          caroiajul partea mai mare. Invers ar fi fost gresit — caroiajul e gol,
          si o zona goala ingusta arata a spatiu ramas, nu a aer.

          Sub `lg` dispare a doua coloana cu totul. Un element `display:none` nu
          ocupa nicio celula de grila, deci nu ramane nici rand gol, nici `gap`
          in plus sub buton.
        */}
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10">
          <div>
            {/*
              Pictograma sta LANGA eticheta, nu deasupra ei, si e la aceeasi
              culoare cu textul: eticheta ramane un singur obiect. Cu alta
              culoare ar fi devenit un accent, iar accentul sectiunii e butonul.

              `SectionEyebrow` isi pune singur `pe-[0.18em]` ca sa compenseze
              spatierea de dupa ultima litera; aici randul e aliniat la stanga,
              deci compensarea nu deranjeaza.
            */}
            <div className="flex items-center gap-2.5">
              <Plug
                className="h-4 w-4 shrink-0 text-ink-3"
                strokeWidth={1.75}
                aria-hidden
              />
              <SectionEyebrow label="Integrări" />
            </div>

            {/*
              Cele doua randuri cerute ies din `max-w-[560px]`: la 44px, prima
              propozitie umple un rand si a doua cade dedesubt, fara `<br />`.
              Latimea e ce face ruperea, nu marcajul — de aceea nu se scoate.

              Pe telefon, la 32px si o coloana de ~280px, titlul se rupe in trei
              sau patru randuri. E in regula si e voit: un `<br />` pus ca sa
              „pastreze doua randuri" ar fi taiat propozitia in locul gresit
              exact acolo unde se vede cel mai prost.
            */}
            <h2 className="mt-6 max-w-[560px] text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
              Peste 25 de integrări. Tu doar le pornești.
            </h2>

            <p className="mt-5 max-w-[520px] text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
              Curieri, plăți, facturare și marketing sunt deja scrise în
              platformă. Le pornești cu un comutator, fără programator.
            </p>

            {/*
              Singurul verde plin din sectiune, si dinadins fara umbra colorata:
              butonul din hero are un halou verde de 28px, iar daca l-ar avea si
              asta cele doua ar concura. Aici verdele e plat, deci ramane clar
              al doilea.

              Pastila (`rounded-full`) e ceruta si e si utila: butoanele din
              restul paginii au colturi de 8px, deci forma il desparte de ele
              fara sa mai fie nevoie de inca o culoare.

              Verdele de hover e `--color-brand-dark`, luat prin `var()`, nu
              scris ca hex. Tokenul exista in `globals.css` dar sta in `:root`,
              nu in `@theme`, deci Tailwind NU genereaza `bg-brand-dark` pentru
              el — de aici ocolisul. Scris ca hex, butonul ar fi ramas pe verdele
              vechi la prima retusare a paletei, si nimeni n-ar fi cautat aici.
            */}
            <Link
              href="/integrari"
              className="group mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-brand-dark)]"
            >
              Vezi toate integrările
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <DotField />
        </div>
      </div>

      {/* ── Rândul de fișe, pe toată lățimea ferestrei ─────────────────────── */}
      {/*
        Invelisul asta NU are `w-screen` si nici margini negative. E un `div`
        obisnuit, deci ia exact latimea corpului paginii — adica fara bara de
        derulare verticala. `w-screen` ar fi insemnat `100vw`, care INCLUDE
        bara, si ar fi latit pagina cu ~15px pe desktop. E capcana clasica de
        depasire orizontala din proiect.

        Liniile de sus si de jos merg de la o margine la alta a ferestrei. Nu se
        opresc in container, fiindca nici randul nu se opreste acolo.
      */}
      <div className="mt-16 border-y border-hairline lg:mt-20">
        {/*
          `overscroll-x-contain` opreste gestul de „inapoi" al browserului cand
          ajungi la capatul randului pe touchpad sau pe telefon. Fara el, o
          derulare mai apasata spre stanga scoate omul din pagina.

          `tabIndex` + `role`/`aria-label`: fisele nu contin niciun link, deci
          fara ele zona nu poate fi atinsa cu tastatura si ultimele fise devin
          inaccesibile pentru cine nu foloseste mausul.
        */}
        <div
          role="region"
          aria-label="Integrări disponibile"
          tabIndex={0}
          className="snap-x snap-mandatory overflow-x-auto overscroll-x-contain lg:snap-proximity"
        >
          {/*
            Pista e `flex` SIMPLU, fara `w-max`. Asta e ce face socoteala din
            `CARD_WIDTH` sa functioneze: latimea pistei ramane cea vizibila, iar
            procentele fiselor se raporteaza la ea. Cu `w-max` pista ar fi
            crescut cat continutul si fiecare fisa ar fi luat un procent dintr-un
            total care depinde de cate fise sunt.

            Fisele sunt `shrink-0`, deci nu se strang: ies din pista si pista se
            deruleaza.
          */}
          <div className="flex">
            {CARDS.map((card) => (
              <Card key={card.logo} card={card} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * O fișă din rând.
 *
 * FĂRĂ chenar propriu și FĂRĂ colțuri rotunjite, dinadins: separarea o face o
 * singură linie verticală între două fișe vecine, ca la un tabel dintr-un ziar.
 * Cu chenar de jur împrejur ar fi devenit carduri obișnuite, adică exact ce nu
 * e varianta asta. Prima fișă nu are linie la stânga — acolo e marginea
 * ferestrei, iar o linie lipită de ea ar arăta ca o margine tăiată.
 *
 * Înălțimile ies egale pentru că fișele sunt elemente `flex` și se întind
 * (`stretch`, implicit). De aceea liniile verticale merg de sus până jos pe tot
 * rândul, oricât de diferit ar fi textul.
 */
function Card({ card }: { card: EditorialCard }) {
  return (
    <article
      className={cn(
        /*
          `overflow-hidden` e plasa de siguranta, nu efect: sigla si eticheta din
          capul fisei sunt amandoua `shrink-0`, deci daca vreodata nu incap una
          langa alta (o eticheta mai lunga, alt font incarcat inaintea lui Inter)
          nu se stramteaza niciuna — dau pe afara. Fara `overflow-hidden` textul
          ar trece PESTE linia verticala, in fisa vecina, si ar arata a bug de
          randare; asa se taie curat la muchia fisei. Nu taie nimic astazi, si nu
          are ce taia din greseala: in fisa nu exista nimic focusabil sau iesit
          in relief.
        */
        "flex shrink-0 snap-start flex-col overflow-hidden border-l border-hairline px-5 py-7 first:border-l-0 sm:px-6 sm:py-8",
        CARD_WIDTH,
      )}
    >
      {/*
        Sigla la stanga, categoria la dreapta, intr-o BANDA DE INALTIME FIXA.

        Inaltimea fixa nu e cosmetica, e ce tine randul aliniat. `LOGO_AREA.tile`
        egalizeaza SUPRAFATA siglelor, nu inaltimea, deci inaltimile ies foarte
        diferite: Trendyol 19,2px (e un cuvant lat si plat), SmartBill 43,6px (e
        aproape patrata). Fara banda, inaltimea randului de sus ar fi fost data de
        sigla fiecarei fise, iar titlurile a doua fise vecine ar fi pornit la 24px
        una de alta — cu liniile verticale intre ele, decalajul se vede imediat si
        e exact genul de scapare care face un rand editorial sa arate strambat.

        48px, nu 44. 44 e exact cea mai inalta sigla din setul de acum
        (SmartBill, 43,6) si nu lasa nimic: la `tile` mai sunt patru sigle in
        `logos.ts` peste 44 — Colete Online 51,6, TikTok 46,8, Woot 46,5, Google
        Analytics 44,4 — si oricare dintre ele, pusa in `CARDS`, ar fi crescut
        banda peste vecine si ar fi desfacut tocmai alinierea de mai sus.

        `max-h-full` e chinga care face banda sa castige oricum: `Logo` scrie
        inaltimea pe `style`, deci fara ea o sigla mai inalta nu e taiata de
        nimic (banda n-are `overflow`) — ar iesi pur si simplu peste titlu. Cu
        ea, `object-contain` o micsoreaza pana intra. Iese ceva mai mica decat
        vecinele, dar la locul ei; e degradarea corecta.

        `items-center`, nu `items-start`: aliniate sus, o sigla de 19px si una de
        44px si-ar avea centrele optice la 12px distanta si ar parea puse la
        intamplare pe verticala. Centrate in aceeasi banda, se citesc ca un rand.

        `maxWidth={88}` nu e stil, e plasa. La 320px fisa are 243px, minus 40 de
        margini raman 203 pentru continut. Cazul cel mai strans e chiar fisa
        Trendyol: sigla ei iese de 83,4px lata, iar „[MARKETPLACE]" cere ~97px la
        10px cu spatiere — 83,4 + 12 + 97 = 192, deci mai raman 11px. Fara plasa,
        o sigla lata (About You are raportul 9,13, adica 120px la suprafata asta)
        ar fi impins eticheta afara din fisa.
      */}
      <div className="flex h-12 items-center justify-between gap-3">
        <Logo
          k={card.logo}
          area={LOGO_AREA.tile}
          maxWidth={88}
          className="max-h-full"
        />
        {/*
          Parantezele drepte sunt scrise in text, nu desenate cu pseudo-elemente:
          asa raman in continutul copiat si nu se pierd la citirea cu voce tare.
        */}
        <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          [{card.category}]
        </span>
      </div>

      {/*
        Distanta pana la titlu e fixa, nu `mt-auto`. Cu `mt-auto` toate titlurile
        s-ar fi lipit de baza fisei celei mai inalte si ar fi ramas un gol mare
        sub sigle. Asa golul cade jos, unde se citeste ca aer.

        Ca titlurile sa porneasca chiar de la aceeasi inaltime, distanta fixa nu
        ajunge singura: trebuie ca si banda de deasupra sa aiba inaltime fixa.
        Vezi `h-12` mai sus — daca dispare de acolo, se strica si aici.
      */}
      <h3 className="mt-8 text-[17px] font-semibold leading-[1.25] tracking-[-0.015em] text-ink sm:text-[18px]">
        {card.title}
      </h3>

      <p className="mt-2.5 text-[13.5px] leading-[1.55] text-ink-2 sm:text-[14px]">
        {card.description}
      </p>
    </article>
  );
}
