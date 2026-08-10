import { codAutoAlJudetului } from "@/lib/ro/judete";
import { normalizePhone } from "@/lib/utils/phone";
import type { PaletPallEx, PartidaPallEx, ServiciiPallEx, TipPartida } from "./client";

/**
 * Construirea partidei Pall-Ex dintr-o comanda Edinio.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza: primeste date, intoarce obiectul pe
 * care il asteapta ClientPlus. Asta il face singurul loc din integrare care se
 * poate verifica INTEGRAL fara datele de acces ale comerciantului — si cum
 * FIECARE endpoint al Pall-Ex cere autentificare, e singura sansa de a proba ceva
 * inainte de prima expediere reala.
 *
 * ═══ CE E ALTFEL FATA DE CEILALTI SASE CURIERI ═══
 *
 *   - Judetul pleaca drept COD ISO auto („SB", „B"), nu ca nume.
 *   - Data si fereastra orara sunt obligatorii de amandoua partile.
 *   - Nu exista ramburs. Niciun camp. Vezi `client.ts`.
 */

/**
 * ⚠ NU SE TAIE NIMIC, si e o hotarare, nu o scapare.
 *
 * Specificatia Pall-Ex (OpenAPI 1.0.5) nu declara `maxLength` la niciunul dintre
 * cele 32 de campuri. La GLS taiem la 40 fiindca acolo lungimea se stie dintr-un
 * API-sora al aceluiasi furnizor; aici nu avem nicio dovada, iar cele doua greseli
 * cu putinta nu costa la fel:
 *
 *   tai prea devreme  -> adresa ciuntita pleaca TACUT, si se afla de la sofer;
 *   nu tai            -> Pall-Ex raspunde 422, adica un refuz DOVEDIT: registrul
 *                        nu blocheaza comanda, mesajul spune care camp e prea
 *                        lung, iar comerciantul corecteaza si reincearca.
 *
 * A doua e vizibila si reparabila. Se taie doar `client_reference`, unde exemplul
 * din specificatie are exact 20 de caractere — semn de latime de coloana — si
 * unde taierea nu strica nimic: e referinta NOASTRA, iar numerele de comanda au
 * cinci caractere.
 */
const MAX_REFERINTA = 20;

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

// ─── Date si ore ──────────────────────────────────────────────────────────────

/**
 * Ziua de azi in Romania, ca „AAAA-LL-ZZ".
 *
 * ⚠ NU se ia din `toISOString()`. Serverul ruleaza pe UTC, iar Romania e cu doua
 * ore inainte vara: o partida creata la 22:30 ora Bucurestiului ar primi data de
 * IERI, deci o data de ridicare in trecut — pe care Pall-Ex o respinge (`meta:
 * ["collection_date"]`). Se intampla o data la fiecare zi, timp de doua ore, si
 * numai seara: exact felul de defect care pare intamplator.
 */
export function ziuaInRomania(acum: Date = new Date()): string {
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(acum);
  const ia = (tip: string) => parti.find((p) => p.type === tip)?.value ?? "";
  return `${ia("year")}-${ia("month")}-${ia("day")}`;
}

/** „AAAA-LL-ZZ" → numarul de zile de la epoca, sau `null` daca nu e o data. */
function laZile(zi: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(zi.trim());
  if (!m) return null;
  const [, a, l, z] = m;
  const ms = Date.UTC(Number(a), Number(l) - 1, Number(z));
  const d = new Date(ms);
  /* Respinge „2026-02-31": `Date.UTC` il primeste si il muta pe 3 martie. */
  if (d.getUTCFullYear() !== Number(a) || d.getUTCMonth() !== Number(l) - 1 || d.getUTCDate() !== Number(z)) {
    return null;
  }
  return Math.floor(ms / 86400000);
}

function dinZile(zile: number): string {
  return new Date(zile * 86400000).toISOString().slice(0, 10);
}

