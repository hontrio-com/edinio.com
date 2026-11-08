/*
  Variantele mici ale pozelor din `public/teme`.

  De ce: pozele temelor sunt fisiere locale, iar loaderul imaginilor (`supabase-image-loader.ts`) le lasa neatinse,
  fiindca optimizatorul nostru (`/api/img`) lucreaza doar pe depozit. Deci un banner de 1600 px pleca intreg pe un
  telefon unde se vede la 352 px, iar o poza de categorie de 640 px intr-o placa de 148 (masurat la proba temelor 2-30).

  REGULA, pe care se bizuie loaderul fara nicio lista:
    - FIECARE poza are `.w256.webp` si `.w384.webp` langa ea (micsorata, sau la marimea ei cand e mai mica);
    - pozele mai late de 700 px au si `.w640.webp` (si `.w1080.webp` peste 1080), iar ele stau in `VARIANTE_MARI` (scris
      de script), cu latimile lor. Sub 700 px, o varianta de 640 ar fi fost o copie a originalului (18 MB in plus).
  O proba (`import-demo.test.ts`) cere ca nicio poza sa nu ramana fara variante.

  Rulare, din `edinio/`, dupa orice poza noua sau schimbata in `public/teme`:
    node scripts/teme/variante-imagini.mjs
*/
import { readdirSync, statSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import sharp from "sharp";

const RADACINA = "public/teme";
export const MICI = [256, 384];
const MARI = [640, 1080];
const PRAG = 700;
const VARIANTA = /\.w\d+\.webp$/;

const toate = [];
const vechi = [];
(function umbla(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) umbla(p);
    else if (VARIANTA.test(f)) vechi.push(p);
    else if (/\.(webp|png|jpe?g)$/i.test(f)) toate.push(p);
  }
})(RADACINA);

const mari = [];
const pastrate = new Set();
let facute = 0;
for (const p of toate.sort()) {
  const { width } = await sharp(p).metadata();
  if (!width) throw new Error(`${p}: latime necunoscuta`);
  const mariAle = width > PRAG ? MARI.filter((w) => w < width) : [];
  const latimi = [...MICI, ...mariAle];
  for (const w of latimi) {
    const tinta = p.replace(/\.(webp|png|jpe?g)$/i, `.w${w}.webp`);
    pastrate.add(tinta);
    if (existsSync(tinta) && statSync(tinta).mtimeMs >= statSync(p).mtimeMs) continue;
    await sharp(p).resize({ width: Math.min(w, width), withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toFile(tinta);
    facute++;
  }
  if (mariAle.length) mari.push(["/" + relative("public", p).split(sep).join("/"), mariAle]);
}
// Variantele ramase de la poze sterse sau de la o regula veche.
let sterse = 0;
for (const v of vechi) if (!pastrate.has(v)) { unlinkSync(v); sterse++; }

writeFileSync(
  "src/lib/teme/variante-imagini.ts",
  `// Lista \`VARIANTE_MARI\` e SCRISA DE \`scripts/teme/variante-imagini.mjs\`, nu de mana; regula e acolo.

/** Latimile pe care le are FIECARE poza din \`public/teme\`, langa ea, cu \`.w<latime>.webp\` in locul extensiei. */
export const VARIANTE_MICI = [${MICI.join(", ")}] as const;

/** Pozele din \`public/teme\` mai late de ${PRAG} px si variantele lor mari (${MARI.join(", ")}), pe langa cele mici. */
export const VARIANTE_MARI: Readonly<Record<string, readonly number[]>> = {
${mari.map(([k, v]) => `  ${JSON.stringify(k)}: [${v.join(", ")}],`).join("\n")}
};

const POZA_TEMEI = /^\\/teme\\/.+\\.(webp|png|jpe?g)$/i;

/**
 * Varianta potrivita a unei poze a temei pentru latimea ceruta (cea mai mica care o acopera), sau poza intreaga cand
 * nicio varianta nu ajunge. Pentru orice alta adresa: \`null\`. Folosita de loaderul lui \`next/image\` si de \`cdnImage\`.
 */
export function adresaVarianteiTemei(src: string, latime: number): string | null {
  if (!POZA_TEMEI.test(src) || /\\.w\\d+\\.webp$/.test(src)) return null;
  const w = [...VARIANTE_MICI, ...(VARIANTE_MARI[src] ?? [])].find((l) => l >= latime);
  return w ? src.replace(/\\.(webp|png|jpe?g)$/i, \`.w\${w}.webp\`) : src;
}
`,
);
console.log(`Poze: ${toate.length}, mari: ${mari.length}, variante noi: ${facute}, sterse: ${sterse}`);
