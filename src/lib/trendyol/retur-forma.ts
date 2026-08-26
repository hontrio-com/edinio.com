import type {
  TrendyolClaim, TrendyolClaimItem, TrendyolClaimOrderLine, TrendyolColetRespins,
} from "./types";

/**
 * Citirea formei in care ei ne dau retururile.
 *
 * ⚠ MODUL FARA NICIO LEGATURA: nu stie de baza, de retea si de client. Asa poate fi probat cu
 * un tipar copiat dupa referinta lor — si chiar de-aia sta separat. Defectul de mai jos a
 * trecut neobservat tocmai fiindca probele scanau sursa in loc sa cheme functia.
 */

/**
 * O linie de retur, adusa la forma noastra.
 *
 * ⚠ „O LINIE" INSEAMNA O BUCATA. Ei n-au camp de cantitate pe `claimItems`: un retur de trei
 * bucati vine ca trei elemente cu id-uri diferite. Deci `cantitate` e mereu 1 cand citim forma
 * lor documentata, si se ia din camp doar cand raspunsul vine plat.
 */
export interface LinieRetur {
  claimItemId: string;
  orderLineId: string | null;
  barcode: string | null;
  numeProdus: string | null;
  cantitate: number;
  motiv: string | null;
  notaClient: string | null;
  stare: string | null;
  brut: unknown;
}

function text(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : typeof x === "number" ? String(x) : null;
}

/** `claimItemStatus` vine si ca obiect cu `name`, si ca sir gol-golut. */
function numeStare(x: unknown): string | null {
  if (typeof x === "string") return x.trim() || null;
  if (x && typeof x === "object" && "name" in x) return text((x as { name?: unknown }).name);
  return null;
}

/**
 * Liniile cererii, din forma lor adevarata.
 *
 * ═══ ⚠ ERAU CU UN NIVEL MAI ADANC DECAT LE CITEAM (26.08.2026) ═══
 *
 * Referinta lor (`getClaims`) spune limpede ca `items[]` NU sunt liniile:
 *
 *   claim
 *   └── items[]
 *       ├── orderLine   { id, productName, barcode, merchantSku, price, ... }
 *       └── claimItems[]{ id, orderLineItemId, customerClaimItemReason, claimItemStatus, ... }
 *
 * Noi luam `items[]` drept linii si ceream `id`-ul de acolo. Pe forma lor, acel `id` nu exista,
 * deci fiecare linie ar fi fost sarita si returul ar fi aparut in panou cu ZERO produse. Ar fi
 * aratat complet, si ar fi fost gol — cel mai urat fel de defect.
 *
 * ⚠ SE CITESC AMANDOUA FORMELE, si nu din nehotarare: ambele conturi au azi zero cereri de
 * retur (verificat direct pe API-ul lor, 200 cu `content: null` pe orice fereastra si orice
 * stare), deci forma vie n-a putut fi masurata. Cand n-ai cum sa masori, citesti si ce scrie in
 * hartie, si ce ai presupus — nu alegi una si speri.
 *
 * ⚠ CODUL DE BARE VINE DIN `orderLine`, nu din bucata. Fara el, repunerea in stoc n-are de ce
 * sa se agate: bucata spune CATE si DE CE, produsul il spune linia de comanda.
 */
export function liniileReturului(c: TrendyolClaim): LinieRetur[] {
  const iesire: LinieRetur[] = [];
  const vazute = new Set<string>();

  const adauga = (l: LinieRetur) => {
    if (vazute.has(l.claimItemId)) return;
    vazute.add(l.claimItemId);
    iesire.push(l);
  };

  const dinBucata = (b: TrendyolClaimItem, ol?: TrendyolClaimOrderLine): LinieRetur | null => {
    const id = text(b.claimItemId) ?? text(b.id);
    if (!id) return null;
    return {
      claimItemId: id,
      orderLineId: text(b.orderLineItemId) ?? text(ol?.id) ?? text(b.orderLineId),
      /* Bucata intai, invelisul pe urma: daca ei umplu amandoua, cea de pe bucata e mai aproape. */
      barcode: text(b.barcode) ?? text(ol?.barcode),
      numeProdus: text(b.productName) ?? text(ol?.productName),
      cantitate: Number.isFinite(Number(b.quantity)) && Number(b.quantity) > 0 ? Number(b.quantity) : 1,
      motiv: text(b.customerClaimItemReason?.name) ?? text(b.trendyolClaimItemReason?.name),
      notaClient: text(b.customerNote) ?? text(b.note),
      stare: numeStare(b.claimItemStatus),
      brut: b,
    };
  };

  for (const grup of Array.isArray(c.items) ? c.items : []) {
    if (!grup || typeof grup !== "object") continue;
    const bucati = Array.isArray(grup.claimItems) ? grup.claimItems : [];
    if (bucati.length > 0) {
      for (const b of bucati) {
        const l = b && typeof b === "object" ? dinBucata(b, grup.orderLine) : null;
        if (l) adauga(l);
      }
      continue;
    }
    /* Fara `claimItems`: raspunsul e plat, iar invelisul E chiar linia. */
    const l = dinBucata(grup as TrendyolClaimItem, grup.orderLine);
    if (l) adauga(l);
  }

  /* Si forma in care bucatile stau direct pe cerere. */
  for (const b of Array.isArray(c.claimItems) ? c.claimItems : []) {
    const l = b && typeof b === "object" ? dinBucata(b) : null;
    if (l) adauga(l);
  }

  return iesire;
}

