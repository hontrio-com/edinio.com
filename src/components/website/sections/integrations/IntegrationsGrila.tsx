import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LOGO_AREA, type LogoKey } from "@/lib/website/logos";
import { Logo } from "./Logo";

/**
 * Integrările, în două coloane: argumentul la stânga, mozaicul de sigle la
 * dreapta, într-o ramă punctată.
 *
 * Secțiunea spune un singur lucru — „nu trebuie să construiești nimic din
 * astea" — și îl spune de două ori, în două limbaje: în stânga cu propoziții,
 * în dreapta cu mărcile pe care omul le recunoaște fără să citească. De aceea
 * cele două coloane sunt egale și nu una principală cu o ilustrație lângă ea.
 *
 * Totul e static: fără stare, fără efecte, fără nimic care apare abia după
 * hidratare sau abia la derulare. Componentă de server, dinadins.
 */

/**
 * Culoarea liniei punctate din jurul mozaicului.
 *
 * NU `--color-hairline` (#EAEAEE), deși aia e culoarea liniilor noastre de 1px.
 * O linie PUNCTATĂ are cam jumătate din lungime goală, deci la aceeași culoare
 * cântărește vizibil mai puțin decât una continuă și se pierde pe alb. #DCDCE3
 * e același ton dus destul de închis cât să ajungă la aceeași diferență de
 * luminanță. E valoarea folosită și la cardurile din „Soluția"
 * (`Features.tsx`), pentru exact același motiv — dacă se schimbă una, se
 * schimbă amândouă.
 */
const DASH_ON_WHITE = "#DCDCE3";

/**
 * Verdele bifelor.
 *
 * NU `--color-brand` (#1AB554): pe alb are 2,6:1, adică sub pragul de citire
 * pentru un semn de 16px desenat din linii subțiri. #12874A e același verde dus
 * mai închis, la 5,1:1. Verdele plin rămâne rezervat butonului principal din
 * hero — aici e doar un accent de contur, nu o suprafață.
 */
const GREEN_ON_WHITE = "#12874A";

/**
 * Siglele din mozaic — DOUĂSPREZECE, și numărul nu e ales din ochi.
 *
 * Grila are 2 coloane pe telefon, 3 de la `sm` și 4 de la `lg`. 12 se împarte
 * exact la 2, la 3 și la 4, deci mozaicul iese dreptunghi plin la ORICE lățime:
 * 6x2, 4x3, 3x4. Cu 16 sigle (cealaltă variantă evidentă) rândul de la `sm` ar
 * fi rămas cu o singură casetă atârnată, iar tabla de șah s-ar fi văzut ciobită
 * exact pe tabletă.
 *
 * Alese câte una-trei din fiecare dintre cele șapte grupuri din `LOGO_GROUPS`,
 * ca ochiul să prindă că nu e o listă de curieri: sunt curieri ȘI plăți ȘI
 * facturi ȘI marketing.
 *
 * Ordinea urmează grupurile, dar NU te aștepta ca un rând să fie o categorie.
 * Nici nu poate fi: șapte grupuri nu se împart în trei rânduri, iar câte rânduri
 * ies depinde oricum de lățime. Ordinea grupurilor face doar ca mărcile înrudite
 * să cadă în aceeași zonă a mozaicului, nu împrăștiate prin el: curierii sus,
 * marketingul jos. Atât se citește, și atât e adevărat la orice lățime.
 */
const MOZAIC: LogoKey[] = [
  "fanCourier",
  "sameday",
  "dpd",
  "stripe",
  "netopia",
  "smartbill",
  "oblio",
  "mailchimp",
  "notice",
  "olx",
  "googleAnalytics",
  "facebookPixel",
];

/**
 * Lățimea maximă a unei sigle în casetă.
 *
 * Cea mai lată din `MOZAIC` iese la 65px (Netopia, raport 2,65), iar caseta cea
 * mai mică are ~105px — deci 72 nu taie nimic azi. E o plasă pentru mâine: dacă
 * cineva pune aici About You (raport 9,13), fără limită sigla ar ieși de 121px
 * lățime și ar sparge caseta. Vezi nota de la `maxWidth` din `Logo.tsx`.
 */
const LOGO_MAX_WIDTH = 72;

const AFIRMATII = [
  "Peste 25 de integrări, pregătite din prima zi",
  "Le activezi cu un comutator, fără programator",
  "Cheile rămân ale tale, în conturile tale la furnizori",
  "Poți folosi mai multe deodată: doi curieri, trei metode de plată",
];

