/*
  Capturile temelor pentru pagina „Teme” din panou (cerut de el, 08.11.2026: „vreau sa fie o poza iar daca tii
  mouse-ul pe ea sa se dea asa scroll”). Inainte, fiecare card avea demo-ul VIU intr-un iframe: 30 de magazine
  intregi incarcate deodata, doar ca sa fie privite.

  Ce face: deschide prima pagina a fiecarui magazin demo (`/tema-<cheie>`) intr-un Chrome fara fereastra, pe un ecran
  de 1440 px, o deruleaza pana jos (pozele lenese si animatiile de aparitie se aprind), ascunde ce sta lipit de ecran
  (butoanele flotante, bannerul de cookie-uri), o fotografiaza intreaga si o scrie micsorata in
  `public/teme-capturi/<cheie>.webp`. Dimensiunile ajung in `src/lib/teme/capturi-teme.ts` (scris de script).

  Fara biblioteci noi: Chrome-ul instalat, comandat prin protocolul lui de depanare (WebSocket-ul din Node).

  Rulare, din `edinio/`, cu serverul local pornit pe baza demo (`npm run dev`):
    node scripts/teme/capturi-teme.mjs            (toate temele)
    node scripts/teme/capturi-teme.mjs marte vega (doar acestea)
*/
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const BAZA = process.env.CAPTURI_BAZA ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const LATIME = 1440;
/** Cat de lunga e cel mult captura (px de ecran): destul pentru toata prima pagina a oricarei teme. */
const INALTIME_MAX = 9000;
/** Latimea fisierului: de doua ori cardul (~360 px), pentru ecranele dense. */
const LATIME_FISIER = 720;
const PORT = 9333;
const DOSAR = "public/teme-capturi";

const cheiTeme = [...readFileSync("src/lib/teme/gazde-demo.ts", "utf8").match(/CHEI_TEME = \[([\s\S]*?)\]/)[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
const cerute = process.argv.slice(2);
const deFacut = cerute.length ? cheiTeme.filter((c) => cerute.includes(c)) : cheiTeme;
if (cerute.length && deFacut.length !== cerute.length) throw new Error(`Teme necunoscute: ${cerute.filter((c) => !cheiTeme.includes(c)).join(", ")}`);

const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

const profil = mkdtempSync(join(tmpdir(), "capturi-teme-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`,
  "--hide-scrollbars", "--mute-audio", "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });

async function adresaPaginii() {
  for (let i = 0; i < 50; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const pagina = lista.find((t) => t.type === "page");
      if (pagina) return pagina.webSocketDebuggerUrl;
    } catch { /* Chrome inca porneste */ }
    await asteapta(200);
  }
  throw new Error("Chrome nu a pornit");
}

const ws = new WebSocket(await adresaPaginii());
await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; });
let urmatorul = 0;
const asteptari = new Map();
const evenimente = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && asteptari.has(d.id)) {
    const { r, e } = asteptari.get(d.id);
    asteptari.delete(d.id);
    if (d.error) e(new Error(d.error.message)); else r(d.result);
  } else if (d.method) evenimente.push(d.method);
};
const cere = (method, params = {}) => new Promise((r, e) => {
  const id = ++urmatorul;
  asteptari.set(id, { r, e });
  ws.send(JSON.stringify({ id, method, params }));
});
const evalueaza = async (expresie) => (await cere("Runtime.evaluate", { expression: expresie, awaitPromise: true, returnByValue: true })).result.value;

await cere("Page.enable");
await cere("Emulation.setDeviceMetricsOverride", { width: LATIME, height: 900, deviceScaleFactor: 1, mobile: false });
// Acordul de cookie-uri dat dinainte (doar cele esentiale): bannerul nu mai apare in poza.
await cere("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { const s = location.pathname.split("/")[1]; localStorage.setItem("edinio_cc_" + s, JSON.stringify({ necessary: true, analytics: false, marketing: false, v: 1, ts: Date.now() })); } catch {}`,
});

mkdirSync(DOSAR, { recursive: true });
const dimensiuni = {};
const fisierDimensiuni = "src/lib/teme/capturi-teme.ts";
if (existsSync(fisierDimensiuni)) {
  for (const m of readFileSync(fisierDimensiuni, "utf8").matchAll(/(\w+): \{ latime: (\d+), inaltime: (\d+) \}/g)) {
    dimensiuni[m[1]] = { latime: +m[2], inaltime: +m[3] };
  }
}

for (const cheie of deFacut) {
  evenimente.length = 0;
  await cere("Page.navigate", { url: `${BAZA}/tema-${cheie}` });
  for (let i = 0; i < 300 && !evenimente.includes("Page.loadEventFired"); i++) await asteapta(100);
  await asteapta(2500);
  // Derulata pana jos, ca pozele lenese si animatiile de aparitie sa se aprinda; apoi sus, si pozele asteptate.
  await evalueaza(`(async () => {
    const pas = 600;
    for (let y = 0; y < document.documentElement.scrollHeight; y += pas) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 800));
    await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 8000); })));
  })()`);
  // Ce sta lipit de ecran, in afara antetului: butoanele flotante, cosul lipit, indicatorul serverului de dezvoltare.
  await evalueaza(`(() => {
    for (const el of document.querySelectorAll("body *")) {
      const p = getComputedStyle(el).position;
      if (p === "fixed" && !el.closest("header")) el.style.setProperty("visibility", "hidden", "important");
    }
    for (const el of document.querySelectorAll("nextjs-portal")) el.remove();
  })()`);
  await asteapta(1200);
  const inaltime = Math.min(INALTIME_MAX, await evalueaza("document.documentElement.scrollHeight"));
  const { data } = await cere("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: LATIME, height: inaltime, scale: 1 },
  });
  const tinta = join(DOSAR, `${cheie}.webp`);
  const info = await sharp(Buffer.from(data, "base64")).resize({ width: LATIME_FISIER }).webp({ quality: 74, effort: 6 }).toFile(tinta);
  dimensiuni[cheie] = { latime: info.width, inaltime: info.height };
  console.log(`${cheie}: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
}

ws.close();
chrome.kill();
await asteapta(500);
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome inca tine fisierele: le curata sistemul */ }

const ordonate = cheiTeme.filter((c) => dimensiuni[c]);
writeFileSync(fisierDimensiuni, `// SCRIS de \`scripts/teme/capturi-teme.mjs\`, nu de mana: capturile temelor din \`public/teme-capturi\`.

/** Dimensiunile capturii fiecarei teme (prima pagina intreaga, la 1440 px, micsorata). */
export const CAPTURI_TEME: Readonly<Record<string, { latime: number; inaltime: number }>> = {
${ordonate.map((c) => `  ${c}: { latime: ${dimensiuni[c].latime}, inaltime: ${dimensiuni[c].inaltime} },`).join("\n")}
};

/** Adresa capturii temei, din \`public/\`. */
export function adresaCapturii(cheie: string): string {
  return \`/teme-capturi/\${cheie}.webp\`;
}
`);
console.log(`Gata: ${deFacut.length} capturi.`);
