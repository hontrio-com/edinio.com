import { normalizePhone } from "@/lib/utils/phone";
import type { ColetShipo, CorpTarife, ServiciuShipo, ShipoConfig, TipAdresa } from "./client";
import { continutShipo, localitateShipo, sectorShipo } from "./localitati";

/**
 * Construirea cererilor Shipo dintr-o comanda Edinio.
 *
 * ═══ DE CE E PUR ═══
 *
 * Nu atinge reteaua si nu citeste din baza. Shipo ARE `POST /shipment/validate`,
 * deci spre deosebire de SmartShip se poate afla ca o adresa e gresita fara sa
 * platesti un transport — dar validarea aia costa un dus-intors si nu spune nimic
 * despre ce am uitat sa punem in corp. Probele de langa fisierul asta raman
 * singura verificare care se poate face inainte de prima cheie de cont.
 *
 * ═══ ⚠ CELE DOUA FELURI DE ID DIN ACELASI CAMP ═══
 *
 * `recipient_address_id` inseamna:
 *   - la serviciile `address`: id-ul unei adrese SALVATE a destinatarului;
 *   - la serviciile `locker`/`pudo`: id-ul PUNCTULUI din `GET /points`.
 *
 * ⚠ Iar la noi prima varianta NU se poate folosi deloc, si e bine de stiut de ce:
 * documentatia lor spune explicit ca `/client/address_list` intoarce DOAR adrese
 * de expeditor, si ca adresele de destinatar „nu sunt momentan expuse prin API".
 * Deci la livrarea la adresa se trimit intotdeauna campurile individuale, iar
 * `recipient_address_id` se foloseste EXCLUSIV pentru punctul de ridicare.
 *
 * Asta simplifica o capcana intr-o regula: campul e ori punct, ori absent.
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
};

export type FelLivrare = "domiciliu" | "locker";

export type DateExpediere = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string | null;
  nota?: string | null;
  ramburs?: number;
  valoareDeclarata?: number;
  numarColete?: number;
  /** Colete cu dimensiuni diferite. Prezente, au prioritate fata de cele simple. */
  colete?: ColetShipo[] | null;
  felLivrare: FelLivrare;
  /** Punctul ales de cumparator. Obligatoriu la `felLivrare: "locker"`. */
  punctId?: number | null;
};

