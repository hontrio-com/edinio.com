/**
 * Forma unei personalizari de produs, si cititorul ei.
 *
 * ═══ ⚠ DE CE UN MODUL PUR, SI DE CE AICI ═══
 *
 * Acelasi cod socoteste pretul in browser (ca sa se vada live) si pe server (ca sa se incaseze).
 * Doua implementari ar fi divergit la prima corectura, iar divergenta s-ar fi vazut ca „pe pagina
 * scria 910, pe factura 89" — adica exact felul de defect care se descopera de la un client
 * suparat, nu de la o proba.
 *
 * Deci: fara React, fara baza de date, fara `window`. Doar date in, date afara. Aceeasi hotarare
 * ca la `quantity-tiers.ts`, si din acelasi motiv.
 *
 * ═══ ⚠ CE E VECHI SI NU SE ATINGE ═══
 *
 * In productie exista 29 de produse cu personalizare, in 4 magazine, 49 de campuri din care 20
 * obligatorii. Tipurile folosite sunt DOAR `text`, `textarea` si `image` — masurat, nu presupus.
 * `select` si `color` exista in cod de mult si nu le foloseste nimeni.
 *
 * De aceea forma noua e un SUPERSET: cele noua chei de azi (`id`, `type`, `label`, `placeholder`,
 * `required`, `max_length`, `max_files`, `max_file_size_mb`, `helper_text`) raman exact cum sunt,
 * iar tot ce se adauga e optional. Un produs vechi se citeste fara sa fie resalvat si fara nicio
 * migratie.
 *
 * ⚠ SI DE ACEEA NU EXISTA `version`. N-a existat niciodata pe `page_sections`, iar un numar de
 * versiune adaugat acum ar fi lipsit de pe toate cele 29 — deci prima intrebare pusa despre el ar
 * fi fost „lipseste, ce inseamna?". Campurile se recunosc dupa `type`, care e obligatoriu si a
 * existat dintotdeauna.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFOANE
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ Datele astea sunt scrise de comerciant, dar se randeaza pe VITRINA si intra in socoteala
   pretului. Un `page_sections` scris de mana cu zece mii de campuri ar fi randat zece mii de
   controale pe pagina de produs. Plafoanele se aplica la CITIRE, deci si pe randurile care exista
   deja in baza, nu doar pe ce se salveaza de acum incolo. */

/** Campuri pe un produs. Cel mai incarcat produs din productie are 5. */
export const MAX_CAMPURI = 30;
/** Optiuni pe un camp de tip `butoane`. Peste atat nu mai e o alegere, e o lista. */
export const MAX_OPTIUNI = 40;
/** Cat poate scrie clientul intr-un camp de text, cand comerciantul n-a pus o limita. */
export const MAX_LUNGIME_TEXT = 2000;

/**
 * Cat poate cantari, in caractere, personalizarea UNEI LINII — toate campurile la un loc.
 *
 * ═══ ⚠ O SINGURA LIMITA, FIINDCA ERAU DOUA CARE NU SE STIAU ═══
 *
 * Cosul isi taia demult liniile peste 20.000 de caractere (`localStorage` e scris de client, iar o
 * personalizare de un megaoctet ar umfla fiecare cheie de linie si fiecare comparatie). Dar schema
 * ingaduia 30 de campuri × 2.000 de caractere = 60.000.
 *
 * Deci un comerciant putea configura ceva pe care pagina de produs il accepta, „Adauga in cos" il
 * accepta, `localStorage` il salveaza — si care DISPARE la prima reimprospatare, cand cosul se
 * reciteste. O contradictie de contract, nu un defect vizibil: nimic nu scartaia.
 *
 * ⚠ SE PLAFONEAZA LA SALVARE, nu se largeste cosul. Comerciantul afla cand configureaza, cu un
 * mesaj care spune ce sa taie — nu clientul, printr-o linie care se evapora.
 *
 * ⚠ Masurat in productie pe 07.09.2026, inainte de a pune plafonul: 71 de produse personalizabile
 * active, cu maximum 3 campuri, 500 de caractere si 5 fisiere. Cel mai greu payload real e sub
 * 1.500 de caractere — deci plafonul nu refuza nimic din ce exista, doar inchide o portita.
 */
export const MAX_PERSONALIZARE_LINIE = 20_000;
/** Cat de lunga poate fi o eticheta scrisa de comerciant, ca sa nu rupa randarea. */
export const MAX_ETICHETA = 200;

