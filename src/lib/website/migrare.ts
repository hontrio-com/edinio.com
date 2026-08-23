import { PLATFORM_LOGOS, type PlatformLogo } from "./comparison";

/**
 * Secțiunile de pe pagina „Migrare magazin", una pentru fiecare fel de dată care
 * se mută: produse, categorii, comenzi, clienți.
 *
 * ⚠ TEXTELE DE AICI SUNT CIORNĂ, NU ALE CLIENTULUI. Titlul și descrierea din hero
 * au fost date cuvânt cu cuvânt (14.08); pentru secțiuni n-a venit încă nimic.
 * Sunt scrise ca să existe secțiunea, nu ca să rămână. Se înlocuiesc fără discuție
 * când vine textul — de aceea stau toate aici, într-un fișier, nu împrăștiate prin
 * componente.
 *
 * ═══ IMAGINILE DE PRODUS VIN ÎN DOUĂ MĂRIMI ═══
 *
 * `imagine` NU e o cale de fișier, ci rădăcina lor: din `/migrare/produse/geaca`
 * ies `geaca-320.webp` și `geaca-512.webp`, iar browserul alege. Cât lipsește, se
 * vede substituentul cu `descriere`.
 *
 * Același motiv ca la imaginile de pe pagina de start (vezi `features.ts`):
 * loader-ul proiectului lasă neatinse imaginile locale — prin el trece doar ce e
 * pe R2 — deci `next/image` nu produce niciun `srcset` pentru ele, iar orice
 * telefon ar primi fișierul întreg.
 *
 * ⚠ LĂȚIMILE SUNT SOCOTITE, nu alese din burtă. Caseta unei poze de produs,
 * măsurată pe scara de ecrane:
 *
 *     360  → 118      390  → 133      428–639 → 152
 *     640–1023 → 153 (maximul)        1024 → 111      1280+ → 140
 *
 * ⚠ Numerele sunt ale POZEI, nu ale cardului: între ele stau chenarul cardului
 * (un fir de fiecare parte) și rama de 5px dinăuntru, adică 12px cu totul. Măsurat
 * în pagină la 1920: cardul iese 152, poza 140.
 *
 * ⚠ MAXIMUL A COBORÂT DE LA 242 LA 152 ODATĂ CU TRECEREA DE LA PATRU CARDURI LA
 * TREI, și pare pe dos, fiindcă la `lg` cardurile chiar au CRESCUT (133 → 152).
 * Explicația e că maximul nu e la `lg`, ci sub el: acolo caseta nu e încă tăiată
 * în două, iar grila e oprită la 520px. Trei coloane în 520 sunt mai înguste decât
 * două în același 520 — deci exact acolo unde erau cele mai late poze, s-au
 * îngustat cel mai mult.
 *
 * Opririle sunt măsurate: 520px cât timp cardurile stau pe un rând sub `lg`
 * (fără ea, la 1023px ajungeau de 449px fiecare), și 340px sub `sm`, unde stau
 * două câte două (fără ea, pe un ecran de 639px poza sărea la 242).
 *
 * Din maximul de 153 ies cele DOUĂ mărimi:
 *     320  — 153 la două puncte pe pixel (306), și orice ecran obișnuit la unul
 *     512  — 153 la trei puncte pe pixel (459), telefonul bun ținut aproape
 *
 * A treia, de 768, a rămas fără rost: nu există nicio lățime de ecran la care
 * poza să treacă de 459 de pixeli adevărați. Un fișier pe care nu-l cere nimeni e
 * doar o poză de făcut în plus.
 *
 * Ca să adaugi o poză nouă: masterul PĂTRAT (1:1), minimum 512px latura, produsul
 * decupat pe alb, apoi aceeași redimensionare în doi pași, `.webp`, calitate ~78.
 * Ținta de greutate: sub 20KB la 320, sub 40 la 512.
 */

/**
 * Unde duc butoanele „Începe migrarea" din cele trei secțiuni: la formularul de
 * cerere din josul paginii.
 *
 * ⚠ Scrisă O SINGURĂ DATĂ, aici, și folosită și de butoane, și de `id`-ul pus pe
 * secțiunea formularului (`SectiuneFascicule`). Cu numele scris de mână în două
 * locuri, prima redenumire lasă trei butoane care nu mai duc nicăieri — și nu se
 * vede: un `href="#..."` care nu găsește nimic nu dă nicio eroare, doar nu face
 * nimic.
 */
