import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { bareHost } from "@/lib/platform-hosts";

/**
 * Cererea vine chiar de pe pagina magazinului, sau de pe alt site?
 *
 * ⚠⚠ DE CE E NEVOIE, DESI CORPUL E JSON.
 *
 * Un formular HTML de pe alt site nu poate trimite `application/json`, dar poate
 * trimite `text/plain`, iar `req.json()` din Next NU se uita la antetul
 * `Content-Type`: parseaza corpul oricum. Deci fara verificarea de mai jos, o
 * pagina straina putea trimite, cu cookie-ul omului, un POST catre
 * `/api/cont/intra` sau `/api/cont/inregistrare`. Nu putea CITI raspunsul (CORS il
 * opreste), dar putea declansa scrierea: coduri cerute in numele lui, si, la
 * intrare, o sesiune deschisa pe un cont ales de atacator.
 *
 * ⚠ Se cere `Origin`, nu `Referer`: `Referer` lipseste des si e usor de taiat de
 * politici de confidentialitate, iar un `Referer` lipsa ar fi trebuit atunci
 * lasat sa treaca, adica exact gaura pe care o inchidem. `Origin` e trimis de
 * browser la FIECARE POST cross-site si la POST-urile same-origin.
 *
 * ⚠ Cererile FARA `Origin` se refuza. Un `fetch` din pagina noastra il are
 * mereu; ce nu-l are e un client scris de mana, iar acela nu e cazul pe care il
 * slujim aici.
 */
export function vineDePeMagazin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let gazdaOrigine: string;
  try {
    gazdaOrigine = bareHost(new URL(origin).host);
  } catch {
    return false;
  }
  return gazdaOrigine === bareHost(req.headers.get("host") ?? "");
}

/**
 * IP-ul cererii, numai cand e un IP adevarat; altfel `null`.
 *
 * ⚠ `clientIp` intoarce `"unknown"` cand antetul lipseste, iar codul contului il
 * compara cu `"necunoscut"`: sirul ar fi ajuns intr-un parametru `inet` si ar fi
 * rupt deschiderea sesiunii. Pe Vercel antetul exista mereu, deci nu s-a vazut.
 */
export function ipPentruBaza(ip: string | null | undefined): string | null {
  const s = (ip ?? "").trim();
  return s && isIP(s) ? s : null;
}
