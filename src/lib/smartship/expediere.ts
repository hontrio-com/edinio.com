import { normalizePhone } from "@/lib/utils/phone";
import type {
  AdresaSmartship, ColetSmartship, ContinutSmartship, CorpAwb, CorpComun, CorpCost,
  ExpeditorSmartship, SmartshipConfig,
} from "./client";
import { esteInBucuresti } from "./localitati";

/**
 * Construirea cererii SmartShip dintr-o comanda Edinio.
 *
 * ═══ ⚠ UN SINGUR CONSTRUCTOR PENTRU COTARE SI PENTRU EMITERE ═══
 *
 * `POST /cost` si `POST /awb/new` primesc ACELEASI trei obiecte — `sender`,
 * `recipient`, `content` — si se deosebesc doar prin invelisul lor. Construite
 * separat, cele doua se pot departa una de alta fara ca nimic sa se planga, iar
 * atunci comanda pleaca pe alt pret decat cel cotat si diferenta o suporta
 * comerciantul. Aceeasi hotarare ca la eColet si Innoship, si din aceeasi lectie.
 *
 * ⚠ Deosebirile sunt trei, si toate stau in locuri DIFERITE ale cererii:
 *
 *   la cotare:  `content.curier_preferat`   +  `show_byoc`        (nivel principal)
 *   la emitere: `courier_id` (nivel principal) + `use_own_contract` (nivel principal)
 *
 * Documentatia o spune de doua ori, cu majuscule pe „NU": „Se trimite la nivelul
 * principal al cererii, NU in content". Un `use_own_contract` ratacit in `content`
 * n-ar da nicio eroare — ar emite tacut pe contractul SmartShip, la tariful lor,
 * pentru un comerciant care credea ca emite pe al lui.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza. SmartShip NU are mediu de proba si
 * NU are endpoint de validare (spre deosebire de Innoship, cu `/validate` si
 * `/simulate`, sau de Packeta, cu `packetAttributesValid`). Deci fiecare greseala
 * de constructie se plateste cu o cerere reala — iar probele de mai jos sunt
 * singura verificare care se poate face inainte de prima cheie de cont.
 */

export type AdresaComanda = {
  nume: string;
  companie?: string | null;
  strada: string;
  numar?: string | null;
  bloc?: string | null;
  scara?: string | null;
  etaj?: string | null;
  apartament?: string | null;
  oras: string;
  judet?: string | null;
  codPostal?: string | null;
  telefon?: string | null;
  email?: string | null;
  /** Id-ul localitatii, rezolvat din nomenclator. Vezi `geo.ts`. */
  cityId?: number | null;
  /** 0 in afara Bucurestiului, 1-6 in Bucuresti, `null` cand nu se stie. */
  sector?: number | null;
};

export type FelLivrare = "domiciliu" | "locker";