/**
 * Cati megaocteti primeste chiar ruta de incarcare, pe fel de continut.
 *
 * ⚠ CIFRELE ASTEA ERAU SCRISE DOAR IN RUTA, si panoul nu le stia. Comerciantul putea scrie 100
 * la „MB pe fisier", primea „Salvat", si clientul citea pe ecran „100 MB fiecare" — iar serverul
 * refuza la 40. Fisierul lui ERA sub 100 MB si formatul ERA bun, deci amandoua explicatiile pe
 * care i le dadea ecranul erau false, iar campul fiind obligatoriu nu mai avea ce sa incerce.
 * Comanda pierduta, fara nicio urma nici la comerciant.
 *
 * Sunt aici, si nu in ruta, fiindca de ele are nevoie si POARTA DE SALVARE, si TEXTUL din vitrina.
 * Ruta le importa de aici — o singura cifra pentru toate trei.
 */
export const MB_IMAGINE = 10;
/** ⚠ Documentele au plafonul lor: un PDF de tipar la un metru patrat trece lejer de 10 MB. */
export const MB_DOCUMENT = 40;

/** Cati megaocteti are voie sa ceara un camp, dupa tipul lui. */
export function megaoctetiiCampului(tip: string): number {
  return tip === "fisier" ? MB_DOCUMENT : MB_IMAGINE;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TIPURI
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cele cinci vechi, plus cele patru noi. Ordinea e cea din meniul panoului. */
/*
 * ⚠ `fisier` E UN TIP NOU, NU UN `image` LARGIT, si asta e hotararea care conteaza aici.
 *
 * Cele 29 de produse personalizabile din productie au deja campuri `image`, cu `accept`-ul lor
 * si cu miniaturi randate in vitrina, in panoul de comenzi si in emailuri. Largit `image` ca sa
 * primeasca si PDF, toate trei ar fi inceput sa incerce sa deseneze o miniatura pentru un document
 * — adica o poza rupta pe fiecare — si asta pe produse pe care nimeni nu le-a atins.
 *
 * Cu un tip separat, un camp de imagine ramane un camp de imagine, iar cine vrea fisier de tipar
 * il cere pe fata.
 */
export const TIPURI = [
  "text", "textarea", "image", "select", "color",
  "numar", "dimensiuni", "butoane", "comutator", "fisier",
] as const;

export type TipCamp = (typeof TIPURI)[number];

/**
 * Felul in care se deseneaza un camp cu alegeri sau un comutator.
 *
 * `butoane` si `comutator` sunt implicitele si raman cele de pana acum, deci produsele deja
 * configurate nu se schimba cu nimic.
 */
export const STILURI = ["butoane", "radio", "comutator", "bifa"] as const;
export type StilCamp = (typeof STILURI)[number];

/** Unitatile in care se scriu dimensiunile. Se socoteste mereu in metri. */
export const UNITATI = ["mm", "cm", "m"] as const;
export type Unitate = (typeof UNITATI)[number];

/**
 * Cum atarna un pret de o alegere.
 *
 * ⚠ TREI FELURI, SI ATAT. Fara procente, fara inmultiri, fara formule scrise de comerciant. Un
 * motor de expresii ar fi insemnat un configurator, si tocmai asta nu se cere aici.
 */
export type Impact =
  | { fel: "fara" }
  /** O suma care se adauga o data pe bucata. `+20 lei`. */
  | { fel: "fix"; suma: number }
  /** O suma inmultita cu suprafata facturata. `+15 lei/m²`. */
  | { fel: "pe_m2"; suma: number };

/** O optiune a unui camp `butoane`. Are id STABIL, spre deosebire de `select`-ul vechi. */
export interface OptiuneCamp {
  /**
   * ⚠ Identitatea optiunii, si NU eticheta.
   *
   * `select`-ul vechi tine optiunile ca siruri simple, deci acolo eticheta E identitatea: o
   * corectura de scriere („Premim" -> „Premium") face optiunea sa para alta. Aici nu se poate
   * intampla, fiindca pretul atarna de `id`.
   *
   * Vechiul `select` ramane neatins tocmai fiindca nu-l foloseste nimeni in productie — deci nu
   * exista date de migrat, si nici motiv sa stricam ce merge.
   */
  id: string;
  eticheta: string;
  impact?: Impact;
}

/** Marginile unei laturi, in unitatea campului. */
export interface Latura {
  min: number;
  max: number;
  implicit?: number;
  /**
   * Din cat in cat creste latura. Lipsa inseamna „orice numar din interval".
   *
   * ⚠ PE FIECARE LATURA, nu pe camp. Materialele vin pe role: latimea sare din 10 in 10 cm
   * fiindca aia e rola, iar inaltimea se taie oricat. Un singur pas pe tot campul l-ar fi impus
   * si acolo unde nu exista, iar comerciantul ar fi ales intre a minti pe o latura si a nu-l pune
   * deloc.
   */
  pas?: number;
}

export interface CampPersonalizare {
  id: string;
  type: TipCamp;
  label: string;
  required: boolean;
  placeholder?: string;
  helper_text?: string;

  /* — text / textarea — */
  max_length?: number;

  /* — image — */
  max_files?: number;
  max_file_size_mb?: number;

  /* — select (vechi) — */
  options?: string[];

  /* — color (vechi) — */
  default_color?: string;

  /* — numar — */
  min?: number;
  max?: number;
  pas?: number;
  implicit?: number;
  /** Se arata langa camp: „cm", „kg", „buc". Doar text, nu intra in socoteala. */
  unitate_text?: string;

  /* — dimensiuni — */
  latime?: Latura;
  inaltime?: Latura;
  unitate?: Unitate;

  /* — butoane — */
  optiuni?: OptiuneCamp[];

  /**
   * Cum se DESENEAZA campul. Nu schimba nimic altceva: nici pretul, nici validarea, nici
   * instantaneul comenzii.
   *
   * ═══ ⚠ DE CE UN STIL, SI NU DOUA TIPURI NOI ═══
   *
   * Specificatia cerea si `radio`, si `checkbox`. Dar `radio` e vizual acelasi lucru cu `butoane`
   * (o alegere din mai multe, si chiar asa il anunta si cititorului de ecran: `role="radiogroup"`),
   * iar `checkbox` acelasi lucru cu `comutator` (pornit / stins).
   *
   * Tipuri noi ar fi insemnat inca doua ramuri in FIECARE loc care se uita la `type`: pretuirea,
   * validarea de salvare, greutatea maxima, poarta comenzii, rezumatul din cos, instantaneul,
   * emailul, panoul. Opt locuri care trebuie sa ramana in sincron, pentru o deosebire care e numai
   * de desen — si fiecare dintre ele o cale pe care un tip nou e uitat si cade tacut pe `default`.
   *
   * ⚠ Deci deosebirea sta unde e cu adevarat: la randare.
   */
  stil?: StilCamp;

  /**
   * Pretul cand campul e COMPLETAT (text/textarea/image) sau PORNIT (comutator).
   *
   * ⚠ Nu se aplica la `butoane` si `select`: acolo pretul sta pe optiunea aleasa.
   */
  impact?: Impact;
}

/** Cat se rotunjeste in SUS suprafata facturata. `0` = deloc. */
export const ROTUNJIRI = [0, 0.01, 0.1, 0.5, 1] as const;
export type Rotunjire = (typeof ROTUNJIRI)[number];

/**
 * Cum se socoteste pretul personalizarii.
 *
 * ═══ ⚠ DOUA MODURI, SI DE CE AL DOILEA EXISTA ═══
 *
 * `adaugat` e ce se intampla azi, plus suplimente: pretul din catalog ramane baza si se aduna
 * peste el. Bun pentru o gravura de 20 de lei pe o cana de 89.
 *
 * `suprafata` e pentru fototapete, bannere, panouri: acolo pretul de catalog nu inseamna nimic
 * singur — produsul se vinde la metru patrat. De aceea `includePretulProdusului` e o hotarare
 * explicita, si nu implicita: la un fototapet trebuie sa fie STINSA, altfel clientul plateste si
 * un pret de baza care nu corespunde niciunei bucati de marfa.
 */
export type ModPret =
  | { fel: "adaugat" }
  | {
      fel: "suprafata";
      /** `id`-ul campului `dimensiuni` din care se socoteste suprafata. */
      campDimensiuni: string;
      /** Tariful de baza, lei/m², cand niciun camp nu-l suprascrie. */
      tarif: number;
      /** `id`-ul unui camp `butoane` ale carui optiuni dau tariful (Standard 69 / Premium 89). */
      campTarif?: string;
      includePretulProdusului: boolean;
      /** Suprafata minima facturabila, in m². Sub ea se factureaza atat. */
      minimM2?: number;
      rotunjire?: Rotunjire;
    };

export interface DefinitiePersonalizare {
  enabled: boolean;
  fields: CampPersonalizare[];
  /** Lipsa inseamna `{ fel: "adaugat" }` — adica purtarea de dinainte de preturi. */
  pret?: ModPret;
  /**
   * Se pun numere („1.", „2.") in fata campurilor pe pagina de produs?
   *
   * ⚠ LIPSA INSEAMNA „DA": asa arata toate produsele configurate pana acum, si nu se schimba
   * niciunul. Numai un `false` scris limpede stinge numerotarea.
   */
  numeroteaza?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CITITORUL
   ═══════════════════════════════════════════════════════════════════════════ */

function esteObiect(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Un numar finit, sau `undefined`. ⚠ `Number("")` e 0, deci sirul gol se refuza pe fata. */
function numar(x: unknown): number | undefined {
  if (x === null || x === undefined || x === "") return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/** Un numar finit si nenegativ, pentru sume de bani. */
function suma(x: unknown): number | undefined {
  const n = numar(x);
  return n !== undefined && n >= 0 ? n : undefined;
}

function text(x: unknown, maxim: number): string {
  return typeof x === "string" ? x.slice(0, maxim) : "";
}

/**
 * Impactul de pret al unei alegeri.
 *
 * ⚠ Ce nu se intelege devine „fara", nu zero-cu-fel-pastrat: un `{ fel: "fix" }` fara suma ar fi
 * fost afisat pe vitrina ca „+0 lei", adica o promisiune ca alegerea costa ceva.
 *
 * ⚠ SUMELE NEGATIVE SE REFUZA. O reducere pe optiune pare inofensiva, dar cu doua-trei optiuni
 * negative pretul liniei poate cobori sub zero, iar de acolo incolo fiecare socoteala din
 * platforma (TVA, prag de transport, ramburs) primeste un numar in care nu crede. Cand se va cere
 * o reducere, se face explicit, cu plafon.
 */
export function citesteImpact(raw: unknown): Impact {
  if (!esteObiect(raw)) return { fel: "fara" };
  const s = suma(raw.suma);
  if (raw.fel === "fix" && s !== undefined) return { fel: "fix", suma: s };
  if (raw.fel === "pe_m2" && s !== undefined) return { fel: "pe_m2", suma: s };
  return { fel: "fara" };
}

/**
 * Cum arata o latura dupa ce comerciantul atinge O casuta din panou.
 *
 * ═══ ⚠ DE CE E AICI, SI NU IN COMPONENTA ═══
 *
 * Fiindca greseala a fost tocmai in reducerul din panou, si acolo nu se putea proba: nicio
 * componenta React nu se randeaza intr-o proba a proiectului. Mutata aici, regula se confrunta cu
 * secventele reale de tastare.
 *
 * ⚠ CE FACEA FORMA VECHE. Ea punea `min: 0` si `max: 0` ori de cate ori se atingea ORICE
 * casuta, iar `citesteLatura` arunca toata latura cand `min` nu e mai mare ca zero. Deci:
 *
 *     completezi DOAR „max"        -> {min:0, max:500}        -> se serveste NIMIC
 *     completezi DOAR „pas"        -> {min:0, max:0, pas:10}  -> se serveste NIMIC
 *     scrii min, apoi il stergi    -> zerourile raman         -> se serveste NIMIC
 *
 * Al doilea e cel mai scump, fiindca nu cere nicio greseala: caseta „pas" are chiar placeholderul
 * „oricat", iar pasul exista fiindca materialele vin pe role. Comerciantul completeaza exact caseta
 * aia, primeste „Salvat", si regula rolei nu exista. Clientul comanda 137 cm, si atelierul taie o
 * rola degeaba.
 *
 * ⚠ O casuta GOLITA sterge cheia, nu o pastreaza cu `undefined`: pastrata, ea ar fi trecut mai
 * departe ca „am pus ceva acolo" si ar fi produs aceleasi margini fantoma.
 */
export function laturaSchimbata(
  acum: Record<string, number> | undefined,
  cheie: "min" | "max" | "implicit" | "pas",
  valoare: number | undefined,
): Record<string, number> | undefined {
  const urm: Record<string, number> = { ...(acum ?? {}) };
  if (valoare === undefined) delete urm[cheie];
  else urm[cheie] = valoare;
  return Object.keys(urm).length > 0 ? urm : undefined;
}

/**
 * E `valoare` un multiplu al pasului?
 *
 * ⚠ O SINGURA REGULA, si de-aia sta aici. Ea raspunde la doua intrebari care trebuie sa aiba
 * acelasi raspuns: „valoarea trimisa de client e pe pas?" (in `valori.ts`, la comanda) si
 * „implicitul pus de comerciant e pe pas?" (chiar aici, la citire). Scrise separat, prima
 * nepotrivire ar fi fost o casuta preumpluta cu ceva ce propria validare refuza.
 *
 * ⚠ Toleranta nu e cochetarie: `0.3 / 0.1` da 2,9999999999999996 in virgula mobila, deci o
 * comparatie exacta ar fi refuzat chiar valorile pe care comerciantul le-a scris cu mana.
 */
export function pePas(valoare: number, pas: number): boolean {
  if (!(pas > 0)) return true;
  const raport = valoare / pas;
  return Math.abs(raport - Math.round(raport)) < 1e-6;
}

function citesteLatura(raw: unknown): Latura | undefined {
  if (!esteObiect(raw)) return undefined;
  const min = numar(raw.min);
  const max = numar(raw.max);
  if (min === undefined || max === undefined) return undefined;
  /*
   * ⚠ Marginile trebuie sa aiba sens ca interval, altfel campul nu se poate completa DELOC: cu
   * `min > max` nicio valoare nu trece validarea, iar clientul ramane blocat pe un camp
   * obligatoriu, fara sa inteleaga de ce. Se arunca latura, si campul se poarta ca nemarginit.
   */
  if (!(min > 0) || !(max >= min)) return undefined;
  const implicit = numar(raw.implicit);
  /* Un pas care nu e pozitiv n-ar putea fi respectat de nicio valoare: se arunca, nu se pastreaza. */
  const pas = numar(raw.pas);
  const pasBun = pas !== undefined && pas > 0 ? pas : undefined;
  return {
    min, max,
    /* ⚠ Implicitul trece prin ACELEASI reguli ca valoarea clientului — vezi ramura „numar". */
    ...(implicit !== undefined && implicit >= min && implicit <= max
      && (pasBun === undefined || pePas(implicit - min, pasBun))
      ? { implicit } : {}),
    ...(pasBun !== undefined ? { pas: pasBun } : {}),
  };
}

function citesteOptiuni(raw: unknown): OptiuneCamp[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const vazute = new Set<string>();
  const out: OptiuneCamp[] = [];
  for (const o of raw) {
    if (out.length >= MAX_OPTIUNI) break;
    if (!esteObiect(o)) continue;
    const id = text(o.id, 64).trim();
    /*
     * ⚠ Fara `id` optiunea se ARUNCA, nu se numeroteaza dupa pozitie. Un id dedus din index s-ar
     * fi mutat cand comerciantul reordoneaza butoanele, iar pretul ar fi trecut tacut de pe
     * „Premium" pe „Standard" — pe comenzile deja plasate.
     */
    if (!id || vazute.has(id)) continue;
    vazute.add(id);
    out.push({
      id,
      eticheta: text(o.eticheta, MAX_ETICHETA),
      ...(o.impact !== undefined ? { impact: citesteImpact(o.impact) } : {}),
    });
  }
  return out.length ? out : undefined;
}

function citesteCamp(raw: unknown): CampPersonalizare | null {
  if (!esteObiect(raw)) return null;
  const id = text(raw.id, 64).trim();
  const tip = raw.type;
  if (!id || typeof tip !== "string" || !(TIPURI as readonly string[]).includes(tip)) return null;
  const type = tip as TipCamp;

  const camp: CampPersonalizare = {
    id,
    type,
    label: text(raw.label, MAX_ETICHETA),
    required: raw.required === true,
  };

  const placeholder = text(raw.placeholder, MAX_ETICHETA);
  if (placeholder) camp.placeholder = placeholder;
  const helper = text(raw.helper_text, MAX_ETICHETA * 2);
  if (helper) camp.helper_text = helper;

  /* — cele vechi, exact cum erau — */
  if (type === "text" || type === "textarea") {
    const ml = numar(raw.max_length);
    if (ml !== undefined && ml > 0) camp.max_length = Math.min(Math.floor(ml), MAX_LUNGIME_TEXT);
  }
  if (type === "image" || type === "fisier") {
    const mf = numar(raw.max_files);
    if (mf !== undefined && mf > 0) camp.max_files = Math.floor(mf);
    const ms = numar(raw.max_file_size_mb);
    if (ms !== undefined && ms > 0) camp.max_file_size_mb = ms;
  }
  if (type === "select") {
    const o = Array.isArray(raw.options)
      ? raw.options.filter((x): x is string => typeof x === "string").slice(0, MAX_OPTIUNI)
      : [];
    if (o.length) camp.options = o;
  }
  if (type === "color") {
    const c = text(raw.default_color, 32);
    if (c) camp.default_color = c;
  }

  /* — cele noi — */
  if (type === "numar") {
    const min = numar(raw.min);
    const max = numar(raw.max);
    /*
     * ⚠ ACEEASI REGULA CA LA `citesteLatura`, si din acelasi motiv — doar ca aici lipsea.
     *
     * Cu `min > max` nicio valoare nu trece validarea: clientul ramane blocat pe un camp
     * obligatoriu pe care nu-l poate completa CU NIMIC, iar butonul „Comanda" nu deschide nimic,
     * la infinit. Trafic si zero comenzi, fara niciun indiciu nicaieri.
     *
     * Se arunca AMANDOUA marginile, nu una: pastrata singura, cealalta ar fi taiat tacut jumatate
     * din intervalul pe care comerciantul credea ca l-a pus.
     */
    if (min !== undefined && max !== undefined && min > max) {
      /* margini fara sens ca interval: se arunca, campul ramane nemarginit */
    } else {
      if (min !== undefined) camp.min = min;
      if (max !== undefined) camp.max = max;
    }
    const pas = numar(raw.pas); if (pas !== undefined && pas > 0) camp.pas = pas;
    /*
     * ⚠ SI VALOAREA IMPLICITA TREBUIE SA TREACA DE PROPRIA VALIDARE.
     *
     * Preumpluta cu ceva ce validarea refuza, casuta arata clientului o valoare care pica la
     * prima apasare — pe un camp pe care el nu l-a atins. Se pastreaza doar daca e in interval SI
     * pe pas, masurat de la minim, exact ca in `valori.ts`.
     */
    const imp = numar(raw.implicit);
    if (
      imp !== undefined
      && (camp.min === undefined || imp >= camp.min)
      && (camp.max === undefined || imp <= camp.max)
      && (camp.pas === undefined || pePas(imp - (camp.min ?? 0), camp.pas))
    ) camp.implicit = imp;
    const u = text(raw.unitate_text, 12); if (u) camp.unitate_text = u;
  }
  if (type === "dimensiuni") {
    const l = citesteLatura(raw.latime); if (l) camp.latime = l;
    const i = citesteLatura(raw.inaltime); if (i) camp.inaltime = i;
    camp.unitate = (UNITATI as readonly string[]).includes(String(raw.unitate))
      ? (raw.unitate as Unitate)
      : "cm";
  }
  if (type === "butoane") {
    const o = citesteOptiuni(raw.optiuni); if (o) camp.optiuni = o;
  }
  /*
   * ⚠ Pretul pe CAMP se citeste doar acolo unde are un inteles: la `butoane` si `select` alegerea
   * e o optiune, deci pretul sta pe ea. Citit si aici, un comerciant ar fi putut pune si un pret
   * pe camp, si unul pe optiune, iar ce se incaseaza n-ar mai fi fost limpede din ecran.
   */
  if (type !== "butoane" && type !== "select" && raw.impact !== undefined) {
    camp.impact = citesteImpact(raw.impact);
  }

  /*
   * ⚠ STILUL SE CITESTE DOAR UNDE ARE INTELES, si numai valorile potrivite tipului.
   *
   * `radio` pe un camp de text n-ar insemna nimic, iar `bifa` pe `butoane` ar fi desenat un
   * comutator peste o lista de optiuni. Un stil nepotrivit se ARUNCA — campul cade pe desenul lui
   * obisnuit, care merge intotdeauna.
   */
  const stiluriPermise: Partial<Record<TipCamp, readonly StilCamp[]>> = {
    butoane: ["butoane", "radio"],
    select: ["butoane", "radio"],
    comutator: ["comutator", "bifa"],
  };
  const permise = stiluriPermise[type];
  if (permise && typeof raw.stil === "string" && (permise as readonly string[]).includes(raw.stil)) {
    camp.stil = raw.stil as StilCamp;
  }

  return camp;
}

function citestePret(raw: unknown, campuri: CampPersonalizare[]): ModPret | undefined {
  if (!esteObiect(raw)) return undefined;
  if (raw.fel !== "suprafata") return { fel: "adaugat" };

  const campDimensiuni = text(raw.campDimensiuni, 64).trim();
  const tarif = suma(raw.tarif);
  /*
   * ⚠ Modul „suprafata" CADE INAPOI pe „adaugat" daca ii lipseste temelia: fara un camp de
   * dimensiuni care chiar exista si e de tipul bun, nu se poate socoti nicio suprafata, iar un
   * pret pe m² fara m² ar fi fost zero — adica marfa data pe gratis. Purtarea de rezerva e
   * pretul de catalog, care e mereu vandabil.
   */
  const dim = campuri.find((c) => c.id === campDimensiuni && c.type === "dimensiuni");
  if (!dim || tarif === undefined) return { fel: "adaugat" };

  const campTarif = text(raw.campTarif, 64).trim();
  const sursa = campuri.find((c) => c.id === campTarif && c.type === "butoane");

  /*
   * ⚠ NU SE POATE AJUNGE LA ZERO LEI. Trei conditii, si toate trei au fost masurate ca gauri.
   *
   * Cu baza STINSA, tot pretul vine din suprafata. Deci daca suprafata sau tariful pot lipsi,
   * pretul iese 0 — si nimic nu se plange: valorile sunt „valide", calculul da zero, comanda
   * pleaca. Probat inainte de reparatie: camp de dimensiuni NEobligatoriu + tarif 0 + baza stinsa
   * = produs vandut la 0 lei, cu `ok: true`.
   *
   *   1. Un tarif de zero nu e o configurare, e una neterminata: tariful trebuie sa fie > 0, fie
   *      cel de baza, fie de pe FIECARE optiune a sursei.
   *   2. Campul de dimensiuni devine OBLIGATORIU. Fara valori nu exista suprafata, deci nici pret.
   *   3. Ce nu trece cade inapoi pe „adaugat" — pretul de catalog, care e mereu vandabil.
   *
   * ⚠ Se apara la CITIRE, nu doar in panou: aici trec si randurile scrise inainte de reparatie,
   * si orice ar ajunge in `page_sections` pe alt drum.
   */
  const tarifeSursa = sursa
    ? (sursa.optiuni ?? []).map((o) => (o.impact?.fel === "pe_m2" ? o.impact.suma : tarif))
    : [];
  const totTarifulEBun = sursa
    ? tarifeSursa.length > 0 && tarifeSursa.every((t) => t > 0)
    : tarif > 0;
  if (!totTarifulEBun) return { fel: "adaugat" };

  /*
   * ⚠ A PATRA CONDITIE: o optiune de tarif cu pret FIX nu se incaseaza deloc.
   *
   * `pretulPersonalizarii` sare campul-sursa din bucla de suplimente (el e socotit sus, ca tarif),
   * iar acolo citeste doar `pe_m2`. Deci o optiune careia comerciantul i-a pus „+15 lei" fix nu
   * aduce nici cei 15 lei, nici nu schimba tariful: se incaseaza tariful de baza, tacut. Nu e zero,
   * dar e alt numar decat cel din ecranul comerciantului — iar pe „adaugat" suma aia CHIAR se
   * incaseaza, deci caderea repara si greseala.
   */
  const sursaAreFix = sursa ? (sursa.optiuni ?? []).some((o) => o.impact?.fel === "fix") : false;
  if (sursaAreFix) return { fel: "adaugat" };

  /*
   * ⚠ A CINCEA: laturi NEMARGINITE fara suprafata minima facturabila.
   *
   * `citesteLatura` intoarce marginile doar in pereche, deci o latura ori are `min` si `max`, ori
   * lipseste cu totul — iar lipsa inseamna „orice pana la `MAX_LATURA_M`". Cu baza stinsa, un
   * fototapet comandat 1x1 cm face 0,0001 m² x 89 = 0,01 lei. Comanda pleaca, e „valida", si
   * atelierul primeste o cerere de un centimetru patrat platita cu un ban.
   *
   * Ori se stiu marginile, ori exista o suprafata minima facturabila care ridica orice comanda la
   * ea. Fara niciuna, nu exista pret de jos, deci nu exista mod „suprafata".
   */
  const minim = suma(raw.minimM2);
  const areMargini = !!(dim.latime && dim.inaltime);
  if (!areMargini && !(minim !== undefined && minim > 0)) return { fel: "adaugat" };

  dim.required = true;
  /*
   * ⚠ SI CAMPUL-SURSA DEVINE OBLIGATORIU, din acelasi motiv ca dimensiunile.
   *
   * Asta e drumul pe care l-a gasit auditul, si e chiar cel pe care il recomanda panoul:
   * comerciantul pune tarifele PE OPTIUNI (Standard 69 / Premium 89) si lasa caseta „Tarif lei/m²"
   * pe 0, fiindca n-are ce scrie acolo. Campul „Material" ramane optional, fiindca panoul creeaza
   * campurile optionale. Clientul scrie 350x250 cm, NU apasa niciun buton de material — nu e
   * obligat, si nimic nu e preselectat — iar `impactulAles` intoarce `undefined`, deci
   * `tarifM2` cade pe tariful de baza: ZERO. Cu baza stinsa, comanda pleaca la 0 lei, cu
   * `ok: true` si fara nicio constatare.
   *
   * Fara alegere nu exista tarif, exact cum fara dimensiuni nu exista suprafata.
   */
  if (sursa) sursa.required = true;

  const rot = numar(raw.rotunjire);

  return {
    fel: "suprafata",
    campDimensiuni,
    tarif,
    ...(sursa ? { campTarif } : {}),
    includePretulProdusului: raw.includePretulProdusului === true,
    ...(minim !== undefined && minim > 0 ? { minimM2: minim } : {}),
    ...(rot !== undefined && (ROTUNJIRI as readonly number[]).includes(rot)
      ? { rotunjire: rot as Rotunjire }
      : {}),
  };
}

/**
 * Citeste `page_sections.customization` si intoarce forma pe care se poate lucra.
 *
 * ⚠ `null` cand personalizarea e stinsa sau n-are niciun camp bun — acelasi verdict pe care il da
 * azi `cerePersonalizare`, ca sa nu existe doua raspunsuri la aceeasi intrebare.
 *
 * ⚠ NU ARUNCA NICIODATA. E chemata si pe calea comenzii, unde o exceptie ar fi oprit o vanzare
 * pentru un `page_sections` scris strambe. Ce nu se intelege se arunca; ce ramane e bun.
 */
export function normalizeazaDefinitia(raw: unknown): DefinitiePersonalizare | null {
  const c = esteObiect(raw) ? raw : null;
  if (!c || c.enabled !== true || !Array.isArray(c.fields)) return null;

  const vazute = new Set<string>();
  const fields: CampPersonalizare[] = [];
  for (const f of c.fields) {
    if (fields.length >= MAX_CAMPURI) break;
    const camp = citesteCamp(f);
    /*
     * ⚠ Id-urile duplicate se arunca. Valorile clientului se cheiesc pe `id`, deci doua campuri cu
     * acelasi id ar fi impartit o singura valoare: omul completeaza al doilea camp si vede cum se
     * schimba primul.
     */
    if (!camp || vazute.has(camp.id)) continue;
    vazute.add(camp.id);
    fields.push(camp);
  }
  if (!fields.length) return null;

  const pret = citestePret(c.pret, fields);
  /*
   * ⚠ NUMEROTAREA E O ALEGERE A COMERCIANTULUI, si pana pe 07.09.2026 nu era.
   *
   * Vitrina stia sa deseneze si cu numar, si fara — `CampuriPersonalizare` are de mult prop-ul
   * `numeroteaza` — dar nimeni nu-l putea schimba: era fixat pe `true` la fiecare chemare. O
   * capabilitate pe care panoul n-o ofera e o capabilitate care nu exista.
   *
   * ⚠ LIPSA INSEAMNA „DA", ca produsele deja configurate sa arate exact cum arata acum.
   */
  const numeroteaza = c.numeroteaza === false ? { numeroteaza: false } : {};
  return { enabled: true, fields, ...(pret ? { pret } : {}), ...numeroteaza };
}

/**
 * Are produsul asta o personalizare care se serveste?
 *
 * ⚠ Trece prin acelasi cititor ca restul, ca sa nu existe un al doilea raspuns: un camp pe care
 * cititorul il arunca (fara `id`, cu `type` necunoscut) nu trebuie sa faca produsul „personalizabil"
 * pe carduri si sa ascunda butonul de cos pentru un formular care iese gol.
 *
 * ⚠ SI RASPUNDE SI PE FORMA SLIMUITA. Pe suprafetele de catalog — acasa, magazin, cautare,
 * categorii — `page_sections` ajunge in browser taiat de `slimPageSections`, care pastreaza doar
 * ce deseneaza lista. Campurile NU se trimit acolo, dinadins: un catalog de o mie de produse ar fi
 * purtat degeaba etichetele, optiunile si preturile lor.
 *
 * Deci slimuirea lasa in loc un steag, `{ cere: true }`, si el se citeste aici. Fara ramura asta,
 * intrebarea „cere personalizare?" ar fi raspuns „nu" pe TOATE cardurile — si tocmai de acolo
 * veneau drumurile prin care un produs personalizabil ajungea in cos la pretul de baza.
 */
export function cerePersonalizarea(pageSections: unknown): boolean {
  const ps = esteObiect(pageSections) ? pageSections : null;
  const c = ps?.customization;
  if (esteObiect(c) && c.cere === true) return true;
  return normalizeazaDefinitia(c) !== null;
}
