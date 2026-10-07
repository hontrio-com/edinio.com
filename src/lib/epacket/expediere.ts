import { normalizePhone } from "@/lib/utils/phone";
import { ascii } from "@/lib/curiera/expediere";
import {
  CURIERI_DE_TEST, DIMENSIUNI_IMPLICITE, NUME_CURIER_EPACKET, areCurierulPuncte, curierAdresa, curierPuncte, eCheieDeTest, numeBun,
  type CurierEpacket, type EpacketConfig, type ExpeditorEpacket,
} from "./client";
import { LUNGIMI_ADRESA } from "./adresa";

/**
 * Cererea `POST /awb`, construita dintr-un singur loc, si tot ce trebuie verificat INAINTE de ea.
 *
 * ═══ ⚠ TOT TEXTUL PLEACA IN ASCII ═══
 *
 * Masurat pe 07.10.2026, pe eticheta Sameday: in ADRESA literele cu diacritice sunt STERSE, nu
 * inlocuite: „Strada Mărășești" a iesit „Strada Mreti", iar blocul „Ș2" a iesit „2". Numele si
 * continutul le-au pastrat, iar DPD le transcrie singur. Dar pentru Cargus, FAN, Dragon Star si
 * TCE nu exista mediu de test, deci nimic nu s-a putut vedea: regula e una, pe tot textul.
 *
 * ═══ ⚠ CHEIA DE TEST NU E O EXPEDIERE ═══
 *
 * Cu `epk_test_…` merg doar DPD si Sameday, in mediul LOR de test: AWB-ul nu pleaca la nimeni si
 * nu se taxeaza. Se spune la fiecare pas (configurare, fereastra, comanda).
 */

// ─── Ce trimite fereastra ─────────────────────────────────────────────────────

export type DestinatarEpacket = {
  prenume: string;
  nume: string;
  /** Daca exista, destinatarul e o FIRMA (scris de ei). */
  firma?: string | null;
  telefon: string;
  email: string;
  /** La adresa: din `GET /localities`. La punct se ignora (ei refuza `locality_id` langa locker). */
  localitateId?: number | null;
  codPostal?: string | null;
  strada?: string | null;
  numar?: string | null;
  bloc?: string | null;
  scara?: string | null;
  etaj?: string | null;
  apartament?: string | null;
};

export type ColetEpacket = { greutate: number; lungime?: number | null; latime?: number | null; inaltime?: number | null };

/** Ce trimite fereastra (sau lotul). Referinta o pune SERVERUL, din numarul comenzii. */
export type DateAwbEpacket = {
  curier: CurierEpacket;
  /** `D2D` = la adresa, `D2L` = la punct. Expeditorul pleaca mereu de la adresa lui. */
  tip: "D2D" | "D2L";
  destinatar: DestinatarEpacket;
  punctId?: string | null;
  tipColet: "parcel" | "envelope";
  colete: ColetEpacket[];
  continut?: string | null;
  /** Suma de incasat. 0 sau lipsa = fara ramburs. */
  ramburs?: number | null;
  /** Valoarea declarata. 0 sau lipsa = nu se declara. */
  asigurare?: number | null;
  deschidere?: boolean;
};

export type DateExpediereEpacket = DateAwbEpacket & { referinta: string };

// ─── Limitele LOR ─────────────────────────────────────────────────────────────

/**
 * Din tabelul „Limite pe curier" al documentatiei, verificat pe fir unde s-a putut (DPD: 31,5 kg
 * si 10 colete, 422 masurat). Se verifica si aici ca lotul sa nu cheltuiasca cereri pe refuzuri
 * sigure, iar mesajul sa fie al nostru. ⚠ Ce nu e aici verifica ei, tot inainte de curier.
 */
const MAX_COLETE: Partial<Record<CurierEpacket, number>> = { DPD: 10, FCR: 10 };
const MAX_KG_COLET: Record<CurierEpacket, number> = { DPD: 31.5, SDY: 50, CGS: 100, FCR: 50, DSC: 100, TCE: 31.5 };
/** Plicul: „cel mult 0,5 kg (TCE 0,3 kg)". */
const MAX_KG_PLIC: Record<CurierEpacket, number> = { DPD: 0.5, SDY: 0.5, CGS: 0.5, FCR: 0.5, DSC: 0.5, TCE: 0.3 };
/** „Asigurarea nu se poate pentru colete peste 32 kg" (422 masurat la 33). */
const MAX_KG_ASIGURARE = 32;

