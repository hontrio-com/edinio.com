/*
  Capturile MICI pentru banda dubla din hero-ul paginii „/teme” (16.11.2026): partea de sus a primei pagini a fiecarei
  teme, decupata 4:5 si micsorata DINAINTE (Lanczos), aproape de marimea afisata.

  ⚠ DE CE MICSORATE DINAINTE, si nu capturile intregi de 720 px: banda se misca fara oprire, iar cat ruleaza o animatie
  pe compozitor Chrome filtreaza imaginile din ea mai slab (masurat 15.10.2026, vezi memoria „animatii pe compozitor”):
  o imagine mare, micsorata de browser, iese moale. Si cantaresc: 30 de capturi intregi ar fi ~1,8 MB in primul ecran.

  Rulare (din radacina depozitului): node scripts/teme/capturi-banda.mjs
  Intrare: public/teme-capturi/<cheie>.webp (scrise de `capturi-teme.mjs`). Iesire: public/teme-capturi/banda/<cheie>.webp.
  ⚠ `next.config` pune `immutable` pe un an pe tot ce e in `public/`: o captura refacuta ia NUME NOU, altfel browserele
  care au vazut-o raman pe cea veche.
*/
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SURSA = "public/teme-capturi";
const DEST = join(SURSA, "banda");
const LATIME = 440;
const INALTIME = 550;

mkdirSync(DEST, { recursive: true });
let total = 0;
for (const fisier of readdirSync(SURSA).filter((f) => f.endsWith(".webp"))) {
  const intrare = join(SURSA, fisier);
  const { width, height } = await sharp(intrare).metadata();
  // Partea de sus, in raportul tiglei (4:5), din toata latimea capturii.
  const sus = Math.min(height, Math.round((width * INALTIME) / LATIME));
  const iesire = join(DEST, fisier);
  await sharp(intrare)
    .extract({ left: 0, top: 0, width, height: sus })
    .resize(LATIME, INALTIME, { kernel: "lanczos3", fit: "cover", position: "top" })
    .webp({ quality: 74 })
    .toFile(iesire);
  total += statSync(iesire).size;
}
console.log(`capturi mici: ${readdirSync(DEST).length}, ${Math.round(total / 1024)} KB in total`);
