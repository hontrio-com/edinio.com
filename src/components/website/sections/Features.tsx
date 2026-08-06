import Link from "next/link";
import { ArrowRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  FEATURE_CARDS,
  FEATURE_IMAGE_WIDTHS,
  type FeatureCard,
} from "@/lib/website/features";
import { FeatureStack } from "./FeatureStack";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * Secțiunea de funcții: carduri late, care se strâng în teanc la derulare.
 *
 * Fiecare card e `sticky`, așa că se oprește sub bara de sus și următorul urcă
 * peste el. Lipirea e pură CSS. Cel rămas dedesubt se duce în spate și se
 * înclină, iar partea asta cere puțin JavaScript: `FeatureStack` scrie o
 * variabilă, `--covered`, iar desenul îl face tot foaia de stil. Am încercat
 * întâi fără niciun JavaScript, cu `animation-timeline: view()`, dar nu merge
 * peste `sticky`; motivele sunt scrise pe larg în `globals.css`.
 *
 * Adâncimea nu e o micșorare aleasă de mână, ci o deplasare pe `Z` într-o
 * perspectivă: cardul chiar se duce în spate, iar cât se micșorează decide
 * perspectiva. De aceea marginile rămân drepte și nu pare o poză scalată.
 */

/**
 * De la ce înălțime se lipesc cardurile: bara de sus plus o respirație.
 *
 * TOATE se lipesc la aceeași înălțime, dinadins. Aveau un decalaj de 16px pe
 * card, ca să se vadă marginile celor de dedesubt ca un teanc de hârtii — și
 * arăta bine pe desktop, unde erau doar două-trei vizibile odată. Pe telefon, cu
 * cardurile mult mai înalte, ieșeau patru margini una peste alta cu textul lor
 * pe jumătate stins transpărând prin cardul activ. Clientul a trimis captura; nu
 * era o eroare, era desenul dus la o lățime pentru care nu fusese gândit.
 *
 * Acum fiecare card îl acoperă complet pe cel dinainte. Se vede un singur card,
 * cel activ.
 *
 * ═══ TEANCUL E DOAR DE LA `lg` ÎN SUS ═══
 *
 * Pe telefon cardurile curg normal, una sub alta, și NU e o simplificare de
 * comoditate: un card pinat care e mai înalt decât fereastra nu poate fi văzut
 * întreg, oricât ai derula. Stă agățat la `top`, iar tot ce trece de marginea de
 * jos rămâne acolo. Măsurat, cu cardurile așa cum arată acum:
 *   iPhone 14 (390x844)  — 91px sub ecran
 *   Android (360x800)    — 113px
 *   iPhone SE (375x667)  — 257px
 * De fiecare dată ce se pierdea era exact butonul cardului.
 *
 * Nu se rezolvă strângând spațierea: pe ecranul mic ar însemna să tai un sfert din
 * card. Și nu se rezolvă nici coborând `top`, fiindcă 96px nu acoperă nici măcar
 * cazul cel mai bun. Singurul lucru care le rezolvă pe toate deodată, la orice
 * mărime de telefon de acum și de mai târziu, e ca pe telefon cardul să nu fie
 * pinat. Efectul rămâne unde chiar funcționează.
 */
const STACK_TOP = 96;

/**
 * Culoarea ramei punctate din jurul cardului.
 *
 * NU `--color-hairline` (#EAEAEE), deși aia e culoarea liniilor noastre de 1px.
 * O linie PUNCTATĂ are cam jumătate din lungime goală, deci la aceeași culoare
 * cântărește vizibil mai puțin decât una continuă și se pierde pe alb. #DCDCE3 e
 * același ton, dus destul de închis cât să ajungă la aceeași diferență de
 * luminanță pe care o are rama modelului, ~36.
 */
const DASH_ON_WHITE = "#DCDCE3";

