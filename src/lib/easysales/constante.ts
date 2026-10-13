/**
 * Constantele integrarii easySales, fiecare cu sursa ei.
 *
 * Sursa principala e colectia Postman publica „easySales V2" (6542984/SzfDvj4T), descarcata pe
 * 12.10.2026, si mediul ei publicat „Production". Planul intreg, cu ce e documentat si ce e doar
 * presupus: `docs/marketplace/EASYSALES-PLAN.md`.
 *
 * ⚠ GAZDA NU VINE NICIODATA DIN CONFIGURARE. Pleaca la ea tokenul comerciantului si datele
 * cumparatorilor; o adresa citita din baza ar fi o usa pentru amandoua (vezi
 * `src/lib/integrari/gazda-configurabila.ts`). Se poate muta numai din mediu, pentru probe.
 */

/** Mediul publicat „Production" al documentatiei: `url` = `https://easy-sales.com`. */
export const GAZDA_IMPLICITA = "https://easy-sales.com";

/**
 * Gazda pe care chiar o folosim.
 *
 * ⚠ `EASYSALES_API_URL` exista numai pentru probe si pentru un server fals local. Se primeste
 * doar pe `https:`, sau pe `http:` catre masina locala; altfel se cade pe adresa lor, tacut si
 * corect: o variabila stricata nu are voie sa trimita tokenul altundeva.
 */
export function gazdaEasySales(): string {
  const brut = (process.env.EASYSALES_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!brut) return GAZDA_IMPLICITA;
  try {
    const u = new URL(brut);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) return brut;
  } catch {
    /* nici macar o adresa */
  }
  return GAZDA_IMPLICITA;
}

/** Toate rutele de date sunt `{{url}}/api/v2/...` [A]. */
export const PREFIX_API = "/api/v2";
/** Emiterea tokenului: `POST {{url}}/oauth/token` [A]. */
export const CALE_TOKEN = "/oauth/token";

/**
 * Comutatorul de lansare, ca la eMAG si Trendyol: pornit implicit, `false` il stinge.
 *
 * ⚠ STINGE NUMAI CONECTARILE NOI, nu magazinele deja conectate. Cronul si webhook-ul le servesc
 * mai departe: stampila se pune in baza, deci un comutator care ar opri trimiterea ar lasa comenzi
 * stampilate (fara factura si fara AWB din Edinio) care nu mai pleaca nicaieri. Oprirea unui
 * magazin e pauza lui (sau deconectarea), nu variabila asta.
 */
export function easysalesGloballyEnabled(): boolean {
  return process.env.EASYSALES_LIVE !== "false";
}

/**
 * Integrarea e deschisa pentru magazinul asta? Peste tot cand e lansata; altfel numai magazinelor
 * pilot din `EASYSALES_PILOT` (id-uri separate prin virgula). Administratorii trec separat.
 */
