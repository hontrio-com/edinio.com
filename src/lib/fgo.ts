import crypto from "crypto";

export type FgoConfig = {
  enabled: boolean;
  sandbox: boolean;
  cod_unic: string;      // CUI firma
  private_key: string;   // Cheie API privata
  serie: string;         // Serie documente
  platforma_url: string; // URL root platforma
  tip_factura: string;   // default "Factura"
  valuta: string;        // default "RON"
  auto_invoice?: boolean;  // auto-issue an invoice when the trigger fires
  auto_invoice_trigger?: "confirmed" | "processing" | "shipped" | "delivered" | "paid";
  due_days?: number;     // scadenta in zile de la emitere (0/absent = fara)
};

export type FgoInvoiceResult = {
  Numar: string;
  Serie: string;
  Link: string;
  LinkPlata?: string;
};

const PROD_BASE = "https://api.fgo.ro/v1";
const TEST_BASE = "https://api-testuat.fgo.ro/v1";

function sha1Upper(input: string): string {
  return crypto.createHash("sha1").update(input, "utf8").digest("hex").toUpperCase();
}

export function hashEmitere(codUnic: string, privateKey: string, clientName: string): string {
  return sha1Upper(codUnic + privateKey + clientName);
}

export function hashOperatii(codUnic: string, privateKey: string, invoiceNumber: string): string {
  return sha1Upper(codUnic + privateKey + invoiceNumber);
}

export function hashArticole(codUnic: string, privateKey: string): string {
  return sha1Upper(codUnic + privateKey);
}

function baseUrl(sandbox: boolean): string {
  return sandbox ? TEST_BASE : PROD_BASE;
}

