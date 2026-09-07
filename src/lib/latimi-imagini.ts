/**
 * SCARA DE LATIMI A INTREGULUI PROIECT — o singura lista, si de ce trebuie sa fie una singura.
 *
 * ═══ ⚠ FIECARE LATIME DISTINCTA E BANI, IN FIECARE LUNA ═══
 *
 * Imaginile trec prin redimensionatorul de la marginea Cloudflare, care factureaza TRANSFORMARI
 * UNICE — iar unic inseamna imagine × SET DE PARAMETRI. Aceeasi poza ceruta la 480 si la 640 se
 * plateste de doua ori. Si contorul se reseteaza LUNAR: rezultatul ramane in cache, dar in ciclul
 * urmator se numara din nou.
 *
 * ⚠ DE-AIA CONTEAZA CA SCARA SA FIE COMUNA, nu doar scurta. Erau DOUA scari care nu se atingeau
 * niciodata: `next/image` cerea 640/750/828/1080/1200/1920/2048/3840 (implicitele Next), iar
 * `cdnImage`, pentru `<img>`-urile scrise de mana, cerea 64/96/160/256/320/480/1600/2560. Un logo
 * la 480 si un card de produs la 640 erau doua fisiere diferite pentru marimi pe care ochiul nu le
 * deosebeste. Pe o singura scara, cele doua cai cer ACELASI fisier, si a doua e gratuita.
 *
 * ⚠ SI TOATE VALORILE EXISTA IN `TREPTE_LATIME` din `src/app/api/img/route.ts`. Nu e o
 * coincidenta: pasul urmator e sa PREGENERAM variantele in R2 si sa le servim ca obiecte simple,
 * ca sa nu se mai transforme nimic lunar. Aia merge numai daca toate caile cer exact aceleasi
 * latimi — una singura pe langa inseamna un fisier care lipseste si o poza rupta.
 *
 * ⚠ CE S-A TAIAT, SI DE CE TOCMAI ASTEA:
 *   - tripleta 640/750/828 -> a ramas 640. Latimi vecine intre care nu se vede nimic, dar se
 *     plateste;
 *   - 2048 si 3840 -> a ramas 1920. 3840 se cerea de pe ecranele 4K la `sizes="100vw"`, adica cea
 *     mai scumpa transformare cu putinta, pentru o poza de produs;
 *   - 2560 din lightbox -> 1920. Nici nu exista in treptele lui `/api/img`, deci pe calea
 *     pregenerata ar fi fost o poza care lipseste.
 *
 * ⚠ NU SE ADAUGA O LATIME „doar pentru locul asta". Costa in fiecare luna, pentru fiecare imagine
 * careia i se cere. Daca chiar trebuie, se adauga SI in `deviceSizes`/`imageSizes` din
 * `next.config.ts` SI in `TREPTE_LATIME`, altfel cele trei cai se despart iar.
 */

/** Latimile pentru miniaturi si continut ingust. Toate sub cea mai mica din `LATIMI_ECRAN`. */
export const LATIMI_MICI = [64, 128, 256, 384] as const;

/** Latimile pentru imagini care se intind cu ecranul. */
export const LATIMI_ECRAN = [640, 1024, 1536, 1920] as const;

/** Scara intreaga, crescatoare. */
export const LATIMI: readonly number[] = [...LATIMI_MICI, ...LATIMI_ECRAN];

/** Singura calitate ceruta vreodata. Vezi nota despre `qualities` din `next.config.ts`. */
export const CALITATE = 75;

/**
 * Latimea de pe scara pentru o marime ceruta.
 *
 * ⚠ URCA, NU COBOARA: imaginea ramane cel putin la fel de clara ca cea ceruta. Rotunjirea in jos
 * ar fi facut poze vizibil moi pe exact locurile unde cineva a cerut dinadins mai mult.
 *
 * ⚠ SI SE PLAFONEAZA la cea mai mare de pe scara. Cine cere 2560 primeste 1920 — deosebirea nu se
 * vede pe o poza de produs, si asa nu se mai poate naste o latime in afara scarii dintr-un singur
 * numar scris intr-o componenta.
 */
export function latimeaDePeScara(ceruta: number): number {
  if (!Number.isFinite(ceruta) || ceruta <= 0) return LATIMI[0];
  return LATIMI.find((l) => l >= ceruta) ?? LATIMI[LATIMI.length - 1];
}
