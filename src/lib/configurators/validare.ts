/**
 * Ce se verifica INAINTE ca un configurator sa ajunga in fata cumparatorilor.
 *
 * ═══ ⚠ VALIDATORUL RULEAZA MOTORUL, NU DOAR CITESTE DEFINITIA ═══
 *
 * O verificare pur statica ar fi spus „regulile A si B se trimit una la alta, deci s-ar putea
 * invarti". „S-ar putea" nu e destul in nicio directie: blocheaza publicari bune si lasa sa
 * treaca oscilatii adevarate care ies din alt drum.
 *
 * Aici se compune configuratia IMPLICITA — ce vede cumparatorul cand deschide pagina — si se
 * dau pe ea chiar motorul de reguli si chiar motorul de pret. Ce iese e ce s-ar fi intamplat
 * cu adevarat. Analiza statica ramane, dar ca AVERTISMENT, langa proba adevarata.
 *
 * ═══ DOUA TREPTE, SI NUMAI UNA OPRESTE ═══
 *
 * `critic` opreste publicarea: fara reparatie, magazinul ar vinde gresit.
 * `atentie` nu opreste: comerciantul o vede, si hotaraste el.
 *
 * ⚠ Treapta se alege dupa CE PATESTE CUMPARATORUL, nu dupa cat de urata e greseala. Un
 * configurator fara nicio optiune e `critic` (n-are ce configura nimeni). Un pas fara niciun
 * camp vizibil e doar `atentie` — se sare singur la randare, si poate fi chiar ce a vrut omul.
 */

import {
  type Definitie, type Nod, MAX_NODURI, areOptiuni, optiuneActiva,
  producesValoare, toateIdurile, toateNodurile,
} from "./definitie";
import { adancimea, numaraNoduri, referinteleDin, MAX_ADANCIME, MAX_NODURI as MAX_NODURI_EXPR } from "./expresii";
import { aplicaRegulile, nodurileCerute, optiunileCerute, type Regula } from "./reguli";
import { calculeazaPretul, type Pretuire } from "./pret";
import { normalizeazaValoare, type Valoare, type Valori } from "./valori";
import { componentaEStricata, trimiterileLaComponente } from "./componente";
import { MAX_FISIERE_PE_NOD, MAX_OCTETI } from "./fisiere";
import { nodurileCareSePotDesena, MAX_ZONE } from "./previzualizare";
import { eNumarBun } from "./unitati";

export type Treapta = "critic" | "atentie";

export interface Constatare {
  treapta: Treapta;
  cod: string;
  /** Ce se spune comerciantului. In romana, si numind lucrul de reparat. */
  mesaj: string;
  /** Unde sa-l duca interfata cand apasa pe constatare. */
  tinta?: string;
}

