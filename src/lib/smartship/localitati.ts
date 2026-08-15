import { normalizeLocalityName, sectorBucuresti } from "@/lib/utils/ro-address";
import type { JudetSmartship, LocalitateSmartship } from "./client";

/**
 * Numele scris de cumparator → id-urile din nomenclatorul SmartShip.
 *
 * ═══ DE CE E NEVOIE ═══
 *
 * `sender.city` si `recipient.city` sunt INTREGI, nu nume: „ID-ul localitatii,
 * obtinut din /geolocation/cities. Nu se trimite denumirea, ci ID-ul numeric."
 * Deci intre „Cluj-Napoca" scris de client si cererea catre SmartShip trebuie sa
 * treaca o cautare — aceeasi problema ca la Woot si eColet, si NU ca la Colete
 * Online sau Innoship, unde numele pleaca asa cum e.
 *
 * De aici si aceeasi regula: **nepotrivire = nicio oferta**, adica cumparatorul
 * primeste tariful fix din `shipping_zones`, nu o eroare si nu un pret gresit.
 *
 * ═══ ⚠ BUCURESTIUL: LOCALITATE UNA, SECTOR SEPARAT ═══
 *
 * SmartShip e in tabara CEA MARE, nu cu Sameday: exemplul lor de expeditor e
 * limpede — `localitate: "Bucuresti"`, `localitate_id: 255154`, `sector: 1`. Deci
 * orasul se plieaza („Sector 3" → „Bucuresti") si sectorul pleaca in campul lui.
 *
 * ⚠ Iar sectorul NU SE GHICESTE NICIODATA. Documentatia il cere „doar pentru
 * Bucuresti, valoare 1-6; pentru restul localitatilor trimite 0". Deci un 0
 * trimis pentru o adresa bucuresteana e o valoare INVALIDA, nu una neutra —
 * `lipsuriExpediere` opreste local, cu un mesaj care spune ce lipseste, in loc sa
 * lase curierul sa aleaga un sector.
 *
 * Vezi `src/lib/utils/bucuresti-pe-curieri.test.ts`: cele doua reguli (Sameday si
 * restul) trebuie sa ramana OPUSE, iar cine le uniformizeaza strica noua curieri
 * tacut.
 *
 * ═══ ⚠ DIACRITICELE ROMANESTI AU DOUA CODIFICARI ═══
 *
 * „ș" se scrie si U+0219 (virgula dedesubt) si U+015F (sedila, din Latin-2):
 * aceeasi litera pe ecran, doua caractere diferite in memorie. Un `===` intre
 * „Timișoara" scris de client si „Timişoara" din nomenclator e FALS, si
 * cumparatorul ramane fara oferte fara sa afle nimeni de ce.
 */

/**
 * Cheia de comparatie: fara diacritice, fara majuscule, fara punctuatie.
 *
 * ⚠ Se scot DOAR semnele diacritice (`\p{M}` peste forma NFD), nu si literele — o
 * clasa mai lata ar manca „ș" cu totul in loc s-o faca „s", si atunci „Iasi" n-ar
 * mai gasi „Iași". Cratimele si spatiile cad si ele, ca „Cluj-Napoca" si „Cluj
 * Napoca" sa ajunga la aceeasi cheie.
 *
 * Geamana ei din `lib/ecolet/localitati.ts` face acelasi lucru; sunt scrise
 * separat dinadins, ca nomenclatoarele celor doi sa poata diverge fara sa se
 * traga una pe alta.
 */
