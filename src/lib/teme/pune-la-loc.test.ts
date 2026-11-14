import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { TemaAplicata } from "./aplicare";
import { drumulInapoi, PASI_MAX, versiuneaDePusLaLoc, versiuniDeCitit, type RandIstoric } from "./pune-la-loc";

/*
 * „Pune la loc designul de dinainte”: ce versiune se readuce (14.11.2026, `pune-la-loc.ts`). Probele trec prin ACELASI
 * drum ca actiunea (`designulDeDinainteDeTema` din `store-design.actions.ts`): lista cu starea, apoi intregi DOAR
 * versiunile cerute de `versiuniDeCitit`. O versiune uitata din cerere ar opri saritura, iar proba ar cadea.
 */

interface V {
  id: string;
  origine: "tema" | "publicare" | "ciorna" | "inainte";
  created_at: string;
  design: unknown;
  continut: unknown;
}

/** Un design si un continut de proba: tema se vede in antet, culoarea in `magazin`. */
const design = (antet: string) => ({ chrome: { header: { variant: antet } }, home: { sections: [] } });
const continut = (culoare: string, logo: string | null = null) => ({
  pc: { store_bg_color: "#FFFFFF" },
  magazin: { logo_url: logo, cover_url: null, primary_color: culoare, gallery: [] },
});
const semn = (cheie: string, la: string): TemaAplicata => ({ cheie, la });

/** Versiunea `tema` cum o scrie `aplicaTema`: ce era publicat, plus starea (tema aplicata atunci, datele demo). */
function tema(id: string, la: string, d: unknown, c: Record<string, unknown>, temaAtunci: TemaAplicata | null): V {
  return { id, origine: "tema", created_at: la, design: d, continut: { ...c, stare: { tema: temaAtunci, demo: null } } };
}
function publicare(id: string, la: string, d: unknown, c: unknown): V {
  return { id, origine: "publicare", created_at: la, design: d, continut: c };
}

/** Ca actiunea: lista (cu `continut->stare`, `null` cand lipseste), drumul, apoi intregi doar cele cerute. */
function alege(versiuni: V[], semnul: TemaAplicata | null) {
  const lista: RandIstoric[] = versiuni.map((v) => ({
    id: v.id, origine: v.origine, created_at: v.created_at,
    stare: (v.continut as { stare?: unknown } | null)?.stare ?? null,
  }));
  const drum = drumulInapoi(lista, semnul);
  if (!drum) return null;
  const cerute = new Set(versiuniDeCitit(drum));
  const intregi = new Map(versiuni.filter((v) => cerute.has(v.id)).map((v) => [v.id, { design: v.design, continut: v.continut }]));
  return versiuneaDePusLaLoc(drum, intregi);
}

/* ─── MNY AROMA, 14.11.2026: datele reale din Istoric (orele la milisecunda, id-urile scurtate) ─────────────────────── */

const ORIGINAL = { d: design("clasic"), c: continut("#A96F08") };
const SATURN = { d: design("saturn"), c: continut("#FF6A13") };
const JUPITER = { d: design("hipermarket"), c: continut("#0B3D7A") };
const VENUS = { d: design("venus"), c: continut("#C8102E") };

const MNY: V[] = [
  tema("4b0ef124", "2026-11-14T14:06:37.372Z", ORIGINAL.d, ORIGINAL.c, null),
  publicare("5657e386", "2026-11-14T14:06:37.689Z", SATURN.d, SATURN.c),
  tema("1ead9430", "2026-11-14T14:07:09.394Z", SATURN.d, SATURN.c, semn("saturn", "2026-11-14T14:06:37.833Z")),
  publicare("3b80f452", "2026-11-14T14:07:09.674Z", JUPITER.d, JUPITER.c),
  tema("61d30ff9", "2026-11-14T14:08:32.135Z", JUPITER.d, JUPITER.c, semn("jupiter", "2026-11-14T14:07:09.801Z")),
  publicare("e1f8398f", "2026-11-14T14:08:32.535Z", VENUS.d, VENUS.c),
];
/** Cele sase apasari cu regula veche: fiecare a readus Jupiter si i-a pus la loc semnul (cu data aplicarii lui). */
const READUCERI_JUPITER = ["14:09:28.194", "14:09:32.222", "14:09:37.505", "14:09:49.178", "14:10:25.167", "14:10:32.296"]
  .map((ora, i) => publicare(`readus-${i}`, `2026-11-14T${ora}Z`, JUPITER.d, JUPITER.c));