/** Id-ul cererii, oricare ar fi numele lui in raspuns. */
export function idCererii(c: TrendyolClaim): string | null {
  return text(c.id) ?? text(c.claimId);
}

/**
 * Id-ul pachetului.
 *
 * ⚠ `orderShipmentPackageId` E NUMELE LOR ADEVARAT; `shipmentPackageId` nu exista in raspuns,
 * si citindu-l ieseam mereu cu gol — fara nicio eroare.
 */
export function idPachetului(c: TrendyolClaim): number | null {
  const brut = c.orderShipmentPackageId ?? c.orderOutboundPackageId ?? c.shipmentPackageId;
  return Number.isFinite(Number(brut)) ? Number(brut) : null;
}



/**
 * Ce mai are de facut comerciantul dupa ce respinge returul.
 *
 * ═══ ⚠ TREI STARI, NU DOUA (26.08.2026) ═══
 *
 *   `null`   nu exista colet de retur-respins. Documentatia lor: „If there is no return
 *            rejection package, this field will not appear." Absenta NU e „false".
 *   `true`   nu trimiti nimic inapoi.
 *   `false`  TREBUIE sa trimiti coletul inapoi clientului, daca ei accepta respingerea.
 *
 * ⚠ Un `?.dontShipBack ?? false` ar fi turnat prima stare peste a treia — adica i-ar fi spus
 * comerciantului „ai de trimis un colet" pentru fiecare retur respins, inclusiv cele unde nu
 * exista niciun colet. Iar cand alarma suna mereu, nu mai suna deloc.
 */
export function coletDeTrimisInapoi(c: TrendyolClaim): TrendyolColetRespins | null {
  const p = c.rejectedPackageInfo;
  return p && typeof p === "object" ? p : null;
}

/** `true`/`false`/`null` — vezi `coletDeTrimisInapoi` pentru ce inseamna fiecare. */
export function nuSeTrimiteInapoi(c: TrendyolClaim): boolean | null {
  const p = coletDeTrimisInapoi(c);
  if (!p) return null;
  return typeof p.dontShipBack === "boolean" ? p.dontShipBack : null;
}

/**
 * Motivele de respingere care NU cer dovada atasata.
 *
 * ═══ ⚠ GHIDUL LOR CERE FISIER, SCHEMA LOR SPUNE CA E OPTIONAL ═══
 *
 * Cele doua se contrazic, si comentariul nostru de pana azi a crezut schema. Citat din ghidul
 * turcesc (updatedAt 2026-01-22): „Bu iki iade sebebi dışında bütün sebepler için file yüklemek
 * zorunludur." Iar in engleza: „It is mandatory to upload a file for all reasons except these two
 * return reasons." In OpenAPI, in schimb, `required` e doar
 * `[claimIssueReasonId, claimItemIdList, description]` — `files` lipseste de-acolo, in toate trei
 * variantele (TR, Europa, Golf).
 *
 * ⚠ SE CREDE GHIDUL, fiindca partea care greseste in favoarea noastra costa un fisier in plus, iar
 * cealalta costa o respingere pierduta. Si nu se stie macar daca refuzul vine sincron: ghidul spune
 * ca rezultatul respingerii se urmareste ulterior, pe `claimItemStatus` — deci un `200` la apel
 * n-ar dovedi ca respingerea a fost primita.
 *
 * ⚠ 2101 NU E AICI, DESI APARE IN LISTA LOR. Ghidul turcesc si una din cele doua variante engleze
 * il enumera; a doua varianta engleza nu. Peste asta, fraza care insoteste lista de TREI motive
 * zice tot „aceste doua motive" — deci lista a fost extinsa fara ca textul sa fie potrivit, si nu
 * se stie care jumatate e cea buna. In plus, 2101 lipseste din toate raspunsurile-exemplu ale
 * `getClaimIssueReasons`. Pe o cale ireversibila nu se pariaza pe jumatatea favorabila: cerandu-i
 * dovada degeaba, comerciantul pierde un minut; nececand-o cand trebuia, pierde returul.
 */
export const MOTIVE_FARA_DOVADA = new Set([1651, 451]);

/** Trebuie atasata o dovada pentru motivul asta de respingere? */
export function dovadaCeruta(motivId: number | null | undefined): boolean {
  return !!motivId && !MOTIVE_FARA_DOVADA.has(motivId);
}

/**
 * Motivul care nu poate fi ales in primele 24 de ore.
 *
 * ⚠ REGULA LOR, scrisa in ghid: „For the claim issue reason 1651, this reason cannot be selected
 * within the first 24 hours after the return on the Waiting Action status." E chiar unul dintre
 * cele doua motive scutite de dovada — deci comerciantul ar alege exact motivul cel mai comod si
 * ar primi un refuz al carui text nu explica nimic. Se spune in ecran, inainte de apasare.
 */
export const MOTIV_BLOCAT_24H = 1651;
