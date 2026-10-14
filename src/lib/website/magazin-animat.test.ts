import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
/* Regulile motorului comun (cadrele, proprietățile, țintele) le verifică `animatie-bucla.test.ts`,
   pe toate machetele odată. Aici e doar ce ține de iMac-ul cu magazinul. */
import {
  BUCLA_S,
  CAMERA,
  ECRAN,
  IMAGINI,
  DOSAR_IMAGINI,
  LATIMI_IMAGINI,
  MOMENTE_DISCRETE,
  PAGINA_IMAGINII,
  PISTE,
  RAPORT_SCENA,
  ZOOM_MAX,
  ZOOM_PE_PAGINA,
  camera,
  latimeaImaginilor,
  paginiVizibile,
  stareaTextelor,
} from "./magazin-animat";

/*
  ═══ ORACOLUL: socoteala machetei, copiată aproape literă cu literă ═══

  Macheta clientului (`edinio-mockup-preview.html`, 14.10.2026) muta camera în pixeli, dintr-o
  geometrie măsurată în DOM. Noi o scriem în fracții și o trimitem compozitorului. Proba asta
  socotește camera pe drumul VECHI, pentru o scenă de 1000 px, și cere ca drumul nou să cadă pe
  aceiași pixeli, deci traducerea n-a schimbat nicio mișcare.
*/
function cameraMacheta(t: number, W: number): { tx: number; ty: number; z: number } {
  const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const pr = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
  const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
  const G = { W, H: W * 0.75, sx: ECRAN.x * W, sy: ECRAN.y * W, sw: ECRAN.w * W, sh: ECRAN.h * W };
  let i = 0;
  while (i < CAMERA.length - 2 && t >= CAMERA[i + 1][0]) i++;
  const a = CAMERA[i];
  const b = CAMERA[i + 1];
  const m = eio(pr(t, a[0], b[0]));
  const zf = (G.W / G.sw) * 1.02;
  const za = a[1] === 0 ? zf : a[1] === 1 ? 1 : (a[1] * zf) / 1.15;
  const zb = b[1] === 0 ? zf : b[1] === 1 ? 1 : (b[1] * zf) / 1.15;
  const z = Math.exp(lerp(Math.log(za), Math.log(zb), m));
  const ax = G.sx + (a[2] / 1920) * G.sw;
  const ay = G.sy + (a[3] / 1080) * G.sh;
  const bx = G.sx + (b[2] / 1920) * G.sw;
  const by = G.sy + (b[3] / 1080) * G.sh;
  const w = za === zb ? m : (z - za) / (zb - za);
  const fx = lerp(ax, bx, w);
  const fy = lerp(ay, by, w);
  let tx = G.W / 2 - fx * z;
  const ty = G.H / 2 - fy * z;
  if (z > 1.05) {
    const minx = G.W - (G.sx + G.sw) * z;
    const maxx = -G.sx * z;
    tx = clamp(tx, Math.min(minx, maxx), Math.max(minx, maxx));
  }
  return { tx, ty, z };
}

test("camera cade pe aceiași pixeli ca în machetă, la orice moment", () => {
  const W = 1000;
  for (let k = 0; k < BUCLA_S * 120; k++) {
    const t = k / 120;
    const vechi = cameraMacheta(t, W);
    const nou = camera(t);
    /* `translate` în procente: X din lățime, Y din înălțime. */
    assert.ok(Math.abs((nou.x / 100) * W - vechi.tx) < 1e-6, `X la ${t}s`);
    assert.ok(Math.abs((nou.y / 100) * W * RAPORT_SCENA - vechi.ty) < 1e-6, `Y la ${t}s`);
    assert.ok(Math.abs(nou.z - vechi.z) < 1e-9, `zoomul la ${t}s`);
  }
});

