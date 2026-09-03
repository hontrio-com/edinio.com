import { strict as assert } from "node:assert";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { POST } from "./route";
import { serializeaza, NIMIC, VERSIUNE } from "@/lib/edinio-marketing/consimtamant/stare";
import { NUME_COOKIE } from "@/lib/edinio-marketing/consimtamant/cookie";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  `retras: true` NU ARE VOIE SA FIE O MINCIUNA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE APARA, si de ce e cea mai importanta proba a zilei. Browserul isi sterge
  restanta cand serverul raspunde `retras: true`. Daca raspunsul minte, plasa pusa
  impotriva unei baze picate se anuleaza singura: retragerea ramane numai in
  browser, iar cronul — care se uita in baza — trimite mai departe.

  ⚠ CUM SE FACE BAZA SA CADA, fara mimare. `createAdminClient()` arunca daca
  lipseste `SUPABASE_SERVICE_ROLE_KEY`. Il stergem din mediu pentru proba: e cel
  mai cinstit fel de esec, fiindca e chiar unul care se poate intampla.
*/

const VID = "017e7d44ff3e4242bdfc51899ef47fa8";

function cerere(corp: Record<string, unknown>, cuVid: boolean) {
  const stare = serializeaza({ ...NIMIC, statistici: true, marketing: true, cand: Math.floor(Date.now() / 1000), metoda: "t", ...(cuVid ? { vid: VID } : {}) });
  return new NextRequest("https://www.edinio.com/api/consimtamant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${NUME_COOKIE}=${encodeURIComponent(stare)}; _ga=GA1.1.x; _fbp=fb.1.y`,
    },
    body: JSON.stringify(corp),
  });
}