/**
 * Adauga zile LUCRATOARE peste o data.
 *
 * ⚠ Sarbatorile legale NU sunt tratate, si asta se spune in interfata.
 *
 * Ar cere un calendar romanesc intretinut de mana, cu Pastele ortodox cu tot, si
 * un calendar gresit e mai rau decat niciunul: ar muta tacut ridicarea cu o zi in
 * fata pe date la care Pall-Ex chiar lucreaza. Sambetele si duminicile se sar
 * fiindca alea sunt sigure; restul ramane pe seama comerciantului, care oricum
 * poate schimba data in formular.
 */
export function adaugaZileLucratoare(zi: string, cate: number): string {
  const start = laZile(zi);
  if (start === null) return zi;

  let curent = start;
  let ramase = Math.max(0, Math.floor(cate));

  /* Zero zile inseamna „chiar azi", dar tot nu intr-o sambata. */
  if (ramase === 0) {
    while (esteWeekend(curent)) curent += 1;
    return dinZile(curent);
  }

  while (ramase > 0) {
    curent += 1;
    if (!esteWeekend(curent)) ramase -= 1;
  }
  return dinZile(curent);
}

function esteWeekend(zile: number): boolean {
  /* 1970-01-01 a fost joi, deci `getUTCDay` e cel mai limpede. */
  const zi = new Date(zile * 86400000).getUTCDay();
  return zi === 0 || zi === 6;
}

/** `true` daca `a` e strict inaintea lui `b`. Datele invalide nu se compara. */
export function inainteDe(a: string, b: string): boolean {
  const za = laZile(a);
  const zb = laZile(b);
  return za !== null && zb !== null && za < zb;
}

/**
 * Ora, normalizata la „HH:MM".
 *
 * Accepta „8:00", „08:00", „8" si „08:00:00". Orice altceva intoarce `null`, si
 * atunci apelantul cade pe implicit — un „HH:MM" stricat trimis la Pall-Ex ar
 * respinge partida cu `meta: ["collection_open_time"]`, adica un mesaj despre un
 * camp pe care comerciantul nici nu stie ca exista.
 */
export function oraNormalizata(text: string | null | undefined): string | null {
  const curat = (text ?? "").trim();
  if (!curat) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/.exec(curat);
  if (!m) return null;
  const ore = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (ore > 23 || minute > 59) return null;
  return `${String(ore).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Ferestrele orare implicite, cand nici configurarea nici formularul nu spun alta. */
export const ORA_DESCHIDERE_IMPLICITA = "08:00";
export const ORA_INCHIDERE_IMPLICITA = "17:00";

// ─── Adresele ─────────────────────────────────────────────────────────────────

export type AdresaComanda = {
  nume: string;
  companie?: string | null;
  strada: string;
  stradaExtra?: string | null;
  oras: string;
  judet?: string | null;
  codPostal?: string | null;
  contact?: string | null;
  telefon?: string | null;
};

export type DatePartida = {
  referinta: string;
  tip: TipPartida;
  expeditor: AdresaComanda;
  destinatar: AdresaComanda;

  dataRidicare: string;
  oraDeschidereRidicare: string;
  oraInchidereRidicare: string;
  dataLivrare: string;
  oraDeschidereLivrare: string;
  oraInchidereLivrare: string;

  numarPaleti: number;
  /** Greutatea TOTALA a marfii, in kilograme. */
  greutateKg: number;
  paleti?: PaletPallEx[];

  /** Valoarea marfii, pentru asigurare. */
  valoare?: number;
  observatii?: string | null;
  servicii?: ServiciiPallEx;
};

/**
 * Ce lipseste dintr-o adresa ca sa poata pleca la Pall-Ex.
 *
 * ⚠ Se verifica AICI, inainte de orice atingere a furnizorului, si mesajele sunt
 * scrise pentru comerciant, nu pentru un log. Toate cele cinci campuri sunt
 * `required` in specificatie, deci lipsa oricaruia inseamna 422 — iar 422 vine
 * fara niciun text, doar cu numele campului in engleza.
 *
 * Judetul e cel mai subtil: nu e destul sa fie completat, trebuie sa fie unul
 * pe care il putem traduce in cod ISO auto. „Bucuresti Sector 3" merge (vezi
 * `potrivesteJudet`), „Chisinau" nu.
 */
export function lipsuriAdresa(a: AdresaComanda, cine: "expeditor" | "destinatar"): string[] {
  const cui = cine === "expeditor" ? "expeditorului" : "destinatarului";
  const lipsuri: string[] = [];

  /* `||`, nu `??`: o companie salvata ca sir GOL trebuie sa cada pe numele
     persoanei, exact ca in `partidaPallEx`. Cu `??` cele doua s-ar fi despartit,
     iar verificarea ar fi trecut peste o partida care pleaca fara nume. */
  if (!curata(a.companie || a.nume)) lipsuri.push(`numele ${cui}`);
  if (!curata(a.strada)) lipsuri.push(`adresa ${cui}`);
  if (!curata(a.oras)) lipsuri.push(`localitatea ${cui}`);
  if (!curata(a.codPostal)) lipsuri.push(`codul postal al ${cui}`);
  if (!codAutoAlJudetului(a.judet)) {
    lipsuri.push(curata(a.judet) ? `judetul ${cui} (nerecunoscut: „${curata(a.judet)}")` : `judetul ${cui}`);
  }

  return lipsuri;
}