export const ANCORA_FORMULAR = "#cerere-migrare";

export interface ProdusMigrare {
  /** Cheie stabilă pentru `key`, chiar dacă se schimbă denumirea. */
  id: string;
  nume: string;
  /** Scris cu tot cu monedă, ca în magazin. */
  pret: string;
  categorie: string;
  /** Rădăcina fișierelor, fără sufixul de mărime. Lipsește => substituent. */
  imagine?: string;
  /** Ce trebuie să arate poza. Se vede pe substituent și ajunge în `alt`. */
  descriere: string;
}

/**
 * Cele trei produse din panoul secțiunii „Produse".
 *
 * ⚠ TREI, NU PATRU, cerut de client (14.08): cu patru, panoul se întindea prea
 * mult și secțiunea se îngreuna. Trei lasă cardurile să respire — de la `lg` în
 * sus ies 152px în loc de 133 — și îngăduie jumătățile egale, ca în schiță.
 *
 * ⚠ Categoriile nu sunt luate la întâmplare: sunt industrii pe care site-ul le
 * numește el însuși în subsol. Așa grila arată a magazin adevărat, cu marfă din
 * raioane diferite, și nu inventează o nișă pe care platforma n-o pomenește
 * nicăieri.
 *
 * Dintre cele patru industrii a căzut „Piese auto", și nu la întâmplare: rămân
 * trei feluri de marfă cât mai depărtate între ele — ceva moale, ceva cu
 * electronică, ceva mare. Două piese mici de metal lângă o geacă spuneau mai
 * puțin despre „orice fel de magazin" decât spune un scaun.
 *
 * ⚠ SCRISE SCURT, nu cu numele lung din subsol, și e o măsurătoare: rândul
 * categoriei are 109px în cardul de la `lg` în sus, iar la 10px cu majuscule
 * răsfirate încap vreo cincisprezece semne. „Mobilier și decor" ieșea trunchiat cu
 * trei puncte — adică arăta a scăpare, nu a card. Oricum așa scriu magazinele pe
 * carduri: un cuvânt, două, nu numele întreg al raionului.
 *
 * ⚠ Denumirile și prețurile sunt CIORNĂ. Trebuie oricum potrivite cu pozele care
 * vor veni — o poză de geacă sub numele altui produs se vede din prima.
 */
export const PRODUSE_MIGRARE: ProdusMigrare[] = [
  {
    id: "geaca",
    nume: "Geacă de iarnă impermeabilă",
    pret: "349 lei",
    categorie: "Haine",
    imagine: "/migrare/geaca",
    descriere: "Geacă, pe fundal alb",
  },
  {
    id: "camera",
    nume: "Cameră de supraveghere solară",
    pret: "429 lei",
    categorie: "Electronice",
    imagine: "/migrare/camera",
    descriere: "Cameră de supraveghere, pe fundal alb",
  },
  {
    id: "scaun",
    nume: "Scaun de birou ergonomic",
    pret: "899 lei",
    categorie: "Mobilier",
    imagine: "/migrare/scaun",
    descriere: "Scaun de birou, pe fundal alb",
  },
];

/**
 * Mărimile generate pentru fiecare poză de produs. Vezi nota de sus.
 *
 * ⚠ DEOCAMDATĂ DOAR 320, deși fișierele de 512 EXISTĂ pe disc (2026-08-19).
 *
 * Motivul e că nu sunt pătrate: au ieșit 512x608, iar produsul e încadrat altfel
 * decât în cele de 320 — acolo geaca umple pătratul, aici stă cu aer în jur. Puse
 * amândouă în `srcSet`, aceeași casetă ar fi arătat produsul la două mărimi
 * diferite, după cât de deasă e rețeaua de puncte a ecranului: 152px lățime pe un
 * telefon la două puncte pe pixel, 128 pe unul la trei. Nu e un lucru pe care să-l
 * poți repara din CSS — `object-contain` nu are cum să potrivească două
 * încadrări diferite.
 *
 * Cât timp lipsesc, cele de 320 acoperă tot ce se vede la un punct și la două pe
 * pixel. Doar pe un telefon la trei puncte poza se întinde de la 320 la ~400,
 * adică se moaie puțin — vizibil dacă te uiți după asta, nu dacă te uiți la
 * magazin.
 *
 * ⚠ CA SĂ SE ÎNTOARCĂ: se exportă cele de 512 PĂTRATE (512x512), cu aceeași
 * încadrare ca cele de 320, și se adaugă `512` înapoi în lista de aici. Nimic
 * altceva — `srcSet` se construiește din ea.
 */