export function Features() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-28 lg:pb-36">
        <div className="mx-auto max-w-[720px] text-center">
          {/*
            Perechea etichetei rosii de mai sus. Acelasi desen, alt ton: asa se
            citeste ca sectiunea asta raspunde la cea dinainte, nu ca incepe alt
            subiect. De aceea nu mai scrie „Ce face platforma".
          */}
          <SectionEyebrow label="Soluția" />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            Un mod mai simplu de a vinde online.
          </h2>
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            Edinio pune cap la cap tot ce ai nevoie, astfel încât magazinul tău să
            funcționeze simplu pentru tine și pentru clienții tăi.
          </p>
        </div>

        <div className="mt-14 lg:mt-20">
          {/*
            Cardurile raman frati directi, intr-un singur container. Asa fiecare
            se poate lipi pe toata inaltimea listei si se aduna in teanc. Bagate
            fiecare in propriul invelis cu inaltime proprie, lipirea moare: un
            element `sticky` se misca doar in cutia parintelui.
          */}
          <FeatureStack>
            {FEATURE_CARDS.map((card, index) => (
              <div
                key={card.id}
                className="feature-slot lg:sticky"
                style={{ top: STACK_TOP }}
              >
                <Card
                  card={card}
                  last={index === FEATURE_CARDS.length - 1}
                  /* Al doilea, al patrulea... au imaginea in stanga. Vezi `Card`. */
                  flipped={index % 2 === 1}
                />
              </div>
            ))}
          </FeatureStack>
        </div>
      </div>
    </section>
  );
}

/**
 * Un card de funcție.
 *
 * ═══ DESENUL ═══
 *
 * Sunt trei straturi, unul in altul, si asta e tot secretul:
 *
 *   1. Rama punctata, alba, cu colturi de 16px. Doar o rama - nu are continut.
 *   2. La 7px inauntru, un bloc cu colturi de 10px, taiat (`overflow-hidden`).
 *   3. In bloc, doua jumatati LIPITE: textul si imaginea pana in margine. Nu au
 *      colturi proprii; le taie blocul de deasupra.
 *
 * Razele sunt concentrice, nu alese de mana: 16 afara, minus 7 de spatiu, da 9
 * inauntru (rotunjit la 10). Cand raportul asta se strica, coltul interior pare
 * ori prea ascutit, ori umflat fata de cel exterior.
 *
 * Faptul ca blocul din mijloc taie totul rezolva singur si telefonul: acolo
 * jumatatile se aseaza una sub alta, iar rotunjirea trece de la stanga/dreapta la
 * sus/jos fara nicio regula in plus.
 *
 * ═══ TOTUL E ALB ═══
 *
 * Modelul isi pune panoul cu text pe un gri, si o vreme l-am avut si noi. Clientul
 * l-a scos (2026-08-06): din model raman DOAR rama punctata si insignele bifelor,
 * restul revine la alb, ca in tot site-ul. Deci nu cauta separarea intre cele doua
 * jumatati - nu exista, o face doar imaginea. Si nu pune inapoi pastila alba de
 * sub bife: fara fond gri n-ar avea pe ce sa se vada, iar acum insigna verde e ea
 * insasi semnul.
 *
 * ═══ BIFELE STAU JOS ═══
 *
 * `justify-between`: titlul si descrierea sus, bifele si butonul jos. Nu e o
 * asezare decorativa - inaltimea jumatatii cu text o da imaginea de langa, iar
 * daca lista ar curge imediat sub descriere ar ramane un gol mare dedesubt.
 * Asa golul e la mijloc, unde se citeste ca aer, nu ca spatiu ramas.
 *
 * ═══ SE SCHIMBA PARTEA LA FIECARE AL DOILEA ═══
 *
 * `flipped` muta imaginea in stanga. Doar de la `lg` in sus; pe telefon textul
 * ramane INTOTDEAUNA primul, altfel unele carduri s-ar deschide cu o poza fara
 * sa spuna despre ce e vorba.
 */
