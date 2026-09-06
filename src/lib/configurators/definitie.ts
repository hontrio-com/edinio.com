/**
 * Ce a construit comerciantul: pasi, grupuri si optiuni.
 *
 * ═══ ⚠ DOUA MULTIMI, NU UNA ═══
 *
 * Interfata are peste douazeci de feluri de optiune — lista, butoane, carduri, pastile de
 * culoare, esantioane de material, alegator de font, simboluri, glisor. Motorul are SASE, dupa
 * ce PRODUC:
 *
 *   text · numar · alegere · alegeri · comutator · fisiere
 *
 * Restul e `control`, adica felul in care se deseneaza acelasi lucru. „Lista", „butoane",
 * „carduri" si „pastile de culoare" sunt toate o ALEGERE dintr-o multime; deosebirea dintre
 * ele nu schimba nici pretul, nici amprenta, nici regulile, nici comanda.
 *
 * Amestecarea celor doua multimi ar fi insemnat sase copii ale acelorasi reguli de pret si de
 * validare, cate una pe fel de desen — exact modul de esec pe care proiectul il are scris in
 * `cart/pricing.ts`.
 *
 * ═══ DIMENSIUNILE NU SUNT UN FEL DE NOD ═══
 *
 * „Latime x Inaltime" e un GRUP cu rolul `dimensiuni`, cu copii `numar`. Asa mostenesc tot ce
 * are un numar — limite, pas, unitate, formule, reguli — fara niciun tip nou. Ce e propriu
 * grupului (asezari gata facute, legarea proportiei) sta pe grup.
 *
 * ═══ ID-URILE SUNT AUTORITATEA ═══
 *
 * Fiecare nod are un id stabil. Formulele, regulile, valorile si instantaneul din comanda
 * trimit la el, NICIODATA la eticheta: comerciantul poate redenumi „Latime" in „Latimea
 * panoului" oricand, si nimic nu are voie sa se rupa.
 */

import type { Expresie } from "./expresii";
import type { UnitateLungime, UnitateMasa } from "./unitati";

/** Versiunea formei. Orice definitie salvata o poarta, ca sa poata fi citita si peste doi ani. */
export const VERSIUNE_SCHEMA = 1;

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFOANE DE SIGURANTA
   ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_PASI = 20;
export const MAX_GRUPURI_PE_PAS = 30;
export const MAX_NODURI_PE_GRUP = 60;
/** Peste tot configuratorul. Il verifica validatorul de publicare. */
export const MAX_NODURI = 300;
export const MAX_OPTIUNI_PE_NOD = 200;

/* ═══════════════════════════════════════════════════════════════════════════
   OPTIUNILE UNEI ALEGERI
   ═══════════════════════════════════════════════════════════════════════════ */