/**
 * Cat primeste un punct, pe retea, pentru CHECKOUT (vezi `shipping.actions.ts`): cea mai mica
 * limita a punctelor care se ofera. Din tabelul lor:
 *   Sameday locker 20; DPD locker 15 (oficiile mai mult); Cargus locker 15; FANbox 30.
 * ⚠ PayPoint-urile FAN (10 kg) NU se ofera in checkout: ar fi coborat tot FAN la 10 kg.
 */
export const KG_MAXIM_PUNCT: Record<"DPD" | "SDY" | "FCR" | "CGS", number> = { SDY: 20, DPD: 15, CGS: 15, FCR: 30 };

/** Tipurile de punct oferite in checkout, pe retea. */
export function punctOferit(curier: string, tip: string): boolean {
  if (curier === "FCR") return tip === "locker";
  return tip === "locker" || tip === "office";
}

// ─── Ajutoare ─────────────────────────────────────────────────────────────────

/** Referinta noastra (max. 100, doar pentru evidenta lor): ca la Curiera si DHL. */
export function referintaEpacket(businessId: string, orderNumber: string | number | null | undefined): string {
  const magazin = businessId.replace(/-/g, "").slice(0, 4).toUpperCase();
  const nr = String(orderNumber ?? "").replace(/^#/, "").trim() || "0";
  return `EDN-${magazin}-${nr}`.slice(0, 100);
}

/** Taie la `max` caractere, pe granita unui cuvant cand se poate. */
function taie(s: string, max: number): string {
  if (s.length <= max) return s;
  const t = s.slice(0, max);
  const sp = t.lastIndexOf(" ");
  return (sp > max * 0.6 ? t.slice(0, sp) : t).trim();
}

/**
 * Numele intreg -> prenume + nume, dupa regula LOR: fiecare 3-25 caractere, cu o litera.
 *
 * Se pastreaza ORDINEA scrisa de om (pe eticheta apar „prenume nume", deci iese cum a scris). Se
 * alege prima taietura in care amandoua bucatile trec. Fara una buna („Li Wu", un singur cuvant),
 * se intoarce tot in prenume si numele gol: fereastra il cere, nimic nu se completeaza inventat.
 */
export function despartaNumele(intreg: string | null | undefined): { prenume: string; nume: string } {
  const parti = ascii(intreg).split(" ").filter(Boolean);
  for (let i = 1; i < parti.length; i++) {
    const a = parti.slice(0, i).join(" ");
    const b = parti.slice(i).join(" ");
    if (numeBun(a) && numeBun(taie(b, 25))) return { prenume: a, nume: taie(b, 25) };
  }
  return { prenume: ascii(intreg), nume: "" };
}

/** Telefonul in forma lor: „0712345678 sau +40712345678 ... sau un numar de fix". Strainele, refuzate. */
export function telefonEpacket(v: string | null | undefined): string {
  const n = normalizePhone(v);
  return /^0[2-9]\d{8}$/.test(n) ? n : "";
}

export function ibanCurat(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, "").toUpperCase();
}

