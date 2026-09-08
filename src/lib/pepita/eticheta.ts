import { createHmac } from "node:crypto";
import { galeataIncarcarilor, incarcaPrivat, linkDeCitirePrivata, existaInGaleata } from "@/lib/r2";

/* ═══════════════════════════════════════════════════════════════════════════
   ETICHETA DE COLET TRIMISA DE PEPITA (08.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ CE ERA, SI DE CE N-AM VAZUT-O. Documentatia lor are campul:

       "package_label": Base64 encoded content of the pdf package label

   Noi il aruncam tacut — campurile necunoscute nu opresc ingestul, dinadins. Iar cand un audit
   extern a spus ca exista, am cautat in copia pastrata de noi si am raspuns, de doua ori, ca nu
   apare in documentatie.

   Copia aia NU era fisierul lor: era o reimprimare prin Google Docs a unei versiuni vechi (autor
   gol, „Skia/PDF m135 Google Docs Renderer", 3 pagini, fata de fisierul lor cu autor „Pepita",
   Word 2019, 4 pagini). Toata povestea, cu metadatele si linkurile, in `docs/pepita/README.md`.

   ⚠ SI DE CE CONTEAZA ETICHETA. La Pepita Delivery coletul e dus de GLS-ul contractat de EI, iar
   noi am inchis emiterea de AWB propriu tocmai fiindca ar fi a doua eticheta pe acelasi pachet.
   Fara eticheta LOR, comerciantul ramanea cu un colet pe care nu-l poate expedia si cu un buton
   care il refuza. Asta e piesa care lipsea din capatul celalalt.
*/

/**
 * Cat de mare poate fi eticheta, DECODATA.
 *
 * ⚠ O eticheta de colet A6 face zeci de kiloocteti; un megaoctet e larg cu buna stiinta. Plafonul
 * nu apara spatiul, apara memoria functiei: octetii se decodeaza in RAM inainte de a pleca in
 * depozit.
 */
export const MAX_ETICHETA_OCTETI = 1024 * 1024;

/**
 * Secretul cu care se semneaza cheia.
 *
 * ⚠ ACELASI cu al fisierelor private ale cumparatorilor, cu prefix propriu in sirul semnat. Nu din
 * lene: o variabila NOUA obligatorie opreste TOATA desfasurarea daca nu e pusa in Vercel inainte
 * de push, iar asta e o pana de platforma pentru o eticheta. `CUSTOMIZATION_FILE_SECRET` e deja
 * obligatoriu in productie si e dedicat exact acestui lucru — chei de fisiere private. Prefixul
 * `pepita:eticheta:` face despartirea criptografica de celelalte folosinte.
 */
function secret(): string {
  const s = process.env.CUSTOMIZATION_FILE_SECRET?.trim();
  if (!s) throw new Error("[pepita/eticheta] lipseste CUSTOMIZATION_FILE_SECRET");
  return s;
}

/** Prefixul sub care stau etichetele. ⚠ Cronul de retentie trebuie sa-l cunoasca. */
export const PREFIX_ETICHETE = "awb/pepita/";

/**
 * Cheia din depozit, determinista si neghicibila.
 *
 * ⚠ DETERMINISTA, ca sa nu fie nevoie de nicio coloana noua si de nicio migratie: ruta de
 * descarcare o recompune din magazin si comanda. Aceeasi hotarare ca la etichetele GLS.
 *
 * ⚠ SI NEGHICIBILA, desi galeata e privata. Cheia nu e singura aparare aici — ruta cere sesiune,
 * proprietatea magazinului si legatura cu comanda — dar o cheie ghicibila intr-o galeata privata
 * ramane un lucru pe care nu vrei sa-l afle nimeni: linkurile semnate se emit pe cheie.
 */
export function cheieEticheta(businessId: string, orderId: string): string {
  const semnatura = createHmac("sha256", secret())
    .update(`pepita:eticheta:${businessId}:${orderId}:pdf`)
    .digest("hex")
    .slice(0, 24);
  return `${PREFIX_ETICHETE}${businessId}/${orderId}-${semnatura}.pdf`;
}

/** Ce a iesit din citirea campului: octetii, sau motivul pentru care nu s-a putut. */
export type CitireEticheta =
  | { fel: "lipsa" }
  | { fel: "buna"; octeti: Buffer }
  | { fel: "rea"; motiv: string };

