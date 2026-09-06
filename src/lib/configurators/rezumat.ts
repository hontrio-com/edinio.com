/**
 * Configuratia, scrisa in cuvinte.
 *
 * ═══ ⚠ DE CE SE SCRIE, SI NU SE TRIMITE DOAR VERSIUNEA ═══
 *
 * O comanda tine `versiuneId`, iar versiunile sunt imutabile. Ar parea de ajuns. Nu e:
 *
 *   - atelierul si comerciantul citesc comanda, nu configuratorul. Cerandu-le sa deschida
 *     definitia ca sa afle ce inseamna `{"m":{"f":"alegere","v":"opt_7f2"}}` inseamna ca nimeni
 *     n-o face, si marfa pleaca dupa ce si-a amintit cineva;
 *   - emailul catre client, factura si AWB-ul n-au de unde sa incarce o definitie;
 *   - iar cand comerciantul publica o versiune noua in care redenumeste o optiune, comanda veche
 *     trebuie sa ramana citibila EXACT cum a fost cumparata.
 *
 * Deci se scrie si textul, o data, la vanzare. Valorile brute raman si ele, pentru orice
 * recalculare de mai tarziu — dar ce citeste omul nu mai depinde de nimic.
 *
 * ⚠ Numerele se scriu in UNITATEA COMERCIANTULUI, nu in cea de baza. „3500" pe o comanda de rame
 * nu inseamna nimic; „350 cm" inseamna. Aceeasi conversie ca in campul de pe ecran, din acelasi
 * fisier, ca sa nu apara doua adevaruri.
 */

import type { Compilat } from "./compileaza";
import { producesValoare, type Nod } from "./definitie";
import { afisat, conversia } from "./camp-numar";
import type { Valori } from "./valori";

export interface RandRezumat {
  /** Id-ul nodului, ca sa se poata lega inapoi de definitie. */
  id: string;
  eticheta: string;
  valoare: string;
  /** Se arata si in rezumatul SCURT (cosul, cardul), nu doar in cel intreg. */
  scurt: boolean;
  /**
   * Id-urile fisierelor incarcate, cand randul e un camp de incarcare.
   *
   * ⚠ SE PASTREAZA IN INSTANTANEU, si de aceea sunt aici si nu se cauta la nevoie in `valori`.
   * Rezumatul e ce ajunge la OM: pe comanda din panou, ecranul dupa care se produce, `valoare`
   * scrie doar „1 fisier”. Fara id, comerciantul stie ca exista o poza si n-are cum s-o vada,
   * iar gravura pleaca dupa ce si-a inchipuit el.
   *
   * Lipseste pe orice alt fel de camp, ca sa nu ingrase instantaneul fiecarei comenzi.
   */
  fisiere?: string[];
}

/**
 * Configuratia, rand cu rand, in ordinea din definitie.
 *
 * ⚠ Ordinea e cea in care a vazut-o cumparatorul, nu cea in care s-au nimerit cheile obiectului.
 * O comanda in care campurile sar de la o linie la alta se citeste mai greu decat una lunga.
 */
export function rezumatConfiguratiei(compilat: Compilat, valori: Valori): RandRezumat[] {
  const out: RandRezumat[] = [];
  for (const pas of compilat.definitie.pasi ?? []) {
    for (const grup of pas.grupuri ?? []) {
      for (const nod of grup.noduri ?? []) {
        if (!producesValoare(nod)) continue;
        const v = valori[nod.id];
        if (v === undefined) continue;
        const valoare = scrieValoarea(nod, valori);
        if (!valoare) continue;
        const fisiere = nod.fel === "fisiere" && v.f === "fisiere"
          ? v.v.map((f) => f.id).filter(Boolean)
          : undefined;
        out.push({
          id: nod.id, eticheta: nod.eticheta, valoare, scurt: nod.inRezumat === true,
          ...(fisiere?.length ? { fisiere } : {}),
        });
      }
    }
  }
  return out;
}

/** Rezumatul scurt, pentru cos si carduri. Cade pe cel intreg cand nimic nu e marcat. */
export function rezumatScurt(randuri: RandRezumat[], maxim = 3): RandRezumat[] {
  const alese = randuri.filter((r) => r.scurt);
  return (alese.length > 0 ? alese : randuri).slice(0, maxim);
}

/** Un rand, gata de pus intr-un email sau pe o eticheta. */
export function caUnRand(randuri: RandRezumat[]): string {
  return randuri.map((r) => `${r.eticheta}: ${r.valoare}`).join(" · ");
}

function scrieValoarea(nod: Nod, valori: Valori): string {
  const v = valori[nod.id];
  if (!v) return "";

  switch (nod.fel) {
    case "text":
      return v.f === "text" ? v.v : "";

    case "numar": {
      if (v.f !== "numar") return "";
      const c = conversia(nod.unitate);
      const n = afisat(v.v, c);
      return nod.unitate ? `${n} ${nod.unitate}` : n;
    }

    case "alegere":
      return v.f === "alegere" ? eticheta(nod, v.v) : "";

    case "alegeri":
      return v.f === "alegeri" ? v.v.map((id) => eticheta(nod, id)).join(", ") : "";

    case "comutator":
      // ⚠ „Da", nu „true". Comanda o citeste un om, nu un program.
      return v.f === "comutator" ? "Da" : "";

    case "fisiere":
      if (v.f !== "fisiere") return "";
      return v.v.length === 1 ? "1 fisier" : `${v.v.length} fisiere`;

    default:
      return "";
  }
}

/**
 * Eticheta unei optiuni, dupa id.
 *
 * ⚠ Cand optiunea nu mai exista in versiunea CU CARE se scrie rezumatul, se scrie id-ul, nu se
 * sare randul. Sarit, comanda ar fi aratat mai putin decat s-a cumparat — si nimeni n-ar fi avut
 * de unde sti ca lipseste ceva. In practica nu se poate intampla la vanzare (verificarea
 * raspunsului refuza o optiune care nu exista), dar se poate la o rescriere de mai tarziu.
 */
function eticheta(nod: Nod, id: string): string {
  if (!("optiuni" in nod) || !Array.isArray(nod.optiuni)) return id;
  return nod.optiuni.find((o) => o.id === id)?.eticheta ?? id;
}
