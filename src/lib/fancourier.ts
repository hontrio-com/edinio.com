import { normalizePhone } from "@/lib/utils/phone";
import { normalizeCountyName, normalizeLocalityName } from "@/lib/utils/ro-address";
import { eroareCuStatus, eroareDeTermen, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { cheieToken } from "@/lib/integrari/cheie-token";

const BASE_URL = "https://api.fancourier.ro";

/*
 * ⚠ TERMENE. Niciun `fetch` de aici nu avea vreunul.
 *
 * Cele doua cotatii FAN stau in acelasi `Promise.all` cu TOTI ceilalti curieri ai
 * magazinului (`shipping.actions.ts`). Un FAN care nu raspunde nu intarzia doar
 * FAN: tinea in loc TOATE optiunile de livrare din checkout, pana la termenul
 * platformei. Iar rezerva scrisa special pentru asta, `.catch` care cade pe
 * pretul fix al zonei, nu se declansa niciodata, fiindca nimic nu esua.
 *
 * Termene diferite fiindca si miza e diferita: o citire care cade nu strica
 * nimic, o scriere care cade poate lasa un colet creat la FAN.
 */
const TERMEN_LOGIN_MS = 15_000;
const TERMEN_CITIRE_MS = 20_000;
const TERMEN_SCRIERE_MS = 45_000;
const TERMEN_ETICHETA_MS = 60_000;

// FANbox hard limits (API docs, "FANbox particularities"): max 30 kg, exactly
// one parcel per AWB, parcel must fit the largest locker compartment (L).
export const FANBOX_MAX_WEIGHT_KG = 30;
export const FANBOX_COMPARTMENT_CM = [40.4, 44.3, 45] as const; // sorted min→max

/**
 * Incape coletul in cel mai mare compartiment FANbox?
 *
 * ⚠ EXISTA CA SA FIE O SINGURA COMPARATIE, nu trei. Regula („sortezi cele trei laturi
 * crescator, fiecare trebuie sa intre sub perechea ei") era scrisa de doua ori, iar
 * cotarea din checkout nu o avea deloc: acolo se verifica doar greutatea.
 *
 * ⚠ CE COSTA LIPSA EI, si e o urmare directa a reparatiei dimensiunilor din 13.09.2026:
 * de cand emiterea cere dimensiuni, comerciantul isi seteaza „coletul obisnuit" in
 * Setari. Daca acela e 60x40x40, cotarea oferea mai departe FANbox (greutatea trecea),
 * clientul alegea lockerul si PLATEA, iar emiterea refuza apoi cu „coletul depaseste
 * compartimentul". Comanda platita, curierul promis imposibil de folosit.
 */
export function incapeInFanbox(colet: { length: number; width: number; height: number }): boolean {
  const sortate = [colet.length, colet.width, colet.height].sort((a, b) => a - b);
  return !sortate.some((d, i) => d > FANBOX_COMPARTMENT_CM[i]);
}
// info.cod is capped at 10.000 by the API (schema: "cod: numeric – 10000 max").
export const FAN_MAX_COD = 10000;

export type FanCourierConfig = {
  enabled: boolean;
  username: string;
  password: string;
  client_id: number;
  client_name: string;
  /**
   * ePOD (option X): the merchant prints their own label instead of FAN's A5
   * paper AWB. Opt-in, default OFF — same default as FAN's official module.
   */
  epod?: boolean;
  /**
   * Coletul obisnuit al magazinului, in centimetri.
   *
   * ⚠ DE CE E O SETARE, SI NU O VALOARE IMPLICITA IN COD.
   *
   * `info.dimensions` e OBLIGATORIU la FAN (pag. 12) si intra in greutatea
   * volumetrica. Pana pe 09.09.2026, cand comerciantul nu completa nimic,
   * plecau 1x1x1 cm la AWB si 10x10x10 la ridicare: numere inventate, care
   * subdeclarau coletul. Curierul recantareste la depozit si refactureaza
   * diferenta, iar comerciantul o plateste fara sa o vada, exact paguba
   * inchisa in 2026-08-03, cand greutatea fixa de 1 kg a fost inlocuita cu cea
   * din catalog.
   *
   * Nu se poate ghici un carton in locul cuiva, dar se poate INTREBA o data.
   * Cand lipseste, emiterea cere dimensiuni in loc sa le inventeze.
   */
  colet_implicit?: { length: number; width: number; height: number } | null;
  /** Last courier pickup order placed from the dashboard (duplicate-warning UI). */
  last_pickup_date?: string | null;
  last_pickup_id?: string | null;
  /**
   * Sucursala CU CARE s-a cerut ridicarea de mai sus.
   *
   * ⚠ Fotografie, ca `orders.fan_courier_awb_client_id`, si din acelasi motiv:
   * anularea unei ridicari se cere pe contul care a cerut-o. Un comerciant cu doua
   * puncte de lucru care isi muta sucursala in Setari intre programare si anulare
   * trimitea altfel stergerea pe contul NOU, iar FAN raspunde „nu e a ta".
   */
  last_pickup_client_id?: number | null;
};

/**
 * Configurarea cu care se lucreaza pe un AWB DEJA EMIS.
 *
 * ⚠ Anularea, eticheta si urmarirea trebuie facute pe SUCURSALA CU CARE S-A
 * EMIS, nu pe cea din configurarea de acum. Un comerciant cu doua puncte de
 * lucru care isi muta sucursala in Setari cerea altfel AWB-urile vechi pe contul
 * nou: FAN raspunde „nu e al tau", si eticheta unei comenzi deja expediate nu se
 * mai putea scoate. Credentiala ramane cea curenta, ea se roteste legitim si e
 * a contului, nu a sucursalei.
 */
export function configPentruAwbEmis(
  config: FanCourierConfig,
  clientIdLaEmitere: number | null | undefined,
): FanCourierConfig {
  return clientIdLaEmitere && clientIdLaEmitere > 0
    ? { ...config, client_id: clientIdLaEmitere }
    : config;
}

/**
 * `client_id` verificat, gata de pus intr-o adresa.
 *
 * ⚠ Coloana de configurare e JSON, deci tipul `number` din `FanCourierConfig` e
 * o promisiune, nu o garantie: valoarea vine din formular si trece prin baza.
 * Intra apoi NEINCADRATA in trei adrese catre FAN (`awb?clientId=`,
 * `order?clientId=`, `awb/label?clientId=`), unde un sir cu `&` sau `#` ar fi
 * putut adauga sau taia parametri. Numarul se verifica o data, aici.
 */
function clientIdValid(config: FanCourierConfig): string {
  const n = Number(config.client_id);
  if (!Number.isInteger(n) || n <= 0) {
    throw eroareRefuz("FAN Courier: sucursala expeditoare (client ID) lipseste sau e invalida. Reconecteaza contul in Setari.");
  }
  return String(n);
}

/**
 * Contextul unui AWB emis: sucursala, tariful si TVA-ul, oricare ar fi ramura.
 *
 * ⚠ EXISTA CA SA POATA FI PROBAT. Regula traia inline in `createFanCourierAwbAction`,
 * care e „use server" si isi face singura clientii, deci nu se putea proba fara sa
 * mockuiesc module. Scoasa aici, mutantul se pune pe APELANT: ce vine din registru.
 *
 * ⚠ CE APARA. Pe ramura `deja` (AWB creat la FAN, scrierea pe comanda pierduta) codul
 * scria sucursala DE ACUM. Daca intre cele doua apasari comerciantul isi muta punctul
 * de lucru in Setari, comanda ramanea pironita cu sucursala GRESITA, iar anularea si
 * eticheta plecau apoi pe contul pe care FAN il refuza. Acum contextul vine din
 * `operatii_externe.detalii`, singurul loc unde registrul chiar il pastreaza.
 *
 * ⚠ Tariful ZERO e o valoare, nu o lipsa: un tarif negociat poate fi 0, si exista deja
 * o proba care apara asta la cotare. Doar sucursala cere strict pozitiv.
 */
export function contextulAwbEmis(date: {
  creata: ExpediereFanCreata | null;
  clientIdCurent: number;
  dinRegistru: unknown;
}): { clientId: number | null; tariff: number | null; vat: number | null } {
  if (date.creata) {
    return { clientId: date.clientIdCurent, tariff: date.creata.tariff, vat: date.creata.vat };
  }
  /* ⚠ Prin `detalii` valorile trec ca `Json`, deci un sir „111" ar ajunge intr-o coloana
     `bigint`. `client_id` din configurare e oricum „o promisiune, nu o garantie". */
  const d = (date.dinRegistru ?? null) as { clientId?: unknown; tariff?: unknown; vat?: unknown } | null;
  const pozitiv = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const numar = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return { clientId: pozitiv(d?.clientId), tariff: numar(d?.tariff), vat: numar(d?.vat) };
}

/**
 * Ce se goleste pe comanda cand AWB-ul FAN se dezleaga.
 *
 * ⚠ BANII RAMAN CAT TIMP COLETUL RAMANE VIU LA FAN. Dezlegarea are trei iesiri, si
 * doar una inseamna ca nu mai e nimic de facturat:
 *
 *   anulat la FAN          -> coletul a incetat sa existe, nu costa nimic: se goleste tot.
 *   FAN a REFUZAT anularea -> coletul pleaca si va veni pe factura lunara.
 *   n-am avut cu ce cere   -> la fel, si cu atat mai sigur.
 *
 * Pe ultimele doua, tariful, TVA-ul si sucursala sunt singura urma care leaga factura
 * de comanda, si tocmai ele se stergeau. Vezi migratia 2027-01-07, care le-a adus.
 */
export function campuriDezlegareFan(
  anulatLaFan: boolean,
  trackingEsteAlAcestuiAwb: boolean,
): Record<string, null> {
  return {
    fan_courier_awb_number: null,
    ...(anulatLaFan ? { fan_courier_awb_client_id: null, fan_courier_cost: null, fan_courier_vat: null } : {}),
    // `tracking_number` e comun tuturor curierilor: se goleste DOAR daca e chiar al acestui AWB.
    ...(trackingEsteAlAcestuiAwb ? { tracking_number: null } : {}),
  };
}

/** Dimensiunile coletului implicit, daca sunt configurate si valide. */
export function coletImplicit(config: FanCourierConfig): { length: number; width: number; height: number } | null {
  const c = config.colet_implicit;
  if (!c) return null;
  const bun = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 999;
  return bun(c.length) && bun(c.width) && bun(c.height)
    ? { length: c.length, width: c.width, height: c.height }
    : null;
}

export type FanCourierBranch = {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: {
    locality: string;
    county: string;
    street: string;
    streetNo: string;
  };
};

export type FanCourierAwbInput = {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientCounty: string;
  recipientLocality: string;
  recipientStreet: string;
  recipientStreetNo: string;
  recipientZipCode: string;
  parcels: number;
  weightKg: number;
  length?: number;
  width?: number;
  height?: number;
  cod: number;
  content: string;
  observation: string;
  /**
   * FANbox locker ID (e.g. "F1011137"). Presence switches the AWB to the
   * FANbox service: the locker is looked up via reports/pickup-points?id= and
   * its own county/locality are sent (the API requires they match the locker),
   * with the ID in address.pickupLocationId per the FANbox request examples.
   */
  fanboxId?: string;
};

// ─── Token cache ──────────────────────────────────────────────────────────────

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23h (token valid 24h)

/**
 * Login-uri in curs, ca sa nu se ceara acelasi token de mai multe ori deodata.
 *
 * Checkout-ul cere DOUA cotatii FAN in acelasi `Promise.all` (domiciliu si
 * FANbox), iar generarea in masa porneste mai multe AWB-uri simultan: pe cache
 * rece, fiecare pornea propriul login. FAN vede atunci un varf de autentificari
 * pentru acelasi cont, iar noi platim latenta de fiecare data.
 */
const loginuriInCurs = new Map<string, Promise<string>>();

/**
 * Momentul, in milisecunde, pana la care tokenul e sigur bun.
 *
 * ⚠ `expiresAt` de la FAN vine FARA fus orar ("2024-06-14 06:00:55", pag. 5).
 * Citit naiv ca UTC pe un server Vercel, ar iesi cu pana la 3 ore MAI TARZIU
 * decat momentul real (Romania e UTC+2, vara UTC+3), adica exact pe dos, am
 * lungi fereastra in loc sa o scurtam. De aceea se scade cel mai mare decalaj
 * posibil si inca un minut, si se ia mereu MINIMUL cu TTL-ul nostru.
 */
function valabilPanaLa(anuntat: unknown): number {
  const local = Date.now() + TOKEN_TTL_MS;
  if (typeof anuntat !== "string" || !anuntat.trim()) return local;
  const t = Date.parse(`${anuntat.trim().replace(" ", "T")}Z`);
  if (!Number.isFinite(t)) return local;
  return Math.min(local, t - 3 * 60 * 60 * 1000 - 60_000);
}

async function getFanCourierToken(username: string, password: string): Promise<string> {
  // ⚠ Cheia contine si PAROLA, hasuita. Cu doar username-ul, o cerere cu parola
  // gresita primea tokenul valid din cache si trecea fara sa atinga FAN: „conectat"
  // fals peste o credentiala invalida, si, fiindca harta e comuna intregului
  // proces, datele contului altui magazin, IBAN inclus. Vezi `cheie-token.ts`.
  const key = cheieToken([username], [password]);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const inCurs = loginuriInCurs.get(key);
  if (inCurs) return inCurs;

  const promisiune = (async () => {
    /*
     * ⚠ E POST, dar e CITIRE: autentificarea nu creeaza niciun colet. Un termen depasit
     * aici dovedeste ca emiterea nici n-a inceput, deci verdictul e refuz, iar
     * reincercarea dupa ce FAN isi revine ramane libera. Lasat „nu stim", bloca in
     * registru o comanda despre care FAN n-a auzit.
     */
    let res: Response;
    try {
      res = await fetch(
        `${BASE_URL}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        { method: "POST", signal: AbortSignal.timeout(TERMEN_LOGIN_MS) },
      );
    } catch (e) {
      throw eroareDeTermen(e, false, "autentificarea", "FAN Courier");
    }

    const text = await res.text();
    // Never log the response body here, it contains the auth token.
    if (!res.ok) {
      console.error("[fancourier] login failed: status=%d", res.status);
      throw eroareRefuz(`FAN Courier login error: ${res.status} ${res.statusText}, ${text.slice(0, 200)}`);
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { throw eroareRefuz(`FAN Courier login: raspuns invalid, ${text.slice(0, 200)}`); }
    const nested = data.data as Record<string, unknown> | undefined;
    const token = (nested?.token ?? data.token ?? data.access_token) as string | undefined;
    if (!token || typeof token !== "string") throw eroareRefuz(`FAN Courier login: token absent din raspuns, ${text.slice(0, 200)}`);

    tokenCache.set(key, { token, expiresAt: valabilPanaLa(nested?.expiresAt) });
    return token;
  })();

  loginuriInCurs.set(key, promisiune);
  try {
    return await promisiune;
  } finally {
    // Se sterge si la esec: altfel o parola gresita ar tine intrarea moarta si
    // toate cererile urmatoare ar primi aceeasi eroare fara sa mai incerce.
    loginuriInCurs.delete(key);
  }
}

/** Pentru probe: goleste tokenurile pastrate. */
export function uitaTokenurileFan(): void {
  tokenCache.clear();
  loginuriInCurs.clear();
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * Authorized fetch with one automatic re-login on 401: the cached token can be
 * invalidated server-side before our 23h TTL (password change, FAN revocation),
 * and merchants have no way to "restart" the app — so recover transparently.
 */
async function fanFetch(
  username: string,
  password: string,
  path: string,
  init?: RequestInit,
  _retried = false,
  termenMs: number = TERMEN_CITIRE_MS,
): Promise<Response> {
  const token = await getFanCourierToken(username, password);
  const res = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    signal: AbortSignal.timeout(termenMs),
    headers: { ...(init?.headers ?? {}), "Authorization": `Bearer ${token}` },
  });
  if (res.status === 401 && !_retried) {
    // Aceeasi cheie ca la scriere: cu `username` gol, invalidarea nu nimerea
    // niciodata intrarea, iar reincercarea pleca tot cu tokenul mort.
    tokenCache.delete(cheieToken([username], [password]));
    return fanFetch(username, password, path, init, true, termenMs);
  }
  return res;
}

/* ⚠ `eroareDeTermen` s-a MUTAT in `operatii/eroare-furnizor.ts` pe 13.09.2026, langa
   ceilalti constructori de verdict. Motivul: in aceeasi zi au primit termene si Sameday,
   Woot, DPD, Cargus si Colete, deci regula a ajuns sa fie nevoie la sase curieri, iar o
   regula comuna nu are voie sa stea in fisierul unuia singur. Purtarea e neschimbata;
   numele furnizorului vine acum ca argument. */

async function fanGet<T>(username: string, password: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fanFetch(username, password, path);
  } catch (e) {
    /*
     * ⚠ SI TERMENUL DE AICI E REFUZ DOVEDIT, nu „nu stim".
     *
     * `getSenderBranch` cheama functia asta INAINTE de fiecare AWB. Pana azi, un
     * `reports/branches` care nu raspundea in 20 de secunde iesea ca `TimeoutError`
     * brut, nu trecea prin niciun constructor, si `verdictFurnizor` il lua drept
     * `necunoscut`: randul din registru bloca definitiv comanda, iar comerciantul
     * trebuia sa deblocheze de mana un AWB pe care FAN nu-l vazuse niciodata.
     * Citirea se face inaintea scrierii, deci expirarea ei dovedeste ca emiterea
     * nici n-a plecat.
     */
    throw eroareDeTermen(e, false, `citirea ${path}`, "FAN Courier");
  }
  // Citire pura: orice esec dovedeste ca nu s-a creat nimic, deci NU are voie sa
  // blocheze o comanda. `getSenderBranch` cheama asta inainte de FIECARE AWB.
  if (!res.ok) throw eroareRefuz(`FAN Courier GET ${path}: ${res.status} ${res.statusText}`);
  const data = await res.json() as { status: string; data?: T; message?: string };
  if (data.status !== "success") throw eroareRefuz(data.message ?? `FAN Courier GET ${path} failed`);
  return data.data as T;
}

/** Push FAN error value(s) (string | string[] | Laravel field→messages map) into out. */
function pushFanErrors(e: unknown, out: string[]): void {
  if (!e) return;
  if (typeof e === "string") { if (e.trim()) out.push(e.trim()); return; }
  if (Array.isArray(e)) {
    for (const item of e) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
      else if (item && typeof item === "object") {
        const io = item as Record<string, unknown>;
        if (typeof io.message === "string" && io.message.trim()) out.push(io.message.trim());
      }
    }
    return;
  }
  if (typeof e === "object") {
    // Laravel-style validation map: { "field.name": ["msg", …], … }
    for (const v of Object.values(e as Record<string, unknown>)) pushFanErrors(v, out);
  }
}

/**
 * intern-awb reports the real reason (bad locality, missing zip/sender, service
 * not enabled, COD too high, …) inside per-shipment `errors` — which may be a
 * string, an array, or a Laravel field→messages object — under `response`/`data`.
 * Walk the body and collect those human-readable messages.
 */
function collectFanErrors(node: unknown, out: string[] = [], depth = 0): string[] {
  if (!node || depth > 6) return out;
  if (Array.isArray(node)) {
    for (const n of node) collectFanErrors(n, out, depth + 1);
    return out;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    pushFanErrors(o.errors, out);
    for (const key of ["response", "data", "shipments", "shipment"]) {
      if (o[key]) collectFanErrors(o[key], out, depth + 1);
    }
  }
  return out;
}

/** Deduped, joined FAN Courier error detail (empty string if none found). */
function fanErrorDetail(parsed: unknown): string {
  return [...new Set(collectFanErrors(parsed))].join("; ");
}

/**
 * The sender is NOT part of the intern-awb payload's `shipments`; FAN derives it
 * from `clientId` (the sender branch) but the live API also validates a
 * root-level `sender` object, so we fetch the branch matching client_id and send
 * it explicitly. `reports/branches` returns the branch id (== clientId) plus the
 * name/phone/address FAN requires for the sender.
 */
async function getSenderBranch(config: FanCourierConfig): Promise<FanCourierBranch> {
  const branches = await getFanCourierBranches(config.username, config.password);
  if (branches.length === 0) {
    throw eroareRefuz("FAN Courier: contul nu are niciun branch expeditor. Reconecteaza contul in Setari.");
  }
  // clientId in the AWB payload MUST be the sender branch — never fall back
  // silently to another branch, that would ship from the wrong pickup point.
  const match = branches.find((b) => Number(b.id) === Number(config.client_id));
  if (!match) {
    throw eroareRefuz(
      `FAN Courier: branch-ul expeditor salvat (ID ${config.client_id}) nu mai exista pe cont. Reconecteaza contul in Setari > Integrari > FAN Courier si alege branch-ul corect.`,
    );
  }
  return match;
}

/**
 * DELETE la FAN, cu raspunsul CITIT, nu doar cu codul HTTP.
 *
 * ⚠ Pana pe 09.09.2026 aici sta doar `if (!res.ok)`, iar corpul nu se atingea
 * niciodata. Un HTTP 200 cu `{"status":"error"}` trecea drept anulare reusita:
 * apelantii stergeau apoi numarul de pe comanda si eliberau slotul din registru,
 * deci comanda ramanea fara AWB in Edinio si CU AWB viu la FAN.
 *
 * ⚠ DAR NU SE CERE `status === "success"` LA AMANDOUA.
 *
 * Stergerea AWB-ului are corp documentat (pag. 11). Stergerea comenzii de
 * ridicare (pag. 39) NU are niciun exemplu de raspuns, auditul care a semnalat
 * defectul a citat gresit pagina aici. Cerut si acolo, un 200 gol, perfect
 * valid, ar fi devenit „anularea a esuat", iar ziua ar fi ramas blocata in
 * registru. Deci regula e pe dos: se refuza doar cand FAN spune EXPLICIT ca a
 * refuzat; tacerea inseamna acceptat.
 */
async function fanDelete(username: string, password: string, path: string): Promise<void> {
  let res: Response;
  try {
    res = await fanFetch(username, password, path, { method: "DELETE" }, false, TERMEN_SCRIERE_MS);
  } catch (e) {
    throw eroareDeTermen(e, true, "anularea la curier", "FAN Courier");
  }
  const raw = await res.text().catch(() => "");

  if (!res.ok) {
    throw eroareCuStatus(`FAN Courier DELETE ${path}: ${res.status}, ${raw || res.statusText}`, res.status);
  }

  /*
   * ⚠ UN CORP NEGOL CARE NU E JSON NU MAI TRECE DREPT ANULARE REUSITA (13.09.2026).
   *
   * FAN, sau un intermediar din fata lui, poate raspunde 200 cu o pagina HTML de
   * intretinere. `JSON.parse` crapa, `catch`-ul o inghitea, si functia se intorcea fara
   * eroare, adica „anulat". Apelantul stergea apoi numarul de pe comanda, costul si TVA-ul,
   * si elibera slotul din registru. La FAN insa coletul ramanea VIU: ridicat, livrat,
   * cu rambursul incasat pe un AWB despre care noi nu mai stiam nimic, si cu comanda
   * libera sa primeasca pe loc al doilea AWB.
   *
   * ⚠ `necunoscut`, nu refuz: chiar nu stim daca stergerea s-a facut. Iar tacerea
   * ADEVARATA, adica un corp GOL, ramane acceptata: stergerea comenzii de ridicare
   * (pag. 39) n-are niciun raspuns documentat, si cerut si acolo, un 200 gol perfect
   * valid ar fi devenit „anularea a esuat".
   */
  let parsed: unknown = null;
  let neinteligibil = false;
  try { parsed = raw.trim() ? JSON.parse(raw) : null; } catch { neinteligibil = true; }
  if (neinteligibil) {
    throw eroareNesigura(
      `FAN Courier a raspuns ${res.status} la anulare cu ceva ce nu am putut citi. `
      + "Verifica in contul FAN daca AWB-ul mai exista inainte de a reincerca.",
    );
  }
  if (!parsed || typeof parsed !== "object") return;

  const rec = parsed as Record<string, unknown>;
  const detaliu = fanErrorDetail(parsed);
  if (typeof rec.status === "string" && rec.status.toLowerCase() !== "success") {
    throw eroareRefuz(`FAN Courier: ${detaliu || (typeof rec.message === "string" ? rec.message : "anularea a fost refuzata")}`);
  }
  if (detaliu) throw eroareRefuz(`FAN Courier: ${detaliu}`);
}

// ─── Branches (clientId) ──────────────────────────────────────────────────────

export async function getFanCourierBranches(
  username: string,
  password: string,
): Promise<FanCourierBranch[]> {
  return fanGet<FanCourierBranch[]>(username, password, "reports/branches");
}

export async function loadFanCourierAccount(
  username: string,
  password: string,
): Promise<{ branches: FanCourierBranch[] } | { error: string }> {
  try {
    const branches = await getFanCourierBranches(username, password);
    return { branches };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── AWB Creation ─────────────────────────────────────────────────────────────

/**
 * Numerele care pleaca la FAN, verificate dupa schema de la pag. 12.
 *
 * ⚠ TIPURILE TypeScript NU VALIDEAZA UN APEL HTTP. Pana pe 09.09.2026, singurul
 * plafon verificat era rambursul. Probat pe codul de atunci: `parcels: -2`,
 * `weightKg: -5` si `cod: -12` plecau la FAN exact asa cum au venit, iar o
 * strada goala devenea literal sirul „Strada".
 *
 * Se REFUZA, nu se corecteaza: un numar de colete negativ nu are o valoare
 * „corecta" pe care sa o ghicim, iar o eticheta emisa pe date ghicite e un colet
 * fizic plecat gresit.
 */
function verificaNumerele(input: FanCourierAwbInput): void {
  const intreg = (v: number, min: number, max: number) =>
    Number.isInteger(v) && v >= min && v <= max;
  const numar = (v: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

  if (!intreg(input.parcels, 1, 999)) {
    throw eroareRefuz(`FAN Courier: numarul de colete trebuie sa fie un intreg intre 1 si 999 (primit: ${input.parcels}).`);
  }
  if (!numar(input.weightKg, 0.01, 9999)) {
    throw eroareRefuz(`FAN Courier: greutatea trebuie sa fie intre 0,01 si 9999 kg (primit: ${input.weightKg}).`);
  }
  if (!numar(input.cod, 0, FAN_MAX_COD)) {
    throw eroareRefuz(
      input.cod < 0
        ? `FAN Courier: rambursul nu poate fi negativ (primit: ${input.cod}).`
        : `FAN Courier: rambursul maxim acceptat este ${FAN_MAX_COD.toLocaleString("ro-RO")} lei. Imparte comanda sau incaseaza online.`,
    );
  }
  for (const [nume, v] of [["lungimea", input.length], ["latimea", input.width], ["inaltimea", input.height]] as const) {
    if (v === undefined) continue;
    if (!numar(v, 0.1, 999)) {
      throw eroareRefuz(`FAN Courier: ${nume} coletului trebuie sa fie intre 0,1 si 999 cm (primit: ${v}).`);
    }
  }
}

/** Taie un text la lungimea maxima documentata. `undefined` cand ramane gol. */
function taie(v: string | undefined | null, max: number): string | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max).trim() : t;
}

/**
 * Ce se stie despre expediere imediat dupa ce FAN a acceptat-o.
 *
 * ⚠ `tariff` si `vat` vin in CHIAR obiectul din care se citeste numarul AWB
 * (pag. 15), si pana pe 09.09.2026 se aruncau. Fara ele, nicio subcotare de
 * transport nu putea fi vazuta vreodata: greutatea de rezerva, dimensiunile
 * lipsa, coletele in plus si comisionul de ramburs scumpesc toate identic si in
 * tacere, iar diferenta o plateste comerciantul la factura lunara.
 */
export type ExpediereFanCreata = {
  awbNumber: string;
  /** Tariful comunicat de FAN, fara TVA. `null` cand nu l-a trimis: nu se deduce. */
  tariff: number | null;
  vat: number | null;
};

export async function createFanCourierAwb(
  config: FanCourierConfig,
  input: FanCourierAwbInput,
): Promise<ExpediereFanCreata> {
  const isFanbox = !!input.fanboxId;

  verificaNumerele(input);

  /*
   * O SINGURA sursa de dimensiuni pentru toate fluxurile.
   *
   * Modalul le poate trimite pe cele ale coletului; lotul nu are de unde sa le
   * stie, deci cade pe coletul obisnuit al magazinului. Daca nici acela nu e
   * configurat, se REFUZA cu un mesaj care spune unde se completeaza, inainte
   * era 1x1x1, adica un colet inexistent declarat la curier.
   */
  /*
   * ⚠ ORI TOATE TREI, ORI NICIUNA.
   *
   * Conditia cerea `typeof === "number"` pe toate trei deodata, deci o singura masura
   * lipsa arunca TACUT si celelalte doua si cadea pe coletul obisnuit al magazinului.
   * Concret, cu cutia configurata 30x20x10: omul scrie L=120 si l=80 si uita inaltimea,
   * iar la FAN pleaca 30x20x10 pentru un colet de 120x80. FAN recantareste volumetric la
   * depozit si refactureaza diferenta, pe care comerciantul o vede abia pe factura lunara,
   * adica exact subcotarea tacuta pe care campul `colet_implicit` a fost adaugat sa o inchida.
   *
   * ⚠ `verificaNumerele` NU prinde asta, si nici nu trebuie: el sare peste `undefined`
   * dinadins, fiindca valideaza INTERVALUL, nu prezenta.
   */
  const dateCompletate = [input.length, input.width, input.height].filter((v) => typeof v === "number");
  if (dateCompletate.length > 0 && dateCompletate.length < 3) {
    throw eroareRefuz(
      "FAN Courier: completeaza TOATE trei dimensiunile coletului (L x l x H), sau lasa-le pe toate "
      + "goale ca sa plece coletul obisnuit din Setari > Integrari > FAN Courier.",
    );
  }

  const dateDinInput =
    dateCompletate.length === 3
      ? { length: input.length as number, width: input.width as number, height: input.height as number }
      : null;
  const dimensiuni = dateDinInput ?? coletImplicit(config);
  if (!dimensiuni) {
    throw eroareRefuz(
      "FAN Courier: dimensiunile coletului (L x l x H) sunt obligatorii. Completeaza-le pe AWB, " +
      "sau seteaza coletul obisnuit in Setari > Integrari > FAN Courier.",
    );
  }

  // API hard limits — fail here with a clear message instead of a cryptic FAN error.
  if (input.cod > FAN_MAX_COD) {
    throw eroareRefuz(`FAN Courier: rambursul maxim acceptat este ${FAN_MAX_COD.toLocaleString("ro-RO")} lei. Imparte comanda sau incaseaza online.`);
  }
  if (isFanbox) {
    if (input.weightKg > FANBOX_MAX_WEIGHT_KG) {
      throw eroareRefuz(`FAN Courier: greutatea maxima pentru FANbox este ${FANBOX_MAX_WEIGHT_KG} kg.`);
    }
    if (input.parcels > 1) {
      throw eroareRefuz("FAN Courier: FANbox accepta un singur colet per AWB.");
    }
    if (!input.recipientEmail?.trim()) {
      throw eroareRefuz("FAN Courier: emailul destinatarului este obligatoriu pentru livrarea la FANbox.");
    }
    // Docs: "The package sizes ... are mandatory fields" for FANbox — the size
    // also decides the locker compartment, so refuse guessed dimensions.
    if (!incapeInFanbox(dimensiuni)) {
      throw eroareRefuz(`FAN Courier: coletul depaseste compartimentul FANbox (max ${FANBOX_COMPARTMENT_CM.join(" x ")} cm).`);
    }
  }

  /*
   * ⚠ ADRESA GOALA NU SE UMPLE CU UN CUVANT.
   *
   * Aici statea `street: input.recipientStreet || "Strada"`, adica literalmente
   * sirul „Strada" trimis ca adresa cand comanda n-avea una. Schema cere campul
   * (pag. 12), deci placeholder-ul trecea de validarea LOR, si pleca un colet
   * real catre o adresa care nu exista. Curierul il plimba, nu-l gaseste, si se
   * intoarce: comerciantul plateste dus-intors si afla abia peste o saptamana.
   *
   * Judetul si localitatea erau deja obligatorii in modal; strada nu era. Acum
   * se cere si ea, si se cere DE LA OM, care poate sa o completeze, nu de la
   * cod, care ar putea doar sa o inventeze.
   *
   * FANbox nu trece pe aici: acolo adresa vine de la locker.
   */
  if (!isFanbox && !input.recipientStreet?.trim()) {
    throw eroareRefuz("FAN Courier: adresa destinatarului (strada) este obligatorie. Completeaza-o pe comanda sau in fereastra de AWB.");
  }

  const sender = await getSenderBranch(config);

  // FANbox: the API requires the request's county/locality to match the
  // locker's, so resolve the locker by ID and use FAN's own values verbatim.
  let fanboxPoint: FanCourierPickupPoint | null = null;
  if (isFanbox) {
    fanboxPoint = await getFanCourierPickupPointById(config.username, config.password, input.fanboxId!);
    if (!fanboxPoint) {
      throw eroareRefuz(`FAN Courier: lockerul ${input.fanboxId} nu a fost gasit in lista FANbox. Verifica selectia clientului.`);
    }
  }

  // Determine service: FANbox for locker, Cont Colector for COD, Standard otherwise
  const service = isFanbox
    ? (input.cod > 0 ? "FANbox Cont Colector" : "FANbox")
    : (input.cod > 0 ? "Cont Colector" : "Standard");

  // FANbox: option V (pickup from locker) is mandatory. For home delivery,
  // ePOD (X) only when the merchant opted in — with X active FAN no longer
  // brings the pre-printed A5 AWB, so it must be a conscious choice.
  const options = isFanbox ? ["V"] : (config.epod ? ["X"] : []);

  // Sender belongs INSIDE each shipment (verified against the live API — the
  // published PDF schema omits it entirely). Built from the account's branch.
  const senderInfo = {
    name: sender.name,
    phone: sender.phone,
    address: {
      county: sender.address.county,
      locality: sender.address.locality,
      street: sender.address.street,
      streetNo: sender.address.streetNo || undefined,
    },
  };

  const body = {
    clientId: config.client_id,
    shipments: [
      {
        sender: senderInfo,
        info: {
          service,
          bank: "",
          bankAccount: "",
          packages: {
            parcel: input.parcels,
            envelope: 0, // FAN's field is "envelope" (singular) — see API changelog
          },
          weight: input.weightKg,
          cod: input.cod,
          declaredValue: 0,
          payment: "sender",
          refund: null,
          returnPayment: null,
          // Lungimile documentate la pag. 12. Textele se TAIE, nu opresc coletul:
          // un nume de 60 de semne nu e un motiv sa nu se expedieze o comanda.
          observation: taie(input.observation, 255) ?? "",
          content: taie(input.content, 255) ?? "",
          dimensions: {
            length: dimensiuni.length,
            height: dimensiuni.height,
            width: dimensiuni.width,
          },
          costCenter: "",
          options,
        },
        recipient: {
          name: taie(input.recipientName, 50) ?? "",
          contactPerson: taie(input.recipientName, 50) ?? "", // schema lists contactPerson as mandatory
          phone: taie(normalizePhone(input.recipientPhone), 16) ?? "",
          // Emailul NU se taie: un email trunchiat e un email gresit, iar campul
          // e optional la domiciliu. La FANbox e obligatoriu si a fost deja cerut.
          email: (input.recipientEmail ?? "").trim().length <= 100 ? taie(input.recipientEmail, 100) : undefined,
          // FANbox: the locker's own county/locality/street (the API requires
          // county+locality to match the locker; the generic schema also lists
          // street as mandatory even though the FANbox examples omit it, so we
          // send the locker's street to satisfy both). The docs contradict
          // themselves on the field name (schema: pickupLocation, FANbox
          // examples: pickupLocationId) — send BOTH with the locker ID; the
          // API reads the one it knows and ignores the other. Home delivery
          // goes through the nomenclature normalizers (diacritics, "Sector X"
          // → Bucuresti).
          address: isFanbox
            ? {
                county: fanboxPoint!.address.county,
                locality: fanboxPoint!.address.locality,
                street: fanboxPoint!.address.street || fanboxPoint!.name,
                streetNo: fanboxPoint!.address.streetNo || undefined,
                zipCode: fanboxPoint!.address.zipCode || undefined,
                pickupLocationId: fanboxPoint!.id,
                pickupLocation: fanboxPoint!.id,
              }
            : {
                county: taie(normalizeCountyName(input.recipientCounty), 50) ?? "",
                locality: taie(normalizeLocalityName(input.recipientLocality, input.recipientCounty), 50) ?? "",
                street: taie(input.recipientStreet, 255)!,
                streetNo: taie(input.recipientStreetNo, 10),
                zipCode: taie(input.recipientZipCode, 6),
              },
        },
      },
    ],
  };

  let res: Response;
  try {
    res = await fanFetch(config.username, config.password, "intern-awb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, false, TERMEN_SCRIERE_MS);
  } catch (e) {
    throw eroareDeTermen(e, true, "emiterea AWB-ului", "FAN Courier");
  }
  const raw = await res.text().catch(() => "");

  if (!res.ok) {
    let detail = "";
    try { detail = fanErrorDetail(JSON.parse(raw)); } catch { /* not JSON */ }
    throw eroareCuStatus(`FAN Courier: ${detail || `${res.status} — ${raw.slice(0, 300) || res.statusText}`}`, res.status);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw eroareNesigura(`FAN Courier: raspuns invalid — ${raw.slice(0, 200)}`);
  }

  // Documented shape: { "response": [ { "awbNumber": 2228…, "errors": null } ] }.
  const container = (parsed as Record<string, unknown>)?.response ?? (parsed as Record<string, unknown>)?.data;
  const first = (Array.isArray(container) ? container[0] : container) as Record<string, unknown> | undefined;
  const awbNumber = first ? String(first.awbNumber ?? first.awb ?? "") : "";

  const failed = !awbNumber || awbNumber === "0" || awbNumber === "null" || awbNumber === "undefined" || first?.success === false;
  if (failed) {
    const detail = fanErrorDetail(parsed);
    console.error("[fancourier] intern-awb failed: %s", detail || raw.slice(0, 400));
    /*
     * ⚠ AICI E CALEA DE ESEC OBISNUITA A LUI FAN, NU O EXCEPTIE.
     *
     * FAN raspunde HTTP 200 si pune motivul in `errors` per-expediere — localitate
     * gresita, cod postal lipsa, serviciu neactivat, ramburs prea mare (le enumera
     * chiar comentariul de la liniile 155-159). `!res.ok` a fost tratat mai sus,
     * deci aici stim ca FAN a primit cererea, a inteles-o si a spus „nu", cu
     * `awbNumber: null`.
     *
     * Marcata `eroareNesigura`, prima adresa gresita ar fi blocat comanda si i-ar
     * fi cerut omului sa verifice in contul FAN un AWB care nu exista. Cand FAN ne
     * DA motivul, e refuz dovedit si reincercarea dupa corectare ramane libera.
     *
     * Fara motiv insa nu putem sti ce a facut: acolo ramane „nu stim".
     */
    if (detail) throw eroareRefuz(`FAN Courier: ${detail}`);
    throw eroareNesigura(`FAN Courier: AWB nu a fost creat — ${raw.slice(0, 200)}`);
  }

  return { awbNumber, tariff: numarFan(first?.tariff), vat: numarFan(first?.vat) };
}

// ─── AWB Deletion ─────────────────────────────────────────────────────────────

export async function deleteFanCourierAwb(
  config: FanCourierConfig,
  awbNumber: string,
): Promise<void> {
  await fanDelete(
    config.username,
    config.password,
    `awb?clientId=${clientIdValid(config)}&awb=${encodeURIComponent(awbNumber)}`,
  );
}

// ─── Courier order (pickup request) ──────────────────────────────────────────

export type FanCourierPickupInput = {
  pickupDate: string;   // YYYY-MM-DD
  firstHour: string;    // "HH:MM" — minimum pickup time
  secondHour: string;   // "HH:MM" — maximum pickup time (interval >= 2h)
  parcels: number;
  envelopes?: number;
  weightKg: number;     // total weight of all AWBs
  length?: number;      // dimensions of the biggest parcel
  width?: number;
  height?: number;
  observations?: string;
};

/**
 * Places a courier order (pickup request) on the sender branch. The API docs
 * warn explicitly that generating the AWB is NOT enough — without a courier
 * order the shipment is never picked up. One order per branch per day covers
 * all the AWBs on that branch.
 */
export async function createFanCourierPickupOrder(
  config: FanCourierConfig,
  input: FanCourierPickupInput,
): Promise<string> {
  const toMinutes = (h: string) => {
    const [hh, mm] = h.split(":").map(Number);
    return (hh || 0) * 60 + (mm || 0);
  };
  // Documented constraints: interval of at least 2 hours, no Sunday pickups.
  if (toMinutes(input.secondHour) - toMinutes(input.firstHour) < 120) {
    throw eroareRefuz("FAN Courier: intervalul de ridicare trebuie sa fie de minim 2 ore.");
  }
  const day = new Date(`${input.pickupDate}T12:00:00`);
  if (Number.isNaN(day.getTime())) {
    throw eroareRefuz("FAN Courier: data de ridicare este invalida.");
  }
  if (day.getDay() === 0) {
    throw eroareRefuz("FAN Courier: nu se fac ridicari duminica. Alege alta zi.");
  }

  const body = {
    clientId: config.client_id,
    info: {
      packages: { parcel: input.parcels, envelope: input.envelopes ?? 0 },
      weight: input.weightKg,
      /*
       * „Dimensiunile celui mai mare colet" (documentatia comenzii de ridicare).
       * Pana pe 09.09.2026 pleca 10x10x10 la FIECARE ridicare, indiferent ce se
       * ridica. Acum: ce trimite apelantul, altfel coletul obisnuit al
       * magazinului, si abia in lipsa lui rezerva veche, o ridicare nu se
       * refuza pentru atat, fiindca dimensiunea ei e orientativa, nu factureaza.
       */
      dimensions: (() => {
        const implicit = coletImplicit(config);
        return {
          length: input.length ?? implicit?.length ?? 10,
          width: input.width ?? implicit?.width ?? 10,
          height: input.height ?? implicit?.height ?? 10,
        };
      })(),
      orderType: "Standard",
      pickupDate: input.pickupDate,
      pickupHours: { first: input.firstHour, second: input.secondHour },
      observations: input.observations || "",
    },
  };

  let res: Response;
  try {
    res = await fanFetch(config.username, config.password, "order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, false, TERMEN_SCRIERE_MS);
  } catch (e) {
    throw eroareDeTermen(e, true, "programarea ridicarii", "FAN Courier");
  }
  const raw = await res.text().catch(() => "");

  let parsed: unknown = null;
  try { parsed = JSON.parse(raw); } catch { /* not JSON */ }

  if (!res.ok) {
    const detail = parsed ? fanErrorDetail(parsed) : "";
    throw eroareCuStatus(`FAN Courier: ${detail || `${res.status} — ${raw.slice(0, 300) || res.statusText}`}`, res.status);
  }

  const rec = (parsed ?? {}) as Record<string, unknown>;
  if (typeof rec.status === "string" && rec.status !== "success") {
    const detail = fanErrorDetail(parsed) || (typeof rec.message === "string" ? rec.message : "");
    throw eroareNesigura(`FAN Courier: ${detail || `comanda de ridicare a fost refuzata — ${raw.slice(0, 200)}`}`);
  }
  const inlineErrors = fanErrorDetail(parsed);
  if (inlineErrors) throw eroareNesigura(`FAN Courier: ${inlineErrors}`);

  // The success payload shape is not documented — look for an order id in the
  // usual places; an error-free 2xx counts as accepted even without one.
  const container = (rec.data ?? rec.response ?? rec) as Record<string, unknown> | unknown[];
  const first = (Array.isArray(container) ? container[0] : container) as Record<string, unknown> | undefined;
  const id = first ? (first.id ?? first.orderId ?? first.number ?? "") : "";
  return String(id ?? "").trim();
}

/** Cancels a courier order (DELETE /order?clientId=&id=). */
export async function deleteFanCourierPickupOrder(
  config: FanCourierConfig,
  orderId: string,
): Promise<void> {
  await fanDelete(
    config.username,
    config.password,
    `order?clientId=${clientIdValid(config)}&id=${encodeURIComponent(orderId)}`,
  );
}

// ─── Tariff estimation ───────────────────────────────────────────────────────

/**
 * Tariful FAN, cu si fara TVA.
 *
 * ⚠ `total` E CU TVA (pag. 31: `costNoVAT: 26.19` + `vat: 4.98` = `total: 31.17`).
 * Cine il foloseste ca baza de TVA il taxeaza a doua oara. De aceea pleaca de
 * aici amandoua valorile, iar apelantul alege dupa regimul magazinului.
 */
export type TarifFan = {
  /** Cu TVA inclus. */
  total: number;
  /** Fara TVA, cand FAN il trimite. `null` cand lipseste: nu se deduce. */
  costNoVAT: number | null;
  vat: number | null;
};

/**
 * Numar finit dintr-un camp al raspunsului, sau `null`.
 *
 * FAN trimite uneori numerele ca siruri. `Number(null)` e ZERO, iar zeroul pe un
 * camp de bani e cea mai scumpa valoare implicita posibila, vezi incidentul cu
 * feedurile Facebook, unde „fara limita" devenea „cel mult 0 lei".
 */
function numarFan(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function estimateFanCourierCost(
  config: FanCourierConfig,
  input: {
    recipientCounty: string;
    recipientLocality: string;
    weightKg: number;
    parcels?: number;
    declaredValue?: number;
    service?: string;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    /**
     * Optiunile de pe AWB (V pentru FANbox, X pentru ePOD).
     *
     * ⚠ Nu se trimiteau deloc, desi emiterea le pune MEREU pe una din doua.
     * Optiunile au cost propriu (`optionsCost` in raspuns, pag. 31), deci pretul
     * cotat si cel facturat porneau din start de la doua cereri diferite.
     */
    options?: readonly string[];
  },
): Promise<TarifFan> {
  const service = input.service ?? "Standard";
  const params = new URLSearchParams({
    clientId: clientIdValid(config),
    "info[service]": service,
    "info[payment]": "expeditor",
    "info[weight]": String(input.weightKg),
    "info[packages][parcel]": String(input.parcels ?? 1),
    "info[packages][envelope]": "0",
    "recipient[locality]": normalizeLocalityName(input.recipientLocality, input.recipientCounty),
    "recipient[county]": normalizeCountyName(input.recipientCounty),
  });

  if (input.declaredValue) {
    params.set("info[declaredValue]", String(input.declaredValue));
  }
  // Dimensions feed the volumetric weight — send them whenever the caller has them.
  if (input.lengthCm && input.widthCm && input.heightCm) {
    params.set("info[dimensions][length]", String(input.lengthCm));
    params.set("info[dimensions][width]", String(input.widthCm));
    params.set("info[dimensions][height]", String(input.heightCm));
  }
  for (const optiune of input.options ?? []) {
    params.append("info[options][]", optiune);
  }

  const res = await fanFetch(config.username, config.password, `reports/awb/internal-tariff?${params.toString()}`);

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FAN Courier tariff: ${res.status} — ${text}`);
  }

  const json = (await res.json()) as { status: string; data?: Record<string, unknown>; message?: string };
  if (json.status !== "success") throw new Error(json.message ?? "FAN Courier tariff failed");

  /*
   * ⚠ AICI STATEA `json.data?.total ?? 0`.
   *
   * Un raspuns „success" fara `total`, sau cu un sir, sau cu `null`, devenea
   * tacut TRANSPORT GRATUIT. Si nu pe ramura de eroare, unde exista deja rezerva
   * pe pretul fix al zonei, ci pe ramura de SUCCES: `.catch`-ul nu se declansa,
   * zero-ul intra ca optiune, era preselectat ca cea mai ieftina si pleca
   * SEMNAT (`semneazaOptiuni`), deci trecea si la plasarea comenzii.
   *
   * Lipsa lui `total` e o eroare de contract, nu un pret. Se arunca, si abia
   * atunci rezerva configurata de comerciant isi face treaba.
   *
   * `total: 0` PREZENT si valid ramane valid: un tarif zero negociat cu FAN e
   * treaba comerciantului, nu a noastra.
   */
  const total = numarFan(json.data?.total);
  if (total === null) {
    throw new Error(
      `FAN Courier tariff: raspuns fara camp "total" valid, ${JSON.stringify(json.data ?? null).slice(0, 200)}`,
    );
  }

  // `costNoVAT` e in ACELASI raspuns (pag. 31: costNoVAT + vat = total).
  // Fara el, magazinele care afiseaza preturi fara TVA taxau a doua oara un
  // tarif care il continea deja. Optional: daca lipseste, apelantul stie ca nu
  // are net si nu inventeaza unul.
  return { total, costNoVAT: numarFan(json.data?.costNoVAT), vat: numarFan(json.data?.vat) };
}

// ─── Pickup points (FANbox / CollectPoint / Office) ─────────────────────────

export type FanCourierPickupPoint = {
  id: string;
  name: string;
  routingLocation: string;
  address: {
    locality: string;
    county: string;
    street: string;
    streetNo: string;
    zipCode: string;
  };
  latitude: string;
  longitude: string;
  type: "fanbox" | "paypoint" | "office";
};

function mapPickupPoint(p: Record<string, unknown>, type: "fanbox" | "paypoint" | "office"): FanCourierPickupPoint {
  return {
    id: (p.id ?? "") as string,
    name: (p.name ?? "") as string,
    routingLocation: (p.routingLocation ?? p.name ?? "") as string,
    address: {
      locality: ((p.address as Record<string, unknown> | undefined)?.locality ?? "") as string,
      county: ((p.address as Record<string, unknown> | undefined)?.county ?? "") as string,
      street: ((p.address as Record<string, unknown> | undefined)?.street ?? "") as string,
      streetNo: ((p.address as Record<string, unknown> | undefined)?.streetNo ?? "") as string,
      zipCode: ((p.address as Record<string, unknown> | undefined)?.zipCode ?? "") as string,
    },
    latitude: (p.latitude ?? "0") as string,
    longitude: (p.longitude ?? "0") as string,
    type,
  };
}

export async function getFanCourierPickupPoints(
  username: string,
  password: string,
  type: "fanbox" | "paypoint" | "office",
): Promise<FanCourierPickupPoint[]> {
  const data = await fanGet<Record<string, unknown>[]>(username, password, `reports/pickup-points?type=${type}`);
  return (data ?? []).map((p) => mapPickupPoint(p, type));
}

/**
 * Single pickup point by ID (reports/pickup-points?id=). Used at AWB time as
 * the authoritative source for the locker's county/locality, which the API
 * requires to match the FANbox.
 */
export async function getFanCourierPickupPointById(
  username: string,
  password: string,
  id: string,
): Promise<FanCourierPickupPoint | null> {
  const data = await fanGet<Record<string, unknown>[]>(username, password, `reports/pickup-points?id=${encodeURIComponent(id)}`);
  const first = Array.isArray(data) ? data[0] : undefined;
  return first ? mapPickupPoint(first, "fanbox") : null;
}

// ─── AWB Label (PDF) ──────────────────────────────────────────────────────────

export async function getFanCourierAwbLabel(
  config: FanCourierConfig,
  awbNumber: string,
): Promise<Buffer> {
  const res = await fanFetch(
    config.username,
    config.password,
    `awb/label?clientId=${clientIdValid(config)}&awbs[]=${encodeURIComponent(awbNumber)}&pdf=1&language=ro`,
    undefined,
    false,
    TERMEN_ETICHETA_MS,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FAN Courier label error: ${res.status} — ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const pdf = Buffer.from(arrayBuffer);

  /*
   * ⚠ CE VINE PE 200 NU E NEAPARAT UN PDF.
   *
   * Ruta noastra il servea mai departe cu `Content-Type: application/pdf` fara
   * sa se uite la el, iar modalul se uita doar la `res.ok`. Deci un JSON de
   * eroare, o pagina de intretinere sau un corp gol ajungeau la comerciant ca
   * „eticheta", o fila care nu se deschide, fara niciun mesaj nicaieri.
   * Acelasi tipar cu „Descarcare esuata" de la feedurile de stoc, unde o pagina
   * HTML trecea drept feed bun, cu toast VERDE.
   */
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    const inceput = pdf.subarray(0, 200).toString("utf8").replace(/\s+/g, " ").trim();
    throw new Error(
      `FAN Courier: raspunsul pentru eticheta ${awbNumber} nu este un PDF${inceput ? `, ${inceput}` : " (corp gol)"}`,
    );
  }

  return pdf;
}