/** Spatiile multiple si cele de la capete se strang; restul textului ramane intreg. */
export function curata(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Plafoanele.
 *
 * ⚠ TOATE sunt ALE LOR, transcrise din tabelul de parametri — spre deosebire de
 * SmartShip, unde documentatia nu declara nicio lungime si a trebuit sa inventam
 * plafoane. Aici se taie exact acolo unde taie si ei, deci nu pierdem nimic in
 * plus si nu cadem la validare.
 */
export const LUNGIMI = {
  continut: 40,
  nota: 40,
  nume: 48,
  companie: 35,
  telefon: 48,
  email: 80,
  strada: 48,
  numarStrada: 10,
  detaliuAdresa: 10,
} as const;

/** Greutatea minima trimisa. Aceeasi cu cea din `lib/shipping/awb-weight.ts`. */
export const GREUTATE_MINIMA_KG = 0.1;

/**
 * Dimensiunile implicite, in CENTIMETRI.
 *
 * Sunt chiar cele din documentatia lor („Implicit: 1 colet 30x20x10cm, 1kg").
 * ⚠ Nu sunt decor: curierii din spate factureaza pe maximul dintre greutatea
 * fizica si cea volumetrica, deci dimensiuni prea mari scumpesc fiecare colet.
 */
export const DIMENSIUNI_IMPLICITE = { lungime: 30, latime: 20, inaltime: 10 } as const;

/**
 * Valoarea declarata, cand se asigura coletul.
 *
 * ⚠ Intervalul e AL LOR: „Intre 1 si 5000". Peste 5000 cererea cade la validare,
 * deci se plafoneaza aici — o comanda de 8000 de lei se asigura la 5000, ceea ce
 * e mai bine decat sa nu plece deloc, si comerciantul vede plafonul in panou.
 */
export const VALOARE_DECLARATA = { min: 1, max: 5000 } as const;

function taie(text: string | null | undefined, max: number): string {
  return curata(text).slice(0, max).trim();
}

/**
 * Numarul de la adresa, scos din campul lui sau din textul strazii.
 *
 * ⚠ DE CE EXISTA. Shipo cere `recipient_address_street_no` separat de strada
 * („Obligatoriu daca nu se foloseste recipient_address_id"), dar platforma nu are
 * de unde sa i-l dea: checkout-ul are UN SINGUR camp de adresa, iar
 * `shipping_address` scrie doar `address` — `street_no` nu se completeaza
 * nicaieri, la nicio comanda.
 *
 * Cerut ca un camp de sine statator, ar fi blocat emiterea la domiciliu pentru
 * TOATE comenzile din magazin, si numai la Shipo: ceilalti curieri primesc adresa
 * intreaga pe un rand.
 *
 * Se cauta intai forma explicita („nr. 25", „Nr 25A"), apoi primul grup de cifre
 * din adresa. Cand nu exista niciunul, se intoarce sirul gol si `lipsuriExpediere`
 * opreste — o adresa fara niciun numar chiar nu se poate livra.
 */
export function numarDinAdresa(strada?: string | null, numar?: string | null): string {
  const n = curata(numar);
  if (n) return n;
  const s = curata(strada);
  const explicit = /\bnr\.?\s*(\d[\dA-Za-z/-]*)/i.exec(s);
  if (explicit) return explicit[1];
  const primul = /(?:^|[\s,])(\d[\dA-Za-z/-]*)/.exec(s);
  return primul ? primul[1] : "";
}

/** Coletele, in forma pe care o cer ei. Cel putin unul, mereu. */
export function coleteDinDate(date: DateExpediere, config: ShipoConfig): ColetShipo[] {
  if (date.colete?.length) {
    return date.colete.map((c) => ({
      length: Math.max(1, Math.round(c.length || DIMENSIUNI_IMPLICITE.lungime)),
      width: Math.max(1, Math.round(c.width || DIMENSIUNI_IMPLICITE.latime)),
      height: Math.max(1, Math.round(c.height || DIMENSIUNI_IMPLICITE.inaltime)),
      weight: Math.max(GREUTATE_MINIMA_KG, Number(c.weight) || GREUTATE_MINIMA_KG),
    }));
  }

  const bucati = Math.max(1, Math.floor(date.numarColete ?? 1));
  const total = Math.max(GREUTATE_MINIMA_KG, Number(date.greutateKg) || GREUTATE_MINIMA_KG);
  /*
   * Greutatea se imparte EGAL pe colete, si se rotunjeste in sus la 100 g: suma
   * bucatilor trebuie sa acopere totalul, altfel curierul recantareste si
   * factureaza diferenta comerciantului.
   */
  const peBucata = Math.max(GREUTATE_MINIMA_KG, Math.ceil((total / bucati) * 10) / 10);

  return Array.from({ length: bucati }, () => ({
    length: Math.max(1, Math.round(config.lungime_cm ?? DIMENSIUNI_IMPLICITE.lungime)),
    width: Math.max(1, Math.round(config.latime_cm ?? DIMENSIUNI_IMPLICITE.latime)),
    height: Math.max(1, Math.round(config.inaltime_cm ?? DIMENSIUNI_IMPLICITE.inaltime)),
    weight: peBucata,
  }));
}

/**
 * Corpul pentru `POST /rates`.
 *
 * ⚠ `sender_city` NU e un oras: e id-ul adresei de ridicare din configurare.
 * `delivery_city` in schimb chiar e un nume. Asimetria e a lor, si e scrisa aici
 * o singura data ca sa nu fie descoperita de fiecare apelant pe rand.
 */
export function corpTarife(config: ShipoConfig, date: DateExpediere): CorpTarife {
  const corp: CorpTarife = {
    sender_city: Number(config.sender_address_id),
    delivery_city: localitateShipo(date.destinatar.oras, date.destinatar.judet),
    parcels: coleteDinDate(date, config),
  };
  /* `cod` se trimite doar cand exista: la ei „0 daca nu se aplica", dar un zero
     explicit nu strica si il trimitem oricum pentru limpezime. */
  corp.cod = Math.max(0, Number(date.ramburs) || 0);

  const permisi = (config.curieri_permisi ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (permisi.length) corp.courier = permisi;

  return corp;
}

/**
 * Serviciul livreaza intr-un punct (locker sau PUDO)?
 *
 * Se citeste din `/rates/services`, singurul loc unde exista tipul adreselor —
 * raspunsul lui `/rates` NU-l contine. Vezi `servicii()` din client.
 */
export function livreazaInPunct(serviciu: Pick<ServiciuShipo, "recipient_address_type">): boolean {
  return serviciu.recipient_address_type === "locker" || serviciu.recipient_address_type === "pudo";
}

export function ridicaDinPunct(serviciu: Pick<ServiciuShipo, "sender_address_type">): boolean {
  return serviciu.sender_address_type === "locker" || serviciu.sender_address_type === "pudo";
}

/** Ce lipseste din CONFIGURARE ca sa se poata cota sau emite. Vina magazinului. */
export function lipsuriConfigurare(config: ShipoConfig | null | undefined): string[] {
  const lipsuri: string[] = [];
  if (!config?.enabled) lipsuri.push("integrarea Shipo nu e pornita");
  if (!(config?.api_key ?? "").trim()) lipsuri.push("cheia de API");
  if (!(Number(config?.sender_address_id) > 0)) lipsuri.push("adresa de ridicare");
  return lipsuri;
}

/**
 * Ce lipseste din COMANDA ca sa se poata emite. Vina datelor, nu a magazinului.
 *
 * ⚠ Despartirea de `lipsuriConfigurare` nu e cosmetica: alerta din checkout care
 * dadea vina pe magazin si pentru o adresa incompleta a clientului a fost un
 * defect real, gasit la SmartShip. Ce tine de cumparator se rezolva tacut, in
 * formular; ce tine de comerciant se striga in panou.
 */
export function lipsuriExpediere(date: DateExpediere, serviciu: Pick<ServiciuShipo, "recipient_address_type">): string[] {
  const lipsuri: string[] = [];
  const d = date.destinatar;

  if (!curata(d.nume)) lipsuri.push("numele destinatarului");
  if (!normalizePhone(d.telefon ?? "")) lipsuri.push("telefonul destinatarului");

  if (livreazaInPunct(serviciu)) {
    if (!(Number(date.punctId) > 0)) lipsuri.push("punctul de ridicare");
    /*
     * ⚠ Emailul e OBLIGATORIU la locker si PUDO, si documentatia lor spune si de
     * ce: acolo se trimite CODUL de ridicare. Fara el, coletul ajunge in locker
     * si clientul nu-l poate scoate.
     */
    if (!curata(d.email)) lipsuri.push("emailul destinatarului (acolo se trimite codul de ridicare)");
    return lipsuri;
  }

  if (!curata(d.oras)) lipsuri.push("orasul destinatarului");
  if (!curata(d.strada)) lipsuri.push("strada destinatarului");
  if (!numarDinAdresa(d.strada, d.numar)) lipsuri.push("numarul de la adresa destinatarului");

  /*
   * ⚠ In Bucuresti, sectorul e obligatoriu la ei. `null` inseamna „e Bucuresti si
   * nu stiu care sector" — si nu se ghiceste niciodata.
   */
  if (sectorShipo(d.oras, d.judet, `${d.strada} ${d.numar ?? ""}`) === null) {
    lipsuri.push("sectorul (obligatoriu in Bucuresti)");
  }

  return lipsuri;
}

/**
 * Corpul pentru `POST /shipment` si `POST /shipment/validate`.
 *
 * ⚠ ACELASI constructor pentru amandoua, si asta e tot rostul lui: documentatia
 * spune „Aceiasi parametri ca POST /shipment". Scrise separat, validarea ar
 * verifica alt corp decat cel emis — adica exact nimic.
 *
 * ⚠ BOOLEENELE PLEACA DOAR CAND SUNT APRINSE, si ca booleene adevarate. Pana la
 * 23.07.2026 ei citeau `"false"` ca ADEVARAT si facturau asigurare si deschidere
 * la livrare nedorite; acum resping orice nu e `true|false|1|0|"1"|"0"|"true"|"false"`,
 * deci un `undefined` scapat in JSON ar cadea la validare.
 */
export function corpExpediere(
  config: ShipoConfig,
  date: DateExpediere,
  serviciu: Pick<ServiciuShipo, "id" | "recipient_address_type" | "sender_address_type">,
): Record<string, unknown> {
  const d = date.destinatar;
  const ramburs = Math.max(0, Number(date.ramburs) || 0);

  const corp: Record<string, unknown> = {
    rate_id: serviciu.id,
    contents: continutShipo(date.continut ?? config.continut_implicit),
    parcels: coleteDinDate(date, config),
    /*
     * ⚠ Adresa de ridicare a MAGAZINULUI, mereu id de adresa salvata.
     *
     * Nu emitem niciodata cu ridicare din locker, deci exceptia FAN Courier din
     * documentatia lor („la serviciile FAN cu ridicare din locker adresa
     * expeditorului ramane obligatorie") nu ne atinge. Daca vreodata se adauga
     * ridicarea din punct, ACOLO trebuie citita nota aia, nu aici.
     */
    sender_address_id: Number(config.sender_address_id),
    recipient_name: taie(d.nume, LUNGIMI.nume),
    recipient_phone: normalizePhone(d.telefon ?? "") || taie(d.telefon, LUNGIMI.telefon),
  };

  const nota = taie(date.nota, LUNGIMI.nota);
  if (nota) corp.note = nota;

  const companie = taie(d.companie, LUNGIMI.companie);
  if (companie) corp.recipient_company_name = companie;

  const email = taie(d.email, LUNGIMI.email);
  if (email) corp.recipient_email = email;

  if (ramburs > 0) {
    corp.cod = ramburs;
    /* „Se aplica doar daca expedierea are cod > 0" — al lor, cuvant cu cuvant. */
    if (config.ramburs_turbo) corp.quick_cod = true;
  }

  if (config.asigura_coletul) {
    const valoare = Math.round(Number(date.valoareDeclarata) || 0);
    if (valoare >= VALOARE_DECLARATA.min) {
      corp.insurance = true;
      corp.declared_value = Math.min(valoare, VALOARE_DECLARATA.max);
    }
    /*
     * ⚠ Sub 1 leu NU se aprinde asigurarea: `declared_value` e „Obligatoriu daca
     * insurance=true. Intre 1 si 5000". Un `insurance: true` fara valoare valida
     * ar face cererea sa cada la validare, deci comanda n-ar mai pleca deloc.
     */
  }

  if (config.deschidere_la_livrare) corp.open_on_delivery = true;
  if (config.notifica_destinatarul) corp.notify_recipient = true;

  if (livreazaInPunct(serviciu)) {
    /* ⚠ Aici `recipient_address_id` e ID DE PUNCT, nu de adresa salvata. */
    corp.recipient_address_id = Number(date.punctId);
    /* Fara campuri de adresa: le refuza, si oricum nu inseamna nimic la un locker. */
    return corp;
  }

  corp.oras_sosire = localitateShipo(d.oras, d.judet);
  corp.strada_sosire = taie(d.strada, LUNGIMI.strada);
  corp.recipient_address_street_no = taie(numarDinAdresa(d.strada, d.numar), LUNGIMI.numarStrada);

  const sector = sectorShipo(d.oras, d.judet, `${d.strada} ${d.numar ?? ""}`);
  /* `undefined` = nu e Bucuresti, deci campul nu se trimite deloc. `null` a fost
     deja oprit de `lipsuriExpediere`. */
  if (typeof sector === "number") corp.recipient_address_sector = sector;

  const bloc = taie(d.bloc, LUNGIMI.detaliuAdresa);
  if (bloc) corp.recipient_address_building = bloc;
  const scara = taie(d.scara, LUNGIMI.detaliuAdresa);
  if (scara) corp.recipient_address_entrance = scara;
  const etaj = taie(d.etaj, LUNGIMI.detaliuAdresa);
  if (etaj) corp.recipient_address_floor = etaj;
  const ap = taie(d.apartament, LUNGIMI.detaliuAdresa);
  if (ap) corp.recipient_address_apartment = ap;

  /* ⚠ „exact 6 cifre" e cerinta LOR. Un cod postal de 5 cifre trimis oricum ar
     face cererea sa cada pentru o informatie care nu e obligatorie. */
  const cod = curata(d.codPostal).replace(/\D/g, "");
  if (cod.length === 6) corp.recipient_address_postal_code = cod;

  return corp;
}

/** Tipurile de adresa pe care le acoperim azi. Restul se ignora la cotare. */
export const TIPURI_ACOPERITE: TipAdresa[] = ["address", "locker", "pudo"];
