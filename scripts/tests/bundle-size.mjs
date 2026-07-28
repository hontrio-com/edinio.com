/**
 * Marimea JS-ului de client, ca semnal de crestere intre faze.
 *
 * Sistemul de design urmeaza sa adauge zeci de variante de sectiuni. Riscul e ca
 * fiecare varianta noua sa ajunga in bundle-ul fiecarui magazin, chiar daca
 * nimeni n-o foloseste. Cifra de mai jos face cresterea vizibila.
 *
 * Atributia pe ruta nu se poate face din fisiere: Turbopack scoate chunk-uri cu
 * nume plate, fara foldere per ruta. Semnalul util ramane totalul plus lista
 * celor mai mari chunk-uri — o varianta importata static ar aparea acolo, una
 * importata dinamic ar aparea ca un chunk mic si separat.
 *
 * Rulare: `npm run build` si apoi `npm run bundle`.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const CHUNKS = path.resolve(import.meta.dirname, "../../.next/static/chunks");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".js")) out.push({ file: path.relative(CHUNKS, full), size: statSync(full).size });
  }
  return out;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

let files;
try {
  files = walk(CHUNKS);
} catch {
  console.error("Lipseste .next/static/chunks - ruleaza intai `npm run build`.");
  process.exit(1);
}

const total = files.reduce((sum, f) => sum + f.size, 0);
console.log(`JS de client: ${kb(total)} in ${files.length} chunk-uri\n`);
console.log("Cele mai mari 10:");
for (const f of files.sort((a, b) => b.size - a.size).slice(0, 10)) {
  console.log(`  ${kb(f.size).padStart(10)}  ${f.file}`);
}
