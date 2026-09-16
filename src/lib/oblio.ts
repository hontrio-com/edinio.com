import { eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { cheieToken } from "@/lib/integrari/cheie-token";

const OBLIO_BASE = "https://www.oblio.eu";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OblioConfig = {
  enabled: boolean;
  client_id: string;       // email cont Oblio
  client_secret: string;   // token din Setari > Date Cont
  cif: string;             // CIF-ul firmei selectate
  company_name: string;    // Numele firmei (display)
  series_invoice: string;  // ex: "FCT"
  series_proforma: string; // ex: "PR"
  vat_name: string;        // ex: "Normala"
  vat_percentage: number;  // ex: 19
  auto_invoice?: boolean;  // auto-issue an invoice when the trigger fires
  auto_invoice_trigger?: "confirmed" | "processing" | "shipped" | "delivered" | "paid";
  // Tipul liniilor de produs (Oblio: Marfa/Serviciu/etc). Default "Marfa" pt marfa
  // fizica (ca modulul oficial); transportul/discountul raman "Serviciu".
  product_type?: string;
  // Scadenta in zile de la emitere (0/absent = fara dueDate).
  due_days?: number;
  // Trimite automat factura in SPV (e-Factura) daca contul Oblio e configurat.
  send_to_spv?: boolean;
  /*
    ⚠ GESTIUNEA DIN CARE IES PRODUSELE. Obligatorie pentru conturile Oblio care au
    STOCURI pornite, si numai pentru liniile stocabile (`product_type` „Marfa").

    ⚠ FARA EA, FACTURA E REFUZATA — nu partial, ci in intregime. Registrul de
    operatii externe, citit pe VetDepo (okxi) la 01.09.2026 — `ultima_eroare`,
    copiata cuvant cu cuvant, toate incercarile de la conectare incoace:

        11.08  ORD-MR1XQAAZ-VQV  „nu are stoc suficient. Actualizeaza stocul"
        25.08  TY-4080251858     „nu are stoc suficient. Actualizeaza stocul"
        01.09  TY-4103280908     „nu are Gestiune (parametrul `management`)"
        01.09  TY-4103280908     „nu are Gestiune (parametrul `management`)"

    ⚠ DOUA MESAJE DEOSEBITE, NU UNUL. Prima varianta a acestei note spunea „toate
    patru cu acelasi mesaj" — FALS. Am rezumat din memorie in loc sa recitesc
    `ultima_eroare`. Gestiunea rezolva doar jumatatea de jos.

    Jumatatea de sus — refuzul pe stoc — NU e rezolvata de campul asta. Vezi nota
    de la `OblioInvoiceData.useStock`, unde scrie ce stim si ce nu.

    ZERO facturi emise vreodata, pe niciunul din cele trei magazine cu Oblio. Iar
    integrarea aparea „conectata": acreditarile treceau, compania se citea, seria
    se citea. Doar documentul nu putea pleca.

    Documentatia lor (oblio.eu/api) spune ca parametrul „este valabil doar dupa
    activarea stocurilor pentru produse stocabile (nu este valabil pentru
    servicii)" si NU il marcheaza obligatoriu — ceea ce e adevarat pentru
    conturile fara stocuri si inselator pentru cele cu.

    ⚠ SE LASA GOALA PENTRU CONTURILE FARA STOCURI. Acolo nomenclatorul intoarce
    lista goala, campul nu se arata in formular, si nu se trimite nimic — exact
    purtarea de pana acum, care mergea pentru celelalte doua magazine.
  */
  management?: string;
  /*
    ⚠ „Nu descarca stocul din Oblio". IMPLICIT ABSENT, adica purtarea de pana
    acum ramane neschimbata pentru toata lumea.

    Documentatia lor, pe document, cuvant cu cuvant:
        „useStock | Descarcare pe gestiune (in cazul in care este activat stocul).
         Poate fi 0 sau 1"

    ⚠ CE NU STIM, SI NU PRETINDEM CA STIM: daca `0` ocoleste si VERIFICAREA de
    stoc, sau doar opreste descarcarea. Doua din cele patru facturi refuzate ale
    VetDepo au cazut pe „nu are stoc suficient", si campul asta E lucrul care ar
    putea sa le repare — dar nu s-a incercat, fiindca proba adevarata cere contul
    Oblio al unui client. De aceea e o alegere a comerciantului, cu textul care
    spune ce face, nu o hotarare luata de noi in locul lui.

    ⚠ SCHIMBA CONTABILITATEA LUI DE STOC. Cine tine stocul in Oblio NU trebuie
    sa-l porneasca. Vezi si nota de la `OblioInvoiceData.useStock`.
  */
  no_stock?: boolean;
};

export type OblioCompany = {
  cif: string;
  company: string;
  userTypeAccess: string;
};

export type OblioSeries = {
  type: string;
  name: string;
  start: string;
  next: string;
  default: boolean;
};

export type OblioVatRate = {
  name: string;
  percent: number;
  default: boolean;
};

/**
 * O gestiune din contul Oblio.
 *
 * Nomenclatorul intoarce LISTA GOALA pentru conturile fara stocuri — asa se
 * deosebeste un cont care are nevoie de `management` de unul caruia campul nu i
 * se aplica. Nu e o eroare, e raspunsul corect.
 */
export type OblioManagement = {
  management: string;
  workStation: string;
  managementType: string;
};

export type OblioDocResult = {
  seriesName: string;
  number: string;
  link: string;
};

export type OblioProduct = {
  name: string;
  code?: string;        // SKU-ul produsului (cerut la conturile cu gestiune)
  price?: number;
  measuringUnit?: string;
  vatName?: string;
  vatPercentage?: number;
  vatIncluded?: 0 | 1;
  quantity?: number;
  productType?: string;
  /*
    ⚠ Se pune DOAR pe liniile stocabile. Pe „Serviciu" (transport, ajustare de
    rotunjire) Oblio il ignora oricum, iar trimiterea lui acolo n-ar strica
    nimic — dar l-am lasa in cod ca pe o afirmatie falsa despre ce e linia aia.
  */
  management?: string;
  save?: 0 | 1;
  // Discount fields
  discount?: number;
  discountType?: "procentual" | "valoric";
  discountAllAbove?: 0 | 1;
};

export type OblioInvoiceData = {
  cif: string;
  client: {
    name: string;
    cif?: string;
    /** Numarul de la registrul comertului. Doar la persoane juridice. */
    rc?: string;
    address?: string;
    state?: string;
    city?: string;
    email?: string;
    phone?: string;
    vatPayer?: boolean;
    save?: 0 | 1;
  };
  issueDate?: string;
  dueDate?: string;
  seriesName: string;
  language?: string;
  precision?: number;
  currency?: string;
  products: OblioProduct[];
  collect?: {
    type: string;
    value?: number;
    documentNumber?: string;
    issueDate?: string;
  };
  referenceDocument?: {
    type: "Factura" | "Proforma" | "Aviz";
    seriesName: string;
    number: string | number;
    refund?: 0 | 1;
  };
  mentions?: string;
  internalNote?: string;
  idempotencyKey?: string;
  // Trimite factura in SPV (e-Factura) daca trimiterea automata e activa in Oblio.
  spvExtern?: 0 | 1;
  /*
    ⚠ SE TRIMITE DOAR CAND COMERCIANTUL A CERUT-O, prin `OblioConfig.no_stock`.
    Absent = implicitul lor, adica exact purtarea de pana acum pentru toata lumea.

    (Nota de dinainte spunea „NU IL TRIMITEM, INTENTIONAT". A fost adevarat pana
    cand campul a capatat un comutator in formular. Se corecteaza aici ca sa nu
    ramana o afirmatie falsa pentru cine citeste mai tarziu.)

    Documentatia lor (oblio.eu/api), pe document, cuvant cu cuvant:

        „useStock | Descarcare pe gestiune (in cazul in care este activat stocul).
         Poate fi 0 sau 1"

    ⚠ CE NU SPUNE DOCUMENTATIA: daca `0` ocoleste si VERIFICAREA de stoc, sau doar
    opreste descarcarea. Refuzul „nu are stoc suficient" de pe VetDepo (vezi nota
    de la `OblioConfig.management`) ar putea fi oprit de el — sau nu. NU S-A
    INCERCAT: proba adevarata cere contul Oblio al unui client. De aceea e o
    alegere a lui, cu textul care spune ce face, nu o hotarare luata de noi.

    ⚠ SI IMPLICITUL LOR NU E SCRIS PENTRU FACTURI. Pentru avize documentatia spune
    „valoarea implicita 1"; pentru facturi tace. Purtarea masurata la noi — stocul
    E verificat cand nu trimitem nimic — se potriveste cu 1, dar asta e o deductie
    din patru incercari, nu o afirmatie a lor.
  */
  useStock?: 0 | 1;
};

// ─── Token cache ──────────────────────────────────────────────────────────────
// Cheia: `client_id` plus secretul hasuit; valoarea: { access_token, expiresAt (secunde unix) }

const tokenCache = new Map<string, { access_token: string; expiresAt: number }>();

/** Pentru probe: goleste tokenurile pastrate. */
export function uitaTokenurileOblio(): void {
  tokenCache.clear();
}

export async function getOblioToken(clientId: string, clientSecret: string): Promise<string> {
  /*
   * ⚠ SI SECRETUL, hasuit. Cheiata doar pe `client_id`, harta intorcea tokenul valid si
   * pentru un client secret GRESIT. Si e chiar drumul pe care `secret-server.ts` tocmai
   * l-a aparat: `loadOblioAccountData` ia `client_id` din FORMULAR si il duce neverificat
   * pana aici, deci un comerciant putea trimite id-ul magazinului LUI si `client_id`-ul
   * Oblio al altuia, iar cache-ul modulului ii intorcea tokenul aceluia: denumirea firmei,
   * CIF-ul, seriile de facturare si cotele de TVA. Vezi `@/lib/integrari/cheie-token`.
   */
  const cheie = cheieToken([clientId], [clientSecret]);
  const cached = tokenCache.get(cheie);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > nowSeconds + 60) return cached.access_token;

  const res = await fetch(`${OBLIO_BASE}/api/authorize/token`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { statusMessage?: string };
    throw new Error(err.statusMessage ?? `Autentificare Oblio esuata (HTTP ${res.status})`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: string | number;
    token_type: string;
    request_time: string | number;
  };

  if (!data.access_token) throw new Error("Autentificare Oblio esuata: token lipsa");

  const expiresAt = Number(data.request_time) + Number(data.expires_in);
  tokenCache.set(cheie, { access_token: data.access_token, expiresAt });
  return data.access_token;
}

// ─── Generic request ──────────────────────────────────────────────────────────

async function oblioReq<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<T> {
  let url = `${OBLIO_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  // Un corp necitibil arunca de aici NEMARCAT, deci registrul il ia drept
  // „nu stim" — ceea ce e corect: cererea a ajuns si nu stim ce a facut cu ea.
  const json = await res.json() as { status?: unknown; statusMessage?: string; data?: T };

  /*
   * ═══ ⚠⚠ STATUSUL DIN CORP, IAR CAND LIPSESTE, CEL HTTP (16.09.2026) ═══
   *
   * Oblio isi pune statusul in CORP, nu in HTTP: raspunsul e `200` si cand refuza. De aia se
   * citeste de acolo, si asa a fost scris de la inceput.
   *
   * ⚠ DAR `json.status` era citit ca `number` fara sa se verifice ca CHIAR e unul. Lipsa lui
   * facea amandoua comparatiile false (`undefined < 200` si `undefined >= 300` sunt FALSE), deci
   * poarta nu se aprindea si se intorcea `json.data`, adica `undefined`, drept SUCCES. Apelantul
   * il lua ca document creat si cadea abia la `rezultat.seriesName`, cu „Cannot read properties
   * of undefined" in loc de motivul adevarat.
   *
   * Si nu e doar urat: un raspuns care nu vine de la ei (un proxy, o pagina de mentenanta care
   * se nimereste JSON) sau un `429` de la limita lor de cereri putea trece exact pe acolo.
   *
   * Acum: status numeric in corp, il credem pe el. Altfel, cel HTTP. Iar succesul cere si `data`.
   */
  /*
   * ⚠⚠ SI SIRUL „400" E UN STATUS, gasit de bancul de mutanti pe 16.09.2026.
   *
   * Prima varianta cerea `typeof json.status === "number"`. Numai ca Oblio isi stringifica
   * numerele: chiar raspunsul lor de autentificare da `"expires_in": "3600"`, iar codul nostru il
   * trece deja prin `Number()` de ani de zile. Daca statusul ar veni la fel, `typeof` l-ar fi
   * refuzat, s-ar fi cazut pe statusul HTTP (care la ei e `200` si cand refuza), si un REFUZ ar fi
   * iesit SUCCES. Adica exact defectul pe care randul asta il repara, doar pe alta usa.
   *
   * Deci se accepta si numarul, si sirul numeric; orice altceva cade pe statusul HTTP.
   */
  const brut = json.status;
  const dinCorp = typeof brut === "number" || (typeof brut === "string" && brut.trim() !== "")
    ? Number(brut)
    : Number.NaN;
  const status = Number.isFinite(dinCorp) ? dinCorp : res.status;

  if (status < 200 || status >= 300) {
    const mesaj = json.statusMessage ?? `Eroare Oblio (status ${status})`;
    /*
     * ⚠ Un 4xx inseamna ca a primit cererea, a inteles-o si a respins-o: nimic nu s-a emis, deci
     * reincercarea dupa corectarea datelor e libera. Un 5xx e ambiguu: a picat la ei DUPA ce au
     * primit-o, si documentul poate exista. Vezi src/lib/operatii/eroare-furnizor.ts.
     */
    const refuzDovedit = status >= 400 && status < 500 && status !== 408;
    throw refuzDovedit ? eroareRefuz(mesaj) : eroareNesigura(mesaj);
  }

  /*
   * ⚠ Un 2xx FARA `data` nu e un succes, e un raspuns pe care nu-l intelegem. „Nu stim" tine
   * randul blocat si scoate cazul la om; intors ca succes, ar fi scris un document gol pe comanda
   * si ar fi dezarmat garda anti-duplicat.
   */
  if (json.data === undefined || json.data === null) {
    throw eroareNesigura(
      json.statusMessage
        ?? "Oblio a raspuns fara continut. Verifica in contul Oblio daca documentul s-a creat, "
           + "inainte de a incerca din nou.",
    );
  }

  return json.data;
}

// ─── Nomenclatoare ────────────────────────────────────────────────────────────

export async function getCompanies(token: string): Promise<OblioCompany[]> {
  return oblioReq<OblioCompany[]>(token, "GET", "/api/nomenclature/companies");
}

export async function getSeries(token: string, cif: string): Promise<OblioSeries[]> {
  return oblioReq<OblioSeries[]>(token, "GET", "/api/nomenclature/series", undefined, { cif });
}

export async function getVatRates(token: string, cif: string): Promise<OblioVatRate[]> {
  return oblioReq<OblioVatRate[]>(token, "GET", "/api/nomenclature/vat_rates", undefined, { cif });
}

/**
 * Gestiunile contului. Lista goala inseamna „contul n-are stocuri", nu o eroare.
 */
export async function getManagement(token: string, cif: string): Promise<OblioManagement[]> {
  return oblioReq<OblioManagement[]>(token, "GET", "/api/nomenclature/management", undefined, { cif });
}

// ─── Documente ────────────────────────────────────────────────────────────────

export async function createOblioDoc(
  token: string,
  type: "invoice" | "proforma",
  data: OblioInvoiceData,
): Promise<OblioDocResult> {
  return oblioReq<OblioDocResult>(token, "POST", `/api/docs/${type}`, data);
}

export async function cancelOblioDoc(
  token: string,
  type: "invoice" | "proforma",
  cif: string,
  seriesName: string,
  number: string,
): Promise<void> {
  await oblioReq(token, "PUT", `/api/docs/${type}/cancel`, { cif, seriesName, number });
}
