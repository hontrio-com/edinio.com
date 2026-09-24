/**
 * Textele panoului de conturi (Clienti > Conturi), fara nimic de server.
 *
 * ⚠ Aici stau numai lucruri pure: etichete, filtre, citirea defensiva a fisei.
 * Cititul din baza e in `panou.ts`, actiunile in `conturi-panou.actions.ts`.
 *
 * ⚠ Textele sunt ale PANOULUI, deci cu diacritice (vitrina ramane fara, H6).
 */

// ═══ Filtrele listei ═══════════════════════════════════════════════════════

export const STARI_CONT = [
  { cheie: "toate", eticheta: "Toate conturile" },
  { cheie: "active", eticheta: "Active" },
  { cheie: "suspendate", eticheta: "Suspendate" },
  { cheie: "fara-comenzi", eticheta: "Fără comenzi" },
] as const;
export type StareCont = (typeof STARI_CONT)[number]["cheie"];

export const ORDINI_CONT = [
  { cheie: "noi", eticheta: "Cele mai noi" },
  { cheie: "activi", eticheta: "Intrate recent" },
  { cheie: "comenzi", eticheta: "Cele mai multe comenzi" },
] as const;
export type OrdineCont = (typeof ORDINI_CONT)[number]["cheie"];

/** Cate conturi pe o pagina. Acelasi plafon (100) sta si in baza. */
export const CONTURI_PE_PAGINA = 50;

/** Cat de lunga poate fi cautarea. Aceeasi taietura in pagina si in bara. */
export const CAUTARE_MAXIMA = 80;

/**
 * Adresa listei de conturi. Un singur loc, pentru bara (client) si pentru
 * paginare (server): doua copii s-ar fi despartit la prima retusare.
 */
export function adresaListei(f: { q: string; stare: StareCont; ordine: OrdineCont; pagina?: number }): string {
  const s = new URLSearchParams({ fila: "conturi" });
  const q = f.q.trim().slice(0, CAUTARE_MAXIMA);
  if (q) s.set("q", q);
  if (f.stare !== "toate") s.set("stare", f.stare);
  if (f.ordine !== "noi") s.set("ordine", f.ordine);
  if (f.pagina && f.pagina > 1) s.set("page", String(f.pagina));
  return `/dashboard/customers?${s.toString()}`;
}

export function stareValida(v: string | null | undefined): StareCont {
  return STARI_CONT.some((s) => s.cheie === v) ? (v as StareCont) : "toate";
}

export function ordineValida(v: string | null | undefined): OrdineCont {
  return ORDINI_CONT.some((o) => o.cheie === v) ? (v as OrdineCont) : "noi";
}

/**
 * Adresa listei, primita prin `?lista=` pe fisa unui cont. ⚠ Vine din adresa, deci
 * se primeste NUMAI daca e chiar lista conturilor din panou: altfel „Toate conturile”
 * ar fi putut duce oriunde (o redirectionare deschisa, pe o legatura trimisa cuiva).
 */
export function adresaListeiDinCerere(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  const baza = "/dashboard/customers?fila=conturi";
  if (typeof s !== "string" || s.length > 300 || !s.startsWith(baza)) return baza;
  const rest = s.slice(baza.length);
  if (rest !== "" && !/^&[A-Za-z0-9_=&%.+*-]*$/.test(rest)) return baza;
  return s;
}

// ═══ Cum a ajuns o comanda in cont ═════════════════════════════════════════

/**
 * ⚠ Cheile sunt EXACT valorile permise de `cont_comanda_temei_check`. Una
 * necunoscuta se arata asa cum e, nu dispare.
 */
export const TEMEIURI: Record<string, string> = {
  "plasata-in-cont": "Plasată din cont",
  "contact-verificat": "Aceeași adresă de email, confirmată",
  "legat-de-comerciant": "Legată manual de tine",
  "jeton-email": "Din linkul primit pe email la comandă",
  "numar-plus-contact": "După număr și contact",
};

