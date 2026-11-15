import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { constants, generateKeyPairSync, privateDecrypt, publicEncrypt } from "node:crypto";
import {
  aceeasiPereche, amprentaCheii, citesteCheiaPrivata, citesteCheiaPublicaTbi, cripteazaPentruTbi,
  descifreazaDeLaTbi, EroareCheieTbi, EroareCriptareTbi, normalizeazaBase64,
} from "./cripto";

/*
 * ═══ CRIPTAREA TBI: BUCATI DE OCTETI, PKCS#1 v1.5, BASE64 ═══
 *
 * ⚠ Probele astea folosesc chei GENERATE aici, nu cheile de test publicate de tbi: o cheie privata
 * scrisa in depozit (chiar si una de test, publica) ar fi un fals pozitiv vesnic pentru scanerele de
 * secrete si un tipar prost. Compatibilitatea cu ei s-a verificat O DATA, pe fir, cu vestea-exemplu
 * din pachetul lor de test (`docs/plati/TBI.md`, „Ce s-a verificat"), iar aici se apara REGULILE
 * care o fac sa mearga: bucatile de octeti, lipirea, ordinea, umplutura.
 */

function pereche(biti: number) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: biti,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { pub: publicKey, priv: privateKey };
}

const P2048 = pereche(2048);
const ALTA = pereche(2048);

/** Algoritmul din exemplul lor PHP, rescris independent: `substr` pe octeti, (k - 11) pe bucata. */
function cripteazaCaPhp(text: string, pemPublic: string, biti: number): string {
  const octeti = Buffer.from(text, "utf8");
  const bucata = Math.ceil(biti / 8) - 11;
  const iesire: Buffer[] = [];
  for (let i = 0; i < octeti.length; i += bucata) {
    iesire.push(publicEncrypt({ key: pemPublic, padding: constants.RSA_PKCS1_PADDING }, octeti.subarray(i, i + bucata)));
  }
  return Buffer.concat(iesire).toString("base64");
}

describe("dus-intors, pe toate lungimile de cheie si pe texte lungi", () => {
  for (const biti of [1024, 2048, 4096]) {
    test(`${biti} biti`, () => {
      const { pub, priv } = biti === 2048 ? P2048 : pereche(biti);
      const publica = citesteCheiaPublicaTbi(pub);
      const privata = citesteCheiaPrivata(priv);
      assert.equal(publica.biti, biti);
      const text = JSON.stringify({ order_id: "700000001", items: Array.from({ length: 30 }, (_, i) => ({ name: `Produs ${i}` })) });
      const c = cripteazaPentruTbi(text, publica);
      const k = biti / 8;
      /* Lungimea dovedeste bucatile: ceil(octeti / (k - 11)) bucati de cate k octeti. */
      assert.equal(Buffer.from(c, "base64").length, Math.ceil(Buffer.byteLength(text) / (k - 11)) * k);
      assert.equal(descifreazaDeLaTbi(c, privata), text);
    });
  }
});

test("⚠⚠ diacriticele: bucatile sunt de OCTETI, iar textul se reface din octetii LIPITI", () => {
  /*
   * „ș" are doi octeti. Taiat pe caractere, o bucata ar fi depasit (k - 11) octeti si criptarea ar fi
   * cazut exact la comenzile cu diacritice; refacut bucata cu bucata, o litera rupta intre doua bucati
   * ar fi iesit stricata. Textul de mai jos pune litere de doi octeti peste fiecare granita.
   */
  const publica = citesteCheiaPublicaTbi(P2048.pub);
  const privata = citesteCheiaPrivata(P2048.priv);
  for (let deplasare = 0; deplasare < 4; deplasare++) {
    const text = "x".repeat(deplasare) + "Șosete bărbătești, mărimea 42; ăîâșț ĂÎÂȘȚ. ".repeat(40);
    assert.equal(descifreazaDeLaTbi(cripteazaPentruTbi(text, publica), privata), text, `deplasarea ${deplasare}`);
  }
});

test("⚠ ce criptam noi se descifreaza ca la ei, si ce cripteaza ei (algoritmul PHP) se descifreaza la noi", () => {
  const publica = citesteCheiaPublicaTbi(P2048.pub);
  const privata = citesteCheiaPrivata(P2048.priv);
  const text = JSON.stringify({ order_id: "528413423", status_id: 1, motiv: "Criterii eligibilitate ăîș" });
  /* Ei: exemplul PHP. Noi: descifram. */
  assert.equal(descifreazaDeLaTbi(cripteazaCaPhp(text, P2048.pub, 2048), privata), text);
  /* Noi: criptam. Ei: `openssl_private_decrypt` pe bucati de k octeti, lipite. */
  const octeti = Buffer.from(cripteazaPentruTbi(text, publica), "base64");
  const bucati: Buffer[] = [];
  for (let i = 0; i < octeti.length; i += 256) {
    bucati.push(privateDecrypt({ key: P2048.priv, padding: constants.RSA_PKCS1_PADDING }, octeti.subarray(i, i + 256)));
  }
  assert.equal(Buffer.concat(bucati).toString("utf8"), text);
});