export function cheieNume(nume: string | null | undefined): string {
  return (nume ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * ⚠ POTRIVIREA DE JUDET NU SE FACE PE INCLUZIUNE DE SUBSIR.
 *
 * Dintre cele 42 de judete romanesti exista EXACT o pereche in care unul e subsir
 * in celalalt: `mures ⊂ maramures`. O incluziune oarba trimitea „Dumbrava,
 * Maramures" drept „Dumbrava, Mures", la 300 de kilometri, fara sa se planga
 * nimic. Lectie platita la eColet.
 *
 * Incluziunea ramane ingaduita DOAR pentru capitala, care e chiar cazul pentru
 * care fusese scrisa: noi scriem „Municipiul Bucuresti", ei scriu „Bucuresti".
 */
const CHEIE_CAPITALA = "bucuresti";

export function potrivesteJudetul(dinNomenclator: string, alNostru: string): boolean {
  if (!dinNomenclator || !alNostru) return false;
  if (dinNomenclator === alNostru) return true;
  return dinNomenclator.includes(CHEIE_CAPITALA) && alNostru.includes(CHEIE_CAPITALA);
}

/** Judetul din nomenclatorul lor, sau `null`. */
export function alegeJudetul(judete: JudetSmartship[], judet: string | null | undefined): JudetSmartship | null {
  const k = cheieNume(judet);
  if (!k) return null;
  return (judete ?? []).find((j) => potrivesteJudetul(cheieNume(j.county), k)) ?? null;
}

/**
 * Localitatea din nomenclatorul judetului, sau `null`.
 *
 * ⚠ POTRIVIRE EXACTA, si nimic altceva. Nomenclatorul unui judet are sute de
 * randuri, iar o potrivire „pe fragment" ar face ca „Ocna" sa aleaga primul din
 * zece sate cu numele asta. Curierul livreaza apoi dupa id, nu dupa adresa scrisa.
 *
 * ⚠ Numele se PLIAZA inainte de comparatie: „Sector 3" nu exista in nomenclatorul
 * lor ca localitate, dar „Bucuresti" exista. Fara pliere, TOATE comenzile din
 * capitala — cea mai mare piata din tara — ar cadea tacut pe tariful fix.
 */
export function alegeLocalitatea(
  localitati: LocalitateSmartship[],
  oras: string,
  judet?: string | null,
): LocalitateSmartship | null {
  const k = cheieNume(localitateSmartship(oras, judet));
  if (!k) return null;

  const exacte = (localitati ?? []).filter((l) => cheieNume(l.city) === k);
  if (exacte.length === 0) return null;

  /*
   * Mai multe cu acelasi nume IN ACELASI judet sunt sate omonime din aceeasi
   * zona: acolo prima e o alegere rezonabila. Ambiguitatea periculoasa e cea
   * INTRE judete, si pe aia o inchide faptul ca lista vine deja filtrata pe judet.
   */
  return exacte[0];
}

/**
 * Localitatea, in forma pe care o cere SmartShip.
 *
 * ⚠ Pliaza Bucurestiul, ca la Cargus, DPD, FAN, GLS, Innoship, Posta si Packeta —
 * si PE DOS fata de Sameday si eColet, unde sectoarele sunt orase. Vezi
 * [[sameday-audit-2026-07]].
 */
export function localitateSmartship(oras: string | null | undefined, judet?: string | null): string {
  return normalizeLocalityName((oras ?? "").trim(), judet ?? undefined);
}

/**
 * ⚠ E adresa asta in Bucuresti?
 *
 * Se raspunde din judet SAU din oras: cumparatorul poate scrie „Sector 3" cu
 * judetul „Ilfov" (gresit, dar se intampla), iar sectorul tot trebuie trimis.
 */
export function esteInBucuresti(oras: string | null | undefined, judet?: string | null): boolean {
  return localitateSmartship(oras, judet) === "Bucuresti";
}

/**
 * Sectorul pentru campul `sector`, sau `null` cand nu se poate sti.
 *
 * ⚠ TREI raspunsuri, nu doua:
 *   - in afara Bucurestiului: `0`, adica exact ce cere documentatia;
 *   - in Bucuresti, cu sector recunoscut: 1-6;
 *   - in Bucuresti, FARA sector recunoscut: `null`.
 *
 * `null` opreste expedierea in `lipsuriExpediere`. Un `0` pus in locul lui ar fi o
 * valoare pe care ei o cer pentru „restul localitatilor" — deci o minciuna despre
 * o adresa bucuresteana, si un colet plimbat prin oras.
 */
export function sectorSmartship(oras: string | null | undefined, judet?: string | null): number | null {
  if (!esteInBucuresti(oras, judet)) return 0;
  /* Sectorul poate fi scris si in oras („Sector 3"), si in restul adresei. */
  return sectorBucuresti(oras);
}
