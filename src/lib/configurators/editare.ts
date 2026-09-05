/**
 * Ce face butonul din builder cu ciorna.
 *
 * ═══ ⚠ DE CE E MODUL PUR, SI NU STARE DE REACT ═══
 *
 * „Adauga o optiune", „muta pasul mai sus", „sterge grupul" par lucruri de interfata, dar sunt
 * de fapt reguli: ce se intampla cu regulile care trimiteau la nodul sters, ce id primeste nodul
 * nou, ce se intampla cand se sterge ultimul pas. Scrise in componente, ar fi fost netestabile —
 * proiectul n-are hamasa de randare — si s-ar fi imprastiat pe cate un buton.
 *
 * Aici sunt functii pure: intra o ciorna, iese alta. Nimic nu se schimba pe loc.
 *
 * ═══ ⚠ NIMIC NU SE MODIFICA PE LOC ═══
 *
 * React compara referinte. O structura schimbata pe loc n-ar fi declansat randarea, iar
 * comerciantul ar fi apasat un buton care „nu face nimic" — pana la urmatoarea schimbare, cand
 * i-ar fi aparut toate deodata.
 */

import type { Continut } from "./citeste";
import {
  type Definitie, type Grup, type Nod, type Pas,
  MAX_GRUPURI_PE_PAS, MAX_NODURI, MAX_NODURI_PE_GRUP, MAX_OPTIUNI_PE_NOD, MAX_PASI,
} from "./definitie";
import { nodurileCerute, type Regula } from "./reguli";

/* ═══════════════════════════════════════════════════════════════════════════
   ID-URI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un id nou, stabil si unic.
 *
 * ⚠ `crypto.randomUUID`, NU `Date.now()` cu un contor. Builderul din pagini foloseste
 * `b_${Date.now()}_${contor}` si a mai avut ciocniri: doua file deschise, sau doua creari rapide,
 * dau acelasi numar. Iar aici id-ul e AUTORITATEA — formulele, regulile si instantaneul unei
 * comenzi trimit la el. Doua noduri cu acelasi id inseamna o regula care loveste cine se
 * nimereste.
 *
 * ⚠ Cade pe o valoare aleatoare cand `crypto` lipseste (medii vechi, unele randari de test): tot
 * mai bine decat un contor previzibil.
 */
