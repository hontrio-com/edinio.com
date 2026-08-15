import { normalizePhone } from "@/lib/utils/phone";
import type { NodXml } from "./xml";

/**
 * Construirea structurii `PacketAttributes` dintr-o comanda Edinio.
 *
 * ═══ DE CE E PUR, SI DE CE CONTEAZA MAI MULT DECAT LA CEILALTI ═══
 *
 * Nu atinge reteaua si nu citeste din baza, ca la toti transportatorii. Dar aici
 * miza e alta: **Packeta NU ARE metoda de anulare.** Lista lor de metode e
 * completa (24), si nu contine nimic de tip cancel/delete/storno; documentatia
 * spune pe deasupra ca nici editarea comenzilor exportate nu se poate prin API.
 *
 * Deci un colet creat gresit nu se mai poate nici corecta, nici sterge — se poate
 * doar anula din interfata lor, de mana. Fisierul asta e ultimul loc in care
 * greseala mai poate fi oprita.
 *
 * ⚠ De aceea fluxul de emitere cheama `packetAttributesValid()` INAINTE de
 * `createPacket()`. E gratis, nu creeaza nimic, si intoarce `AttributeFault{name,
 * fault}` — adica NUMELE campului gresit. Nicio alta integrare din platforma nu ne
 * da asta inainte de efectul real.
 *
 * ═══ ⚠ NUME SI PRENUME SUNT CAMPURI SEPARATE ═══
 *
 * Noi tinem `customer_name` ca un singur sir. Ei cer `name` si `surname`, 1-32
 * fiecare. Documentatia ingaduie sa trimitem tot sirul in `name`: „You may forward
 * the entire string as `name`, and we'll make every effort to discern the surname
 * from the first name on your behalf."
 *
 * **Nu ne bazam pe „every effort".** Despartim noi, dupa ULTIMUL spatiu, si numai
 * cand desparirea incape in plafoane. Ultimul, nu primul: in romana numele de
 * familie sta la sfarsit, iar „Ion Popescu Marian" trebuie sa dea `Ion Popescu` +
 * `Marian`, nu `Ion` + `Popescu Marian`. Cand nu merge (un singur cuvant, sau
 * bucati prea lungi), trimitem tot sirul in `name` si lasam pe seama lor — asa cum
 * ingaduie chiar documentatia — in loc sa taiem numele cuiva.
 *
 * ═══ ⚠ NU EXISTA CAMP `country` ═══
 *
 * „No `country` attribute exists in our `packetAttributes`, since the destination
 * country is inferred automatically based on the specified `addressId`." Deci
 * `addressId` hotaraste tara, moneda implicita si formatul de telefon asteptat.
 * Un id gresit trimite coletul in alta tara fara sa dea vreo eroare.
 *
 * ═══ ⚠ UNITATILE ═══
 *
 * `weight` in KILOGRAME (zecimal), `size` in MILIMETRI (intregi). Milimetrii sunt
 * capcana: Innoship si ceilalti cer centimetri, iar o confuzie inseamna un colet
 * declarat de zece ori mai mic.
 */

/* ── Plafoanele declarate in `data-structures-reference.mdx` ──────────────── */