test("⚠⚠ cheia GRESITA se prinde, desi descifrarea nu mai arunca (respingerea implicita)", () => {
  const c = cripteazaPentruTbi('{"order_id":"1","status_id":1,"motiv":""}', citesteCheiaPublicaTbi(P2048.pub));
  assert.throws(() => descifreazaDeLaTbi(c, citesteCheiaPrivata(ALTA.priv)), EroareCriptareTbi);
});

test("⚠ o veste trunchiata sau care nu e base64 nu trece", () => {
  const privata = citesteCheiaPrivata(P2048.priv);
  const c = cripteazaPentruTbi("salut", citesteCheiaPublicaTbi(P2048.pub));
  assert.throws(() => descifreazaDeLaTbi(c.slice(0, 100), privata), EroareCriptareTbi);
  assert.throws(() => descifreazaDeLaTbi("nu e base64 deloc!!", privata), EroareCriptareTbi);
  assert.throws(() => descifreazaDeLaTbi("", privata), EroareCriptareTbi);
});

test("⚠ base64 venit prin formular: „+” devenit spatiu, varianta URL-safe, randuri noi", () => {
  const privata = citesteCheiaPrivata(P2048.priv);
  const text = "o veste cu + si / in base64";
  let c = cripteazaPentruTbi(text, citesteCheiaPublicaTbi(P2048.pub));
  /* Ne asiguram ca exemplul chiar contine semnele de incercat. */
  for (let i = 0; i < 50 && !(c.includes("+") && c.includes("/")); i++) c = cripteazaPentruTbi(text, citesteCheiaPublicaTbi(P2048.pub));
  assert.equal(descifreazaDeLaTbi(c.replace(/\+/g, " "), privata), text);
  assert.equal(descifreazaDeLaTbi(c.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), privata), text);
  assert.equal(descifreazaDeLaTbi(c.replace(/(.{60})/g, "$1\r\n"), privata), text);
  assert.equal(normalizeazaBase64("YWJj"), "YWJj");
  assert.equal(normalizeazaBase64("YWI"), "YWI=");
});

describe("cititorul de chei: ce lipeste omul, si ce greseste", () => {
  test("cheia lipita pe un singur rand, cu spatii, se citeste la fel", () => {
    const unRand = P2048.priv.replace(/\n/g, " ");
    const c = cripteazaPentruTbi("abc", citesteCheiaPublicaTbi(P2048.pub.replace(/\n/g, "  ")));
    assert.equal(descifreazaDeLaTbi(c, citesteCheiaPrivata(unRand)), "abc");
  });

  test("⚠⚠ cheile inversate se spun pe nume, cu fisierul care trebuie", () => {
    assert.throws(() => citesteCheiaPublicaTbi(P2048.priv), (e: Error) => e instanceof EroareCheieTbi && /PRIVATA/.test(e.message) && /Chei_SFTL_/.test(e.message));
    assert.throws(() => citesteCheiaPrivata(P2048.pub), (e: Error) => e instanceof EroareCheieTbi && /PUBLICA/.test(e.message) && /Chei_Comerciant_/.test(e.message));
  });

  test("cheia protejata cu parola se refuza cu explicatie, nu cu „nu se poate citi”", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "parola" },
    });
    assert.throws(() => citesteCheiaPrivata(privateKey), /parola/);
  });

  test("gunoiul si campul gol se refuza", () => {
    assert.throws(() => citesteCheiaPublicaTbi(""), EroareCheieTbi);
    assert.throws(() => citesteCheiaPrivata("   "), EroareCheieTbi);
    assert.throws(() => citesteCheiaPublicaTbi("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"), EroareCheieTbi);
    assert.throws(() => citesteCheiaPublicaTbi("-----BEGIN PUBLIC KEY-----\n@@@@\n-----END PUBLIC KEY-----"), EroareCheieTbi);
  });

  test("o cheie care nu e RSA se refuza", () => {
    const ec = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    assert.throws(() => citesteCheiaPublicaTbi(ec.publicKey), /RSA/);
    assert.throws(() => citesteCheiaPrivata(ec.privateKey), /RSA/);
  });

  test("perechea si amprenta", () => {
    const publica = citesteCheiaPublicaTbi(P2048.pub);
    assert.equal(aceeasiPereche(publica.cheie, citesteCheiaPrivata(P2048.priv).cheie), true);
    assert.equal(aceeasiPereche(publica.cheie, citesteCheiaPrivata(ALTA.priv).cheie), false);
    /* Amprenta cheii private e a jumatatii ei publice: aceeasi cu a perechii. */
    assert.equal(amprentaCheii(publica.cheie), amprentaCheii(citesteCheiaPrivata(P2048.priv).cheie));
    assert.match(amprentaCheii(publica.cheie), /^[0-9A-F]{4}(:[0-9A-F]{4}){3}$/);
  });
});
