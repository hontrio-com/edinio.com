import { flux, type PacketaConfig } from "./client";
import { normalizeazaPuncte } from "./puncte";

/**
 * Punctele si automatele Packeta din Romania.
 *
 * ⚠ STA AICI, NU IN `packeta.actions.ts`. Un fisier `"use server"` face din fiecare
 * export un endpoint HTTP global, apelabil de oricine — iar functia asta primeste
 * configurarea magazinului si cheama fluxurile cu credentialele lui. Exportata de
 * acolo, ar fi fost o usa publica fara nicio verificare de proprietar.
 * Vezi [[use-server-expune-fiecare-export]].
 *
 * ⚠ Fluxurile sunt MONDIALE: se filtreaza pe tara aici, inainte de a ajunge in
 * memorie. Fara asta un magazin romanesc ar tine punctele din toata Europa.
 */
export async function puncteRomania(config: PacketaConfig): Promise<ReturnType<typeof normalizeazaPuncte>> {
  const cereri: Promise<unknown>[] = [];
  if (config.foloseste_puncte !== false) cereri.push(flux(config, "branch"));
  if (config.foloseste_automate !== false) cereri.push(flux(config, "box"));
  if (!cereri.length) return [];

  const raspunsuri = await Promise.allSettled(cereri);
  const iesire: ReturnType<typeof normalizeazaPuncte> = [];
  let i = 0;
  if (config.foloseste_puncte !== false) {
    const r = raspunsuri[i++];
    if (r.status === "fulfilled") iesire.push(...normalizeazaPuncte(r.value, "ro", false));
  }
  if (config.foloseste_automate !== false) {
    const r = raspunsuri[i++];
    if (r.status === "fulfilled") iesire.push(...normalizeazaPuncte(r.value, "ro", true));
  }
  return iesire;
}