test("geometria ecranului din cod e cea din foaia de stil", () => {
  /* Camera țintește ecranul socotit din numerele astea; dacă monitorul se mută în CSS și nu aici,
     zoomul ar nimeri alături. Se citesc chiar regulile din foaie. */
  const css = readFileSync(join(process.cwd(), "src/app/magazin-animat.css"), "utf8");
  const regula = (sel: string) => {
    const m = new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `lipsește regula ${sel}`);
    return m[1];
  };
  const unitati = (bloc: string, prop: string) => {
    const m = new RegExp(`(?:^|;|\\s)${prop}:\\s*calc\\(var\\(--u\\)\\s*\\*\\s*([0-9.]+)\\)`).exec(bloc);
    assert.ok(m, `lipsește ${prop}`);
    return Number(m[1]);
  };
  const mon = regula(".emx-mon");
  const bez = regula(".emx-bez");
  const rama = unitati(bez, "padding");
  const raport = /aspect-ratio:\s*([0-9.]+)\s*\/\s*([0-9.]+)/.exec(bez);
  assert.ok(raport);
  const latime = unitati(mon, "width");
  const inaltime = (latime * Number(raport[2])) / Number(raport[1]);
  const ecran = {
    x: (unitati(mon, "left") + rama) / 100,
    y: (unitati(mon, "top") + rama) / 100,
    w: (latime - 2 * rama) / 100,
    h: (inaltime - 2 * rama) / 100,
  };
  for (const k of ["x", "y", "w", "h"] as const) {
    assert.ok(Math.abs(ecran[k] - ECRAN[k]) < 1e-6, `ECRAN.${k}: cod ${ECRAN[k]}, foaie ${ecran[k]}`);
  }
  /* Și scara capturilor din `.emx-vp` folosește aceeași lățime de ecran. */
  assert.match(regula(".emx-vp"), new RegExp(`atan2\\(calc\\(var\\(--u\\) \\* ${ECRAN.w * 100}\\), 1920px\\)`));
});

test("bucla se închide fără săritură acolo unde se vede ceva", () => {
  /* La capăt animația sare înapoi la 0. Camera și pagina de start sunt pe ecran în clipa aia,
     deci trebuie să fie identice la cele două capete. Cursorul sare și el, dar e stins. */
  for (const tinta of ["camera", "pagina-home"]) {
    const p = PISTE.find((x) => x.tinta === tinta);
    assert.ok(p);
    const inceput = p.valori(0);
    const sfarsit = p.valori(BUCLA_S - 1e-6);
    inceput.forEach((v, d) => assert.ok(Math.abs(v - sfarsit[d]) <= p.toleranta[d], `${tinta}[${d}]`));
  }
  const cursor = PISTE.find((x) => x.tinta === "cursor");
  assert.ok(cursor);
  assert.equal(cursor.valori(0)[3], 0, "cursorul e stins la început");
  assert.equal(cursor.valori(BUCLA_S - 1e-6)[3], 0, "și la sfârșit");
});

test("coșul: unsprezece bucăți, prețurile pe trepte, butonul activ peste comanda minimă", () => {
  const start = stareaTextelor(0);
  assert.deepEqual(
    [start.cantitate, start.totalProdus, start.panaLaGratuit, start.tva, start.total, start.activ],
    ["1", "18,99 lei", "980,01 lei", "13,44 lei", "77,43 lei", false],
  );
  const plin = stareaTextelor(12.5);
  assert.deepEqual(
    [plin.cantitate, plin.pretBucata, plin.totalProdus, plin.tva, plin.total, plin.bulinaCos, plin.activ],
    ["11", "17,09 lei bucata", "188 lei", "48,93 lei", "281,93 lei", "9+", true],
  );
  /* 281,93 + 20 lei taxa de ramburs + TVA-ul ei = 306,13, exact cifra din checkout și din fereastra
     „Comanda a fost plasată”. Verificat pe captura `checkout.webp`. */
  assert.equal(Math.round((281.93 + 20 * 1.21) * 100) / 100, 306.13);
});

test("checkout: câmpurile se scriu literă cu literă și rămân scrise", () => {
  assert.deepEqual(stareaTextelor(13.9).scris, ["", "", "", "", ""]);
  const pe_jumatate = stareaTextelor(13.95 + 0.375).scris[0];
  assert.equal(pe_jumatate, "Andrei ");
  assert.deepEqual(stareaTextelor(18).scris, ["Andrei Popescu", "0740 555 321", "Prahova", "Ploiești", "Str. Republicii nr. 10"]);
});