/**
 * E caseta de pe poziția `index` cea închisă la culoare, într-o grilă cu
 * `coloane` coloane?
 *
 * ═══ DE CE PRIMEȘTE NUMĂRUL DE COLOANE CA ARGUMENT ═══
 *
 * Tabla de șah nu e o proprietate a casetei, e o proprietate a POZIȚIEI ei în
 * grilă: `(rând + coloană) % 2`. Iar rândul și coloana se schimbă când se
 * schimbă numărul de coloane — aceeași casetă e albă pe telefon și gri pe
 * desktop.
 *
 * Deci o alternanță calculată o singură dată, după index, e corectă pe fix o
 * lățime de ecran și greșită pe celelalte două. Capcana e că pe 4 coloane iese
 * chiar tabla așteptată, așa că se verifică pe desktop, arată bine, și rămâne
 * stricat pe telefon — unde alternanța devine două casete gri lipite pe
 * diagonală, adică dungi, nu tablă.
 *
 * Aici se calculează de TREI ori, o dată pentru fiecare prag, iar rezultatele
 * pleacă drept trei perechi de clase Tailwind: `bg-*`, `sm:bg-*`, `lg:bg-*`.
 * Fiecare prag pictează TOATE casetele, și albe și gri — dacă `sm` ar spune
 * doar care se închid, cele închise de pragul de dedesubt ar rămâne închise
 * degeaba. Suprascrierea ține fiindcă Tailwind scoate variantele de lățime în
 * ordine crescătoare, după cele fără prefix; de asta pragurile sunt cele cu
 * nume (`sm`, `lg`) și nu `min-[...]` arbitrare.
 *
 * Dacă schimbi numărul de coloane la vreun prag, schimbă-l în DOUĂ locuri:
 * `grid-cols-*` de mai jos și argumentul dat aici.
 */
function esteInchisa(index: number, coloane: number): boolean {
  const rand = Math.floor(index / coloane);
  const coloana = index % coloane;
  return (rand + coloana) % 2 === 1;
}

