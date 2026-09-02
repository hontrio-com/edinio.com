import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  NIMIC NU PORNESTE, SI NIMIC NU PLEACA, INAINTE DE ALEGERE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ PROBELE DE AICI CITESC SURSA, cu marginile stiute: pot arata ca poarta e
  SCRISA, nu ca ea chiar se executa. De aceea cer forme pe care o paza pusa
  alaturi le strica — si de aceea drumul intreg a fost probat separat, cu codul
  adevarat, impotriva bazei adevarate.
*/

const RAND = String.fromCharCode(10);
const citeste = (p: string) => readFileSync(p, "utf8");

function faraComentarii(cod: string): string {
  const faraBlocuri = cod.split("/*").map((b, i) => {
    if (i === 0) return b;
    const k = b.indexOf("*/");
    return k < 0 ? "" : b.slice(k + 2);
  }).join("");
  return faraBlocuri.split(RAND).map((r) => {
    const k = r.indexOf("//");
    return k < 0 ? r : r.slice(0, k);
  }).join(RAND);
}

function fisiereSursa(rad: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(rad)) {
    const p = join(rad, n);
    if (statSync(p).isDirectory()) out.push(...fisiereSursa(p));
    else if (/\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts")) out.push(p.split("\\").join("/"));
  }
  return out;
}

/** Cei trei pixeli corporate, si categoria de care atarna fiecare. */
const PIXELI: Array<[string, string]> = [
  ["src/components/edinio-marketing/EtichetaGa4.tsx", "statistici"],
  ["src/components/edinio-marketing/EdinioMetaPixel.tsx", "marketing"],
  ["src/components/edinio-marketing/EdinioTikTokPixel.tsx", "marketing"],
];

test("⚠ fiecare pixel se opreste din RANDARE, nu dinauntrul scriptului", () => {
  /*
    ⚠ DEOSEBIREA E TOT. Un `<Script>` care nu intra in arbore nu e injectat
    niciodata: zero cereri catre furnizor, zero cookie-uri. Un script incarcat si
    „oprit" dinauntru a scris deja pe terminal — adica exact fapta pe care
    bannerul ar trebui s-o impiedice.
  */
  for (const [fisier, categorie] of PIXELI) {
    const linii = faraComentarii(citeste(fisier)).split(RAND).map((l) => l.trim());
    assert.ok(
      linii.includes(`if (!c.mounted || !c.${categorie}) return null;`),
      `${fisier}: poarta pe "${categorie}" lipseste, sau nu mai e o instructiune de sine statatoare`,
    );
  }
});

test("⚠ `!c.mounted` face parte din poarta, altfel se strica hidratarea", () => {
  /*
    Serverul nu stie ce scrie in cookie (si n-are voie sa afle — paginile se
    servesc din cache). Deci prima randare din browser trebuie sa iasa IDENTIC cu
    cea de pe server. Fara `mounted`, prima zi ar aduce erori de hidratare pe
    fiecare pagina a site-ului.
  */
  for (const [fisier] of PIXELI) {
    const cod = faraComentarii(citeste(fisier));
    assert.match(cod, /!c\.mounted \|\|/, `${fisier}: poarta nu asteapta hidratarea`);
  }
});

test("⚠ Consent Mode v2 se declara INAINTEA oricarei alte comenzi gtag", () => {
  /*
    ⚠ ORDINEA NU E UN MOFT. Google citeste starea implicita la prima comanda care
    ar trimite ceva. Pusa dupa `config`, primul eveniment pleaca deja sub starea
    gresita, si nimic nu arata ca s-a intamplat.
  */
  const cod = citeste("src/components/edinio-marketing/EtichetaGa4.tsx");
  const iDefault = cod.indexOf("gtag('consent', 'default'");
  const iJs = cod.indexOf("gtag('js'");
  const iConfig = cod.indexOf("gtag('config'");

  assert.ok(iDefault > 0, "nu se mai declara starea implicita de consimtamant");
  assert.ok(iJs > 0 && iConfig > 0, "comenzile gtag au disparut");
  assert.ok(iDefault < iJs, "`consent default` vine dupa `gtag('js')`");
  assert.ok(iDefault < iConfig, "`consent default` vine dupa `gtag('config')`");

  for (const semnal of ["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization"]) {
    assert.ok(cod.includes(semnal), `semnalul "${semnal}" din Consent Mode v2 lipseste`);
  }
});

