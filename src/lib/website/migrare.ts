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
 *     360  → 118      390  → 133      428–639 → 152 (maximul)
 *     640  → 150      1023 → 150      1024 → 111      1280+ → 140
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
 * Din maximul de 152 ies cele DOUĂ mărimi:
 *     320  — 152 la două puncte pe pixel (304), și orice ecran obișnuit la unul
 *     512  — 152 la trei puncte pe pixel (456), telefonul bun ținut aproape
 *
 * A treia, de 768, a rămas fără rost: nu există nicio lățime de ecran la care
 * poza să treacă de 456 de pixeli adevărați. Un fișier pe care nu-l cere nimeni e
 * doar o poză de făcut în plus.
 *
 * Ca să adaugi o poză nouă: masterul PĂTRAT (1:1), minimum 512px latura, produsul
 * decupat pe alb, apoi aceeași redimensionare în doi pași, `.webp`, calitate ~78.
 * Ținta de greutate: sub 20KB la 320, sub 40 la 512.
 */

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
    descriere: "Geacă, pe fundal alb",
  },
  {
    id: "camera",
    nume: "Cameră de supraveghere solară",
    pret: "429 lei",
    categorie: "Electronice",
    descriere: "Cameră de supraveghere, pe fundal alb",
  },
  {
    id: "scaun",
    nume: "Scaun de birou ergonomic",
    pret: "899 lei",
    categorie: "Mobilier",
    descriere: "Scaun de birou, pe fundal alb",
  },
];

/** Mărimile generate pentru fiecare poză de produs. Vezi nota de sus. */
export const LATIMI_POZA_PRODUS = [320, 512];

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
 *   ≥640   caseta nu e încă tăiată în două, iar grila celor trei e oprită la 520,
 *          deci poza e fixă: `(520 − 32) / 3 − 12 = 150`
 *   ≥428   două câte două, cu grila oprită la 340: `(340 − 12) / 2 − 12 = 152`
 *   restul două câte două, pe toată lățimea:
 *          `(100vw − 40 margini − 48 spațiere − 12 dintre carduri) / 2 − 12`
 */
export const SIZES_POZA_PRODUS =
  "(min-width: 1280px) 140px, (min-width: 1024px) calc(16.7vw - 60px), (min-width: 640px) 150px, (min-width: 428px) 152px, calc((100vw - 100px) / 2 - 12px)";

export interface SectiuneMigrareText {
  /** Rândul mic de deasupra titlului. */
  eticheta: string;
  titlu: string;
  descriere: string;
  cta: { label: string; href: string };
}

/**
 * ⚠ CIORNĂ, ca tot ce e text aici.
 *
 * Butonul duce la înscriere, ca cele două din hero, și e dinadins cel mai
 * neutru lucru pe care îl pot pune: orice altă etichetă („Cere migrarea",
 * „Vorbește cu un specialist") promite un flux care încă nu există pe pagină.
 */
export const SECTIUNE_PRODUSE: SectiuneMigrareText = {
  eticheta: "Produse",
  titlu: "Produsele tale ajung întregi, nu doar pe listă.",
  descriere:
    "Denumiri, descrieri, prețuri, stocuri, variante și fotografii. Se așază în Edinio așa cum le-ai avut, ca să nu iei magazinul de la capăt.",
  cta: { label: "Începe gratuit", href: "/register" },
};
