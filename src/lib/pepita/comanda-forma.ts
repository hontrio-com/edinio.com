/**
 * Sarcina utila a comenzii Pepita, citita cu neincredere.
 *
 * ═══ ⚠ EXEMPLUL DIN DOCUMENTATIA LOR NU E JSON VALID ═══
 *
 * In PDF-ul „Automatic order forwarding” scrie, textual, `"payment_mode":cod` (fara
 * ghilimele), `"total_shipping_price_currency":"HUF""voucher": ""` (fara virgula
 * intre campuri) si virgule la coada listelor. Deci exemplul lor NU se poate lipi
 * intr-un parser.
 *
 * Din asta NU urmeaza ca trebuie sa acceptam orice: e o greseala de redactare a
 * documentului, nu forma cererilor lor. Urmeaza doar ca nu putem construi schema
 * copiind exemplul, si ca trebuie sa fim toleranti la lucrurile care nu schimba
 * intelesul (numar sau sir la `id`, camp lipsa unde avem o valoare implicita
 * sigura), si neinduplecati la cele care il schimba (fara `id`, fara produse,
 * cantitate zero).
 *
 * ═══ ⚠ SI NUMELE CAMPULUI DE LIVRARE E SCRIS `delivery_mod` ═══
 *
 * Asa e si in definitia campului, si in exemplu: „delivery_mod”, nu
 * „delivery_mode”. Se citesc amandoua, fiindca e cu putinta sa fie o greseala de
 * tipar in documentatie si sa vina forma lunga. Ce nu se face e sa se aleaga una
 * si sa se spere.
 *
 * ⚠ MODUL PUR: nicio citire din baza. Ce iese de aici e o comanda NORMALIZATA,
 * inca nelegata de niciun produs si de niciun magazin.
 */

/** Cat de lung poate fi un sir venit de la ei inainte sa fie taiat. */
const MAX_SIR = 2000;
/** Cate linii poate avea o comanda. Peste atat, e o greseala, nu o comanda. */
export const MAX_LINII = 200;

export interface LiniePepita {
  /** `id` din sarcina lor: identificatorul Pepita al produsului. Opac pentru noi. */
  idPepita: string | null;
  /** `sku`: ce le-am dat noi in feed. Cheia potrivirii. */
  sku: string | null;
  moneda: string | null;
  cantitate: number;
  /** Pretul BRUT unitar, asa cum l-au trimis. Nu se recalculeaza niciodata. */
  pret: number;
  tva: number | null;
}

export interface ClientPepita {
  nume: string;
  prenume: string;
  telefon: string;
  /** ⚠ Poate fi un alias Pepita. Se pastreaza exact; nu e adresa personala a clientului. */
  email: string | null;
  facturare: {
    nume: string | null; tara: string | null; oras: string | null;
    strada: string | null; numeStrada: string | null; numar: string | null; codPostal: string | null;
  };
  livrare: {
    tara: string | null; judet: string | null; oras: string | null;
    strada: string | null; numeStrada: string | null; numar: string | null; codPostal: string | null;
  };
  codFiscal: string | null;
}

export interface ComandaPepita {
  externalId: string;
  /**
   * Moneda comenzii, aceeasi pe toate liniile si pe transport. `null` cand ei n-au trimis-o
   * deloc; atunci ingestul cade pe moneda magazinului.
   */
  moneda: string | null;
  /**
   * Un cod de moneda a fost TRIMIS si nu s-a putut citi.
   *
   * ⚠ Deosebit de `moneda === null`, care inseamna „n-au trimis niciunul" si e in regula.
   * Aici stim ca ne-au spus ceva despre bani si n-am inteles, deci nu avem voie sa punem in
   * loc moneda magazinului si sa mergem mai departe ca si cum am sti.
   */
  monedaNevalida: boolean;
  origine: string | null;
  /** Data lor, PASTRATA CA SIR. Vezi nota de la `citesteComanda`. */
  dataBruta: string | null;
  modPlata: string | null;
  starePlata: string | null;
  modLivrare: string | null;
  status: string | null;
  mesajClient: string | null;
  mesajCurier: string | null;
  /**
   * `package_label` — eticheta de colet, PDF codificat Base64, asa cum a venit.
   *
   * ⚠ SE PASTREAZA BRUTA aici, nu decodata. Citirea, validarea si plafonul de marime sunt in
   * `eticheta.ts`, si trebuie sa ramana acolo: forma comenzii spune CE ne-au trimis, nu daca e
   * bun. Un `Buffer` in tipul asta ar fi facut ca fiecare proba de forma sa care octeti dupa ea.
   *
   * ⚠ Si nu e obligatoriu. Vine numai la Pepita Delivery, si nici acolo mereu.
   */
  etichetaBruta: string | null;
  transport: number;
  monedaTransport: string | null;
  voucher: number;
  client: ClientPepita;
  linii: LiniePepita[];
}

