import { normalizeLocalityName, stripDiacritics } from "@/lib/utils/ro-address";

/**
 * Se potriveste orasul unui punct de ridicare cu ce a scris cumparatorul?
 *
 * Fara diacritice („București"/„Sector 3" gasesc „Bucuresti"). Sameday tine Sector 1-6 ca orase
 * separate, deci potrivirea ruleaza si cu acul nepliat si cu orasul punctului pliat, ca sa acopere
 * fiecare pereche „Sector X" / „Bucuresti", pe oricare parte.
 *
 * ⚠ CRATIMA SI SPATIUL SE PLIAZA LA FEL (29.09.2026). Curierii scriu „Piatra-Neamt",
 * „Cluj-Napoca", „Miercurea-Ciuc", „Drobeta-Turnu Severin"; campul de oras din checkout e text
 * liber, iar oamenii scriu „Piatra Neamț" (forma oficiala) sau „Cluj Napoca". Masurat pe lista
 * Curiera: 0 puncte gasite pentru fiecare dintre ele, desi erau zeci, iar cumparatorul vedea
 * „Nu au fost gasite puncte de ridicare in aceasta localitate". Plierea doar largeste potrivirile.
 */
export function orasulSePotriveste(orasulPunctului: string, cautat: string): boolean {
  const plia = (s: string) => s.replace(/[-\s]+/g, " ").trim();
  const haystack = plia(stripDiacritics(orasulPunctului).toLowerCase());
  const haystackFolded = plia(normalizeLocalityName(orasulPunctului).toLowerCase());
  const foldedNeedle = plia(normalizeLocalityName(cautat).toLowerCase());
  const rawNeedle = plia(stripDiacritics(cautat).trim().toLowerCase());
  return (
    haystack.includes(foldedNeedle) ||
    (rawNeedle !== foldedNeedle && haystack.includes(rawNeedle)) ||
    haystackFolded.includes(foldedNeedle)
  );
}
