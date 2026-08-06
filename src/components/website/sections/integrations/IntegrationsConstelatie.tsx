import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { type LogoKey } from "@/lib/website/logos";
import { Logo } from "./Logo";

/**
 * Integrările, ca o constelație: platforma în mijloc, serviciile în jurul ei.
 *
 * Antetul e centrat — pastilă, titlu pe două rânduri, descriere, buton — iar sub
 * el stă compoziția: un cerc mare aproape negru cu sigla Edinio, înconjurat de
 * bule albe cu siglele furnizorilor, împrăștiate neregulat.
 *
 * ═══ CUM STĂ ÎN PICIOARE LA ORICE LĂȚIME ═══
 *
 * Toată dificultatea variantei ăsteia e că o compoziție liberă nu are cum să se
 * „așeze" singură pe un ecran de 320px. Așa că nimic nu e lăsat la voia
 * întâmplării:
 *
 *   1. Pozițiile bulelor sunt în PROCENTE din scenă, deci se strâng odată cu ea.
 *   2. Mărimile vin din două variabile puse pe scenă, `--bula` și `--nucleu`,
 *      rescrise la fiecare prag. Nu sunt scrise pe fiecare bulă, fiindcă
 *      valorile calculate în JavaScript n-ar ajunge niciodată în foaia de stil:
 *      Tailwind citește clasele din sursă ca text, deci `sm:[--x:${ceva}]` nu
 *      generează nimic. Din același motiv POZIȚIILE sunt aceleași pe telefon și
 *      pe ecran mare — ele trec prin `style`, iar `style` nu are praguri.
 *   3. Scena e capată de `max-w-*` sub lățimea disponibilă la FIECARE prag
 *      (440 < 500-40, 560 < 640-48, 680 < 768-48, 820 < 1024-64). Adică de la
 *      500px în sus scena are o lățime FIXĂ, nu una fluidă — de aceea mărimile
 *      de acolo sunt numere exacte, nu `clamp()`. Doar sub 500px scena e fluidă
 *      (280→360px) și doar acolo e nevoie de `clamp()`.
 *
 * ═══ DE CE UN PRAG LA 500px, ȘI NU DIRECT `sm` ═══
 *
 * Compoziția întreagă pornea la `sm` (640px), iar scena rămânea până acolo un
 * pătrat de cel mult 360px. Între 480 și 639 asta lăsa până la 239px de lățime
 * NEFOLOSITĂ: antetul se întindea pe tot rândul, iar sub el stătea un pătrat mic
 * cu cinci bule. Nu e o lățime teoretică — acolo cad telefoanele pliabile
 * deschise (Z Fold: 585-674px), ecranul împărțit în două și ferestrele de
 * browser trase îngust.
 *
 * `min-[500px]` e cel mai devreme prag la care încape compoziția de zece bule:
 * la 500 lățimea utilă e 460, iar scena de 440 e exact varianta de la `sm`
 * micșorată (aceleași fracțiuni: bulă/scenă 0,139, nucleu/scenă 0,268), deci
 * marjele sunt cele de la `sm` înmulțite cu 440/560.
 *
 * Pragul trebuie să rămână ACELAȘI și pentru variabilele scenei, și pentru
 * dezvăluirea bulelor din `BULE`. Dacă îl muți într-un loc și nu în celălalt,
 * cele zece bule ajung într-o scenă pătrată cu mărimile de telefon și se calcă.
 *
 * Ordinea în foaia de stil e verificată, nu presupusă: Tailwind v4 așază
 * `min-[500px]` ÎNAINTEA lui `sm`, deci `sm:` îl rescrie corect de la 640 în sus.
 *
 * Geometria a fost verificată numeric la 320, 340, 360, 375, 390, 414, 480, 499,
 * 500, 560, 639, 640, 768, 1024 și 1920: nicio bulă nu iese din scenă, niciuna
 * nu atinge nucleul, niciuna nu atinge alta. Cele mai mici marje rămase sunt
 * 5,6px față de marginea scenei (la 320px), 14,5px față de nucleu și 16,6px
 * între două bule (amândouă la 500px). Dacă muți o valoare din `BULE`, din
 * `--bula` sau din `--nucleu`, REFĂ socoteala — sunt legate între ele și se
 * strică tăcut.
 *
 * Plus o plasă de siguranță: `overflow-hidden` pe secțiune. Nu ține loc de
 * socoteală, dar garantează că pagina nu capătă niciodată derulare orizontală.
 *
 * Totul e HTML și CSS: componenta e de server, conținutul se vede fără
 * JavaScript, iar singura mișcare e la `hover`.
 */