export type Verdict =
  | { ok: true; comanda: ComandaPepita }
  | { ok: false; cod: string; mesaj: string; externalId: string | null };

/**
 * Eticheta de colet, CITITA INTREAGA.
 *
 * ═══ ⚠ AICI ERA `sir()`, SI TAIA ETICHETA LA 2.000 DE SEMNE (gasit 09.09.2026) ═══
 *
 * `sir()` exista ca sa nu putem primi un nume de client de un megaoctet, si e bun pentru asta. Dar
 * o eticheta e un PDF codat Base64: unul de numai 100 KB are peste 136.000 de semne, deci pastram
 * 1,46% din fisier.
 *
 * ⚠ SI DE CE N-A SCARTAIT NIMIC. 2.000 se imparte exact la 4, deci bucata taiata ramane Base64
 * VALID; decodata, incepe tot cu `%PDF-`, deci trecea si de verificarea de continut. Adica scriam
 * in depozit un PDF rupt si il numeam eticheta — mai rau decat lipsa ei, fiindca omul il tipareste
 * si afla la curier.
 *
 * ⚠ SI DE CE N-A PRINS-O NICIO PROBA. Aveam sapte probe pe `citesteEticheta`, inclusiv pe plafonul
 * de marime — dar toate ii dadeau octetii DIRECT. Niciuna nu trecea prin `citesteComanda`, adica
 * prin chiar drumul pe care umbla eticheta adevarata. Iar PDF-ul din probe avea 60 de octeti.
 *
 * ⚠ NU SE MARESTE `MAX_SIR`. Mesajul clientului, adresa si numele n-au ce cauta la 1,5 MB. Plafonul
 * etichetei e al ei, si se aplica in `citesteEticheta`, dupa ce se stie ca e chiar o eticheta.
 */
