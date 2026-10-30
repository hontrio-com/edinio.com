/*
  Pozele demo-ului temei Jupiter (etapa 20 din `docs/editor-magazin/PLAN.md`), facute din materialul lui: redenumite si
  micsorate cat cere locul in care se vad, ca vitrina sa nu care pixeli pe care nu-i arata.

    node scripts/teme/imagini-jupiter.mjs [folderul cu materialul]      (implicit ../demo-jupiter)

  Scrie in `public/teme/jupiter/`. Sursele raman neatinse in folderul lui. Fisierele iesite se pun in Git: le citesc
  setul de date (`src/lib/teme/jupiter/date-demo.ts`) si probele lui.

  ⚠ `next.config.ts` le da `Cache-Control: immutable` pe un an (toate imaginile din `public/`). O poza schimbata ia un
  NUME NOU, altfel cine a vazut-o o data o vede pe cea veche inca un an.

  De ce asa, pe scurt (masurat pe 29.10.2026):
  - WebP, nu AVIF: un `<img>` fara alternativa, iar AVIF lipseste pe iOS sub 16;
  - o singura marime pe poza: incarcatorul trece neatinse adresele care nu sunt din depozit (`supabase-image-loader.ts`),
    deci marimea fisierului e marimea pe care o descarca oricine. De-aia fiecare fel de poza are marimea locului lui;
  - pozele raioanelor veneau cu obiectul la opacitatea 253 din 255 (usor stravezii) si cu o ceata de alfa 1-3 in jur:
    alfa se intinde la loc (253 -> 255, sub 4 -> 0), ceea ce le si micsoreaza;
  - siglei i se reduc culorile (doua tente plate, cu zgomot de culoare in ele): fara asta, WebP-ul fara pierderi iesea de 35 KB;
  - faviconul e doar simbolul din sigla (etapa 22): sigla intreaga e de 4,7 ori mai lata decat inalta, deci in cei 16 px ai
    tabului nu se mai citea nimic. PNG, nu WebP: Safari nu arata un favicon WebP.
*/
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RADACINA = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SURSA = resolve(process.argv[2] ?? join(RADACINA, "..", "demo-jupiter"));
const IESIRE = join(RADACINA, "public", "teme", "jupiter");

/** Raportul slotului bannerului in varianta „carduri” (`HeroCuCarduri.tsx`), pe orice ecran. */
const RAPORT_BANNER = 2.14;

/**
 * Bannerele, dupa numarul din numele fisierului. Sunt mai late decat slotul (2,33-2,65 fata de 2,14), deci se taie din
 * partea cu fotografia, nu din cea cu textul: `stanga` = cati pixeli se taie din stanga, restul pana la raport din dreapta.
 */
const BANNERE = [
  { nr: 1, nume: "cabine-de-dus", stanga: "tot" }, // textul e in dreapta, lipit de margine
  { nr: 2, nume: "scule-si-unelte", stanga: 70 }, // textul incepe la 120 px; scara din dreapta ramane intreaga
  { nr: 3, nume: "curatenie", stanga: 35 }, // textul incepe la 77 px; din dreapta pleaca o parte din galeata
];

/** Raioanele, dupa numarul din numele fisierului (ordinea lui, 1-12). */
const RAIOANE = [
  "scule-si-unelte", "mobila", "gradina", "vopsele-si-tencuieli", "materiale-de-constructii", "usi-si-ferestre",
  "gresie-si-faianta", "parchet-si-covoare", "termice-si-climatizare", "sanitare", "iluminat", "electrocasnice",
];

/** Placile rotunde de recomandare (4) si cardurile de langa banner (2): din pozele raioanelor, la forma locului lor. */
const PLACI = ["scule-si-unelte", "sanitare", "iluminat", "electrocasnice"];
const CARDURI = ["termice-si-climatizare", "materiale-de-constructii"];

/** Produsele, dupa un fragment unic din numele fisierului lui -> numele nou (cheia produsului din setul de date). */
const PRODUSE = [
  ["Aspirator umed", "aspirator-umed-uscat-mac-allister-20l"],
  ["Cabina dus cu hidromasaj BAMBOO", "cabina-dus-hidromasaj-bamboo"],
  ["Cabina dus hidromasaj 2300BIS", "cabina-dus-hidromasaj-2300bis"],
  ["PHILIPS Hue", "kit-becuri-philips-hue"],
  ["ERBAUER", "masina-gaurit-erbauer-18v"],
  ["Profil UD", "profil-ud-3m"],
  ["GOODHOME Rivet", "raft-atelier-goodhome-rivet"],
  ["Scara pliabila", "scara-pliabila-mac-allister"],
  ["VILEDA", "set-mop-vileda-turbo"],
  ["Soba mobila", "soba-gaz-reecomer-4kw"],
];