function Card({
  card,
  last,
  flipped,
}: {
  card: FeatureCard;
  last: boolean;
  flipped: boolean;
}) {
  return (
    <article
      data-feature-card
      className={cn(
        "feature-card feature-card-shadow rounded-[16px] border border-dashed bg-white p-[7px]",
        /*
          Distanta dintre carduri da si distanta de derulare dintre ele.

          Era 24px pe telefon si 32 pe desktop; acum 32 peste tot, si nu din
          simetrie. Pe telefon cardul la rand se ridica 16px, deci cusatura dintre
          doua carduri oscileaza intre 32+16 si 32-16. La 24 de baza ar fi coborat
          la 8px, iar doua rame punctate la 8px una de alta arata inghesuit.
          Vezi `.rand-live` in globals.css.
        */
        !last && "mb-8",
      )}
      style={{ borderColor: DASH_ON_WHITE }}
    >
      {/*
        Coloanele NU sunt egale: imaginii ii revine 1,12 din 2, textului 0,88.

        Imaginea trebuie sa incapa intreaga pe inaltimea data de textul de langa
        (motivul e la `ImagePanel`), iar inaltimea aia depinde de cat text e. Cu
        bifele pe o coloana pe PC, cardul are ~490px, iar la coloane egale imaginea
        ramanea cu 28px de gol sus si jos. La 1,12 cade aproape exact pe 4:3.

        Daca se schimba vreodata cate bife stau pe rand, se remasoara si asta —
        raportul depinde direct de inaltimea cardului.

        Sabloanele sunt DOUA, si a fost o eroare prinsa doar masurand: `order`
        schimba unde se ASEAZA jumatatile, nu cat de late sunt coloanele. Pe
        cardurile intoarse imaginea nimerea in coloana ingusta si iesea mai mica
        decat textul. Deci se intoarce si sablonul.
      */}
      {/*
        A DOUA LINIE PUNCTATA sta AICI, pe blocul intreg, nu pe jumatatea cu text.
        Adica doua dreptunghiuri punctate concentrice in jurul cardului, la 7px
        unul de altul, si nimic intre cele doua jumatati.
      */}
      <div
        className={cn(
          "grid overflow-hidden rounded-[10px] border border-dashed",
          flipped
            ? "lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]"
            : "lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]",
        )}
        style={{ borderColor: DASH_ON_WHITE }}
      >
        {/* ── Textul ── */}
        {/*
          Fara chenar si fara colturi proprii: linia punctata interioara e pe
          blocul din jur, iar tot el taie colturile. Asa rotunjirea trece singura
          de la stanga/dreapta la sus/jos cand jumatatile se aseaza una sub alta.
        */}
        <div
          data-card-text
          className={cn(
            /* Marginea scade in doi pasi pe masura ce ecranul se ingusteaza, ca
               bifele sa nu se rupa: 32px de la `sm`, 20 pe telefon, 16 sub 360px.
               Fiecare pixel luat de aici se duce in latimea textului. */
            "flex flex-col justify-between bg-white p-4 min-[360px]:p-5 sm:p-8",
            flipped && "lg:order-2",
          )}
        >
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-3">
              {card.kicker}
            </p>

            <h3 className="mt-4 text-[26px] font-bold leading-[1.14] tracking-[-0.03em] text-ink sm:text-[32px]">
              {card.title}
            </h3>

            <p className="mt-4 text-[15px] leading-[1.6] text-ink-2 sm:text-[16px]">
              {card.description}
            </p>
          </div>

          <div className="mt-10 lg:mt-8">
            {/*
              Insigna verde e un fisier, nu o pictograma desenata de noi: e ceea ce
              a ales clientul (icons8, „verify"). A fost taiata pe contur - venea
              cu 4px de gol pe fiecare latura din 60, iar cu golul pastrat s-ar fi
              afisat mai mica decat cutia ei si n-ar mai fi cazut la 20px exact.

              Ramane 52px in fisier desi se afiseaza la 20: sunt 1KB, iar la 52 e
              curata si pe ecranele cu densitate dubla sau tripla. `next/image`
              n-ar avea ce optimiza - loaderul proiectului lasa neatinse fisierele
              locale.

              `items-start`, nu `items-center`: insigna are 20px, un rand de text
              are 21px, deci la o linie ies aliniate oricum, iar cand textul se
              rupe in doua randuri pe telefon insigna ramane langa PRIMUL rand, nu
              se centreaza pe bloc.
            */}
            {/*
              O SINGURA COLOANA, PESTE TOT. Clientul a cerut intai doua pe rand pe
              telefon, apoi ca fiecare bifa sa incapa pe UN rand, pe orice telefon.
              Cele doua nu pot coexista, si e o socoteala, nu o parere:

                telefon de 390px, doua coloane -> 111px pentru textul unei bife
                „Recuperare cosuri abandonate" cere 211px la 14,5px
                ca sa incapa in 111px ar trebui scris cu 7,6px

              Deci s-a pastrat cerinta a doua, care e si cea mai recenta si cea mai
              vizibila: pe o coloana fiecare bifa are 258px la 390px, si nu se rupe
              niciuna. Masurat pe 360, 375, 390, 414 si 430: zero randuri sparte.

              Sub 360px (iPhone 5/SE prima generatie, iesit din suport in 2018) nu
              mai incape la 14,5px — acolo scade textul si marginea, vezi mai jos.
            */}
            <ul className="grid grid-cols-1 gap-x-2 gap-y-3.5 sm:gap-x-6">
              {card.checks.map((check) => (
                <li key={check} className="flex items-start gap-2 sm:gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/features/bifa.png"
                    alt=""
                    width={52}
                    height={52}
                    loading="lazy"
                    decoding="async"
                    className="h-5 w-5 shrink-0"
                    aria-hidden
                  />
                  {/* Sub 360px textul scade la 13px: la 14,5 „Recuperare cosuri
                      abandonate" cere 211px si are doar 196, deci s-ar rupe. */}
                  <span className="text-[13px] leading-[1.45] text-ink-2 min-[360px]:text-[14.5px]">
                    {check}
                  </span>
                </li>
              ))}
            </ul>

            {/*
              Butonul e cu chenar, nu verde plin. Cinci butoane verzi, unul sub
              altul la derulare, ar fi concurat cu butonul principal din hero — iar
              ala trebuie sa ramana singurul lucru verde plin de pe pagina.

              ═══ TOATE CINCI AU ACEEASI LATIME ═══

              Fara `min-w` aveau 171, 207, 210, 255 si 278px. Un spread de 107px,
              iar cum le vezi una dupa alta la derulare, aratau ca cinci componente
              diferite. Acum toate ies la 288.

              288 e cea mai lunga eticheta de acum („Vezi cum optimizam magazinul",
              masurata la 278px) plus o rezerva de 10. E socotit, nu rotunjit: daca
              o eticheta o depaseste, butonul ei creste si iese singur din rand —
              `min-w` nu taie textul, doar ridica un minim. Praguri in
              `features.test.ts`.

              Continutul e CENTRAT, nu impins in capete. La etichete atat de
              diferite ca lungime (18-28 caractere), `justify-between` ar fi lasat
              peste 100px de gol intre text si sageata la cea mai scurta, si n-ar
              mai fi aratat a buton. Centrat, sageata sta lipita de text la toate.

              Pe telefon nu se aplica: acolo cardul are 300px de continut si un
              buton de 288 l-ar umple cap la cap. Se strange pe continut.
            */}
            <Link
              href={card.cta.href}
              className="group mt-8 inline-flex h-11 items-center justify-center gap-1.5 rounded-[8px] border border-hairline px-5 text-[14.5px] font-medium text-ink transition-colors duration-200 hover:bg-tint-2 sm:min-w-[288px]"
            >
              {card.cta.label}
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* ── Imaginea ── */}
        <ImagePanel card={card} flipped={flipped} />
      </div>
    </article>
  );
}