/**
 * Lățimea de referință a unei bule, în pixeli, la pragul cel mai mare (`lg`).
 *
 * Toate mărimile siglelor se socotesc față de ea, iar la pragurile mai mici
 * întreaga compoziție se micșorează cu `--ls`. Așa raportul dintre siglă și bula
 * ei rămâne același peste tot, cu o singură valoare de reglat pe prag.
 */
const BULA_REF = 114;

/**
 * Cât din diametrul bulei ocupă o siglă PĂTRATĂ.
 *
 * Nu e o lățime, e rădăcina unei suprafețe: `logoSize()` egalizează suprafața,
 * deci o siglă lată iese mai scundă și una înaltă mai îngustă, la aceeași
 * „cantitate de cerneală". Vezi socoteala din `lib/website/logos.ts`.
 */
const UMPLERE = 0.44;

/**
 * Plasa de lățime, ca fracțiune din diametrul bulei.
 *
 * Într-un cerc, o siglă lată se lovește de margine mult înainte de a atinge
 * diametrul: coarda de la înălțimea ei e mai scurtă decât diametrul.
 *
 * Pentru selecția de acum plasa NU se strânge pe nimeni și e bine așa: la
 * `UMPLERE` 0,44, lățimea firească a unei sigle e 0,44·√raport din diametru,
 * deci `maxWidth` mușcă abia de la raportul 2,98 în sus, iar cea mai lată de
 * aici e Stripe, cu 2,40 (iese la 0,68 din diametru, față de o coardă de 0,96).
 *
 * E o plasă pentru CE VINE, nu pentru ce e: dacă cineva schimbă o cheie din
 * `BULE` cu una mai lată, 0,76 o oprește înainte să atingă conturul. Peste
 * atât, sigla ar ieși tăiată de rotunjire fără niciun semn în cod.
 */
const LATIME_MAX = 0.76;

interface Bula {
  k: LogoKey;
  /** Centrul bulei, în procente din lățimea/înălțimea scenei. */
  x: number;
  y: number;
  /** Diametrul, ca multiplu de `--bula`. */
  d: number;
  /** Rămâne vizibilă și pe telefon. Fără asta, se ascunde sub 500px. */
  telefon?: boolean;
}

/**
 * Cele zece bule, cu poziția și mărimea fiecăreia.
 *
 * ═══ DE CE TOCMAI SIGLELE ASTEA ═══
 *
 * Acoperă toate cele șapte grupuri din `LOGO_GROUPS` — curieri, plăți,
 * facturare, email, SMS, marketplace, marketing — ca omul să vadă din desen că
 * nu e vorba doar de curieri.
 *
 * Dar selecția are și o constrângere de formă: într-un CERC nu încape orice
 * siglă. Cele foarte late (About You 9,13, Klarna 4,49, Revolut 4,41, SMSO 4,41,
 * Trendyol 4,35, Brevo și Klaviyo 3,38) ies, la suprafață egală, ca niște dungi
 * de 15-20px înălțime într-o bulă de 100px — se citesc ca o pată, nu ca o marcă.
 * Toate cele alese au raportul sub 2,7. NU înlocui una cu o siglă lată fără să
 * mărești bula ei; altfel nu se strică nimic vizibil în cod, doar arată prost.
 *
 * ═══ DE CE POZIȚIILE ASTEA ═══
 *
 * Distanțele față de centru sunt DINADINS inegale, iar DPD stă pe un inel
 * interior. Pe un cerc perfect, cu bule egal depărtate, compoziția se citește
 * imediat ca generată dintr-o formulă. Unghiurile nu sunt nici ele egale:
 * dreapta e mai deasă decât stânga.
 *
 * Cele cinci cu `telefon` sunt alese ca să rămână echilibrate singure: stânga,
 * dreapta, sus-stânga, sus-dreapta, jos. Restul se ascund sub 500px, unde scena
 * e un pătrat de 280-360px și n-ar mai încăpea fără să se atingă.
 */
