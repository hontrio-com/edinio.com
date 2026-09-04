import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import config from "../../next.config";
import { bareHost, isPlatformHost, RE_GAZDA_PLATFORMA } from "./platform-hosts";
import { NON_STORE_SEGMENTS, primulSegment } from "./segmente-rezervate";

/*
  ═══ DE CE EXISTA FISIERUL ASTA (04.09.2026) ═══

  `redirects()` din `next.config.ts` ruleaza INAINTEA proxy-ului si, fara `has`,
  pe ORICE gazda. Doua urmari, amandoua tacute:

  1. Pe domeniul propriu al unui comerciant, o adresa a PLATFORMEI ii fura o
     pagina proprie. Masurat in productie pe 04.09.2026, inainte de reparatie:
     `https://bricosmart.ro/despre` -> 308 -> `https://bricosmart.ro/`.

  2. Pe gazda platformei, un magazin al carui SLUG e chiar sursa unei
     redirectari e trimis in alta parte inainte ca proxy-ul sa-l recunoasca —
     deci vitrina lui e de negasit si nici nu primeste antetul `noindex`.

  Probele de mai jos apara amandoua regulile pe CONFIGURAREA ADEVARATA, citita
  din `next.config.ts`, nu pe o copie a ei. O redirectare noua adaugata fara
  `has`, sau catre un segment nerezervat, le face rosii.
*/

const AICI = dirname(fileURLToPath(import.meta.url));

/** Redirectarile chiar asa cum le da configurarea. */
async function redirectarile() {
  /* Faza de dezvoltare dinadins: `phase-production-build` ar porni verificarea
     cheilor de productie, care n-are treaba cu ce se masoara aici. */
  const cfg = config("phase-development-server");
  assert.ok(typeof cfg.redirects === "function", "configurarea nu mai are redirects()");
  return await cfg.redirects!();
}

describe("redirectarile din next.config.ts", () => {
  test("sunt cel putin cinci si fiecare are sursa si tinta", async () => {
    const r = await redirectarile();
    assert.ok(r.length >= 5, `prea putine redirectari: ${r.length}`);
    for (const x of r) {
      assert.ok(x.source.startsWith("/"), `sursa nu e o cale: ${x.source}`);
      assert.ok(x.destination.length > 0, `tinta goala pentru ${x.source}`);
    }
  });

  test("FIECARE e legata de gazda platformei", async () => {
    const r = await redirectarile();
    for (const x of r) {
      const gazde = (x.has ?? []).filter((h) => h.type === "host");
      assert.equal(
        gazde.length,
        1,
        `${x.source} nu are exact o conditie de gazda: ${JSON.stringify(x.has)}`,
      );
      assert.equal(
        gazde[0].value,
        RE_GAZDA_PLATFORMA,
        `${x.source} filtreaza dupa alta expresie de gazda decat cea din platform-hosts.ts`,
      );
    }
  });

  test("nicio redirectare nu fura o adresa care raspunde 410", async () => {
    /*
      ⚠ GOLUL ASTA A FOST GASIT DE O REVIZIE, si e cel mai usor de cazut in el.

      `/industrii` a fost STEARSA pe 04.09.2026 si raspunde 410 dintr-un
      `route.ts`. Dar `redirects()` ruleaza INAINTEA rutarii (documentat in
      `node_modules/next/dist/docs/.../proxy.md`: „2. redirects" vine inaintea lui
      „5. Filesystem routes"). Deci cineva care „uniformizeaza" adresa ca la
      celelalte cinci — adaugand un rand chiar langa `/roadmap`, `/start`,
      `/despre`, `/magazin-online`, `/index` — ar face `/industrii` sa raspunda
      308 catre pagina de start, adica o redirectare inselatoare pe care Google o
      trateaza tot ca pe un 404, doar mai incet.

      ⚠ IAR TOATA SUITA AR FI RAMAS VERDE. `route.test.ts` cheama `GET()` direct,
      deci tot vede 410; scanarea lui se uita in patru fisiere, iar
      `next.config.ts` nu e printre ele; proba de mai jos cere doar ca segmentul
      sa fie rezervat, si `industrii` CHIAR e rezervat.

      Aici se inchide: o adresa care are ruta ei de 410 nu poate primi si
      redirectare. Lista se citeste de pe disc, nu se scrie de mana — o a doua
      adresa retrasa maine intra singura.
    */
    const APP = join(AICI, "..", "app");
    const retrase = new Set<string>();
    for (const d of readdirSync(APP, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith("(") || d.name.startsWith("[")) continue;
      const ruta = join(APP, d.name, "route.ts");
      if (!existsSync(ruta)) continue;
      if (/status:\s*410/.test(readFileSync(ruta, "utf8"))) retrase.add(d.name);
    }
    assert.ok(retrase.size > 0, "nu s-a gasit nicio ruta de 410 — proba ar fi vida");

    for (const x of await redirectarile()) {
      const segment = primulSegment(x.source);
      assert.ok(
        !retrase.has(segment),
        `„${segment}" raspunde 410 dintr-o ruta, dar ${x.source} ii pune si o redirectare. ` +
          "`redirects()` ruleaza INAINTEA rutarii, deci redirectarea castiga si adresa nu mai da 410.",
      );
    }
  });

  test("primul segment al fiecarei surse e REZERVAT, deci nu poate fi slug de magazin", async () => {
    const r = await redirectarile();
    for (const x of r) {
      const segment = primulSegment(x.source);
      assert.ok(
        NON_STORE_SEGMENTS.has(segment),
        `„${segment}" (din ${x.source}) nu e in NON_STORE_SEGMENTS: un magazin cu slugul asta ar fi ` +
          "trimis cu 308 inainte ca proxy-ul sa-l vada, deci vitrina lui ar fi de negasit",
      );
    }
  });
});