/**
 * Jumătatea cu imaginea: fără casetă, fără chenar, fără lumina verde de
 * dedesubt — ca la model, imaginea E jumătatea, nu ceva pus într-o ramă.
 *
 * ═══ DE CE `object-contain` ȘI NU `object-cover` ═══
 *
 * La model imaginea umple jumătatea până în toate cele patru margini, iar prima
 * variantă făcea la fel. Măsurat însă, tăia 22% din lățimea imaginii — la cardul
 * cu integrări dispărea eticheta „+25 Integrări". Nu e o alegere de reglaj, e o
 * ciocnire de formate: imaginea lor e PORTRET (960x1200) într-o casetă lată, deci
 * pierde de sus și de jos, unde un peisaj nu are nimic de spus. Ale noastre sunt
 * 4:3 ORIZONTALE într-o casetă mai înaltă decât lată, deci pierd din laturi — iar
 * acolo stă tot ce arată macheta. Verificat pe fișiere: la patru din cinci
 * conținutul ajunge până în muchie, nu există margine de sacrificat.
 *
 * Așa că imaginea intră întreagă. Coloana ei e făcută dinadins mai lată (1,12 din
 * 2), ca 4:3 să iasă aproape exact pe înălțimea dată de textul de alături: rămân
 * ~19px sus și ~19px jos. Banda e ALBĂ fiindcă toate cele cinci imagini au
 * muchiile aproape albe (#FA–#FF măsurat), deci nu se vede unde se termină
 * imaginea și începe cardul.
 *
 * `aspect-[4/3]` rămâne pe telefon, unde jumătățile stau una sub alta și nimic
 * n-ar da înălțimea; acolo imaginea umple caseta exact, fără bandă.
 *
 * Cât imaginea lipsește, caseta scrie ce trebuie să conțină, ca ideea să nu se
 * piardă până vine fișierul.
 */