export type DateExpediere = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string | null;
  ramburs?: number;
  valoareDeclarata?: number;
  numarColete?: number;
  /** Colete cu dimensiuni diferite. Prezente, au prioritate fata de cele simple. */
  colete?: ColetSmartship[] | null;
  felLivrare: FelLivrare;
  /** Lockerul ales de cumparator. Obligatoriu la `felLivrare: "locker"`. */
  lockerId?: number | string | null;
  /** Referinta noastra: se regaseste cu `GET /awb/order_id/{order_id}`. */
  orderId?: string | null;
  /** Curierul ales. La COTARE ramane gol — atunci raspund cu toti. */
  courierId?: number | null;
  /** Oferta aleasa era pe contractul comerciantului? Vezi `courierDeEmis`. */
  contractPropriu?: boolean;
  /** Colet la schimb. Doar la emitere, si doar la curierii 14 si 16. */
  laSchimb?: boolean;
  /** Nota tiparita pe eticheta. Doar DPD. */
  notaDpd?: string | null;
};

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Plafoanele.
 *
 * ⚠ Doar `dpd_shipment_note` e AL LOR (documentat: „Maxim 200 de caractere").
 * Celelalte doua sunt ALE NOASTRE si sunt taieri, nu refuzuri: documentatia nu
 * declara nicio lungime, iar un plafon inventat care OPRESTE expedierea ar fi mai
 * rau decat unul care taie. Se taie cu avertisment, ca omul sa afle.
 */
export const LUNGIMI = {
  /** Al LOR. */
  notaDpd: 200,
  /** Al NOSTRU: textul de pe AWB. */
  continut: 255,
  /** Al NOSTRU: adresa pe un rand. */
  adresa: 255,
} as const;

/** Greutatea minima trimisa. Aceeasi cu cea din `lib/shipping/awb-weight.ts`. */
export const GREUTATE_MINIMA_KG = 0.1;

/**
 * Dimensiunile implicite, in CENTIMETRI.
 *
 * Sunt chiar cele din exemplul lor (30x20x10). ⚠ Nu sunt decor: facturarea
 * foloseste maximul dintre greutatea fizica si cea VOLUMETRICA (L×l×h / 6000),
 * deci niste dimensiuni prea mari scumpesc fiecare colet al magazinului.
 */
export const DIMENSIUNI_IMPLICITE = { lungime: 30, latime: 20, inaltime: 10 } as const;

/**
 * Curierii care accepta colet la schimb (`swap`).
 *
 * ⚠ Lista e a LOR si e scurta: PTT Express (14) si SmartShip Delivery (16); pe
 * contract propriu, doar 14. Ceilalti resping cererea cu 699 — deci se verifica
 * local, ca omul sa nu afle abia dupa un drum dus-intors.
 */
export const CURIERI_LA_SCHIMB = { oricare: [14, 16], contractPropriu: [14] } as const;

/**
 * ⚠ easybox pe CONTRACT PROPRIU nu e curier separat.
 *
 * Codul 4004 e chiar despre asta: „ai trimis courier_id: 12 (easybox) cu
 * use_own_contract: 1. Pe contract propriu easybox nu e un curier separat — emite
 * cu courier_id: 2 (SameDay) si locker_id."
 *
 * Traducerea se face INTR-UN SINGUR LOC, aici. Imprastiata prin apelanti, unul
 * din ei ar fi uitat-o si lotul ar fi cazut pe 4004 pentru jumatate din comenzi.
 */
export const CURIER_EASYBOX = 12;
export const CURIER_SAMEDAY = 2;
/** FANbox merge NUMAI pe contract propriu, cu FanCourier. */
export const CURIER_FANCOURIER = 3;

export function courierDeEmis(courierId: number, contractPropriu: boolean): number {
  if (contractPropriu && courierId === CURIER_EASYBOX) return CURIER_SAMEDAY;
  return courierId;
}

// ─── Validari care se pot face fara sa atingem furnizorul ─────────────────────

/**
 * ⚠ „Minim doua cuvinte" e regula LOR, scrisa in tabelul campurilor.
 *
 * Un client care si-a trecut doar prenumele trece de checkout-ul nostru si cade
 * la SmartShip cu 999. Verificat aici, comerciantul vede exact ce sa completeze.
 */
export function numeleAreDouaCuvinte(nume: string | null | undefined): boolean {
  return curata(nume).split(" ").filter((c) => c.length > 0).length >= 2;
}

/**
 * ⚠ „Numar de telefon valid (10 cifre, format romanesc)".
 *
 * `normalizePhone` pliaza `+40`/`0040` la forma locala, dar pastreaza numerele
 * straine ca `+49…`. SmartShip livreaza intern, deci un numar strain nu e o
 * scapare de formatare, ci o comanda pe care nu o pot prelua.
 */
export function telefonValid(telefon: string | null | undefined): boolean {
  return /^0\d{9}$/.test(normalizePhone(telefon));
}

/**
 * IBAN valid dupa ISO 13616 (mod 97), plus forma romaneasca.
 *
 * ⚠ Verificat LOCAL fiindca ei il valideaza la FIECARE cerere, cotare inclusa
 * („IBAN-ul este validat la fiecare cerere"). Un IBAN gresit in configurare nu
 * strica doar emiterea: face ca TOATE comenzile cu ramburs ale magazinului sa
 * cada pe tariful fix, tacut, fiindca `/cost` raspunde 201 si cotarea se pierde
 * in `catch`. De aceea greseala trebuie prinsa in formular, nu la prima comanda.
 */
export function ibanValid(iban: string | null | undefined): boolean {
  const curat = (iban ?? "").replace(/\s/g, "").toUpperCase();
  /* Romania: RO + 2 cifre de control + 4 litere de banca + 16 alfanumerice. */
  if (!/^RO\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(curat)) return false;

  /* Mod 97: se mutau primele patru caractere la coada, apoi literele devin cifre. */
  const rotit = curat.slice(4) + curat.slice(0, 4);
  let rest = 0;
  for (const ch of rotit) {
    const cifre = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const c of cifre) rest = (rest * 10 + Number(c)) % 97;
  }
  return rest === 1;
}