/** O varianta dintr-o lista de ales. */
export interface Optiune {
  /** Id stabil. Valoarea salvata e CHIAR el. */
  id: string;
  eticheta: string;
  descriere?: string;
  /** Pentru pastile de culoare. Validata la publicare. */
  culoare?: string;
  /** Pentru esantioane: id-ul activului comerciantului, nu o adresa. */
  imagine?: string;
  /** Cat adauga alegerea la pret. Vezi `pret.ts` pentru ordinea aplicarii. */
  pret?: number;
  /** Cat adauga la greutate, in grame. */
  grame?: number;
  /**
   * Piesa consumata, si cate bucati.
   *
   * ⚠ COMERCIANTUL SCRIE DOAR `id` SI `bucati`. Restul se INGHEATA LA PUBLICARE, pe server,
   * din `configurator_componente` — vezi antetul lui `componente.ts`. `citeste.ts` le si arunca
   * dinadins cand vin dintr-o ciorna: forma asta pleaca INTREAGA la vitrina, iar un `pretBucata`
   * scris de mana in ciorna ar fi devenit pretul dupa care se incaseaza.
   */
  componenta?: {
    id: string;
    bucati: number;
    /** Produsul al carui stoc E stocul piesei. Lipsa = piesa nu se tine pe stoc. */
    produsId?: string;
    /** Cat plateste CUMPARATORUL pe bucata, din `pret_bucata`. Costul nostru NU ajunge aici. */
    pretBucata?: number;
    /** Numele piesei la data publicarii, pentru descompunerea de pret. */
    nume?: string;
  };
  /** Stinsa: se vede, dar nu se poate alege. Publicarea o pastreaza pentru comenzile vechi. */
  activa?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════
   NODURILE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ce au toate nodurile, indiferent ce produc. */
interface NodComun {
  id: string;
  eticheta: string;
  /** Textul mic de sub camp. */
  ajutor?: string;
  /** Se cere completat. ⚠ Un camp ASCUNS de o regula nu blocheaza — vezi `reguli.ts`. */
  obligatoriu?: boolean;
  /** Se arata in rezumatul scurt din cos. Fara el, doar in cel intreg. */
  inRezumat?: boolean;
  /** Cate coloane ocupa, din 12. Doar aspect. */
  latime?: number;
}

export interface NodText extends NodComun {
  fel: "text";
  control: "scurt" | "lung";
  substituent?: string;
  minCaractere?: number;
  maxCaractere?: number;
  maxRanduri?: number;
  /** Litere mari peste tot, la afisare si la gravare. */
  majuscule?: boolean;
  implicit?: string;
  /** Pret fix cand campul e completat, plus atat pe caracter peste cele incluse. */
  pret?: { fix?: number; peCaracter?: number; caractereIncluse?: number };
}

export interface NodNumar extends NodComun {
  fel: "numar";
  control: "camp" | "glisor";
  /** Unitatea pe care o vede comerciantul si cumparatorul. Inauntru totul e in baza. */
  unitate?: UnitateLungime | UnitateMasa | "buc";
  /** Toate in unitatea de BAZA. Conversia se face la citirea definitiei. */
  min?: number;
  max?: number;
  pas?: number;
  implicit?: number;
  zecimale?: number;
}

export interface NodAlegere extends NodComun {
  fel: "alegere";
  control: "lista" | "butoane" | "radio" | "carduri" | "culori" | "imagini" | "font" | "simbol";
  optiuni: Optiune[];
  implicit?: string;
  /** Cauta in lista, pentru multimi mari. Interfata o aprinde singura peste un prag. */
  cautare?: boolean;
}

export interface NodAlegeri extends NodComun {
  fel: "alegeri";
  control: "bifare" | "carduri" | "imagini";
  optiuni: Optiune[];
  minAlese?: number;
  maxAlese?: number;
  implicit?: string[];
}

export interface NodComutator extends NodComun {
  fel: "comutator";
  control: "comutator" | "bifa";
  implicit?: boolean;
  pret?: number;
}

export interface NodFisiere extends NodComun {
  fel: "fisiere";
  control: "imagine" | "document";
  maxFisiere?: number;
  maxMb?: number;
  /** Tipuri primite. Serverul le verifica dupa octetii reali, nu dupa antet. */
  tipuri?: string[];
  /**
   * Cati pixeli trebuie sa aiba imaginea. Se masoara pe fisierul adevarat, cu `sharp`.
   *
   * ⚠ AICI ERAU SI `dpiMinim` / `dpiRecomandat`, si au fost scoase fiindca nu se pot onora
   * cinstit. „DPI”-ul unui fisier e un numar pe care fisierul il declara DESPRE SINE: o poza de
   * 4000 px facuta cu telefonul se scrie 72 si e excelenta la tipar, iar o imagine de 200x200
   * marita in Paint se poate scrie 300 si nu e buna de nimic. Un refuz pe numarul ala ar fi
   * respins tocmai fisierele bune si ar fi primit tocmai gunoiul.
   *
   * Ce voia sa spuna comerciantul prin „300 DPI” se scrie tot aici, prin `pixeliCeruti` din
   * `fisiere.ts`: de la cati centimetri se tipareste si la ce densitate, cati pixeli ies.
   * Panoul i-o socoteste si scrie numarul in campurile de mai jos.
   */
  minLatimePx?: number;
  minInaltimePx?: number;
}

/** Un calcul intermediar. Nu se vede si nu se completeaza; alte formule trimit la el. */
export interface NodCalcul extends NodComun {
  fel: "calcul";
  formula: Expresie;
  /** Se arata cumparatorului, cu unitatea asta. Fara ea, ramane ascuns. */
  arata?: { unitate: string; zecimale?: number };
}

/** Text, titlu, rezumat, pret, previzualizare. Nu produce nicio valoare. */
export interface NodAfisaj extends NodComun {
  fel: "afisaj";
  control: "text" | "titlu" | "separator" | "rezumat" | "pret" | "previzualizare";
  continut?: string;
}

export type Nod =
  | NodText | NodNumar | NodAlegere | NodAlegeri
  | NodComutator | NodFisiere | NodCalcul | NodAfisaj;

/** Nodurile care chiar produc o valoare a cumparatorului. */
export type NodCuValoare = NodText | NodNumar | NodAlegere | NodAlegeri | NodComutator | NodFisiere;

export function producesValoare(n: Nod): n is NodCuValoare {
  return n.fel !== "calcul" && n.fel !== "afisaj";
}

export function areOptiuni(n: Nod): n is NodAlegere | NodAlegeri {
  return n.fel === "alegere" || n.fel === "alegeri";
}

/* ═══════════════════════════════════════════════════════════════════════════
   STRUCTURA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Grup {
  id: string;
  eticheta?: string;
  /**
   * `dimensiuni` deseneaza copiii ca axe, cu asezari gata facute si proportie legata.
   * Copiii raman noduri `numar` obisnuite — vezi antetul fisierului.
   */
  rol?: "obisnuit" | "dimensiuni";
  /** Doar pentru rolul `dimensiuni`: perechi gata facute, in unitatea de baza. */
  asezari?: { eticheta: string; valori: Record<string, number> }[];
  /** Proportia se pastreaza cand se schimba o axa. */
  proportieLegata?: boolean;
  noduri: Nod[];
}

