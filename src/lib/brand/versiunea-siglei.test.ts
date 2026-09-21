import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { VERSIUNEA_SIGLEI, cuVersiune } from "./versiunea-siglei";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ MASURAT PE 21.09.2026. Sigla noua a intrat in productie pe 20.09, iar
  fisierele de pe server erau cele noi - `sha1` identic cu cel din depozit.
  Browserele aratau mai departe pictograma VECHE, iar proprietarul a crezut ca
  rebrandingul n-a ajuns.

  Vinovatul e antetul cu care Vercel serveste `public/`:
  `Cache-Control: public, max-age=31536000, immutable`. Un an, si `immutable`
  inseamna „nici macar nu intreba". Cine intrase pe site inainte de 20.09 avea
  pictograma veche si nu o mai cerea.

  Singura iesire e sa se schimbe ADRESA, fiindca aia e cheia din cache.
*/

test("adresa poarta versiunea, nu doar numele fisierului", () => {
  assert.equal(cuVersiune("/favicon.ico"), `/favicon.ico?v=${VERSIUNEA_SIGLEI}`);
  assert.match(cuVersiune("/apple-touch-icon.png"), /\?v=\d{4}-\d{2}-\d{2}$/);
});

test("⚠ TOATE PICTOGRAMELE DIN CAPUL PAGINII AU VERSIUNE", () => {
  /*
    ⚠ Una singura lasata fara `?v=` ramane in cacheul de un an, si atunci
    browserul arata pe unele locuri sigla noua si pe altele pe cea veche -
    ceea ce e mai derutant decat daca ar fi toate vechi.
  */
  const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
  const bloc = layout.slice(layout.indexOf("icons: {"), layout.indexOf("};", layout.indexOf("icons: {")));

  /*
    Fiecare cale de pictograma trece prin `cuVersiune`.

    ⚠ SE CERE FIECARE PE NUME, nu se numara apelurile. Prima scriere cerea
    „exact patru" si a cazut, fiindca felia de text prindea si manifestul de
    dedesubt - o proba picata fara sa fie nimic stricat.
  */
  const caleGoala = bloc.match(/url: "\/[^"]+"/g) ?? [];
  assert.deepEqual(caleGoala, [], `pictograme fara versiune: ${caleGoala.join(", ")}`);
  for (const cale of ["/favicon.ico", "/favicon-16x16.png", "/favicon-32x32.png", "/apple-touch-icon.png"]) {
    assert.ok(bloc.includes(`cuVersiune("${cale}")`), `${cale} nu trece prin \`cuVersiune\``);
  }

  /* ⚠ Si manifestul: e prins in acelasi cache, cu tot cu pictogramele lui. */
  assert.match(layout, /manifest: cuVersiune\("\/site\.webmanifest"\)/, "manifestul n-are versiune");
});

test("⚠ VERSIUNEA NU E LEGATA DE BUILD", () => {
  /*
    ⚠ Pusa pe fiecare desfasurare, ar cere browserelor sa descarce din nou toate
    pictogramele de fiecare data - adica ar arunca tocmai cacheul de un an, care
    e BUN cand sigla nu se schimba. E o zi scrisa de mana, si se muta doar la
    urmatorul rebranding.
  */
  assert.match(VERSIUNEA_SIGLEI, /^\d{4}-\d{2}-\d{2}$/);
  const sursa = readFileSync(new URL("./versiunea-siglei.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sursa, /Date\.now\(\)|new Date\(\)|process\.env/, "versiunea se schimba singura");
});

test("⚠ FISIERELE PE CARE LE ARATA CAPUL PAGINII CHIAR EXISTA", () => {
  /*
    ⚠ O pictograma declarata si lipsa nu da nicio eroare vizibila: browserul
    cere, primeste 404 si arata pictograma implicita - adica pagina pare fara
    marca, si nimeni nu stie de ce.
  */
  const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
  const cai = [...layout.matchAll(/cuVersiune\("(\/[^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(cai.length >= 5, "nu s-au gasit caile pictogramelor");
  for (const c of cai) {
    const f = new URL(`../../../public${c}`, import.meta.url);
    assert.ok(readFileSync(f).length > 0, `lipseste public${c}`);
  }
});

test("⚠ MANIFESTUL NU TRIMITE LA PICTOGRAME CARE NU EXISTA", () => {
  /*
    ⚠ Manifestul e citit de Android cand omul pune magazinul pe ecranul de
    start. O intrare lipsa nu se vede nicaieri in aplicatie: se vede abia pe
    telefonul lui, ca o pictograma goala.
  */
  const manifest = JSON.parse(
    readFileSync(new URL("../../../public/site.webmanifest", import.meta.url), "utf8"),
  ) as { icons: { src: string }[]; theme_color: string };

  for (const i of manifest.icons) {
    const f = new URL(`../../../public${i.src}`, import.meta.url);
    assert.ok(readFileSync(f).length > 0, `manifestul cere public${i.src}, care lipseste`);
  }
  /* ⚠ Si culoarea din manifest e cea a marcii NOI, nu cea veche. */
  assert.equal(manifest.theme_color.toLowerCase(), "#07c527", "manifestul poarta alt verde");
});
