import { createHash } from "node:crypto";

/**
 * Separator care nu poate aparea intr-o credentiala reala (octetul zero).
 *
 * Obligatoriu: fara el, ["ab","c"] si ["a","bc"] ar da acelasi hash, deci doua
 * conturi diferite ar imparti acelasi token. Se construieste din cod, nu se
 * scrie ca literal: un octet zero pus direct in sursa e invizibil la citire si
 * face fisierul „binar" pentru grep si pentru unelte.
 */
const SEPARATOR = String.fromCharCode(0);

/**
 * Cheia sub care se pastreaza un token de furnizor, in cache-ul din proces.
 *
 * ⚠ DE CE EXISTA. Pana pe 09.09.2026, patru clienti isi cheiau tokenul dupa
 * partea PUBLICA a credentialei si atat: FAN dupa `username`, Colete dupa
 * `client_id`, FedEx dupa gazda plus `client_id`, Cargus dupa username plus
 * cheia de abonament. Secretul care dovedeste identitatea, parola, client
 * secret, nu intra in cheie deloc.
 *
 * Ce costa: dupa un login reusit, ORICE cerere ulterioara cu aceeasi parte
 * publica si un secret GRESIT primea tokenul valid din cache si trecea, fara sa
 * mai atinga furnizorul. Doua consecinte, amandoua probate pe FAN:
 *
 *  1. Interfata spunea „conectat" peste o parola gresita, iar comerciantul salva
 *     o credentiala invalida. Defectul iesea la iveala abia peste 23 de ore, sau
 *     pe o instanta rece, adica exact la primul AWB, cu comanda pe masa.
 *     Acelasi tipar cu „Testeaza conexiunea care nu testa nimic" de la fGO.
 *  2. Cache-ul e la nivel de MODUL, deci comun tuturor magazinelor din acelasi
 *     proces. Cine stia doar partea publica primea tokenul altcuiva si, prin el,
 *     datele contului altcuiva. La FAN asta insemna IBAN-ul din `reports/branches`.
 *
 * Secretul se amesteca HASUIT, nu in clar: cheia ajunge in mesaje de diagnostic
 * si in denumiri de intrari, iar o parola in clar acolo ar fi al doilea defect
 * peste primul. Hash-ul e de ajuns: cheia trebuie doar sa se SCHIMBE cand se
 * schimba secretul, nu sa poata fi citita inapoi.
 *
 * @param publice partile neconfidentiale care despart conturile intre ele
 *                (username, client id, gazda, mediu). Intra in clar.
 * @param secrete partile confidentiale (parola, client secret, cheie API).
 *                Intra doar prin hash.
 */
export function cheieToken(publice: readonly string[], secrete: readonly string[]): string {
  const amprenta = createHash("sha256").update(secrete.join(SEPARATOR)).digest("hex");
  return `${publice.join("|")}#${amprenta}`;
}