/**
 * Greutatea volumetrica a unui colet, dupa formula LOR: L×l×h / 6000.
 *
 * ⚠ Se factureaza MAXIMUL dintre ea si greutatea fizica. Deci un colet usor si
 * mare costa cat unul greu — iar comerciantul care nu-si completeaza dimensiunile
 * plateste diferenta fara s-o vada nicaieri.
 */
export function greutateVolumetrica(lungime: number, latime: number, inaltime: number): number {
  const v = (Number(lungime) * Number(latime) * Number(inaltime)) / 6000;
  return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : 0;
}

/**
 * Referinta noastra, trimisa ca `content.order_id`.
 *
 * ⚠ NUMARUL DE COMANDA SINGUR NU AJUNGE.
 *
 * `orders_order_number_business_unique UNIQUE (business_id, order_number)`, iar
 * contorul reporneste de la #0001 la fiecare magazin nou. SmartShip cauta insa
 * dupa `order_id` in CONTUL de comerciant — iar doi proprietari de magazine pot
 * foarte bine sa fi legat acelasi cont SmartShip pe amandoua. Atunci #0001 din
 * magazinul A si #0001 din B ar fi aceeasi comanda pentru ei, iar
 * `cautaDupaComanda()` — chiar mecanismul care inchide fereastra „nu stiu daca
 * s-a creat" — ar intoarce AWB-ul ALTUI magazin si l-ar scrie pe comanda gresita.
 *
 * Aceeasi lectie ca la BT iPay (vezi `ipayOrderNumber`), si acelasi leac: patru
 * caractere din `businessId`.
 */
