import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Criptarea ceruta de tbi Fusion Pay: AES-256-CTR, cu cheia trecuta prin SHA-256, IV aleator de 16
 * octeti LIPIT IN FATA textului criptat, totul in base64.
 *
 * ═══ ALGORITMUL LOR, DIN FISIERUL PE CARE IL DAU (`Cryptor.php`, atasat documentatiei) ═══
 *
 *   cheie  = sha256(cheia din email), cei 32 de octeti BRUTI (nu hex);
 *   iv     = 16 octeti aleatori (`openssl_cipher_iv_length('aes-256-ctr')`);
 *   iesire = base64(iv . aes-256-ctr(text, cheie, iv)).
 *
 * ⚠ VERIFICAT PE FIR (16.11.2026): `data` din exemplul lor de RegisterApplication, descifrat cu cheia
 * de test publicata langa el, da exact JSON-ul scris in documentatie. Iar serverul lor de test primeste
 * cererile criptate aici.
 *
 * ═══ ⚠ CRIPTAREA NU SEMNEAZA ═══
 *
 * CTR fara MAC: o descifrare cu alta cheie NU da eroare, ci octeti fara sens; iar cine stie un text si
 * criptarea lui poate rasturna biti. Deci adevarul nu vine de la descifrare, ci de la ce urmeaza:
 * textul trebuie sa fie UTF-8 curat (`TextDecoder` cu `fatal`), apoi JSON, apoi sa aiba campurile
 * asteptate. Iar o veste se dovedeste prin jetonul secret din adresa ei, nu prin criptare
 * (vezi `/api/tbi/notificare/[jeton]`).
 */

export class EroareCriptareTbi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "EroareCriptareTbi";
  }
}

const LUNGIME_IV = 16;

function cheiaAes(cheie: string): Buffer {
  if (!cheie) throw new EroareCriptareTbi("Lipseste cheia de criptare tbi.");
  return createHash("sha256").update(cheie, "utf8").digest();
}

/** Textul, criptat pentru tbi: `base64(iv || aes-256-ctr(text))`. */
export function cripteazaPentruTbi(text: string, cheie: string): string {
  const octeti = Buffer.from(text, "utf8");
  if (octeti.length === 0) throw new EroareCriptareTbi("Nu e nimic de criptat.");
  const iv = randomBytes(LUNGIME_IV);
  const c = createCipheriv("aes-256-ctr", cheiaAes(cheie), iv);
  return Buffer.concat([iv, c.update(octeti), c.final()]).toString("base64");
}

/**
 * Base64 primit de la tbi, adus la forma standard.
 *
 * ⚠ Un `+` trimis intr-un formular fara codare ajunge la noi ca SPATIU („a+b" -> „a b"). Base64
 * nu contine niciodata spatii, deci un spatiu de acolo e sigur un `+` pierdut. Iar varianta
 * „URL-safe" (`-`, `_`) se intoarce la cea standard.
 *
 * ⚠ SPATIILE SE INTORC IN `+` INAINTE de orice taiere (18.11.2026). Cu `.trim()` pus primul, un `+`
 * de la INCEPUTUL sau de la CAPATUL vestii (devenit spatiu) era taiat, nu refacut: vestea pierdea un
 * caracter si nu se mai putea descifra. Se intampla la ~1 din 64 de vesti (primul caracter base64 e
 * `+`), adica exact proba care cadea „din cand in cand”. Celelalte spatii albe (randuri noi, tab-uri)
 * se scot dupa.
 */
export function normalizeazaBase64(v: string): string {
  let s = String(v ?? "").replace(/ /g, "+").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  s = s.replace(/=+$/, "");
  if (!s || !/^[A-Za-z0-9+/]+$/.test(s)) throw new EroareCriptareTbi("Vestea nu e in base64.");
  const rest = s.length % 4;
  if (rest === 1) throw new EroareCriptareTbi("Vestea in base64 e trunchiata.");
  if (rest) s += "=".repeat(4 - rest);
  return s;
}

/** Vestea de la tbi, descifrata cu cheia de criptare a magazinului. */
export function descifreazaDeLaTbi(base64: string, cheie: string): string {
  const octeti = Buffer.from(normalizeazaBase64(base64), "base64");
  if (octeti.length <= LUNGIME_IV) {
    throw new EroareCriptareTbi(`Vestea are ${octeti.length} octeti, prea putini pentru IV si continut.`);
  }
  const d = createDecipheriv("aes-256-ctr", cheiaAes(cheie), octeti.subarray(0, LUNGIME_IV));
  const brut = Buffer.concat([d.update(octeti.subarray(LUNGIME_IV)), d.final()]);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(brut);
  } catch {
    throw new EroareCriptareTbi("Vestea nu se poate descifra cu cheia de criptare a magazinului (iese text fara sens).");
  }
}
