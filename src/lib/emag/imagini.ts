/**
 * Imaginile produsului, aduse la un format pe care eMAG chiar il citeste.
 *
 * ═══ ⚠ EDINIO FACE WebP. eMAG NU-L PRIMESTE. ═══
 *
 * Conducta de incarcare a magazinului incearca `image/webp` prima, fiindca e mai mica si
 * mai buna pentru vitrina. Schema eMAG, la `images[].url`, spune cuvant cu cuvant: „JPG,
 * JPEG or PNG."
 *
 * ⚠ Pana azi, urmarea era ca produsul se OPREA, cu un mesaj catre comerciant: „convertește
 * imaginea". Corect din punctul de vedere al datelor — nu pleaca o adresa pe care ei n-o
 * pot citi — dar e o munca pe care i-o dam noi, pentru un fisier pe care tot noi l-am
 * facut. Iar el nu poate schimba formatul din Edinio: conducta alege singura.
 *
 * ⚠ CE SE INTAMPLA DACA PLEACA TOTUSI: eMAG NU se plange. Produsul apare la ei pur si
 * simplu fara poza. Deci nu se poate „incerca si vedem”.
 *
 * ═══ CE FACE FISIERUL ASTA ═══
 *
 * Pentru fiecare imagine care nu e deja jpg/png, face o COPIE convertita, o urca in R2
 * sub o cheie care se poate socoti din adresa sursa, si trimite adresa copiei catre eMAG.
 *
 *   vitrina Edinio   →  ramane WebP, neatinsa
 *   eMAG             →  primeste JPEG (sau PNG, unde conteaza transparenta)
 *   comerciantul     →  nu face nimic
 *
 * ⚠ CHEIA E DETERMINISTA, si asta e tot ce tine costul jos. Aceeasi imagine da aceeasi
 * cheie, deci a doua trecere a cronului gaseste fisierul deja acolo si nici nu-l descarca.
 * Cu un nume intamplator, fiecare sincronizare a fiecarui produs ar fi insemnat o
 * descarcare, o conversie si o urcare — pentru un fisier identic cu cel de ieri.
 *
 * ⚠ TRANSPARENTA MERGE PE PNG. Un WebP cu fundal transparent turnat in JPEG iese cu fundal
 * NEGRU — iar la o poza de produs pe fundal alb, asta se vede din prima si arata ca o
 * greseala a magazinului, nu a noastra. PNG e mai mare, dar e singurul dintre formatele
 * primite de ei care tine canalul alfa.
 */

import sharp, { type Metadata, type Sharp } from "sharp";
import { createHash } from "node:crypto";
import { uploadToR2 } from "@/lib/r2";
import { safeFetchImage } from "@/lib/import/ssrf";
import { logError } from "@/lib/error-logger";

/** Formatele pe care le primeste eMAG. Vezi schema lor, `images[].url`. */
const PRIMITE = /\.(jpe?g|png)$/i;

/**
 * Cate imagini se convertesc intr-o singura trecere a unui produs.
 *
 * ⚠ Nu e o limita de corectitudine, e una de timp. Cronul are `maxDuration = 60`, iar o
 * conversie inseamna o descarcare plus o codare. Un produs cu treizeci de poze webp ar fi
 * mancat toata trecerea si ar fi lasat restul cozii neatins.
 *
 * Ce ramane peste se converteste la trecerea urmatoare: cheia fiind deterministica, cele
 * facute deja nu se mai refac.
 */
const PE_TRECERE = 8;

/**
 * Cat timp, cu totul, se poate cheltui pe imaginile UNUI produs.
 *
 * ═══ ⚠ CRONUL ARE `maxDuration = 60`, SI IMPARTE SECUNDELE ALEA CU TOT RESTUL ═══
 *
 * O conversie inseamna doua intrebari „exista deja?", o descarcare si o codare. Numarate
 * la cazul cel mai rau, opt imagini ar fi putut manca toata trecerea — si atunci nu mai
 * pleaca NIMIC: nici comenzile, nici mișcarile de stoc dupa vanzari.
 *
 * Peste buget, ce ramane se amana pentru trecerea urmatoare. Cheia fiind deterministica,
 * ce s-a facut deja nu se mai reface, deci un produs cu multe poze se termina in doua-trei
 * treceri in loc de una — si nimic altceva nu asteapta dupa el.
 */
