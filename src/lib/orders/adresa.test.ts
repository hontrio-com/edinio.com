import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { stradaCuNumar, stradaDestinatarului } from "./adresa";

/** Toate fisierele de cod dintr-un director si din cele de sub el. */
function subArbore(dir: string): string[] {
  const iesire: string[] = [];
  for (const nume of readdirSync(dir)) {
    const cale = `${dir}/${nume}`;
    if (statSync(cale).isDirectory()) iesire.push(...subArbore(cale));
    else if (/\.tsx?$/.test(nume) && !/\.test\.tsx?$/.test(nume)) iesire.push(cale);
  }
  return iesire;
}

/*
 * ADRESA SE CITESTE DIN AMANDOUA FAMILIILE DE CAMPURI.
 *
 * `shipping_address` are `street`+`street_no` (checkout propriu) SI `address`
 * (marketplace-uri, formulare vechi). Trei ferestre de AWB citeau doar una:
 * Colete Online si Woot trimiteau adresa GOALA pe orice comanda venita din
 * checkout-ul propriu needitat, iar la Colete goala devenea `street: "Adresa"`,
 * deci coletul chiar pleca, catre un cuvant.
 */

/* ── Regula ───────────────────────────────────────────────────────────────── */

test("⚠ strada se ia din oricare familie de campuri", () => {
  assert.equal(stradaDestinatarului({ street: "Bd. Eroilor" }), "Bd. Eroilor");
  assert.equal(stradaDestinatarului({ address: "Str. Lunga 4" }), "Str. Lunga 4");
  // `street` are intaietate: e cel mai precis, numarul stand separat.
  assert.equal(stradaDestinatarului({ street: "Bd. Eroilor", address: "altceva" }), "Bd. Eroilor");
  assert.equal(stradaDestinatarului({}), "");
  assert.equal(stradaDestinatarului(null), "");
  assert.equal(stradaDestinatarului({ street: "  " }), "");
});

test("⚠ un `street` gol cade pe `address`, nu ramane gol", () => {
  // Cazul care rupea: coloana exista, dar e sir gol.
  assert.equal(stradaDestinatarului({ street: "", address: "Str. Lunga 4" }), "Str. Lunga 4");
});

test("⚠ strada cu numar se compune la fel peste tot", () => {
  assert.equal(stradaCuNumar({ street: "Bd. Eroilor", street_no: "12" }), "Bd. Eroilor 12");
  assert.equal(stradaCuNumar({ address: "Str. Lunga 4" }), "Str. Lunga 4");
  assert.equal(stradaCuNumar({ street: "Bd. Eroilor", street_no: "" }), "Bd. Eroilor");
});

/* ── Mutantul, pe APELANTI ────────────────────────────────────────────────── */

