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
 * ═══ ⚠ SI DE CE SUNT DOUA FERESTRE, NU UNA ═══
 *
 * Limitele lor se numara PE MINUT. Pana azi le tineam pe secunda — „10 pe secunda" la scrierea
 * de produs — ceea ce suna prudent si nu era: sustinut, inseamna 600 pe minut, adica de cateva
 * ori peste orice cifra publicata pentru grupul asta. Nu s-a vazut fiindca nu scriem niciodata
 * un minut la rand; s-ar fi vazut la primul import mare.
 *
 * ⚠ Deci fiecare grup are AMANDOUA: un plafon pe fereastra lui (de obicei un minut, cum numara
 * ei) si o rafala pe secunda (ca sa nu plece toata fereastra deodata). Se cer amandoua
 * jetoanele, in ordinea asta.
 *
 * ⚠ SI NU TOATE FERESTRELE SUNT UN MINUT: adresele au una de o ORA, fiindca atat dau ei.
 *
 * ⚠ CIFRELE SUNT CELE MAI STRAMTE DINTRE CELE PUBLICATE, si dinadins: sursele publice nu se
 * potrivesc intre ele, iar limita adevarata e a vanzatorului si difera de la unul la altul.
 * Cand nu poti sti, alegi partea care nu strica — mai ales ca scrierile de produs si de stoc
 * pleaca in loturi de pana la o mie de articole, deci un plafon mic de CERERI nu incetineste
 * aproape nimic.
 *
 * ⚠ Iar adevarata aparare ramane cealalta: cand ei spun 429, `spunePauza` opreste toate
 * instantele pentru cat cer ei.
 */

/**
 * Grupurile de servicii, asa cum le numara ei.
 *
 * ⚠ `orders` e separat dinadins: o trecere grea de catalog n-are voie sa intarzie
 * confirmarea unei comenzi sau o miscare de stoc dupa o vanzare.
 *
 * ⚠ SI RETURURILE ISI AU GRUPUL LOR. Caile lor trec tot prin `/order/`, deci pana azi cadeau
 * in galeata comenzilor si mancau din bugetul ei — trei pagini de retururi la fiecare trecere,
 * luate chiar de la citirea comenzilor, care e cea mai grabita dintre toate.
 */
export type GrupTrendyol =
  | "product-read" | "product-write" | "inventory"
  | "orders" | "claims-read" | "claims-write" | "adrese" | "altele";

export const LIMITE_TRENDYOL: Record<GrupTrendyol, { limita: number; fereastraMs: number; rafala: number }> = {
  "product-read": { limita: 60, fereastraMs: 60_000, rafala: 5 },
  "product-write": { limita: 60, fereastraMs: 60_000, rafala: 3 },
  inventory: { limita: 100, fereastraMs: 60_000, rafala: 5 },
  /* ⚠ Cel mai stramt masurat public: „get shipment packages" porneste pe la 30/minut la
     vanzatorii mici. Se tine sub el cu bunastiinta, si merge asa de o luna. */
  orders: { limita: 20, fereastraMs: 60_000, rafala: 3 },
  /* Citirea retururilor: ei dau 1000/minut, noi cerem trei pagini la fiecare trecere. */
  "claims-read": { limita: 20, fereastraMs: 60_000, rafala: 2 },
  /*
   * ⚠ CINCI, NU ZECE. Cifra publicata de ei pentru „İade Onaylama" si „Ret Talebi" e chiar
   * 5 cereri/minut — cea mai stramta din tot setul lor, alaturi de adrese.
   *
   * ⚠ ERA SINGURUL GRUP IN CARE TRECEAM PESTE EI. Toate celelalte erau prudente; asta era
   * dublu. Iar aprobarea si respingerea sunt apasari de om, cateva pe zi — patru pe minut nu
   * incurca pe nimeni si lasa o marja.
   */
  "claims-write": { limita: 4, fereastraMs: 60_000, rafala: 1 },
  /*
   * ⚠ O CERERE PE ORA. Nu e prudenta noastra: `getSuppliersAddresses` are scris in pagina lor
   * de limite „1 req/hour", si e cel mai stramt capat pe care il ating.
   *
   * ⚠ SI DE-AIA ARE GALEATA LUI. Sub `altele` (30/minut) o singura bucla care reciteste
   * adresele la fiecare produs sau la fiecare comanda ar fi luat 429 aproape sigur — iar
   * memoria locala de pe Vercel nu e o paza, fiindca fiecare instanta are alta.
   */
  adrese: { limita: 1, fereastraMs: 3600_000, rafala: 1 },
  altele: { limita: 30, fereastraMs: 60_000, rafala: 3 },
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
  /* ⚠ RETURURILE SE INTREABA INAINTEA COMENZILOR: caile lor contin tot `/order/`, deci regula
     generala le-ar fi inghitit — si asa si facea. */
  if (cale.includes("/claims") || cale.includes("claim-issue-reasons")) {
    return metoda === "GET" ? "claims-read" : "claims-write";
  }
  if (cale.includes("/order/") || cale.includes("/orders") || cale.includes("shipment-packages")) {
    return "orders";
  }
  /* ⚠ ADRESELE INAINTEA REGULII GENERALE: au 1 cerere pe ora, cel mai stramt capat al lor. */
  if (cale.includes("/addresses")) return "adrese";
  if (cale.includes("price-and-inventory")) return "inventory";
  if (cale.includes("/product")) {
    return metoda === "GET" ? "product-read" : "product-write";
  }
  return "altele";
}

/**
 * Asteapta randul pentru o cerere. `false` = n-a venit in bugetul de timp.
 *
 * ⚠ SE CER AMANDOUA JETOANELE: cel pe minut (cum numara ei) si cel pe secunda (ca sa nu plece
 * toata fereastra intr-o clipa). Intai cel pe minut — daca acolo nu e loc, n-are rost sa mai
 * ardem si o rafala.
 */
export async function asteaptaRandulTrendyol(
  supplierId: number | string | undefined, vitrina: string | undefined, grup: GrupTrendyol,
): Promise<boolean> {
  const l = LIMITE_TRENDYOL[grup];
  const cheie = cheiaVanzatorului(supplierId, vitrina, grup);
  if (!await asteaptaJetonImpartit(cheie, l.limita, l.fereastraMs, "trendyol")) return false;
  return asteaptaJetonImpartit(`${cheie}:s`, l.rafala, 1000, "trendyol");
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