export function easysalesPermisPentru(businessId: string | null | undefined): boolean {
  if (easysalesGloballyEnabled()) return true;
  const pilot = (process.env.EASYSALES_PILOT ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return !!businessId && pilot.includes(businessId);
}

/**
 * Scope-urile cerute la emitere.
 *
 * ⚠ TOATE DIN PRIMA. Un token nou il revoca pe cel vechi („Only one token per client"), iar
 * scope-urile se trimit numai la emitere; un scope adaugat mai tarziu cere, dupa toate
 * probabilitatile, o emitere noua (IPOTEZA, M-AUTH-5). Lista e versionata: daca o etapa o
 * largeste, cronul face o singura reemitere planificata, sub zavor.
 *
 * Legatura ruta-scope e scrisa explicit numai la cateva rute [A]; restul se potriveste dupa nume
 * (planul, §12). `update-customers` NU intra: proprietarul a hotarat ca stergerea datelor la
 * easySales o face comerciantul, care are contractul cu ei.
 */
export const SCOPURI = [
  // comenzi (E2, E4)
  "read-orders", "add-orders", "update-orders",
  // catalog (E3)
  "read-products", "add-products", "update-products",
  "read-categories", "add-categories", "update-categories",
  "read-characteristics", "add-characteristics", "update-characteristics",
  // stoc (E4)
  "update-stock", "read-fulfillment-services",
  // conexiune si sanatate (E1)
  "manage-webhooks", "read-websites-list", "read-marketplaces-list", "read-couriers", "read-billing-software",
  // etichete: rezerva pentru filtrele automatizarilor lor (ES-10)
  "read-tags", "add-tags", "attach-tags", "detach-tags",
  // extinderi (E5)
  "read-offers", "update-delivery-status", "add-order-returns",
] as const;

/** Versiunea listei de mai sus. Se mareste la fiecare schimbare a listei. */
export const VERSIUNE_SCOPURI = 1;

/**
 * Scope-urile fara de care integrarea nu are rost. Daca grantul refuza lista intreaga fara sa
 * spuna care scope supara, se mai incearca o data numai cu ele.
 */
export const SCOPURI_ESENTIALE = [
  "read-orders", "add-orders", "update-orders",
  "read-products", "add-products", "update-products",
  "add-categories", "update-categories", "add-characteristics", "update-characteristics",
  "update-stock", "manage-webhooks", "read-websites-list",
] as const;

/** „For security reasons the access tokens expire after one year." [A] */
export const DURATA_TOKEN_SEC = 31_536_000;
/** Reinnoirea planificata: cu cel mult atatea zile inaintea expirarii (planul, §4.6). */
export const ZILE_REINNOIRE = 30;

/** Termenele cererilor: simple si in bloc (planul, §5.0). */
export const TERMEN_SIMPLU_MS = 20_000;
export const TERMEN_BLOC_MS = 60_000;

/**
 * Limita lor e de 500 de cereri pe minut „per user" [A]. Bugetul nostru e jumatate, comun tuturor
 * magazinelor Edinio de pe acelasi cont: restul ramane altor programe ale comerciantului.
 */
export const LIMITA_LOR_PE_MINUT = 500;
export const BUGET_PE_MINUT = 250;
/** Sub atatea cereri ramase in `X-RateLimit-Remaining`, se face pauza pana la minutul urmator. */
export const PRAG_RAMASE = 50;

/** Cat tine zavorul emiterii; cererea de token are termen 20 s, deci zavorul o depaseste. */
export const LEASE_EMITERE_SEC = 30;
/** Cat asteapta cine pierde zavorul pana citeste tokenul castigatorului. */
export const ASTEPTARE_EMITERE_MS = 10_000;
/** Cel mult o reemitere la 401 pe magazin, in fereastra asta (planul, §4.6). */
export const PAUZA_REEMITERE_MS = 10 * 60_000;

/**
 * Evenimentele la care se aboneaza magazinul, in ordinea in care se cer.
 *
 * ⚠ `delivery-status-updated` lipseste din tabelul oficial de sluguri, dar are exemplu de payload
 * si ghidul il recomanda: un refuz la el nu opreste celelalte abonari (planul, §6.7).
 * ⚠ Evenimentele de produs si de categorie NU: sursa catalogului suntem noi.
 */
export const SLUGURI_ABONATE = [
  "order-created", "order-updated", "awb-created", "invoice-created", "storno-invoice-created",
  "delivery-status-updated",
  "account-suspended", "account-activated",
  "products-refresh-requested", "stock-refresh-requested",
] as const;
export type SlugAbonat = (typeof SLUGURI_ABONATE)[number];

/**
 * Starile comenzilor, dupa filtrul `status` al listei [A]: 0 Canceled, 1 New, 2 Received,
 * 3 Completed, 4 Processing, 5 Incomplete, 6 Return.
 */
export const STARI_COMANDA = {
  0: "Canceled", 1: "New", 2: "Received", 3: "Completed", 4: "Processing", 5: "Incomplete", 6: "Return",
} as const;

/** Starile livrarii [A: filtrul `delivery_status` si `GET /delivery-statuses`]. */
export const STARI_LIVRARE = {
  1: "Ready", 2: "On Route", 3: "Delayed", 4: "Delivered", 5: "Return", 6: "Unknown", 7: "Canceled",
} as const;

/** Modurile de plata trimise la ei [A: „Payment Mode" din Save Order]. */
export const MOD_PLATA = { online: 1, ramburs: 2, transfer: 3 } as const;

/** Cate zile se pastreaza jurnalul si inboxul (planul, §5.0 si §6.6). */
export const ZILE_PASTRARE = 30;

/** Plafonul corpului unei livrari de webhook pe care il citim. Un eveniment de-al lor are cativa KB. */
export const PLAFON_CORP_WEBHOOK = 256 * 1024;