function fisierDupaNumar(folder, nr) {
  const gasite = readdirSync(join(SURSA, folder)).filter((n) => new RegExp(`-${nr}\\.png$`, "i").test(n));
  if (gasite.length !== 1) throw new Error(`${folder}: ${gasite.length} fisiere cu numarul ${nr}`);
  return join(SURSA, folder, gasite[0]);
}

function fisierDupaFragment(folder, fragment) {
  const gasite = readdirSync(join(SURSA, folder)).filter((n) => n.normalize("NFC").includes(fragment));
  if (gasite.length !== 1) throw new Error(`${folder}: ${gasite.length} fisiere cu „${fragment}”`);
  return join(SURSA, folder, gasite[0]);
}

const scrise = [];
async function scrie(relativ, pipeline) {
  const cale = join(IESIRE, relativ);
  mkdirSync(dirname(cale), { recursive: true });
  const info = await pipeline.toFile(cale);
  scrise.push({ relativ, octeti: statSync(cale).size, w: info.width, h: info.height });
}

/** Alfa intinsa la loc: 4 -> 0, 252 -> 255 (obiectul venea la 253, deci usor stravezii, cu ceata de 1-3 in jur). */
const alfaCurata = (img) => img.ensureAlpha().linear([1, 1, 1, 255 / 248], [0, 0, 0, (-4 * 255) / 248]);

/**
 * Simbolul din sigla, fara cuvant: ce sta la dreapta ULTIMEI coloane transparente. Cuvantul si simbolul sunt despartite de
 * o asemenea coloana; intre literele cuvantului sunt si altele, dar in simbol nu e niciuna (inelul trece peste planeta).
 */
async function simbolulDinSigla(svg) {
  const { data, info } = await sharp(svg, { density: 300 })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .resize({ height: 600 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const coloanaGoala = (x) => {
    for (let y = 0; y < height; y++) if (data[(y * width + x) * channels + 3] > 8) return false;
    return true;
  };
  let stanga = width - 1;
  while (stanga > 0 && !coloanaGoala(stanga)) stanga--;
  if (stanga === 0) throw new Error("Sigla: n-am gasit golul dintre cuvant si simbol.");
  return sharp(data, { raw: { width, height, channels } })
    .extract({ left: stanga + 1, top: 0, width: width - stanga - 1, height })
    .png()
    .toBuffer();
}

/** Obiectul decupat, taiat pe conturul lui (fara marginea transparenta), ca buffer PNG fara pierderi. */
async function decupat(cale) {
  const curat = await alfaCurata(sharp(cale)).png().toBuffer();
  return sharp(curat).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png().toBuffer();
}

/** Distanta de la mijlocul cutiei obiectului pana la cel mai departat pixel al lui (alfa peste 32), in pixelii lui. */
async function razaObiectului(obiect) {
  const { data, info } = await sharp(obiect).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const cx = (info.width - 1) / 2, cy = (info.height - 1) / 2;
  let max = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] > 32) max = Math.max(max, Math.hypot(x - cx, y - cy));
  }
  return max;
}

/** Obiectul pe o panza transparenta `l` x `h`, cat mai mare in cutia `cl` x `ch` din mijlocul ei. */
async function pePanza(obiect, l, h, cl, ch) {
  const pus = await sharp(obiect).resize(cl, ch, { fit: "inside" }).png().toBuffer();
  const m = await sharp(pus).metadata();
  return sharp({ create: { width: l, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: pus, left: Math.round((l - m.width) / 2), top: Math.round((h - m.height) / 2) }]);
}

const WEBP_FOTO = { quality: 75, effort: 6, smartSubsample: true };
const WEBP_ALFA = { quality: 80, alphaQuality: 80, effort: 6, smartSubsample: true };