const BULE: Bula[] = [
  { k: "stripe", x: 22, y: 18, d: 0.92, telefon: true },
  { k: "sameday", x: 52, y: 9, d: 0.76 },
  { k: "facebookPixel", x: 81, y: 21, d: 0.94, telefon: true },
  { k: "googleAnalytics", x: 92, y: 34, d: 0.7 },
  { k: "dpd", x: 33, y: 34, d: 0.66 },
  { k: "fanCourier", x: 14, y: 45, d: 1.16, telefon: true },
  { k: "olx", x: 87, y: 54, d: 1.1, telefon: true },
  { k: "oblio", x: 31, y: 72, d: 0.86 },
  { k: "notice", x: 71, y: 80, d: 0.84 },
  { k: "mailchimp", x: 47, y: 86, d: 1.02, telefon: true },
];

/**
 * Verdele de brand (#1AB554) are pe alb un contrast de 2,6:1 și nu trece pragul.
 * Peste tot unde verdele e DESEN pe alb — aici săgeata din cercul butonului — se
 * folosește varianta închisă. Verdele plin rămâne doar fond, sub text alb.
 */
const VERDE_PE_ALB = "#12874A";

export function IntegrationsConstelatie() {
  return (
    /*
      `overflow-hidden` e plasa de siguranta pentru lumina verde, care e
      dinadins mai lata decat scena ca sa se stinga in afara ei. Restul
      compozitiei sta in scena prin socoteala, nu prin taiere.
    */
    <section
      aria-labelledby="constelatie-titlu"
      className="overflow-hidden bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[720px] text-center">
          {/*
            Pastila, nu `SectionEyebrow`. Aici deasupra nu e o pereche de
            sectiuni care trebuie sa se recunoasca intre ele, ci un antet care
            deschide o compozitie — iar chenarul subtire ii da un capat vizibil
            de care sa se agate titlul.

            `pe-3` in loc de `pe-3.5`: `tracking` adauga spatiere si DUPA ultima
            litera, deci marginea din dreapta pare cu ~2px mai mare decat cea din
            stanga si tot cuvantul iese impins. Aceeasi corectie ca in
            `SectionEyebrow`.
          */}
          <span className="inline-flex items-center rounded-full border border-hairline bg-white ps-3.5 pe-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-3">
            Integrări
          </span>

          {/*
            Doua `block`-uri, nu un `<br>`: pe un ecran de 320px primul rand tot
            se rupe in doua, iar cu `text-balance` cele doua bucati ies aproape
            egale in loc sa ramana un cuvant singur pe randul al doilea.
          */}
          <h2
            id="constelatie-titlu"
            className="mt-6 text-balance text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]"
          >
            <span className="block">Integrările sunt gata.</span>
            <span className="block">Tu doar le pornești.</span>
          </h2>

          {/*
            `text-balance` pentru ca descrierea sta CENTRATA: fara el, ultimul
            rand ramane un ciot de doua cuvinte sub doua randuri pline, si un
            bloc centrat cu varf ascutit in jos arata a text scapat, nu asezat.
            Cu el, randurile ies aproape egale la orice latime.
          */}
          <p className="mx-auto mt-5 max-w-[600px] text-balance text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            Curieri, plăți online, facturare și marketing. Le activezi dintr-un
            comutator, fără programator și fără o linie de cod.
          </p>

          {/*
            Butonul si lumina lui. Invelisul e `inline-block` si `relative`, ca
            lumina sa se masoare fata de buton, nu fata de coloana centrata.
          */}
          <div className="relative mt-9 inline-block">
            {/*
              Lumina sta INAINTEA butonului in DOM, deci se picteaza dedesubt
              fara niciun `z-index` — n-are rost sa deschidem un context de
              stivuire pentru un singur element.

              Cutia ei e trasa in jos (`top-5 -bottom-3`) fiindca o lumina
              centrata pe buton arata a halou, iar una cazuta sub el arata a
              lumina reflectata de masa. Estomparea o duce oricum inapoi peste
              margini.

              Estompare MARE si opacitate MICA, nu invers. Doua motive: o pata
              verde concentrata sub buton se citeste ca o umbra colorata, nu ca
              lumina; si butonul principal din hero trebuie sa ramana cel mai
              verde lucru de pe pagina — el are doar `shadow` verde la 0,55 pe o
              raza scurta, deci aici verdele nu are voie sa treaca de o baltire
              slaba. Daca urci opacitatea, secundarul devine mai aprins decat
              principalul si ierarhia paginii se rastoarna.
            */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-5 -bottom-3 rounded-full bg-primary/30 blur-[28px]"
            />

            <Link
              href="/integrari"
              className="group relative inline-flex items-center gap-3 rounded-full bg-primary py-1.5 pl-5 pr-1.5 text-[14.5px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02] active:scale-100 sm:gap-4 sm:pl-7 sm:text-[15px]"
            >
              Vezi toate integrările
              {/*
                Sageata sta intr-un cerc ALB in interiorul butonului, nu langa
                el. Cercul e si masura inaltimii butonului: 36px plus 2x6px de
                margine da 48, iar la `sm` 40 plus 12 da 52.
              */}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white sm:h-10 sm:w-10">
                <ArrowRight
                  aria-hidden
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  /* Verdele de brand pe alb nu trece pragul de contrast. */
                  style={{ color: VERDE_PE_ALB }}
                />
              </span>
            </Link>
          </div>
        </div>

        {/* ── Constelația ─────────────────────────────────────────────────── */}
        {/*
          Variabilele scenei, prag cu prag. `--bula` e diametrul de baza al unei
          bule, `--nucleu` diametrul cercului din mijloc, `--ls` cat se
          micsoreaza siglele fata de referinta de la `lg`.

          `--ls` NU e strict proportional cu `--bula` la telefon: iese 0,49, dar
          e pus 0,55. E o corectie optica, nu o scapare — intr-o bula de 55px o
          sigla la 44% din diametru se citeste ca o pata, in vreme ce in una de
          130px aceeasi fractiune arata generos. La pragurile mari valoarea e
          exact proportionala (78/114, 95/114).

          Aspectul se schimba si el: patrat sub 500px, 5/4 de acolo in sus. Pe un
          ecran ingust o scena lata ar fi lasat nucleul minuscul ca sa mai incapa
          ceva pe langa el; patratul da inaltime si tine nucleul mare.

          Pragul de 500px trebuie sa fie ACELASI cu cel de pe bule, mai jos.
          Vezi explicatia din capul fisierului inainte sa muti vreunul.
        */}
        <div
          className={
            "relative mx-auto aspect-square w-full max-w-[360px] " +
            "[--bula:56px] [--ls:0.55] [--nucleu:clamp(96px,30vw,124px)] " +
            "mt-14 sm:mt-16 lg:mt-20 " +
            "min-[500px]:aspect-[5/4] min-[500px]:max-w-[440px] min-[500px]:[--bula:61px] min-[500px]:[--ls:0.57] min-[500px]:[--nucleu:118px] " +
            "sm:max-w-[560px] sm:[--bula:78px] sm:[--ls:0.68] sm:[--nucleu:150px] " +
            "md:max-w-[680px] md:[--bula:95px] md:[--ls:0.83] md:[--nucleu:182px] " +
            "lg:max-w-[820px] lg:[--bula:114px] lg:[--ls:1] lg:[--nucleu:220px]"
          }
        >
          {/*
            Lumina verde din spatele intregii compozitii. Un gradient radial, nu
            un `blur`: gradientul se stinge singur si nu costa un strat de
            estompare pe toata scena. Opacitatea de varf e 0,13 si oricum sta in
            mare parte sub cercul negru — ce se vede e doar inelul din jurul lui.

            112% ca sa se stinga in afara scenei; la 320px asta inseamna 17px de
            fiecare parte, adica in marginea paginii, nu in afara ei.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[112%] w-[112%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, rgba(26,181,84,0.13), rgba(26,181,84,0.05) 52%, rgba(26,181,84,0) 76%)",
            }}
          />

          <Nucleu />

          {BULE.map((b) => (
            <div
              key={b.k}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center",
                "rounded-full border border-hairline bg-white",
                /* Umbra e in doua straturi: una larga si moale care ridica bula
                   de pe alb, si una scurta si stransa care ii tine conturul. Cu
                   una singura, ori pluteste fara sa aiba muchie, ori are muchie
                   fara sa pluteasca. */
                "shadow-[0_10px_26px_-10px_rgba(10,10,10,0.22),0_2px_6px_-2px_rgba(10,10,10,0.10)]",
                /* Sub 500px scena e un patrat de 280-360px. Bulele de la margini
                   se ascund; cele cinci ramase sunt alese sa acopere tot
                   cadranul. Pragul e ACELASI cu cel al variabilelor scenei — cu
                   doua praguri diferite, zece bule ar cadea intr-o scena patrata
                   cu marimile de telefon si s-ar calca.

                   `cn()` e twMerge: `hidden` sterge `flex`-ul de mai sus fiindca
                   sunt in aceeasi familie (display), si ramane doar
                   `min-[500px]:flex`. Daca scoti `cn()` de aici, pui `hidden`
                   dupa `flex` in sir sau ramai fara. */
                !b.telefon && "hidden min-[500px]:flex",
              )}
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: `calc(var(--bula) * ${b.d})`,
                height: `calc(var(--bula) * ${b.d})`,
              }}
            >
              {/*
                Sigla se deseneaza la marimea de la `lg` si se micsoreaza cu
                `--ls`. `<Logo>` primeste inaltimea in pixeli, printr-un `style`
                inline, deci nu poate avea praguri — iar un `transform` are.

                `area` si `maxWidth` sunt SOCOTITE din diametrul bulei, nu alese
                pe rand: bulele au marimi diferite, deci o suprafata fixa pentru
                toate ar fi umplut-o pe cea mica si s-ar fi pierdut in cea mare.
                Asa fractiunea de umplere e aceeasi la toate zece.

                `shrink-0` NU e de ornament. Invelisul asta e element de flex in
                bula, iar cutia lui de asezare e sigla la marimea de la `lg` —
                adica MAI LATA decat bula pe pragurile mici, fiindca micsorarea
                vine dintr-un `transform`, care se aplica dupa asezare. Fara
                `shrink-0`, singurul lucru care il tine nestrivit e `min-width:
                auto`, adica un comportament implicit al flex-ului pe care il
                anuleaza tacut orice `overflow` pus pe bula. Cu el, sigla ramane
                intreaga si `transform`-ul o aduce inauntru.
              */}
              <span
                className="flex shrink-0 items-center justify-center"
                style={{ transform: "scale(var(--ls))" }}
              >
                <Logo
                  k={b.k}
                  area={Math.round((UMPLERE * b.d * BULA_REF) ** 2)}
                  maxWidth={Math.round(LATIME_MAX * b.d * BULA_REF)}
                />
              </span>
            </div>
          ))}
        </div>

        {/*
          Textul sta SUB scena, in curgere, nu peste ea. Asa nu exista nicio
          latime la care o bula sa cada peste el — problema nu se rezolva, nu
          apare deloc.

          Al doilea rand e gri: e o singura propozitie taiata in doua, iar
          diferenta de ton spune care e cifra si care e completarea. Amandoua
          raman ingrosate.

          Griul e `ink-2`, NU `ink-3`. `ink-3` (#8A8A94) e tonul etichetelor
          marunte — pe o propozitie ingrosata de 24px o duce sub pragul de 4,5:1
          si, mai rau, o face sa arate a subsol scapat sub desen. `ink-2`
          (#52525B) ramane limpede al doilea, dar se citeste ca urmarea frazei
          de deasupra, care e exact ce e.
        */}
        <p className="mt-10 text-center text-[20px] font-bold leading-[1.3] tracking-[-0.02em] sm:mt-12 sm:text-[24px]">
          <span className="block text-ink">Peste 25 de integrări</span>
          <span className="block text-ink-2">disponibile și tot mai multe</span>
        </p>
      </div>
    </section>
  );
}