export interface RezultatValidare {
  sePoatePublica: boolean;
  constatari: Constatare[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURATIA IMPLICITA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce are cumparatorul pe ecran cand deschide pagina, inainte sa atinga ceva.
 *
 * ⚠ Un implicit STINS nu se alege. Comerciantul a scos optiunea din vanzare; pusa ca implicit,
 * primul cumparator ar fi comandat ce nu mai exista.
 */
export function configuratiaImplicita(d: Definitie): Valori {
  const out: Valori = {};
  for (const nod of toateNodurile(d)) {
    if (!producesValoare(nod)) continue;
    const v = implicitulNodului(nod);
    if (v) out[nod.id] = v;
  }
  return out;
}

function implicitulNodului(nod: Nod): Valoare | null {
  switch (nod.fel) {
    case "text":
      return nod.implicit ? normalizeazaValoare({ f: "text", v: nod.implicit }) : null;
    case "numar":
      return eNumarBun(nod.implicit) ? { f: "numar", v: nod.implicit } : null;
    case "comutator":
      return nod.implicit === true ? { f: "comutator", v: true } : null;
    case "alegere": {
      const o = (nod.optiuni ?? []).find((x) => x.id === nod.implicit && optiuneActiva(x));
      return o ? { f: "alegere", v: o.id } : null;
    }
    case "alegeri": {
      const ids = (nod.implicit ?? []).filter((id) =>
        (nod.optiuni ?? []).some((x) => x.id === id && optiuneActiva(x)));
      return ids.length ? normalizeazaValoare({ f: "alegeri", v: ids }) : null;
    }
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDAREA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface IntrareValidare {
  definitie: Definitie;
  reguli: Regula[];
  pretuire: Pretuire;
  /** Pretul produsului pe care ar sta configuratorul. Ii trebuie probei de pret. */
  pretProdus?: number;
  /** Semne lasate de sablon, care NU au voie sa ajunga in vanzare. */
  marcajeDemo?: string[];
  /**
   * Id-urile pieselor care CHIAR exista in `configurator_componente`, citite de apelant.
   *
   * ⚠ `undefined` INSEAMNA „N-AM INTREBAT”, NU „nu exista niciuna”, si deosebirea costa.
   * Previzualizarea din panou ruleaza validatorul pe ciorna din memorie, fara nicio citire; daca
   * lipsa listei ar fi fost citita ca multime goala, comerciantul ar fi vazut TOATE piesele lui
   * raportate ca fantome, la fiecare tasta. Publicarea, singura care chiar poate intreba baza,
   * trimite lista — si numai atunci se verifica.
   */
  componenteCunoscute?: readonly string[];
}

export function valideaza(intrare: IntrareValidare): RezultatValidare {
  const { definitie: d, reguli, pretuire } = intrare;
  const c: Constatare[] = [];
  const adauga = (treapta: Treapta, cod: string, mesaj: string, tinta?: string) =>
    c.push({ treapta, cod, mesaj, ...(tinta ? { tinta } : {}) });

  /* ── Structura ───────────────────────────────────────────────────────── */

  const noduri = toateNodurile(d);
  const cuValoare = noduri.filter(producesValoare);

  if (cuValoare.length === 0) {
    adauga("critic", "fara_optiuni",
      "Configuratorul nu are nicio optiune pe care cumparatorul sa o completeze.");
  }
  if (noduri.length >= MAX_NODURI) {
    adauga("critic", "prea_multe_noduri",
      `Configuratorul are prea multe optiuni (plafonul este ${MAX_NODURI}).`);
  }

  // ⚠ Id-urile repetate sunt cea mai rea greseala de structura: formulele si regulile trimit la
  // ele, iar `harta` ia PRIMUL — deci o regula ar lovi cine se nimereste.
  const vazute = new Set<string>();
  for (const id of toateIdurile(d)) {
    if (vazute.has(id)) {
      adauga("critic", "id_repetat", `Identificatorul „${id}" apare de mai multe ori.`, id);
    }
    vazute.add(id);
  }

  for (const pas of d.pasi ?? []) {
    const cateNoduri = (pas.grupuri ?? []).reduce((s, g) => s + (g.noduri ?? []).length, 0);
    if (cateNoduri === 0) {
      adauga("atentie", "pas_gol",
        `Pasul „${pas.eticheta || pas.id}" nu are nicio optiune si va fi sarit.`, pas.id);
    }
  }

  for (const nod of noduri) {
    if (!nod.eticheta || !nod.eticheta.trim()) {
      adauga("critic", "fara_eticheta", `O optiune nu are nume (${nod.id}).`, nod.id);
    }
    if (areOptiuni(nod)) {
      const active = (nod.optiuni ?? []).filter(optiuneActiva);
      if (active.length === 0) {
        adauga("critic", "alegere_fara_optiuni",
          `„${nod.eticheta}" nu are nicio optiune activa de ales.`, nod.id);
      }
      for (const o of nod.optiuni ?? []) {
        if (!o.eticheta || !o.eticheta.trim()) {
          adauga("critic", "optiune_fara_eticheta",
            `O optiune din „${nod.eticheta}" nu are nume.`, nod.id);
        }
        if (o.pret !== undefined && !eNumarBun(o.pret)) {
          adauga("critic", "pret_optiune_nevalid",
            `Optiunea „${o.eticheta}" din „${nod.eticheta}" are un pret care nu e un numar.`, nod.id);
        }
        /*
         * ⚠ O greutate stricata pleaca la CURIER, nu pe ecran.
         *
         * Gramele optiunii se aduna in greutatea coletului si de ele atarna pretul cerut celor
         * saisprezece curieri. Un numar NEGATIV ar fi SCAZUT din colet: cine alege „fara ambalaj"
         * ar fi facut comanda mai usoara decat produsul gol, iar diferenta de banda o plateste
         * comerciantul la recantarirea din depozit. Pretul are voie sa fie negativ (o reducere e o
         * hotarare comerciala); greutatea nu — si asta e chiar deosebirea dintre randul de mai sus
         * si asta.
         *
         * ⚠ Negativul e SINGURUL care ajunge aici pe drumul publicarii: `citeste.ts` arunca deja
         * ce nu e numar finit, dar il arunca in TACERE, deci greutatea scrisa de comerciant dispare
         * fara ca el sa afle. Verificarea de fel ramane pentru celalalt apelant — previzualizarea
         * din panou ruleaza `valideaza` pe ciorna din memorie, care n-a trecut pe acolo — si ca sa
         * nu depinda constatarea de ordinea a doua module.
         */
        if (o.grame !== undefined && (!eNumarBun(o.grame) || o.grame < 0)) {
          adauga("critic", "grame_optiune_nevalid",
            `Optiunea „${o.eticheta}" din „${nod.eticheta}" are o greutate care nu e un numar pozitiv.`, nod.id);
        }
      }
    }
    if (nod.fel === "numar" && eNumarBun(nod.min) && eNumarBun(nod.max) && nod.min > nod.max) {
      adauga("critic", "limite_pe_dos",
        `„${nod.eticheta}": minimul este mai mare decat maximul.`, nod.id);
    }
    /*
     * """ + W + """ CATE BIFE SE CER, FATA DE CATE EXISTA.
     *
     * De cand campurile astea se pot scrie din panou, un „cel putin 5" pe un camp cu doua optiuni
     * se publica linistit — si produsul nu se mai poate comanda NICIODATA: verificarea raspunsului
     * cere cinci bife, iar cumparatorul n-are de unde sa le ia. Nimic nu cade, nimeni nu afla, si
     * comerciantul cauta greseala in reguli.
     *
     * Aceeasi familie cu `limite_pe_dos` de mai sus, si aceeasi treapta: critic.
     */
    if (nod.fel === "alegeri") {
      const cateActive = (nod.optiuni ?? []).filter(optiuneActiva).length;
      if (eNumarBun(nod.minAlese) && eNumarBun(nod.maxAlese) && nod.minAlese > nod.maxAlese) {
        adauga("critic", "alese_pe_dos",
          `„${nod.eticheta}": cere cel putin ${nod.minAlese} alegeri, dar nu mai mult de ${nod.maxAlese}.`, nod.id);
      }
      if (eNumarBun(nod.minAlese) && nod.minAlese > cateActive) {
        adauga("critic", "prea_putine_optiuni",
          `„${nod.eticheta}": cere cel putin ${nod.minAlese} alegeri, dar are doar ${cateActive} optiuni active.`,
          nod.id);
      }
      if (eNumarBun(nod.minAlese) && nod.minAlese < 0) {
        adauga("critic", "alese_negativ", `„${nod.eticheta}": numarul de alegeri nu poate fi negativ.`, nod.id);
      }
    }
    /*
     * ⚠ CAMPUL DE FISIERE SE PUBLICA, dar cu limitele lui verificate.
     *
     * Pana la F4 aici statea un refuz: slotul nu desena nodul, deci publicat ar fi fost INVIZIBIL
     * pe vitrina, iar daca era si obligatoriu produsul n-ar mai fi putut fi cumparat DELOC. Acum
     * se deseneaza, se incarca si se leaga de comanda.
     *
     * Ce se verifica acum e altceva, si e ce poate strica un camp bun:
     */
    if (nod.fel === "fisiere") {
      /*
       * ⚠ O CERINTA DE PIXELI PE UN CAMP DE DOCUMENTE nu se poate implini niciodata: un PDF n-are
       * latime in pixeli. Nu opreste nimic la incarcare (`motivulRefuzului` cere dimensiuni doar
       * cand s-au putut masura), dar ramane un numar scris care nu inseamna nimic — si
       * comerciantul crede ca a pus o conditie.
       */
      if (nod.control === "document" && (nod.minLatimePx || nod.minInaltimePx)) {
        adauga("atentie", "fisiere_pixeli_pe_document",
          `„${nod.eticheta}” cere o marime in pixeli, dar primeste documente. Un PDF n-are pixeli, deci conditia nu se aplica.`,
          nod.id);
      }
      /*
       * ⚠ Un `maxMb` peste plafonul platformei nu e o eroare, dar comerciantul trebuie sa afle:
       * el a scris 100 si primeste 25, iar altfel ar fi aflat de la primul cumparator refuzat.
       */
      if (Number(nod.maxMb) * 1024 * 1024 > MAX_OCTETI) {
        adauga("atentie", "fisiere_prea_mari",
          `La „${nod.eticheta}” se primesc cel mult ${Math.floor(MAX_OCTETI / (1024 * 1024))} MB, oricat ai scrie.`,
          nod.id);
      }
      if (Number(nod.maxFisiere) > MAX_FISIERE_PE_NOD) {
        adauga("atentie", "fisiere_prea_multe",
          `La „${nod.eticheta}” se pot incarca cel mult ${MAX_FISIERE_PE_NOD} fisiere, oricat ai scrie.`,
          nod.id);
      }
    }

    /*
     * ⚠ PREVIZUALIZAREA E CEL MAI USOR DE CONSTRUIT PE JUMATATE din tot builderul.
     *
     * Comerciantul aseaza zone tragand cu mausul, si fiecare din cele de mai jos arata pe ecranul
     * lui exact ca una care merge: zona sta acolo, se muta, se coloreaza. Doar ca pe magazin nu
     * deseneaza nimic — si el afla asta abia daca deschide chiar el pagina produsului.
     */
    if (nod.fel === "afisaj" && nod.control === "previzualizare") {
      const zone = nod.previzualizare?.zone ?? [];
      if (!nod.previzualizare?.imagine && zone.length > 0) {
        adauga("atentie", "previz_fara_imagine",
          `„${nod.eticheta}” are zone asezate, dar n-are poza de fundal, deci nu deseneaza nimic.`,
          nod.id);
      }
      const potFiDesenate = new Set(nodurileCareSePotDesena(d).map((n) => n.id));
      for (const z of zone.slice(0, MAX_ZONE)) {
        if (!z?.nod) continue;
        const tinta = noduri.find((n) => n.id === z.nod);
        if (!tinta) {
          adauga("critic", "previz_nod_lipsa",
            `„${nod.eticheta}” deseneaza un camp care nu mai exista (${z.nod}).`, nod.id);
        } else if (!potFiDesenate.has(tinta.id)) {
          /*
           * ⚠ `atentie`, nu `critic`: nu se vinde nimic gresit, doar nu se vede nimic. Iar
           * comerciantul poate sa fi schimbat felul campului dinadins si sa vrea sa scoata zona
           * mai tarziu — oprit din publicare, ar fi trebuit s-o stearga ca s-o refaca.
           */
          adauga("atentie", "previz_nod_nedesenabil",
            `„${nod.eticheta}” incearca sa deseneze „${tinta.eticheta}”, care n-are ce infatisa: `
            + "se pot desena doar campurile de text, de incarcare si alegerile cu esantion.",
            nod.id);
        }
      }
    }
    /*
     * ⚠ Culoarea CHIAR se valideaza aici, fiindca modelul promite ca se valideaza.
     *
     * `definitie.ts` scrie despre `Optiune.culoare` ca e „validata la publicare". Nu era: se citea
     * ca sir de cel mult 32 de caractere si ajungea de-a dreptul in `style={{ backgroundColor }}`.
     * Un sir care nu e o culoare nu strica nimic — browserul il ignora — dar pastila iese fara
     * culoare, iar comerciantul nu afla de ce. O promisiune scrisa in model si netinuta e mai rea
     * decat una nescrisa.
     */
    if (areOptiuni(nod)) {
      for (const o of nod.optiuni ?? []) {
        if (o.culoare !== undefined && !esteCuloare(o.culoare)) {
          adauga("atentie", "culoare_nevalida",
            `Optiunea „${o.eticheta}" din „${nod.eticheta}" are o culoare pe care browserul n-o va intelege.`,
            nod.id);
        }
      }
    }
  }

  /* ── Piesele consumate ──────────────────────────────────── */

  /*
   * ⚠ UN `componenta` STRICAT DISPARE IN TACERE, SI DE-AIA SE SPUNE AICI.
   *
   * `citeste.ts` arunca orice componenta al carei `bucati` nu e un numar finit si pozitiv — asa
   * se citeste `jsonb` peste tot in proiect, si e bine ca asa se citeste. Dar comerciantul care
   * scrie „doua” in loc de „2” vede campul salvat, publica linistit, si piesele nu se scad
   * niciodata: marfa pleaca din depozit fara ca vreo comanda sa arate ca a luat-o. Locul unde
   * tacerea aia se poate transforma intr-o propozitie pe ecranul lui e chiar aici.
   *
   * Se uita la ciorna din memorie, care N-A trecut prin `citeste.ts`; pe drumul publicarii, unde
   * a trecut, campul stricat e deja disparut si constatarea nu apare. Aceeasi impartire ca la
   * `grame_optiune_nevalid`, si din acelasi motiv.
   */
  for (const nod of noduri) {
    if (!areOptiuni(nod)) continue;
    for (const o of nod.optiuni ?? []) {
      if (componentaEStricata(o)) {
        adauga("critic", "componenta_nevalida",
          `Optiunea „${o.eticheta}” din „${nod.eticheta}” consuma o piesa, dar numarul de bucati nu e un numar pozitiv.`,
          nod.id);
      }
    }
  }

  /*
   * ⚠ O PIESA FANTOMA OPRESTE PUBLICAREA.
   *
   * Un `componenta.id` care nu mai are rand in `configurator_componente` — piesa stearsa, o
   * ciorna copiata din alt magazin, un id scris de mana — nu se poate rezolva la compilare.
   * Versiunea ar fi plecat cu `componenta` fara `produsId` si fara `pretBucata`, adica exact
   * defectul pe care fisierul asta il inchide: alegerea nu costa nimic si nu scade nimic. Iar
   * versiunile publicate sunt IMUTABILE, deci greseala nu s-ar mai fi putut repara in ea — numai
   * publicand alta, dupa ce cineva observa. Pana atunci, piesele plecau pe gratis.
   *
   * Se numeste OPTIUNEA, nu id-ul singur: un uuid pe ecran nu-i spune comerciantului unde sa se
   * uite.
   */
  if (intrare.componenteCunoscute) {
    const bune = new Set(intrare.componenteCunoscute);
    for (const t of trimiterileLaComponente(d)) {
      if (bune.has(t.componentaId)) continue;
      adauga("critic", "componenta_fantoma",
        `Optiunea „${t.optiuneEticheta}” din „${t.nodEticheta}” consuma o piesa care nu mai exista. `
        + "Alege alta piesa, sau scoate consumul de pe optiune.",
        t.nodId);
    }
  }

  /* ── Formule: referinte, marime, cicluri ─────────────────────────────── */

  const idNoduri = new Set(noduri.map((n) => n.id));
  const idCalcule = new Set(Object.keys(d.calcule ?? {}));
  const cunoscute = new Set([...idNoduri, ...idCalcule]);

  const formule: { unde: string; tinta: string; e: Parameters<typeof referinteleDin>[0] }[] = [];
  for (const [id, e] of Object.entries(d.calcule ?? {})) formule.push({ unde: `calculul „${id}"`, tinta: id, e });
  if (pretuire.formula) formule.push({ unde: "formula de pret", tinta: "pret", e: pretuire.formula });
  for (const m of pretuire.modificatori ?? []) {
    if (m.formula) formule.push({ unde: `modificatorul „${m.eticheta ?? m.id}"`, tinta: m.id, e: m.formula });
  }

  for (const f of formule) {
    for (const r of referinteleDin(f.e)) {
      if (!cunoscute.has(r)) {
        adauga("critic", "referinta_lipsa",
          `In ${f.unde} se foloseste ceva care nu mai exista (${r}).`, f.tinta);
      }
    }
    if (numaraNoduri(f.e) > MAX_NODURI_EXPR) {
      adauga("critic", "formula_prea_mare", `${f.unde} este prea complicata.`, f.tinta);
    }
    if (adancimea(f.e) > MAX_ADANCIME) {
      adauga("critic", "formula_prea_adanca", `${f.unde} are prea multe niveluri.`, f.tinta);
    }
  }

  for (const id of ciclurileDintreCalcule(d)) {
    adauga("critic", "ciclu_calcule",
      `Calculul „${id}" se cere pe sine, direct sau prin altele.`, id);
  }

  /* ── Reguli: tinte, si oscilatie ─────────────────────────────────────── */

  const idStructura = new Set<string>();
  for (const pas of d.pasi ?? []) {
    idStructura.add(pas.id);
    for (const g of pas.grupuri ?? []) idStructura.add(g.id);
  }
  const tinteBune = new Set([...idNoduri, ...idStructura]);

  for (const r of reguli ?? []) {
    for (const n of nodurileCerute(r.cand)) {
      if (!cunoscute.has(n)) {
        adauga("critic", "regula_conditie_lipsa",
          `O regula se uita la un camp care nu mai exista (${n}).`, r.id);
      }
    }

    /*
     * ⚠ SI OPTIUNEA PE CARE O NUMESTE, nu doar campul.
     *
     * Partea `atunci` era pazita de `regula_optiune_lipsa` inca de la inceput; partea `cand`,
     * deloc. Deci comerciantul care sterge optiunea „Stejar” publica linistit regula scrisa
     * pe ea — o vede in lista, arata intreaga, si nu se aprinde niciodata. Nimic nu cade, si
     * singurul semn e ca magazinul se poarta altfel decat scriu propriile lui reguli.
     *
     * ⚠ STEARSA e `critic`, STINSA e doar `atentie`, si deosebirea e a comerciantului, nu a
     * codului: pe cea stearsa nu poate hotari nimic, e o greseala oricum ai lua-o; pe cea
     * stinsa poate — poate a scos-o din vanzare pentru o luna si vrea sa se intoarca la ea, cu
     * tot cu regula scrisa pe ea.
     */
    for (const oc of optiunileCerute(r.cand)) {
      const nod = noduri.find((n) => n.id === oc.nod);
      if (!nod || !areOptiuni(nod)) continue;
      const optiune = (nod.optiuni ?? []).find((x) => x.id === oc.optiune);
      if (!optiune) {
        adauga("critic", "regula_conditie_optiune_lipsa",
          `O regula se uita la o optiune care nu mai exista in „${nod.eticheta}”.`, r.id);
      } else if (!optiuneActiva(optiune)) {
        adauga("atentie", "regula_conditie_optiune_stinsa",
          `O regula se aprinde pe „${optiune.eticheta}”, care e scoasa din vanzare: nu se va aprinde `
          + "niciodata.", r.id);
      }
    }
    for (const a of r.atunci ?? []) {
      if ("tinta" in a && a.tinta && !tinteBune.has(a.tinta)) {
        adauga("critic", "regula_tinta_lipsa",
          `O regula incearca sa schimbe ceva care nu mai exista (${a.tinta}).`, r.id);
      }
      if ((a.a === "doar_optiunile" || a.a === "fara_optiunile")) {
        const nod = noduri.find((n) => n.id === a.tinta);
        if (nod && areOptiuni(nod)) {
          for (const o of a.optiuni ?? []) {
            if (!(nod.optiuni ?? []).some((x) => x.id === o)) {
              adauga("critic", "regula_optiune_lipsa",
                `O regula trimite la o optiune care nu mai exista in „${nod.eticheta}".`, r.id);
            }
          }
        }
      }
    }
  }

  /* ── Proba adevarata: se ruleaza motorul pe configuratia implicita ───── */

  const implicit = configuratiaImplicita(d);
  const stare = aplicaRegulile(d, reguli ?? [], implicit);

  if (stare.neasezat) {
    adauga("critic", "reguli_oscileaza",
      "Regulile se bat cap in cap: aratand si ascunzand la nesfarsit, configuratorul nu ajunge "
      + "niciodata intr-o stare stabila.");
  }
  for (const conflict of stare.conflicte) {
    adauga("atentie", "conflict_reguli",
      `Doua reguli spun lucruri diferite despre „${conflict.tinta}"; a castigat `
      + `„${conflict.castigator}", fiindca e cea mai stransa.`, conflict.tinta);
  }

  const rezultatPret = calculeazaPretul({
    definitie: d, pretuire, stare, pretProdus: intrare.pretProdus ?? 0,
  });
  if (!rezultatPret.ok) {
    adauga("critic", `pret_${rezultatPret.cod}`,
      mesajPret(rezultatPret.cod), rezultatPret.id);
  }

  /* ── Limite si semne de sablon ───────────────────────────────────────── */

  if (eNumarBun(pretuire.minim) && eNumarBun(pretuire.maxim) && pretuire.minim > pretuire.maxim) {
    adauga("critic", "limite_pret_pe_dos", "Pretul minim este mai mare decat cel maxim.");
  }
  if (pretuire.rotunjire && (!eNumarBun(pretuire.rotunjire.pas) || pretuire.rotunjire.pas < 0)) {
    adauga("critic", "rotunjire_nevalida", "Pasul de rotunjire a pretului nu e un numar bun.");
  }

  /*
   * ⚠ Valorile de demonstratie ale sablonului NU au voie sa ajunga in vanzare.
   *
   * Un sablon porneste cu „89 lei/m²" ca sa se vada cum arata. Publicat asa, primul cumparator
   * plateste un numar pe care comerciantul nu l-a ales niciodata.
   */
  for (const marcaj of intrare.marcajeDemo ?? []) {
    adauga("critic", "valoare_demo",
      `„${marcaj}" a ramas cu valoarea din sablon. Pune-o pe a ta inainte de publicare.`, marcaj);
  }

  return { sePoatePublica: !c.some((x) => x.treapta === "critic"), constatari: c };
}

function mesajPret(cod: string): string {
  switch (cod) {
    case "impartire_la_zero": return "Formula de pret imparte la zero.";
    case "referinta_lipsa": return "Formula de pret foloseste ceva care nu mai exista.";
    case "ciclu": return "Formula de pret se cere pe sine.";
    case "pret_negativ": return "Pe configuratia implicita, pretul iese negativ.";
    case "limite_pe_dos": return "Pretul minim este mai mare decat cel maxim.";
    case "rezultat_nefinit": return "Formula de pret da un numar pe care nu-l putem folosi.";
    default: return "Pretul nu se poate calcula pe configuratia implicita.";
  }
}

/**
 * Calculele care se cer pe ele insele, direct sau prin altele.
 *
 * ⚠ Iterativ, cu culori: o definitie stricata n-are voie sa doboare stiva chiar in pasul care
 * incearca s-o refuze.
 */
export function ciclurileDintreCalcule(d: Definitie): string[] {
  const calcule = d.calcule ?? {};
  const ids = Object.keys(calcule);
  const stare = new Map<string, 0 | 1 | 2>(); // 0 neatins, 1 pe drum, 2 gata
  const gasite: string[] = [];

  for (const start of ids) {
    if (stare.get(start) === 2) continue;
    // Parcurgere in adancime, cu stiva proprie. `intra` marcheaza intrarea, `iese` iesirea.
    const stiva: { id: string; intra: boolean }[] = [{ id: start, intra: true }];
    while (stiva.length) {
      const pas = stiva.pop()!;
      if (!pas.intra) { stare.set(pas.id, 2); continue; }
      const s = stare.get(pas.id) ?? 0;
      if (s === 2) continue;
      if (s === 1) { if (!gasite.includes(pas.id)) gasite.push(pas.id); continue; }
      stare.set(pas.id, 1);
      stiva.push({ id: pas.id, intra: false });
      const e = calcule[pas.id];
      if (e) {
        for (const r of referinteleDin(e)) {
          if (calcule[r] !== undefined) stiva.push({ id: r, intra: true });
        }
      }
    }
  }
  return gasite;
}

/**
 * O culoare pe care browserul chiar o intelege.
 *
 * ⚠ Se primesc DOAR formele scurte si sigure: `#rgb`, `#rrggbb`, `#rrggbbaa` si numele CSS
 * scrise cu litere. Nu se primeste `rgb(...)`, `var(...)` sau orice altceva cu paranteze: valoarea
 * ajunge intr-un `style` pe vitrina, si o gramatica larga aici ar fi insemnat sa ne bizuim pe
 * felul in care fiecare browser repara un sir stricat.
 */
export function esteCuloare(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s || s.length > 32) return false;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return true;
  return /^[a-zA-Z]{3,20}$/.test(s);
}
