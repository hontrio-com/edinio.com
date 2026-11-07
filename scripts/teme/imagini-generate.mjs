/*
  Pozele demo ale temelor 2-30 (etapa 24 din `docs/editor-magazin/PLAN.md`), din imaginile generate cu ElevenLabs:

    node scripts/teme/imagini-generate.mjs <cheie> <folderul cu imaginile brute>

  Ce face, dupa `scripts/teme/imagini/<cheie>.json`:
  - `grile`: o imagine 3x3 (noua obiecte pe fond alb, decise in prompt) se taie in noua celule egale; din fiecare se
    scoate fondul alb LEGAT DE MARGINI (umplere din colturi), nu orice alb: un bol alb sau o sticla alba din mijlocul
    obiectului raman. Apoi obiectul se decupeaza la marginile lui si se pune pe un patrat transparent, cu aer in jur.
    `"fond": "pastreaza"` lasa fondul (pozele de produs pe fond inchis ale temelor intunecate, fotografiile din grile).
  - `poze`: o fotografie se taie la raportul locului ei si se micsoreaza la latimea data.
  - `sigla`: fondul (alb sau negru) iese prin aceeasi umplere din margini, sigla se decupeaza; faviconul e partea din
    stanga pana la prima coloana goala (simbolul), pe patrat, PNG (Safari nu arata un favicon WebP).

  Scrie in `public/teme/<cheie>/`, WebP. ⚠ `next.config.ts` le da `immutable` pe un an: o poza schimbata ia NUME NOU.
  Imaginile brute raman in afara depozitului (sunt descarcari, deci date neverificate: se citesc, nu se ruleaza nimic).
*/
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RADACINA = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [cheie, sursa] = process.argv.slice(2);
if (!cheie || !sursa) throw new Error("Folosire: node scripts/teme/imagini-generate.mjs <cheie> <folderul cu imaginile brute>");
const manifest = JSON.parse(readFileSync(join(RADACINA, "scripts", "teme", "imagini", `${cheie}.json`), "utf8"));
const IESIRE = join(RADACINA, "public", "teme", cheie);

/** Pixel „de fond”: aproape alb (sau aproape negru, la siglele pe negru). */
function eFond(r, g, b, fond) {
  return fond === "negru" ? r < 28 && g < 28 && b < 28 : r > 236 && g > 236 && b > 236;
}

/**
 * Fondul legat de margini devine transparent (umplere in latime din toti pixelii de pe margine). Pixelii de fond de
 * langa obiect primesc o trecere moale (alfa dupa cat de departe sunt de alb), ca marginea sa nu fie zimtata.
 */