export function etichetaTemeiului(temei: string): string {
  return TEMEIURI[temei] ?? temei;
}

// ═══ Istoricul contului ════════════════════════════════════════════════════

export type Detalii = Record<string, unknown>;

const sir = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/**
 * Cum se citeste un rand din jurnal.
 *
 * ⚠⚠ ORICE FAPTA SCRISA IN BAZA ARE AICI UN TEXT. Proba din
 * `panoul-conturilor.test.ts` aduna faptele din toate migratiile si pica daca una
 * n-are eticheta: altfel comerciantul ar fi vazut „jeton-refolosit” in loc de o
 * propozitie.
 *
 * `numere` traduce id-urile de comanda din detalii (`anulare-comanda`,
 * `comanda-plasata`) in numerele de pe ecran.
 */
export function descrieFapta(
  fapta: string,
  detalii: Detalii,
  numere: Map<string, string> = new Map(),
): { titlu: string; detaliu: string | null; ton: "normal" | "atentie" | "magazin" } {
  const deMagazin = detalii.de === "magazin";
  const comanda = sir(detalii.comanda);
  const numar = sir(detalii.numar) ?? (comanda ? numere.get(comanda) ?? null : null);

  switch (fapta) {
    case "cont-creat":
      return { titlu: "Și-a creat contul", detaliu: "după confirmarea adresei de email", ton: "normal" };
    case "intrare": {
      const prin = sir(detalii.prin);
      const cum: Record<string, string> = {
        "parola": "cu parola, pe un dispozitiv ținut minte",
        "parola-si-cod": "cu parola și codul primit pe email",
        "inregistrare": "imediat după crearea contului",
        "resetare": "după ce și-a resetat parola",
      };
      return { titlu: "A intrat în cont", detaliu: prin ? cum[prin] ?? null : null, ton: "normal" };
    }
    case "intrare-refuzata":
      return { titlu: "Intrare refuzată", detaliu: "contul e suspendat", ton: "atentie" };
    case "parola-gresita":
      return { titlu: "Parolă greșită", detaliu: null, ton: "atentie" };
    case "parola-setata":
      return {
        titlu: "Parolă nouă",
        detaliu: "aleasă când a încercat să-și facă din nou cont pe aceeași adresă",
        ton: "normal",
      };
    case "parola-schimbata":
      return { titlu: "Și-a schimbat parola", detaliu: null, ton: "normal" };
    case "parola-resetata":
      return { titlu: "Și-a resetat parola", detaliu: "cu codul primit pe email", ton: "normal" };
    case "iesire-de-peste-tot":
      return deMagazin
        ? { titlu: "L-ai scos de pe toate dispozitivele", detaliu: null, ton: "magazin" }
        : { titlu: "A ieșit de pe toate dispozitivele", detaliu: null, ton: "normal" };
    case "jeton-refolosit":
      return {
        titlu: "Sesiuni închise din motive de siguranță",
        detaliu: "o cheie de sesiune veche a fost folosită din nou, deci am închis toate sesiunile",
        ton: "atentie",
      };
    case "contact-adaugat":
      return {
        titlu: detalii.fel === "telefon" ? "A adăugat un telefon" : "A adăugat o adresă de email",
        detaliu: "confirmată cu cod",
        ton: "normal",
      };
    case "contact-scos":
      return {
        titlu: detalii.fel === "telefon" ? "A scos un telefon" : "A scos o adresă de email",
        detaliu: null,
        ton: "normal",
      };
    case "preferinte": {
      /* ⚠ Comutatorul de email e numai `recovery_optout`: emailurile despre coșul abandonat, nu tot marketingul. */
      const canal = detalii.canal === "sms" ? "SMS-urile de marketing" : "emailurile despre coșul abandonat";
      return {
        titlu: detalii.vrea === true ? `A pornit ${canal}` : `A oprit ${canal}`,
        detaliu: null,
        ton: "normal",
      };
    }
    case "profil-schimbat":
      return { titlu: "Și-a actualizat profilul", detaliu: "numele, telefonul sau adresa de livrare", ton: "normal" };
    case "poza-schimbata":
      return { titlu: "Și-a schimbat poza de profil", detaliu: null, ton: "normal" };
    case "poza-stearsa":
      return { titlu: "Și-a șters poza de profil", detaliu: null, ton: "normal" };
    case "comanda-plasata":
      return { titlu: "A plasat o comandă din cont", detaliu: numar, ton: "normal" };
    case "anulare-comanda":
      return { titlu: "A anulat o comandă din cont", detaliu: numar, ton: "atentie" };
    case "suspendat-de-magazin":
      return { titlu: "L-ai suspendat", detaliu: sir(detalii.motiv), ton: "magazin" };
    case "reactivat-de-magazin":
      return { titlu: "L-ai reactivat", detaliu: null, ton: "magazin" };
    case "comanda-legata-de-magazin":
      return { titlu: "Ai legat o comandă de cont", detaliu: numar, ton: "magazin" };
    case "comanda-dezlegata-de-magazin":
      return { titlu: "Ai dezlegat o comandă de cont", detaliu: numar, ton: "magazin" };
    case "cont-sters":
      return { titlu: deMagazin ? "L-ai șters" : "Și-a șters contul", detaliu: null, ton: "atentie" };
    case "cont-anonimizat-de-magazin":
      return { titlu: "Datele i-au fost anonimizate", detaliu: null, ton: "atentie" };
    default:
      return { titlu: fapta, detaliu: null, ton: "normal" };
  }
}

