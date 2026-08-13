/**
 * Proporțiile aparatului din ilustrația „Optimizat pentru mobil".
 *
 * Clientul a cerut un mockup „1 la 1 cu realitatea", deci numerele nu sunt alese
 * din ochi. Stau aici, și nu doar în CSS, ca să poată fi PROBATE: fracțiile astea
 * trebuie să se potrivească între ele, iar potrivirea e ceea ce face desenul să
 * arate a aparat și nu a dreptunghi rotunjit.
 *
 * ═══ DE UNDE VIN, ȘI CÂT DE SIGURE SUNT ═══
 *
 * SIGURE, fiindcă sunt ale ecranului și se pot socoti:
 *   1320 x 2868 px la 460 ppi  →  72,89 x 158,36 mm, raport 2,1727
 *
 * DE CONFIRMAT, fiindcă vin din fișa aparatului (iPhone 17 Pro Max):
 *   corp 78,0 x 163,4 mm  →  raport 2,0949
 *
 * ⚠ Nu le-am putut verifica dintr-o sursă oficială din locul ăsta. Dacă cifrele
 * de corp sunt altele, se schimbă DOAR ele aici și în `globals.css`; restul se
 * recalculează singur, iar proba de mai jos spune dacă mai sunt coerente.
 */

/** Ecranul, în milimetri: 1320 și 2868 px la 460 ppi. */
export const ECRAN_MM = { latime: (1320 / 460) * 25.4, inaltime: (2868 / 460) * 25.4 };

/** Corpul, în milimetri. Din fișa aparatului. */
export const CORP_MM = { latime: 78.0, inaltime: 163.4 };

/** Rama, adică marginea dintre sticlă și muchia metalică. */
export const RAMA_MM = (CORP_MM.latime - ECRAN_MM.latime) / 2;

/* ── Fracțiile folosite în CSS, toate raportate la LĂȚIMEA CORPULUI ────────── */

/** Rama, ca fracție din lățimea corpului. `.iphone { padding }` */
export const RAMA = RAMA_MM / CORP_MM.latime;
/** Raportul corpului: înălțime / lățime. `.iphone { aspect-ratio }` */
export const RAPORT_CORP = CORP_MM.inaltime / CORP_MM.latime;
/** Raportul ecranului: înălțime / lățime. */
export const RAPORT_ECRAN = ECRAN_MM.inaltime / ECRAN_MM.latime;

/**
 * Razele colțurilor, CONCENTRICE.
 *
 * Raza ecranului la 16/17 Pro Max e 62pt dintr-o lățime de 440pt, adică 14,09%
 * din ecran. În fracție din corp: 0,1409 x 0,9345 = 0,1317. Raza corpului e aia
 * plus rama — asta e tot ce înseamnă „concentrice". Cu două numere alese
 * separat, colțul interior iese ori prea ascuțit, ori umflat față de cel
 * exterior; e aceeași regulă ca la cardurile de pe pagina de start.
 */
export const RAZA_ECRAN = 0.1409 * (ECRAN_MM.latime / CORP_MM.latime);
export const RAZA_CORP = RAZA_ECRAN + RAMA;

/**
 * Butoanele laterale ale lui 17 Pro: pe stânga butonul de acțiune și volumul, pe
 * dreapta butonul lateral și comanda de cameră.
 *
 * ⚠ Pozițiile sunt APROXIMATIVE, ca fracții din înălțimea corpului. Nu am de unde
 * să le măsor exact, iar la mărimea la care se vede aparatul în card fiecare
 * buton are câțiva pixeli. Rolul lor e ca silueta să nu pară un dreptunghi
 * rotunjit — nu să fie o fișă tehnică.
 */
export interface ButonIPhone {
  parte: "stanga" | "dreapta";
  /** De la marginea de sus a corpului, ca fracție din înălțimea lui. */
  sus: number;
  lungime: number;
}

export const BUTOANE_IPHONE: ButonIPhone[] = [
  { parte: "stanga", sus: 0.152, lungime: 0.042 },
  { parte: "stanga", sus: 0.224, lungime: 0.062 },
  { parte: "stanga", sus: 0.302, lungime: 0.062 },
  { parte: "dreapta", sus: 0.232, lungime: 0.1 },
  { parte: "dreapta", sus: 0.372, lungime: 0.055 },
];
