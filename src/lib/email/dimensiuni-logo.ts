import { logoPentruEmail, type Dimensiuni } from "./logo-email";

const ascii = (o: Uint8Array, i: number, n: number) => String.fromCharCode(...o.subarray(i, i + n));
const u32 = (o: Uint8Array, i: number) => ((o[i] << 24) | (o[i + 1] << 16) | (o[i + 2] << 8) | o[i + 3]) >>> 0;
const u24le = (o: Uint8Array, i: number) => o[i] | (o[i + 1] << 8) | (o[i + 2] << 16);

function valide(latime: number, inaltime: number): Dimensiuni | null {
  return latime > 0 && inaltime > 0 && latime <= 65535 && inaltime <= 65535 ? { latime, inaltime } : null;
}

/**
 * Latimea si inaltimea unei imagini, citite din primii ei octeti; `null` cand forma nu se
 * recunoaste.
 *
 * ⚠ FARA `sharp`, dinadins: se cheama la trimiterea emailurilor unui magazin, deci si din
 * finalizarea comenzii, iar `sharp` e un modul nativ greu, de incarcat la fiecare pornire rece.
 *
 * Formele citite sunt cele pe care emailul le trimite prin PNG: WebP, in toate cele trei feluri
 * (VP8, VP8L, VP8X), AVIF (cutia `ispe`) si PNG, fiindca 9 din cele 35 de logouri sunt octeti PNG
 * sub un nume `.webp`.
 */
export function dimensiuniDinAntet(o: Uint8Array): Dimensiuni | null {
  /* PNG: semnatura de 8 octeti, apoi fragmentul IHDR, cu latimea la 16 si inaltimea la 20. */
  if (o.length >= 24 && o[0] === 0x89 && ascii(o, 1, 3) === "PNG" && ascii(o, 12, 4) === "IHDR") {
    return valide(u32(o, 16), u32(o, 20));
  }
  /* WebP: RIFF, marimea, WEBP, apoi primul fragment. */
  if (o.length >= 30 && ascii(o, 0, 4) === "RIFF" && ascii(o, 8, 4) === "WEBP") {
    const fel = ascii(o, 12, 4);
    /* Forma extinsa (transparenta, animatie, metadate): panza, minus unu, pe 24 de biti. */
    if (fel === "VP8X") return valide(1 + u24le(o, 24), 1 + u24le(o, 27));
    /* Fara pierderi: dupa semnatura 0x2f, 14 biti pentru latime minus unu, 14 pentru inaltime minus unu. */
    if (fel === "VP8L" && o[20] === 0x2f) {
      const b = (o[21] | (o[22] << 8) | (o[23] << 16) | (o[24] << 24)) >>> 0;
      return valide(1 + (b & 0x3fff), 1 + ((b >>> 14) & 0x3fff));
    }
    /* Cu pierderi: dupa codul de start 9d 01 2a, cate 14 biti pentru latime si pentru inaltime. */
    if (fel === "VP8 " && o[23] === 0x9d && o[24] === 0x01 && o[25] === 0x2a) {
      return valide((o[26] | (o[27] << 8)) & 0x3fff, (o[28] | (o[29] << 8)) & 0x3fff);
    }
    return null;
  }
  /* AVIF: fisier ISOBMFF (ftyp), cu marimea in cutia `ispe`: versiune si steaguri, apoi latime, inaltime. */
  if (o.length >= 12 && ascii(o, 4, 4) === "ftyp") {
    for (let i = 8; i + 16 <= o.length; i++) {
      if (o[i] === 0x69 && o[i + 1] === 0x73 && o[i + 2] === 0x70 && o[i + 3] === 0x65) {
        return valide(u32(o, i + 8), u32(o, i + 12));
      }
    }
  }
  return null;
}

/** Reusitele, pe adresa. Un logo nou are alta cheie, deci alta adresa: nimic nu se invecheste. */
const TINUTE = new Map<string, Dimensiuni>();

/**
 * Dimensiunile logoului, pentru atributele `width`/`height` din email (vezi `atributeLogo`).
 *
 * ⚠ NU POATE OPRI EMAILUL. Orice esec (retea, timp depasit, raspuns ciudat) da `null`, iar `<img>`
 * ramane cum era, fara atribute.
 *
 * ⚠ SERVERUL CERE DOAR ADRESE ALE DEPOZITULUI NOSTRU: numai logoul pe care `logoPentruEmail` il
 * trimite prin PNG, adica o cheie de-a noastra, pe gazda noastra. O adresa scrisa de altcineva nu
 * pleaca niciodata de pe server.
 *
 * ⚠ SE CER DOAR PRIMII 4 KB (`Range`): toate formele citite isi scriu marimea la inceput.
 */
export async function dimensiuniLogo(
  adresa: string | null | undefined,
  aduce: typeof fetch = fetch,
): Promise<Dimensiuni | null> {
  if (!adresa || logoPentruEmail(adresa) === adresa) return null;
  const tinut = TINUTE.get(adresa);
  if (tinut) return tinut;
  try {
    const r = await aduce(adresa.trim(), {
      headers: { Range: "bytes=0-4095" },
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    const d = dimensiuniDinAntet(new Uint8Array(await r.arrayBuffer()));
    if (d) {
      if (TINUTE.size >= 500) TINUTE.clear();
      TINUTE.set(adresa, d);
    }
    return d;
  } catch {
    return null;
  }
}
