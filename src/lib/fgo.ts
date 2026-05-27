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

async function fgoPost<T>(
  url: string,
  params: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
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

export async function getFgoNomenclator(
  type: string,
  sandbox: boolean,
  judet?: string,
): Promise<{ Nume: string; Valoare: string }[]> {
  const path = judet ? `/nomenclator/${type}?judet=${encodeURIComponent(judet)}` : `/nomenclator/${type}`;
  const res = await fetch(`${baseUrl(sandbox)}${path}`);
  if (!res.ok) throw new Error(`fGO nomenclator error: ${res.status}`);
  const data = (await res.json()) as { Success: boolean; Message?: string; List: { Nume: string; Valoare: string }[] };
  if (!data.Success) throw new Error(data.Message || "Eroare nomenclator fGO");
  return data.List ?? [];
}

// ─── Factura ──────────────────────────────────────────────────────────────────

export type FgoLineItem = {
  name: string;
  quantity: number;       // XXXX.XXX format
  unitPrice: number;      // pret unitar fara TVA
  vatRate: number;        // cota TVA ca numar (ex: 19)
  unit?: string;          // default BUC
};

export async function createFgoInvoice(
  config: FgoConfig,
  clientName: string,
  clientData: {
    tara?: string;
    judet?: string;
    localitate?: string;
    adresa?: string;
    email?: string;
    telefon?: string;
    tip?: "PF" | "PJ";
    codUnic?: string;
  },
  items: FgoLineItem[],
): Promise<FgoInvoiceResult> {
  const hash = hashEmitere(config.cod_unic, config.private_key, clientName);

  const params: Record<string, string> = {
    CodUnic: config.cod_unic,
    Hash: hash,
    Serie: config.serie,
    Valuta: config.valuta || "RON",
    TipFactura: config.tip_factura || "Factura",
    PlatformaUrl: config.platforma_url,
    "Client[Denumire]": clientName,
    "Client[Tara]": clientData.tara || "Romania",
    "Client[Tip]": clientData.tip || "PF",
  };

  if (clientData.judet) params["Client[Judet]"] = clientData.judet;
  if (clientData.localitate) params["Client[Localitate]"] = clientData.localitate;
  if (clientData.adresa) params["Client[Adresa]"] = clientData.adresa;
  if (clientData.email) params["Client[Email]"] = clientData.email;
  if (clientData.telefon) params["Client[Telefon]"] = clientData.telefon;
  if (clientData.codUnic) params["Client[CodUnic]"] = clientData.codUnic;

  items.forEach((item, i) => {
    params[`Continut[${i}][Denumire]`] = item.name;
    params[`Continut[${i}][NrProduse]`] = item.quantity.toFixed(3);
    params[`Continut[${i}][UM]`] = item.unit || "BUC";
    params[`Continut[${i}][CotaTVA]`] = String(item.vatRate);
    params[`Continut[${i}][PretUnitar]`] = item.unitPrice.toFixed(2);
  });

  const data = await fgoPost<{ Factura: FgoInvoiceResult }>(
    `${baseUrl(config.sandbox)}/factura/emitere`,
    params,
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