export const LIMITE = {
  number: 36,
  name: 32,
  surname: 32,
  company: 32,
  street: 32,
  houseNumber: 16,
  city: 32,
  province: 32,
  note: 128,
  carrierPickupPoint: 32,
} as const;

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Taie la plafon, pe cuvinte cand se poate.
 *
 * ⚠ Se taie DOAR ce nu incape. Un plafon de 32 pe „strada" e strans pentru
 * adresele romanesti („Bulevardul Alexandru Ioan Cuza" are 29), deci taierea chiar
 * se intampla si trebuie sa lase ceva folositor, nu un cuvant rupt la mijloc.
 */
export function taie(text: string | null | undefined, max: number): string {
  const t = curata(text);
  if (t.length <= max) return t;
  const bucata = t.slice(0, max);
  const spatiu = bucata.lastIndexOf(" ");
  /* Numai daca ramane macar jumatate: altfel un prim cuvant lung ar lasa nimic. */
  return spatiu > max / 2 ? bucata.slice(0, spatiu) : bucata;
}

/**
 * Numele intreg → `{ name, surname }`.
 *
 * Regula, si de ce fiecare parte e asa:
 *   - fara spatiu (un singur cuvant): tot in `name`, `surname` gol. Ei cer ambele,
 *     dar un `surname` inventat ar fi mai rau decat unul pe care il completeaza ei;
 *   - cu spatiu: se rupe la ULTIMUL, fiindca numele de familie sta la sfarsit;
 *   - daca vreo bucata nu incape in 32, se trimite tot sirul in `name` (taiat) si
 *     `surname` gol — documentatia ingaduie anume asta, si e mai bine decat un nume
 *     ciuntit.
 */
export function despartuNume(intreg: string | null | undefined): { name: string; surname: string } {
  const t = curata(intreg);
  if (!t) return { name: "", surname: "" };

  const i = t.lastIndexOf(" ");
  if (i <= 0) return { name: taie(t, LIMITE.name), surname: "" };

  const prenume = t.slice(0, i);
  const familie = t.slice(i + 1);
  if (prenume.length <= LIMITE.name && familie.length <= LIMITE.surname) {
    return { name: prenume, surname: familie };
  }
  return { name: taie(t, LIMITE.name), surname: "" };
}

/**
 * Strada si numarul, despartite.
 *
 * ⚠ Feedul de curieri are steagul `separateHouseNumber`: „Indicates whether the
 * carrier requires a descriptive number to be entered in the houseNumber
 * parameter." Cand e aprins, numarul TREBUIE sa fie separat — altfel curierul
 * respinge sau livreaza gresit.
 *
 * Noi tinem strada si numarul deja separat pe adresa comenzii, deci in cazul
 * obisnuit nu e nimic de ghicit. Functia asta acopera doar cazul in care numarul
 * lipseste si trebuie scos din sirul strazii.
 */
export function despartuStrada(strada: string | null | undefined, numar: string | null | undefined): { street: string; houseNumber: string } {
  const s = curata(strada);
  const n = curata(numar);
  if (n) return { street: taie(s, LIMITE.street), houseNumber: taie(n, LIMITE.houseNumber) };

  /* Ultima bucata care incepe cu o cifra, la sfarsitul sirului: „Aleea Zorilor 12B". */
  const m = /^(.*?)[\s,]+(\d[\dA-Za-z\/-]*)$/.exec(s);
  if (m && m[1].trim()) {
    return { street: taie(m[1], LIMITE.street), houseNumber: taie(m[2], LIMITE.houseNumber) };
  }
  return { street: taie(s, LIMITE.street), houseNumber: "" };
}

/**
 * Telefonul, in forma pe care o cere regexul lor pentru Romania.
 *
 * `phone-number-formats.mdx` cere prefixul de tara `40`. Al nostru se tine in
 * forma locala („07…"), deci se traduce aici.
 *
 * ⚠ Se trimite cu `+`. Toate exemplele lor de telefon din documentatie il au
 * (`+420777777777`, `+48698183542`), iar forma internationala nu poate fi citita
 * gresit ca numar local al altei tari.
 *
 * Un numar care nu se poate aduce la forma asta se intoarce GOL, si atunci
 * emiterea se opreste in `lipsuriExpediere`. Un telefon gresit inseamna un colet
 * pe care curierul nu-l poate anunta.
 */
export function telefonPacketa(brut: string | null | undefined): string {
  const local = normalizePhone(brut);
  if (!local) return "";
  if (local.startsWith("+")) return local;
  /* Forma romaneasca „07xxxxxxxx" → „+407xxxxxxxx”. */
  const cifre = local.replace(/\D/g, "");
  if (cifre.length === 10 && cifre.startsWith("0")) return `+40${cifre.slice(1)}`;
  if (cifre.length === 11 && cifre.startsWith("40")) return `+${cifre}`;
  return "";
}

/**
 * Greutatea, in kilograme.
 *
 * ⚠ NU se rotunjeste in sus la kilogram intreg: campul e zecimal, iar exemplele
 * lor trimit `2.5`. Se pastreaza trei zecimale, ca la Posta.
 */
export function greutatePacketa(kg: unknown): string {
  const n = Number(kg);
  const val = Number.isFinite(n) && n > 0 ? n : GREUTATE_MINIMA_KG;
  return String(Math.max(GREUTATE_MINIMA_KG, Math.round(val * 1000) / 1000));
}

/** Sub asta nu coboara nimic: un plic tot cantareste. */
export const GREUTATE_MINIMA_KG = 0.1;

/**
 * Bani, cu cel mult doi zecimali.
 *
 * ⚠ Rotunjirea pentru RON NU E DOCUMENTATA. Documentatia da regula generala
 * („multiplu al celei mai mici valori nominale a monedei") si exemple doar pentru
 * CZK (intreg), HUF (multiplu de 5) si EUR (doi zecimali). Pentru RON nu spune
 * nimic, deci NU inventam o rotunjire la leu: se trimite suma exacta, cu banii ei.
 * Daca furnizorul o refuza, refuzul spune ce vrea — pe cand o rotunjire tacuta a
 * noastra ar incasa de la client alta suma decat cea din comanda.
 */
export function baniPacketa(v: unknown): string {
  const n = Number(v);
  const val = Number.isFinite(n) && n > 0 ? n : 0;
  return String(Math.round(val * 100) / 100);
}

/* ── Intrarile ────────────────────────────────────────────────────────────── */

export type AdresaPacketa = {
  nume: string;
  companie?: string | null;
  strada?: string | null;
  numar?: string | null;
  oras?: string | null;
  judet?: string | null;
  codPostal?: string | null;
  telefon?: string | null;
  email?: string | null;
};

export type DateExpediere = {
  destinatar: AdresaPacketa;
  /** Numarul comenzii din magazin. Al lor: „A unique ID of the order (from your e-shop)". */
  numarComanda: string;
  /**
   * ⚠ CHEIA CARE HOTARASTE TOT: punct de ridicare, cutie automata sau curier de
   * livrare la adresa — toate sunt „branch entries" din acelasi spatiu de id-uri.
   * Tara si moneda decurg din el.
   */
  addressId: string;
  greutateKg: number;
  /** Valoarea marfii. OBLIGATORIE la ei (asigurare). */
  valoare: number;
  /** Suma de incasat la livrare. 0 sau lipsa = fara ramburs. */
  ramburs?: number;
  /**
   * Eticheta expeditorului din contul lor.
   *
   * ⚠ Un nume care nu exista CREEAZA tacut un expeditor nou, si aia strica
   * facturarea: „If the entered sender does not exist yet, a new one is created."
   * De aia vine dintr-o setare a magazinului si nu se deduce niciodata din altceva.
   */
  eshop: string;
  /** Codul punctului, cand curierul extern cere unul (`carrierPickupPoint`). */
  punctCurier?: string | null;
  /** Doar cand curierul cere marimea. ⚠ In MILIMETRI. */
  dimensiuniMm?: { lungime: number; latime: number; inaltime: number } | null;
  nota?: string | null;
  /** `true` doar la punctele Packeta din CZ/SK/HU/RO; la curieri nu functioneaza. */
  doarMajori?: boolean;
  /** Livrare la adresa: atunci strada, numarul, orasul si codul postal sunt obligatorii. */
  laAdresa: boolean;
  /** `separateHouseNumber` din feedul de curieri. */
  numarSeparat?: boolean;
};

/**
 * Ce lipseste ca sa se poata emite.
 *
 * ⚠ Se verifica AICI tot ce se poate verifica local, si din acelasi motiv ca la
 * Posta: raspunsul de refuz al furnizorului vine intr-o forma pe care documentatia
 * n-o descrie pentru REST (exista doar lista de nume de fault-uri si un exemplu
 * PHP de SOAP), deci nu ne putem baza ca-l vom putea traduce in ceva folositor.
 *
 * La Packeta miza e in plus: coletul creat nu se mai poate sterge.
 */
export function lipsuriExpediere(d: DateExpediere): string[] {
  const lipsuri: string[] = [];
  const dest = d.destinatar;

  if (!curata(d.numarComanda)) lipsuri.push("numarul comenzii");
  if (!curata(d.addressId)) lipsuri.push("punctul sau curierul de livrare");
  if (!curata(d.eshop)) lipsuri.push("eticheta de expeditor (eshop) din configurare");

  const { name } = despartuNume(dest.nume);
  if (!name) lipsuri.push("numele destinatarului");

  /*
   * ⚠ EMAIL SAU TELEFON — cel putin unul. Documentatia le cere asa, si e singura
   * conditie „sau" din toata structura.
   */
  const tel = telefonPacketa(dest.telefon);
  const mail = curata(dest.email);
  if (!tel && !mail) lipsuri.push("telefonul sau emailul destinatarului");
  if (curata(dest.telefon) && !tel) lipsuri.push("un telefon valid (Packeta cere prefixul de tara)");

  if (!(Number(d.valoare) > 0)) lipsuri.push("valoarea coletului (Packeta o cere pentru asigurare)");

  if (d.laAdresa) {
    const { street, houseNumber } = despartuStrada(dest.strada, dest.numar);
    if (!street) lipsuri.push("strada");
    /* Numai cand curierul chiar o cere: altfel un numar lipsa nu opreste nimic. */
    if (d.numarSeparat && !houseNumber) lipsuri.push("numarul (curierul ales il cere separat)");
    if (!curata(dest.oras)) lipsuri.push("orasul");
    if (!curata(dest.codPostal)) lipsuri.push("codul postal");
  }

  return lipsuri;
}

/**
 * `PacketAttributes`, gata de trimis.
 *
 * ⚠ Campurile care lipsesc NU se trimit ca sir gol: `undefined` scoate elementul
 * din document (vezi `xml.ts`). Un `<cod></cod>` ar declara o valoare, pe cand
 * lipsa lui il lasa pe implicitul lor.
 */
export function construiesteAtribute(d: DateExpediere): NodXml {
  const dest = d.destinatar;
  const { name, surname } = despartuNume(dest.nume);
  const tel = telefonPacketa(dest.telefon);
  const mail = curata(dest.email);
  const ramburs = Number(d.ramburs);

  const atribute: NodXml = {
    number: taie(d.numarComanda, LIMITE.number),
    name,
    surname: surname || undefined,
    company: taie(dest.companie, LIMITE.company) || undefined,
    email: mail || undefined,
    phone: tel || undefined,
    addressId: curata(d.addressId),
    /* ⚠ `cod` se trimite DOAR cand chiar exista ramburs. Un `0` explicit e o
       declaratie („ramburs de zero lei") pe care nu avem motiv s-o facem. */
    cod: Number.isFinite(ramburs) && ramburs > 0 ? baniPacketa(ramburs) : undefined,
    value: baniPacketa(d.valoare),
    /* `currency` se OMITE dinadins: „If not explicitly specified, our system will
       default to assuming the values are in the currency of the destination
       country." Tara vine din `addressId`, deci pe un id romanesc implicitul e RON
       — iar o moneda scrisa de noi ar putea contrazice tara aleasa. */
    weight: greutatePacketa(d.greutateKg),
    eshop: curata(d.eshop),
    note: taie(d.nota, LIMITE.note) || undefined,
    carrierPickupPoint: taie(d.punctCurier, LIMITE.carrierPickupPoint) || undefined,
    adultContent: d.doarMajori ? "1" : undefined,
  };

  if (d.laAdresa) {
    const { street, houseNumber } = despartuStrada(dest.strada, dest.numar);
    atribute.street = street;
    atribute.houseNumber = houseNumber || undefined;
    atribute.city = taie(dest.oras, LIMITE.city);
    atribute.zip = curata(dest.codPostal);
    atribute.province = taie(dest.judet, LIMITE.province) || undefined;
  }

  if (d.dimensiuniMm) {
    /* ⚠ MILIMETRI, intregi. Vezi antetul: ceilalti curieri cer centimetri. */
    const m = (x: number) => String(Math.max(1, Math.round(Number(x) || 0)));
    atribute.size = {
      length: m(d.dimensiuniMm.lungime),
      width: m(d.dimensiuniMm.latime),
      height: m(d.dimensiuniMm.inaltime),
    };
  }

  return atribute;
}
