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
 * CAUTAREA NU MAI INCHIDE PALIERUL SERVER.
 *
 * Pana la A4, o cerere cu `?q=` cadea aici pe palierul client si primea tot
 * catalogul, fiindca motorul de cautare rula in browser peste lista intreaga. De
 * acum ruleaza pe server, peste candidatii alesi de `catalog_cauta`, cu ACELASI
 * cod — deci nu mai exista niciun motiv sa se trimita catalogul intreg.
 *
 * Conditia s-a STERS, nu s-a inlocuit: asta a fost proiectat de la inceput ca o
 * migrare care nu schimba comportamentul nimanui, in loc de un schimb de motoare
 * peste noapte. Rezerva ramane, dar mai jos si mai ingusta: `cautaPeServer`
 * intoarce `null` cand nu poate raspunde (magazin neindexat, sau un cuvant prea
 * comun), iar apelantul cade atunci pe calea veche pentru CEREREA aceea.
 */
export function alegePalier(args: {
  pageContent: unknown;
  totalProduse: number;
  /**
   * Magazinul e publicat. Cand nu e, palierul server NU poate raspunde.
   *
   * RPC-urile de catalog se cheama cu cheia de SERVICIU, deci `auth.uid()` e NULL
   * inauntrul lor si poarta „publicat SAU al meu" se reduce la „publicat". Pentru
   * un magazin nepublicat intorc corect zero randuri — dar proprietarul are voie
   * sa-si vada catalogul in previzualizare, si ar fi vazut un magazin gol.
   *
   * Nu se repara mutand poarta in argument: un argument trimis din cod ar fi
   * forjabil de oricine are cheia anon, adica „arata-mi catalogul oricarui magazin
   * nepublicat". Se repara aici, unde decizia oricum se ia: fara publicare, calea
   * veche. Latent azi (magazinele nepublicate sunt mici, deci pe `auto`), dar un
   * `on` pus de mana pe unul l-ar fi golit.
   */
  publicat: boolean;
}): PalierCatalog {
  if (!args.publicat) return "client";
  const steag = citesteSteag(args.pageContent);
  if (steag === "off") return "client";
  if (steag === "on") return "server";
  return args.totalProduse >= PRAG_CATALOG_SERVER ? "server" : "client";
}
