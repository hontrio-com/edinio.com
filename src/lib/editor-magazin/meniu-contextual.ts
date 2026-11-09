import type { Block } from "@/lib/pages/blocks.types";
import { duplicateBlockInTree, moveBlockInTree, removeBlockFromTree } from "@/lib/pages/block-tree";
import {
  comutaBloc, duplicaColoana, duplicaContinut, esteContinut, mutaBloc, stergeColoana, stergeContinut,
} from "@/lib/storefront/design/blocuri";
import {
  blocuriLaCale, caleDinText, comutaBaraDeAnunt, duplicateSection, moveSection, removeSection, schimbaBlocuriLaCale, schimbaBlocurile,
  toateSectiunile, toggleSection, type CaleContinut,
} from "@/lib/storefront/design/edit";
import { PREFIX_PAGINA_PROPRIE, despartireId } from "@/lib/storefront/design/preview-protocol";
import type { StoreDesign } from "@/lib/storefront/design/types";
import { alegereDinClic, esteBloculUnic } from "./continut-liber";

/**
 * Meniul de clic dreapta din previzualizarea editorului (cerut de el, 08.11.2026: „sa dau click dreapta pe un bloc si
 * sa fac diferite chestii cu el si sa il sterg practic ca e mai simplu asa”).
 *
 * Previzualizarea doar deseneaza meniul si anunta alegerea; CE se poate face cu elementul si operatia insasi stau aici,
 * pe aceleasi functii ca arborele din stanga (sagetile, ochiul, „Duplică”, „Șterge”), deci meniul nu poate face nimic
 * ce arborele n-ar face. O actiune apare activa DOAR daca operatia chiar schimba ceva (se incearca pe loc): un buton
 * care nu face nimic e exact defectul pe care nu-l raporteaza nimeni.
 */

export type CheieActiune = "editeaza" | "sus" | "jos" | "duplica" | "ascunde" | "arata" | "sterge";

export interface ActiuneMeniu {
  cheie: CheieActiune;
  eticheta: string;
  /** Nu se poate acum (capatul listei, un bloc obligatoriu): se arata stinsa, ca omul sa vada ca exista. */
  dezactivata?: true;
}

/** Elementul pe care s-a dat clic dreapta, in forma pe care o intelege editorul. */
export type TintaMeniu =
  /** O sectiune a paginii principale, din lista ei. */
  | { fel: "sectiune"; id: string }
  /** Bara de anunt: se ascunde, ca din ochiul arborelui. */
  | { fel: "anunt"; id: string }
  /** Antetul, subsolul, pagina de produs, cosul...: doar se deschid. */
  | { fel: "fixa"; id: string }
  /** Un bloc al unei sectiuni cu zone (pagina de produs, coloanele subsolului, „Conținut liber” de sub produs). */
  | { fel: "bloc"; sectiune: string; bloc: string }
  /** Un bloc dintr-un „Conținut liber”. */
  | { fel: "liber"; cale: CaleContinut; bloc: string }
  /** Un bloc al paginii proprii deschise. */
  | { fel: "pagina"; bloc: string };

/**
 * Ce element e `id` (din protocol, `despartireId`). `listaAcasa`: pagina principala are lista ei de sectiuni in arbore
 * (nu si magazinul cu un singur produs); fara ea, sectiunile ei doar se deschid, ca in arbore.
 */
export function tintaDinId(design: StoreDesign, id: string, listaAcasa: boolean): TintaMeniu | null {
  const { sectiune, bloc } = despartireId(id);
  if (sectiune.startsWith(PREFIX_PAGINA_PROPRIE)) return bloc ? { fel: "pagina", bloc } : null;
  const s = toateSectiunile(design).find((x) => x.id === sectiune);
  if (!s) return null;
  if (bloc) {
    const { blocStructural, interior } = alegereDinClic(design, sectiune, bloc);
    if (interior) {
      const cale = caleDinText(interior.cheie);
      return cale ? { fel: "liber", cale, bloc: interior.bloc } : null;
    }
    if (blocStructural) return { fel: "bloc", sectiune, bloc: blocStructural };
  }
  if (design.chrome.announcement?.id === sectiune) return { fel: "anunt", id: sectiune };
  if (listaAcasa && design.home.some((x) => x.id === sectiune)) return { fel: "sectiune", id: sectiune };
  return { fel: "fixa", id: sectiune };
}

const ETICHETE: Record<CheieActiune, string> = {
  editeaza: "Editează",
  sus: "Mută mai sus",
  jos: "Mută mai jos",
  duplica: "Duplică",
  ascunde: "Ascunde",
  arata: "Arată",
  sterge: "Șterge",
};

/** Stergerea lui `bloc` ar lasa containerul gol: atunci pleaca tot containerul (regula e in `esteBloculUnic`). */
function ultimulDinContainer(design: StoreDesign, cale: CaleContinut, bloc: string): boolean {
  return esteBloculUnic(blocuriLaCale(design, cale) ?? [], bloc);
}

/**
 * Operatia unei actiuni pe design; ACELASI design cand nu are ce face (sau cand actiunea nu e a designului:
 * „editeaza”, blocurile paginii proprii).
 */
