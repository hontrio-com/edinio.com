import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
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
 *
 * ⚠⚠ Un IPv6 se socoteste pe RETEA (`/64`), nu pe adresa: un singur abonat primeste
 * de obicei un /64 intreg, deci ar fi putut schimba adresa la fiecare cerere si
 * ar fi trecut pe langa fiecare plafon pe IP. Forma intoarsa (`a:b:c:d::/64`) e
 * un `inet` valid, deci ajunge la fel in baza.
 */
export function ipPentruBaza(ip: string | null | undefined): string | null {
  const s = (ip ?? "").trim();
  const fel = s ? isIP(s) : 0;
  if (fel === 4) return s;
  if (fel !== 6) return null;
  const faraZona = s.split("%")[0].toLowerCase();
  /* IPv4 scris ca IPv6 (`::ffff:1.2.3.4`): e un IPv4. */
  const ipv4 = faraZona.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4 && isIP(ipv4[1]) === 4) return ipv4[1];
  const [cap, coada] = faraZona.includes("::") ? faraZona.split("::") : [faraZona, undefined];
  const inceput = cap ? cap.split(":") : [];
  const sfarsit = coada ? coada.split(":") : [];
  const lipsa = coada === undefined ? 0 : 8 - inceput.length - sfarsit.length;
  const grupe = [...inceput, ...Array<string>(Math.max(0, lipsa)).fill("0"), ...sfarsit];
  const retea = grupe.slice(0, 4).map((g) => Number.parseInt(g || "0", 16).toString(16));
  return `${retea.join(":")}::/64`;
}

/** Cheia pentru plafoanele pe IP: aceeasi retea IPv6, aceeasi cheie. */
export function cheieIp(ip: string | null | undefined): string {
  return ipPentruBaza(ip) ?? "necunoscut";
}

/**
 * Adresa de email are forma pe care o cere baza (`cont_cod_destinatie_are_forma`)?
 * ⚠ Aceeasi regula, scrisa a doua oara ca ruta sa raspunda cu un refuz limpede in
 * loc sa ajunga la o constrangere care arunca.
 */
export function adresaEmailValida(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.length <= 254 && /^[^@\s,;<>"\\]+@[^@\s,;<>"\\]+\.[a-z]{2,}$/.test(e);
}

/**
 * Raspunsul pentru o sesiune care nu mai e (expirata, inchisa de pe alt dispozitiv,
 * cont suspendat). ⚠ 401 cu un text, nu 404: un 404 ajungea pe ecran ca „nu am
 * putut salva" sau „documentul nu se mai gaseste", iar omul nu afla ca trebuie
 * doar sa intre din nou.
 */
export function sesiuneExpirata(): NextResponse {
  return NextResponse.json(
    { eroare: "Sesiunea a expirat. Intra din nou in cont.", reintra: true },
    { status: 401 },
  );
}