// ─── Partida ──────────────────────────────────────────────────────────────────

/**
 * Comanda Edinio → partida ClientPlus.
 *
 * ⚠ Functia presupune ca `lipsuriAdresa` a trecut deja pentru amandoua adresele.
 * Nu arunca daca n-a trecut — ar dubla o verificare pe care apelantul o face
 * oricum, cu mesaje mai bune — dar campurile ies goale, iar Pall-Ex raspunde 422.
 */
export function partidaPallEx(d: DatePartida): PartidaPallEx {
  const s = d.servicii ?? {};

  const partida: PartidaPallEx = {
    type: d.tip,

    consignor_name: curata(d.expeditor.companie || d.expeditor.nume),
    consignor_county: codAutoAlJudetului(d.expeditor.judet) ?? "",
    consignor_locality: curata(d.expeditor.oras),
    consignor_address: strada(d.expeditor),
    consignor_postcode: curata(d.expeditor.codPostal),

    consignee_name: curata(d.destinatar.companie || d.destinatar.nume),
    consignee_county: codAutoAlJudetului(d.destinatar.judet) ?? "",
    consignee_locality: curata(d.destinatar.oras),
    consignee_address: strada(d.destinatar),
    consignee_postcode: curata(d.destinatar.codPostal),

    collection_date: d.dataRidicare,
    collection_open_time: d.oraDeschidereRidicare,
    collection_close_time: d.oraInchidereRidicare,

    delivery_date: d.dataLivrare,
    delivery_open_time: d.oraDeschidereLivrare,
    delivery_close_time: d.oraInchidereLivrare,

    /* ⚠ Cel putin un palet, si cel putin un kilogram: zero pe oricare dintre ele
       e o partida pe care Pall-Ex n-o poate nici tarifa, nici incarca. */
    pallet_count: Math.max(1, Math.floor(Number(d.numarPaleti) || 1)),
    /* ⚠ `format: int32` in specificatie — se rotunjeste in SUS, ca declaratia sa
       nu fie mai mica decat marfa. Sub-declararea o plateste comerciantul, la
       recantarirea din depozit. */
    pallet_weight: Math.max(1, Math.ceil(Number(d.greutateKg) || 0)),
  };

  /*
   * ⚠ Persoana de contact si telefonul sunt OPTIONALE in specificatie, dar se
   * trimit ori de cate ori le avem: la marfa paletizata soferul suna inainte sa
   * ajunga, iar o livrare de o tona la care nu raspunde nimeni se intoarce in
   * depozit pe cheltuiala comerciantului.
   */
  const contactExpeditor = curata(d.expeditor.contact ?? d.expeditor.nume);
  if (contactExpeditor) partida.consignor_contact = contactExpeditor;
  const telExpeditor = normalizePhone(d.expeditor.telefon);
  if (telExpeditor) partida.consignor_phone = telExpeditor;

  const contactDestinatar = curata(d.destinatar.contact ?? d.destinatar.nume);
  if (contactDestinatar) partida.consignee_contact = contactDestinatar;
  const telDestinatar = normalizePhone(d.destinatar.telefon);
  if (telDestinatar) partida.consignee_phone = telDestinatar;

  /*
   * Paletii pe bucata se trimit doar cand sunt COMPLETI: `Pallet` cere toate
   * patru dimensiunile. O lista partiala e respinsa cu totul, deci mai bine o
   * partida fara detaliu de palet decat una refuzata.
   */
  const paleti = (d.paleti ?? []).filter(paletComplet);
  if (paleti.length > 0) partida.pallets = paleti;

  if (s.liftLaRidicare) partida.has_collection_tail_lift = true;
  if (s.accesRestrictionatLaRidicare) partida.has_collection_restricted_access = true;
  if (s.liftLaLivrare) partida.has_delivery_tail_lift = true;
  if (s.accesRestrictionatLaLivrare) partida.has_delivery_restricted_access = true;
  if (s.programareLivrare) partida.has_delivery_bookin_required = true;
  if (s.depaletare) partida.has_depallet = true;
  if (s.livrareInSediu) partida.has_premises_delivery = true;
  if (s.asistareReceptie) partida.has_reception_assistance = true;

  /*
   * ⚠ Asigurarea se trimite DOAR cu o valoare strict pozitiva.
   *
   * `has_insurance: true` cu `insurance: 0` inseamna „asigura marfa pentru zero
   * lei": partida intra pe fluxul de asigurare, cu comisionul de rigoare, si nu
   * acopera nimic. Aceeasi capcana ca rambursul de zero lei la GLS.
   */
  const valoare = Number(d.valoare);
  if (s.asigurare && Number.isFinite(valoare) && valoare > 0) {
    partida.has_insurance = true;
    partida.insurance = Math.round(valoare * 100) / 100;
  }

  /* Serviciile de retur: steagul si numarul merg impreuna, minimul e 1. */
  if (s.returDocumente) {
    partida.has_return_documents = true;
    partida.return_documents_count = numarPozitiv(s.returDocumenteNumar);
    const detalii = curata(s.returDocumenteDetalii);
    if (detalii) partida.return_documents = detalii;
  }
  if (s.returInstrumente) {
    partida.has_return_instruments = true;
    partida.return_instruments_count = numarPozitiv(s.returInstrumenteNumar);
    const detalii = curata(s.returInstrumenteDetalii);
    if (detalii) partida.return_instruments = detalii;
  }
  if (s.returPaleti) {
    partida.has_return_pallets = true;
    partida.return_pallets_count = numarPozitiv(s.returPaletiNumar);
  }

  const referinta = curata(d.referinta).slice(0, MAX_REFERINTA);
  if (referinta) partida.client_reference = referinta;

  const observatii = curata(d.observatii);
  if (observatii) partida.client_notes = observatii;

  return partida;
}

/** Strada si eventualul detaliu (bloc, scara), intr-un singur camp. */
function strada(a: AdresaComanda): string {
  return curata([curata(a.strada), curata(a.stradaExtra)].filter(Boolean).join(", "));
}

function numarPozitiv(n: number | undefined): number {
  const v = Math.floor(Number(n) || 0);
  return v > 0 ? v : 1;
}

/** Un palet e complet doar cu toate cele patru masuratori strict pozitive. */
export function paletComplet(p: PaletPallEx | null | undefined): p is PaletPallEx {
  if (!p) return false;
  return [p.weight, p.length, p.width, p.height].every(
    (v) => Number.isFinite(Number(v)) && Number(v) > 0,
  );
}