export function aplicaPeDesign(design: StoreDesign, tinta: TintaMeniu, cheie: CheieActiune): StoreDesign {
  switch (tinta.fel) {
    case "sectiune": {
      const i = design.home.findIndex((s) => s.id === tinta.id);
      if (i < 0) return design;
      if (cheie === "sus") return moveSection(design, i, i - 1);
      if (cheie === "jos") return moveSection(design, i, i + 1);
      if (cheie === "duplica") return duplicateSection(design, tinta.id);
      if (cheie === "ascunde" || cheie === "arata") return toggleSection(design, tinta.id);
      if (cheie === "sterge") return removeSection(design, tinta.id);
      return design;
    }
    case "anunt":
      return cheie === "ascunde" || cheie === "arata" ? comutaBaraDeAnunt(design) : design;
    case "bloc": {
      const pe = (op: Parameters<typeof schimbaBlocurile>[2]) => schimbaBlocurile(design, tinta.sectiune, op);
      if (cheie === "sus") return pe((l, s) => mutaBloc(l, s, tinta.bloc, -1));
      if (cheie === "jos") return pe((l, s) => mutaBloc(l, s, tinta.bloc, 1));
      if (cheie === "ascunde" || cheie === "arata") return pe((l, s) => comutaBloc(l, s, tinta.bloc));
      if (cheie === "duplica") return pe((l, s) => (esteContinut(s, tipBloc(l, tinta.bloc)) ? duplicaContinut(l, s, tinta.bloc) : duplicaColoana(l, s, tinta.bloc)));
      if (cheie === "sterge") return pe((l, s) => (esteContinut(s, tipBloc(l, tinta.bloc)) ? stergeContinut(l, s, tinta.bloc) : stergeColoana(l, s, tinta.bloc)));
      return design;
    }
    case "liber": {
      const { cale, bloc } = tinta;
      if (cheie === "sterge" && ultimulDinContainer(design, cale, bloc)) {
        // Ultimul bloc al containerului: pleaca tot containerul, altfel ramanea in pagina un loc gol, de negasit.
        return cale.bloc === null
          ? removeSection(design, cale.sectiune)
          : schimbaBlocurile(design, cale.sectiune, (l, s) => stergeContinut(l, s, cale.bloc!));
      }
      const op = operatiaPeBlocuri(cheie, bloc);
      return op ? schimbaBlocuriLaCale(design, cale, op) : design;
    }
    default:
      return design;
  }
}

function tipBloc(blocuri: readonly { id: string; type: string }[], id: string): string {
  return blocuri.find((b) => b.id === id)?.type ?? "";
}

/** Operatia pe o lista de blocuri de pagina (paginile proprii, „Conținut liber”), ca in `ListaBlocuri`. */
export function operatiaPeBlocuri(cheie: CheieActiune, bloc: string): ((bs: Block[]) => Block[]) | null {
  if (cheie === "sus") return (bs) => moveBlockInTree(bs, bloc, -1);
  if (cheie === "jos") return (bs) => moveBlockInTree(bs, bloc, 1);
  if (cheie === "duplica") return (bs) => duplicateBlockInTree(bs, bloc);
  if (cheie === "sterge") return (bs) => removeBlockFromTree(bs, bloc);
  return null;
}

/** Elementul e ascuns acum? Ascunsele nu se vad in previzualizare, dar arborele poate trimite meniul si pentru ele. */
function ascuns(design: StoreDesign, tinta: TintaMeniu): boolean {
  if (tinta.fel === "sectiune" || tinta.fel === "anunt") return toateSectiunile(design).find((s) => s.id === tinta.id)?.enabled === false;
  if (tinta.fel === "bloc") return toateSectiunile(design).find((s) => s.id === tinta.sectiune)?.blocks?.find((b) => b.id === tinta.bloc)?.enabled === false;
  return false;
}

/**
 * Actiunile meniului pentru `tinta`, in ordinea lor. `blocuriPagina`: blocurile paginii proprii deschise (pentru
 * `fel: "pagina"`). Cele care n-au sens pentru element lipsesc; cele care au sens dar nu se pot face acum (capatul
 * listei) apar stinse.
 */
export function actiuniMeniu(design: StoreDesign, tinta: TintaMeniu, blocuriPagina: Block[] | null): ActiuneMeniu[] {
  const lista: ActiuneMeniu[] = [{ cheie: "editeaza", eticheta: ETICHETE.editeaza }];
  const proba = (cheie: CheieActiune): boolean => {
    if (tinta.fel === "pagina") {
      const op = operatiaPeBlocuri(cheie, tinta.bloc);
      return !!op && !!blocuriPagina && op(blocuriPagina) !== blocuriPagina;
    }
    return aplicaPeDesign(design, tinta, cheie) !== design;
  };
  const pune = (cheie: CheieActiune, cuStinsa: boolean) => {
    const merge = proba(cheie);
    if (merge) lista.push({ cheie, eticheta: ETICHETE[cheie] });
    else if (cuStinsa) lista.push({ cheie, eticheta: ETICHETE[cheie], dezactivata: true });
  };

  if (tinta.fel === "fixa") return lista;
  if (tinta.fel === "anunt") {
    pune(ascuns(design, tinta) ? "arata" : "ascunde", false);
    return lista;
  }
  // Sagetile apar mereu cand elementul sta intr-o lista (stinse la capat), ca in arbore.
  const inLista = tinta.fel !== "bloc" || proba("sus") || proba("jos");
  pune("sus", inLista);
  pune("jos", inLista);
  pune("duplica", false);
  if (tinta.fel === "sectiune" || tinta.fel === "bloc") pune(ascuns(design, tinta) ? "arata" : "ascunde", false);
  pune("sterge", false);
  return lista;
}