export const LATIMI_POZA_PRODUS = [320];

/**
 * `sizes` pentru pozele de produs — SOCOTIT, nu ghicit.
 *
 * Poza ia toată lățimea cardului mic MINUS chenarul și rama lui (12px cu totul),
 * iar cardul e o treime din jumătatea de casetă în care stă. Desfășurat, de la
 * ecranul mare spre cel mic:
 *
 *   ≥1280  caseta e oprită la 1136, jumătatea ei 568, minus 80 spațiere și 32
 *          între carduri, împărțit la trei → 152, deci poza 140px
 *   ≥1024  caseta e `100vw − 64`; aceeași socoteală, desfășurată:
 *          `((100vw − 64) / 6) − 112/3 − 12`, adică `16,7vw − 60px`
 *   ≥640   caseta nu e încă tăiată în două, iar grila celor trei e oprită la 520.
 *          ⚠ Spațierea e 12px aici, nu 16: `gap-4` vine abia de la `lg`. Deci
 *          `(520 − 24) / 3 − 12 = 153`, nu 150 — doi pași de spațiere, nu trei.
 *   ≥428   două câte două, cu grila oprită la 340: `(340 − 12) / 2 − 12 = 152`
 *   restul două câte două, pe toată lățimea:
 *          `(100vw − 40 margini − 48 spațiere − 12 dintre carduri) / 2 − 12`
 */
export const SIZES_POZA_PRODUS =
  "(min-width: 1280px) 140px, (min-width: 1024px) calc(16.7vw - 60px), (min-width: 640px) 153px, (min-width: 428px) 152px, calc((100vw - 100px) / 2 - 12px)";

export interface SectiuneMigrareText {
  /** Rândul mic de deasupra titlului. */
  eticheta: string;
  titlu: string;
  descriere: string;
  cta: { label: string; href: string };
}

/**
 * ⚠ TITLUL ȘI DESCRIEREA SUNT ALE CLIENTULUI, date cuvânt cu cuvânt (19.08).
 * Le-au înlocuit pe cele scrise de mine ca să existe secțiunea („Produsele tale
 * ajung întregi, nu doar pe listă."). Nu se rescriu.
 *
 * ⚠ ETICHETA E ÎNCĂ A MEA. Textul butonului e al clientului (19.08): „Începe
 * migrarea", la toate trei secțiunile.
 *
 * ⚠ ADRESA E ANCORA FORMULARULUI, nu `/register`.
 *
 * A fost o vreme `/register`, fiindcă pe pagină nu exista niciun flux de migrare la
 * care să trimită — nota de aici prevedea că se schimbă când apare formularul.
 * A apărut (19.08, `FormularMigrare`), deci butonul cu textul „Începe migrarea"
 * chiar începe migrarea: coboară la cererea din josul paginii.
 *
 * Un buton care spune „Începe migrarea" și deschide o pagină de înscriere cu email
 * și parolă cere altceva decât a promis. Toate trei duc în același loc, dinadins:
 * sunt trei feluri de a spune același lucru, nu trei drumuri.
 */
export const SECTIUNE_PRODUSE: SectiuneMigrareText = {
  eticheta: "Produse",
  titlu: "Tot catalogul tău, mutat pe Edinio.",
  descriere:
    "Produsele vin împreună cu informațiile importante: descrieri, prețuri, stocuri, variante și fotografii.",
  cta: { label: "Începe migrarea", href: ANCORA_FORMULAR },
};

/**
 * ⚠ TITLUL ȘI DESCRIEREA SUNT ALE CLIENTULUI, date cuvânt cu cuvânt (19.08).
 * Nu se rescriu. Eticheta e a mea; textul butonului e al clientului (19.08).
 */