export function referintaComenzii(orderNumber: string | null | undefined, businessId: string): string {
  const baza = String(orderNumber ?? "").replace(/[^A-Za-z0-9]/g, "") || "ORD";
  const magazin = String(businessId ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
  return magazin ? `${baza}-${magazin}` : baza;
}

// ─── Ce opreste, si ce doar avertizeaza ───────────────────────────────────────

/** Id-ul lockerului ca intreg pozitiv, sau `null`. Vezi `lockere.ts`. */
export function lockerNumeric(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.trim()) : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Ce lipseste din CONFIGURAREA MAGAZINULUI, separat de ce lipseste din comanda.
 *
 * ⚠ SEPARAREA NU E COSMETICA. Checkout-ul cade pe tariful fix ori de cate ori
 * cotarea nu se poate face — dar cele doua cauze cer lucruri opuse:
 *
 *   configurare gresita  -> comerciantul TREBUIE alertat: pana o repara, TOATE
 *                           comenzile magazinului pierd pretul real;
 *   adresa incompleta    -> e comanda unui singur client, si nu e nimic de
 *                           reparat in magazin. O alerta aici l-ar invata pe om
 *                           sa nu se mai uite la alerte.
 *
 * Prima forma nu le deosebea: un cumparator care scria „Bucuresti" fara sector
 * ridica o alerta care spunea „SmartShip nu poate cota", ca si cum ceva ar fi
 * stricat in configurare.
 */
export function lipsuriConfigurare(config: Partial<SmartshipConfig>, cuRamburs: boolean): string[] {
  const lipsuri: string[] = [];
  const exp = config.expeditor;

  if (!exp || !curata(exp.name)) {
    lipsuri.push("adresa de ridicare din configurarea SmartShip (apasa „Incarca expeditorii”)");
  } else {
    if (!numeleAreDouaCuvinte(exp.name)) {
      lipsuri.push("numele expeditorului trebuie sa aiba cel putin doua cuvinte (regula SmartShip)");
    }
    if (!curata(exp.address)) lipsuri.push("adresa expeditorului");
    if (!telefonValid(exp.phone)) lipsuri.push("telefonul expeditorului (10 cifre, format romanesc)");
    if (!(Number(exp.city) > 0)) {
      lipsuri.push("id-ul localitatii expeditorului — se ia din „Incarca expeditorii”, nu se scrie de mana");
    }
  }

  /*
   * ⚠ IBAN-ul e cerut DOAR cand comanda are ramburs, dar atunci e cerut la
   * FIECARE cerere — cotare inclusa. Gresit, `/cost` raspunde 201 si toate
   * comenzile cu plata la livrare raman fara pret real, tacut.
   */
  if (cuRamburs) {
    const iban = (config.iban ?? "").trim();
    if (!iban) {
      lipsuri.push(
        "IBAN-ul pentru ramburs din configurarea SmartShip — e obligatoriu la orice comanda "
        + "cu plata la livrare, si se verifica la fiecare cerere",
      );
    } else if (!ibanValid(iban)) {
      lipsuri.push("IBAN-ul din configurarea SmartShip nu e valid (verifica cifrele de control)");
    }
  }

  const dims = dimensiuni(config);
  if (!(dims.length > 0 && dims.width > 0 && dims.height > 0)) {
    lipsuri.push("dimensiunile implicite ale coletului din configurarea SmartShip (in centimetri)");
  }

  return lipsuri;
}

/**
 * Ce OPRESTE expedierea, verificat inaintea oricarei atingeri a furnizorului.
 *
 * ⚠ La SmartShip lista asta conteaza mai mult decat oriunde: nu au nici mediu de
 * proba, nici endpoint de validare. Fiecare camp lasat pe seama lor inseamna o
 * cerere reala care cade cu 999 si un comerciant care citeste un cod.
 *
 * Cuprinde si `lipsuriConfigurare`: la emitere conteaza TOT ce lipseste, oricare
 * i-ar fi cauza.
 */
export function lipsuriExpediere(d: DateExpediere, config: Partial<SmartshipConfig>): string[] {
  const lipsuri: string[] = lipsuriConfigurare(config, bani(d.ramburs) > 0);
  const dest = d.destinatar;

  // ── Destinatarul ──
  const nume = curata(dest.companie || dest.nume);
  if (!nume) lipsuri.push("numele destinatarului");
  else if (!numeleAreDouaCuvinte(nume)) {
    lipsuri.push(
      `numele destinatarului („${nume}”) are un singur cuvant, iar SmartShip cere cel putin doua`,
    );
  }

  if (!telefonValid(dest.telefon)) {
    lipsuri.push(
      normalizePhone(dest.telefon).startsWith("+")
        ? "telefonul destinatarului e international, iar SmartShip livreaza doar in tara"
        : "telefonul destinatarului (10 cifre, format romanesc)",
    );
  }

  if (!(Number(dest.cityId) > 0)) {
    lipsuri.push(`localitatea „${curata(dest.oras)}” nu a fost gasita in nomenclatorul SmartShip`);
  }

  /*
   * ⚠ Sectorul: `null` inseamna „e in Bucuresti si nu stim care". Nu se pune 0 —
   * la ei 0 inseamna „nu e in Bucuresti", deci ar fi o afirmatie falsa despre
   * adresa, nu o valoare lipsa.
   */
  if (dest.sector === null || dest.sector === undefined) {
    if (esteInBucuresti(dest.oras, dest.judet)) {
      lipsuri.push(
        "sectorul destinatarului — adresa e in Bucuresti, iar SmartShip cere sectorul (1-6). "
        + "Completeaza-l in adresa comenzii",
      );
    } else {
      lipsuri.push("sectorul destinatarului nu a putut fi determinat");
    }
  }

  if (d.felLivrare === "domiciliu" && !curata(dest.strada)) {
    lipsuri.push("strada destinatarului");
  }

  // ── Livrarea la locker ──
  if (d.felLivrare === "locker" && lockerNumeric(d.lockerId) === null) {
    lipsuri.push("lockerul ales de client (fara el, SmartShip nu stie unde sa duca coletul)");
  }

  // ── Coletul ──
  if (!(Number(d.greutateKg) > 0)) lipsuri.push("greutatea coletului");

  // ── Coletul la schimb ──
  if (d.laSchimb) {
    const acceptati: readonly number[] = d.contractPropriu
      ? CURIERI_LA_SCHIMB.contractPropriu
      : CURIERI_LA_SCHIMB.oricare;
    const curier = Number(d.courierId);
    if (Number.isInteger(curier) && curier > 0 && !acceptati.includes(curier)) {
      lipsuri.push(
        "curierul ales nu accepta colet la schimb — SmartShip il accepta doar la PTT Express"
        + (d.contractPropriu ? " (pe contract propriu)" : " si SmartShip Delivery"),
      );
    }
  }

  return lipsuri;
}

/** Ce se taie sau se omite fara sa opreasca, si de ce. */
export function avertismenteExpediere(d: DateExpediere, config: Partial<SmartshipConfig>): string[] {
  const av: string[] = [];

  const continut = curata(d.continut ?? "");
  if (continut.length > LUNGIMI.continut) {
    av.push(
      `Descrierea continutului (${continut.length} caractere) a fost taiata la ${LUNGIMI.continut}. `
      + "Ce scrie pe AWB e versiunea scurta.",
    );
  }

  const nota = curata(d.notaDpd ?? "");
  if (nota.length > LUNGIMI.notaDpd) {
    av.push(`Nota pentru DPD (${nota.length} caractere) a fost taiata la ${LUNGIMI.notaDpd}, plafonul lor.`);
  }

  /*
   * ⚠ Greutatea volumetrica: se factureaza maximul dintre ea si cea fizica. Cand
   * dimensiunile o duc peste, comerciantul TREBUIE sa afle — altfel vede pe
   * factura un pret care nu seamana cu greutatea coletului si nu intelege de ce.
   */
  const dims = dimensiuni(config);
  const volumetrica = greutateVolumetrica(dims.length, dims.width, dims.height);
  const fizica = greutate(d.greutateKg);
  const colete = Math.max(1, Math.floor(Number(d.numarColete) || 1));
  if (volumetrica > 0 && volumetrica * colete > fizica) {
    av.push(
      `SmartShip factureaza greutatea volumetrica (${(volumetrica * colete).toFixed(2)} kg pentru `
      + `${dims.length}×${dims.width}×${dims.height} cm), nu cea reala (${fizica} kg). `
      + "Daca dimensiunile din configurare sunt prea mari, fiecare colet costa mai mult.",
    );
  }

  /*
   * ⚠ Documentat de ei: „Nu se aplica la livrarea in locker (nu exista curier
   * prezent care sa deschida coletul): optiunea este ignorata." Se spune, ca
   * omul sa nu creada ca a vandut un serviciu pe care clientul nu-l primeste.
   */
  if (d.felLivrare === "locker" && config.deschidere_la_livrare) {
    av.push("Deschiderea la livrare nu se aplica la locker — SmartShip o ignora acolo.");
  }

  if (d.laSchimb) {
    av.push("Coletul la schimb costa dublu la SmartShip (tur + retur).");
  }

  return av;
}

// ─── Corpul ───────────────────────────────────────────────────────────────────

/** Greutatea, cu cel mult trei zecimale si niciodata zero. */
export function greutate(kg: unknown): number {
  const n = Number(kg);
  const val = Number.isFinite(n) && n > 0 ? n : GREUTATE_MINIMA_KG;
  return Math.max(GREUTATE_MINIMA_KG, Math.round(val * 1000) / 1000);
}

/** Bani, cu doi zecimali. Negativul si NaN devin zero. */
export function bani(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** Dimensiunile, in centimetri intregi. */
export function dimensiuni(config: Partial<SmartshipConfig>): { length: number; width: number; height: number } {
  const cm = (v: unknown, implicit: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : implicit;
  };
  return {
    length: cm(config.lungime_cm, DIMENSIUNI_IMPLICITE.lungime),
    width: cm(config.latime_cm, DIMENSIUNI_IMPLICITE.latime),
    height: cm(config.inaltime_cm, DIMENSIUNI_IMPLICITE.inaltime),
  };
}

/** Adresa pe un singur rand, ca la ceilalti curieri fara campuri separate. */
export function adresaPeRand(a: AdresaComanda): string {
  return [
    curata(a.strada),
    curata(a.numar) ? `nr. ${curata(a.numar)}` : "",
    curata(a.bloc) ? `bl. ${curata(a.bloc)}` : "",
    curata(a.scara) ? `sc. ${curata(a.scara)}` : "",
    curata(a.etaj) ? `et. ${curata(a.etaj)}` : "",
    curata(a.apartament) ? `ap. ${curata(a.apartament)}` : "",
  ].filter(Boolean).join(", ");
}

/**
 * Comanda Edinio → obiectul `recipient`.
 *
 * ⚠ La LOCKER adresa ramane a clientului, si asta e ALTFEL decat la Sameday sau
 * Innoship, unde adresa se inlocuieste cu a punctului. Motivul e in documentatia
 * lor: „Coletul se livreaza la locker, nu la adresa destinatarului" — deci ei
 * ruteaza dupa `locker_id`, iar adresa ramane doar pentru contact. Inlocuita cu a
 * lockerului, am pierde exact datele cu care curierul ia legatura cand ceva nu
 * merge.
 */
export function adresaSmartship(a: AdresaComanda): AdresaSmartship {
  const iesire: AdresaSmartship = {
    name: curata(a.companie || a.nume),
    address: adresaPeRand(a).slice(0, LUNGIMI.adresa),
    city: Number(a.cityId) || 0,
    phone: normalizePhone(a.telefon),
    country: "RO",
    sector: Number(a.sector) || 0,
  };

  const email = curata(a.email);
  /* Destinatarul primeste instiintari de urmarire pe adresa asta. */
  if (email) iesire.email = email;

  return iesire;
}

/** Configurarea → obiectul `sender`, cu implicitele completate. */
export function expeditorSmartship(exp: ExpeditorSmartship): AdresaSmartship {
  return {
    name: curata(exp.name),
    address: curata(exp.address).slice(0, LUNGIMI.adresa),
    city: Number(exp.city) || 0,
    phone: normalizePhone(exp.phone),
    country: (curata(exp.country) || "RO").toUpperCase().slice(0, 2),
    sector: Number(exp.sector) || 0,
    ...(curata(exp.email) ? { email: curata(exp.email) } : {}),
  };
}

/**
 * `content`, partea comuna a celor doua cereri.
 *
 * ⚠ `curier_preferat`, `courier_id`, `swap` si `nocom` NU intra aici: primele
 * doua pentru ca stau in locuri diferite ale cererii (vezi antetul fisierului),
 * ultimele doua pentru ca sunt „doar la /awb/new" si trimise la cotare ar fi
 * ignorate — adica pretul cotat n-ar cuprinde dublarea de la coletul la schimb.
 */
export function continutSmartship(d: DateExpediere, config: Partial<SmartshipConfig>): ContinutSmartship {
  const dims = dimensiuni(config);
  const numarColete = Math.max(1, Math.floor(Number(d.numarColete) || 1));
  const ramburs = bani(d.ramburs);

  const continut: ContinutSmartship = {
    package_content:
      (curata(d.continut ?? "") || curata(config.continut_implicit ?? "") || "Produse")
        .slice(0, LUNGIMI.continut),
    parcels: numarColete,
    weight: greutate(d.greutateKg),
    cash_on_delivery: ramburs,
    length: dims.length,
    width: dims.width,
    height: dims.height,
    /* ⚠ Asigurarea COSTA. Stinsa din oficiu, pornita doar daca o cere omul. */
    insurance: config.asigura_coletul ? bani(d.valoareDeclarata) : 0,
    /* ⚠ Se trimite MEREU, si gol cand nu e ramburs: campul e obligatoriu doar
       atunci, dar un `iban` lipsa cu ramburs > 0 e refuzat cu 201, iar un IBAN
       trimis fara ramburs e ignorat. Mai bine mereu acelasi obiect. */
    iban: ramburs > 0 ? (config.iban ?? "").replace(/\s/g, "").toUpperCase() : "",
    open_package: config.deschidere_la_livrare && d.felLivrare !== "locker" ? 1 : 0,
  };

  const referinta = curata(d.orderId ?? "");
  if (referinta) continut.order_id = referinta;

  const locker = lockerNumeric(d.lockerId);
  if (d.felLivrare === "locker" && locker !== null) continut.locker_id = locker;

  /*
   * ⚠ Coletele multiple au PRIORITATE fata de `parcels`/`weight`/dimensiunile
   * simple — o spune chiar documentatia. Deci se trimit doar cand chiar sunt
   * masurate bucata cu bucata; altfel greutatea totala s-ar pierde.
   */
  const colete = (d.colete ?? []).filter(
    (c) => Number(c?.weight) > 0 && Number(c?.length) > 0 && Number(c?.width) > 0 && Number(c?.height) > 0,
  );
  if (colete.length > 0) {
    continut.parcels_multiple = colete.map((c) => ({
      weight: greutate(c.weight),
      length: Math.round(Number(c.length)),
      width: Math.round(Number(c.width)),
      height: Math.round(Number(c.height)),
    }));
  }

  const nota = curata(d.notaDpd ?? "");
  if (nota) continut.dpd_shipment_note = nota.slice(0, LUNGIMI.notaDpd);

  return continut;
}

function corpComun(d: DateExpediere, config: Partial<SmartshipConfig>): CorpComun {
  if (!config.expeditor) {
    /* `lipsuriExpediere` opreste inainte; asta e doar plasa pentru un apelant nou. */
    throw new Error("SmartShip: expeditorul lipseste din configurare.");
  }
  return {
    sender: expeditorSmartship(config.expeditor),
    recipient: adresaSmartship(d.destinatar),
    content: continutSmartship(d, config),
  };
}

/**
 * Corpul pentru `POST /cost`.
 *
 * ⚠ `curier_preferat` sta in `content` — singurul camp de rutare care sta acolo.
 * ⚠ `show_byoc` sta la nivelul principal.
 */
export function corpCotare(d: DateExpediere, config: Partial<SmartshipConfig>): CorpCost {
  const corp = corpComun(d, config) as CorpCost;

  const curier = Number(d.courierId);
  if (Number.isInteger(curier) && curier > 0) corp.content.curier_preferat = curier;

  if (config.arata_contract_propriu) corp.show_byoc = 1;

  return corp;
}

/**
 * Corpul pentru `POST /awb/new`.
 *
 * ⚠ `courier_id` si `use_own_contract` la nivelul PRINCIPAL, nu in `content`.
 * ⚠ `courier_id` trece prin `courierDeEmis`: pe contract propriu, easybox (12) nu
 * exista ca furnizor separat si trebuie emis ca SameDay (2) cu locker.
 */
export function corpEmitere(d: DateExpediere, config: Partial<SmartshipConfig>): CorpAwb {
  const curier = Number(d.courierId);
  if (!Number.isInteger(curier) || curier <= 0) {
    throw new Error("SmartShip: emiterea cere curierul ales.");
  }

  const contractPropriu = !!d.contractPropriu && !!config.contract_propriu;
  const corp = corpComun(d, config) as CorpAwb;

  corp.courier_id = courierDeEmis(curier, contractPropriu);
  if (contractPropriu) corp.use_own_contract = 1;

  /* Doar la emitere. Trimise la cotare, ar fi ignorate — vezi `continutSmartship`. */
  if (d.laSchimb) corp.content.swap = 1;
  if (config.fara_ridicare_automata) corp.content.nocom = 1;

  return corp;
}
