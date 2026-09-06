/**
 * Ce vede cumparatorul pe produs: gravura lui, pe cana lui.
 *
 * ═══ ⚠ DE CE E UN MODUL PUR, SI NU CATEVA `div`-uri IN SLOT ═══
 *
 * Fiindca hotararile de aici pot gresi TACUT, iar o componenta `.tsx` nu se poate proba:
 * harnasamentul ruleaza `node --test` peste TypeScript curat, fara JSX si fara DOM. Ce sta in
 * componenta ramane randare; ce hotaraste CE se deseneaza sta aici, cu probele lui.
 *
 * ═══ ⚠ PREVIZUALIZAREA NU E O PROMISIUNE DE PRODUCTIE ═══
 *
 * E o asemanare, si atat: fontul de pe ecran nu e cel al gravorului, iar culoarea unui ecran
 * necalibrat nu e culoarea vopselei. Scopul ei e sa-l opreasca pe cumparator sa comande „Familia
 * Ionescu" cand voia „Familia Ionesku" — nu sa tina loc de bun de tipar.
 *
 * De aceea nimic de aici nu intra in pret, in greutate, in amprenta sau in comanda. Daca s-ar
 * strica randarea intreaga, comanda ar ramane exact aceeasi.
 *
 * ═══ ⚠ CE SE INTAMPLA CAND CEVA NU E IN REGULA ═══
 *
 * Zona se sare. Niciodata o exceptie, si niciodata un chenar gol cu un semn de eroare: definitia
 * poate fi scrisa de o versiune mai veche, poate trimite la un nod sters, iar pagina de produs
 * trebuie sa se vanda mai departe. O previzualizare lipsa e o paguba mica; o pagina cazuta e una
 * mare — aceeasi regula ca in `vitrina.ts`.
 */

import { toateNodurile, type Definitie, type Nod, type NodAfisaj, type ZonaPreviz } from "./definitie";
import type { Stare } from "./reguli";
import { eNumarBun } from "./unitati";
import type { FisierAles, Valori } from "./valori";

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFOANE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cate zone poate avea o previzualizare.
 *
 * ⚠ Nu e o cochetarie: fiecare zona e un element desenat peste imagine, iar definitia vine din
 * baza si se poate edita. O mie de zone ar fi inghetat fila cumparatorului la fiecare tasta.
 */
export const MAX_ZONE = 20;

/** Cat text se deseneaza intr-o zona. Peste atat oricum nu s-ar mai citi nimic. */
const MAX_TEXT = 200;

/* ═══════════════════════════════════════════════════════════════════════════
   CE IESE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Dreptunghiul zonei, in fractiuni din imagine. Gata de pus in `style`. */
export interface Cutie {
  x: number;
  y: number;
  l: number;
  i: number;
  rotire: number;
}

export type CeSeDeseneaza =
  | { fel: "text"; text: string; culoare: string; marime: number; aliniere: "stanga" | "centru" | "dreapta" }
  /** O imagine incarcata de cumparator. `asezare` vine din `FisierAles.t`. */
  | { fel: "fisier"; fisierId: string; asezare?: { x: number; y: number; s: number; r: number } }
  /** Esantionul unei optiuni alese: o poza. */
  | { fel: "imagine"; imagine: string }
  /** Culoarea unei optiuni alese. */
  | { fel: "culoare"; culoare: string };

/** O zona gata de desenat: unde, si ce. */
export interface ZonaDeDesenat {
  /** Cheia de randare. Nodul poate aparea in mai multe zone. */
  cheie: string;
  cutie: Cutie;
  ce: CeSeDeseneaza;
}

