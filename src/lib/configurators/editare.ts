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
  type Definitie, type Grup, type Nod, type NodAlegere, type NodAlegeri, type Optiune, type Pas,
  MAX_GRUPURI_PE_PAS, MAX_NODURI, MAX_NODURI_PE_GRUP, MAX_OPTIUNI_PE_NOD, MAX_PASI,
  areOptiuni, harta, nodDupaId, optiuneActiva, producesValoare, toateNodurile,
} from "./definitie";
import { nodurileCerute, type Actiune, type Conditie, type Regula, MAX_REGULI } from "./reguli";
import type { FelBaza, Pretuire } from "./pret";
import { eNumarBun } from "./unitati";

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
  const disparute = new Set([idNod]);
  return {
    ...c, definitie,
    reguli: faraReferintaLa(c.reguli, disparute),
    pretuire: faraModificatoriMorti(c.pretuire, disparute),
  };
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
    pretuire: faraModificatoriMorti(c.pretuire, disparute),
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
    pretuire: faraModificatoriMorti(c.pretuire, disparute),
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

/**
 * Pretuirea, curatata de adaosurile care se uitau la id-uri disparute.
 *
 * ⚠ ORICE CAMP AL CIORNEI TREBUIE CURATAT LA STERGERE, nu doar `reguli`. Un modificator al
 * carui `cand` citeste un camp sters nu se mai aprinde NICIODATA — exact ca o regula ramasa
 * fara declansator. Lasat, ar fi stat in fila de pret ca un adaos care „se aplica" si nu
 * schimba nimic, iar comerciantul ar fi cautat greseala in formula. Pretul nu se misca cu un
 * ban: adaosul nu se aprindea oricum.
 *
 * ⚠ FORMULA NU SE ATINGE, si asta e dinadins. O formula care trimite la un camp sters PICA
 * publicarea cu „referinta lipsa" — acolo comerciantul chiar are ce repara, si e mai bine sa
 * afle decat sa i se schimbe pretul sub mana.
 */
