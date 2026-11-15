import {
  constants, createPrivateKey, createPublicKey, createHash, privateDecrypt, publicEncrypt, X509Certificate,
  type KeyObject,
} from "node:crypto";

/**
 * Criptarea ceruta de tbi: RSA cu umplutura PKCS#1 v1.5, pe BUCATI, apoi base64.
 *
 * ═══ ALGORITMUL LOR, CUVANT CU CUVANT (documentatia, „The encryption algorithm") ═══
 *
 *   criptare:   bucata = (biti / 8) - 11 OCTETI; fiecare bucata se cripteaza separat cu cheia
 *               PUBLICA, rezultatele se lipesc, totul se da in base64;
 *   descifrare: base64 -> octeti; bucata = biti / 8; fiecare se descifreaza cu cheia PRIVATA,
 *               rezultatele se lipesc.
 *
 * ⚠ BUCATILE SUNT DE OCTETI, NU DE CARACTERE. Exemplul lor PHP taie cu `substr`, care numara
 * octeti, iar cel C# taie `Encoding.UTF8.GetBytes(...)`. Un nume de produs cu diacritice („Șosete")
 * are caractere de doi octeti; taiat pe caractere, o bucata ar depasi plafonul de (k - 11) octeti
 * si criptarea ar cadea exact la comenzile cu diacritice. Si la descifrare textul se reface din
 * octetii LIPITI, nu bucata cu bucata: o litera de doi octeti poate fi rupta intre doua bucati.
 *
 * ⚠ VERIFICAT PE FIR (15.11.2026) cu vestea-exemplu din pachetul lor de test („5. Decripting status
 * Update Code Example.php") si cheia comerciantului de test: iese
 * `{"order_id":"528413423","status_id":1,"motiv":""}`. Adica `status_id` vine NUMAR, desi
 * documentatia il scrie ca text (`"status_id": "0"`). Citirea il primeste in ambele forme.
 *
 * ═══ ⚠ DESCIFRAREA NU POATE SPUNE „CHEIE GRESITA" ═══
 *
 * Node 24 are OpenSSL 3.5, cu „respingere implicita" la PKCS#1 v1.5 (aparare contra atacului
 * Marvin): o bucata care nu se potriveste cu cheia NU da eroare, ci octeti pseudo-aleatori.
 * Deci adevarul nu vine de la descifrare, ci de la ce urmeaza: textul trebuie sa fie UTF-8 curat
 * (`TextDecoder` cu `fatal`), apoi JSON, apoi sa aiba campurile asteptate. Vezi `lib/tbi/stari.ts`.
 */

export class EroareCheieTbi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "EroareCheieTbi";
  }
}

export class EroareCriptareTbi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "EroareCriptareTbi";
  }
}

const BLOC_PEM = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Bucata PEM, curatata: un comerciant o poate lipi cu spatii in loc de randuri noi. */
function blocPem(text: string): { eticheta: string; corp: string; criptatCuParola: boolean } | null {
  const m = BLOC_PEM.exec(text.replace(/\r/g, ""));
  if (!m) return null;
  const eticheta = m[1].trim();
  const interior = m[2];
  /* PKCS#1 protejat cu parola isi pune antetele IN bloc („Proc-Type: 4,ENCRYPTED"). */
  const criptatCuParola = /Proc-Type:\s*4,ENCRYPTED/i.test(interior) || eticheta === "ENCRYPTED PRIVATE KEY";
  const corp = interior.replace(/^[A-Za-z-]+:.*$/gm, "").replace(/\s+/g, "");
  return { eticheta, corp, criptatCuParola };
}