test("⚠ nicio fereastra de AWB nu mai citeste o singura familie de campuri", () => {
  const dir = "src/components/dashboard";
  const ferestre = readdirSync(dir).filter((f) => /AwbModal\.tsx$/.test(f));
  assert.ok(ferestre.length >= 10, `gasite doar ${ferestre.length} ferestre: plasa n-are pe cine cadea`);

  const vinovate: string[] = [];
  for (const nume of ferestre) {
    const sursa = readFileSync(`${dir}/${nume}`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    /*
     * Se cauta initializarea unei STARI de adresa dintr-un singur camp:
     *   useState(addr.address ?? "")   sau   useState(addr?.street ?? "")
     * Forma cu amandoua, ca si `stradaDestinatarului(addr)`, trec.
     */
    /* ⚠ SI CU `||`, nu doar cu `??`. Cele opt ferestre nemigrate scriu adresa cu `||`
       (`addr.street || addr.address || ""`), deci ALA e idiomul casei si exact forma pe
       care o va copia cineva la a nouasprezecea integrare. Garda care cerea literal `??`
       ar fi lasat-o sa treaca, cu chiar defectul pentru care a fost scrisa. */
    for (const m of sursa.matchAll(/useState\(\s*addr\??\.(address|street)\s*(?:\?\?|\|\|)\s*""\s*\)/g)) {
      vinovate.push(`${nume}: ${m[0]}`);
    }
  }
  assert.deepEqual(vinovate, [], `ferestre care citesc o singura familie:\n${vinovate.join("\n")}`);
});

test("⚠ nimeni nu mai compune adresa cu `??`, care nu cade pe sirul gol", () => {
  /*
   * ⚠ SI RUTELE DE API, din 13.09.2026.
   *
   * Universul scanarii erau doar doua directoare, iar `src/app/api` ramanea in afara.
   * Acolo statea ruta de plata iPay, care decidea pe `addr.address` singur: pe o comanda
   * din checkout-ul propriu (numai `street`) conditia iesea falsa si pachetul cu datele
   * cumparatorului nu mai pleca deloc catre banca, pentru scorul de frauda. Masurat:
   * 102 din 425 de comenzi, adica 24%.
   */
  const locuri = [
    ...readdirSync("src/components/dashboard").filter((f) => f.endsWith(".tsx"))
      .map((f) => `src/components/dashboard/${f}`),
    ...readdirSync("src/lib/actions").filter((f) => f.endsWith(".ts"))
      .map((f) => `src/lib/actions/${f}`),
    ...subArbore("src/app/api"),
  ];

  /*
   * Lantul `x.street ?? x.address` (in orice ordine) e capcana: `??` cade doar pe
   * `null`/`undefined`, deci o coloana PREZENTA dar goala opreste cautarea si
   * adresa iese goala. Ajutoarele din `adresa.ts` cad si pe sirul gol.
   */
  // ⚠ ACELASI obiect de amandoua partile: `data.address ?? business.address` sunt
  // doua surse diferite pentru acelasi camp, nu cele doua familii ale unei adrese.
  const capcana = /(\w+)\??\.(street|address)\s*\?\?\s*\1\??\.(address|street)\b/g;
  const vinovate: string[] = [];

  for (const cale of locuri) {
    const sursa = readFileSync(cale, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    for (const m of sursa.matchAll(capcana)) vinovate.push(`${cale}: ${m[0]}`);
  }

  assert.deepEqual(vinovate, [], `compun adresa cu ?? in loc de ajutoarele din adresa.ts:\n${vinovate.join("\n")}`);
});

test("⚠ rutele de plata nu decid pe o singura familie de campuri", () => {
  /*
   * ═══ PLASA DE MAI SUS NU PRINDEA CLASA ASTA, SI AM AFLAT-O CU UN MUTANT (13.09.2026) ═══
   *
   * Garda dinainte cauta lantul `x.street ?? x.address`. Dar cele doua rute de plata nu
   * scriau niciun lant: citeau `addr.address` SINGUR. Intoarsa ruta iPay la forma veche,
   * proba ramanea VERDE. Adica largisem universul scanarii fara sa adaug afirmatia care
   * prinde chiar defectul reparat.
   *
   * ⚠ CE COSTA. `buildOrderBundle` (iPay) impacheteaza email, telefon, oras si adresa
   * intr-un singur sir pentru scorul de frauda al bancii: cu `addr.address` gol, conditia
   * era falsa si nu pleca NIMIC. La Netopia era mai rau: se trimitea `addr.address || "-"`,
   * deci banca primea litera „-" drept adresa, o valoare care pare valida.
   *
   * Masurat in productie: din 425 de comenzi, 102 au numai `street` (24%), 304 numai
   * `address`, zero amandoua.
   *
   * ⚠ SE CERE CHEMAREA, NU IMPORTUL. Primul mutant pastra importul si l-ar fi pacalit pe
   * un `assert` care se uita doar la linia de `import`.
   */
  const AJUTOARE = ["liniaAdresei(", "stradaCuNumar(", "stradaDestinatarului("];

  const rute = subArbore("src/app/api")
    .filter((cale) => readFileSync(cale, "utf8").includes("shipping_address"));

  /* ⚠ Si se numara: un regex care nu mai potriveste nimic ar fi iesit verde peste zero rute. */
  assert.ok(rute.length >= 2, `gasite doar ${rute.length} rute care citesc adresa: plasa n-are pe cine cadea`);

  const vinovate = rute.filter((cale) => {
    const sursa = readFileSync(cale, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    return !AJUTOARE.some((a) => sursa.includes(a));
  });

  assert.deepEqual(
    vinovate, [],
    "rutele astea citesc `shipping_address` fara sa cheme un ajutor din `adresa.ts`, deci "
    + "vad o singura familie de campuri:\n" + vinovate.join("\n"),
  );
});

/* ── Ajutorul se alege dupa FORMA CAMPULUI, nu dupa curier ─────────────────── */

/**
 * Ce fel de camp de adresa are fiecare fereastra, si ce ajutor i se cuvine.
 *
 * ⚠ ASTA E REGULA CARE S-A RUPT, si pe care garzile de mai sus n-o vad deloc: ele
 * prind forma veche `useState(addr.X ?? "")`, dar o fereastra care cheama ajutorul
 * GRESIT trece pe langa ele nestingherita. Exact asa a ajuns Woot, care are UN SINGUR
 * camp trimis intreg la curier, sa citeasca `stradaDestinatarului`, adica strada fara
 * numar si, pe o comanda eMAG corectata in panou, adresa DINAINTE de corectura.
 *
 * ⚠ Forma s-a masurat in payloadul fiecarei ferestre, nu s-a presupus:
 *
 *   un singur camp, plecat intreg      -> `liniaAdresei`
 *     Cargus (`recipientAddress`), Woot (`address`), Sameday (`recipientAddress`)
 *   un singur camp „Strada", fara numar -> `stradaCuNumar`
 *     GLS si Pall-Ex trimit doar `strada`, fara niciun camp `numar`
 *   strada si numarul, separat          -> `stradaDestinatarului`
 *     Colete (`street` + `street_number`), DPD si FAN (`recipientStreetNo`)
 *
 * Cele opt ferestre nemigrate (DHL, FedEx, Innoship, Packeta, Posta, Shipo, SmartShip,
 * UPS) trimit si ele `strada` + `numar` separat, deci forma lor de azi e CORECTA si nu
 * are ce cauta pe lista: mutate pe `stradaCuNumar`, numarul ar pleca de doua ori.
 */
const AJUTORUL_FERESTREI: Record<string, "liniaAdresei" | "stradaCuNumar" | "stradaDestinatarului"> = {
  "CargusAwbModal.tsx": "liniaAdresei",
  "WootAwbModal.tsx": "liniaAdresei",
  "SamedayAwbModal.tsx": "liniaAdresei",
  "GlsAwbModal.tsx": "stradaCuNumar",
  "PallexAwbModal.tsx": "stradaCuNumar",
  "ColeteAwbModal.tsx": "stradaDestinatarului",
  "DpdAwbModal.tsx": "stradaDestinatarului",
  "FanCourierAwbModal.tsx": "stradaDestinatarului",
};

const TOATE_AJUTOARELE = ["liniaAdresei", "stradaCuNumar", "stradaDestinatarului"] as const;

test("⚠ fiecare fereastra foloseste ajutorul cerut de forma campului ei", () => {
  const dir = "src/components/dashboard";
  for (const [nume, asteptat] of Object.entries(AJUTORUL_FERESTREI)) {
    const sursa = readFileSync(`${dir}/${nume}`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    assert.ok(
      sursa.includes(`${asteptat}(addr`),
      `${nume} nu mai cheama ${asteptat}(addr...): vezi forma campului ei in nota de deasupra`,
    );
    for (const altul of TOATE_AJUTOARELE) {
      if (altul === asteptat) continue;
      assert.ok(
        !sursa.includes(`${altul}(addr`),
        `${nume} cheama ${altul}, dar forma campului ei cere ${asteptat}`,
      );
    }
  }
});

test("⚠ o fereastra migrata nou nu poate ramane nedeclarata", () => {
  /*
   * Fara randul asta, a nouasprezecea integrare ar putea trece pe ajutoarele comune
   * fara ca nimeni sa spuna ce forma are campul ei, si proba de mai sus ar tace.
   */
  const dir = "src/components/dashboard";
  const migrate = readdirSync(dir)
    .filter((f) => /AwbModal\.tsx$/.test(f))
    .filter((f) => readFileSync(`${dir}/${f}`, "utf8").includes('from "@/lib/orders/adresa"'));

  assert.deepEqual(
    migrate.sort(),
    Object.keys(AJUTORUL_FERESTREI).sort(),
    "o fereastra foloseste ajutoarele comune fara sa-si declare forma campului in `AJUTORUL_FERESTREI`",
  );
});