/*
  Expresia de gazda se compune din chiar constantele lui `isPlatformHost`. Ca sa
  nu ramana o compunere care „arata bine", se confrunta cu functia pe un tabel de
  gazde adevarate — inclusiv domeniile a doi comercianti vii, care sunt CHIAR
  cazul pe care redirectarile il loveau.
*/
const GAZDE: [string, boolean][] = [
  ["www.edinio.com", true],
  ["edinio.com", true],
  ["ajutor.edinio.com", true],
  ["localhost", true],
  ["edinio-git-o-ramura.vercel.app", true],
  ["bricosmart.ro", false],
  ["esafe.ro", false],
  ["ultimulmagazin.ro", false],
  ["vetdepo.ro", false],
  /* Capcanele vechi: se termina cu „edinio.com" fara sa fie al nostru. */
  ["notedinio.com", false],
  ["edinio.com.atacator.ro", false],
  ["vercel.app.atacator.ro", false],
];

describe("expresia de gazda spune acelasi lucru ca isPlatformHost", () => {
  const re = new RegExp(`^${RE_GAZDA_PLATFORMA}$`);

  for (const [gazda, aPlatformei] of GAZDE) {
    test(`${gazda} -> ${aPlatformei ? "platforma" : "comerciant"}`, () => {
      assert.equal(
        re.test(gazda),
        aPlatformei,
        `expresia raspunde altfel decat asteptam pentru ${gazda}`,
      );
      assert.equal(
        isPlatformHost(gazda),
        aPlatformei,
        `isPlatformHost raspunde altfel decat expresia pentru ${gazda}`,
      );
    });
  }

  test("portul si majusculele sunt taiate de Next, nu de expresie", () => {
    /*
      `matchHas` face `host.split(":", 1)[0].toLowerCase()` INAINTE de potrivire
      (`prepare-destination.js`). Expresia noastra se bizuie pe asta: n-are nici
      `:\d+`, nici steagul `i`.

      ⚠ AICI ERA `re.test("localhost".toLowerCase())`, adica o tautologie —
      `"localhost".toLowerCase()` e tot „localhost", deci proba nu spunea nimic
      despre majuscule. Acum se masoara amandoua fetele: expresia SINGURA le
      refuza, iar cu normalizarea lui Next in fata le primeste.
    */
    assert.equal(re.test("localhost:3000"), false, "expresia singura nu trebuie sa accepte portul");
    assert.equal(re.test("WWW.EDINIO.COM"), false, "expresia singura nu trebuie sa accepte majusculele");

    /** Ce vede expresia dupa ce Next a normalizat gazda. */
    const caNext = (gazdaBruta: string) => re.test(bareHost(gazdaBruta));
    assert.equal(caNext("localhost:3000"), true);
    assert.equal(caNext("WWW.EDINIO.COM"), true);
    assert.equal(caNext("Edinio.COM:443"), true);
    assert.equal(caNext("BRICOSMART.RO"), false, "un domeniu de comerciant nu devine al platformei cu majuscule");
  });
});