/**
 * Cercul din mijloc: Edinio, în alb, pe aproape negru.
 *
 * ═══ DE CE SIGLA E ALBĂ, NU VERDE ═══
 *
 * `/logo.png` e punga verde cu harta României. Măsurat în fișier, harta NU e
 * desenată în alb: e TRANSPARENTĂ (alfa 0 pe toată suprafața ei), iar albul pe
 * care îl vezi e fundalul paginii. De asta merge tratamentul ăsta:
 * `brightness(0)` face desenul negru păstrând alfa, `invert(1)` îl face alb și
 * nu atinge alfa — deci iese o pungă albă cu România decupată, prin care se vede
 * negrul cercului. Marca rămâne întreagă.
 *
 * Ce NU merge, ca să nu se încerce din nou: `invert(1)` singur duce verdele în
 * magenta, iar dacă harta ar fi fost albă opacă, `brightness(0) invert(1)` ar fi
 * dat o siluetă plină, fără decupaj. Ambele lucruri depind de fișier — dacă
 * `/logo.png` se schimbă, se reverifică alfa.
 *
 * Verdele nu se pierde din secțiune: e în buton și în lumina din spate. Aici,
 * albul pe negru e și cel mai puternic contrast de pe pagină, ceea ce e exact ce
 * vrei în centrul unei constelații.
 */
