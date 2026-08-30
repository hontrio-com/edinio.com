/**
 * Nomenclatorul de servicii FedEx.
 *
 * ═══ ⚠ DE CE E UN FISIER SEPARAT, SI NU UN `enum` ═══
 *
 * In OpenAPI-ul lor, `serviceType` e `{"type": "string"}` — **fara `enum`**. Nu e o
 * scapare: campul trimite prin `loadDocReference("servicetypes")` catre un tabel de
 * referinta (`API_Reference_Guide.json`), iar ghidul lor de bune practici cere
 * explicit „avoid hard-coding to specific enumeration values in API responses, as
 * these values may change over time".
 *
 * Deci lista de mai jos e o TRADUCERE, nu o validare. Cotarea intoarce ce intoarce;
 * un serviciu pe care nu-l cunoastem primeste un nume citibil compus din enumerare,
 * si apare in checkout ca oricare altul. Nimic nu se filtreaza pe necunoscut.
 *
 * ═══ ⚠ DOUA CAPCANE DE TRANSCRIERE, AMANDOUA IN FISIERUL LOR ═══
 *
 * 1. In tabelul „EU Region Domestic Service List" doua chei au **spatiu la final**:
 *    `"FEDEX_PRIORITY "` si `"FEDEX_PRIORITY_FREIGHT "`. E un defect de redactare —
 *    FAQ-ul FedEx Romania le scrie curat, iar cererile din colectia lor Postman
 *    folosesc forma fara spatiu. Copiate mecanic din JSON, ar trimite un serviceType
 *    invalid.
 * 2. Prefixul `FEDEX_` NU e consecvent: `FEDEX_INTERNATIONAL_PRIORITY` il are,
 *    `INTERNATIONAL_ECONOMY` nu. Asimetria e reala si e in tabelul lor. Nu se
 *    „corecteaza".
 */

/** Numele omenesc al unui serviciu, plus daca e de marfa grea. */
type Serviciu = { nume: string; marfaGrea?: boolean };

/**
 * ⭐ ROMANIA, INTERN — matricea oficiala pe tari.
 *
 * Din tabelul „Europe New Domestic Services Portfolio" al FedEx (19 tari), randul
 * Romaniei are bifa la patru servicii si e GOL la trei. Confirmat independent de
 * FAQ-ul lor romanesc (`fedex.com/ro-ro/campaign/new-domestic-service/faq.html`),
 * care enumera chiar enumerarile de trimis.
 *
 * ⚠ NU sunt valabile intern in Romania: `FEDEX_ECONOMY_SELECT` (scrie literal
 * „Only U.K." in tabelul lor), `FEDEX_PRIORITY_EXPRESS_FREIGHT` (coloana goala la
 * Romania) si `PRIORITY_OVERNIGHT` (mostenirea pe care noile servicii o inlocuiesc;
 * coloana e goala pentru TOATE cele 19 tari).
 */
export const SERVICII_DOMESTIC_RO: Record<string, Serviciu> = {
  FEDEX_FIRST: { nume: "FedEx First — pana la ora 10:00, ziua urmatoare" },
  FEDEX_PRIORITY_EXPRESS: { nume: "FedEx Priority Express — pana la pranz, ziua urmatoare" },
  FEDEX_PRIORITY: { nume: "FedEx Priority — la finalul zilei urmatoare" },
  FEDEX_PRIORITY_FREIGHT: { nume: "FedEx Priority Freight — marfa grea (68-1.000 kg)", marfaGrea: true },
};

/**
 * International, din tabelul „EU Region International Service List".
 *
 * `FEDEX_REGIONAL_ECONOMY` e intra-Europa si Romania e in lista lor de 29 de tari,
 * si ca origine si ca destinatie. `FEDEX_REGIONAL_ECONOMY_FREIGHT` are o lista de
 * 22 de tari in care Romania **NU** apare — dar ramane in traducere, fiindca lista
 * e o traducere, nu o validare.
 */
export const SERVICII_INTERNATIONAL: Record<string, Serviciu> = {
  FEDEX_INTERNATIONAL_PRIORITY_EXPRESS: { nume: "FedEx International Priority Express" },
  FEDEX_INTERNATIONAL_PRIORITY: { nume: "FedEx International Priority" },
  FEDEX_INTERNATIONAL_CONNECT_PLUS: { nume: "FedEx International Connect Plus" },
  INTERNATIONAL_ECONOMY: { nume: "FedEx International Economy" },
  INTERNATIONAL_FIRST: { nume: "FedEx International First" },
  FEDEX_REGIONAL_ECONOMY: { nume: "FedEx Regional Economy — intra-Europa, economic" },
  INTERNATIONAL_PRIORITY_FREIGHT: { nume: "FedEx International Priority Freight", marfaGrea: true },
  INTERNATIONAL_ECONOMY_FREIGHT: { nume: "FedEx International Economy Freight", marfaGrea: true },
  FEDEX_INTERNATIONAL_DEFERRED_FREIGHT: { nume: "FedEx International Deferred Freight", marfaGrea: true },
  FEDEX_REGIONAL_ECONOMY_FREIGHT: { nume: "FedEx Regional Economy Freight", marfaGrea: true },
  INTERNATIONAL_PRIORITY_DISTRIBUTION: { nume: "FedEx International Priority DirectDistribution" },
  INTERNATIONAL_ECONOMY_DISTRIBUTION: { nume: "FedEx International Economy DirectDistribution" },
  INTERNATIONAL_DISTRIBUTION_FREIGHT: { nume: "FedEx International Distribution Freight", marfaGrea: true },
};