test("⚠ ORICE punere la coada spune de unde stie ca are voie", () => {
  /*
    ⚠ CE APARA. `puneLaCoada` cere un `Temei` — o uniune, nu un boolean — tocmai
    ca fiecare loc sa fie nevoit sa spuna DE UNDE stie. Proba asta cere ca
    temeiul sa fie chiar acolo, in apel.
  */
  const apeluri: Array<[string, string]> = [];
  for (const f of fisiereSursa("src")) {
    const cod = faraComentarii(citeste(f));
    let i = cod.indexOf("await puneLaCoada(");
    while (i >= 0) {
      apeluri.push([f, cod.slice(i, i + 900)]);
      i = cod.indexOf("await puneLaCoada(", i + 1);
    }
  }

  assert.ok(apeluri.length >= 6, `s-au gasit doar ${apeluri.length} puneri la coada — cautarea s-a stricat?`);
  for (const [f, bucata] of apeluri) {
    assert.match(
      bucata, /fel: "(cookie|carat)"/,
      `${f}: se pune la coada fara sa spuna pe ce temei — poate trimite pentru cine a refuzat`,
    );
  }
});

test("⚠ webhook-ul Stripe nu poate pretinde acord: n-are cookie-urile omului", () => {
  const cod = faraComentarii(citeste("src/app/api/stripe/webhook/route.ts"));
  const i = cod.indexOf('fel: "carat"');
  assert.ok(i > 0, "webhook-ul nu mai declara ca temeiul e carat de altundeva");
  const bucata = cod.slice(i, i + 300);
  assert.match(bucata, /marketing: session\.metadata\?\.cs === "1"/,
    "acordul nu mai vine din metadata sesiunii — de unde ar veni?");
  assert.ok(!bucata.includes("marketing: true"), "webhook-ul pretinde acord fara sa-l fi primit");
});

test("⚠ hotararea se citeste din cookie, niciodata dintr-un layout", () => {
  /*
    ⚠ CE APARA, MASURAT. Paginile din (website) se servesc din cache — pe
    02.09.2026 pagina de start avea `Age: 838`. O citire de cookie intr-un layout
    le-ar face pe TOATE dinamice: as fi reparat confidentialitatea stingand
    viteza intregului site.
  */
  const vinovate = fisiereSursa("src/app")
    .filter((f) => f.endsWith("layout.tsx"))
    .filter((f) => faraComentarii(citeste(f)).includes("consimtamantulCererii"));
  assert.deepEqual(vinovate, [], "un layout citeste consimtamantul, deci paginile lui devin dinamice");
});

/*
  ⚠ SINGURA SUPRAFATA CU PIXELI SI FARA BANNER, si de ce.

  Aplicatia autentificata. Hotararea proprietarului, 02.09.2026: o intrebare
  despre cookie-uri peste un ecran in care omul lucreaza e deranjanta, iar el a
  vazut-o oricum pe site inainte sa-si faca cont.

  ⚠ URMAREA, ACCEPTATA: fara banner nu se poate da acord DE ACOLO, iar pixelii
  atarna de acord. Pentru cine n-a ales niciodata pe site — cine intra direct pe
  un semn de carte catre `/dashboard` — ei raman stinsi. Fara acord, a nu masura
  e raspunsul corect; dar retargetarea din aplicatie acopera numai pe cine a
  acceptat pe site.

  ⚠ LISTA ASTA E PAZITA DE PROBA DE MAI JOS. Altfel prima incercare de a face o
  proba sa taca ar fi sa se adauge aici inca un layout.
*/
const FARA_BANNER_DINADINS = ["src/app/(dashboard)/layout.tsx"];

