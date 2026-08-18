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
 * ═══ IMAGINILE DE PRODUS VIN ÎN TREI MĂRIMI ═══
 *
 * `imagine` NU e o cale de fișier, ci rădăcina lor: din `/migrare/produse/geaca`
 * ies `geaca-320.webp`, `-512` și `-768`, iar browserul alege. Cât lipsește, se
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
 *     360  → 118      390  → 133      640 → 242
 *     1023 → 242 (maximul)            1024 →  96      1280+ → 121
 *
 * ⚠ Numerele sunt ale POZEI, nu ale cardului: între ele stau chenarul cardului
 * (un fir de fiecare parte) și rama de 5px dinăuntru, adică 12px cu totul. Măsurat
 * în pagină la 1920: cardul iese 133, poza 121.
 *
 * ⚠ Cel mai lat NU e pe desktop — e sub pragul `lg`, unde caseta secțiunii nu e
 * încă tăiată în două și cele patru carduri se așază două câte două. De la `lg` în
 * sus stau pe un rând, în șapte doisprezecimi de casetă, deci sunt mult mai mici.
 *
 * Grila celor patru e oprită la 520px cât timp stau două câte două. Fără oprire,
 * la 1023px — chiar sub prag — ajungeau de 449px fiecare, adică patru poze cât un
 * ecran de telefon într-o ilustrație.
 *
 * Din maximul de 242 ies cele trei mărimi:
 *     320  — un ecran obișnuit la un punct pe pixel, sau un telefon la două
 *     512  — 242 la două puncte pe pixel (484), cazul cel mai des întâlnit
 *     768  — 242 la trei puncte pe pixel (726), telefonul bun ținut aproape
 *
 * Ca să adaugi o poză nouă: masterul PĂTRAT (1:1), minimum 768px latura, produsul
 * decupat pe alb, apoi aceeași redimensionare în trei pași, `.webp`, calitate ~78.
 * Ținta de greutate: sub 20KB la 320, sub 40 la 512, sub 70 la 768.
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
 * Cele patru produse din panoul secțiunii „Produse".
 *
 * ⚠ Categoriile nu sunt luate la întâmplare: sunt exact cele patru industrii pe
 * care site-ul le numește el însuși în subsol — haine, electronice, piese auto,
 * mobilier. Așa grila arată a magazin adevărat, cu marfă din raioane diferite, și
 * nu inventează o nișă pe care platforma n-o pomenește nicăieri.
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
    id: "placute",
    nume: "Set plăcuțe de frână față",
    pret: "189 lei",
    categorie: "Piese auto",
    descriere: "Plăcuțe de frână, pe fundal alb",
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
export const LATIMI_POZA_PRODUS = [320, 512, 768];

/**
 * `sizes` pentru pozele de produs — SOCOTIT, nu ghicit.
 *
 * Poza ia toată lățimea cardului mic MINUS chenarul și rama lui (12px cu totul),
 * iar cardul e un sfert din jumătatea de casetă în care stă. Desfășurat, de la
 * ecranul mare spre cel mic:
 *
 *   ≥1280  caseta e oprită la 1136, jumătatea ei 7/12 = 663, minus 80 spațiere și
 *          48 între carduri, împărțit la patru → 133, deci poza 121px
 *   ≥1024  caseta e `100vw − 64`; aceeași socoteală, desfășurată:
 *          `((100vw − 64) × 7/48) − 32 − 12`, adică `14,6vw − 53px`
 *   ≥640   caseta nu e încă tăiată în două, iar grila celor patru e oprită la 520,
 *          deci poza e fixă: `(520 − 12) / 2 − 12 = 242`
 *   restul `(100vw − 40 margini − 48 spațiere − 12 dintre carduri) / 2 − 12`
 */
export const SIZES_POZA_PRODUS =
  "(min-width: 1280px) 121px, (min-width: 1024px) calc(14.6vw - 53px), (min-width: 640px) 242px, calc((100vw - 100px) / 2 - 12px)";

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