async function main() {
  if (!statSync(SURSA, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Nu gasesc materialul in ${SURSA}`);

  // ── Bannerele: taiate la raportul slotului, 1600 x 748 (slotul are ~930 px pe desktop, 2x pe ecranele dense) ──
  for (const b of BANNERE) {
    const cale = fisierDupaNumar("bannereHero", b.nr);
    const m = await sharp(cale).metadata();
    const latime = Math.round(m.height * RAPORT_BANNER);
    if (latime > m.width) throw new Error(`bannerul ${b.nr} e mai ingust decat slotul`);
    const stanga = b.stanga === "tot" ? m.width - latime : b.stanga;
    await scrie(`bannere/${b.nume}.webp`, sharp(cale)
      .extract({ left: stanga, top: 0, width: latime, height: m.height })
      .resize(1600, 748, { fit: "cover" })
      .webp(WEBP_FOTO));
  }

  // ── Raioanele: 320 x 320, obiectul pe 92% (placile de pe prima pagina au 80 px, meniul mare 224 px) ──
  const raioane = new Map();
  for (const [i, nume] of RAIOANE.entries()) {
    const obiect = await decupat(fisierDupaNumar("categorii", i + 1));
    raioane.set(nume, obiect);
    await scrie(`categorii/${nume}.webp`, sharp(await (await pePanza(obiect, 320, 320, 294, 294)).png().toBuffer()).webp(WEBP_ALFA));
  }

  // ── Placile rotunde: 480 x 480 (cercul are ~240 px), obiectul intreg in cerc, nu taiat de margine ──
  for (const nume of PLACI) {
    const obiect = raioane.get(nume);
    const m = await sharp(obiect).metadata();
    // Cel mai departat punct al obiectului (nu coltul cutiei, de obicei gol) ajunge la 96% din raza cercului inscris.
    const scara = (0.96 * 240) / (await razaObiectului(obiect));
    const cl = Math.floor(m.width * scara), ch = Math.floor(m.height * scara);
    await scrie(`placi/${nume}.webp`, sharp(await (await pePanza(obiect, 480, 480, cl, ch)).png().toBuffer()).webp(WEBP_ALFA));
  }

  // ── Cardurile de langa banner: 432 x 336, cat cutia lor (144 x 112) pe ecranele 3x; obiectul intreg ──
  for (const nume of CARDURI) {
    await scrie(`carduri/${nume}.webp`, sharp(await (await pePanza(raioane.get(nume), 432, 336, 404, 314)).png().toBuffer()).webp(WEBP_ALFA));
  }

  // ── Produsele: 800 x 800 pe alb (cardul are ~300 px, galeria 560 px) ──
  for (const [fragment, nume] of PRODUSE) {
    const svg = readFileSync(fisierDupaFragment("produse", fragment));
    await scrie(`produse/${nume}.webp`, sharp(svg).flatten({ background: "#ffffff" }).resize(800, 800).webp(WEBP_FOTO));
  }

  // ── Sigla: taiata pe contur, inalta de 120 px (antetul o arata la 40 px; 3x pe telefoane), culorile reduse ──
  const sigla = await sharp(readFileSync(join(SURSA, "logo", "LogoJupiter.svg")))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .resize({ height: 120 })
    .png({ palette: true, colours: 16, dither: 0 })
    .toBuffer();
  await scrie("logo.webp", sharp(sigla).webp({ lossless: true, effort: 6 }));

  // ── Faviconul: simbolul pe un patrat transparent de 192 px, marimea pe care o face si editorul (`processFavicon`) ──
  // Inelul e mult mai lat decat planeta: taiat cu 13% pe fiecare parte (iese din cadru), planeta umple patratul si se
  // citeste si la cei 16 px ai tabului; intreg, ramanea o bila de 9 px.
  const simbol = await sharp(await simbolulDinSigla(readFileSync(join(SURSA, "logo", "LogoJupiter.svg"))))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png().toBuffer();
  const { width: latSimbol, height: inaltSimbol } = await sharp(simbol).metadata();
  const taiat = Math.round(latSimbol * 0.13);
  await scrie("favicon.png", sharp(simbol).extract({ left: taiat, top: 0, width: latSimbol - 2 * taiat, height: inaltSimbol })
    .resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 70, effort: 10, dither: 0, compressionLevel: 9 }));

  let total = 0;
  for (const s of scrise) {
    total += s.octeti;
    console.log(`${s.relativ.padEnd(52)} ${String(s.w).padStart(4)} x ${String(s.h).padEnd(4)} ${(s.octeti / 1024).toFixed(1).padStart(6)} KB`);
  }
  console.log(`${scrise.length} fisiere, ${(total / 1024).toFixed(0)} KB in total`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
