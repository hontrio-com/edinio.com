import type { ActionState } from "./registry";

/**
 * Ordinea finala a actiunilor: ce a ales comerciantul, intersectat cu ce are
 * magazinul.
 *
 * `disponibile` sunt actiunile care au sens acum — fara telefon completat nu
 * exista iconita de telefon, oricat ar fi ea de aprinsa in setari. Fara
 * intersectia asta, o setare veche ar putea invia o iconita care duce nicaieri.
 */
export function resolveActions<T extends string>(
  salvat: unknown,
  disponibile: readonly T[],
  implicite: readonly T[],
): T[] {
  const permise = new Set<string>(disponibile);
  if (!Array.isArray(salvat)) return implicite.filter((a) => permise.has(a));

  const vazute = new Set<string>();
  const ordonate: T[] = [];
  for (const item of salvat as ActionState[]) {
    const key = typeof item?.key === "string" ? item.key : null;
    if (!key || vazute.has(key) || !permise.has(key)) continue;
    vazute.add(key);
    if (item.on !== false) ordonate.push(key as T);
  }
  // Actiunile aparute dupa ce comerciantul a salvat setarea merg la coada, nu
  // dispar: altfel o varianta noua de iconita n-ar aparea niciodata la cine si-a
  // aranjat deja header-ul.
  for (const a of implicite) {
    if (!vazute.has(a) && permise.has(a)) ordonate.push(a);
  }
  return ordonate;
}