export interface PrevizualizareaDeDesenat {
  imagine: string;
  zone: ZonaDeDesenat[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOTARAREA
   ═══════════════════════════════════════════════════════════════════════════ */

function fractiune(v: unknown, implicit: number): number {
  if (!eNumarBun(v)) return implicit;
  return Math.min(1, Math.max(0, v));
}

/**
 * Cutia zonei, adusa in imagine.
 *
 * ⚠ SE TAIE LA MARGINE, nu se refuza. O zona pusa la `x: 0,9` cu latimea `0,4` iese din poza; in
 * panou asta se intampla din prima incercare, tragand cu mausul. Refuzata, comerciantul ar fi
 * vazut zona disparand cu totul si n-ar fi stiut de ce; taiata, o vede si o trage inapoi.
 */
export function cutiaZonei(z: ZonaPreviz): Cutie {
  const x = fractiune(z?.x, 0);
  const y = fractiune(z?.y, 0);
  const l = fractiune(z?.l, 0.3);
  const i = fractiune(z?.i, 0.15);
  const rotire = eNumarBun(z?.rotire) ? Math.max(-180, Math.min(180, z.rotire)) : 0;
  return {
    x, y,
    l: Math.max(0.01, Math.min(l, 1 - x)),
    i: Math.max(0.01, Math.min(i, 1 - y)),
    rotire,
  };
}

/** Optiunea aleasa pe un nod cu optiuni, cand e una singura. */
function optiuneaAleasa(nod: Nod, valori: Valori) {
  const v = valori[nod.id];
  if (!v || v.f !== "alegere") return null;
  const optiuni = (nod as { optiuni?: { id: string; culoare?: string; imagine?: string }[] }).optiuni;
  return (optiuni ?? []).find((o) => o.id === v.v) ?? null;
}

/**
 * Ce deseneaza zona, dupa ce a ales cumparatorul. `null` cand nu deseneaza nimic.
 *
 * ⚠ FELUL SE IA DIN NOD, nu din zona. Comerciantul aseaza o zona peste un camp si atat; daca ar
 * fi trebuit sa spuna si CE fel de continut are campul ala, prima redenumire a felului nodului i-ar
 * fi lasat zona desenand altceva decat contine — un text pe o poza, sau o culoare pe o gravura.
 */
export function ceDeseneaza(nod: Nod, z: ZonaPreviz, valori: Valori): CeSeDeseneaza | null {
  switch (nod.fel) {
    case "text": {
      const v = valori[nod.id];
      if (v?.f !== "text" || !v.v.trim()) return null;
      return {
        fel: "text",
        text: v.v.slice(0, MAX_TEXT),
        /*
         * ⚠ Culoarea si marimea au IMPLICITE care se vad. Lasate pe `undefined`, textul ar fi
         * mostenit culoarea paginii — adica ar fi putut fi alb pe alb, si comerciantul ar fi crezut
         * ca previzualizarea e stricata.
         */
        culoare: typeof z.culoare === "string" && z.culoare ? z.culoare : "#111111",
        marime: eNumarBun(z.marime) && z.marime > 0 ? Math.min(z.marime, 0.5) : 0.06,
        aliniere: z.aliniere === "stanga" || z.aliniere === "dreapta" ? z.aliniere : "centru",
      };
    }

    case "fisiere": {
      const v = valori[nod.id];
      if (v?.f !== "fisiere" || !v.v.length) return null;
      /*
       * ⚠ PRIMUL fisier, si numai el. O zona e un loc; doua poze in acelasi loc s-ar fi acoperit
       * una pe alta, iar cumparatorul ar fi vazut-o doar pe a doua si ar fi crezut ca prima s-a
       * pierdut. Cine vrea doua locuri pune doua zone.
       */
      const f: FisierAles = v.v[0];
      return { fel: "fisier", fisierId: f.id, ...(f.t ? { asezare: f.t } : {}) };
    }

    case "alegere": {
      const o = optiuneaAleasa(nod, valori);
      if (!o) return null;
      /*
       * ⚠ Poza inaintea culorii. O optiune poate avea si esantion, si pastila de culoare (pastila
       * se vede in lista de alegere, esantionul e textura adevarata). Pe produs se deseneaza
       * textura: o pastila portocalie in locul lemnului de cires arata a greseala.
       */
      if (o.imagine) return { fel: "imagine", imagine: o.imagine };
      if (o.culoare) return { fel: "culoare", culoare: o.culoare };
      return null;
    }

    default:
      /*
       * ⚠ Numerele, comutatoarele si alegerile multiple NU se deseneaza, si asta e o hotarare.
       * „350" scris peste o cana nu inseamna nimic pentru cumparator, iar un comutator n-are ce
       * infatisa. Ce schimba forma produsului se arata prin optiunea aleasa, care are esantion.
       */
      return null;
  }
}

/**
 * Previzualizarea gata de desenat, sau `null` cand n-are ce arata.
 *
 * ⚠ UN CAMP ASCUNS NU SE MAI DESENEAZA, si NU se intreaba aici daca e ascuns.
 *
 * Aici a stat o vreme un `if (esteAscuns(...)) return`. S-a scos fiindca niciun mutant nu-l
 * putea falsifica: `aplicaRegulile` GOLESTE valorile campurilor ascunse dupa fiecare trecere
 * (`golesteAscunse`, cu acelasi `esteAscuns` care urca si la grup si la pas), iar `ceDeseneaza`
 * intoarce `null` pentru o valoare care lipseste. Deci purtarea e deja aparata, de doua ori, in
 * locul unde chiar se poate strica.
 *
 * O a treia paza pe care nicio schimbare n-o poate face sa cada e un rand care LINISTESTE fara
 * sa apere: cine il vede crede ca s-a verificat aici, si nu se mai uita la `reguli.ts`. Proba
 * „un camp ASCUNS de o regula nu mai deseneaza ce era inainte” ramane, si prinde regresia
 * acolo unde chiar poate aparea.
 */
export function previzualizareaDeDesenat(
  d: Definitie | undefined,
  nod: NodAfisaj,
  stare: Stare,
): PrevizualizareaDeDesenat | null {
  const cfg = nod.previzualizare;
  const imagine = typeof cfg?.imagine === "string" ? cfg.imagine.trim() : "";
  /*
   * ⚠ Fara imagine de fundal nu se deseneaza NIMIC, nici macar zonele. Zonele sunt asezate in
   * fractiuni DIN EA; fara ea n-ar avea peste ce sta, si ar fi iesit un teanc de cutii plutind
   * intr-un dreptunghi gol — care arata a stricat, nu a lipsa.
   */
  if (!imagine || !d) return null;

  const zone: ZonaDeDesenat[] = [];
  const noduri = new Map(toateNodurile(d).map((n) => [n.id, n]));

  (cfg?.zone ?? []).slice(0, MAX_ZONE).forEach((z, i) => {
    if (!z || typeof z.nod !== "string") return;
    const tinta = noduri.get(z.nod);
    // ⚠ Un nod sters intre timp: zona se sare, nu doboara pagina. Vezi antetul.
    if (!tinta) return;
    const ce = ceDeseneaza(tinta, z, stare.valori);
    if (!ce) return;
    const cutie = cutiaZonei(z);
    /*
     * ⚠ MARIMEA SE MUTA DIN IMAGINE IN ZONA, si asta e o socoteala, nu o formalitate.
     *
     * Comerciantul scrie marimea ca fractiune din inaltimea IMAGINII — asa gandeste el, si asa
     * ramane in model. Dar pe ecran textul sta intr-un element care e chiar zona, iar singurul
     * fel in care o litera se poate scala odata cu poza e o unitate de interogare pe containerul
     * ala (`cqh`). Zona are inaltime scrisa pe ea, deci poate fi container fara sa se prabuseasca;
     * imaginea NU poate, fiindca inaltimea ei vine chiar din continut.
     *
     * Deci se imparte: o marime de 0,06 din imagine, intr-o zona inalta cat 0,2 din imagine,
     * inseamna 0,3 din zona. Facuta in componenta, socoteala asta ar fi ramas neprobata — si
     * greselile ei nu cad, doar deseneaza literele de trei ori mai mari.
     */
    const inZona: CeSeDeseneaza = ce.fel === "text"
      ? { ...ce, marime: Math.min(1, ce.marime / cutie.i) }
      : ce;
    zone.push({ cheie: `${z.nod}-${i}`, cutie, ce: inZona });
  });

  return { imagine, zone };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE STIE PANOUL SI CE STIE VITRINA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Nodurile pe care le poate arata o previzualizare.
 *
 * ⚠ Se ofera doar cele care CHIAR se pot desena. Un camp de numar oferit in lista l-ar fi lasat pe
 * comerciant sa aseze o zona peste el, s-o mute cu grija, sa publice — si sa nu vada nimic.
 */
export function nodurileCareSePotDesena(d: Definitie | undefined): Nod[] {
  if (!d) return [];
  return toateNodurile(d).filter(
    (n) => n.fel === "text" || n.fel === "fisiere" || n.fel === "alegere",
  );
}

/**
 * Nodurile de fisiere pe care o previzualizare le aseaza undeva.
 *
 * ⚠ DE ASTA ATARNA DECUPAREA. `FisierAles.t` inseamna asezarea imaginii INTR-O zona; fara zona,
 * cele patru numere n-au fata de ce sa fie socotite, si in comanda ar fi ajuns o instructiune pe
 * care atelierul n-o poate urma. Campul de incarcare arata deci uneltele de asezare exact cand
 * exista o zona care le da inteles, si nu altfel.
 */
export function nodurileAsezateInPreviz(d: Definitie | undefined): Set<string> {
  const out = new Set<string>();
  for (const nod of toateNodurile(d ?? { versiuneSchema: 1, mod: "auto", pasi: [] })) {
    if (nod.fel !== "afisaj" || nod.control !== "previzualizare") continue;
    if (!nod.previzualizare?.imagine) continue;
    for (const z of (nod.previzualizare.zone ?? []).slice(0, MAX_ZONE)) {
      if (z && typeof z.nod === "string" && z.nod) out.add(z.nod);
    }
  }
  return out;
}
