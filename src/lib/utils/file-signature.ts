/**
 * Cati pixeli are voie sa aiba o imagine pe care o DECODAM noi.
 *
 * ═══ ⚠ DE CE EXISTA NUMARUL ASTA ═══
 *
 * Semnatura din octeti spune ce FEL de fisier e, nu cat de mare se desface. Un PNG
 * INTERLAZAT de 16000x16000 cu pixeli zero se comprima la 973 KiB — trece lejer de plafonul de
 * 10 MB — dar `sharp` il decodeaza intreg, fiindca interlazarea nu se poate citi in flux.
 *
 * Masurat, cu chiar lantul din `/api/img` (rotate + resize 256 + webp):
 *
 *     16000x16000 interlazat (973 KiB), fara plafon : OK  1772 ms, varf 1166 MiB
 *     acelasi, cu plafonul de mai jos               : refuzat in 1 ms, 73 MiB
 *     2000x1500 obisnuita, cu plafon                : OK  27 ms, 93 MiB
 *
 * Amplificare de ~1200x. O functie de 1024 MB moare la o singura cerere, iar capatul e PUBLIC si
 * scutit de poarta MFA — deci nu trebuie nici macar un cont.
 *
 * ⚠ 50 de megapixeli e peste ORICE telefon (48 MP = 8000x6000), deci nicio poza adevarata nu
 * pateste nimic. Numarul sta aici, langa celelalte reguli despre continutul fisierelor, ca sa fie
 * unul singur pentru toate cele trei capete care decodeaza.
 *
 * ⚠ EXEMPLUL DIN AUDIT — 50000x50000 — nu era cel periculos: `sharp` il refuza si fara noi,
 * din plafonul lui implicit de 268 de megapixeli. Cel care trece e tocmai cel care incape sub el.
 */
export const MAX_PIXELI = 50_000_000;

/**
 * Validates real file content by inspecting magic bytes, instead of trusting the
 * client-supplied MIME type (which is trivially spoofable). Returns the detected
 * image MIME type, or null if the bytes do not match a supported image format.
 */
export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return "image/png";

  // GIF: "GIF87a" / "GIF89a"
  if (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a") {
    return "image/gif";
  }

  // WEBP: "RIFF"...."WEBP"
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }

  // HEIC/HEIF: ISO-BMFF box "ftyp" at offset 4 with a heic/heif/mif1 brand
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (["heic", "heix", "heif", "mif1", "hevc", "msf1"].includes(brand)) return "image/heic";
  }

  return null;
}

/**
 * Tipul unui DOCUMENT, dupa octetii lui. Azi doar PDF.
 *
 * ⚠ FUNCTIE SEPARATA, si nu o ramura in `detectImageMime`. Ajutorul acela e chemat din sase
 * locuri care inteleg toate acelasi lucru prin „da": ca fisierul e o IMAGINE si ca se poate
 * randa, redimensiona sau trimite mai departe ca atare. Largit acolo, un PDF ar fi inceput sa
 * treaca drept imagine in toate sase, tacut — inclusiv in conducta de optimizare si in feeduri.
 */
export function detectDocMime(buffer: Buffer): string | null {
  if (buffer.length < 5) return null;
  /* „%PDF-" — semnatura ceruta de standard chiar la inceputul fisierului. */
  if (buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export function isAllowedImage(buffer: Buffer, allowed: readonly string[]): boolean {
  const detected = detectImageMime(buffer);
  if (!detected) return false;
  // HEIC and HEIF share a signature; accept either label if either is allowed.
  if (detected === "image/heic") return allowed.includes("image/heic") || allowed.includes("image/heif");
  return allowed.includes(detected);
}