const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function suma(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** Greutatea in kg, rotunjita in SUS la 10 g (suma bucatilor trebuie sa acopere totalul). */
function kg(v: number): number {
  return Math.max(0.1, Math.ceil((Number(v) || 0) * 100) / 100);
}

/** Coletele egale dintr-o greutate totala, cu aceleasi dimensiuni. Pentru fereastra si lot. */
export function coleteEgale(greutateTotala: number, numar: number, dim?: { lungime: number; latime: number; inaltime: number } | null): ColetEpacket[] {
  const n = Math.max(1, Math.floor(numar || 1));
  const pe = kg((Number(greutateTotala) || 0.1) / n);
  return Array.from({ length: n }, () => ({ greutate: pe, ...(dim ? { lungime: dim.lungime, latime: dim.latime, inaltime: dim.inaltime } : {}) }));
}

// ─── Lipsurile ────────────────────────────────────────────────────────────────

function lipsuriExpeditor(e: ExpeditorEpacket): string[] {
  const l: string[] = [];
  const cfg = "(configurarea e-packet)";
  if (!numeBun(ascii(e.prenume))) l.push(`prenumele expeditorului, 3-25 litere ${cfg}`);
  if (!numeBun(ascii(e.nume))) l.push(`numele expeditorului, 3-25 litere ${cfg}`);
  if (!telefonEpacket(e.telefon)) l.push(`un telefon romanesc al expeditorului ${cfg}`);
  if (!EMAIL.test((e.email ?? "").trim())) l.push(`emailul expeditorului ${cfg}`);
  if (!(Number.isInteger(e.localitate_id) && (e.localitate_id ?? 0) > 0)) l.push(`localitatea de ridicare ${cfg}`);
  if (!/^\d{6}$/.test((e.cod_postal ?? "").trim())) l.push(`codul postal de ridicare, 6 cifre ${cfg}`);
  if (!ascii(e.strada)) l.push(`strada de ridicare ${cfg}`);
  if (!ascii(e.numar)) l.push(`numarul de la adresa de ridicare ${cfg}`);
  return l;
}

/**
 * Ce lipseste ca sa poata pleca AWB-ul, in cuvinte pentru comerciant. Gol = se poate emite.
 *
 * ⚠ E-packet verifica oricum tot si refuza cu 422 INAINTE de curier (masurat). Plasa de aici
 * exista ca lotul sa nu consume cereri (60 pe minut) pe refuzuri sigure, si ca fereastra sa
 * spuna ce lipseste inainte de apasare.
 */
export function lipsuriExpediereEpacket(config: EpacketConfig, date: DateExpediereEpacket): string[] {
  const lipsuri = lipsuriExpeditor(config.expeditor ?? {});
  const d = date.destinatar;
  const curier = NUME_CURIER_EPACKET[date.curier] ?? date.curier;

  if (eCheieDeTest(config.api_key) && !CURIERI_DE_TEST.includes(date.curier)) {
    lipsuri.push(`un curier de test: cu o cheie de TEST merg doar DPD si Sameday (${curier} e refuzat)`);
  }

  if (!numeBun(ascii(d.prenume))) lipsuri.push("prenumele destinatarului, 3-25 caractere cu cel putin o litera");
  if (!numeBun(ascii(d.nume))) lipsuri.push("numele destinatarului, 3-25 caractere cu cel putin o litera");
  if (!telefonEpacket(d.telefon)) lipsuri.push("un telefon romanesc al destinatarului (mobil sau fix)");
  if (!EMAIL.test((d.email ?? "").trim())) lipsuri.push("emailul destinatarului (e obligatoriu la e-packet)");

  if (date.tip === "D2L") {
    if (!areCurierulPuncte(date.curier)) lipsuri.push(`un curier cu puncte de ridicare (${curier} n-are)`);
    if (!(date.punctId ?? "").trim()) lipsuri.push("punctul de ridicare");
    if (date.colete.length > 1) lipsuri.push("un singur colet (la un locker merge unul singur)");
    if (date.deschidere) lipsuri.push("fara deschiderea coletului (nu se poate la locker)");
  } else {
    if (!(Number.isInteger(d.localitateId) && (d.localitateId ?? 0) > 0)) lipsuri.push("localitatea destinatarului, aleasa din lista e-packet");
    if (!/^\d{6}$/.test((d.codPostal ?? "").trim())) lipsuri.push("codul postal al destinatarului, 6 cifre");
    if (!ascii(d.strada)) lipsuri.push("strada destinatarului");
    else if (ascii(d.strada).length > LUNGIMI_ADRESA.strada) lipsuri.push(`o strada de cel mult ${LUNGIMI_ADRESA.strada} caractere`);
    if (!ascii(d.numar)) lipsuri.push("numarul de la adresa (scrie FN daca nu are)");
    else if (ascii(d.numar).length > LUNGIMI_ADRESA.numar) lipsuri.push(`un numar de cel mult ${LUNGIMI_ADRESA.numar} caractere`);
    if (ascii(d.bloc).length > LUNGIMI_ADRESA.bloc) lipsuri.push(`un bloc de cel mult ${LUNGIMI_ADRESA.bloc} caractere`);
    for (const [camp, eticheta] of [["scara", "scara"], ["etaj", "etajul"], ["apartament", "apartamentul"]] as const) {
      if (ascii(d[camp]).length > LUNGIMI_ADRESA[camp]) lipsuri.push(`${eticheta} de cel mult ${LUNGIMI_ADRESA[camp]} caractere`);
    }
  }

  /* Coletele. */
  const colete = date.colete ?? [];
  if (colete.length < 1) lipsuri.push("cel putin un colet");
  const max = MAX_COLETE[date.curier];
  if (max && colete.length > max) lipsuri.push(`cel mult ${max} colete (${curier})`);
  if (date.tipColet === "envelope") {
    if (colete.length !== 1) lipsuri.push("un singur plic");
    if (colete.some((c) => !(c.greutate > 0) || c.greutate > MAX_KG_PLIC[date.curier])) {
      lipsuri.push(`un plic de cel mult ${MAX_KG_PLIC[date.curier].toString().replace(".", ",")} kg`);
    }
    if (date.deschidere) lipsuri.push("fara deschiderea coletului (nu se poate la plic)");
  } else {
    if (colete.some((c) => !(c.greutate >= 0.1 && c.greutate <= 100))) lipsuri.push("greutatea fiecarui colet, intre 0,1 si 100 kg");
    else if (colete.some((c) => c.greutate > MAX_KG_COLET[date.curier])) {
      lipsuri.push(`cel mult ${MAX_KG_COLET[date.curier].toString().replace(".", ",")} kg pe colet (${curier})`);
    }
    if (colete.some((c) => ![c.lungime, c.latime, c.inaltime].every((x) => Number(x) >= 1 && Number(x) <= 300))) {
      lipsuri.push("dimensiunile fiecarui colet, intre 1 si 300 cm (sunt obligatorii la colet)");
    }
  }

  /* Rambursul: contul lui, toate patru campurile. */
  if (suma(date.ramburs) > 0) {
    const r = config.ramburs ?? {};
    if (!ascii(r.titular)) lipsuri.push("titularul contului de ramburs (configurarea e-packet)");
    if (!IBAN.test(ibanCurat(r.iban))) lipsuri.push("un IBAN valid pentru ramburs (configurarea e-packet)");
    if (!ascii(r.banca)) lipsuri.push("banca pentru ramburs (configurarea e-packet)");
  }

  if (date.deschidere) {
    if (date.curier === "FCR") lipsuri.push("fara deschiderea coletului (FAN Courier nu o ofera)");
    /* ⚠ Cotarea lor o accepta fara ramburs (47,44 lei masurat), emiterea NU (422). */
    if (date.curier === "DPD" && !(suma(date.ramburs) > 0)) lipsuri.push("ramburs, ca sa se poata deschide coletul la DPD");
  }
  if (suma(date.asigurare) > 0 && colete.some((c) => c.greutate > MAX_KG_ASIGURARE)) {
    lipsuri.push(`fara asigurare (nu se poate pe colete peste ${MAX_KG_ASIGURARE} kg)`);
  }

  if (!ascii(date.continut) && !ascii(config.continut_implicit)) lipsuri.push("continutul coletului");
  return lipsuri;
}

// ─── Corpul cererii ───────────────────────────────────────────────────────────

/** Un camp text pus numai cand are ceva in el: ei refuza campurile goale ca obligatorii lipsa. */
function pune(o: Record<string, unknown>, cheie: string, v: string | null | undefined, max?: number): void {
  const s = ascii(v);
  if (s) o[cheie] = max ? taie(s, max) : s;
}

function parteaExpeditor(e: ExpeditorEpacket): Record<string, unknown> {
  const p: Record<string, unknown> = {
    first_name: taie(ascii(e.prenume), 25),
    last_name: taie(ascii(e.nume), 25),
    phone: telefonEpacket(e.telefon),
    email: (e.email ?? "").trim(),
    locality_id: e.localitate_id,
    postcode: (e.cod_postal ?? "").trim(),
  };
  pune(p, "company", e.firma);
  pune(p, "street", e.strada, LUNGIMI_ADRESA.strada);
  pune(p, "number", e.numar, LUNGIMI_ADRESA.numar);
  pune(p, "block", e.bloc, LUNGIMI_ADRESA.bloc);
  pune(p, "entrance", e.scara, LUNGIMI_ADRESA.scara);
  pune(p, "floor", e.etaj, LUNGIMI_ADRESA.etaj);
  pune(p, "apartment", e.apartament, LUNGIMI_ADRESA.apartament);
  return p;
}

/**
 * Corpul `POST /awb`.
 *
 * ⚠ La punct, destinatarul primeste DOAR `locker_id` langa nume, telefon si email: cu `locality_id`
 * sau `street` langa el, cererea e refuzata („Pentru un locker se trimite doar locker_id",
 * masurat). Si ⚠ „Campurile necunoscute sunt refuzate (422)": aici nu pleaca nimic in plus.
 */
export function corpAwbEpacket(config: EpacketConfig, date: DateExpediereEpacket): Record<string, unknown> {
  const d = date.destinatar;
  const destinatar: Record<string, unknown> = {
    first_name: taie(ascii(d.prenume), 25),
    last_name: taie(ascii(d.nume), 25),
    phone: telefonEpacket(d.telefon),
    email: (d.email ?? "").trim(),
  };
  pune(destinatar, "company", d.firma);
  if (date.tip === "D2L") {
    destinatar.locker_id = (date.punctId ?? "").trim();
  } else {
    destinatar.locality_id = d.localitateId;
    destinatar.postcode = (d.codPostal ?? "").trim();
    pune(destinatar, "street", d.strada, LUNGIMI_ADRESA.strada);
    pune(destinatar, "number", d.numar, LUNGIMI_ADRESA.numar);
    pune(destinatar, "block", d.bloc, LUNGIMI_ADRESA.bloc);
    pune(destinatar, "entrance", d.scara, LUNGIMI_ADRESA.scara);
    pune(destinatar, "floor", d.etaj, LUNGIMI_ADRESA.etaj);
    pune(destinatar, "apartment", d.apartament, LUNGIMI_ADRESA.apartament);
  }

  const plic = date.tipColet === "envelope";
  const corp: Record<string, unknown> = {
    courier: date.curier,
    delivery_type: date.tip,
    sender: parteaExpeditor(config.expeditor ?? {}),
    recipient: destinatar,
    package_type: plic ? "envelope" : "parcel",
    /* „La plic, exact un element, doar cu greutatea." */
    parcels: (plic ? date.colete.slice(0, 1) : date.colete).map((c) => plic
      ? { weight: kg(c.greutate) }
      : {
          weight: kg(c.greutate),
          length: Math.round(Number(c.lungime) * 10) / 10,
          width: Math.round(Number(c.latime) * 10) / 10,
          height: Math.round(Number(c.inaltime) * 10) / 10,
        }),
    contents: taie(ascii(date.continut) || ascii(config.continut_implicit), 50),
    reference: date.referinta.slice(0, 100),
  };

  const ramburs = suma(date.ramburs);
  if (ramburs > 0) {
    const r = config.ramburs ?? {};
    corp.cash_on_delivery = {
      amount: ramburs,
      /* „Nume si prenume, fara diacritice" (422 masurat pe „Ștefan"). */
      account_holder: ascii(r.titular),
      iban: ibanCurat(r.iban),
      bank_name: ascii(r.banca),
    };
  }
  const asigurare = suma(date.asigurare);
  if (asigurare > 0) corp.insurance = asigurare;
  if (date.deschidere) corp.open_package = true;
  return corp;
}

// ─── Ce precompleteaza fereastra ──────────────────────────────────────────────

/**
 * Ce primeste fereastra AWB din configurare. ⚠ NU configul intreg: el poarta cheia API, iar tot ce
 * primeste o componenta de client pleaca in browser.
 */
export type OptiuniAwbEpacket = {
  curierAdresa: CurierEpacket;
  curierPuncte: CurierEpacket;
  test: boolean;
  asigurare: boolean;
  deschidere: boolean;
  continutImplicit: string;
  dimensiuni: { lungime: number; latime: number; inaltime: number };
  /** Rambursul poate pleca (contul lui e completat). */
  rambursGata: boolean;
  /** Emailul magazinului: rezerva cand comanda n-are email (e-packet il cere). */
  emailRezerva: string;
};

export function optiuniAwbEpacket(config: EpacketConfig | null | undefined): OptiuniAwbEpacket {
  const r = config?.ramburs ?? {};
  const dim = config?.dimensiuni_implicite;
  const dimBune = !!dim && [dim.lungime, dim.latime, dim.inaltime].every((x) => Number(x) >= 1 && Number(x) <= 300);
  return {
    curierAdresa: curierAdresa(config),
    curierPuncte: curierPuncte(config),
    test: eCheieDeTest(config?.api_key),
    asigurare: config?.asigurare === true,
    deschidere: config?.deschidere_colet === true,
    continutImplicit: ascii(config?.continut_implicit),
    dimensiuni: dimBune ? { lungime: Number(dim!.lungime), latime: Number(dim!.latime), inaltime: Number(dim!.inaltime) } : { ...DIMENSIUNI_IMPLICITE },
    rambursGata: !!ascii(r.titular) && IBAN.test(ibanCurat(r.iban)) && !!ascii(r.banca),
    emailRezerva: EMAIL.test((config?.expeditor?.email ?? "").trim()) ? (config?.expeditor?.email ?? "").trim() : "",
  };
}
