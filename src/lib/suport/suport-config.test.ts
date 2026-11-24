import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  ASPECT_IMPLICIT, DATE_IMPLICITE, LUNGIME_TEXT_BUTON, SECRETE_SUPORT, aspectDin, citesteSuport, contPublic,
  furnizorPornit, suportGata, vitrinaSuport, type SuportConfig,
} from "./config";
import { FURNIZORI, paragrafPolitica, scoateIdentificatorii } from "./furnizori";
import { VIATA_JWT_SEC, hmacSha256Hex, identitateaPentru, jwtHS256, telefonInternational } from "./semnaturi";
import { bazaIntercom, cerereaDeVerificare, verdictulVerificarii } from "./verifica";

/* ⚠ Toate valorile de aici sunt INVENTATE, cu forma celor adevarate. Nicio cheie a vreunui cont real. */
const TIDIO = "abcdefghijklmnopqrstuvwxyz012345";
const TAWK_P = "0123456789abcdef01234567";
const ZENDESK = "00000000-1111-4222-8333-444444444444";
const KID = "app_0000aaaa1111bbbb2222cccc";

function decodeaza(parte: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(parte.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

/* ═══ Identificatorii: ce a lipit omul ═══ */

test("Tidio: cheia goala si codul de instalare dau aceeasi cheie", () => {
  assert.deepEqual(scoateIdentificatorii("tidio", ` ${TIDIO} `), { cheie: TIDIO });
  assert.deepEqual(
    scoateIdentificatorii("tidio", `<script src="//code.tidio.co/${TIDIO}.js" async></script>`),
    { cheie: TIDIO },
  );
  assert.equal(scoateIdentificatorii("tidio", "nu e o cheie!"), null);
});

test("tawk.to: linkul de chat direct, codul widgetului si cele doua valori alaturate", () => {
  const asteptat = { proprietate: TAWK_P, widget: "1abcdefgh" };
  assert.deepEqual(scoateIdentificatorii("tawkto", `https://tawk.to/chat/${TAWK_P}/1abcdefgh`), asteptat);
  assert.deepEqual(scoateIdentificatorii("tawkto", `s1.src='https://embed.tawk.to/${TAWK_P}/1abcdefgh';`), asteptat);
  assert.deepEqual(scoateIdentificatorii("tawkto", `${TAWK_P} / 1abcdefgh`), asteptat);
  assert.deepEqual(scoateIdentificatorii("tawkto", `${TAWK_P}/default`), { proprietate: TAWK_P, widget: "default" });
  /* Cheia „JavaScript API” (40 de cifre hexa) NU e un Property ID (24): omul le incurca usor. */
  assert.equal(scoateIdentificatorii("tawkto", "0123456789abcdef0123456789abcdef01234567"), null);
});

test("Intercom: ID-ul gol, adresa din browser si codul de instalare", () => {
  assert.deepEqual(scoateIdentificatorii("intercom", "abcd1234"), { app: "abcd1234" });
  assert.deepEqual(scoateIdentificatorii("intercom", "https://app.intercom.com/a/apps/abcd1234/home"), { app: "abcd1234" });
  assert.deepEqual(scoateIdentificatorii("intercom", `window.intercomSettings = { app_id: "abcd1234" };`), { app: "abcd1234" });
  assert.deepEqual(scoateIdentificatorii("intercom", "s.src='https://widget.intercom.io/widget/abcd1234';"), { app: "abcd1234" });
  assert.equal(scoateIdentificatorii("intercom", "ABCD 1234"), null);
});

test("Zendesk: cheia goala si codul de instalare; literele mari devin mici", () => {
  assert.deepEqual(scoateIdentificatorii("zendesk", ZENDESK.toUpperCase()), { cheie: ZENDESK });
  assert.deepEqual(
    scoateIdentificatorii("zendesk", `<script id="ze-snippet" src="https://static.zdassets.com/ekr/snippet.js?key=${ZENDESK}"> </script>`),
    { cheie: ZENDESK },
  );
  /* Id-ul unei chei de API (`app_…`) nu e cheia widgetului. */
  assert.equal(scoateIdentificatorii("zendesk", KID), null);
});

test("⚠ un identificator care ar putea iesi din adresa de script nu trece", () => {
  for (const rau of ['abc"><script>', "abc/../x", "abc?x=1", "abc def", "abc\nx", "<b>"]) {
    assert.equal(contPublic("tidio", { tidio: { cheie: rau } }), null, rau);
    assert.equal(contPublic("intercom", { intercom: { app: rau } }), null, rau);
    assert.equal(contPublic("zendesk", { zendesk: { cheie: rau } }), null, rau);
    assert.equal(contPublic("tawkto", { tawkto: { proprietate: TAWK_P, widget: rau } }), null, rau);
  }
  assert.equal(contPublic("altceva", { tidio: { cheie: TIDIO } }), null);
});

/* ═══ Configurarea ═══ */

test("o configurare goala sau stricata cade pe implicit, fara sa arunce", () => {
  for (const brut of [null, undefined, "x", 5, [], { aspect: "x", date: 3, conturi: "y", furnizor: "nimeni" }]) {
    const c = citesteSuport(brut);
    assert.equal(c.activ, false);
    assert.equal(c.furnizor, null);
    assert.deepEqual(c.aspect, ASPECT_IMPLICIT);
    assert.deepEqual(c.date, DATE_IMPLICITE);
    assert.equal(suportGata(c), false);
  }
});

test("identitatea clientului porneste OPRITA; pagina si comanda, pornite", () => {
  assert.deepEqual(DATE_IMPLICITE, { identitate: false, pagina: true, comanda: true });
  assert.equal(ASPECT_IMPLICIT.buton, "magazin");
  assert.equal(ASPECT_IMPLICIT.incarcare, "apasare");
});

test("textul de langa buton: un singur rand, taiat la lungime", () => {
  const a = aspectDin({ text: "  Ai nevoie\n de   ajutor?  " + "x".repeat(80) });
  assert.equal(a.text.length, LUNGIME_TEXT_BUTON);
  assert.ok(a.text.startsWith("Ai nevoie de ajutor?"));
  assert.ok(!/\n/.test(a.text));
});

test("⚠ butonul furnizorului inseamna incarcare automata: altfel n-ar avea nimeni pe ce apasa", () => {
  assert.equal(aspectDin({ buton: "furnizor", incarcare: "apasare" }).incarcare, "automat");
  assert.equal(aspectDin({ buton: "magazin", incarcare: "apasare" }).incarcare, "apasare");
  assert.equal(aspectDin({ buton: "magazin", incarcare: "automat" }).incarcare, "automat");
});

test("chatul e in magazin numai pornit, cu furnizor ales si identificatorul lui bun", () => {
  const baza = { conturi: { tidio: { cheie: TIDIO }, intercom: { app: "abcd1234" } } };
  assert.equal(suportGata({ ...baza, activ: true, furnizor: "tidio" }), true);
  assert.equal(furnizorPornit({ ...baza, activ: true, furnizor: "intercom" }), "intercom");
  assert.equal(suportGata({ ...baza, activ: false, furnizor: "tidio" }), false);
  assert.equal(suportGata({ ...baza, activ: true, furnizor: "zendesk" }), false, "ales, dar fara cheie");
  assert.equal(suportGata({ ...baza, activ: true, furnizor: null }), false);
});

test("⚠ vitrina primeste NUMAI identificatorii furnizorului pornit, si niciun secret", () => {
  const config: SuportConfig = citesteSuport({
    activ: true,
    furnizor: "tawkto",
    conturi: { tidio: { cheie: TIDIO }, tawkto: { proprietate: TAWK_P, widget: "default" }, zendesk: { cheie: ZENDESK, kid: KID } },
    tawkto_cheie_api: "inventat-tawk-1234",
    intercom_secret: "inventat-intercom-1234",
    zendesk_secret: "inventat-zendesk-1234",
  });
  const v = vitrinaSuport({ sp_activ: config.activ, sp_furnizor: config.furnizor, sp_conturi: config.conturi, sp_aspect: config.aspect, sp_date: config.date });
  assert.ok(v);
  const text = JSON.stringify(v);
  assert.deepEqual(v.cont, { furnizor: "tawkto", proprietate: TAWK_P, widget: "default" });
  for (const strain of [TIDIO, ZENDESK, KID, "inventat-tawk-1234", "inventat-intercom-1234", "inventat-zendesk-1234"]) {
    assert.ok(!text.includes(strain), `nu are ce cauta in pagina: ${strain}`);
  }
  assert.equal(vitrinaSuport({ sp_activ: false, sp_furnizor: "tawkto", sp_conturi: config.conturi }), null);
  assert.equal(vitrinaSuport(null), null);
});

test("secretele sunt exact cele trei, iar citirea le pastreaza neatinse", () => {
  assert.deepEqual([...SECRETE_SUPORT], ["tawkto_cheie_api", "intercom_secret", "zendesk_secret"]);
  const c = citesteSuport({ tawkto_cheie_api: "enc.v1.abc", intercom_secret: "", zendesk_secret: 5 });
  assert.equal(c.tawkto_cheie_api, "enc.v1.abc");
  assert.equal(c.intercom_secret, undefined);
  assert.equal(c.zendesk_secret, undefined);
});

/* ═══ Semnaturile ═══ */

test("JWT HS256: exact tokenul de referinta (exemplul public de pe jwt.io)", () => {
  const token = jwtHS256({ sub: "1234567890", name: "John Doe", iat: 1516239022 }, "your-256-bit-secret");
  const [antet, corp, semnatura] = token.split(".");
  assert.equal(antet, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  assert.equal(corp, "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ");
  assert.equal(semnatura, "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
});

test("HMAC-SHA256: vectorul din RFC 4231 (cazul 2)", () => {
  assert.equal(
    hmacSha256Hex("what do ya want for nothing?", "Jefe"),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

const CLIENT = { id: "0b7c2a9e-1111-4222-8333-444455556666", nume: "Ana Pop", email: " Ana@Exemplu.RO ", telefon: "0712 345 678" };
const ACUM = Date.UTC(2026, 10, 22, 10, 0, 0);

test("tawk.to: semnatura e HMAC-SHA256 din id-ul contului, cu cheia API", () => {
  const r = identitateaPentru("tawkto", { conturi: {}, tawkto_cheie_api: "inventat-tawk-1234" }, CLIENT, ACUM);
  assert.ok(r && r.furnizor === "tawkto");
  assert.equal(r.hash, createHmac("sha256", "inventat-tawk-1234").update(CLIENT.id).digest("hex"));
  assert.equal(r.email, "ana@exemplu.ro");
  assert.equal(r.telefon, "+40712345678");
});

test("Intercom: JWT cu `user_id`, email si expirare, semnat cu secretul de mesagerie", () => {
  const r = identitateaPentru("intercom", { conturi: {}, intercom_secret: "inventat-intercom-1234" }, CLIENT, ACUM);
  assert.ok(r && r.furnizor === "intercom");
  const [antet, corp, semnatura] = r.jwt.split(".");
  assert.deepEqual(decodeaza(antet), { alg: "HS256", typ: "JWT" });
  const p = decodeaza(corp);
  assert.equal(p.user_id, CLIENT.id);
  assert.equal(p.email, "ana@exemplu.ro");
  assert.equal(p.name, "Ana Pop");
  assert.equal(p.exp, Math.floor(ACUM / 1000) + VIATA_JWT_SEC);
  const asteptata = createHmac("sha256", "inventat-intercom-1234").update(`${antet}.${corp}`).digest("base64url");
  assert.equal(semnatura, asteptata);
});

test("Zendesk: JWT cu `kid` in antet, `scope: user` si `external_id`", () => {
  const r = identitateaPentru(
    "zendesk",
    { conturi: { zendesk: { cheie: ZENDESK, kid: KID } }, zendesk_secret: "inventat-zendesk-1234" },
    CLIENT,
    ACUM,
  );
  assert.ok(r && r.furnizor === "zendesk");
  const [antet, corp] = r.jwt.split(".");
  assert.deepEqual(decodeaza(antet), { alg: "HS256", typ: "JWT", kid: KID });
  const p = decodeaza(corp);
  assert.equal(p.scope, "user");
  assert.equal(p.external_id, CLIENT.id);
  assert.equal(p.email_verified, true);
  assert.equal(p.exp, Math.floor(ACUM / 1000) + VIATA_JWT_SEC);
});

test("⚠ fara secret nu pleaca nimic la cei trei cu semnatura; Tidio nu semneaza", () => {
  assert.equal(identitateaPentru("tawkto", { conturi: {} }, CLIENT, ACUM), null);
  assert.equal(identitateaPentru("intercom", { conturi: {} }, CLIENT, ACUM), null);
  assert.equal(identitateaPentru("zendesk", { conturi: {}, zendesk_secret: "inventat-zendesk-1234" }, CLIENT, ACUM), null, "secret fara kid");
  assert.equal(identitateaPentru("zendesk", { conturi: { zendesk: { kid: KID } } }, CLIENT, ACUM), null, "kid fara secret");
  const tidio = identitateaPentru("tidio", { conturi: {} }, CLIENT, ACUM);
  assert.deepEqual(tidio, { furnizor: "tidio", id: CLIENT.id, nume: "Ana Pop", email: "ana@exemplu.ro", telefon: "+40712345678" });
});

test("fara email sau fara id nu exista identitate", () => {
  assert.equal(identitateaPentru("tidio", { conturi: {} }, { ...CLIENT, email: "" }, ACUM), null);
  assert.equal(identitateaPentru("tidio", { conturi: {} }, { ...CLIENT, id: " " }, ACUM), null);
});

test("telefonul pleaca in forma internationala sau deloc", () => {
  assert.equal(telefonInternational("0712345678"), "+40712345678");
  assert.equal(telefonInternational("+40 712 345 678"), "+40712345678");
  assert.equal(telefonInternational("+49 30 1234567"), "+49301234567");
  assert.equal(telefonInternational("abc"), "");
  assert.equal(telefonInternational(null), "");
});

/* ═══ Verificarea cheii ═══ */

test("⚠ verificarea intreaba NUMAI gazdele furnizorilor", () => {
  const cereri = [
    cerereaDeVerificare({ furnizor: "tidio", cheie: TIDIO }),
    cerereaDeVerificare({ furnizor: "tawkto", proprietate: TAWK_P, widget: "default" }),
    cerereaDeVerificare({ furnizor: "zendesk", cheie: ZENDESK }),
    cerereaDeVerificare({ furnizor: "intercom", app: "abcd1234", regiune: "eu" }),
  ];
  assert.deepEqual(
    cereri.map((c) => new URL(c.url).host),
    ["code.tidio.co", "embed.tawk.to", "ekr.zdassets.com", "api-iam.eu.intercom.io"],
  );
  assert.equal(cereri[3].init.method, "POST");
  assert.match(String(cereri[3].init.body), /app_id=abcd1234/);
  assert.equal(bazaIntercom("au"), "https://api-iam.au.intercom.io");
});

test("verdictul: 404 = identificator gresit; 403 la Intercom = spatiul exista; altceva = nestiut", () => {
  const tidio = { furnizor: "tidio", cheie: TIDIO } as const;
  const intercom = { furnizor: "intercom", app: "abcd1234", regiune: "us" } as const;
  assert.equal(verdictulVerificarii(tidio, 200).stare, "buna");
  assert.equal(verdictulVerificarii(tidio, 404).stare, "gresita");
  assert.equal(verdictulVerificarii(tidio, 503).stare, "nestiut");
  assert.equal(verdictulVerificarii(intercom, 404).stare, "gresita");
  assert.equal(verdictulVerificarii(intercom, 200).stare, "buna");
  /* ⚠ Masurat cu un spatiu adevarat (23.11.2026): de pe server 403, din browser 200 si fereastra deschisa.
     Citit ca „oprit la ei”, 403 trimitea comerciantul sa repare in Intercom ceva ce mergea. */
  assert.equal(verdictulVerificarii(intercom, 403).stare, "buna");
  assert.equal(verdictulVerificarii(intercom, 401).stare, "buna");
  /* Numai la Intercom: la ceilalti, un 403 ramane un raspuns pe care nu-l stim citi. */
  assert.equal(verdictulVerificarii(tidio, 403).stare, "nestiut");
  assert.equal(verdictulVerificarii({ furnizor: "zendesk", cheie: ZENDESK }, 403).stare, "nestiut");
});

/* ═══ Furnizorii ═══ */

test("fiecare furnizor are gazde https si textele lui; numai Tidio nu semneaza", () => {
  for (const f of Object.values(FURNIZORI)) {
    assert.ok(f.gazde.length > 0 && f.gazde.every((g) => /^https:\/\/[a-z0-9.-]+$/.test(g)), f.id);
    assert.ok(f.undeECheia.length > 20 && f.aplicatie.startsWith("https://"), f.id);
    assert.equal(f.semneaza, f.id !== "tidio");
  }
});

test("paragraful pentru politica pomeneste emailul numai cand el chiar pleaca", () => {
  assert.ok(!paragrafPolitica("tidio", false).includes("email"));
  assert.ok(paragrafPolitica("tidio", true).includes("adresa ta de email"));
});
