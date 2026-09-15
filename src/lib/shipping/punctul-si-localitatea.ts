import { normalizeCountyName, normalizeLocalityName } from "@/lib/utils/ro-address";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUNCTUL ALES E IN ALTA PARTE DECAT ADRESA COTATA?              (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ CE A RAMAS DESCHIS DUPA `d446de14`. Fisa punctului se semneaza pe `{magazin, curier, retea}`,
 * si atat. `getLockers` e usa publica si nu cere localitate: cerut FARA oras, intoarce lista
 * intreaga (7.021 de puncte la Sameday), fiecare cu token VALID. Deci cumparatorul poate cota
 * pentru Bucuresti si plasa cu tokenul unui easybox din Cluj, iar totul bate. La emitere Sameday si
 * DPD INLOCUIESC destinatarul, deci coletul pleaca la Cluj pe tariful Bucurestiului, si diferenta o
 * plateste comerciantul.
 *
 * ═══ ⚠ DE CE UN JURNAL, SI NU UN REFUZ ═══
 *
 * Leacul evident, „judetul punctului = judetul cotat", REFUZA un caz cinstit si des: cineva din
 * Voluntari care alege un easybox bucurestean. Leacul corect se face pe ZONA de livrare, iar aia e
 * o regula de PRET, deci o hotarare a proprietarului, nu una luata din mers.
 *
 * Iar expunerea masurata spune sa nu ne grabim: **sase comenzi** au trecut vreodata prin selectorul
 * nostru de puncte, in toata viata platformei, si cotarea LIVE e pornita la trei perechi
 * magazin-curier. Deci intai se MASOARA daca se intampla, si abia apoi se pune o poarta care poate
 * refuza vanzari. Acelasi drum ca la rambursul subdeclarat, unde jurnalul a aratat ca cele 17
 * randuri nu erau abuz, ci nepotrivirea NOASTRA de unitati.
 *
 * ═══ ⚠ SI DE CE PLIUL BUCURESTIULUI E CHIAR MIEZUL ═══
 *
 * Fara el, jurnalul s-ar aprinde pe TOATA capitala si n-ar masura nimic: adresa spune „Sector 3"
 * (asa o scrie checkoutul nostru de la reparatia din 15.08), iar punctul spune „Bucuresti", fiindca
 * asa il numesc nomenclatoarele celor mai multi curieri. Sunt acelasi loc. `normalizeLocalityName`
 * stie deja regula asta, si tot ea o stie si pe cea a judetului („Municipiul Bucuresti").
 *
 * ⚠ Un semnal care se aprinde mereu nu e un semnal: e zgomot care ascunde exact cazul pe care il
 * cauti. Vezi [[jurnalul-care-masoara-defectul-poate-fi-el-stricat]].
 */

/**
 * `judet` e cazul care chiar costa: alt judet inseamna aproape sigur alta zona de pret.
 * `localitate` e cel ieftin: alt oras in acelasi judet cade de obicei in aceeasi zona.
 */
export type NepotrivireaPunctului = "judet" | "localitate" | null;

/** Cheia de comparatie: fara diacritice, fara majuscule, fara spatii la capete. */
function cheie(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Unde sta punctul fata de adresa pentru care s-a cotat.
 *
 * ⚠ `null` inseamna si „se potrivesc", si „nu se poate spune". Amandoua duc la acelasi lucru,
 * adica niciun rand scris, si asta e purtarea corecta: un camp lipsa nu e o dovada de nimic, iar
 * jurnalul asta se scrie de pe un capat public si anonim, unde fiecare rand in plus e un rand pe
 * care il poate cere oricine.
 */
export function punctulFataDeAdresa(
  punct: { city?: string | null; county?: string | null } | null | undefined,
  adresa: { city?: string | null; county?: string | null } | null | undefined,
): NepotrivireaPunctului {
  if (!punct || !adresa) return null;

  const judetPunct = cheie(normalizeCountyName(punct.county ?? ""));
  const judetAdresa = cheie(normalizeCountyName(adresa.county ?? ""));
  /* Fara amandoua judetele nu se poate spune nimic despre judet, dar localitatile pot fi inca
     lamuritoare, deci nu se iese din functie. */
  if (judetPunct && judetAdresa && judetPunct !== judetAdresa) return "judet";

  /*
   * ⚠ Localitatea se normalizeaza CU JUDETUL ei, fiindca tocmai el hotaraste pliul: „Sector 3" din
   * judetul Bucuresti si „Bucuresti" al punctului trebuie sa cada pe aceeasi cheie.
   */
  const orasPunct = cheie(normalizeLocalityName(punct.city ?? "", punct.county ?? undefined));
  const orasAdresa = cheie(normalizeLocalityName(adresa.city ?? "", adresa.county ?? undefined));
  if (!orasPunct || !orasAdresa) return null;

  return orasPunct === orasAdresa ? null : "localitate";
}