test("⚠ bannerul e montat oriunde e montat un pixel", () => {
  /*
    ⚠ CE APARA. O suprafata cu poarta si fara intrebare nu e mai privata — e doar
    mai oarba: acolo masuratoarea moare fara ca nimeni sa poata alege altfel.
    Cele cinci layouturi sunt deja neuniforme (dashboard-ul are pixeli dar n-are
    GA4), deci potrivirea se cauta, nu se presupune.
  */
  const cuPixeli = fisiereSursa("src/app")
    .filter((f) => f.endsWith("layout.tsx"))
    .filter((f) => /Edinio(Meta|TikTok)Pixel|EtichetaGa4/.test(faraComentarii(citeste(f))));

  assert.ok(cuPixeli.length >= 5, `doar ${cuPixeli.length} layouturi cu pixeli — cautarea s-a stricat?`);
  const faraBanner = cuPixeli
    .filter((f) => !FARA_BANNER_DINADINS.includes(f))
    .filter((f) => !faraComentarii(citeste(f)).includes("<BannerConsimtamant />"));
  assert.deepEqual(faraBanner, [], "layouturi cu pixeli dar fara banner: nimeni n-ar putea alege acolo");
});

test("exceptia de la banner nu se poate largi in tacere", () => {
  /*
    ⚠ CE APARA. `FARA_BANNER_DINADINS` e o portita. Daca maine cineva scoate
    bannerul de pe pagina de inregistrare — unde ajung oamenii direct din reclame
    — si adauga fisierul aici, proba de mai sus ar tacea, iar inscrierile din
    reclame n-ar mai ajunge NICIODATA la Meta si TikTok.

    Deci lista e marginita la ce e cu adevarat aplicatia autentificata, si fiecare
    intrare trebuie sa fie un layout care chiar exista si chiar are pixeli.
  */
  assert.ok(FARA_BANNER_DINADINS.length <= 1, "exceptia s-a largit — a fost cantarit fiecare caz?");
  for (const f of FARA_BANNER_DINADINS) {
    assert.ok(f.includes("(dashboard)"), `${f}: singura suprafata fara banner e aplicatia autentificata`);
    const cod = citeste(f);
    assert.match(cod, /Edinio(Meta|TikTok)Pixel/, `${f}: trecut in exceptie dar n-are pixeli`);
    assert.match(cod, /AICI NU SE PUNE BANNERUL/, `${f}: exceptia nu e explicata in fisierul insusi`);
  }
});

test("⚠ niciun layout nu spune despre sine contrariul a ce face", () => {
  /*
    ⚠ CE APARA, SI DE CE E O PROBA SI NU O CONVENTIE.

    Cele patru layouturi de prezentare purtau, pana pe 02.09.2026, randul „NU se
    pune in `(dashboard)`" — despre pixeli care sunt in dashboard din 01.06.2026,
    din alegerea proprietarului. Un audit din afara l-a citit si a raportat o
    incalcare de scop; nu era, era un comentariu ramas in urma.

    Cine citeste un comentariu peste sase luni ia hotarari pe el. Deci afirmatia
    se probeaza ca oricare alta.

    ⚠ SE CAUTA AFIRMATIA, NU SIRUL. Comentariul de acum CITEAZA forma veche, ca
    sa se stie ce s-a schimbat — deci o cautare simpla ar cadea pe propria
    reparatie. Se cere ca randul sa nu INCEAPA cu ea.
  */
  const layouturi = fisiereSursa("src/app").filter((f) => f.endsWith("layout.tsx"));
  assert.ok(layouturi.length >= 5, `doar ${layouturi.length} layouturi — cautarea s-a stricat?`);

  const mincinoase = layouturi.filter((f) => {
    const cod = readFileSync(f, "utf8");
    if (!/Edinio(Meta|TikTok)Pixel/.test(cod)) return false;
    return cod.split(RAND).some((r) => r.trim().startsWith("NU se pune in `(dashboard)`"));
  });

  assert.deepEqual(
    mincinoase, [],
    "un layout sustine ca pixelii nu ajung in dashboard, dar ei sunt acolo: " + mincinoase.join(", "),
  );
});