/**
 * Serviciile mostenite, pe care le stim ca exista dar nu le oferim in Romania.
 *
 * Sunt aici ca sa aiba un nume citibil daca FedEx le intoarce totusi la cotare —
 * nu ca sa fie propuse. `FEDEX_ECONOMY_SELECT` e marcat de ei „Only U.K.".
 */
const SERVICII_ALTELE: Record<string, Serviciu> = {
  PRIORITY_OVERNIGHT: { nume: "FedEx Priority Overnight" },
  FEDEX_ECONOMY_SELECT: { nume: "FedEx Economy (numai Marea Britanie)" },
  FEDEX_PRIORITY_EXPRESS_FREIGHT: { nume: "FedEx Priority Express Freight", marfaGrea: true },
  FEDEX_GROUND: { nume: "FedEx Ground" },
  FEDEX_2_DAY: { nume: "FedEx 2Day" },
  FEDEX_EXPRESS_SAVER: { nume: "FedEx Express Saver" },
  STANDARD_OVERNIGHT: { nume: "FedEx Standard Overnight" },
  FIRST_OVERNIGHT: { nume: "FedEx First Overnight" },
  GROUND_HOME_DELIVERY: { nume: "FedEx Home Delivery" },
  SMART_POST: { nume: "FedEx Ground Economy" },
};

const TOATE: Record<string, Serviciu> = {
  ...SERVICII_DOMESTIC_RO,
  ...SERVICII_INTERNATIONAL,
  ...SERVICII_ALTELE,
};

/**
 * Numele omenesc al unui serviciu.
 *
 * ⚠ Pentru un serviciu necunoscut NU se intoarce enumerarea bruta si nici „Serviciu
 * FedEx": prima arata a defect („FEDEX_INTERNATIONAL_CONNECT_PLUS" intr-un checkout
 * romanesc), a doua sterge singura informatie utila. Se compune un nume citibil din
 * chiar enumerarea lor, ca sa se poata deosebi doua servicii noi intre ele.
 */
export function numeServiciu(serviceType: string | null | undefined, numeDeLaEi?: string | null): string {
  const cod = (serviceType ?? "").trim();
  const cunoscut = TOATE[cod];
  if (cunoscut) return cunoscut.nume;

  const alLor = (numeDeLaEi ?? "").trim();
  if (alLor) return alLor;
  if (!cod) return "FedEx";

  const cuvinte = cod.toLowerCase().split("_").filter(Boolean)
    .map((c) => (c === "fedex" ? "FedEx" : c.charAt(0).toUpperCase() + c.slice(1)));
  const text = cuvinte.join(" ");
  return text.startsWith("FedEx") ? text : `FedEx ${text}`;
}

/**
 * E serviciu de marfa grea (paleti, peste 68 kg)?
 *
 * ⚠ Conteaza in checkout: un cumparator care alege o cutie de 2 kg n-are ce cauta
 * pe FedEx Priority Freight, iar tariful de acolo e de alta scara. Se ascund din
 * checkout, dar raman disponibile la emitere manuala din panou.
 */
export function eMarfaGrea(serviceType: string | null | undefined): boolean {
  return TOATE[(serviceType ?? "").trim()]?.marfaGrea === true;
}

/**
 * Serviciile pe care le propunem in configurare, pentru tara de expeditie data.
 *
 * ⚠ Se opreste la RO. Pentru orice alta tara de plecare, matricea „Europe New
 * Domestic Services Portfolio" are alt rand, iar noi n-avem de ce sa-l ghicim: se
 * intoarce lista goala, ceea ce in interfata inseamna „toate cele pe care le
 * intoarce cotarea", nu „niciunul".
 */
export function serviciiPropuse(taraExpeditor: string): { cod: string; nume: string; marfaGrea: boolean }[] {
  const tara = (taraExpeditor || "RO").trim().toUpperCase();
  const domestice = tara === "RO" ? SERVICII_DOMESTIC_RO : {};
  return [...Object.entries(domestice), ...Object.entries(SERVICII_INTERNATIONAL)]
    .map(([cod, s]) => ({ cod, nume: s.nume, marfaGrea: s.marfaGrea === true }));
}
