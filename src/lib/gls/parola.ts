import { createHash } from "node:crypto";

/**
 * Parola MyGLS: SHA-512, trimis ca LISTA DE OCTETI, nu ca sir.
 *
 * ═══ DE CE E INTR-UN FISIER PROPRIU, CU PROBE ═══
 *
 * E lucrul cel mai usor de gresit din toata integrarea, si cel mai greu de
 * diagnosticat: daca octetii ies gresit, MyGLS raspunde doar „autentificare
 * esuata" — acelasi mesaj pe care il da si o parola gresita. Ai cauta zile
 * intregi in datele de acces, cand de fapt e formatul.
 *
 * ⚠ Integrarea se probeaza DIRECT IN PRODUCTIE, pe contractul unui client real.
 * Deci fiecare bucata care se poate verifica fara retea se verifica aici, cu
 * valori cunoscute.
 *
 * ═══ CE ASTEAPTA MyGLS ═══
 *
 * `Password` NU e sirul hexazecimal. E rezumatul SHA-512 BRUT (64 de octeti),
 * trimis ca tablou de numere intre 0 si 255:
 *
 *     "parola" → [162, 63, 174, …]   // 64 de numere
 *
 * Echivalentul PHP din pluginul oficial de WooCommerce:
 *
 *     array_values(unpack('C*', hash('sha512', $password, true)))
 *
 * `true` la `hash()` inseamna „iesire bruta", iar `unpack('C*')` o taie in
 * octeti fara semn. Fara `true` ar iesi 128 de caractere hexazecimale, iar
 * `unpack` le-ar da codurile ASCII — 128 de numere gresite in loc de 64 bune.
 *
 * ⚠ Codificarea intrarii e UTF-8: o parola cu diacritice sau cu caractere
 * speciale trebuie sa dea aceiasi octeti ca in PHP, unde sirurile sunt deja
 * secvente de octeti UTF-8.
 */
export function parolaMyGls(parola: string): number[] {
  return Array.from(createHash("sha512").update(parola, "utf8").digest());
}
