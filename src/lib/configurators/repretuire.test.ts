import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * La plasarea comenzii, „nu stim" NU inseamna „n-are".
 *
 * ═══ ⚠ DOUA REGULI OPUSE, SI AMANDOUA SUNT BUNE ═══
 *
 * Pe VITRINA, orice necaz inseamna „produsul se vinde simplu": o pagina de produs cazuta e mai
 * rea decat un produs vandut fara configurator. `vitrina.ts` intoarce o harta goala si merge mai
 * departe, si asa trebuie.
 *
 * AICI, INVERS. Antetul lui `repretuire.ts` o scrie: „o linie despre care nu stim sigur ce costa
 * se REFUZA. Trecuta mai departe la pretul de baza, ar fi insemnat sa dam gratis tot ce a
 * configurat cumparatorul — si comanda ar fi ajuns in atelier fara specificatie."
 *
 * ⚠ Codul facea CONTRARIUL. `configuratoarePentruProduse` e chiar invelisul care ARUNCA steagul
 * `ok`, iar calea banilor il chema pe el. La o pana de o clipa a bazei, un fototapet de 340 de lei
 * (cu `products.price` de 1 leu, cum scrie `pornire.ts`) intra in comanda cu 1,00 leu, fara nicio
 * specificatie. Cele doua drumuri care foloseau verdictul corect — feedurile si proiectia — nu
 * sunt pe bani.
 *
 * ⚠ DE CE O PROBA PE SURSA. Deosebirea dintre cele doua functii de incarcare nu se vede din
 * tipuri: amandoua intorc aceleasi configuratoare, iar una doar arunca un camp in plus. `tsc` nu
 * poate spune nimic, si nici o proba de purtare fara o baza de date falsa.
 */

const SRC = path.resolve(process.cwd(), "src");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(SRC, relativ), "utf8").replace(/\r\n/g, "\n");
}

/** ⚠ Fara comentarii: numele functiei „gresite" apare in chiar nota care spune de ce nu se mai foloseste. */
function faraComentarii(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const REPRETUIRE = "lib/configurators/repretuire.ts";

test("⚠ proba stie sa citeasca fisierul", () => {
  assert.ok(sursa(REPRETUIRE).length > 5000, "cititorul s-a rupt; restul probelor ar cadea pe gol");
});

test("⚠ calea banilor cere VERDICTUL, nu doar harta", () => {
  const s = faraComentarii(sursa(REPRETUIRE));
  assert.ok(
    s.includes("await configuratoareleCuVerdict("),
    "repretuirea nu mai cere verdictul citirii",
  );
  assert.equal(
    s.includes("configuratoarePentruProduse("),
    false,
    "s-a intors la invelisul care ARUNCA steagul `ok`",
  );
});

test("⚠ o linie negasita la o citire PICATA se REFUZA, nu se vinde simplu", () => {
  /*
   * ⚠ Numai cand LIPSESTE din harta SI citirea a picat. Ce s-a citit cu adevarat ramane bun de
   * folosit chiar daca alta bucata a picat — asta e chiar rostul lui `RaspunsConfiguratoare.ok`.
   * O garda scrisa doar pe `!raspuns.ok` ar fi refuzat si liniile despre care STIM ca n-au
   * configurator, adica ar fi oprit vanzarea produselor obisnuite la orice pana.
   */
  const s = faraComentarii(sursa(REPRETUIRE));
  assert.match(
    s,
    /if \(!c && !raspuns\.ok\) \{[\s\S]{0,200}fel: "refuz"/,
    "lipseste refuzul pentru linia despre care nu se stie nimic",
  );
});

test("mesajul de refuz ii spune omului ce sa faca, nu ce s-a stricat", () => {
  /*
   * ⚠ „Eroare interna" pe un checkout inseamna cos abandonat. Pana e de o clipa, deci sfatul bun
   * chiar e „reincearca" — si e adevarat, spre deosebire de „produsul nu mai e disponibil".
   */
  const s = sursa(REPRETUIRE);
  assert.match(s, /Reincearca peste cateva momente/);
});