function etichetaDinSarcina(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function sir(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s.slice(0, MAX_SIR) : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Numarul, cand chiar e numar.
 *
 * ⚠ `Number("")` E ZERO, iar zero e o valoare cu inteles la transport si la
 * voucher. Un camp gol trebuie sa insemne „lipseste”, nu „zero lei”, altfel un
 * transport netrimis ar aparea ca transport gratuit.
 */
function numar(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function obiect(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Codul de moneda, cu TREI raspunsuri, nu doua.
 *
 * ⚠ „Lipsa" si „nevalida" nu inseamna acelasi lucru, si de aia nu mai ies amandoua `null`.
 * Un camp care lipseste e o comanda dintr-o piata unde ei nu-l trimit, si atunci se cade pe
 * moneda magazinului. Un camp PREZENT dar strambat („LEI", „12", „ronn") e o greseala de date,
 * iar reparata tacut ar fi facut o comanda in alta moneda sa arate ca una in lei.
 *
 * ⚠ NU EXISTA LISTA ALBA DE MONEDE, dinadins. O lista prea stramta respinge o comanda
 * adevarata dintr-o piata noua, iar o comanda respinsa e o comanda PIERDUTA: ei nu reincearca
 * singuri. Ce se verifica e forma codului si COERENTA lui in cadrul comenzii.
 *
 * ⚠ SI CELE DOUA ABATERI NU COSTA LA FEL, deci nu se trateaza la fel:
 *   - DOUA monede pe aceeasi comanda RESPING comanda, ca un pret negativ: totalul se aduna din
 *     preturile liniilor, deci ar fi un numar care arata a bani si nu e. Aceeasi treapta cu
 *     `pret-nevalid` si `cantitate-nevalida`, care resping de mult;
 *   - un cod PREZENT dar strambat („LEI", „12") nu respinge nimic, fiindca nu strica nicio
 *     socoteala: duce comanda in CARANTINA. Nici reparata tacut, nici pierduta.
 */
type Moneda = { fel: "lipsa" } | { fel: "cod"; cod: string } | { fel: "nevalida" };

function moneda(v: unknown): Moneda {
  const s = sir(v);
  if (!s) return { fel: "lipsa" };
  return /^[A-Za-z]{3}$/.test(s) ? { fel: "cod", cod: s.toUpperCase() } : { fel: "nevalida" };
}

/**
 * Comanda lor, citita si normalizata.
 *
 * ⚠ CAMPURILE NECUNOSCUTE NU OPRESC NIMIC. Ei pot adauga maine un camp; o
 * comanda respinsa pentru asta ar fi o comanda pierduta, si ar cadea toate
 * comenzile deodata. Campurile CRITICE lipsa opresc, fiindca fara ele comanda
 * nu inseamna nimic.
 *
 * ⚠ DATA NU SE CONVERTESTE. Formatul lor e „2018-05-21 10:23:41”, fara fus orar
 * si fara ca documentatia sa spuna in ce fus e. Interpretata drept UTC, o comanda
 * de la ora 01:00 ar aparea in Edinio in ziua precedenta; interpretata local, o
 * comanda din alt fus ar sari inainte. Se pastreaza SIRUL, langa comanda, iar
 * `orders.created_at` ramane clipa in care am primit-o noi, care e adevarata si
 * nu depinde de nicio presupunere.
 */
export function citesteComanda(brut: unknown): Verdict {
  const c = obiect(brut);
  const externalId = sir(c.id);

  if (Object.keys(c).length === 0) {
    return { ok: false, cod: "corp-gol", mesaj: "Sarcina utila lipseste sau nu este un obiect JSON.", externalId: null };
  }
  if (!externalId) {
    return { ok: false, cod: "fara-id", mesaj: "Comanda nu are `id`.", externalId: null };
  }

  const produseBrute = Array.isArray(c.products) ? c.products : null;
  if (!produseBrute || produseBrute.length === 0) {
    return { ok: false, cod: "fara-produse", mesaj: "Comanda nu are niciun produs.", externalId };
  }
  if (produseBrute.length > MAX_LINII) {
    return { ok: false, cod: "prea-multe-linii", mesaj: `Comanda are ${produseBrute.length} linii, peste limita de ${MAX_LINII}.`, externalId };
  }

  const linii: LiniePepita[] = [];
  /*
   * ⚠ MONEDA COMENZII SE ADUNA DIN LINII, si trebuie sa fie UNA. Doua monede pe aceeasi
   * comanda inseamna ca totalul, care se aduna din preturile liniilor, ar fi o suma de mere
   * cu pere: un numar care arata a bani si nu e.
   */
  let monedaComenzii: string | null = null;
  /** Un cod a fost trimis si nu s-a putut citi. Nu opreste comanda, o duce in carantina. */
  let monedaNevalida = false;
  for (const p of produseBrute) {
    const l = obiect(p);
    const cantitate = numar(l.quantity);
    const pret = numar(l.price);
    /*
     * ⚠ CANTITATEA SI PRETUL SE VERIFICA PE LINIE, nu la total. O linie cu
     * cantitate zero sau negativa ar creste stocul la consum, iar una cu pret
     * negativ ar face un total mai mic decat ce a incasat marketplace-ul.
     */
    if (cantitate == null || !Number.isInteger(cantitate) || cantitate <= 0) {
      return { ok: false, cod: "cantitate-nevalida", mesaj: "O linie are cantitate nevalidă.", externalId };
    }
    if (pret == null || pret < 0) {
      return { ok: false, cod: "pret-nevalid", mesaj: "O linie are preț nevalid.", externalId };
    }
    const m = moneda(l.currency);
    if (m.fel === "nevalida") monedaNevalida = true;
    if (m.fel === "cod") {
      if (monedaComenzii && monedaComenzii !== m.cod) {
        return { ok: false, cod: "monede-amestecate", mesaj: "Comanda are linii în monede diferite.", externalId };
      }
      monedaComenzii = m.cod;
    }
    linii.push({
      idPepita: sir(l.id),
      sku: sir(l.sku),
      moneda: m.fel === "cod" ? m.cod : null,
      cantitate,
      pret,
      tva: numar(l.vat),
    });
  }

  /*
   * ⚠ SI TRANSPORTUL E BANI. Adunat la total intr-o alta moneda decat liniile, ar fi produs
   * acelasi numar fals. Cu transport zero nu se compara nimic: n-are ce sa strice.
   */
  const transport = numar(c.total_shipping_price) ?? 0;
  const mTransport = moneda(c.total_shipping_price_currency);
  /* Cu transport zero, moneda lui nu atinge nicio socoteala: nu e nici macar o abatere. */
  if (mTransport.fel === "nevalida" && transport > 0) monedaNevalida = true;
  if (transport > 0 && mTransport.fel === "cod" && monedaComenzii && mTransport.cod !== monedaComenzii) {
    return { ok: false, cod: "monede-amestecate", mesaj: "Transportul e în altă monedă decât produsele.", externalId };
  }

  const cl = obiect(c.customer);
  const client: ClientPepita = {
    nume: sir(cl.last_name) ?? "",
    prenume: sir(cl.first_name) ?? "",
    telefon: sir(cl.phone) ?? "",
    email: sir(cl.email),
    facturare: {
      nume: sir(cl.billing_name),
      tara: sir(cl.billing_country),
      oras: sir(cl.billing_city),
      strada: sir(cl.billing_street),
      numeStrada: sir(cl.billing_street_address),
      numar: sir(cl.billing_house_number),
      codPostal: sir(cl.billing_postal_code),
    },
    livrare: {
      tara: sir(cl.shipping_country),
      /* ⚠ „only for Romanian orders”, scrie in documentatia lor. Deci pe alte piete lipseste. */
      judet: sir(cl.shipping_county),
      oras: sir(cl.shipping_city),
      strada: sir(cl.shipping_street),
      numeStrada: sir(cl.shipping_street_address),
      numar: sir(cl.shipping_house_number),
      codPostal: sir(cl.shipping_postal_code),
    },
    codFiscal: sir(cl.tax_number),
  };

  return {
    ok: true,
    comanda: {
      externalId,
      origine: sir(c.origin),
      dataBruta: sir(c.date),
      modPlata: sir(c.payment_mode),
      starePlata: sir(c.payment_status),
      /* ⚠ Ambele scrieri. Vezi nota din capul fisierului. */
      modLivrare: sir(c.delivery_mod) ?? sir(c.delivery_mode),
      status: sir(c.status),
      mesajClient: sir(c.customer_message),
      mesajCurier: sir(c.courier_message),
      /*
       * ⚠ CAMPUL ASTA A FOST ARUNCAT TACUT PANA PE 08.09.2026, si nu dintr-o scapare de cod:
       * dintr-una de documentatie. Copia pe care o pastram noi era o versiune veche, si pe ea am
       * si raspuns, de doua ori, ca `package_label` nu exista la ei. Exista.
       * Vezi `docs/pepita/README.md`.
       */
      /* ⚠ `etichetaDinSarcina`, NU `sir`: aceea taie la 2.000 de semne. Vezi nota de la ea. */
      etichetaBruta: etichetaDinSarcina(c.package_label),
      transport,
      monedaTransport: mTransport.fel === "cod" ? mTransport.cod : null,
      /** Moneda UNICA a comenzii, deja dovedita coerenta. `null` daca ei n-au trimis niciuna. */
      moneda: monedaComenzii,
      monedaNevalida,
      voucher: numar(c.voucher) ?? 0,
      client,
      linii,
    },
  };
}