export function idNou(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARCURGERE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Copiaza definitia schimband un singur pas. */
function cuPasul(d: Definitie, idPas: string, schimba: (p: Pas) => Pas | null): Definitie {
  const pasi: Pas[] = [];
  for (const p of d.pasi ?? []) {
    if (p.id !== idPas) { pasi.push(p); continue; }
    const nou = schimba(p);
    if (nou) pasi.push(nou);
  }
  return { ...d, pasi };
}

/** Copiaza definitia schimband un singur grup, oriunde ar fi. */
function cuGrupul(d: Definitie, idGrup: string, schimba: (g: Grup) => Grup | null): Definitie {
  return {
    ...d,
    pasi: (d.pasi ?? []).map((p) => ({
      ...p,
      grupuri: (p.grupuri ?? []).flatMap((g) => {
        if (g.id !== idGrup) return [g];
        const nou = schimba(g);
        return nou ? [nou] : [];
      }),
    })),
  };
}

/** Cate noduri are definitia, peste tot. */
function cateNoduri(d: Definitie): number {
  return (d.pasi ?? []).reduce((s, p) => s + (p.grupuri ?? []).reduce((t, g) => t + (g.noduri ?? []).length, 0), 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADAUGARE
   ═══════════════════════════════════════════════════════════════════════════ */

export function adaugaPas(c: Continut, eticheta = "Pas nou"): Continut {
  if ((c.definitie.pasi ?? []).length >= MAX_PASI) return c;
  const grup: Grup = { id: idNou(), noduri: [] };
  const pas: Pas = { id: idNou(), eticheta, grupuri: [grup] };
  return { ...c, definitie: { ...c.definitie, pasi: [...(c.definitie.pasi ?? []), pas] } };
}

export function adaugaGrup(c: Continut, idPas: string, eticheta?: string): Continut {
  return {
    ...c,
    definitie: cuPasul(c.definitie, idPas, (p) => {
      if ((p.grupuri ?? []).length >= MAX_GRUPURI_PE_PAS) return p;
      const g: Grup = { id: idNou(), noduri: [], ...(eticheta ? { eticheta } : {}) };
      return { ...p, grupuri: [...(p.grupuri ?? []), g] };
    }),
  };
}

/**
 * Adauga o optiune (un nod) intr-un grup.
 *
 * ⚠ Primeste nodul GATA FACUT, cu id cu tot, ca sa poata fi adaugat si din sabloane, nu doar din
 * butonul „+ Adauga optiune". Cine il compune raspunde de forma lui.
 */
export function adaugaNod(c: Continut, idGrup: string, nod: Nod): Continut {
  if (cateNoduri(c.definitie) >= MAX_NODURI) return c;
  return {
    ...c,
    definitie: cuGrupul(c.definitie, idGrup, (g) => {
      if ((g.noduri ?? []).length >= MAX_NODURI_PE_GRUP) return g;
      return { ...g, noduri: [...(g.noduri ?? []), nod] };
    }),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCHIMBARE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Inlocuieste un nod cu forma lui noua. Id-ul NU se schimba, niciodata. */
export function schimbaNod(c: Continut, nod: Nod): Continut {
  return {
    ...c,
    definitie: {
      ...c.definitie,
      pasi: (c.definitie.pasi ?? []).map((p) => ({
        ...p,
        grupuri: (p.grupuri ?? []).map((g) => ({
          ...g,
          noduri: (g.noduri ?? []).map((n) => (n.id === nod.id ? nod : n)),
        })),
      })),
    },
  };
}

export function schimbaPas(c: Continut, idPas: string, campuri: Partial<Pas>): Continut {
  // ⚠ Id-ul nu se poate schimba din campuri: regulile si formulele trimit la el.
  const { id: _ignorat, ...restul } = campuri;
  void _ignorat;
  return { ...c, definitie: cuPasul(c.definitie, idPas, (p) => ({ ...p, ...restul })) };
}

export function schimbaGrup(c: Continut, idGrup: string, campuri: Partial<Grup>): Continut {
  const { id: _ignorat, ...restul } = campuri;
  void _ignorat;
  return { ...c, definitie: cuGrupul(c.definitie, idGrup, (g) => ({ ...g, ...restul })) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STERGERE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Sterge un nod, si CURATA dupa el.
 *
 * ⚠ Regulile care trimiteau la el nu raman in urma. O regula al carei declansator a disparut nu
 * se mai aprinde niciodata, iar una a carei tinta a disparut nu mai schimba nimic — amandoua ar
 * fi aparut in panou ca reguli care „exista si nu fac nimic", si ar fi picat validarea la
 * publicare cu un mesaj despre ceva ce comerciantul nici nu mai vede.
 *
 * O regula ramane doar daca mai are si dupa curatare cel putin o actiune si un declansator bun.
 */
export function stergeNod(c: Continut, idNod: string): Continut {
  const definitie: Definitie = {
    ...c.definitie,
    pasi: (c.definitie.pasi ?? []).map((p) => ({
      ...p,
      grupuri: (p.grupuri ?? []).map((g) => ({
        ...g,
        noduri: (g.noduri ?? []).filter((n) => n.id !== idNod),
      })),
    })),
  };
  return { ...c, definitie, reguli: faraReferintaLa(c.reguli, new Set([idNod])) };
}

export function stergeGrup(c: Continut, idGrup: string): Continut {
  const disparute = new Set<string>([idGrup]);
  for (const p of c.definitie.pasi ?? []) {
    for (const g of p.grupuri ?? []) {
      if (g.id === idGrup) for (const n of g.noduri ?? []) disparute.add(n.id);
    }
  }
  return {
    ...c,
    definitie: cuGrupul(c.definitie, idGrup, () => null),
    reguli: faraReferintaLa(c.reguli, disparute),
  };
}

export function stergePas(c: Continut, idPas: string): Continut {
  const disparute = new Set<string>([idPas]);
  for (const p of c.definitie.pasi ?? []) {
    if (p.id !== idPas) continue;
    for (const g of p.grupuri ?? []) {
      disparute.add(g.id);
      for (const n of g.noduri ?? []) disparute.add(n.id);
    }
  }
  return {
    ...c,
    definitie: cuPasul(c.definitie, idPas, () => null),
    reguli: faraReferintaLa(c.reguli, disparute),
  };
}

/**
 * Regulile, curatate de tot ce trimitea la id-urile disparute.
 *
 * ⚠ O regula al carei DECLANSATOR a disparut nu se mai aprinde niciodata; una a carei TINTA a
 * disparut nu mai schimba nimic. Amandoua ar fi ramas in panou ca reguli care „exista si nu fac
 * nimic", si ar fi picat validarea la publicare cu un mesaj despre ceva ce comerciantul nici nu
 * mai vede pe ecran.
 *
 * Se scot deci: regulile care CITESC un id disparut, si actiunile care il TINTESC. O regula
 * ramasa fara nicio actiune se scoate cu totul.
 */
export function faraReferintaLa(reguli: Regula[], disparute: Set<string>): Regula[] {
  const out: Regula[] = [];
  for (const r of reguli ?? []) {
    // Conditia se uita la un id disparut: regula nu se mai poate aprinde niciodata.
    let citesteSters = false;
    for (const n of nodurileCerute(r.cand)) if (disparute.has(n)) citesteSters = true;
    if (citesteSters) continue;

    const atunci = (r.atunci ?? []).filter((a) => !("tinta" in a && a.tinta && disparute.has(a.tinta)));
    if (!atunci.length) continue;
    out.push({ ...r, atunci });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MUTARE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Muta un element cu o pozitie, in sus sau in jos.
 *
 * ⚠ EXISTA SI CA BUTOANE, nu doar ca tragere cu mausul. Tragerea e greu de folosit pe telefon si
 * imposibila cu tastatura — comentariul din `store-editor/SectionList.tsx` o spune deja, si tot
 * acolo sta singura configurare de tragere verificata din proiect. Butoanele nu sunt o rezerva
 * de politete: pentru o parte dintre oameni sunt singurul drum.
 *
 * La capat nu se intampla nimic: nu se roteste lista si nu se arunca.
 */
function mutat<T>(lista: T[], indice: number, directie: -1 | 1): T[] {
  const tinta = indice + directie;
  if (indice < 0 || indice >= lista.length || tinta < 0 || tinta >= lista.length) return lista;
  const out = [...lista];
  [out[indice], out[tinta]] = [out[tinta], out[indice]];
  return out;
}

export function mutaPas(c: Continut, idPas: string, directie: -1 | 1): Continut {
  const pasi = c.definitie.pasi ?? [];
  const i = pasi.findIndex((p) => p.id === idPas);
  if (i < 0) return c;
  const noi = mutat(pasi, i, directie);
  return noi === pasi ? c : { ...c, definitie: { ...c.definitie, pasi: noi } };
}

/** ⚠ Mutarea unui grup ramane INAUNTRUL pasului lui. Trecerea dintr-un pas in altul e alta
 *  operatie, si trebuie sa fie: ar schimba ce vede cumparatorul la ce pas, nu doar ordinea. */
export function mutaGrup(c: Continut, idGrup: string, directie: -1 | 1): Continut {
  let schimbat = false;
  const pasi = (c.definitie.pasi ?? []).map((p) => {
    const i = (p.grupuri ?? []).findIndex((g) => g.id === idGrup);
    if (i < 0) return p;
    const noi = mutat(p.grupuri ?? [], i, directie);
    if (noi === p.grupuri) return p;
    schimbat = true;
    return { ...p, grupuri: noi };
  });
  return schimbat ? { ...c, definitie: { ...c.definitie, pasi } } : c;
}

/** ⚠ Si nodul ramane in grupul lui, din acelasi motiv. */
export function mutaNod(c: Continut, idNod: string, directie: -1 | 1): Continut {
  let schimbat = false;
  const pasi = (c.definitie.pasi ?? []).map((p) => ({
    ...p,
    grupuri: (p.grupuri ?? []).map((g) => {
      const i = (g.noduri ?? []).findIndex((n) => n.id === idNod);
      if (i < 0) return g;
      const noi = mutat(g.noduri ?? [], i, directie);
      if (noi === g.noduri) return g;
      schimbat = true;
      return { ...g, noduri: noi };
    }),
  }));
  return schimbat ? { ...c, definitie: { ...c.definitie, pasi } } : c;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OPTIUNILE UNEI ALEGERI
   ═══════════════════════════════════════════════════════════════════════════ */

/** Nodul, cu o optiune noua la coada. */
export function adaugaOptiune(nod: Nod, eticheta = "Optiune noua"): Nod {
  if (nod.fel !== "alegere" && nod.fel !== "alegeri") return nod;
  if ((nod.optiuni ?? []).length >= MAX_OPTIUNI_PE_NOD) return nod;
  return { ...nod, optiuni: [...(nod.optiuni ?? []), { id: idNou(), eticheta }] };
}

/**
 * Scoate o optiune din nod.
 *
 * ⚠ Nu se sterge cand e IMPLICITUL nodului si mai exista si altele: implicitul ar fi ramas
 * aratand spre ceva inexistent, iar validatorul l-ar fi refuzat la publicare cu un mesaj despre
 * o optiune pe care comerciantul tocmai a sters-o. Se scoate mai intai implicitul.
 */
export function stergeOptiune(nod: Nod, idOptiune: string): Nod {
  if (nod.fel !== "alegere" && nod.fel !== "alegeri") return nod;
  const optiuni = (nod.optiuni ?? []).filter((o) => o.id !== idOptiune);
  if (nod.fel === "alegere") {
    const implicit = nod.implicit === idOptiune ? undefined : nod.implicit;
    return { ...nod, optiuni, ...(implicit ? { implicit } : { implicit: undefined }) };
  }
  const implicit = (nod.implicit ?? []).filter((x) => x !== idOptiune);
  return { ...nod, optiuni, ...(implicit.length ? { implicit } : { implicit: undefined }) };
}

/** Muta o optiune cu o pozitie. Ordinea lor e ce vede cumparatorul in lista. */
export function mutaOptiune(nod: Nod, idOptiune: string, directie: -1 | 1): Nod {
  if (nod.fel !== "alegere" && nod.fel !== "alegeri") return nod;
  const i = (nod.optiuni ?? []).findIndex((o) => o.id === idOptiune);
  if (i < 0) return nod;
  const noi = mutat(nod.optiuni ?? [], i, directie);
  return noi === nod.optiuni ? nod : { ...nod, optiuni: noi };
}
