import "server-only";
import { createHmac } from "node:crypto";
import { normalizePhone } from "@/lib/marketing-config";
import { kidZendeskValid, secretValid, type FurnizorSuport, type SuportConfig } from "./config";
import type { ClientCunoscut, IdentitateSemnata } from "./tipuri-chat";

export type { ClientCunoscut, IdentitateSemnata };

/**
 * Identitatea clientului cu cont, in forma pe care o cere fiecare furnizor de chat.
 *
 * ═══ DE CE SE SEMNEAZA ═══
 *
 * Fara semnatura, pagina ar spune singura „sunt ion@exemplu.ro”, iar furnizorul ar crede-o: oricine ar
 * putea scrie in consola emailul altui client si i-ar vedea conversatiile. Semnatura se face AICI, pe
 * server, cu secretul comerciantului, numai dupa ce sesiunea de cont a spus cine e omul.
 *
 *   - tawk.to: `hash` = HMAC-SHA256(userId, cheia API a proprietatii), pentru `Tawk_API.login`
 *     (developer.tawk.to/jsapi, „login”);
 *   - Intercom: JWT HS256 cu „Messenger API secret”, `user_id` obligatoriu, pus in `intercom_user_jwt`
 *     (help: „Authenticating users in the Messenger with JSON Web Tokens”);
 *   - Zendesk: JWT HS256 cu `kid` in antet si `scope: "user"`, `external_id` (developer.zendesk.com,
 *     „Authenticating users in your application”);
 *   - Tidio: nu are semnatura. Datele pleaca drept completare a formularului lor (`tidioIdentify`).
 *
 * ⚠ FARA SECRET NU PLEACA NIMIC la cei trei cu semnatura: functia intoarce `null`, iar chatul ramane
 * anonim. Un JWT gresit e mai rau decat lipsa lui: la Intercom, Messengerul nu se mai incarca deloc.
 *
 * ⚠ `server-only`: secretul nu are ce cauta intr-un fisier pe care l-ar putea aduce o componenta de client.
 */

/** Cat traieste un JWT. Scurt: butonul cere unul nou la fiecare deschidere si la fiecare 401 al widgetului. */
export const VIATA_JWT_SEC = 60 * 60;

function base64url(v: string | Buffer): string {
  return Buffer.from(v).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** JWT HS256. Antetul primeste `alg` si `typ`; `antetInPlus` e pentru `kid`-ul Zendesk. */
export function jwtHS256(payload: Record<string, unknown>, secret: string, antetInPlus: Record<string, string> = {}): string {
  const antet = base64url(JSON.stringify({ alg: "HS256", typ: "JWT", ...antetInPlus }));
  const corp = base64url(JSON.stringify(payload));
  const semnatura = base64url(createHmac("sha256", secret).update(`${antet}.${corp}`).digest());
  return `${antet}.${corp}.${semnatura}`;
}

export function hmacSha256Hex(mesaj: string, cheie: string): string {
  return createHmac("sha256", cheie).update(mesaj).digest("hex");
}

/** Telefonul in forma internationala (`+40712345678`), cum il cer tawk.to si Intercom, sau gol. */
export function telefonInternational(brut: string | null | undefined): string {
  const cifre = normalizePhone(brut);
  return cifre ? `+${cifre}` : "";
}

/**
 * Identitatea de trimis furnizorului, sau `null` cand nu se poate semna (secret lipsa) ori clientul n-are
 * email. `acum` e injectat pentru probe.
 */
export function identitateaPentru(
  furnizor: FurnizorSuport,
  config: Pick<SuportConfig, "conturi" | "tawkto_cheie_api" | "intercom_secret" | "zendesk_secret">,
  client: ClientCunoscut,
  acum: number = Date.now(),
): IdentitateSemnata | null {
  const id = client.id.trim();
  const email = client.email.trim().toLowerCase();
  if (!id || !email.includes("@")) return null;
  const nume = client.nume.trim().slice(0, 120);
  const telefon = telefonInternational(client.telefon);
  const exp = Math.floor(acum / 1000) + VIATA_JWT_SEC;

  if (furnizor === "tidio") return { furnizor, id, nume, email, telefon };

  if (furnizor === "tawkto") {
    const cheie = config.tawkto_cheie_api;
    if (!secretValid(cheie)) return null;
    return { furnizor, id, hash: hmacSha256Hex(id, cheie), nume, email, telefon };
  }

  if (furnizor === "intercom") {
    const secret = config.intercom_secret;
    if (!secretValid(secret)) return null;
    const payload: Record<string, unknown> = { user_id: id, email, exp };
    if (nume) payload.name = nume;
    if (telefon) payload.phone = telefon;
    return { furnizor, jwt: jwtHS256(payload, secret) };
  }

  const secret = config.zendesk_secret;
  const kid = config.conturi?.zendesk?.kid;
  if (!secretValid(secret) || !kidZendeskValid(kid)) return null;
  const payload: Record<string, unknown> = { scope: "user", external_id: id, email, email_verified: true, exp };
  if (nume) payload.name = nume;
  return { furnizor: "zendesk", jwt: jwtHS256(payload, secret, { kid }) };
}