export interface Pas {
  id: string;
  eticheta: string;
  descriere?: string;
  grupuri: Grup[];
}

export type ModAfisare = "auto" | "simplu" | "pasi" | "acordeon";

export interface Definitie {
  versiuneSchema: number;
  /** Cum se aseaza pe pagina. `auto` alege dupa cate optiuni sunt. */
  mod: ModAfisare;
  pasi: Pas[];
  /** Calcule intermediare, dupa id. Le pot cere formulele si regulile. */
  calcule?: Record<string, Expresie>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARCURGEREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Toate nodurile, in ordinea in care le vede cumparatorul.
 *
 * ⚠ Iterativ, ca tot ce parcurge o structura venita din baza in proiectul asta: o definitie
 * stricata n-are voie sa doboare randarea magazinului. Si plafonat, ca sa nu se poata invarti
 * la nesfarsit pe o structura umflata.
 */
export function toateNodurile(d: Definitie): Nod[] {
  const out: Nod[] = [];
  for (const pas of d.pasi ?? []) {
    for (const grup of pas.grupuri ?? []) {
      for (const nod of grup.noduri ?? []) {
        out.push(nod);
        if (out.length >= MAX_NODURI) return out;
      }
    }
  }
  return out;
}

/** Nodul cu id-ul cerut, oriunde ar fi. `undefined` cand nu exista. */
export function nodDupaId(d: Definitie, id: string): Nod | undefined {
  return toateNodurile(d).find((n) => n.id === id);
}

/** Unde sta fiecare nod. Ii trebuie regulilor, ca sa poata ascunde un grup sau un pas intreg. */
export function harta(d: Definitie): Map<string, { pas: Pas; grup: Grup; nod: Nod }> {
  const m = new Map<string, { pas: Pas; grup: Grup; nod: Nod }>();
  for (const pas of d.pasi ?? []) {
    for (const grup of pas.grupuri ?? []) {
      for (const nod of grup.noduri ?? []) {
        // ⚠ PRIMUL castiga. Doua noduri cu acelasi id sunt o definitie stricata, pe care
        // validatorul de publicare o refuza; pana atunci nu se ghiceste care e „adevaratul".
        if (!m.has(nod.id)) m.set(nod.id, { pas, grup, nod });
      }
    }
  }
  return m;
}

/**
 * Toate id-urile din definitie: noduri, optiuni, grupuri, pasi si calcule.
 *
 * Le foloseste validatorul, ca sa prinda id-uri repetate — o regula care trimite la un id
 * existent de doua ori ar lovi cine se nimereste.
 */
export function toateIdurile(d: Definitie): string[] {
  const out: string[] = [];
  for (const pas of d.pasi ?? []) {
    out.push(pas.id);
    for (const grup of pas.grupuri ?? []) {
      out.push(grup.id);
      for (const nod of grup.noduri ?? []) {
        out.push(nod.id);
        if (areOptiuni(nod)) for (const o of nod.optiuni ?? []) out.push(o.id);
      }
    }
  }
  for (const id of Object.keys(d.calcule ?? {})) out.push(id);
  return out;
}

/** Optiunea cu id-ul cerut, dintr-un nod care are optiuni. */
export function optiuneaDupaId(n: Nod, id: string): Optiune | undefined {
  return areOptiuni(n) ? n.optiuni?.find((o) => o.id === id) : undefined;
}

/** O optiune se poate alege? Lipsa `activa` inseamna DA — randurile vechi n-o au. */
export function optiuneActiva(o: Optiune): boolean {
  return o.activa !== false;
}