async function faraBaza<T>(f: () => Promise<T>): Promise<T> {
  const cheie = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try { return await f(); } finally { if (cheie !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = cheie; }
}

test("⚠ baza picata ⇒ `retras: false`, nu `true`", async () => {
  const r = await faraBaza(() =>
    POST(cerere({ v: VERSIUNE, statistici: false, marketing: false, metoda: "w", vid: null, vidDeStins: VID }, false)),
  );

  assert.equal(r.status, 200, "un 500 ar face alegerea sa para nereusita, desi e deja in vigoare in browser");
  const corp = (await r.json()) as { ok?: boolean; retras?: boolean };
  assert.equal(corp.retras, false,
    "serverul a confirmat o piatra de mormant care nu s-a scris — browserul isi sterge restanta si retragerea se pierde");
});

test("⚠ si tot atunci raspunsul duce cookie-urile, fiecare pe randul lui", async () => {
  /*
    ⚠ CE APARA. Alegerea e deja in vigoare in browser; raspunsul trebuie sa
    reconfirme cookie-ul (altfel Safari il taie la 7 zile) si sa stinga
    cookie-urile furnizorilor. Daca ruta ar cadea cu 500 la o baza picata, s-ar
    pierde amandoua.

    ⚠ SI SE NUMARA `getSetCookie()`, nu se citeste antetul ca text: mai multe
    `Set-Cookie` contopite intr-unul singur, despartite prin virgula, ar fi
    insemnat ca stergerile nu se aplica.
  */
  const r = await faraBaza(() =>
    POST(cerere({ v: VERSIUNE, statistici: false, marketing: false, metoda: "w", vid: null, vidDeStins: VID }, false)),
  );

  const puse = r.headers.getSetCookie();
  assert.ok(puse.length >= 4, `doar ${puse.length} cookie-uri in raspuns — stergerile s-au contopit?`);
  assert.ok(puse.some((c) => c.startsWith(`${NUME_COOKIE}=`)), "hotararea nu se mai reconfirma de la server");
  for (const nume of ["_ga", "_fbp"]) {
    assert.ok(puse.some((c) => c.startsWith(`${nume}=;`)), `\`${nume}\` nu se stinge la retragere`);
  }
});

test("⚠ id-ul din corp se ia NUMAI cand se stinge ceva", async () => {
  /*
    ⚠ PAZA CARE RAMANE. La retragere id-ul vechi vine din corp, fiindca cookie-ul
    cererii nu-l mai poarta. Dar pe calea care ACORDA, nimeni n-are voie sa porneasca
    trimiteri pe id-ul altuia: acolo id-ul se naste in browserul cui apasa.
  */
  const r = await faraBaza(() =>
    POST(cerere({ v: VERSIUNE, statistici: true, marketing: true, metoda: "t", vid: null, vidDeStins: VID }, false)),
  );
  const corp = (await r.json()) as { retras?: boolean };
  assert.equal(corp.retras, false, "s-a stins ceva pe o cerere care ACORDA");

  const puse = r.headers.getSetCookie();
  const hotarare = puse.find((c) => c.startsWith(`${NUME_COOKIE}=`)) ?? "";
  assert.ok(!hotarare.includes(VID), "id-ul strain din corp a fost scris in cookie-ul de acordare");
});

test("cererile stricate sunt respinse inainte de orice atingere a bazei", async () => {
  const versiuneGresita = await POST(cerere({ v: 999, statistici: false, marketing: false, metoda: "w" }, true));
  assert.equal(versiuneGresita.status, 400);
  const metodaGresita = await POST(cerere({ v: VERSIUNE, statistici: false, marketing: false, metoda: "zzz" }, true));
  assert.equal(metodaGresita.status, 400);
});

test("⚠ retragerea PARTIALA pastreaza statisticile in cookie-ul intors", () => {
  /*
    ⚠ CE APARA. Omul pastreaza statisticile si retrage numai marketingul. Serverul
    reconfirma cookie-ul; daca ar scrie `00`, i-ar stinge si ce voia sa pastreze.
  */
  return faraBaza(async () => {
    const r = await POST(cerere(
      { v: VERSIUNE, statistici: true, marketing: false, metoda: "p", vid: null, vidDeStins: VID }, false,
    ));
    const hotarare = r.headers.getSetCookie().find((c) => c.startsWith(`${NUME_COOKIE}=`)) ?? "";
    const steaguri = decodeURIComponent(hotarare.split(";")[0].split("=")[1] ?? "").split(".")[2];
    assert.equal(steaguri, "10", `serverul a intors steagurile "${steaguri}" in loc de "10"`);
  });
});

test("⚠ RELUAREA tehnica nu atinge NICIUN cookie", () => {
  /*
    ═══ ⚠ CEA MAI IMPORTANTA PROBA A ZILEI ═══

    Reluarea porneste dintr-o restanta din `localStorage`, cand o scriere a cazut.
    Forma dinainte trimitea `statistici: false, marketing: false` — orice ar fi
    ales omul. Scenariul viu: cineva pastreaza STATISTICILE si retrage numai
    marketingul; serverul cade; la urmatoarea pagina reluarea spunea „retrage
    tot", iar `Set-Cookie`-ul ii stingea si statisticile.

    Acum ramura de reluare iese INAINTE de orice atingere a cookie-urilor. Proba
    nu cere ca ele sa fie „corecte" — cere sa nu EXISTE. O reluare tehnica n-are
    ce cauta in preferintele omului.
  */
  return faraBaza(async () => {
    const r = await POST(cerere({ v: VERSIUNE, doarPiatra: true, vidDeStins: VID }, true));
    assert.equal(r.status, 200);
    assert.deepEqual(r.headers.getSetCookie(), [], "reluarea a scris cookie-uri");

    const corp = (await r.json()) as { retras?: boolean };
    assert.equal(corp.retras, false, "a raportat izbanda peste o baza picata");
  });
});

test("⚠ reluarea fara un id valid e respinsa, nu inghitita", () => {
  /*
    Fara paza asta, o restanta stricata ar trimite o cerere care nu poate face
    nimic, si ar primi 200 — deci browserul si-ar sterge restanta si retragerea
    s-ar pierde definitiv.
  */
  return faraBaza(async () => {
    for (const rau of [null, "", "NUEHEXA", "a".repeat(31)]) {
      const r = await POST(cerere({ v: VERSIUNE, doarPiatra: true, vidDeStins: rau }, true));
      assert.equal(r.status, 400, `id-ul "${String(rau)}" a trecut ca valid`);
    }
  });
});

test("⚠ si browserul CHIAR cere doar piatra la reluare", () => {
  /*
    ⚠ CUTITUL TAIE IN AMANDOUA PARTILE. Ramura de mai sus e degeaba daca browserul
    trimite mai departe preferinte. Se citeste corpul chemat de `reiaRetragerea`.
  */
  /*
    ⚠ SE CERE REGULA, NU LOCUL. Prima forma taia corpul din chiar `reiaRetragerea`
    — si a cazut cand am mutat cererea intr-o functie ajutatoare, desi purtarea
    ramasese corecta. O proba legata de locul unde sta codul imbatraneste la prima
    rearanjare; una legata de regula, nu.

    Regula: ORICE corp trimis catre ruta care poarta `doarPiatra` n-are voie sa
    poarte si preferinte.
  */
  const sursa = readFileSync("src/lib/edinio-marketing/consimtamant-browser.ts", "utf8");
  const corpuri = [...sursa.matchAll(/JSON\.stringify\(\{[\s\S]*?\}\)/g)].map((m) => m[0]);
  const cuPiatra = corpuri.filter((c) => c.includes("doarPiatra"));

  assert.equal(cuPiatra.length, 1, `s-au gasit ${cuPiatra.length} cereri care duc doar piatra; astept exact una`);
  for (const c of cuPiatra) {
    assert.ok(!c.includes("statistici"), "cererea de reluare trimite iar preferinte: " + c);
    assert.ok(!c.includes("marketing"), "cererea de reluare trimite iar preferinte: " + c);
  }

  /*
    ⚠ SI CA RELUAREA CHIAR TRECE PE ACOLO. Fara randul asta, cineva ar putea scrie
    o a doua cerere, cu preferinte, si proba de mai sus ar ramane verde cat timp
    cea „curata" exista undeva in fisier.
  */
  const i = sursa.indexOf("export function reiaRetragerea");
  assert.ok(i > 0, "nu mai gasesc reluarea");
  const corpFunctiei = sursa.slice(i, sursa.indexOf(String.fromCharCode(10) + "}", i));
  assert.match(corpFunctiei, /ceruPiatra\(/, "reluarea nu mai trece prin cererea care duce doar piatra");
});