/** Faptele care au text in `descrieFapta` (pentru proba de acoperire). */
export const FAPTE_CUNOSCUTE = [
  "cont-creat", "intrare", "intrare-refuzata", "parola-gresita", "parola-setata",
  "parola-schimbata", "parola-resetata", "iesire-de-peste-tot", "jeton-refolosit",
  "contact-adaugat", "contact-scos", "preferinte", "profil-schimbat", "poza-schimbata", "poza-stearsa",
  "comanda-plasata", "anulare-comanda",
  "suspendat-de-magazin", "reactivat-de-magazin", "comanda-legata-de-magazin",
  "comanda-dezlegata-de-magazin", "cont-sters", "cont-anonimizat-de-magazin",
] as const;

// ═══ Raspunsurile actiunilor ═══════════════════════════════════════════════

/** Ce i se spune comerciantului dupa legarea unei comenzi, pe fiecare raspuns al bazei. */
export function mesajulLegarii(motiv: string): string {
  switch (motiv) {
    case "legata":
      return "Comanda a fost legată de cont.";
    case "deja-legata":
      return "Comanda era deja legată de acest cont.";
    case "legata-de-alt-cont":
      return "Comanda e deja legată de alt cont al magazinului.";
    case "marketplace":
      return "Comenzile venite de pe marketplace-uri nu se leagă de conturile magazinului.";
    case "negasita":
      return "Nu am găsit comanda în magazinul tău.";
    case "cont-negasit":
      return "Contul nu mai există.";
    default:
      return "Nu am putut lega comanda. Încearcă din nou.";
  }
}

export function mesajulDezlegarii(motiv: string): string {
  switch (motiv) {
    case "dezlegata":
      return "Comanda a fost dezlegată de cont.";
    case "nu-e-legata-de-magazin":
      return "Poți dezlega numai comenzile legate de tine. Celelalte țin de adresa confirmată a clientului sau au fost plasate din cont.";
    case "negasita":
      return "Comanda nu mai e legată de acest cont.";
    default:
      return "Nu am putut dezlega comanda. Încearcă din nou.";
  }
}

// ═══ Citirea fisei, defensiv ════════════════════════════════════════════════