export function faraModificatoriMorti(p: Pretuire, disparute: Set<string>): Pretuire {
  const toti = p.modificatori ?? [];
  const ramasi = toti.filter((m) => {
    if (!m.cand) return true;
    for (const n of nodurileCerute(m.cand)) if (disparute.has(n)) return false;
    return true;
  });
  if (ramasi.length === toti.length) return p;
  const out: Pretuire = { ...p };
  if (ramasi.length) out.modificatori = ramasi;
  else delete out.modificatori;
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
/**
 * Ce a scris omul intr-un camp de numar — sau nimic.
 *
 * ⚠ SIRUL GOL DA `undefined`, NU ZERO. `Number("")` e 0, iar un camp golit ar fi devenit tacut
 * „minim 0" in loc de „fara minim" — adica alta regula decat cea pe care omul tocmai a sters-o.
 * Aceeasi capcana la pretul minim, la maxim si la taxa de pornire, unde zero chiar inseamna ceva.
 *
 * ⚠ Virgula se primeste: pe o tastatura romaneasca 2,5 se scrie cu virgula, iar `Number("2,5")`
 * e `NaN`.
 */
export function numarScris(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL: NUMERELE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * De unde porneste pretul.
 *
 * ⚠ Taxa de pornire RAMANE scrisa cand baza se muta de la „taxa" catre altceva. Stearsa,
 * comerciantul care apasa din greseala „Pretul produsului" si se intoarce inapoi ar fi gasit
 * campul gol — adica un numar pe care l-a scris el si care i-a disparut fara sa fi cerut nimeni
 * asta. `pret.ts` o citeste doar cand baza chiar e „taxa", deci lasata acolo nu costa nimic.
 */
export function puneBazaPret(c: Continut, baza: FelBaza): Continut {
  return { ...c, pretuire: { ...c.pretuire, baza } };
}

/** Taxa de pornire, in lei. `undefined` scoate campul din ciorna, nu-l pune pe zero. */
export function puneTaxaInitiala(c: Continut, v: number | undefined): Continut {
  const pretuire: Pretuire = { ...c.pretuire };
  if (v === undefined) delete pretuire.taxaInitiala;
  else pretuire.taxaInitiala = v;
  return { ...c, pretuire };
}

/**
 * Pretul minim sau cel maxim al configuratorului.
 *
 * ⚠ `undefined` STERGE pragul, nu-l pune pe zero. Un „minim 0 lei" nu inseamna acelasi lucru
 * cu „fara minim" — e chiar regula pe care comerciantul tocmai a sters-o din camp.
 */
export function punePragPret(c: Continut, care: "minim" | "maxim", v: number | undefined): Continut {
  const pretuire: Pretuire = { ...c.pretuire };
  if (v === undefined) delete pretuire[care];
  else pretuire[care] = v;
  return { ...c, pretuire };
}

/**
 * Rotunjirea comerciala („pretul se rotunjeste la 5 lei").
 *
 * ⚠ Un pas care nu e mai mare ca zero NU se pastreaza: sterge rotunjirea cu totul. `citeste.ts`
 * arunca oricum `{ fel, pas: 0 }` cand ciorna se citeste inapoi din baza, deci pastrat aici ar fi
 * aratat pe ecran o rotunjire pe care prima reincarcare a paginii o facea sa dispara — iar
 * comerciantul ar fi dat vina pe autosalvare.
 */
export function puneRotunjire(c: Continut, r: Pretuire["rotunjire"] | undefined): Continut {
  const pretuire: Pretuire = { ...c.pretuire };
  if (r && eNumarBun(r.pas) && r.pas > 0) pretuire.rotunjire = { fel: r.fel, pas: r.pas };
  else delete pretuire.rotunjire;
  return { ...c, pretuire };
}

/**
 * Ce nu merge la numerele pretului, spus in romana, in clipa in care se scriu.
 *
 * ⚠ `validare.ts` RAMANE AUTORITATEA — el opreste publicarea, si numai el. Aici se spun doar
 * lucrurile pe care le poate produce chiar ecranul asta, si se spun pe loc: un minim mai mare
 * decat maximul refuzat abia la „Publica" l-ar fi pus pe comerciant sa caute prin trei file care
 * dintre numerele scrise acum zece minute e cel gresit.
 *
 * ⚠ „Maxim 0 lei" e cel mai scump dintre ele si SINGURUL care trece de validare: pretul iese
 * taiat la zero, nu e negativ, deci publicarea il primeste — si magazinul da marfa pe gratis.
 */
export function problemeleDePret(p: Pretuire): string[] {
  const out: string[] = [];
  if (eNumarBun(p.minim) && eNumarBun(p.maxim) && p.minim > p.maxim) {
    out.push("Pretul minim e mai mare decat cel maxim. Publicarea va fi refuzata.");
  }
  if (eNumarBun(p.maxim) && p.maxim <= 0) {
    out.push("Un pret maxim de 0 lei face ca orice configuratie sa coste 0 lei.");
  }
  if (p.baza === "taxa" && !eNumarBun(p.taxaInitiala)) {
    out.push("Pretul porneste de la o taxa, dar taxa nu e scrisa: se porneste de la 0 lei.");
  }
  if (eNumarBun(p.minim) && p.minim < 0) {
    out.push("Un pret minim negativ nu face nimic: pretul nu poate cobori sub zero oricum.");
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   REGULILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ NU EXISTA „MUTA REGULA MAI SUS", si lipsa e o hotarare.
 *
 * `reguli.ts` le roteste pana la punct fix si departajeaza conflictele dupa „cea mai stransa
 * castiga", NU dupa pozitia in lista. Niste butoane de reasezare ar fi promis comerciantului o
 * prioritate care nu exista, si prima data cand doua reguli s-ar fi batut cap in cap ar fi mutat
 * degeaba randuri pana s-ar fi lasat pagubas.
 */
export function adaugaRegula(c: Continut, r: Regula): Continut {
  if ((c.reguli ?? []).length >= MAX_REGULI) return c;
  return { ...c, reguli: [...(c.reguli ?? []), r] };
}

/** Schimba campurile unei reguli. Id-ul nu, niciodata: constatarile de la publicare trimit la el. */
export function schimbaRegula(c: Continut, idRegula: string, campuri: Partial<Regula>): Continut {
  const { id: _ignorat, ...restul } = campuri;
  void _ignorat;
  return { ...c, reguli: (c.reguli ?? []).map((r) => (r.id === idRegula ? { ...r, ...restul } : r)) };
}

export function stergeRegula(c: Continut, idRegula: string): Continut {
  return { ...c, reguli: (c.reguli ?? []).filter((r) => r.id !== idRegula) };
}

/* ── Presetarile ─────────────────────────────────────────────────────────────────── */

/**
 * Cele cinci lucruri pe care le cer magazinele adevarate de la un configurator.
 *
 * ⚠ PRESETAREA NU SE MARCHEAZA IN CIORNA, SE RECUNOASTE DUPA FORMA. `ShippingRulesEditor` isi
 * tine un `presetKey` pe regula, dar acolo tipul il are. Aici `Regula` n-are asa ceva, iar
 * `citeste.ts` pastreaza numai cheile pe care le stie: un marcaj scris in ciorna ar fi disparut
 * tacut la prima citire din baza, si comerciantul ar fi gasit un builder brut acolo unde lasase
 * un rand simplu.
 */
export type FelPresetare = "ascunde" | "obligatoriu" | "limiteaza" | "scoate_optiuni" | "opreste";

/** Ce aprinde regula. Doua forme, fiindca „Da / Nu" nu se alege dintr-o lista de optiuni. */
export type Declansator =
  | { fel: "optiune"; nod: string; optiune: string }
  | { fel: "pornit"; nod: string };

export type Presetare =
  | { fel: "ascunde"; cand: Declansator; tinta: string }
  | { fel: "obligatoriu"; cand: Declansator; tinta: string }
  | { fel: "limiteaza"; cand: Declansator; tinta: string; min?: number; max?: number }
  | { fel: "scoate_optiuni"; cand: Declansator; tinta: string; optiuni: string[] }
  | { fel: "opreste"; cand: Declansator; text: string };

function conditiaDin(d: Declansator): Conditie {
  return d.fel === "pornit" ? { c: "pornit", nod: d.nod } : { c: "este", nod: d.nod, v: d.optiune };
}

/** Declansatorul dintr-o conditie, cand conditia e una dintre cele doua forme presetate. */
export function declansatorulDin(cand: Conditie): Declansator | null {
  if (cand.c === "pornit") return { fel: "pornit", nod: cand.nod };
  if (cand.c === "este") return { fel: "optiune", nod: cand.nod, optiune: cand.v };
  return null;
}

/** Regula adevarata pe care o scrie o presetare. Ce ajunge in ciorna e DOAR asta. */
export function regulaDinPresetare(id: string, p: Presetare, activa?: boolean): Regula {
  const cand = conditiaDin(p.cand);
  const atunci: Actiune[] = [];
  switch (p.fel) {
    case "ascunde": atunci.push({ a: "ascunde", tinta: p.tinta }); break;
    case "obligatoriu": atunci.push({ a: "obligatoriu", tinta: p.tinta }); break;
    case "scoate_optiuni": atunci.push({ a: "fara_optiunile", tinta: p.tinta, optiuni: p.optiuni }); break;
    case "opreste": atunci.push({ a: "opreste", text: p.text }); break;
    case "limiteaza":
      if (p.min !== undefined) atunci.push({ a: "min", tinta: p.tinta, v: p.min });
      if (p.max !== undefined) atunci.push({ a: "max", tinta: p.tinta, v: p.max });
      break;
  }
  return { id, cand, atunci, ...(activa === false ? { activa: false } : {}) };
}

type ActiuneLimita = Extract<Actiune, { a: "min" | "max" }>;

/**
 * Presetarea dintr-o regula, sau `null` cand regula e mai bogata decat stiu presetarile.
 *
 * ⚠ O regula care nu se recunoaste NU se deseneaza ca presetare, se arata scrisa in romana si
 * atat. Desenata cu un singur select de tinta, prima atingere a comerciantului i-ar fi mutat pe
 * tacute si celelalte actiuni — de aceea limitele cer AMANDOUA aceeasi tinta, si de aceea o
 * regula cu doua actiuni de acelasi fel („min" si tot „min") nu e presetare.
 */
export function presetareaDin(r: Regula): Presetare | null {
  const cand = declansatorulDin(r.cand);
  if (!cand) return null;
  const a = r.atunci ?? [];
  if (!a.length) return null;

  const limite = a.filter((x): x is ActiuneLimita => x.a === "min" || x.a === "max");
  if (limite.length === a.length) {
    if (limite.length > 2) return null;
    const min = limite.filter((x) => x.a === "min");
    const max = limite.filter((x) => x.a === "max");
    if (min.length > 1 || max.length > 1) return null;
    if (limite.some((x) => x.tinta !== limite[0].tinta)) return null;
    return {
      fel: "limiteaza", cand, tinta: limite[0].tinta,
      ...(min[0] ? { min: min[0].v } : {}),
      ...(max[0] ? { max: max[0].v } : {}),
    };
  }

  if (a.length !== 1) return null;
  const x = a[0];
  if (x.a === "ascunde") return { fel: "ascunde", cand, tinta: x.tinta };
  if (x.a === "obligatoriu") return { fel: "obligatoriu", cand, tinta: x.tinta };
  if (x.a === "fara_optiunile") return { fel: "scoate_optiuni", cand, tinta: x.tinta, optiuni: [...(x.optiuni ?? [])] };
  if (x.a === "opreste") return { fel: "opreste", cand, text: x.text };
  return null;
}

/* ── Ce se poate alege in presetare ──────────────────────────────────────────────── */

/** Campurile care pot aprinde o presetare: cele cu optiuni si comutatoarele. */
export function declansatoriiPosibili(d: Definitie): Nod[] {
  return toateNodurile(d).filter((n) => areOptiuni(n) || n.fel === "comutator");
}

export interface TintaPosibila { id: string; eticheta: string; fel: "camp" | "grup" | "pas" }

function poateFiTinta(n: Nod, fel: FelPresetare): boolean {
  switch (fel) {
    case "limiteaza": return n.fel === "numar";
    // ⚠ Cu lista goala n-are ce sa scoata. Oferit, `asezata` ar fi refuzat presetarea intreaga
    // si butonul ar fi ramas stins desi in configurator exista alt camp bun pentru ea.
    case "scoate_optiuni": return areOptiuni(n) && (n.optiuni ?? []).length > 0;
    case "obligatoriu": return producesValoare(n);
    // Un calcul nu se vede oricum, deci nu are ce sa ascunda cineva.
    case "ascunde": return n.fel !== "calcul";
    default: return false;
  }
}

/**
 * Ce poate tinti o presetare.
 *
 * ⚠ CAMPUL CARE APRINDE REGULA IESE DIN LISTA, IMPREUNA CU GRUPUL SI PASUL LUI. Nu e
 * precautie, e o masuratoare, si iese mai rau decat pare: „cand Material este Lemn, ascunde
 * Material" NU oscileaza, deci publicarea o primeste fara o vorba. Ce se intampla e ca
 * ascunderea sterge valoarea campului, iar fara valoare regula nu se mai aprinde — asa ca la
 * trecerea urmatoare campul nici macar nu mai e ascuns: se intoarce pe ecran, GOL.
 *
 * Adica un camp care se goleste singur de fiecare data cand cumparatorul alege exact optiunea
 * aia, la nesfarsit, fara nicio eroare nicaieri. La fel daca tinta e grupul sau pasul in care
 * sta chiar el — masurat, aceeasi purtare.
 */
export function tinteleDe(d: Definitie, fel: FelPresetare, faraNodul?: string): TintaPosibila[] {
  if (fel === "opreste") return [];
  const interzise = new Set<string>();
  if (faraNodul) {
    interzise.add(faraNodul);
    const loc = harta(d).get(faraNodul);
    if (loc) { interzise.add(loc.grup.id); interzise.add(loc.pas.id); }
  }

  const out: TintaPosibila[] = [];
  for (const pas of d.pasi ?? []) {
    if (fel === "ascunde" && !interzise.has(pas.id)) {
      out.push({ id: pas.id, eticheta: `Pasul „${pas.eticheta || pas.id}"`, fel: "pas" });
    }
    let iGrup = 0;
    for (const g of pas.grupuri ?? []) {
      iGrup += 1;
      if (fel === "ascunde" && !interzise.has(g.id)) {
        out.push({ id: g.id, eticheta: g.eticheta ? `Grupul „${g.eticheta}"` : `Grupul ${iGrup}`, fel: "grup" });
      }
      for (const n of g.noduri ?? []) {
        if (!interzise.has(n.id) && poateFiTinta(n, fel)) {
          out.push({ id: n.id, eticheta: n.eticheta, fel: "camp" });
        }
      }
    }
  }
  return out;
}

/**
 * Declansatorul, potrivit pe campul ales.
 *
 * ⚠ Se ia prima optiune ACTIVA, nu prima din lista. Una scoasa din vanzare nu mai poate fi
 * aleasa de nimeni, deci o regula pornita de ea nu s-ar fi aprins niciodata — si ar fi stat in
 * panou ca o regula scrisa corect care nu face nimic.
 */
function declansatorulAsezat(cand: Declansator, nod: Nod): Declansator | null {
  if (nod.fel === "comutator") return { fel: "pornit", nod: nod.id };
  if (!areOptiuni(nod)) return null;
  const active = (nod.optiuni ?? []).filter(optiuneActiva);
  if (!active.length) return null;
  const optiune = cand.fel === "optiune" && active.some((o) => o.id === cand.optiune)
    ? cand.optiune
    : active[0].id;
  return { fel: "optiune", nod: nod.id, optiune };
}

/**
 * Presetarea, asezata pe definitia de ACUM. `null` cand definitia n-o poate purta.
 *
 * ⚠ FARA ASEZARE, o simpla schimbare de camp ar fi lasat in urma id-ul unei optiuni de pe ALT
 * camp. La declansator, regula ar fi ramas scrisa corect si nu s-ar fi aprins niciodata; la
 * „scoate optiunile", publicarea ar fi picat cu „o regula trimite la o optiune care nu mai
 * exista" — despre o optiune pe care comerciantul n-a atins-o.
 *
 * ⚠ O limitare fara NICIUN capat primeste `min: 0`: ramasa fara actiuni, `citeste.ts` arunca
 * regula intreaga la prima citire din baza, si randul dispare de pe ecran singur.
 */
export function asezata(p: Presetare, d: Definitie): Presetare | null {
  const nod = nodDupaId(d, p.cand.nod);
  if (!nod) return null;
  const cand = declansatorulAsezat(p.cand, nod);
  if (!cand) return null;
  if (p.fel === "opreste") {
    // ⚠ Un mesaj GOL face `citeste.ts` sa arunce actiunea, si odata cu ea regula intreaga: randul
    // ar fi disparut singur de pe ecran la prima reincarcare a paginii. Se pune inapoi textul
    // standard, ca sa nu ramana o regula pe jumatate scrisa in ciorna.
    return { ...p, cand, text: p.text.trim() ? p.text : MESAJ_OPRIRE };
  }

  const tinte = tinteleDe(d, p.fel, cand.nod);
  if (!tinte.length) return null;
  const tinta = tinte.some((t) => t.id === p.tinta) ? p.tinta : tinte[0].id;

  if (p.fel === "scoate_optiuni") {
    const nodTinta = nodDupaId(d, tinta);
    const ale = nodTinta && areOptiuni(nodTinta) ? (nodTinta.optiuni ?? []).map((o) => o.id) : [];
    if (!ale.length) return null;
    const pastrate = p.optiuni.filter((x) => ale.includes(x));
    return { ...p, cand, tinta, optiuni: pastrate.length ? pastrate : [ale[0]] };
  }
  if (p.fel === "limiteaza") {
    const min = eNumarBun(p.min) ? p.min : undefined;
    const max = eNumarBun(p.max) ? p.max : undefined;
    const capete: { min?: number; max?: number } = {};
    if (min !== undefined) capete.min = min;
    if (max !== undefined) capete.max = max;
    if (min === undefined && max === undefined) capete.min = 0;
    return { fel: "limiteaza", cand, tinta, ...capete };
  }
  return { ...p, cand, tinta };
}

/**
 * Ce mai ramane de ales pe un camp dupa ce o regula scoate optiunile date.
 *
 * ⚠ SCOATEREA TUTUROR OPTIUNILOR FACE PRODUSUL NECUMPARABIL, SI NIMENI NU PRINDE ASTA.
 * `validare.ts` numara optiunile ACTIVE din definitie, nu ce lasa regulile in urma, deci
 * publicarea trece. Pe magazin, campul se deseneaza gol; iar daca e si obligatoriu,
 * `verificaRaspunsul` refuza ORICE comanda cu „trebuie ales" pe un camp din care nu se poate
 * alege nimic. E chiar modul de esec pentru care nodul `fisiere` a fost scos din lista de
 * adaugare — numai ca aici se ajunge la el din doua bife.
 */
export function optiuniRamase(nod: Nod, scoase: readonly string[]): string[] {
  if (!areOptiuni(nod)) return [];
  const afara = new Set(scoase);
  return (nod.optiuni ?? [])
    .filter((o) => optiuneActiva(o) && !afara.has(o.id))
    .map((o) => o.id);
}

/** Presetarea gata facuta pentru definitia data, sau `null` cand nu are cu ce s-o poarte. */
export function presetareNoua(d: Definitie, fel: FelPresetare): Presetare | null {
  for (const nod of declansatoriiPosibili(d)) {
    const cand = declansatorulAsezat({ fel: "pornit", nod: nod.id }, nod);
    if (!cand) continue;
    const gata = asezata(schita(fel, cand), d);
    if (gata) return gata;
  }
  return null;
}

/** Ce scrie in mesajul de oprire pana cand comerciantul scrie al lui. */
export const MESAJ_OPRIRE = "Combinatia asta nu se poate produce.";

function schita(fel: FelPresetare, cand: Declansator): Presetare {
  switch (fel) {
    case "ascunde": return { fel, cand, tinta: "" };
    case "obligatoriu": return { fel, cand, tinta: "" };
    case "limiteaza": return { fel, cand, tinta: "" };
    case "scoate_optiuni": return { fel, cand, tinta: "", optiuni: [] };
    case "opreste": return { fel, cand, text: MESAJ_OPRIRE };
  }
}

/** Muta declansatorul pe alt camp, asezand tot ce atarna de el. */
export function cuDeclansatorulPe(p: Presetare, d: Definitie, idNod: string): Presetare {
  return asezata({ ...p, cand: { fel: "pornit", nod: idNod } }, d) ?? p;
}

/** Muta tinta pe alt camp, asezand tot ce atarna de ea. */
export function cuTintaPe(p: Presetare, d: Definitie, idTinta: string): Presetare {
  if (p.fel === "opreste") return p;
  return asezata({ ...p, tinta: idTinta }, d) ?? p;
}

/* ── Regula, spusa in romana ──────────────────────────────────────────────────────── */

/**
 * Numele lucrului cu id-ul dat: camp, optiune, grup sau pas.
 *
 * ⚠ Se cauta si printre OPTIUNI. Fara asta, „Cand Material este 7f3a-..." l-ar fi pus pe
 * comerciant sa ghiceasca despre ce alegere e vorba tocmai in randul pe care vrea sa-l stearga.
 */
export function numeleLui(d: Definitie, id: string): string {
  for (const pas of d.pasi ?? []) {
    if (pas.id === id) return `pasul „${pas.eticheta || id}"`;
    for (const g of pas.grupuri ?? []) {
      if (g.id === id) return `grupul „${g.eticheta || id}"`;
      for (const n of g.noduri ?? []) {
        if (n.id === id) return `„${n.eticheta}"`;
        if (areOptiuni(n)) {
          for (const o of n.optiuni ?? []) if (o.id === id) return `„${o.eticheta}"`;
        }
      }
    }
  }
  return `„${id}"`;
}

export function descrieConditie(d: Definitie, c: Conditie): string {
  const n = (id: string) => numeleLui(d, id);
  switch (c.c) {
    case "si": return (c.din ?? []).map((x) => descrieConditie(d, x)).join(" si ");
    case "sau": return (c.din ?? []).map((x) => descrieConditie(d, x)).join(" sau ");
    case "este": return `${n(c.nod)} este ${n(c.v)}`;
    case "nu_este": return `${n(c.nod)} nu este ${n(c.v)}`;
    case "una_din": return `${n(c.nod)} e una din ${(c.v ?? []).map(n).join(", ")}`;
    case "niciuna_din": return `${n(c.nod)} nu e niciuna din ${(c.v ?? []).map(n).join(", ")}`;
    case "completat": return `${n(c.nod)} e completat`;
    case "necompletat": return `${n(c.nod)} nu e completat`;
    case "pornit": return `${n(c.nod)} e pornit`;
    case "oprit": return `${n(c.nod)} e oprit`;
    case "cmp": return `${n(c.nod)} ${c.op} ${c.v}`;
    case "intre": return `${n(c.nod)} e intre ${c.min} si ${c.max}`;
    case "nu_intre": return `${n(c.nod)} nu e intre ${c.min} si ${c.max}`;
    case "contine": return `${n(c.nod)} contine „${c.v}"`;
    case "incepe_cu": return `${n(c.nod)} incepe cu „${c.v}"`;
    case "termina_cu": return `${n(c.nod)} se termina cu „${c.v}"`;
    default: return "o conditie pe care panoul nu o cunoaste";
  }
}

export function descrieActiune(d: Definitie, a: Actiune): string {
  const n = (id: string) => numeleLui(d, id);
  switch (a.a) {
    case "arata": return `arata ${n(a.tinta)}`;
    case "ascunde": return `ascunde ${n(a.tinta)}`;
    case "activeaza": return `activeaza ${n(a.tinta)}`;
    case "dezactiveaza": return `dezactiveaza ${n(a.tinta)}`;
    case "obligatoriu": return `face ${n(a.tinta)} obligatoriu`;
    case "optional": return `face ${n(a.tinta)} optional`;
    case "doar_optiunile": return `lasa in ${n(a.tinta)} doar ${(a.optiuni ?? []).map(n).join(", ")}`;
    case "fara_optiunile": return `scoate din ${n(a.tinta)} pe ${(a.optiuni ?? []).map(n).join(", ")}`;
    case "min": return `pune minimul lui ${n(a.tinta)} pe ${a.v}`;
    case "max": return `pune maximul lui ${n(a.tinta)} pe ${a.v}`;
    case "pas": return `pune pasul lui ${n(a.tinta)} pe ${a.v}`;
    case "pune": return `completeaza ${n(a.tinta)}`;
    case "goleste": return `goleste ${n(a.tinta)}`;
    case "mesaj": return `arata mesajul „${a.text}"`;
    case "opreste": return `opreste comanda cu „${a.text}"`;
    default: return "o actiune pe care panoul nu o cunoaste";
  }
}

/** Regula intreaga, intr-un rand de romana. */
export function descrieRegula(d: Definitie, r: Regula): string {
  const ce = (r.atunci ?? []).map((a) => descrieActiune(d, a)).join(" si ");
  return `Cand ${descrieConditie(d, r.cand)}, ${ce || "nu se intampla nimic"}.`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OPTIUNILE, IN AMANUNT
   ═══════════════════════════════════════════════════════════════════════════ */

/** Implicitul care a ramas fara acoperire dupa ce o optiune a fost stinsa. */
function faraImplicitStins(nod: NodAlegere | NodAlegeri): NodAlegere | NodAlegeri {
  const activ = (id: string) => (nod.optiuni ?? []).some((o) => o.id === id && optiuneActiva(o));
  if (nod.fel === "alegere") {
    return nod.implicit && !activ(nod.implicit) ? { ...nod, implicit: undefined } : nod;
  }
  const acum = nod.implicit ?? [];
  const ramase = acum.filter(activ);
  if (ramase.length === acum.length) return nod;
  return { ...nod, implicit: ramase.length ? ramase : undefined };
}

/**
 * Schimba campurile unei optiuni.
 *
 * ⚠ Id-ul nu se schimba niciodata: comenzile deja plasate poarta CHIAR id-ul optiunii in
 * instantaneul lor, iar o comanda veche ar fi ramas aratand spre nimic.
 *
 * ⚠ Optiunea scoasa din vanzare nu mai poate fi IMPLICITUL campului. `validare.ts` sare peste
 * un implicit stins fara sa spuna nimic, deci configuratorul s-ar fi deschis cu campul gol in
 * timp ce panoul continua sa arate ca implicitul e pus — doua ecrane care se contrazic.
 */
export function schimbaOptiune(nod: Nod, idOptiune: string, campuri: Partial<Optiune>): Nod {
  if (!areOptiuni(nod)) return nod;
  const { id: _ignorat, ...restul } = campuri;
  void _ignorat;
  const optiuni = (nod.optiuni ?? []).map((o) => (o.id === idOptiune ? { ...o, ...restul } : o));
  const dupa = { ...nod, optiuni } as NodAlegere | NodAlegeri;
  return faraImplicitStins(dupa);
}

/**
 * Optiunea aleasa din start, pe un camp cu o singura alegere.
 *
 * ⚠ Una scoasa din vanzare NU se poate pune implicit: `validare.ts` o sare in tacere, deci
 * primul cumparator ar fi deschis pagina cu campul gol, iar comerciantul ar fi vazut in panou o
 * bifa pusa care nu face nimic.
 */
export function puneImplicitAlegere(nod: Nod, idOptiune: string | undefined): Nod {
  if (nod.fel !== "alegere") return nod;
  if (idOptiune === undefined) return { ...nod, implicit: undefined };
  const o = (nod.optiuni ?? []).find((x) => x.id === idOptiune);
  if (!o || !optiuneActiva(o)) return nod;
  return { ...nod, implicit: idOptiune };
}

/**
 * Bifeaza sau debifeaza o optiune din implicitul unui camp cu alegeri multiple.
 *
 * ⚠ Implicitul se tine in ORDINEA OPTIUNILOR, nu in ordinea bifarii. Motorul le sorteaza
 * oricum (`valori.ts`), dar in panou bifele ar fi sarit dintr-un loc in altul la fiecare
 * atingere, si comerciantul ar fi crezut ca a stricat ceva.
 */
export function comutaImplicitAlegeri(nod: Nod, idOptiune: string): Nod {
  if (nod.fel !== "alegeri") return nod;
  const acum = nod.implicit ?? [];
  if (acum.includes(idOptiune)) {
    const ramase = acum.filter((x) => x !== idOptiune);
    return { ...nod, implicit: ramase.length ? ramase : undefined };
  }
  const o = (nod.optiuni ?? []).find((x) => x.id === idOptiune);
  if (!o || !optiuneActiva(o)) return nod;
  const ordine = (nod.optiuni ?? []).map((x) => x.id);
  const urmator = [...acum, idOptiune].sort((x, y) => ordine.indexOf(x) - ordine.indexOf(y));
  return { ...nod, implicit: urmator };
}

/**
 * Ce nu merge la un camp, spus in clipa in care se scrie.
 *
 * ⚠ Aici intra numai lucrurile pe care le poate produce CHIAR inspectorul si pe care
 * publicarea le refuza sau le sare in tacere. `validare.ts` ramane autoritatea; rostul listei e
 * ca omul sa nu construiasca zece minute ceva ce „Publica" refuza la sfarsit.
 */
export function problemeleNodului(nod: Nod): string[] {
  const out: string[] = [];
  if (nod.fel === "numar" && eNumarBun(nod.min) && eNumarBun(nod.max) && nod.min > nod.max) {
    out.push("Minimul e mai mare decat maximul. Publicarea va fi refuzata.");
  }
  if (nod.fel === "alegeri" && eNumarBun(nod.minAlese) && eNumarBun(nod.maxAlese) && nod.minAlese > nod.maxAlese) {
    out.push("Se cer mai multe alegeri decat sunt permise: campul nu se poate completa.");
  }
  if (areOptiuni(nod)) {
    for (const o of nod.optiuni ?? []) {
      if (o.grame !== undefined && (!eNumarBun(o.grame) || o.grame < 0)) {
        out.push(`Optiunea „${o.eticheta}" are o greutate care nu e un numar pozitiv. Publicarea va fi refuzata.`);
      }
    }
    if ((nod.optiuni ?? []).length && !(nod.optiuni ?? []).some(optiuneActiva)) {
      out.push("Toate optiunile sunt scoase din vanzare: nu mai e nimic de ales.");
    }
  }
  return out;
}