export function IntegrationsGrila() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        {/*
          `minmax(0,1fr)` de doua ori, nu `grid-cols-2`. Pista implicita `1fr` e
          de fapt `minmax(auto,1fr)`, adica nu coboara sub latimea minima a
          continutului — iar continutul de aici are sigle cu latime fixa in
          pixeli. Cu `auto`, la o latime stramta coloana impinge grila peste
          marginea paginii si apare bara de derulare orizontala. Aceeasi solutie
          ca la cardurile din `Features.tsx`.

          `grid-cols-1` la baza NU e de umplutura. Un `grid` fara `grid-cols-*`
          la latimea de baza are o pista `auto`, iar minimul unei piste `auto` e
          min-content-ul copiilor, nu latimea containerului — deci `lg:` cu
          `minmax(0,...)` apara desktopul si lasa telefonul descoperit. Exact
          familia asta de defecte a scos paginile de magazin din ecran
          (`49581f2`). Aici nimic nu depaseste azi (cel mai lat min-content e
          mozaicul, ~188px), dar plafonul costa o clasa si tine si maine, cand
          cineva schimba siglele.

          `items-center`: coloana din stanga e mai inalta decat mozaicul (~600px
          fata de ~420px), iar lipit de sus mozaicul ar fi lasat un gol mare
          dedesubt, care se citeste ca spatiu ramas, nu ca aer.
        */}
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          {/* ══ STANGA: argumentul ══ */}
          <div>
            {/*
              Eticheta sta intr-o pastila cu chenar subtire, nu in
              `SectionEyebrow`. Cele doua nu sunt interschimbabile: eyebrow-ul e
              o PERECHE („Problema" / „Solutia"), iar folosit aici i-ar fi
              adaugat un al treilea membru care nu raspunde la nimic si ar fi
              rupt perechea.

              Pastila e monocroma dinadins — fara fond colorat, fara iconita,
              fara inel. Exact alea au fost scoase de client de la eyebrow
              („e mai simplist si premium asa"), si din acelasi motiv nu se
              intorc aici.

              Litera e 13px cu `tracking` 0,18em, adica EXACT scara din
              `SectionEyebrow`, nu una mai mica fiindca sta intr-o pastila.
              Amandoua sunt aceeasi piesa — un cuvant marunt cu majuscule
              deasupra unui titlu — iar clientul a cerut numeric marimea asta
              (2026-08-06: „mareste putin mai mult, sunt mult prea mici, si fa o
              spatiere intre litere"). La 12px/0,14em pastila se intorcea fix la
              ce fusese reclamat, doar cu un chenar pe deasupra.

              `pe-3.5` langa `ps-4`: `tracking` adauga spatiere si DUPA ultima
              litera, unde nu mai urmeaza nimic. La 13px, 0,18em inseamna ~2,3px
              care se aduna peste marginea din dreapta si descentreaza vizibil
              cuvantul in pastila.
            */}
            <p className="inline-flex items-center rounded-full border border-hairline bg-white py-1.5 ps-4 pe-3.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-ink-3">
              Integrări
            </p>

            {/*
              Cele doua randuri sunt `block`, nu despartite cu `<br>`, ca sa
              ramana DOUA randuri si nu doua randuri plus ruperile naturale ale
              browserului in mijlocul lor.

              Sunt scurte dinadins, si e o masuratoare, nu un gust. Coloana din
              stanga e cea mai ingusta la 1024px: 448px. La 44px bold cu
              `tracking` -0,03em, un rand de 22 de caractere („Tot ce folosesti
              deja,", prima incercare) cere ~440px — adica trecea la limita si
              se rupea la primul cuvant mai lung. Randurile de acum cer ~345 si
              ~240px, deci incap si la 1024, si la 320px pe telefon, unde titlul
              e de 32px si coloana are 280.

              Daca schimbi textul, tine randul cel mai lung sub ~18 caractere.
            */}
            <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
              <span className="block">Nu le programezi.</span>
              <span className="block">Le pornești.</span>
            </h2>

            {/*
              Descrierea se opreste la „ce folosesti" si NU mai continua cu „si
              pui datele contului tau", desi asa suna mai complet. Fraza aia
              spune acelasi lucru cu a treia afirmatie de dedesubt („Cheile
              raman ale tale"), care se vede in acelasi ecran, la 100px sub ea.
              Doua formulari ale aceleiasi idei, una langa alta, nu intaresc
              ideea — o fac sa para umplutura.

              Are si o urmare masurabila: la 1024px coloana are 448px, iar la
              18px varianta lunga cadea in patru randuri. Acum sunt trei, cat a
              cerut brieful.
            */}
            <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
              Curieri, plăți online, facturare, marketing și marketplace-uri:
              peste 25 de integrări scrise și întreținute de noi. Tu alegi doar
              ce folosești.
            </p>

            {/*
              Golul dinaintea listei e mare dinadins (56px pe desktop). Lista nu
              continua descrierea, e altceva: descrierea explica, lista promite.
              La distanta obisnuita de 20-24px s-ar fi citit ca al doilea
              paragraf al aceleiasi idei.

              Liniile: fiecare element are `border-b`, deci iese linie INTRE
              elemente si una SUB ultimul, dar niciuna deasupra primului. Acolo o
              linie ar fi inchis lista ca pe un tabel si ar fi despartit-o de
              descriere de doua ori — o data prin gol, inca o data prin linie.
            */}
            <ul className="mt-10 lg:mt-14">
              {AFIRMATII.map((afirmatie) => (
                <li
                  key={afirmatie}
                  className="flex items-start gap-3 border-b border-hairline py-4"
                >
                  {/*
                    `items-start` plus `mt-[3px]`: bifa are 16px, un rand de
                    text are 23px. Centrata pe bloc, la afirmatia care se rupe in
                    doua randuri pe telefon ar fi coborat la mijlocul blocului,
                    adica langa nimic. Asa ramane mereu langa PRIMUL rand, iar
                    cei 3px o aseaza exact pe axa lui.

                    `aria-hidden`: bifa nu adauga informatie: textul de langa ea
                    spune deja tot. Citita, ar fi pus un „check" inaintea
                    fiecarei propozitii.
                  */}
                  <Check
                    className="mt-[3px] h-4 w-4 shrink-0"
                    strokeWidth={3}
                    style={{ color: GREEN_ON_WHITE }}
                    aria-hidden
                  />
                  <span className="text-[15px] leading-[1.55] text-ink-2 sm:text-[16px]">
                    {afirmatie}
                  </span>
                </li>
              ))}
            </ul>

            {/*
              Buton cu chenar, nu verde plin: verdele plin e al butonului
              principal din hero, iar o sectiune de la mijlocul paginii care i-ar
              face concurenta ar slabi exact actiunea care conteaza. Aceleasi
              masuri ca butoanele din `Features.tsx`, ca sa se citeasca drept
              acelasi element, nu drept inca un fel de buton.

              Nu are `min-w`: acolo erau cinci butoane vazute unul dupa altul la
              derulare si trebuiau sa iasa la fel de late. Aici e unul singur,
              deci se strange pe continut.
            */}
            <Link
              href="/integrari"
              className="group mt-8 inline-flex h-11 items-center justify-center gap-1.5 rounded-[8px] border border-hairline px-5 text-[14.5px] font-medium text-ink transition-colors duration-200 hover:bg-tint-2"
            >
              Vezi toate integrările
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* ══ DREAPTA: mozaicul ══ */}
          {/*
            Rama e limitata in latime cat timp coloanele sunt stivuite, si e o
            socoteala, nu o preferinta. Casetele sunt patrate si isi iau latimea
            din grila, deci pe o tableta de 768px o rama pe toata latimea ar fi
            dat casete de 228px cu o sigla de 40px in mijloc: sigla s-ar fi
            pierdut, iar mozaicul ar fi ajuns mai inalt decat tot textul de
            deasupra lui.

            Limita de la baza e 316, nu 380, si e tot socoteala aia dusa pana la
            capat. Pe doua coloane caseta creste cu jumatate din fiecare pixel
            de latime, deci pe banda de baza — care tine pana la 640, nu pana la
            capatul telefoanelor — ajungea la 177px la 639. Adica exact defectul
            de mai sus, doar mai mic: sigla se deseneaza la `LOGO_AREA.tile`,
            adica ~40px fix, si intr-o caseta de 177 acopera 23% din latimea ei,
            fata de 62% in caseta de 105px de la 1024. Aceeasi sigla, de trei ori
            mai pierduta, si nu la o latime exotica — 600-639px inseamna telefon
            in peisaj si iPad in ecran impartit.

            316 e ales ca sa dea EXACT caseta de la `sm`: (316 - 2px chenar -
            24px margine) / 2 = 145, iar de la 640 in sus e 144,7. Deci caseta nu
            mai sare la trecerea pragului, iar pe toata pagina sta intre 105 si
            145px. Masurat: 127px la 320 (acolo latimea reala e sub plafon, deci
            decide `w-full`), 145 de la 356 la 639, 145 intre 640 si 1023, 105
            la 1024, 127 de la 1440 in sus.

            Are si o urmare pe inaltime: 12 casete pe doua coloane inseamna sase
            randuri, deci mozaicul e de trei ori mai inalt decat lat. La 177px
            caseta iesea un turn de 1088px — mai inalt decat tot textul de
            deasupra (~540px la 639) si peste doua ecrane de telefon. La 145
            ramane 896. Turnul e in natura formei cerute (doua coloane pe
            telefon); singurul lucru care l-ar scurta cu adevarat e a treia
            coloana mai devreme, si aia schimba brieful, nu un defect.

            De la `lg` limita cade: acolo latimea o da coloana, care e oricum
            intre 448 si 536px.
          */}
          <div
            className="mx-auto w-full max-w-[316px] rounded-[16px] border border-dashed p-3 sm:max-w-[460px] lg:max-w-none"
            style={{ borderColor: DASH_ON_WHITE }}
          >
            {/*
              Razele sunt concentrice, nu alese de mana: 16 afara, minus cei 12px
              de spatiu, da 4 inauntru. Cand raportul asta se strica, coltul
              interior pare ori prea ascutit, ori umflat fata de cel de afara.
              Daca schimbi marginea (`p-3`), schimba si `rounded-[4px]`.

              `overflow-hidden` e ce rotunjeste mozaicul: casetele n-au colturi
              proprii — sunt lipite una de alta, fara spatiu intre ele — deci
              cele patru din colturi sunt taiate de blocul din jur. Asa
              rotunjirea ramane corecta oricate coloane ar fi.
            */}
            <div className="grid grid-cols-2 overflow-hidden rounded-[4px] sm:grid-cols-3 lg:grid-cols-4">
              {MOZAIC.map((cheie, index) => (
                <div
                  key={cheie}
                  className={cn(
                    "flex aspect-square items-center justify-center p-2",
                    /*
                      Trei perechi de clase, cate una pentru fiecare prag. Vezi
                      `esteInchisa` pentru de ce nu merge o singura alternanta si
                      de ce fiecare prag scrie si albul, nu doar grinul.
                    */
                    esteInchisa(index, 2) ? "bg-tint-2" : "bg-white",
                    esteInchisa(index, 3) ? "sm:bg-tint-2" : "sm:bg-white",
                    esteInchisa(index, 4) ? "lg:bg-tint-2" : "lg:bg-white",
                  )}
                >
                  <Logo
                    k={cheie}
                    area={LOGO_AREA.tile}
                    maxWidth={LOGO_MAX_WIDTH}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