test("⚠⚠ MNY AROMA: dupa Saturn, Jupiter si Venus incercate la rand, revine designul LUI, intr-un clic", () => {
  // Chiar dupa Venus (semnul ei, scris la ~0,13 s dupa publicare): regula veche dadea Jupiter (`61d30ff9`).
  assert.deepEqual(alege(MNY, semn("venus", "2026-11-14T14:08:32.666Z")), { id: "4b0ef124", temaDupa: "saturn" });
});

test("⚠⚠ MNY AROMA azi: dupa cele sase apasari care readuceau tot Jupiter, apasarea urmatoare readuce designul LUI", () => {
  const azi = [...MNY, ...READUCERI_JUPITER];
  // Semnul din magazin la 14.11, 16:10 (citit din productie): Jupiter, cu data aplicarii lui.
  assert.deepEqual(alege(azi, semn("jupiter", "2026-11-14T14:07:09.801Z")), { id: "4b0ef124", temaDupa: "saturn" });
});

test("⚠⚠ o tema peste care a PUBLICAT ceva opreste saritura: revine ea; apasarea urmatoare merge mai in urma, nu pe loc", () => {
  const A = { d: design("a"), c: continut("#111111") };
  const aLucrata = { d: design("a, cu sectiunile lui"), c: continut("#111111") };
  const B = { d: design("b"), c: continut("#222222") };
  const semnA = semn("a", "2026-11-01T10:00:00.400Z");
  const istoric: V[] = [
    tema("t-orig", "2026-11-01T10:00:00.000Z", ORIGINAL.d, ORIGINAL.c, null),
    publicare("p-a", "2026-11-01T10:00:00.300Z", A.d, A.c),
    publicare("p-lucru", "2026-11-03T09:00:00.000Z", aLucrata.d, aLucrata.c),
    tema("t-a", "2026-11-05T12:00:00.000Z", aLucrata.d, aLucrata.c, semnA),
    publicare("p-b", "2026-11-05T12:00:00.300Z", B.d, B.c),
  ];
  assert.deepEqual(alege(istoric, semn("b", "2026-11-05T12:00:00.400Z")), { id: "t-a", temaDupa: "b" });

  // „Pune la loc” a readus tema A lucrata si semnul ei (cu data aplicarii A). Apasarea urmatoare: designul de dinainte de A.
  const dupa = [...istoric, publicare("p-readus", "2026-11-05T12:05:00.000Z", aLucrata.d, aLucrata.c)];
  assert.deepEqual(alege(dupa, semnA), { id: "t-orig", temaDupa: "a" });
});

test("⚠ a publicat modificari peste tema, apoi le-a intors intocmai la ea: tema ramane a lui (o publicare intre ele ajunge)", () => {
  const A = { d: design("a"), c: continut("#111111") };
  const istoric: V[] = [
    tema("t-orig", "2026-11-01T10:00:00.000Z", ORIGINAL.d, ORIGINAL.c, null),
    publicare("p-a", "2026-11-01T10:00:00.300Z", A.d, A.c),
    publicare("p-schimbat", "2026-11-01T10:05:00.000Z", design("a, schimbat"), A.c),
    publicare("p-intors", "2026-11-01T10:10:00.000Z", A.d, A.c),
    tema("t-a", "2026-11-01T10:20:00.000Z", A.d, A.c, semn("a", "2026-11-01T10:00:00.400Z")),
    publicare("p-b", "2026-11-01T10:20:00.300Z", design("b"), continut("#222222")),
  ];
  // Versiunea e identica cu publicarea temei, dar intre ele a publicat de doua ori: a lucrat pe tema, deci revine ea.
  assert.deepEqual(alege(istoric, semn("b", "2026-11-01T10:20:00.400Z")), { id: "t-a", temaDupa: "b" });
});