function Nucleu() {
  return (
    <div
      className={cn(
        "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
        /* Umbra adanca: un strat lung care aseaza cercul pe pagina si unul scurt
           care ii inchide baza. Ambele in negrul textului, nu in gri neutru. */
        "shadow-[0_36px_72px_-24px_rgba(10,10,10,0.55),0_10px_24px_-10px_rgba(10,10,10,0.35)]",
      )}
      style={{
        width: "var(--nucleu)",
        height: "var(--nucleu)",
        /* Fondul RAMANE #0A0A0A; gradientul doar ridica putin coltul din
           stanga-sus, cat sa nu arate ca un disc taiat din hartie. Capatul
           deschis e la 10% luminanta peste baza, adica se simte, nu se vede. */
        background:
          "radial-gradient(115% 115% at 32% 22%, #26262B 0%, #0A0A0A 62%)",
      }}
    >
      {/*
        `<img>` simplu, ca peste tot in site: loaderul proiectului lasa neatinse
        fisierele locale, deci `next/image` n-ar produce niciun `srcset`.

        Latimea e in PROCENTE din nucleu, nu in pixeli, si de aceea sigla asta nu
        trece prin `<Logo>`: nucleul isi schimba diametrul la fiecare prag, iar
        un procent il urmareste singur, fara nicio variabila in plus. `h-auto` e
        obligatoriu — fara el atributul `height` ar tine imaginea la 289px.

        52%: desenul ocupa ~92% din cutia fisierului, deci punga iese la ~48% din
        diametru, bine inauntru fata de patratul inscris in cerc (70,7%).
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Edinio"
        width={284}
        height={289}
        loading="lazy"
        decoding="async"
        className="h-auto w-[52%]"
        style={{ filter: "brightness(0) invert(1)" }}
      />
    </div>
  );
}