test("nicio schimbare scrisă din JavaScript nu cade între două clipe programate", () => {
  /* Programarea sare de la o clipă la alta din `MOMENTE_DISCRETE`. Dacă un text sau vizibilitatea
     unei pagini s-ar schimba între două clipe, ar rămâne vechi până la clipa următoare. Se caută
     orice schimbare, la 1 ms. */
  const stare = (t: number) => JSON.stringify([stareaTextelor(t), paginiVizibile(t)]);
  let anterior = stare(0);
  for (let ms = 1; ms < BUCLA_S * 1000; ms++) {
    const t = ms / 1000;
    const acum = stare(t);
    if (acum !== anterior) {
      const programata = MOMENTE_DISCRETE.some((m) => m > t - 0.001 - 1e-9 && m <= t + 1e-9);
      assert.ok(programata, `starea se schimbă la ${t}s fără clipă programată`);
      anterior = acum;
    }
  }
});

test("o pagină care se vede, chiar și pe jumătate, e întotdeauna vizibilă", () => {
  /* Altfel `visibility: hidden` ar tăia o pagină în plină estompare: ar dispărea brusc. */
  for (const p of ["home", "prod", "cart", "chk"]) {
    const pista = PISTE.find((x) => x.tinta === `pagina-${p}`);
    assert.ok(pista);
    for (let k = 0; k < BUCLA_S * 240; k++) {
      const t = k / 240;
      if (pista.valori(t)[0] > 0) assert.ok(paginiVizibile(t)[p], `${p} se vede la ${t}s, dar e ascunsă`);
    }
  }
  /* Iar o pagină care nu are de ce să se vadă e ascunsă: altfel regula n-ar folosi la nimic. */
  assert.deepEqual(paginiVizibile(16), { home: false, prod: false, cart: false, chk: true });
});

test("mărimea capturilor: 1280 pe telefon, 1920 pe desktop, densitatea luată cel mult 2", () => {
  assert.ok(ZOOM_MAX > 3 && ZOOM_MAX < 3.1);
  /* Ecranul iMac-ului e 64,1% din scenă. Telefon de 390: scena ~336 px. */
  assert.equal(latimeaImaginilor(336 * ECRAN.w, 3), 1280);
  assert.equal(latimeaImaginilor(336 * ECRAN.w, 2), 1280);
  /* Desktop: scena ~628 px. */
  assert.equal(latimeaImaginilor(628 * ECRAN.w, 2), 1920);
  assert.equal(latimeaImaginilor(628 * ECRAN.w, 1), 1280);
  /* Densitate lipsă sau stricată: se ia 1, nu se aruncă. */
  assert.equal(latimeaImaginilor(336 * ECRAN.w, 0), 1280);
});

test("⚠ pe un desktop obișnuit, pagina de start nu se descarcă de două ori", () => {
  /* Găsit la recenzie: HTML-ul aduce captura de 1280 a paginii de start, iar browserul o descarcă
     singur, mai devreme decât pregătirea noastră. Dacă pregătirea alege apoi alta, se descarcă
     amândouă. Regula: pe desktop (scena ~628 px, densitate 1-2), alegerea pentru pagina de start e
     chiar captura din HTML. Paginile cu zoom mare rămân la 1920. */
  const sursa = readFileSync(join(process.cwd(), "src/components/website/sections/MagazinAnimat.tsx"), "utf8");
  const dinHtml = Number(/const LATIME_START = (\d+);/.exec(sursa)?.[1]);
  for (const densitate of [1, 1.25, 1.5, 2]) {
    assert.equal(latimeaImaginilor(628 * ECRAN.w, densitate, ZOOM_PE_PAGINA.home), dinHtml, `densitate ${densitate}`);
  }
  assert.equal(latimeaImaginilor(628 * ECRAN.w, 2, ZOOM_PE_PAGINA.prod), 1920);
  /* Zoomul maxim pe pagină: la produs e chiar cel al buclei, la pagina de start mult sub el. */
  assert.ok(Math.abs(ZOOM_PE_PAGINA.prod - ZOOM_MAX) < 1e-9);
  assert.ok(ZOOM_PE_PAGINA.home < 1.7, `pagina de start la zoom ${ZOOM_PE_PAGINA.home}`);
  for (const nume of IMAGINI) assert.ok(PAGINA_IMAGINII[nume] in ZOOM_PE_PAGINA, `${nume} n-are pagină`);
});

test("capturile există, la fiecare lățime", () => {
  for (const nume of IMAGINI) {
    for (const latime of LATIMI_IMAGINI) {
      const cale = join(process.cwd(), "public", `${DOSAR_IMAGINI}/${nume}-${latime}.webp`);
      assert.ok(existsSync(cale), `lipsește ${DOSAR_IMAGINI}/${nume}-${latime}.webp`);
    }
  }
});
