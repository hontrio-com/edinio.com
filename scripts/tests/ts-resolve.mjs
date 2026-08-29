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
import { statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(new URL("../../src/", import.meta.url)));

/*
 * FISIER, nu „exista".
 *
 * Prima candidata din lista de mai jos e chiar `base`, iar `existsSync` spune „da" si pentru un
 * DIRECTOR. Deci `@/lib/gpsr` se oprea la director si Node arunca `ERR_UNSUPPORTED_DIR_IMPORT`,
 * fara sa mai ajunga vreodata la `index.ts` de la coada listei.
 *
 * Ce costa: orice fisier care importa un modul-director devenea NETESTABIL — aceeasi paguba
 * scrisa de doua ori mai jos, despre `./offer.types` si despre `next/*`.
 */
function esteFisier(cale) {
  try {
    return statSync(cale).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (esteFisier(candidate)) return next(pathToFileURL(candidate).href, context);
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
  /*
   * ⚠ SI PACHETELE FARA HARTA `exports`, care cer extensie in ESM.
   *
   * `next` n-are camp `exports` in `package.json`, deci `import { after } from
   * "next/server"` se rezolva pe calea veche: in aplicatie merge, fiindca o face
   * bundler-ul, dar Node curat cere `next/server.js` si arunca `ERR_MODULE_NOT_FOUND`.
   *
   * ⚠ CE COSTA fara asta: orice fisier al aplicatiei care importa din `next/*` devine
   * NETESTABIL, iar logica din el pleaca in alta parte doar ca sa poata fi verificata —
   * exact paguba scrisa in nota de mai sus, despre `./offer.types`.
   *
   * Se incearca `.js` doar DUPA ce rezolvarea normala a cazut, deci nu schimba nimic
   * pentru pachetele care se rezolva singure.
   */
  try {
    return await next(specifier, context);
  } catch (e) {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/") && !specifier.startsWith("node:")) {
      try {
        return await next(`${specifier}.js`, context);
      } catch {
        /* cade cu eroarea ORIGINALA, nu cu cea de la a doua incercare: aceea ar arata
           un specificator pe care nu l-a scris nimeni. */
      }
    }
    throw e;
  }
}