/**
 * Citeste `package_label` din sarcina lor utila.
 *
 * ═══ ⚠ TREI VERIFICARI, SI NICIUNA NU E DE PRISOS ═══
 *
 * 1. FORMA. Un sir care nu e Base64 ar fi decodat oricum de Node, tacut, in gunoi: `Buffer.from`
 *    NU arunca pe intrare nevalida, sare peste ce nu recunoaste. Deci se verifica alfabetul
 *    INAINTE, altfel am fi scris in depozit un fisier care nu se deschide si l-am fi numit
 *    „eticheta".
 * 2. MARIMEA, si inainte, si dupa decodare. Inainte, ca sa nu decodam in memorie ceva urias;
 *    dupa, fiindca raportul 4/3 e o presupunere despre intrare, iar intrarea vine de la altcineva.
 * 3. CA E CHIAR PDF. `%PDF-` la inceput. Fara asta, orice octeti ar fi fost serviti cu
 *    `application/pdf`, adica exact tiparul „citeste raspunsul pe dos" — un HTML de eroare salvat
 *    ca eticheta, si comerciantul afla de la imprimanta.
 *
 * ⚠ NU ARUNCA NICIODATA. E chemata din mijlocul ingestului; o exceptie aici ar transforma o
 * eticheta stricata intr-o comanda pierduta.
 */
export function citesteEticheta(brut: unknown): CitireEticheta {
  if (brut == null || brut === "") return { fel: "lipsa" };
  if (typeof brut !== "string") return { fel: "rea", motiv: "eticheta n-a venit ca text" };

  /* ⚠ Se curata spatiile: unele biblioteci rup Base64 pe randuri de 76 de semne. */
  const curat = brut.replace(/\s+/g, "");
  if (curat === "") return { fel: "lipsa" };

  if (curat.length > Math.ceil((MAX_ETICHETA_OCTETI * 4) / 3) + 8) {
    return { fel: "rea", motiv: "eticheta e mai mare decat plafonul" };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(curat)) {
    return { fel: "rea", motiv: "eticheta nu e Base64" };
  }

  let octeti: Buffer;
  try {
    octeti = Buffer.from(curat, "base64");
  } catch {
    return { fel: "rea", motiv: "eticheta nu s-a putut decoda" };
  }

  if (octeti.length === 0) return { fel: "lipsa" };
  if (octeti.length > MAX_ETICHETA_OCTETI) {
    return { fel: "rea", motiv: "eticheta e mai mare decat plafonul" };
  }
  /* ⚠ Semnatura fisierului, nu antetul lor: cine trimite spune ce vrea, octetii nu mint. */
  if (octeti.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { fel: "rea", motiv: "eticheta nu e un PDF" };
  }

  /*
   * ═══ ⚠ SI COADA, NU DOAR CAPUL (09.09.2026) ═══
   *
   * Un PDF taiat la mijloc pastreaza `%PDF-` la inceput si trece de verificarea de mai sus. Exact
   * asa a scapat trunchierea la 2.000 de semne din `comanda-forma.ts`: fisierul rupt arata, la
   * prima privire, ca unul bun.
   *
   * Orice PDF intreg se termina cu `%%EOF`. Se cauta in ULTIMII 2 KB, nu chiar la sfarsit: unele
   * unelte lasa cateva randuri goale sau o semnatura dupa marcaj.
   *
   * ⚠ SI SE REFUZA, nu se avertizeaza. O eticheta rupta se tipareste si se afla la curier; una
   * lipsa se vede pe loc si se cere din panoul lor. Iar retrimiterea incearca oricum din nou.
   */
  const coada = octeti.subarray(Math.max(0, octeti.length - 2048)).toString("latin1");
  if (!coada.includes("%%EOF")) {
    return { fel: "rea", motiv: "eticheta pare taiată: nu se termină cu %%EOF" };
  }

  return { fel: "buna", octeti };
}

/**
 * Scrie eticheta in galeata PRIVATA.
 *
 * ⚠ NU prin `uploadToR2`: aceea scrie in galeata PUBLICA si intoarce adresa publica. Eticheta
 * poarta numele, adresa si telefonul cumparatorului; pusa acolo, oricine are cheia intreaga ajunge
 * la octeti fara sa treaca pe la noi. Vezi `src/lib/customization/fisiere-private.ts`.
 *
 * ⚠ `private, no-store` explicit. Implicitul lui `uploadToR2` e `public, max-age=31536000,
 * immutable`, adica un an de cache pentru datele unui om.
 */
export async function salveazaEticheta(
  businessId: string, orderId: string, octeti: Buffer,
): Promise<string> {
  const cheie = cheieEticheta(businessId, orderId);
  await incarcaPrivat(cheie, octeti, "application/pdf");
  return cheie;
}

/** Exista eticheta comenzii in depozit? */
export async function areEticheta(businessId: string, orderId: string): Promise<boolean> {
  return existaInGaleata(cheieEticheta(businessId, orderId), galeataIncarcarilor());
}

/**
 * Link semnat, scurt, catre eticheta.
 *
 * ⚠ 60 de secunde, si `inline`: comerciantul o deschide si o tipareste. Un link lung ar circula
 * prin istoricul navigatorului si prin chat mult dupa ce nu mai are ce cauta acolo.
 */
export async function linkEticheta(
  businessId: string, orderId: string, numarComanda: string,
): Promise<string> {
  return linkDeCitirePrivata(
    cheieEticheta(businessId, orderId),
    galeataIncarcarilor(),
    `eticheta-pepita-${numarComanda}.pdf`,
    "application/pdf",
  );
}