async function faraFond(intrare, fond = "alb") {
  const { data, info } = await sharp(intrare).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const vazut = new Uint8Array(w * h);
  const coada = new Int32Array(w * h);
  let cap = 0, coadaLung = 0;
  const pune = (i) => {
    if (vazut[i]) return;
    const o = i * 4;
    if (!eFond(data[o], data[o + 1], data[o + 2], fond)) return;
    vazut[i] = 1;
    coada[coadaLung++] = i;
  };
  for (let x = 0; x < w; x++) { pune(x); pune((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { pune(y * w); pune(y * w + w - 1); }
  while (cap < coadaLung) {
    const i = coada[cap++];
    const x = i % w, y = (i - x) / w;
    if (x > 0) pune(i - 1);
    if (x < w - 1) pune(i + 1);
    if (y > 0) pune(i - w);
    if (y < h - 1) pune(i + w);
  }
  for (let i = 0; i < w * h; i++) {
    if (!vazut[i]) continue;
    const o = i * 4;
    if (fond === "negru") {
      // Pe negru: lumina slaba din jurul obiectului ramane lumina (culoarea ei, alfa dupa cat de luminoasa e).
      data[o + 3] = Math.min(255, Math.round(Math.max(data[o], data[o + 1], data[o + 2]) * 6));
    } else {
      // Pe alb: umbra moale de sub obiect devine o umbra ADEVARATA (negru translucid), nu un abur alb: pe o placa
      // colorata, pixelii gri-deschis pastrati cu culoarea lor ar fi aparut ca un halou alb sub obiect.
      // Sub 14 trepte de la alb: fond (un alb „aproape”, ca fondul siglelor generate, altfel ramanea un voal care
      // umfla decupajul la toata imaginea).
      const d = 255 - Math.min(data[o], data[o + 1], data[o + 2]);
      data[o] = 0; data[o + 1] = 0; data[o + 2] = 0;
      data[o + 3] = d < 14 ? 0 : Math.min(255, Math.round((d - 14) * 1.7));
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/**
 * Decupat la pixelii vizibili (alfa > 8). ⚠ Nu `trim()`: pe imaginile cu alfa, sharp 0.34 cade cu „rank: window too large”.
 */
async function decupeazaAlfa(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("celula goala: nimic vizibil dupa scoaterea fondului");
  const out = await sharp(buf).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png().toBuffer({ resolveWithObject: true });
  return { data: out.data, info: out.info };
}

/** Obiectul decupat la marginile lui, pe un patrat transparent, cu `aer` (fractie) de margine. */
async function patrat(buf, latime, aer = 0.08) {
  const decupat = await decupeazaAlfa(buf);
  const latura = Math.round(Math.max(decupat.info.width, decupat.info.height) * (1 + 2 * aer));
  return sharp({ create: { width: latura, height: latura, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: decupat.data, gravity: "center" }])
    .png().toBuffer()
    .then((p) => sharp(p).resize(latime, latime));
}

async function scrie(img, cale) {
  const tinta = join(IESIRE, `${cale}.webp`);
  mkdirSync(dirname(tinta), { recursive: true });
  const info = await img.webp({ quality: 76, alphaQuality: 85, effort: 6 }).toFile(tinta);
  return { cale, kb: Math.round(info.size / 1024) };
}

const iesite = [];

for (const g of manifest.grile ?? []) {
  const img = sharp(join(sursa, g.fisier));
  const { width, height } = await img.metadata();
  const cw = Math.floor(width / 3), ch = Math.floor(height / 3);
  for (let k = 0; k < 9; k++) {
    const tinta = g.celule[k];
    if (!tinta) continue;
    // `margine` (fractie): se taie si din marginea celulei, cand obiectele vecine trec peste granita ei (grilele pe negru).
    const m = Math.round(cw * (g.margine ?? 0));
    const celula = await sharp(join(sursa, g.fisier))
      .extract({ left: (k % 3) * cw + m, top: Math.floor(k / 3) * ch + m, width: cw - 2 * m, height: ch - 2 * m }).png().toBuffer();
    if (g.fond === "transparent") {
      // Grila trecuta deja prin decuparea ElevenLabs (`birefnet-v2-bg-removal`): fondul e scos de model, cu tot cu
      // umbra, iar obiectele albe raman intregi (pe culoare, un obiect alb pe fond alb nu se poate separa).
      iesite.push(await scrie(await patrat(celula, g.latime ?? 640, g.aer ?? 0.08), tinta));
    } else if (g.fond === "pastreaza") {
      // Fotografia din celula: fara chenarul alb dintre celule (decupare dupa culoarea din colt), apoi patrata.
      const fara = await sharp(celula).trim({ threshold: 18 }).toBuffer();
      iesite.push(await scrie(sharp(fara).resize(g.latime ?? 640, g.latime ?? 640, { fit: "cover" }), tinta));
    } else {
      iesite.push(await scrie(await patrat(await faraFond(celula, g.fond ?? "alb"), g.latime ?? 640, g.aer ?? 0.08), tinta));
    }
  }
}

for (const p of manifest.poze ?? []) {
  const img = sharp(join(sursa, p.fisier));
  const { width, height } = await img.metadata();
  let lat = width, ina = height;
  if (p.raport) {
    if (width / height > p.raport) lat = Math.round(height * p.raport); else ina = Math.round(width / p.raport);
  }
  const left = p.pozitie === "stanga" ? 0 : p.pozitie === "dreapta" ? width - lat : Math.round((width - lat) / 2);
  const top = Math.round((height - ina) / 2);
  iesite.push(await scrie(sharp(join(sursa, p.fisier)).extract({ left, top, width: lat, height: ina }).resize(p.latime), p.iesire));
}

if (manifest.sigla) {
  const s = manifest.sigla;
  const fara = await faraFond(join(sursa, s.fisier), s.fond ?? "alb");
  const decupata = await decupeazaAlfa(fara);
  iesite.push(await scrie(sharp(decupata.data).resize({ height: s.inaltime ?? 160 }), "sigla"));

  // Faviconul: simbolul din stanga siglei (pana la prima coloana complet transparenta dupa el).
  const { data, info } = await sharp(decupata.data).raw().toBuffer({ resolveWithObject: true });
  const plina = (x) => { for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 20) return true; return false; };
  // Capatul simbolului = inceputul primului gol de cel putin 2% din latime (min. 8 coloane): un gol mai mic poate fi intre
  // bucatile simbolului insusi (degetele unei labute), cel mare e intre simbol si cuvant.
  const golMinim = Math.max(8, Math.round(info.width * 0.02));
  // Golul se numara doar dupa ce a inceput simbolul: primele coloane pot avea doar marginea moale a lui (alfa sub 20).
  let latSimbol = info.width, gol = 0, inceput = false;
  for (let x = 0; x < info.width; x++) {
    if (plina(x)) { gol = 0; inceput = true; }
    else if (inceput && ++gol >= golMinim) { latSimbol = x - gol + 1; break; }
  }
  // O sigla fara simbol separat (simbolul peste prima litera, ca la Venus): faviconul = fractia data din stanga.
  if (s.faviconFractie) latSimbol = Math.round(info.width * s.faviconFractie);
  // O sigla doar din cuvant (Venus): faviconul e initiala pe un patrat rotunjit in culoarea siglei, desenat aici.
  const fav = s.faviconLitera
    ? sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" rx="40" fill="${s.faviconLitera.fundal}"/>` +
      `<text x="96" y="140" font-family="Arial, Helvetica, sans-serif" font-size="140" font-weight="900" font-style="italic" text-anchor="middle" fill="${s.faviconLitera.culoare}">${s.faviconLitera.litera}</text></svg>`,
    ))
    : await patrat(await sharp(decupata.data).extract({ left: 0, top: 0, width: latSimbol, height: info.height }).png().toBuffer(), 192, 0.04);
  mkdirSync(IESIRE, { recursive: true });
  const favInfo = await fav.png({ palette: true, quality: 70, effort: 10 }).toFile(join(IESIRE, "favicon.png"));
  iesite.push({ cale: "favicon.png", kb: Math.round(favInfo.size / 1024) });
}

console.log(JSON.stringify({ cheie, fisiere: iesite.length, kb: iesite.reduce((s, f) => s + f.kb, 0), iesite }, null, 1));
