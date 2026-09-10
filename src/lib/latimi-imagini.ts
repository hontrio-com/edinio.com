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

// Relativ, nu `@/`: modulul asta il citeste si `next.config.ts`, unde alias-ul nu e garantat.
import { esteIncarcareDeCumparator } from "./customization/adresa";

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

/** Prefixul sub care stau variantele gata facute. Public pe domeniul CDN, `immutable`. */
export const PREFIX_VARIANTE = "_optim";

/**
 * Ce chei primeste optimizatorul (`/api/img`): doar prefixele incarcarilor noastre si doar
 * terminatii de imagine. Ruta nu are voie sa poata redimensiona orice obiect din depozit.
 *
 * ⚠ STA AICI, NU IN RUTA, fiindca o citesc DOUA locuri care trebuie sa raspunda la fel: ruta, care
 * refuza ce nu se potriveste, si emailurile (`logoPentruEmail`), care compun adrese catre ruta. O
 * adresa compusa pentru o cheie pe care ruta o refuza nu e o poza mai putin buna, e o POZA RUPTA in
 * emailul fiecarui client. (Iar un `route.ts` n-are voie sa exporte altceva decat metodele HTTP.)
 */
export const KEY_RE = /^(products|gallery|logos|covers|avatars)\/[\w./-]+\.(webp|jpe?g|png|gif|avif)$/i;

/**
 * Cheia trece de optimizator: nu e goala, n-are `..`, se potriveste cu `KEY_RE` si NU e a unui
 * fisier incarcat de cumparator.
 *
 * ⚠ Ultima conditie ruta o verifica si mai devreme, inaintea oricarei atingeri a depozitului (vezi
 * `esteIncarcareDeCumparator`). E pusa si aici ca regula sa spuna TOT ce refuza ruta: altfel un
 * email ar fi putut compune o adresa catre o cheie pe care ruta o respinge.
 */
export function cheieOptimizabila(cheie: string): boolean {
  return !!cheie && !cheie.includes("..") && KEY_RE.test(cheie) && !esteIncarcareDeCumparator(cheie);
}

/**
 * Formatul variantei: `webp` pentru tot ce arata un browser, `png` DOAR la cerere explicita.
 *
 * ⚠ DE CE EXISTA `png` (10.09.2026): logoul BricoSmart, WebP cu transparenta, aparea in emailul
 * „Comanda noua" pe un dreptunghi NEGRU. Gmail nu afiseaza WebP-ul asa cum e, il transforma in JPG
 * (caniemail.com: „Gmail converts file to jpg"), iar JPG n-are transparenta. Sub cei 312.324 de
 * pixeli transparenti ai logoului (din 462.400) culoarea stocata e (0, 0, 0), deci tot ce era
 * transparent a iesit negru. PNG-ul isi pastreaza transparenta in toti clientii de email.
 */
export type FormatVarianta = "webp" | "png";

/**
 * Latimea SINGURULUI PNG pe care il face ruta, oricare ar fi `w` din cerere: cea a logoului din
 * email.
 *
 * Invelisul arata logoul la cel mult 48px inaltime. Unul lat (BricoSmart are 1600x289, 5,5 la 1)
 * ajunge astfel la vreo 265px latime, deci la vreo 530px pe ecranele cu densitate dubla. 640 e
 * prima treapta a scarii comune peste asta, iar un logo mai mic nu se mareste.
 *
 * ⚠ FIXA IN RUTA, NU DOAR IN EMAIL: pe toate cele 18 trepte, un PNG de fotografie cantareste de 3
 * pana la 6 ori cat WebP-ul ei (masurat pe poze din catalog, fata de WebP q95). Asa exista cel mult
 * UN PNG pe poza.
 *
 * ⚠ COSTUL ASUMAT: si logourile opace cresc (22 din 35, de peste 1,5 ori). Castigul lor e Outlook
 * pe Windows, care nu afiseaza WebP deloc.
 */
export const LATIME_PNG = 640;

/**
 * Sursa pe care clientii de email n-o arata cum e, deci pleaca in email ca PNG: WebP (Gmail il
 * transforma in JPG, fara transparenta; Outlook pe Windows nu-l arata deloc) si AVIF.
 *
 * ⚠ O CITESC AMANDOUA CAPETELE: emailul, ca sa hotarasca ce trimite prin PNG, si ruta, ca sa nu
 * faca PNG din nimic altceva. Despartite, emailul ar cere un PNG pe care ruta nu-l face.
 */
export function sursaCerePngInEmail(cheie: string): boolean {
  return /\.(webp|avif)$/i.test(cheie);
}

/**
 * Cheia variantei gata facute a unei imagini.
 *
 * ⚠ O SINGURA DEFINITIE. Azi o foloseste doar `/api/img`, care scrie varianta si apoi trimite
 * browserul la ea — dar chiar acolo se cere de doua ori, la scriere si la redirectare, iar cele
 * doua trebuie sa dea acelasi sir. Compusa de mana in fiecare loc, o schimbare ar fi trimis
 * browserul catre un fisier care nu s-a scris niciodata.
 *
 * ⚠ Prefixul e si temelia curateniei: `scripts/curata-optim-personalizari.mjs` cauta sub el.
 * Schimbat aici si nu acolo, unealta ar fi cautat intr-un dosar gol si ar fi raportat linistita
 * „nimic de sters".
 *
 * ⚠ TERMINATIA ORIGINALULUI RAMANE IN CHEIE, si nu din neglijenta: `poza.jpg` da
 * `…/poza.jpg.webp`. Asa doua originale cu acelasi nume si terminatii diferite nu se calca.
 *
 * ⚠ ULTIMA TERMINATIE E FORMATUL VARIANTEI: `logo.webp` cerut ca PNG da `…/logo.webp.png`, langa
 * `…/logo.webp.webp`. Cele doua variante ale aceleiasi poze, la aceeasi latime, nu se calca.
 */
export function cheieVarianta(cheie: string, latime: number, calitate: number, format: FormatVarianta = "webp"): string {
  return `${PREFIX_VARIANTE}/w${latime}q${calitate}/${cheie}.${format}`;
}
