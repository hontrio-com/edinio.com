import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { TEME } from "@/lib/teme/teme";
import { NON_STORE_SEGMENTS } from "@/lib/segmente-rezervate";
import { SOLUTION_COLUMNS } from "./nav";
import { FOOTER_COLUMNS } from "./footer";
import { adresaTigla, RANDURI_BANDA } from "./teme-banda";
import { temelePeScurt } from "@/lib/teme/teme-pe-scurt";

/*
  ═══ PAGINA „/TEME” A SITE-ULUI DE PREZENTARE (16.11.2026) ═══

  Cerut de el: „pe website-ul de prezentare o secțiune nouă cu «Teme»”, ca pagină nouă, în meniu la „Vinde”, în subsol
  și în sitemap (sitemapul o ia singur din meniu). Apoi: fără rubrici și fără titlul secțiunii, „carduri premium pentru
  fiecare temă, câte 4 pe rând”, și „un HERO mai modern dar să rămână tot același stil”: banda dublă de teme, varianta C,
  aleasă de el dintre cinci („Ramane varianta C”).
  Apoi: „cardurile mai mari și premium” (scena cu fereastra și telefonul) și galeria despărțită de hero.
*/

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");

test("pagina e legata: meniul (deci si sitemapul), subsolul si segmentul rezervat", () => {
  const dinMeniu = SOLUTION_COLUMNS.flatMap((c) => c.items).find((i) => i.href === "/teme");
  assert.ok(dinMeniu, "pagina lipseste din meniu, deci si din sitemap");
  assert.equal(dinMeniu.label, "Teme");
  const dinSubsol = FOOTER_COLUMNS.flatMap((c) => c.links).find((l) => l.href === "/teme");
  assert.equal(dinSubsol?.label, dinMeniu.label, "acelasi loc, numit la fel in meniu si in subsol");
  assert.ok(NON_STORE_SEGMENTS.has("teme"), "`/teme` ar fi tratat ca slug de magazin de proxy");
});

test("⚠⚠ galeria NU trage temele intregi in browser: pagina e de server, lista intra ca TIP", () => {
  const pagina = cod("src/app/(website)/teme/page.tsx");
  assert.doesNotMatch(pagina, /"use client"/);
  assert.match(pagina, /temelePeScurt\(new URL\(PLATFORM_ORIGIN\)\.host\)/, "„Vezi demo” trebuie sa duca la demo-urile din productie");
  const galerie = cod("src/components/website/sections/teme/GalerieTeme.tsx");
  assert.match(galerie, /^"use client";/);
  assert.doesNotMatch(galerie, /^import (?!type )[^;]*from "@\/lib\/teme\//m, "galeria importa VALORI din lib/teme: designurile si datele demo intra in pachet");
  assert.match(galerie, /import type \{ TemaPeScurt \} from "@\/lib\/teme\/teme-pe-scurt";/);
});

test("raspunsurile lui: fara rubrici si fara titlul sectiunii, cate 4 carduri pe rand", () => {
  const galerie = cod("src/components/website/sections/teme/GalerieTeme.tsx");
  assert.doesNotMatch(galerie, /aria-pressed|rubric/i, "rubricile s-au intors");
  assert.doesNotMatch(galerie, /Găsește tema potrivită/, "titlul sectiunii, scos la cererea lui, s-a intors");
  assert.match(galerie, /xl:grid-cols-4/, "cate 4 pe rand pe ecranele mari");
  // „Sa se departa cumva sectiunea de HERO de sectiunea cu temele”: banda ei, cu linie sus si fond gri deschis.
  assert.match(galerie, /<section id="teme" className="[^"]*\bborder-t border-hairline bg-tint-2\b/, "galeria s-a lipit iar de hero");
});

test("⚠ fiecare tema are captura pe telefon, pentru telefonul din cardul ei", () => {
  const lista = temelePeScurt("www.edinio.com");
  for (const t of lista) {
    assert.ok(t.telefon, `${t.cheie}: fara captura pe telefon (scripts/teme/capturi-telefon.mjs), cardul iese fara telefon`);
    assert.ok(existsSync(`public${t.telefon.adresa}`), `${t.cheie}: captura pe telefon lipseste din public/`);
  }
});

test("numarul temelor din titlu se socoteste din lista, nu se scrie de mana", () => {
  const pagina = cod("src/app/(website)/teme/page.tsx");
  assert.match(pagina, /\$\{pluralRo\(teme\.length, "temă", "teme"\)\}/);
  assert.doesNotMatch(pagina, /\b30 de teme\b/, "un numar scris de mana s-ar demoda la prima tema noua");
});

test("⚠ banda dubla din hero: fiecare tema exista si are captura mica, randurile umplu un ecran lat, animatia se opreste", () => {
  const chei = TEME.map((t) => t.cheie);
  const toate = RANDURI_BANDA.flat();
  assert.equal(new Set(toate).size, toate.length, "tema dublata in banda");
  for (const c of toate) {
    assert.ok(chei.includes(c), `in banda e o tema care nu exista: ${c}`);
    assert.ok(existsSync(`public${adresaTigla(c)}`), `${c}: lipseste captura mica (scripts/teme/capturi-banda.mjs)`);
  }
  // Un card + marginea lui fac 252 px de la `sm` (230 + 22): un rand mai scurt decat un ecran de 1920 px lasa gol pana reia.
  for (const rand of RANDURI_BANDA) assert.ok(rand.length * 252 > 1920, `rand prea scurt (${rand.length}): pe ecranele late s-ar vedea gol`);
  const css = readFileSync("src/app/teme-animat.css", "utf8");
  assert.match(css, /\.banda-teme\[data-in-afara\] \.banda-teme__rand \{\s*animation-play-state: paused;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.banda-teme \.banda-teme__rand \{\s*animation: none;/);
  assert.match(cod("src/components/website/sections/teme/BandaDublaTeme.tsx"), /<OprireInAfaraEcranului \/>/);
  assert.match(cod("src/app/(website)/teme/page.tsx"), /dedesubt=\{<BandaDublaTeme randuri=\{RANDURI_BANDA\} \/>\}/);
});
