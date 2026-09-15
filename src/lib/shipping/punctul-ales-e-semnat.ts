import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUNCTUL ALES E SEMNAT DE SERVER                               (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pana azi, punctul de ridicare ajungea pe comanda EXACT cum il trimitea browserul: `locker_id`,
 * `locker_name`, `locker_address`, `locker_city`, `locker_county`, `locker_post_code`. Nimeni nu
 * verifica nimic. Iar la emitere, campurile alea nu sunt decorative:
 *
 *   * la Sameday, `locker_city` si `locker_county` INLOCUIESC destinatarul de pe AWB;
 *   * la DPD, `pickupOfficeId` vine din `Number(locker_id)`, iar `recipientCity` si
 *     `recipientCounty` se suprascriu din aceleasi siruri.
 *
 * Deci cumparatorul putea cota o localitate si emite cu metadatele altui punct, din alt oras, sau
 * cu un id care nu apartine deloc retelei curierului ales.
 *
 * ═══ ⚠ DE CE NU SE VERIFICA LA EMITERE, CUM PARE FIRESC ═══
 *
 * Fiindca acolo lista canonica nu e la indemana, si costa. Masurat in clientul Sameday: contul de
 * productie are 7.021 de lockere, aduse in 15 cereri paginate. `getLockers` le tine intr-un
 * `CacheScurt` PER INSTANTA, deci la emitere cache-ul e rece tocmai cand comerciantul apasa, iar
 * peste el sta si un plafon durabil (`lockers:biz`, 300 la 10 minute) impartit cu cumparatorii.
 * O paza pusa acolo ar fi consumat bugetul checkoutului ca sa repare altceva si ar fi intors
 * LISTA GOALA la depasire, adica ar fi refuzat fiecare AWB la punct.
 *
 * ═══ SE LEAGA LA ALEGERE, UNDE SERVERUL ARE DEJA PUNCTUL IN MANA ═══
 *
 * Cand `getLockers` serveste lista, fiecare punct a venit chiar de la curier. Atunci se semneaza,
 * fara niciun apel in plus. La plasarea comenzii se verifica semnatura si se scriu campurile din
 * TOKEN, nu cele din cerere.
 *
 * ⚠ TOKENUL POARTA CAMPURILE, NU DOAR LE SEMNEAZA. Daca ar semna numai id-ul, verificarea ar avea
 * nevoie de nume, adresa si oras de la browser ca sa refaca MAC-ul, adica exact de sirurile in care
 * nu avem incredere. Asa, tokenul E fisa punctului: ce trimite browserul pe langa el se arunca.
 *
 * ⚠ SI NU INTRA IN `amprenta()` COTATIEI. Motivul e scris in `quote-token.ts`: punctul se alege
 * DUPA cotare, iar legat de cotatie ar fi facut sa cada fiecare comanda cinstita la locker. E un
 * token propriu, cu viata lui.
 */

/**
 * Cat traieste un punct semnat.
 *
 * ⚠ Mai scurt decat cotatia (24 de ore), si dinadins: lista de puncte se schimba mai des decat
 * tarifele, iar un punct inchis intre timp e o livrare esuata, nu un pret gresit. Doua ore acopera
 * lejer drumul de la alegere pana la „Plaseaza comanda".
 */
const VALABILITATE_MS = 2 * 60 * 60 * 1000;

/** Campurile care se scriu pe comanda, si exact ele. */
export type PunctCanonic = {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  postCode?: string;
};

/**
 * Identitatea sub care a fost servit punctul.
 *
 * ⚠ `retea` e obligatorie, nu optionala la coada, si nu din pedanterie: la FAN acelasi `locker_id`
 * poate fi un FANbox, un PayPoint sau un oficiu, iar la SmartShip un easybox sau un FANbox. Sunt
 * nomenclatoare diferite, cu id-uri din spatii diferite, emise cu servicii diferite. Optionala,
 * exact ea s-ar fi uitat la un apelant nou, iar un punct dintr-o retea ar fi trecut drept punct
 * din alta.
 */
export type IdentitateaPunctului = {
  businessId: string;
  curier: string;
  retea: string;
};

function secret(): string {
  const s = process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  /*
   * ⚠ ARUNCA. Nu cade pe sirul gol.
   *
   * Acelasi tipar si acelasi motiv ca la `semnaturaCheii` (`lib/utils/cheie-neghicibila.ts`): cu
   * `""`, `createHmac` merge mai departe si scoate o semnatura pe care o poate calcula oricine,
   * iar nimic n-ar deosebi un punct semnat de unul inventat. O degradare tacuta de securitate e
   * mai rea decat o eroare zgomotoasa: aici alegerea punctului se opreste si cineva pune variabila.
   */
  if (!s) {
    throw new Error(
      "Lipseste secretul de semnare a punctelor de ridicare (SHIPPING_QUOTE_SECRET sau "
      + "SUPABASE_SERVICE_ROLE_KEY). Fara el, un punct din alta retea sau din alt oras ar putea fi "
      + "trimis de browser drept punct ales.",
    );
  }
  return s;
}

/** Normalizata, ca sa semneze la fel la alegere si la comanda. */
function parte(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * Sirul peste care se face MAC-ul.
 *
 * ⚠ ORDINEA E FIXA SI SCRISA DE MANA, nu din `Object.keys`: doua obiecte cu aceleasi valori dar
 * alta ordine a cheilor ar da amprente diferite, si atunci fiecare comanda cinstita ar fi cazut.
 * Acelasi motiv ca la `amprentaPlanului`.
 *
 * ⚠ Despartitorul e U+001F (separatorul de unitati), nu `|`: numele si adresele punctelor chiar
 * contin bare verticale la unii curieri, iar un despartitor care apare in date lasa doua puncte
 * diferite sa produca acelasi sir.
 */
/*
 * ⚠ CONSTRUIT DIN COD, NU SCRIS CA LITERAL.
 *
 * U+001F e invizibil: lipit intre ghilimele, `join("…")` arata la citire ca `join("")`, si
 * atunci despartitorul pare sa lipseasca. Mi s-a intamplat chiar aici, si era sa scriu o
 * indreptare pentru un defect care nu exista. Construit din cod, se VEDE ca exista.
 */
const DESPARTITOR = String.fromCharCode(0x1f);

function sirulPunctului(ident: IdentitateaPunctului, p: PunctCanonic): string {
  return [
    parte(ident.businessId),
    parte(ident.curier).toLowerCase(),
    parte(ident.retea).toLowerCase(),
    parte(p.id),
    parte(p.name),
    parte(p.address),
    parte(p.city),
    parte(p.county),
    parte(p.postCode),
  ].join(DESPARTITOR);
}

/**
 * Semneaza un punct servit de curier.
 *
 * Forma: `<fisa in base64url>.<expira>.<mac>`. Fisa calatoreste in clar fiindca verificarea trebuie
 * sa aiba de unde lua campurile canonice fara sa le ceara browserului; MAC-ul o acopera, deci
 * rescrisa de mana nu mai bate.
 */
export function semneazaPunctul(
  ident: IdentitateaPunctului,
  p: PunctCanonic,
  expiraLa?: number,
): string {
  const expira = expiraLa ?? Date.now() + VALABILITATE_MS;
  const fisa: PunctCanonic = {
    id: parte(p.id),
    name: parte(p.name),
    address: parte(p.address),
    city: parte(p.city),
    county: parte(p.county),
    ...(parte(p.postCode) ? { postCode: parte(p.postCode) } : {}),
  };
  const incarcatura = Buffer.from(JSON.stringify(fisa), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret())
    .update(`${sirulPunctului(ident, fisa)}${DESPARTITOR}${expira}`)
    .digest("base64url");
  return `${incarcatura}.${expira}.${mac}`;
}

export type VerdictPunct =
  | { ok: true; punct: PunctCanonic }
  | { ok: false; motiv: "lipsa" | "forma" | "expirat" | "semnatura" };

/**
 * Chiar am servit noi punctul asta, pentru magazinul, curierul si reteaua astea?
 *
 * ⚠ Verdictul are MOTIV, nu e un boolean, din acelasi motiv ca la `verificaCotatia`: apelantul
 * trebuie sa poata spune omului ce s-a intamplat („alege din nou punctul" fata de „ceva e stricat"),
 * iar un boolean ar fi facut din toate un singur mesaj.
 */
export function verificaPunctul(
  token: string | null | undefined,
  ident: IdentitateaPunctului,
): VerdictPunct {
  if (!token || !ident.businessId) return { ok: false, motiv: "lipsa" };

  const bucati = token.split(".");
  /* ⚠ STRICT trei: o bucata lipita la coada nu are voie sa treaca. */
  if (bucati.length !== 3) return { ok: false, motiv: "forma" };

  const expira = Number(bucati[1]);
  if (!Number.isFinite(expira)) return { ok: false, motiv: "forma" };
  if (expira < Date.now()) return { ok: false, motiv: "expirat" };

  let fisa: PunctCanonic;
  try {
    const brut = JSON.parse(Buffer.from(bucati[0], "base64url").toString("utf8")) as unknown;
    if (!brut || typeof brut !== "object") return { ok: false, motiv: "forma" };
    const o = brut as Record<string, unknown>;
    /*
     * ⚠ Campurile se citesc PE NUME si se normalizeaza la sir. Un `id` numeric, un `name` null sau
     * un camp in plus strecurat in fisa n-au voie sa schimbe nici sirul semnat, nici ce se scrie pe
     * comanda: altfel doua fise diferite ar putea produce acelasi MAC.
     */
    fisa = {
      id: parte(o.id as string),
      name: parte(o.name as string),
      address: parte(o.address as string),
      city: parte(o.city as string),
      county: parte(o.county as string),
      ...(parte(o.postCode as string) ? { postCode: parte(o.postCode as string) } : {}),
    };
  } catch {
    return { ok: false, motiv: "forma" };
  }

  if (!fisa.id) return { ok: false, motiv: "forma" };

  const macAsteptat = createHmac("sha256", secret())
    .update(`${sirulPunctului(ident, fisa)}${DESPARTITOR}${expira}`)
    .digest("base64url");

  const a = Buffer.from(macAsteptat);
  const b = Buffer.from(bucati[2]);
  if (a.length !== b.length) return { ok: false, motiv: "semnatura" };
  try {
    if (!timingSafeEqual(a, b)) return { ok: false, motiv: "semnatura" };
  } catch {
    return { ok: false, motiv: "semnatura" };
  }

  return { ok: true, punct: fisa };
}