test("⚠ un semn care nu sta chiar dupa o publicare (cel mult un minut) nu e luat drept tema din magazin", () => {
  const A = { d: design("a"), c: continut("#111111") };
  const aLucrata = { d: design("a, cu sectiunile lui"), c: continut("#111111") };
  const istoric: V[] = [
    tema("t-orig", "2026-11-01T09:00:00.000Z", ORIGINAL.d, ORIGINAL.c, null),
    publicare("p-a", "2026-11-01T09:00:00.300Z", A.d, A.c),
    publicare("p-lucru", "2026-11-01T09:30:00.000Z", aLucrata.d, aLucrata.c),
    tema("t-a", "2026-11-01T10:00:00.000Z", aLucrata.d, aLucrata.c, semn("a", "2026-11-01T09:00:00.400Z")),
    publicare("p-b", "2026-11-01T10:00:00.300Z", design("b"), continut("#222222")),
  ];
  // Semnul de la 09:45 nu urmeaza nicio publicare: legat de cea de la 09:30, ar fi sarit peste tema lucrata a lui.
  assert.deepEqual(alege(istoric, semn("b", "2026-11-01T09:45:00.000Z")), { id: "t-a", temaDupa: null });
});

test("⚠ o versiune care nu e intocmai publicarea temei (logo schimbat fara „Publică”) opreste saritura", () => {
  const A = { d: design("a"), c: continut("#111111") };
  const istoric: V[] = [
    tema("t-orig", "2026-11-01T10:00:00.000Z", ORIGINAL.d, ORIGINAL.c, null),
    publicare("p-a", "2026-11-01T10:00:00.300Z", A.d, A.c),
    tema("t-a", "2026-11-01T10:02:00.000Z", A.d, continut("#111111", "https://x/logo-nou.png"), semn("a", "2026-11-01T10:00:00.400Z")),
    publicare("p-b", "2026-11-01T10:02:00.300Z", design("b"), continut("#222222")),
  ];
  assert.deepEqual(alege(istoric, semn("b", "2026-11-01T10:02:00.400Z")), { id: "t-a", temaDupa: "b" });
  // Si designul: o singura diferenta ajunge.
  istoric[2] = tema("t-a", "2026-11-01T10:02:00.000Z", design("a, alt antet"), A.c, semn("a", "2026-11-01T10:00:00.400Z"));
  assert.deepEqual(alege(istoric, semn("b", "2026-11-01T10:02:00.400Z")), { id: "t-a", temaDupa: "b" });
});

test("aceeasi tema aplicata de doua ori la rand: revine designul de dinainte de ea", () => {
  const istoric: V[] = [
    tema("t-orig", "2026-11-01T10:00:00.000Z", ORIGINAL.d, ORIGINAL.c, null),
    publicare("p-j1", "2026-11-01T10:00:00.300Z", JUPITER.d, JUPITER.c),
    tema("t-j", "2026-11-01T10:01:00.000Z", JUPITER.d, JUPITER.c, semn("jupiter", "2026-11-01T10:00:00.400Z")),
    publicare("p-j2", "2026-11-01T10:01:00.300Z", JUPITER.d, JUPITER.c),
  ];
  assert.deepEqual(alege(istoric, semn("jupiter", "2026-11-01T10:01:00.400Z")), { id: "t-orig", temaDupa: "jupiter" });
});

test("⚠ versiunile de dinainte de 11.11 (fara stare): ca pana acum, magazinul de dinainte de tema din magazin", () => {
  const vechi = (v: V): V => ({ ...v, continut: { ...(v.continut as Record<string, unknown>), stare: undefined } });
  const istoric = MNY.map((v) => (v.origine === "tema" ? vechi(v) : v));
  assert.deepEqual(alege(istoric, semn("venus", "2026-11-14T14:08:32.666Z")), { id: "61d30ff9", temaDupa: "venus" });
});

test("fara semn, sau cu semnul fara publicarea lui in Istoric: cea mai noua versiune `tema`, ca pana acum", () => {
  assert.deepEqual(alege(MNY.slice(0, 2), null), { id: "4b0ef124", temaDupa: null });
  // Semnul unei teme aplicate acum doua luni, cu publicarea taiata din Istoric: startul e cea mai noua versiune `tema`,
  // iar de acolo saritura merge mai departe pe ce a ramas.
  assert.deepEqual(alege(MNY, semn("saturn", "2026-09-01T10:00:00.000Z")), { id: "4b0ef124", temaDupa: "saturn" });
  assert.equal(alege([publicare("p", "2026-11-01T10:00:00.000Z", ORIGINAL.d, ORIGINAL.c)], null), null);
});