function ImagePanel({ card, flipped }: { card: FeatureCard; flipped: boolean }) {
  return (
    <div
      className={cn(
        "relative aspect-[4/3] bg-white lg:aspect-auto",
        flipped && "lg:order-1",
      )}
    >
      {card.image.base ? (
        /*
          `<img>` simplu, nu `next/image`, si asta e o decizie, nu o scapare.

          Loader-ul proiectului lasa neatinse imaginile locale — trece prin el
          doar ce e pe R2 — deci `next/image` nu producea NICIUN `srcset` pentru
          ele: fiecare telefon descarca masterul intreg si il afisa la 280px.
          Cu `<img>` scriem noi `srcSet`-ul si browserul alege marimea potrivita.

          `sizes` e SOCOTIT, nu ghicit: imaginea nu sta intr-o caseta cu marginile
          ei, ci ia 56% din latimea cardului.
            latime continut = min(100vw, 1200) - marginile paginii
            latime imagine  = (continut - 14) x 0,56   la `lg`, sau tot randul sub el
          Marginile paginii: 40px sub 640, 48px pana la 1024, 64px peste. Cei 14px
          sunt rama punctata a cardului, 7 de fiecare parte.
          Iese: 306px pe un telefon de 360, 961px la 1023 (cel mai lat, cardul e
          inca pe o coloana), 628px de la 1280 in sus.

          `width`/`height` raman puse: fara ele browserul nu stie raportul pana nu
          vine fisierul si, la o retea proasta, layoutul sare.
        */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${card.image.base}-1080.webp`}
          srcSet={FEATURE_IMAGE_WIDTHS.map(
            (width) => `${card.image.base}-${width}.webp ${width}w`,
          ).join(", ")}
          sizes="(min-width: 1280px) 628px, (min-width: 1024px) 53vw, (min-width: 640px) calc(100vw - 62px), calc(100vw - 54px)"
          alt={card.image.alt}
          width={1440}
          height={1080}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <ImageIcon className="h-6 w-6 text-ink-3" strokeWidth={1.5} />
          <span className="text-[13px] font-medium text-ink-2">
            {card.image.hint}
          </span>
          <span className="text-[11px] text-ink-3">4:3 orizontal</span>
        </div>
      )}
    </div>
  );
}