export const SECTIUNE_CATEGORII: SectiuneMigrareText = {
  eticheta: "Categorii",
  titlu: "Categoriile tale rămân organizate.",
  descriere:
    "Transferăm structura categoriilor și subcategoriilor, astfel încât produsele să ajungă în Edinio fără să refaci manual organizarea magazinului.",
  cta: { label: "Începe migrarea", href: ANCORA_FORMULAR },
};

/* ─── Arborele de categorii ─────────────────────────────────────────────────── */

export interface NodCategorie {
  nume: string;
  /** Câte produse are, cu tot cu ce e sub el. Vezi nota de la `ARBORE_CATEGORII`. */
  produse: number;
  copii?: NodCategorie[];
  /**
   * Ramura e desfăcută, deci i se văd copiii.
   *
   * Fără asta, toate ar fi arătat la fel — iar un arbore în care nimic nu e
   * strâns nu arată a arbore, arată a listă indentată. Închise și deschise
   * amestecate spun că ramurile chiar se pot închide.
   */
  deschis?: boolean;
  /**
   * Rândul pe care stă cursorul.
   *
   * ⚠ UNUL SINGUR în tot arborele. Două rânduri aprinse deodată n-ar mai fi un
   * cursor, ar fi o selecție — altceva, și ceva ce nu are ce căuta într-o
   * ilustrație care arată doar cum stau categoriile.
   */
  subCursor?: boolean;
}

/**
 * Arborele din ilustrația secțiunii „Categorii".
 *
 * ⚠ NUMERELE SE ADUNĂ, și asta e cea mai importantă linie din fișierul ăsta.
 *
 *     Geci și paltoane 48 + Tricouri 63 + Pantaloni 75  =  Bărbați 186
 *     Bărbați 186 + Femei 226                           =  Haine și modă 412
 *     Supraveghere 96 + Smart home 132 + Audio 90       =  Electronice 318
 *     412 + 318 + Mobilier și decor 209                 =  939, cât scrie în cap
 *
 * Nimeni nu le va aduna. Dar cine se uită atent la o ilustrație în care cifrele NU
 * se adună vede imediat că e desen, nu produs — și de atunci încolo nu mai crede
 * nimic din ce e pe ecran. Costul de a le potrivi e o înmulțire; costul de a nu le
 * potrivi e credibilitatea întregii pagini.
 *
 * ⚠ Categoriile de nivel întâi sunt ACELEAȘI trei ca la cardurile de produs din
 * secțiunea de deasupra, în aceeași ordine. Iar rândul pe care stă cursorul e
 * „Geci și paltoane", adică exact raionul din care vine geaca de pe primul card.
 * Cele două ilustrații arată același magazin, nu două magazine inventate separat.
 */
export const ARBORE_CATEGORII: NodCategorie[] = [
  {
    nume: "Haine și modă",
    produse: 412,
    deschis: true,
    copii: [
      {
        nume: "Bărbați",
        produse: 186,
        deschis: true,
        copii: [
          { nume: "Geci și paltoane", produse: 48, subCursor: true },
          { nume: "Tricouri", produse: 63 },
          { nume: "Pantaloni", produse: 75 },
        ],
      },
      { nume: "Femei", produse: 226, copii: [] },
    ],
  },
  {
    /*
     * ⚠ STRÂNSĂ, deși are copii — și asta scurtează panoul cu trei rânduri.
     *
     * Cerut ca toate trei casetele de pe pagină să aibă aceeași înălțime, iar
     * panoul ăsta era singurul care le împingea (480px față de 348 și 375). Cele
     * trei rânduri de electronice nu spuneau nimic ce nu spune deja ramura de
     * haine desfăcută alături: tot un al doilea nivel, tot cu numere care se
     * adună.
     *
     * Ce apără comentariul de mai sus rămâne întreg: cele trei niveluri se văd pe
     * Haine → Bărbați → Geci/Tricouri/Pantaloni; numerele se adună mai departe,
     * fiindcă cei trei copii RĂMÂN în date, doar că nu se mai văd; iar „ramuri
     * strânse și desfăcute amestecate" devine chiar mai adevărat — până acum era
     * strânsă doar „Femei", acum sunt două.
     *
     * ⚠ NU strânge „Bărbați" în locul ei, deși scurtează la fel de mult: acolo
     * dispar al treilea nivel, rândul de sub cursor și legătura cu geaca din
     * secțiunea „Produse" — adică fix cele patru lucruri pe care comentariul de
     * mai sus le numește dovada că arborele e adevărat.
     */
    nume: "Electronice",
    produse: 318,
    deschis: false,
    copii: [
      { nume: "Supraveghere", produse: 96, copii: [] },
      { nume: "Smart home", produse: 132, copii: [] },
      { nume: "Audio", produse: 90, copii: [] },
    ],
  },
  { nume: "Mobilier și decor", produse: 209, copii: [] },
];

