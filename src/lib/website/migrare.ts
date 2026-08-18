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
 *     360  → 136      390  → 151      640 → 252
 *     1023 → 252 (maximul)            1024 → 196      1280+ → 240
 *
 * ⚠ Numerele sunt ale POZEI, nu ale cardului: cardul are un chenar de un fir de
 * fiecare parte, deci poza e cu 2px mai îngustă decât el. Măsurat în pagină la
 * 1920: cardul iese 242, poza 240. Doi pixeli n-ar schimba ce fișier alege
 * browserul, dar dacă `sizes` minte cu ceva se preferă să mintă în minus.
 *
 * Ca și la cardurile de pe pagina de start, cel mai lat NU e pe desktop, ci chiar
 * sub pragul `lg`, unde panoul e încă pe toată lățimea (îl ține un `max-w` de
 * 560px, altfel ar fi ajuns la 455 pe o tabletă și pozele ar fi fost uriașe).
 *
 * De acolo ies cele trei:
 *     320  — un ecran obișnuit la un punct pe pixel, sau un telefon la două
 *     512  — 254 la două puncte pe pixel (508), cazul cel mai des întâlnit
 *     768  — 254 la trei puncte pe pixel (762), telefonul bun ținut aproape
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
 * ⚠ Denumirile și prețurile sunt CIORNĂ. Trebuie oricum potrivite cu pozele care
 * vor veni — o poză de geacă sub numele altui produs se vede din prima.
 */
export const PRODUSE_MIGRARE: ProdusMigrare[] = [
  {
    id: "geaca",
    nume: "Geacă de iarnă impermeabilă",
    pret: "349 lei",
    categorie: "Haine și modă",
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
    categorie: "Mobilier și decor",
    descriere: "Scaun de birou, pe fundal alb",
  },
];

/** Mărimile generate pentru fiecare poză de produs. Vezi nota de sus. */
export const LATIMI_POZA_PRODUS = [320, 512, 768];

/**
 * `sizes` pentru pozele de produs — SOCOTIT, nu ghicit.
 *
 * Poza ia toată lățimea cardului mic MINUS chenarul lui (2px), iar cardul mic e o
 * jumătate din interiorul panoului. Desfășurat, de la ecranul mare spre cel mic:
 *
 *   ≥1280  panoul e jumătate din cei 1200 ai paginii → poza iese fix 240px
 *   ≥1024  pagina e `100vw − 64`, coloana `(100vw − 128) / 2`, iar din ea se scad
 *          cei 40 de spațiere ai panoului, cei 12 dintre carduri și chenarul:
 *          `(100vw − 128) / 4 − 28`, adică `25vw − 60px`
 *   ≥640   panoul e oprit la 560px, deci poza e fixă: `(560 − 40 − 12) / 2 − 2 = 252`
 *   restul `(100vw − 40 margini − 32 spațiere − 12 dintre carduri) / 2 − 2`
 */
export const SIZES_POZA_PRODUS =
  "(min-width: 1280px) 240px, (min-width: 1024px) calc(25vw - 60px), (min-width: 640px) 252px, calc((100vw - 88px) / 2)";

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
