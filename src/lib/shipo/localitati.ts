import { normalizeCountyName, normalizeLocalityName, sectorBucuresti, stripDiacritics } from "@/lib/utils/ro-address";
import type { OrasShipo } from "./client";

/**
 * Localitatea si sectorul, asa cum le cere Shipo.
 *
 * ═══ ⚠ SHIPO E IN TABARA CEA MARE ═══
 *
 * In platforma exista DOUA reguli OPUSE pentru Bucuresti, si trebuie sa ramana
 * opuse (vezi `src/lib/utils/bucuresti-pe-curieri.test.ts`):
 *
 *   Sameday, eColet                    primesc „Sector 3" — la ei sectoarele SUNT orase
 *   ceilalti unsprezece, si Shipo      primesc „Bucuresti", iar sectorul pleaca separat
 *
 * Dovada ca Shipo e in a doua tabara e in chiar raspunsurile lor: `/shipments`
 * arata `address_city: "Bucuresti"` si `address_sector: "1"` ca doua campuri
 * diferite, iar corpul lui `POST /shipment` are `recipient_address_sector`
 * documentat drept „Sector 1-6. Obligatoriu pt Bucuresti".
 *
 * Cine „uniformizeaza" candva cele doua reguli repara un curier si strica
 * unsprezece, tacut, la livrare.
 *
 * ⚠ O DEOSEBIRE FATA DE SMARTSHIP, mica si scumpa: acolo campul `sector` cere `0`
 * in afara Bucurestiului. Aici NU: documentatia il da drept „Conditionat", deci
 * in afara Bucurestiului campul pur si simplu LIPSESTE din cerere. Un `0` trimis
 * degeaba ar putea cadea la validarea lor („intre 1 si 6"), si ar cadea pentru
 * fiecare comanda din tara.
 */

/**
 * Orasul potrivit din raspunsul lui `/city`, sau `null`.
 *
 * ⚠ `/city?term=` e o cautare pe TERMEN, nu o potrivire exacta: intoarce si
 * omonimele din alte judete („Victoria" e in Brasov, Iasi, Braila si Vaslui), si
 * numele mai lungi care contin termenul („Baia" aduce si „Baia Mare"). Ordinea
 * rezultatelor nu e documentata nicaieri.
 *
 * Coordonata luata orbeste din primul rand trimite cautarea de lockere in ALT
 * judet — iar `/points` raspunde 200 cu o lista de puncte reale, ordonate dupa
 * `distance_km` fata de punctul gresit. Deci nu arata a defect: arata a oras cu
 * lockere in cealalta parte a tarii.
 *
 * Se alege deci: potrivire exacta de nume SI de judet, apoi doar de nume, si abia
 * la urma primul rand — dar numai cand lista are un singur element, adica atunci
 * cand nu exista ambiguitate.
 */
export function orasulPotrivit(
  orase: OrasShipo[],
  oras: string | null | undefined,
  judet?: string | null,
): OrasShipo | null {
  const lista = orase ?? [];
  if (lista.length === 0) return null;

  const curat = (t: string) => stripDiacritics(t ?? "").trim().toLowerCase();
  const numeCautat = curat(localitateShipo(oras, judet));
  const judetCautat = judet ? curat(normalizeCountyName(judet)) : "";

  const potrivesteNumele = (o: OrasShipo) => curat(o.value) === numeCautat || curat(o.label).startsWith(numeCautat);

  if (judetCautat) {
    const cuJudet = lista.find((o) => potrivesteNumele(o) && curat(o.county) === judetCautat);
    if (cuJudet) return cuJudet;
  }
  const doarNume = lista.filter(potrivesteNumele);
  if (doarNume.length === 1) return doarNume[0];

  /* Ambiguu: mai bine cautare dupa NUME la `/points` decat coordonate gresite. */
  return lista.length === 1 ? lista[0] : null;
}

/**
 * Localitatea trimisa lui Shipo. Bucurestiul se pliaza, sectorul pleaca separat.
 *
 * ⚠ E PUTIN MAI TOLERANT DECAT `normalizeLocalityName`, si dinadins.
 *
 * Ajutorul comun pliaza in „Bucuresti" doar cand judetul e Bucuresti, cand
 * orasul e exact „Sector N", sau cand e chiar „Bucuresti". Un camp de oras scris
 * „bucuresti sector 5" cu judetul gol trece prin el NEATINS — si atunci am fi
 * trimis un nume de localitate pe care niciun nomenclator nu-l cunoaste.
 *
 * Aceeasi toleranta o are deja `localitateSameday` (`sectorBucuresti(clean) !== null`),
 * deci nu e o inventie: un camp de oras care pomeneste un sector E Bucuresti, si
 * niciun alt oras din tara nu se scrie asa.
 *
 * ⚠ Se face AICI, la granita lui Shipo, NU in `normalizeLocalityName`: acela e
 * folosit de unsprezece curieri, iar „uniformizarea" lui e chiar greseala pe care
 * o apara `bucuresti-pe-curieri.test.ts`.
 */
export function localitateShipo(oras: string | null | undefined, judet?: string | null): string {
  const brut = stripDiacritics(oras ?? "").trim();
  if (/bucuresti|bucharest/i.test(brut) || sectorBucuresti(brut) !== null) return "Bucuresti";
  return normalizeLocalityName(oras ?? "", judet ?? undefined);
}

export function esteInBucuresti(oras: string | null | undefined, judet?: string | null): boolean {
  return localitateShipo(oras, judet) === "Bucuresti";
}

/**
 * Sectorul pentru `recipient_address_sector` / `sender_address_sector`.
 *
 * ⚠ TREI raspunsuri, nu doua:
 *   - in afara Bucurestiului: `undefined`, adica „nu se trimite campul";
 *   - in Bucuresti, cu sector recunoscut: 1-6;
 *   - in Bucuresti, FARA sector recunoscut: `null`.
 *
 * `null` opreste expedierea in `lipsuriExpediere`. Nu se ghiceste niciodata: un
 * sector inventat trimite coletul in alta parte a orasului, iar cumparatorul
 * afla abia cand nu-i vine.
 */
export function sectorShipo(
  oras: string | null | undefined,
  judet?: string | null,
  restulAdresei?: string | null,
): number | null | undefined {
  if (!esteInBucuresti(oras, judet)) return undefined;
  /* Sectorul poate fi scris in oras („Bucuresti, Sector 3") sau in strada. */
  return sectorBucuresti(oras) ?? sectorBucuresti(restulAdresei);
}

/**
 * Textul de pe AWB (`contents`), curatat dupa regulile LOR.
 *
 * ⚠ Documentatia cere „max. 40 car., alfanumeric". Un titlu de produs romanesc
 * obisnuit — „Prosop hotel 500 GSM, 50×90 cm (alb)" — are diacritice, virgule,
 * paranteze si semnul inmultirii. Trimis asa, cade la validarea lor, iar
 * comerciantul vede „Campul contents nu e valid" fara sa stie de la ce.
 *
 * Se taie, nu se refuza: continutul e o eticheta, nu o afirmatie despre marfa, iar
 * o expediere oprita din cauza unei paranteze ar fi mai rea decat una cu textul
 * scurtat. Ramane mereu ceva de citit — vezi rezerva.
 */
export function continutShipo(brut: string | null | undefined, rezerva = "Colet"): string {
  const curat = stripDiacritics(brut ?? "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  return curat || rezerva;
}
