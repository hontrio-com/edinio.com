/**
 * De la ce adrese IP suna eMAG.
 *
 * ═══ ⚠ LISTA E A LOR SI SE SCHIMBA. NOI DOAR O TINEM MINTE ═══
 *
 * Documentatia lor spune doua lucruri, si al doilea e cel care conteaza:
 *
 *     „Sellers integrating with the eMAG & FD Marketplace API must allow the
 *      following source IPs on any callback / webhook endpoint they expose."
 *     „This list is authoritative — please update your firewall rules whenever this
 *      section changes."
 *     „Machine-readable list: /public-ips.json — poll this endpoint to automate
 *      firewall updates."
 *
 * Scrisa o data in cod si uitata acolo, ziua in care ei adauga un IP nou ar fi aratat
 * asa: notificarile se opresc, comenzile continua sa intre — dar prin cron, la un
 * minut in loc de indata. Nimic nu se strica, totul merge putin mai incet, si nimeni
 * n-are de ce sa se uite. Se descopera cand un client suna intreband de ce comanda
 * lui n-a fost preluata.
 *
 * De aceea lista se ADUCE de la ei, se tine minte, si se foloseste impreuna cu cea
 * scrisa in cod. Doua liste, nu una.
 *
 * ⚠ FISIER PUR, FARA IMPORTURI. Aducerea propriu-zisa e in `client.ts`, unde sta si
 * iesirea pe IP fix; aici e doar ce se face cu raspunsul.
 */

/** Cheia sub care sta lista in `platform_settings`. Globala, nu pe magazin. */
export const CHEIE_IPURI = "emag_callback_ips";

/**
 * Cele trei din documentatia v4.5.1.
 *
 * ⚠ RAMAN, chiar dupa ce se aduce lista de la ei. Sunt plasa pentru ziua in care
 * `/public-ips.json` nu raspunde, sau raspunde cu ceva ce nu se poate citi: mai bine
 * o lista veche care functioneaza decat niciuna, care ar refuza toate notificarile.
 */
export const IP_DIN_DOCUMENTATIE: readonly string[] = [
  "43.131.5.30",
  "91.206.37.14",
  "46.174.144.128",
];

/**
 * Adresele dintr-un raspuns a carui forma nu e descrisa nicaieri.
 *
 * ⚠ SE CITESTE APARAT. Documentatia pomeneste fisierul dar nu-i da schema. Deci se
 * incearca formele plauzibile — tablou de siruri, tablou de obiecte cu `ip`, obiect
 * cu o cheie care tine tabloul — si NIMIC nu se ghiceste mai departe.
 *
 * ⚠ Fiecare adresa e verificata sa fie chiar o adresa IPv4. Un raspuns stricat care
 * ar aduce sirul „unauthorized" ca „IP" ar fi largit lista cu o valoare care nu se
 * potriveste cu nimic — nepericulos, dar ar fi ascuns faptul ca aducerea a esuat.
 */
export function citesteIpuri(brut: unknown): string[] {
  const gasite = new Set<string>();

  const adauga = (v: unknown) => {
    if (typeof v !== "string") return;
    const ip = v.trim();
    if (esteIpv4(ip)) gasite.add(ip);
  };

  const umbla = (v: unknown, adancime: number) => {
    if (adancime > 4 || v == null) return;
    if (typeof v === "string") return adauga(v);
    if (Array.isArray(v)) {
      for (const x of v) umbla(x, adancime + 1);
      return;
    }
    if (typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) umbla(x, adancime + 1);
    }
  };

  umbla(brut, 0);
  return [...gasite];
}

/**
 * E o adresa IPv4 adevarata?
 *
 * ⚠ Se verifica si intervalul fiecarui octet, nu doar forma. „999.1.1.1" trece de o
 * potrivire lenesa pe cifre si puncte, si ar fi intrat in lista alba.
 */
export function esteIpv4(s: string): boolean {
  const bucati = s.split(".");
  if (bucati.length !== 4) return false;
  return bucati.every((b) => /^\d{1,3}$/.test(b) && Number(b) >= 0 && Number(b) <= 255);
}

/**
 * Lista cu care se compara apelantul.
 *
 * Cele din documentatie, plus cele aduse de la ei, plus cele puse in mediu. Ordinea
 * nu conteaza; ce conteaza e ca niciuna dintre surse nu o poate goli pe cealalta.
 */
export function ipuriPermise(
  aduse: string[] | null | undefined,
  dinMediu: string | null | undefined,
): string[] {
  const toate = new Set<string>(IP_DIN_DOCUMENTATIE);
  for (const ip of aduse ?? []) if (esteIpv4(ip)) toate.add(ip);
  for (const ip of (dinMediu ?? "").split(",")) {
    const c = ip.trim();
    if (esteIpv4(c)) toate.add(c);
  }
  return [...toate];
}

/**
 * S-a schimbat lista fata de ce stiam?
 *
 * ⚠ Se compara ca MULTIMI, nu ca siruri. Ei pot reordona fisierul fara sa schimbe
 * nimic, iar o comparatie pe text ar fi strigat „s-a schimbat lista" la fiecare
 * reordonare — si dupa a treia alarma falsa nu se mai uita nimeni la ele.
 */
export function sAuSchimbat(vechi: string[] | null | undefined, noi: string[]): boolean {
  const a = new Set(vechi ?? []);
  const b = new Set(noi);
  if (a.size !== b.size) return true;
  for (const x of b) if (!a.has(x)) return true;
  return false;
}