/** Totalul din capul panoului. Se SOCOTEȘTE, ca să nu poată rămâne în urmă. */
export const TOTAL_PRODUSE_ARBORE = ARBORE_CATEGORII.reduce(
  (suma, nod) => suma + nod.produse,
  0,
);

/* ─── Comenzi ───────────────────────────────────────────────────────────────── */

/**
 * ⚠ TITLUL ȘI DESCRIEREA SUNT ALE CLIENTULUI, date cuvânt cu cuvânt (19.08).
 * Nu se rescriu. Eticheta e a mea; textul butonului e al clientului (19.08).
 */
export const SECTIUNE_COMENZI: SectiuneMigrareText = {
  eticheta: "Comenzi",
  titlu: "Nu pierzi comenzile făcute până acum.",
  descriere:
    "Migrăm istoricul comenzilor împreună cu datele importante, ca să poți continua administrarea magazinului fără să o iei de la zero.",
  cta: { label: "Începe migrarea", href: ANCORA_FORMULAR },
};

/**
 * Comanda din fața teancului, ilustrația secțiunii „Comenzi".
 *
 * ═══ CE A FOST ÎNAINTE ═══
 *
 * Trei comenzi ca niște înștiințări — nume, sumă, pastilă de stare, „acum 4 min".
 * Spuneau altceva decât secțiunea: titlul promite istoric păstrat („comenzile
 * făcute până acum"), iar înștiințările arătau trafic proaspăt. Iar „datele
 * importante" din descriere nu se vedeau nicăieri: nici produse, nici plată, nici
 * vechime.
 *
 * ⚠ Cardul de aici arată exact lucrurile alea: ce s-a cumpărat, când anume, cum
 * s-a plătit. O comandă cu produsele ei e o comandă; un nume cu o sumă lângă el e
 * un rând de tabel.
 *
 * ⚠ Rândul de dedesubt NU e capul de panou scos pe 19.08 („Comenzi", „1.042 în
 * total"). Acela era cronologia unui panou de administrare; ăsta spune cât de
 * departe merge teancul înapoi — adică chiar lucrul pe care secțiunea îl promite.
 * Fără el, desenul arată a trei comenzi, nu a arhivă.
 *
 * ⚠ FĂRĂ STARE. Pastila „Livrată" era singura culoare din desen, deci primul lucru
 * la care se uita ochiul — și răspundea la altă întrebare decât secțiunea: unde a
 * ajuns comanda, nu dacă istoricul vine cu tine.
 *
 * Suma e o combinație adevărată a prețurilor de pe cardurile de produs din prima
 * secțiune — camera 429 plus scaunul 899 — iar produsele scrise dedesubt sunt
 * chiar alea. Cele trei ilustrații arată ACELAȘI magazin.
 */
export const COMANDA_TEANC = {
  numar: 1042,
  client: "Andrei Popescu",
  total: "1.328 lei",
  cand: "azi, 14:32",
  produse: "Cameră supraveghere · Scaun ergonomic",
  plata: "Plată la livrare",
};

/** Câte mai sunt sub cea din față, și de când. */
export const TEANC_RESTUL = { cate: "1.041", din: 2021 };

/* ─── Platforme: de unde se migrează ────────────────────────────────────────── */

/**
 * ⚠ TEXT CIORNĂ, ca la celelalte secțiuni: de la client a venit așezarea
 * (ilustrația cu fascicule și cercuri), nu cuvintele.
 *
 * Titlul spune ce nu spune niciunul dintre celelalte trei: primele răspund la
 * „CE se mută" — produse, categorii, comenzi — iar ăsta la „DE UNDE". De aceea
 * secțiunea vine ultima: încheie argumentul, nu mai adaugă un articol la listă.
 *
 * ⚠ Nu repetă titlul din hero („Schimbi platforma, păstrezi tot ce ai
 * construit."). Acela e promisiunea; ăsta e domeniul ei.
 */