// fGO cere OBLIGATORIU body JSON brut cu `Content-Type: application/json`;
// documentatia avertizeaza explicit contra application/x-www-form-urlencoded
// (Client si Continut sunt obiect/array imbricate, nu chei bracket).
async function fgoPost<T>(
  url: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`fGO API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { Success: boolean; Message?: string } & T;
  if (!data.Success) {
    throw new Error(data.Message || "Eroare necunoscuta fGO");
  }
  return data;
}

// ─── Nomenclatoare ────────────────────────────────────────────────────────────

// Nomenclatoarele fGO returneaza {Nume(afisare), Cod(valoarea de trimis)}, ex.
// tara {Nume:"ROMANIA", Cod:"RO"}, judet {Nume:"Gorj", Cod:"GJ"}.
export async function getFgoNomenclator(
  type: string,
  sandbox: boolean,
  judet?: string,
): Promise<{ Nume: string; Cod: string }[]> {
  const path = judet ? `/nomenclator/${type}?judet=${encodeURIComponent(judet)}` : `/nomenclator/${type}`;
  const res = await fetch(`${baseUrl(sandbox)}${path}`);
  if (!res.ok) throw new Error(`fGO nomenclator error: ${res.status}`);
  const data = (await res.json()) as { Success: boolean; Message?: string; List: { Nume: string; Cod: string }[] };
  if (!data.Success) throw new Error(data.Message || "Eroare nomenclator fGO");
  return data.List ?? [];
}

// ─── Factura ──────────────────────────────────────────────────────────────────

export type FgoLineItem = {
  name: string;
  quantity: number;       // NrProduse (XXXX.XXX)
  unitPrice: number;      // PretUnitar — pret unitar FARA TVA (la discount: valoarea neta a reducerii, pozitiva)
  vatRate: number;        // CotaTVA ca numar (ex: 19)
  unit?: string;          // UM, default BUC
  code?: string;          // CodArticol (SKU) — doar la articole
  isDiscount?: boolean;   // Tip: "Discount" (reducere la nivel de factura)
};

export async function createFgoInvoice(
  config: FgoConfig,
  clientName: string,
  clientData: {
    judet?: string;
    localitate?: string;
    adresa?: string;
    email?: string;
    telefon?: string;
    tip?: "PF" | "PJ";
    codUnic?: string;
  },
  items: FgoLineItem[],
  opts?: { dueDate?: string; idExtern?: string },
): Promise<FgoInvoiceResult> {
  const hash = hashEmitere(config.cod_unic, config.private_key, clientName);

  const client: Record<string, unknown> = {
    Denumire: clientName,
    Tara: "RO",                 // Cod-ul din nomenclatorul de tari (NU "Romania")
    Tip: clientData.tip || "PF",
  };
  if (clientData.judet) client.Judet = clientData.judet;          // Nume judet (ex "Cluj")
  if (clientData.localitate) client.Localitate = clientData.localitate;
  if (clientData.adresa) client.Adresa = clientData.adresa;
  if (clientData.email) client.Email = clientData.email;
  if (clientData.telefon) client.Telefon = clientData.telefon;
  if (clientData.codUnic) client.CodUnic = clientData.codUnic;

  const continut = items.map(item => {
    const line: Record<string, unknown> = {
      Denumire: item.name,
      NrProduse: Number(item.quantity.toFixed(3)),
      UM: item.unit || "BUC",
      CotaTVA: item.vatRate,
      PretUnitar: Number(item.unitPrice.toFixed(2)),
    };
    if (item.code) line.CodArticol = item.code;
    // Reducere la nivel de factura: doar Tip "Discount", fara NrCrtArticol.
    if (item.isDiscount) line.Tip = "Discount";
    return line;
  });

  const payload: Record<string, unknown> = {
    CodUnic: config.cod_unic,
    Hash: hash,
    PlatformaUrl: config.platforma_url,
    Serie: config.serie,
    Valuta: config.valuta || "RON",
    TipFactura: config.tip_factura || "Factura",
    Client: client,
    Continut: continut,
  };
  if (opts?.dueDate) payload.DataScadenta = opts.dueDate;
  if (opts?.idExtern) payload.IdExtern = opts.idExtern;

  const data = await fgoPost<{ Factura: FgoInvoiceResult }>(
    `${baseUrl(config.sandbox)}/factura/emitere`,
    payload,
  );
  return data.Factura;
}

// ─── Print (obtine PDF link) ──────────────────────────────────────────────────

export async function printFgoInvoice(
  config: FgoConfig,
  numar: string,
  serie: string,
): Promise<string> {
  const hash = hashOperatii(config.cod_unic, config.private_key, numar);
  const data = await fgoPost<{ Factura: { Numar: string; Serie: string; Link: string } }>(
    `${baseUrl(config.sandbox)}/factura/print`,
    {
      CodUnic: config.cod_unic,
      Hash: hash,
      Numar: numar,
      Serie: serie,
      PlatformaUrl: config.platforma_url,
    },
  );
  return data.Factura.Link;
}

// ─── Stornare ─────────────────────────────────────────────────────────────────

export async function stornoFgoInvoice(
  config: FgoConfig,
  numar: string,
  serie: string,
): Promise<FgoInvoiceResult> {
  const hash = hashOperatii(config.cod_unic, config.private_key, numar);
  const data = await fgoPost<{ Factura: FgoInvoiceResult }>(
    `${baseUrl(config.sandbox)}/factura/stornare`,
    {
      CodUnic: config.cod_unic,
      Hash: hash,
      Numar: numar,
      Serie: serie,
      PlatformaUrl: config.platforma_url,
    },
  );
  return data.Factura;
}

// ─── Anulare ──────────────────────────────────────────────────────────────────

export async function cancelFgoInvoice(
  config: FgoConfig,
  numar: string,
  serie: string,
): Promise<void> {
  const hash = hashOperatii(config.cod_unic, config.private_key, numar);
  await fgoPost(
    `${baseUrl(config.sandbox)}/factura/anulare`,
    {
      CodUnic: config.cod_unic,
      Hash: hash,
      Numar: numar,
      Serie: serie,
      PlatformaUrl: config.platforma_url,
    },
  );
}

// ─── Test conexiune ───────────────────────────────────────────────────────────

export async function testFgoConnection(config: FgoConfig): Promise<{ ok: true; judete: number } | { ok: false; error: string }> {
  try {
    const judete = await getFgoNomenclator("judet", config.sandbox);
    return { ok: true, judete: judete.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
