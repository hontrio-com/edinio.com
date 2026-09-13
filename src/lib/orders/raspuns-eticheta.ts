/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RASPUNSUL CARE DUCE O ETICHETA DE CURIER CATRE BROWSER      (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Unsprezece rute servesc etichete, si faceau acelasi lucru in patru feluri. Doua greseli
 * se repetau, fiecare la alt subset, deci nicio citire a unui singur fisier nu le vedea.
 *
 * ⚠ 1. OCTETII DIN AFARA DOCUMENTULUI. `new NextResponse(pdfBuffer.buffer)` trimitea
 * BLOCUL din spate, nu documentul: un `Buffer` din Node e o VEDERE peste un bloc comun,
 * cu `byteOffset` si `byteLength`. Auditul din 09.09.2026 a masurat cazul: PDF de 34 de
 * octeti servit dintr-un bloc de 8192, deci cu 8158 de octeti straini in coada, veniti din
 * ce a mai folosit procesul. Erau asa `cargus`, `dpd`, `sameday` si `fancourier`; primele
 * doua au fost numite de audituri, celelalte doua nu.
 *
 * ⚠ 2. ETICHETA E DATE PERSONALE. Poarta numele, adresa si telefonul CUMPARATORULUI, si
 * la ramburs si suma. Fara `Cache-Control: private, no-store`, un intermediar sau un CDN o
 * poate tine. Lipsea la `cargus`, `dpd`, `sameday`, `woot` si `colete`.
 *
 * ⚠ DE CE O FUNCTIE, SI NU O REPARATIE IN FIECARE RUTA. E aceeasi regula de unsprezece
 * ori. Scrisa de fiecare data, s-a si dezbinat deja: forma corecta exista din tura trecuta
 * la GLS si Pall-Ex, iar cine a scris urmatoarea ruta a copiat-o pe cea de langa. Acelasi
 * motiv pentru care `poarta-awb.ts` si `useDialogAccesibil` sunt cate unul singur.
 *
 * ⚠ INTOARCE `Response`, NU `NextResponse`. Next accepta amandoua (rutele `woot` si
 * `colete` intorc deja `Response`), iar fara importul din `next/server` regula se poate
 * proba direct, fara sa mimez cadrul. Vezi `raspuns-eticheta.test.ts`.
 */

/**
 * Cat de mare poate fi o eticheta.
 *
 * ⚠ Nu e o cifra decorativa: fara plafon, un raspuns stricat al curierului (o pagina HTML
 * de eroare, un corp nelimitat) ar fi curs direct catre browser. O eticheta A4 cu cod de
 * bare are zeci de kiloocteti; 20 MB lasa loc larg si oricarui borderou.
 */
export const MAX_ETICHETA_OCTETI = 20 * 1024 * 1024;

/** Semnatura unui PDF adevarat: primele patru caractere sunt mereu `%PDF`. */
const SEMNATURA_PDF = [0x25, 0x50, 0x44, 0x46] as const;

/**
 * ⚠ Numele de fisier intra intr-un ANTET, deci ghilimelele si randurile noi nu sunt un
 * moft de curatenie: ele pot rupe antetul in doua. Numarul AWB vine de la curier, deci nu
 * e sub controlul nostru.
 */
function numeCurat(nume: string): string {
  const curat = nume.replace(/[\r\n"\\/]+/g, "-").trim();
  return curat.slice(0, 120) || "eticheta";
}

/**
 * Raspunsul cu eticheta, cu octetii EXACTI ai documentului.
 *
 * @param continut octetii documentului, asa cum au venit de la curier
 * @param numeFisier numele sub care se descarca
 * @param tipMime `application/pdf` implicit; GLS si eColet trimit si ZPL
 */
export function raspunsEticheta(
  continut: Buffer | Uint8Array | ArrayBuffer,
  numeFisier: string,
  tipMime = "application/pdf",
): Response {
  /*
   * ═══ ⚠ SE NORMALIZEAZA INTAI, SI ABIA APOI SE VERIFICA ═══
   *
   * `getCOOrderAwb` (Colete Online) intoarce un `ArrayBuffer` gol de metode: n-are indici,
   * deci verificarea semnaturii de mai jos ar fi citit `undefined` pe fiecare pozitie si ar
   * fi refuzat ORICE PDF bun, inclusiv cele care merg azi. A prins-o `tsc`, nu eu: tipul
   * ingust nu era o ingaduinta lipsa, era o necunoastere a ce trimit chiar clientii nostri.
   *
   * ⚠ CELE DOUA FORME, si de ce amandoua dau exact documentul:
   *   vedere (`Buffer`)  `new Uint8Array(vedere)` COPIAZA elementele, adica exact
   *                      `byteLength` octeti incepand de la `byteOffset`.
   *   `ArrayBuffer`      `new Uint8Array(buffer)` da o vedere peste tot bufferul, care aici
   *                      CHIAR e documentul intreg.
   *
   * Ce nu se face niciodata: `vedere.buffer`, care ar da blocul comun din spate. Aia era
   * greseala din patru rute. Aceeasi forma corecta o au deja GLS si Pall-Ex.
   */
  const octeti = ArrayBuffer.isView(continut)
    ? new Uint8Array(continut.buffer, continut.byteOffset, continut.byteLength).slice()
    : new Uint8Array(continut);

  if (octeti.byteLength === 0) {
    throw new Error("Curierul a raspuns cu o eticheta goala.");
  }
  if (octeti.byteLength > MAX_ETICHETA_OCTETI) {
    throw new Error(
      `Eticheta primita are ${octeti.byteLength} octeti, peste plafonul de ${MAX_ETICHETA_OCTETI}.`,
    );
  }

  /*
   * ⚠ SEMNATURA SE CERE DOAR PENTRU PDF. GLS si eColet pot trimite ZPL, care e text pentru
   * imprimanta si n-are nicio semnatura. Ceruta si acolo, verificarea ar fi refuzat chiar
   * etichetele bune. Ce apara la PDF: o pagina HTML de eroare a curierului, servita cu
   * `Content-Type: application/pdf`, se deschide ca un document stricat, fara niciun mesaj.
   */
  if (tipMime === "application/pdf") {
    for (let i = 0; i < SEMNATURA_PDF.length; i++) {
      if (octeti[i] !== SEMNATURA_PDF[i]) {
        throw new Error("Raspunsul curierului nu este un PDF. Incearca din nou sau verifica in contul lui.");
      }
    }
  }

  return new Response(octeti, {
    status: 200,
    headers: {
      "Content-Type": tipMime,
      "Content-Disposition": `attachment; filename="${numeCurat(numeFisier)}"`,
      "Content-Length": String(octeti.byteLength),
      /* ⚠ Vezi nota 2 din capul fisierului: eticheta poarta datele cumparatorului. */
      "Cache-Control": "private, no-store",
    },
  });
}