export const SECTIUNE_PLATFORME: SectiuneMigrareText = {
  eticheta: "Platforme",
  titlu: "Mutăm magazinul tău, indiferent de platformă.",
  descriere:
    "Shopify, WooCommerce, OpenCart, Wix sau o soluție custom. Completează formularul, iar noi analizăm magazinul și ne ocupăm de migrarea pe Edinio.",
  cta: { label: "Începe migrarea", href: ANCORA_FORMULAR },
};

/**
 * O siglă din cercuri: numele platformei plus desenul ei.
 *
 * `logo` are exact forma din `comparison.ts` (`PlatformLogo`) fiindcă socoteala
 * de mărime e aceeași funcție, `inaltimeSigla`. Vezi acolo de ce suprafață egală
 * și ce e corecția optică.
 */
export interface CercPlatforma {
  nume: string;
  logo: PlatformLogo;
}

/*
  ⚠ CELE DOUĂ ADĂUGATE (19.08, cerute de client) NU INTRĂ ÎN `PLATFORM_LOGOS`.

  Acolo cheia e `ComparisonRival`, adică platformele din TABELUL de comparație și
  din paginile `/vs`. Gomag și MerchantPro nu sunt în tabel — băgate acolo, ar fi
  cerut câte o valoare pe fiecare dintre cele unsprezece rânduri de comparație,
  adică unsprezece afirmații despre doi concurenți pe care nu i-a măsurat nimeni.
  Aici e altceva: „de pe ce platforme mutăm", nu „cu cine ne comparăm" — o listă
  mai largă, și e firesc să fie.

  Corecțiile optice sunt din aceeași probă ca la celelalte patru: siglele puse una
  lângă alta, mărite, până se citesc ca o familie.
*/
const GOMAG: PlatformLogo = {
  src: "/migrare/gomag.png",
  // Măsurat în fișier: cerneala umple toată pânza de 298x92, fără margine.
  ratio: 298 / 92,
  // Wordmark cu semn, ca WooCommerce: la arie egală arată scund.
  optic: 1.05,
};

/*
  ⚠ FIȘIER PROVIZORIU. `logomerchant.png` are 37x17 pixeli și e tăiat pe dreapta —
  e o iconiță de favicon, nu o siglă. La mărimea la care se randează aici (50px
  lățime) iese moale pe orice ecran, iar pe unul cu două puncte pe pixel, spălată
  de tot. Se înlocuiește cu un SVG sau cu un PNG de cel puțin 300px lățime,
  netăiat, și atunci se reface și proba optică.
*/
const MERCHANTPRO: PlatformLogo = {
  ratio: 37 / 17,
  src: "/migrare/logomerchant.png",
  optic: 1,
};

/**
 * Platformele din cercuri, în ordinea de sus în jos, pe fiecare parte.
 *
 * Trei pe stânga și trei pe dreapta, ca în captura clientului. Până la 19.08 erau
 * două și două, fiindcă atâtea sigle aveam; Gomag și MerchantPro au venit atunci.
 *
 * ⚠ AȘEZAREA E DUPĂ LĂȚIME, nu alfabetică și nici după importanță. Siglele au
 * rapoarte între 0,88 (Shopify, aproape pătrat) și 3,24 (Gomag, de trei ori mai
 * lat decât înalt). Puse la întâmplare, o parte ar fi ieșit vizual mai grea decât
 * cealaltă. Deci cea mai lată de pe stânga stă în dreptul celei mai late de pe
 * dreapta: Gomag ↔ Wix sus, apoi perechile se echilibrează în jos.
 */
export const PLATFORME_STANGA: readonly CercPlatforma[] = [
  { nume: "Gomag", logo: GOMAG },
  { nume: "Shopify", logo: PLATFORM_LOGOS.Shopify },
  { nume: "OpenCart", logo: PLATFORM_LOGOS.OpenCart },
];

export const PLATFORME_DREAPTA: readonly CercPlatforma[] = [
  { nume: "Wix", logo: PLATFORM_LOGOS.Wix },
  { nume: "MerchantPro", logo: MERCHANTPRO },
  { nume: "WooCommerce", logo: PLATFORM_LOGOS.WooCommerce },
];
