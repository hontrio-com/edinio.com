import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Semnatura livrarilor easySales.
 *
 * ═══ CE E DOCUMENTAT [A: „How signing requests works"] ═══
 *
 *     $payloadJson = json_encode($payload);
 *     $signature = hash_hmac('sha256', $payloadJson, $secret);
 *
 * in antetul `Signature`. Iesirea in hex e implicitul lui `hash_hmac`; `json_encode` fara optiuni
 * scrie `\/` si `\uXXXX`, fara spatii. Acestea tin de PHP, nu de documentatie.
 *
 * ═══ ⚠ CE NU E DOCUMENTAT, SI DE CE SE CALCULEAZA TREI VARIANTE ═══
 *
 * Nu se spune daca `$payload` e tot corpul `{payload, webhook}` sau numai valoarea cheii
 * `payload`, nici ca sirul semnat e chiar corpul trimis (M-WH-1, ES-11). Deci, FARA reserializare:
 *
 *   (a) `corp`         HMAC peste octetii bruti ai corpului;
 *   (b) `payload`      HMAC peste SUBSIRUL BRUT al valorii `payload` din corp;
 *   (c) `cheie_goala`  controlul: tot corpul (sau payload-ul) cu cheia GOALA. O potrivire aici nu
 *                      inseamna semnatura buna, ci „secret nepreluat": secretul n-a ajuns la ei sub
 *                      numele trimis (`secret` sau `seccret`).
 *
 * ⚠ NICIODATA peste `JSON.stringify(JSON.parse(corp))`: PHP scrie `\/` si `ă`, JavaScript
 * scrie `/` si `ă`. O semnatura recalculata dintr-o reserializare n-ar potrivi niciodata.
 */

export type VariantaSemnatura = "corp" | "payload" | "cheie_goala" | "lipsa" | "nepotrivita";

export interface VerdictSemnatura {
  varianta: VariantaSemnatura;
  /** Se potriveste pe o varianta adevarata (a sau b) cu secretul nostru? */
  potrivita: boolean;
}

function hmac(cheie: string, date: string): string {
  return createHmac("sha256", cheie).update(date, "utf8").digest("hex");
}

/** Comparatie in timp constant, pe hex mic. */
function egale(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toLowerCase());
  const y = Buffer.from(b.trim().toLowerCase());
  if (x.length !== y.length || x.length === 0) return false;
  try { return timingSafeEqual(x, y); } catch { return false; }
}

/**
 * Subsirul brut al valorii unei chei de pe primul nivel al unui obiect JSON, fara reserializare.
 * `null` cand corpul nu e un obiect sau cheia lipseste.
 *
 * ⚠ Un mic cititor de JSON, nu o expresie regulata: sirurile pot contine `{`, `}` si `"` scapate,
 * iar o cautare naiva ar taia gresit chiar in cazurile care conteaza (nume cu ghilimele, adrese).
 */
export function subsirulValorii(corp: string, cheie: string): string | null {
  let i = 0;
  const n = corp.length;
  const spatiu = () => { while (i < n && /\s/.test(corp[i])) i++; };
  /** Sare peste un sir care incepe la `i` (pe ghilimele). Intoarce false daca nu se inchide. */
  const sariSir = (): boolean => {
    i++; // ghilimelele de deschidere
    while (i < n) {
      const ch = corp[i];
      if (ch === "\\") { i += 2; continue; }
      if (ch === "\"") { i++; return true; }
      i++;
    }
    return false;
  };
  /** Sare peste o valoare oarecare care incepe la `i`. */
  const sariValoare = (): boolean => {
    spatiu();
    if (i >= n) return false;
    const ch = corp[i];
    if (ch === "\"") return sariSir();
    if (ch === "{" || ch === "[") {
      const stiva: string[] = [ch === "{" ? "}" : "]"];
      i++;
      while (i < n && stiva.length) {
        const c = corp[i];
        if (c === "\"") { if (!sariSir()) return false; continue; }
        if (c === "{") stiva.push("}");
        else if (c === "[") stiva.push("]");
        else if (c === "}" || c === "]") {
          if (stiva.pop() !== c) return false;
        }
        i++;
      }
      return stiva.length === 0;
    }
    while (i < n && !/[,}\]\s]/.test(corp[i])) i++;
    return true;
  };

  spatiu();
  if (corp[i] !== "{") return null;
  i++;
  for (;;) {
    spatiu();
    if (corp[i] === "}") return null;
    if (corp[i] !== "\"") return null;
    const startCheie = i;
    if (!sariSir()) return null;
    let numele: string;
    try { numele = JSON.parse(corp.slice(startCheie, i)); } catch { return null; }
    spatiu();
    if (corp[i] !== ":") return null;
    i++;
    spatiu();
    const start = i;
    if (!sariValoare()) return null;
    if (numele === cheie) return corp.slice(start, i);
    spatiu();
    if (corp[i] === ",") { i++; continue; }
    return null;
  }
}

/** Verdictul semnaturii unei livrari. Pura. */
export function verificaSemnatura(corpBrut: string, antet: string | null | undefined, secret: string | null | undefined): VerdictSemnatura {
  const semnatura = (antet ?? "").trim();
  if (!semnatura) return { varianta: "lipsa", potrivita: false };
  const payload = subsirulValorii(corpBrut, "payload");

  if (secret) {
    if (egale(hmac(secret, corpBrut), semnatura)) return { varianta: "corp", potrivita: true };
    if (payload !== null && egale(hmac(secret, payload), semnatura)) return { varianta: "payload", potrivita: true };
  }
  if (egale(hmac("", corpBrut), semnatura) || (payload !== null && egale(hmac("", payload), semnatura))) {
    return { varianta: "cheie_goala", potrivita: false };
  }
  return { varianta: "nepotrivita", potrivita: false };
}

/**
 * Livrarea poate dovedi ca semnam peste octetii lor, nu peste o reserializare? Da, cand corpul
 * are `\/`, o escapare `\u` sau caractere non-ASCII: acolo PHP si JavaScript scriu diferit, deci o
 * potrivire nu poate fi intamplatoare. Pe o asemenea livrare se poate trece in modul `impune`.
 */
export function livrareaDovedesteFormula(corpBrut: string): boolean {
  return corpBrut.includes("\\/") || /\\u[0-9a-fA-F]{4}/.test(corpBrut) || /[^\x00-\x7F]/.test(corpBrut);
}

/** Hash-ul jetonului din adresa abonarii (jetonul insusi nu se pastreaza). */
export function hashJeton(jeton: string): string {
  return createHmac("sha256", "easysales-jeton-webhook").update(jeton, "utf8").digest("hex");
}

/** Jetonul primit se potriveste cu hash-ul pastrat? In timp constant. */
export function jetonulSePotriveste(jeton: string | null | undefined, hashPastrat: string | null | undefined): boolean {
  if (!jeton || !hashPastrat) return false;
  return egale(hashJeton(jeton), hashPastrat);
}
