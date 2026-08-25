import { createHash } from "node:crypto";
import { asteaptaJetonImpartit, asteptareaCerutaDeEi, spunePauza } from "@/lib/marketplace/ritm-impartit";
import { TRENDYOL_DEFAULT_STOREFRONT } from "./types";

/**
 * Ritmul catre Trendyol, pe GRUPURI DE SERVICII si pe VANZATOR.
 *
 * ═══ ⚠ CE ERA PANA ACUM ═══
 *
 * Nimic in client. Singura franare era `PACE_MS = 350` in bucla cronului — o pauza intre doua
 * lucrari, in memoria unei instante. Deci cronul, un buton apasat de om, importul si un
 * webhook sosit intre timp credeau fiecare ca au bugetul intreg.
 *
 * ═══ ⚠ SI SE SCHIMBA CHIAR ACUM ═══
 *
 * Din 14 septembrie 2026, serviciile de produs ale Trendyol trec pe limite pe GRUP
 * (citire de produs, scriere de produs, scriere de pret/stoc), nu pe fiecare cale in parte,
 * iar limitele sunt ale VANZATORULUI si difera de la unul la altul. Comenzile isi au
 * grupul lor.
 *
 * ⚠ DE-AIA CHEIA E `supplierId:vitrina:grup`, nu `magazin:cale`:
 *
 *   - doua magazine Edinio legate la acelasi `supplierId` impart acelasi buget la ei;
 *     numarate separat, ar fi trecut de el impreuna fara sa vada nimeni;
 *   - o scriere de produs si o citire de comenzi NU se franeaza una pe alta.
 *
 * ═══ ⚠ SI DE CE LIMITELE SUNT PRUDENTE, NU EXACTE ═══
 *
 * Limitele lor depind de vanzator si nu sunt publicate ca numere pe care sa te poti sprijini.
 * Un numar inventat prea mare nu apara nimic; unul prea mic ar incetini un magazin sanatos.
 * Deci cifrele de mai jos sunt prudente SI, mai important, adevarata aparare e cealalta:
 * cand ei spun 429, `spunePauza` opreste toate instantele pentru cat cer ei.
 */

/**
 * Grupurile de servicii, asa cum le numara ei.
 *
 * ⚠ `orders` e separat dinadins: o trecere grea de catalog n-are voie sa intarzie
 * confirmarea unei comenzi sau o miscare de stoc dupa o vanzare.
 */
export type GrupTrendyol = "product-read" | "product-write" | "inventory" | "orders" | "altele";

export const LIMITE_TRENDYOL: Record<GrupTrendyol, { limita: number; fereastraMs: number }> = {
  "product-read": { limita: 20, fereastraMs: 1000 },
  "product-write": { limita: 10, fereastraMs: 1000 },
  inventory: { limita: 10, fereastraMs: 1000 },
  /* ⚠ Cel mai stramt masurat public: „get shipment packages" porneste pe la 30/minut la
     vanzatorii mici. Se tine sub el cu bunastiinta. */
  orders: { limita: 20, fereastraMs: 60_000 },
  altele: { limita: 5, fereastraMs: 1000 },
};

/**
 * Cheia contului la ei, nu a magazinului la noi.
 *
 * ⚠ `supplierId` se amprenteaza: e un identificator al comerciantului si n-are ce cauta ca
 * atare intr-o masa de contorizare. Cheia ramane stabila si nu mai duce nicaieri.
 */
export function cheiaVanzatorului(
  supplierId: number | string | undefined, vitrina: string | undefined, grup: GrupTrendyol,
): string {
  const brut = `trendyol:${String(supplierId ?? "?")}:${vitrina ?? TRENDYOL_DEFAULT_STOREFRONT}`;
  return `${createHash("sha256").update(brut).digest("hex").slice(0, 24)}:${grup}`;
}

/**
 * Din ce grup face parte calea ceruta.
 *
 * ⚠ SE POTRIVESTE PE CALE, nu pe numele functiei: functiile se redenumesc, caile lor nu. Si
 * ordinea conteaza — `price-and-inventory` e tot sub `/product/`, deci trebuie intrebat
 * INAINTEA regulii generale de produs.
 */
export function grupulCaii(cale: string, metoda: string): GrupTrendyol {
  if (cale.includes("/order/") || cale.includes("/orders") || cale.includes("shipment-packages")) {
    return "orders";
  }
  if (cale.includes("price-and-inventory")) return "inventory";
  if (cale.includes("/product")) {
    return metoda === "GET" ? "product-read" : "product-write";
  }
  return "altele";
}

/** Asteapta randul pentru o cerere. `false` = n-a venit in bugetul de timp. */
export async function asteaptaRandulTrendyol(
  supplierId: number | string | undefined, vitrina: string | undefined, grup: GrupTrendyol,
): Promise<boolean> {
  const l = LIMITE_TRENDYOL[grup];
  return asteaptaJetonImpartit(cheiaVanzatorului(supplierId, vitrina, grup), l.limita, l.fereastraMs, "trendyol");
}

/**
 * Ei ne-au spus „prea repede". Se opreste tot grupul, pe toate instantele.
 *
 * ⚠ Se citeste `Retry-After` cand il trimit; altfel treizeci de secunde. Vezi
 * `asteptareaCerutaDeEi` pentru de ce antetul se citeste in doua feluri.
 */
export async function tineCont429(
  supplierId: number | string | undefined, vitrina: string | undefined, grup: GrupTrendyol,
  antete: Headers,
): Promise<void> {
  await spunePauza(cheiaVanzatorului(supplierId, vitrina, grup), asteptareaCerutaDeEi(antete), "trendyol");
}
