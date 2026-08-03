/**
 * Rezolvare de module pentru testele rulate direct cu `node --test`.
 *
 * Node 24 executa TypeScript nativ (dezbraca tipurile), dar rezolvarea ESM cere
 * extensie explicita, iar sursele proiectului importa fara ea (`./defaults`).
 * Hook-ul incearca intai `<specifier>.ts` si abia apoi rezolvarea normala.
 *
 * Se ocupa si de alias-ul `@/` din tsconfig, ca testele sa poata importa orice
 * din `src/` exact ca aplicatia.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(new URL("../../src/", import.meta.url)));

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  // Doar extensiile ADEVARATE se lasa in pace. Cu „orice se termina in punct plus
  // litere", un modul ca `./offer.types` parea deja rezolvat si nu se mai incerca
  // `./offer.types.ts`: fisierul devenea netestabil, si logica din el a plecat in
  // alta parte doar ca sa poata fi verificata.
  if (specifier.startsWith(".") && !/\.(ts|tsx|js|jsx|mjs|cjs|json)$/i.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      /* cade pe rezolvarea normala */
    }
  }
  return next(specifier, context);
}