const BUGET_MS = 20_000;

/**
 * Cat se asteapta la intrebarea „exista deja copia?".
 *
 * ⚠ Scurt ANUME. E doar o scurtatura: daca nu raspunde la timp, se converteste din nou,
 * si atat. O asteptare lunga aici ar fi platit scump o economie.
 */
const HEAD_MS = 2500;

/** Adresa nu se poate converti; se spune de ce, o data. */
interface Nereusita { adresa: string; motiv: string }

export interface RezultatImagini {
  /**
   * Adresa veche → adresa noua. Ce s-a putut converti, si ce era deja bun.
   *
   * ⚠ O HARTA, nu o lista, si nu din cochetarie: apelantul trebuie sa inlocuiasca
   * adresele in DOUA locuri — lista produsului si poza fiecarei combinatii. Cu o lista
   * de iesire mai scurta decat cea de intrare (ce n-a mers lipseste), potrivirea s-ar fi
   * facut pe pozitie, iar o singura conversie picata ar fi mutat toate pozele de dupa ea
   * pe alt produs. Cu o harta, intrebarea „ce a devenit adresa asta?” are un singur
   * raspuns.
   */
  noi: Map<string, string>;
  nereusite: Nereusita[];
}

/**
 * Numele fisierului convertit.
 *
 * ⚠ Se socoteste din ADRESA SURSA, nu din continut: altfel ar trebui descarcat fisierul
 * ca sa afli daca trebuie descarcat. Adresele noastre de R2 poarta deja un nume unic pe
 * fisier, deci doua imagini diferite nu pot da aceeasi cheie.
 */
export function cheiaDerivatului(businessId: string, adresa: string, ext: "jpg" | "png"): string {
  const amprenta = createHash("sha256").update(adresa).digest("hex").slice(0, 32);
  return `marketplaces/emag/${businessId}/${amprenta}.${ext}`;
}

/** E deja intr-un format pe care ei il primesc? */
export function ePrimitaDeEmag(adresa: string): boolean {
  return PRIMITE.test((adresa ?? "").split("?")[0]);
}

/**
 * Exista deja fisierul convertit?
 *
 * ⚠ `HEAD`, nu `GET`: raspunsul nu ne trebuie, doar existenta. Pe un catalog mare,
 * deosebirea dintre a cere antetul si a descarca poza e toata diferenta.
 *
 * ⚠ La orice indoiala se raspunde „nu exista” si se converteste din nou. O conversie in
 * plus costa cateva sute de milisecunde; o imagine lipsa la eMAG costa un produs fara
 * poza, si nimeni nu afla, fiindca ei nu se plang.
 */