function refaPem(eticheta: string, corp: string): string {
  const randuri = corp.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${eticheta}-----\n${randuri.join("\n")}\n-----END ${eticheta}-----\n`;
}

function verificaRsa(cheie: KeyObject, ce: string): number {
  if (cheie.asymmetricKeyType !== "rsa") {
    throw new EroareCheieTbi(`${ce} nu este o cheie RSA. tbi bank foloseste numai chei RSA.`);
  }
  const biti = cheie.asymmetricKeyDetails?.modulusLength ?? 0;
  if (biti < 1024 || biti > 8192) {
    throw new EroareCheieTbi(`${ce} are o lungime neobisnuita (${biti} biti). Verifica fisierul primit de la tbi bank.`);
  }
  return biti;
}

export type CheieCitita = { cheie: KeyObject; biti: number };

/**
 * Cheia publica tbi (`pub.pem` din arhiva `Chei_SFTL_<cod>`). Primeste si certificatul (`pub.crt`)
 * si forma PKCS#1 („RSA PUBLIC KEY"), fiindca toate trei vin in aceeasi arhiva.
 */
export function citesteCheiaPublicaTbi(text: string): CheieCitita {
  const t = (text ?? "").trim();
  if (!t) throw new EroareCheieTbi("Lipseste cheia publica tbi.");
  const bloc = blocPem(t);
  if (!bloc) {
    throw new EroareCheieTbi(
      "Cheia publica tbi trebuie lipita intreaga, de la -----BEGIN PUBLIC KEY----- pana la -----END PUBLIC KEY-----.",
    );
  }
  if (/PRIVATE KEY/.test(bloc.eticheta)) {
    throw new EroareCheieTbi(
      "Ai pus o cheie PRIVATA in locul cheii publice tbi. Aici merge fisierul pub.pem din arhiva Chei_SFTL_.",
    );
  }
  if (!BASE64.test(bloc.corp)) throw new EroareCheieTbi("Cheia publica tbi e stricata: contine caractere care nu au ce cauta intr-o cheie.");
  let cheie: KeyObject;
  try {
    if (bloc.eticheta === "CERTIFICATE") {
      cheie = new X509Certificate(refaPem("CERTIFICATE", bloc.corp)).publicKey;
    } else if (bloc.eticheta === "PUBLIC KEY" || bloc.eticheta === "RSA PUBLIC KEY") {
      cheie = createPublicKey({ key: refaPem(bloc.eticheta, bloc.corp), format: "pem" });
    } else {
      throw new EroareCheieTbi(`Fisierul pare sa fie altceva („${bloc.eticheta}”). Aici merge pub.pem din arhiva Chei_SFTL_.`);
    }
  } catch (e) {
    if (e instanceof EroareCheieTbi) throw e;
    throw new EroareCheieTbi("Cheia publica tbi nu poate fi citita. Lipeste din nou continutul fisierului pub.pem, fara modificari.");
  }
  return { cheie, biti: verificaRsa(cheie, "Cheia publica tbi") };
}

/** Cheia privata a magazinului (`priv_key.pem` din arhiva `Chei_Comerciant_<cod>`). */
export function citesteCheiaPrivata(text: string): CheieCitita {
  const t = (text ?? "").trim();
  if (!t) throw new EroareCheieTbi("Lipseste cheia privata a magazinului.");
  const bloc = blocPem(t);
  if (!bloc) {
    throw new EroareCheieTbi(
      "Cheia privata trebuie lipita intreaga, de la -----BEGIN PRIVATE KEY----- pana la -----END PRIVATE KEY-----.",
    );
  }
  if (bloc.eticheta === "PUBLIC KEY" || bloc.eticheta === "RSA PUBLIC KEY" || bloc.eticheta === "CERTIFICATE") {
    throw new EroareCheieTbi(
      "Ai pus o cheie PUBLICA in locul cheii private. Aici merge fisierul priv_key.pem din arhiva Chei_Comerciant_.",
    );
  }
  if (bloc.criptatCuParola) {
    throw new EroareCheieTbi(
      "Cheia privata e protejata cu parola. Cere echipei tbi bank fisierul priv_key.pem fara parola, asa cum il trimit de obicei.",
    );
  }
  if (bloc.eticheta !== "PRIVATE KEY" && bloc.eticheta !== "RSA PRIVATE KEY") {
    throw new EroareCheieTbi(`Fisierul pare sa fie altceva („${bloc.eticheta}”). Aici merge priv_key.pem din arhiva Chei_Comerciant_.`);
  }
  if (!BASE64.test(bloc.corp)) throw new EroareCheieTbi("Cheia privata e stricata: contine caractere care nu au ce cauta intr-o cheie.");
  let cheie: KeyObject;
  try {
    cheie = createPrivateKey({ key: refaPem(bloc.eticheta, bloc.corp), format: "pem" });
  } catch {
    throw new EroareCheieTbi("Cheia privata nu poate fi citita. Lipeste din nou continutul fisierului priv_key.pem, fara modificari.");
  }
  return { cheie, biti: verificaRsa(cheie, "Cheia privata") };
}

/** Cheia publica in forma DER, pentru comparatii si amprente. */
function spki(cheie: KeyObject): Buffer {
  const publica = cheie.type === "private" ? createPublicKey(cheie) : cheie;
  return publica.export({ type: "spki", format: "der" }) as Buffer;
}

/** Cele doua chei sunt jumatatile ACELEIASI perechi? */
export function aceeasiPereche(publica: KeyObject, privata: KeyObject): boolean {
  return spki(publica).equals(spki(privata));
}

/**
 * Amprenta scurta a unei chei (SHA-256 peste forma publica), ca omul sa poata compara in panou ce
 * a salvat cu ce a primit, fara ca cheia sa mai coboare in browser.
 */
export function amprentaCheii(cheie: KeyObject): string {
  const h = createHash("sha256").update(spki(cheie)).digest("hex").toUpperCase();
  return (h.slice(0, 16).match(/.{4}/g) ?? []).join(":");
}

function octetiPeBucata(biti: number): number {
  return Math.ceil(biti / 8);
}

/** Textul, criptat pentru tbi: bucati de (k - 11) octeti, PKCS#1 v1.5, lipite, base64. */
export function cripteazaPentruTbi(text: string, publica: CheieCitita): string {
  const octeti = Buffer.from(text, "utf8");
  if (octeti.length === 0) throw new EroareCriptareTbi("Nu e nimic de criptat.");
  const bucata = octetiPeBucata(publica.biti) - 11;
  const iesire: Buffer[] = [];
  for (let i = 0; i < octeti.length; i += bucata) {
    iesire.push(publicEncrypt(
      { key: publica.cheie, padding: constants.RSA_PKCS1_PADDING },
      octeti.subarray(i, Math.min(i + bucata, octeti.length)),
    ));
  }
  return Buffer.concat(iesire).toString("base64");
}

/**
 * Base64 primit de la tbi, adus la forma standard.
 *
 * ⚠ Un `+` trimis intr-un formular fara codare ajunge la noi ca SPATIU („a+b" -> „a b"). Base64
 * nu contine niciodata spatii, deci un spatiu de acolo e sigur un `+` pierdut. Iar varianta
 * „URL-safe" (`-`, `_`) se intoarce la cea standard.
 */
export function normalizeazaBase64(v: string): string {
  let s = String(v ?? "").trim().replace(/ /g, "+").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  s = s.replace(/=+$/, "");
  if (!s || !/^[A-Za-z0-9+/]+$/.test(s)) throw new EroareCriptareTbi("Vestea nu e in base64.");
  const rest = s.length % 4;
  if (rest === 1) throw new EroareCriptareTbi("Vestea in base64 e trunchiata.");
  if (rest) s += "=".repeat(4 - rest);
  return s;
}

/**
 * O bucata, descifrata. Calea obisnuita e PKCS#1 din OpenSSL (cu respingere implicita). Doar daca
 * Node-ul refuza umplutura asta la descifrare (versiunile vechi, fara respingere implicita, dupa
 * CVE-2023-46809), se descifreaza fara umplutura si se scoate umplutura aici.
 *
 * ⚠ Calea de rezerva nu e aparata de atacul Marvin. Aici nu conteaza: o descifrare se incearca
 * numai dupa ce cererea a dovedit jetonul secret din adresa (`/api/tbi/notificare/<jeton>`), deci
 * un strain nu poate folosi ruta ca oracol.
 */
function descifreazaBucata(bucata: Buffer, privata: KeyObject): Buffer {
  try {
    return privateDecrypt({ key: privata, padding: constants.RSA_PKCS1_PADDING }, bucata);
  } catch (e) {
    const cod = (e as { code?: string }).code;
    const mesaj = (e as Error).message ?? "";
    if (cod !== "ERR_INVALID_ARG_VALUE" || !/RSA_PKCS1_PADDING/.test(mesaj)) throw e;
  }
  const brut = privateDecrypt({ key: privata, padding: constants.RSA_NO_PADDING }, bucata);
  if (brut.length < 11 || brut[0] !== 0x00 || brut[1] !== 0x02) throw new EroareCriptareTbi("Umplutura PKCS#1 nu se potriveste.");
  const sep = brut.indexOf(0x00, 2);
  if (sep < 10) throw new EroareCriptareTbi("Umplutura PKCS#1 nu se potriveste.");
  return brut.subarray(sep + 1);
}

/** Vestea de la tbi, descifrata cu cheia privata a magazinului. */
export function descifreazaDeLaTbi(base64: string, privata: CheieCitita): string {
  const octeti = Buffer.from(normalizeazaBase64(base64), "base64");
  const k = octetiPeBucata(privata.biti);
  if (octeti.length === 0 || octeti.length % k !== 0) {
    throw new EroareCriptareTbi(`Vestea are ${octeti.length} octeti, care nu se impart in bucati de ${k}: nu e criptata cu cheia asta.`);
  }
  const bucati: Buffer[] = [];
  for (let i = 0; i < octeti.length; i += k) {
    try {
      bucati.push(descifreazaBucata(octeti.subarray(i, i + k), privata.cheie));
    } catch (e) {
      if (e instanceof EroareCriptareTbi) throw e;
      throw new EroareCriptareTbi("Vestea nu se poate descifra cu cheia privata a magazinului.");
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(bucati));
  } catch {
    throw new EroareCriptareTbi("Vestea nu se poate descifra cu cheia privata a magazinului (iese text fara sens).");
  }
}
