/**
 * Cine feliaza catalogul: browserul, sau baza de date.
 *
 * Palierul „client" e cel de azi — tot catalogul pleaca in browser, care
 * filtreaza, sorteaza si feliaza pe loc. E o experienta buna si merita pastrata
 * la magazinele mici: filtrele raspund fara niciun dus-intors.
 *
 * Palierul „server" trimite o pagina. Devine obligatoriu peste cateva mii de
 * produse, unde primul nu mai e o alegere de gust ci un plafon: la 100.000 de
 * produse, payload-ul de azi ar fi ~127 MB.
 *
 * DE CE UN STEAG PE MAGAZIN, si nu doar un prag. Fiindca rollback-ul devine un
 * `UPDATE`, fara deploy. Pe un repo unde se lucreaza direct pe main si fiecare
 * push e un deploy in productie, proprietatea asta bate orice eleganta: daca
 * palierul server se poarta prost la un magazin, comerciantul nu asteapta un
 * build.
 */

/**
 * Peste atatea produse, „auto" trece pe server.
 *
 * 400, nu 1000: la prag mai mare, magazinele dintre ar ramane cu un payload de
 * peste un megaoctet fara motiv. Masurat pe platforma la data alegerii: 4 din 48
 * de magazine trec de 300 de produse si tin 92% din toate randurile, deci pragul
 * separa exact multimea care conteaza.
 */
export const PRAG_CATALOG_SERVER = 400;

export type PalierCatalog = "client" | "server";

/** Ce poate scrie comerciantul (sau noi) in `page_content.catalog_server`. */
export type SteagCatalog = "auto" | "on" | "off";

export function citesteSteag(pageContent: unknown): SteagCatalog {
  const v = (pageContent as { catalog_server?: unknown } | null)?.catalog_server;
  return v === "on" || v === "off" ? v : "auto";
}

/**
 * `cauta` inchide palierul server, si asta e o decizie temporara, nu o scapare.
 *
 * Cautarea e inca in browser: e tolerantă la greseli, cu scoruri, si ruleaza
 * peste tot catalogul. Cu o singura pagina in memorie n-ar mai avea ce cauta.
 * Pana cand cautarea se muta in SQL (cu poarta ei de paritate), o cerere cu `?q=`
 * cade pe calea de azi si primeste catalogul intreg.
 *
 * Nu e un compromis mare: navigarea obisnuita, care e majoritatea covarsitoare a
 * traficului, capata tot castigul. Iar cand cautarea se muta, se STERGE conditia
 * de aici — adica o migrare care nu schimba comportamentul nimanui, in loc sa
 * inlocuiasca un motor de cautare cu altul peste noapte.
 */
export function alegePalier(args: {
  pageContent: unknown;
  totalProduse: number;
  cauta: boolean;
}): PalierCatalog {
  if (args.cauta) return "client";
  const steag = citesteSteag(args.pageContent);
  if (steag === "off") return "client";
  if (steag === "on") return "server";
  return args.totalProduse >= PRAG_CATALOG_SERVER ? "server" : "client";
}