test("⚠ o aplicare cazuta dupa Istoric (versiune `tema` fara publicare) nu muta startul pe ea", () => {
  // Venus a cazut la import, dupa ce a scris versiunea: in magazin a ramas Jupiter, cu semnul lui.
  const istoric = [...MNY.slice(0, 4), tema("t-cazut", "2026-11-14T14:08:32.135Z", JUPITER.d, JUPITER.c, semn("jupiter", "2026-11-14T14:07:09.801Z"))];
  assert.deepEqual(alege(istoric, semn("jupiter", "2026-11-14T14:07:09.801Z")), { id: "4b0ef124", temaDupa: "saturn" });
});

test("⚠ publicarea temei lipsa din Istoric (scrierea versiunii a cazut): nu se ia drept a ei o publicare mai veche", () => {
  // El a publicat la 10:00:00, a aplicat tema la 10:00:20, iar versiunea publicarii temei nu s-a scris.
  const istoric: V[] = [
    tema("t-veche", "2026-10-01T10:00:00.000Z", ORIGINAL.d, ORIGINAL.c, null),
    publicare("p-veche", "2026-10-01T10:00:00.300Z", SATURN.d, SATURN.c),
    publicare("p-lui", "2026-11-01T10:00:00.000Z", design("al lui"), continut("#333333")),
    tema("t-a", "2026-11-01T10:00:20.000Z", design("al lui"), continut("#333333"), null),
  ];
  // Fara garda, startul ar fi fost versiunea dinaintea publicarii lui, de acum o luna.
  assert.deepEqual(alege(istoric, semn("jupiter", "2026-11-01T10:00:20.500Z")), { id: "t-a", temaDupa: null });
});

test("cate teme se sar cel mult: PASI_MAX; startul si fiecare pas cer doar versiunile lor", () => {
  const istoric: V[] = [tema("t0", "2026-11-01T10:00:00.000Z", ORIGINAL.d, ORIGINAL.c, null)];
  const n = PASI_MAX + 5;
  for (let i = 1; i <= n; i++) {
    const t = Date.parse("2026-11-01T10:00:00.000Z") + i * 10_000;
    const pub = (k: number) => ({ d: design(`tema ${k}`), c: continut(`#0000${String(k).padStart(2, "0")}`) });
    istoric.push(publicare(`p${i}`, new Date(t - 9_700).toISOString(), pub(i).d, pub(i).c));
    istoric.push(tema(`t${i}`, new Date(t).toISOString(), pub(i).d, pub(i).c, semn(`tema-${i}`, new Date(t - 9_600).toISOString())));
  }
  istoric.push(publicare(`p${n + 1}`, new Date(Date.parse("2026-11-01T10:00:00.000Z") + n * 10_000 + 300).toISOString(), design("ultima"), continut("#FFFFFF")));
  const semnul = semn("ultima", new Date(Date.parse("2026-11-01T10:00:00.000Z") + n * 10_000 + 400).toISOString());
  const lista: RandIstoric[] = istoric.map((v) => ({ id: v.id, origine: v.origine, created_at: v.created_at, stare: (v.continut as { stare?: unknown }).stare ?? null }));
  const drum = drumulInapoi(lista, semnul)!;
  assert.equal(drum.pasi.length, PASI_MAX);
  assert.equal(versiuniDeCitit(drum).length, 1 + 2 * PASI_MAX);
  assert.deepEqual(alege(istoric, semnul), { id: `t${n - PASI_MAX}`, temaDupa: `tema-${n - PASI_MAX + 1}` });
});

test("versiunile cerute lipsa (sterse intre cele doua citiri): startul lipsa = `null`, un pas lipsa opreste saritura", () => {
  const lista: RandIstoric[] = MNY.map((v) => ({ id: v.id, origine: v.origine, created_at: v.created_at, stare: (v.continut as { stare?: unknown }).stare ?? null }));
  const drum = drumulInapoi(lista, semn("venus", "2026-11-14T14:08:32.666Z"))!;
  assert.deepEqual(versiuniDeCitit(drum), ["61d30ff9", "3b80f452", "1ead9430", "5657e386", "4b0ef124"]);
  const intregi = (fara: string[]) => new Map(MNY.filter((v) => !fara.includes(v.id)).map((v) => [v.id, { design: v.design, continut: v.continut }]));
  assert.equal(versiuneaDePusLaLoc(drum, intregi(["61d30ff9"])), null);
  assert.deepEqual(versiuneaDePusLaLoc(drum, intregi(["4b0ef124"])), { id: "1ead9430", temaDupa: "jupiter" });
  assert.deepEqual(versiuneaDePusLaLoc(drum, intregi(["3b80f452"])), { id: "61d30ff9", temaDupa: "venus" });
});