async function existaDeja(adresa: string): Promise<boolean> {
  try {
    const r = await fetch(adresa, { method: "HEAD", signal: AbortSignal.timeout(HEAD_MS) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * O imagine, convertita si urcata. `null` daca n-a mers.
 *
 * ⚠ Trece prin `safeFetchImage`, ca tot restul descarcarilor de imagini din Edinio: e
 * paza impotriva adreselor care duc inauntrul retelei. Adresele astea vin din baza si sunt
 * ale noastre, dar o paza care se aplica „doar unde nu suntem siguri” nu e o paza.
 */
async function converteste(
  businessId: string, adresa: string,
): Promise<{ url: string } | { motiv: string }> {
  const luat = await safeFetchImage(adresa);
  if ("error" in luat) return { motiv: luat.error };

  let imagine: Sharp;
  let metadate: Metadata;
  try {
    imagine = sharp(luat.buffer);
    metadate = await imagine.metadata();
  } catch {
    return { motiv: "fișierul nu e o imagine pe care o putem citi" };
  }

  /* ⚠ Transparenta merge pe PNG. Turnata in JPEG, ar iesi cu fundal negru. */
  const cuAlfa = metadate.hasAlpha === true;
  const ext = cuAlfa ? "png" : "jpg";

  let iesire: Buffer;
  try {
    iesire = cuAlfa
      ? await imagine.png({ compressionLevel: 9 }).toBuffer()
      /* 90 e pragul de la care ochiul nu mai castiga nimic pe o poza de produs, iar
         fisierul e de vreo trei ori mai mic decat la 100. */
      : await imagine.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return { motiv: "conversia imaginii a eșuat" };
  }

  const cheie = cheiaDerivatului(businessId, adresa, ext);
  try {
    const url = await uploadToR2(iesire, cheie, cuAlfa ? "image/png" : "image/jpeg");
    return { url };
  } catch (e) {
    return { motiv: e instanceof Error ? e.message : "urcarea imaginii a eșuat" };
  }
}

/**
 * Adresele produsului, cu cele neprimite inlocuite de copii convertite.
 *
 * ⚠ ORDINEA SE PASTREAZA. Prima imagine e cea principala la eMAG (`display_type: 1`), iar
 * o conversie care ar rearanja lista ar schimba poza de coperta a produsului fara ca
 * nimeni sa fi cerut asta.
 *
 * ⚠ Ce nu se poate converti NU se arunca in tacere: iese in `nereusite`, iar apelantul o
 * spune comerciantului. O imagine care dispare fara motiv e chiar defectul de care fugim.
 */
export async function imaginiPentruEmag(
  businessId: string, adrese: string[],
): Promise<RezultatImagini> {
  const noi = new Map<string, string>();
  const nereusite: Nereusita[] = [];
  let convertite = 0;
  const pana = Date.now() + BUGET_MS;

  for (const adresa of [...new Set(adrese)]) {
    if (ePrimitaDeEmag(adresa)) { noi.set(adresa, adresa); continue; }

    /* ⚠ Bugetul se verifica INAINTE de orice cerere de retea, nu dupa. */
    if (Date.now() >= pana) {
      nereusite.push({ adresa, motiv: "s-a amânat pentru trecerea următoare" });
      continue;
    }

    /* ⚠ Se intreaba intai daca copia exista deja — pe amandoua extensiile, fiindca nu
       stim inca daca originalul are transparenta. Un `HEAD` e mult mai ieftin decat o
       descarcare plus o codare, iar la a doua trecere a cronului asta e tot ce se face. */
    const gata = await adreseleGataFacute(businessId, adresa);
    if (gata) { noi.set(adresa, gata); continue; }

    if (convertite >= PE_TRECERE) {
      nereusite.push({ adresa, motiv: "s-a amânat pentru trecerea următoare" });
      continue;
    }

    convertite++;
    const r = await converteste(businessId, adresa);
    if ("motiv" in r) {
      nereusite.push({ adresa, motiv: r.motiv });
      void logError({
        action: "emag.imagini",
        message: `imaginea nu s-a putut converti: ${r.motiv}`,
        details: { adresa, businessId },
        businessId,
        severity: "warning",
      });
      continue;
    }
    noi.set(adresa, r.url);
  }

  return { noi, nereusite };
}

/** Copia deja facuta, daca exista. Se intreaba pentru amandoua extensiile. */
async function adreseleGataFacute(businessId: string, adresa: string): Promise<string | null> {
  const gazda = process.env.R2_PUBLIC_URL;
  if (!gazda) return null;

  for (const ext of ["jpg", "png"] as const) {
    const url = `${gazda}/${cheiaDerivatului(businessId, adresa, ext)}`;
    if (await existaDeja(url)) return url;
  }
  return null;
}