export type ContactDinFisa = { fel: "email" | "telefon"; valoare: string; verificatLa: string | null };
export type ComandaDinFisa = {
  orderId: string;
  numar: string;
  creataLa: string;
  total: number;
  stare: string;
  starePlata: string | null;
  numeClient: string | null;
  temei: string;
  legataLa: string | null;
};
export type FaptaDinFisa = { fapta: string; detalii: Detalii; ip: string | null; creatLa: string };

export type FisaCont = {
  id: string;
  nume: string | null;
  creatLa: string;
  areParola: boolean;
  parolaSchimbataLa: string | null;
  suspendatLa: string | null;
  motivSuspendare: string | null;
  ultimaIntrare: string | null;
  contacte: ContactDinFisa[];
  comenzi: ComandaDinFisa[];
  comenziTotal: number;
  jurnal: FaptaDinFisa[];
  sesiuniDeschise: number;
  dispozitive: number;
  paroleGresite24h: number;
  primesteEmail: boolean | null;
  primesteSms: boolean | null;
};

const obiect = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const numar = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const boolSauNul = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/**
 * Fisa, din `jsonb`.
 *
 * ⚠ NU ARUNCA: un camp lipsa sau de alt tip cade pe o valoare goala, iar un
 * rand stricat se sare. `null` numai cand baza a spus ca nu exista contul.
 */
export function citesteFisa(x: unknown): FisaCont | null {
  const o = obiect(x);
  const c = obiect(o?.cont);
  const id = sir(c?.id);
  if (!o || !c || !id) return null;

  const contacte: ContactDinFisa[] = [];
  for (const r of lista(o.contacte).map(obiect)) {
    const valoare = sir(r?.valoare);
    if (!r || !valoare) continue;
    contacte.push({ fel: r.fel === "telefon" ? "telefon" : "email", valoare, verificatLa: sir(r.verificat_la) });
  }

  const comenzi: ComandaDinFisa[] = [];
  for (const r of lista(o.comenzi).map(obiect)) {
    const orderId = sir(r?.order_id);
    if (!r || !orderId) continue;
    comenzi.push({
      orderId,
      numar: sir(r.numar) ?? "",
      creataLa: sir(r.creata_la) ?? "",
      total: numar(r.total),
      stare: sir(r.stare) ?? "",
      starePlata: sir(r.stare_plata),
      numeClient: sir(r.nume_client),
      temei: sir(r.temei) ?? "",
      legataLa: sir(r.legata_la),
    });
  }

  const jurnal: FaptaDinFisa[] = [];
  for (const r of lista(o.jurnal).map(obiect)) {
    const fapta = sir(r?.fapta);
    if (!r || !fapta) continue;
    jurnal.push({ fapta, detalii: obiect(r.detalii) ?? {}, ip: sir(r.ip), creatLa: sir(r.creat_la) ?? "" });
  }

  const pref = obiect(o.preferinte);
  return {
    id,
    nume: sir(c.nume),
    creatLa: sir(c.creat_la) ?? "",
    areParola: c.are_parola === true,
    parolaSchimbataLa: sir(c.parola_schimbata_la),
    suspendatLa: sir(c.suspendat_la),
    motivSuspendare: sir(c.motiv_suspendare),
    ultimaIntrare: sir(c.ultima_intrare),
    contacte,
    comenzi,
    comenziTotal: numar(o.comenzi_total),
    jurnal,
    sesiuniDeschise: numar(o.sesiuni_deschise),
    dispozitive: numar(o.dispozitive),
    paroleGresite24h: numar(o.parole_gresite_24h),
    /* ⚠ Fara adresa confirmata, „primeste” nu inseamna nimic: se spune ca nu se stie. */
    primesteEmail: pref?.are_email === true ? boolSauNul(pref.primeste_email) : null,
    primesteSms: pref?.are_telefon === true ? boolSauNul(pref.primeste_sms) : null,
  };
}

/** Numele de pe ecran: numele, altfel emailul, altfel „Cont fără nume”. */
export function numeleContului(nume: string | null, email: string | null): string {
  return nume?.trim() || email?.trim() || "Cont fără nume";
}
