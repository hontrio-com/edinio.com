/*
  Capturi pe TELEFON ale primului ecran al fiecarei teme (16.11.2026), pentru telefonul din cardurile paginii „/teme”.
  Aceeasi comanda a Chrome-ului ca `capturi-teme.mjs` (de acolo e copiata partea cu WebSocket-ul); alt ecran: 390x844,
  densitate 2, telefon. Un singur ecran: in card telefonul e mic si nu se deruleaza.

  Rulare, din radacina depozitului, cu serverul local pornit pe baza demo (`npm run dev`):
    node scripts/teme/capturi-telefon.mjs            (toate temele)
    node scripts/teme/capturi-telefon.mjs marte vega (doar acestea)
  Iesire: public/teme-capturi/mobil/<cheie>.webp (300 px latime) si indexul `src/lib/teme/capturi-telefon.ts`.
  ⚠ `next.config` pune `immutable` pe un an pe tot ce e in `public/`: o captura refacuta ia NUME NOU.
*/
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const BAZA = process.env.CAPTURI_BAZA ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const LATIME = 390;
const INALTIME_ECRAN = 844;
const LATIME_FISIER = 300;
const PORT = 9334;
const DOSAR = "public/teme-capturi/mobil";
const INDEX = "src/lib/teme/capturi-telefon.ts";

const cheiTeme = [...readFileSync("src/lib/teme/gazde-demo.ts", "utf8").match(/CHEI_TEME = \[([\s\S]*?)\]/)[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
const cerute = process.argv.slice(2);
const deFacut = cerute.length ? cheiTeme.filter((c) => cerute.includes(c)) : cheiTeme;
if (cerute.length && deFacut.length !== cerute.length) throw new Error(`Teme necunoscute: ${cerute.filter((c) => !cheiTeme.includes(c)).join(", ")}`);

const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

const profil = mkdtempSync(join(tmpdir(), "capturi-telefon-"));
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
await cere("Emulation.setDeviceMetricsOverride", { width: LATIME, height: INALTIME_ECRAN, deviceScaleFactor: 2, mobile: true });
// Acordul de cookie-uri dat dinainte (doar cele esentiale): bannerul nu mai apare in poza.
await cere("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { const s = location.pathname.split("/")[1]; localStorage.setItem("edinio_cc_" + s, JSON.stringify({ necessary: true, analytics: false, marketing: false, v: 1, ts: Date.now() })); } catch {}`,
});

mkdirSync(DOSAR, { recursive: true });
const dimensiuni = {};
if (existsSync(INDEX)) {
  for (const m of readFileSync(INDEX, "utf8").matchAll(/(\w+): \{ latime: (\d+), inaltime: (\d+) \}/g)) {
    dimensiuni[m[1]] = { latime: +m[2], inaltime: +m[3] };
  }
}

for (const cheie of deFacut) {
  evenimente.length = 0;
  await cere("Page.navigate", { url: `${BAZA}/tema-${cheie}` });
  for (let i = 0; i < 300 && !evenimente.includes("Page.loadEventFired"); i++) await asteapta(100);
  await asteapta(2500);
  await evalueaza(`(async () => {
    window.scrollTo(0, ${INALTIME_ECRAN}); await new Promise(r => setTimeout(r, 300));
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 800));
    await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 8000); })));
  })()`);
  await evalueaza(`(() => {
    for (const el of document.querySelectorAll("body *")) {
      const p = getComputedStyle(el).position;
      if (p === "fixed" && !el.closest("header")) el.style.setProperty("visibility", "hidden", "important");
    }
    for (const el of document.querySelectorAll("nextjs-portal")) el.remove();
  })()`);
  await asteapta(1200);
  const { data } = await cere("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: LATIME, height: INALTIME_ECRAN, scale: 1 } });
  const tinta = join(DOSAR, `${cheie}.webp`);
  const info = await sharp(Buffer.from(data, "base64")).resize({ width: LATIME_FISIER, kernel: "lanczos3" }).webp({ quality: 76, effort: 6 }).toFile(tinta);
  dimensiuni[cheie] = { latime: info.width, inaltime: info.height };
  console.log(`${cheie}: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
}

ws.close();
chrome.kill();
await asteapta(500);
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome inca tine fisierele */ }

const randuri = cheiTeme.filter((c) => dimensiuni[c]).map((c) => `  ${c}: { latime: ${dimensiuni[c].latime}, inaltime: ${dimensiuni[c].inaltime} },`);
writeFileSync(INDEX, `// SCRIS de \`scripts/teme/capturi-telefon.mjs\`, nu de mana: capturile pe telefon ale temelor, din \`public/teme-capturi/mobil\`.

/** Dimensiunile capturii pe telefon a fiecarei teme (primul ecran, la 390 px, densitate 2, micsorat). */
export const CAPTURI_TELEFON: Readonly<Record<string, { latime: number; inaltime: number }>> = {
${randuri.join("\n")}
};

/** Adresa capturii pe telefon a temei, din \`public/\`. */
export function adresaCapturiiTelefon(cheie: string): string {
  return \`/teme-capturi/mobil/\${cheie}.webp\`;
}
`);
console.log(`index: ${randuri.length} teme`);
