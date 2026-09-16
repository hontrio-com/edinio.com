import { createHmac, timingSafeEqual } from "crypto";

/**
 * Autentificarea notificarilor Netopia (IPN, server catre server).
 *
 * Endpointul de notificare e PUBLIC, iar IPN-ul v2 al lor nu poarta niciun secret pe care sa-l
 * controlam noi: specificatia lor OpenAPI (`NotifyRequest`) are doar `payment` si `order`, fara
 * semnatura si fara antet de verificare. Deci legam noi un jeton semnat de adresa de notificare, la
 * pornirea platii. Netopia cheama inapoi EXACT adresa pe care am inregistrat-o, cu tot cu
 * interogare, iar asta dovedeste ca notificarea corespunde unei plati pornite de noi pentru chiar
 * comanda aceea.
 *
 * ⚠ Jetonul nu ajunge niciodata la cumparator: `notifyUrl` se compune pe server si pleaca DOAR in
 * cererea catre ei; ruta de pornire intoarce browserului numai `redirectUrl`.
 *
 * ═══ ⚠⚠ DE CE ARUNCA IN LOC SA CADA PE SIRUL GOL (16.09.2026) ═══
 *
 * Aici scria `return process.env.NETOPIA_IPN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""`.
 * Cu `""`, `createHmac` NU se plange: scoate un HMAC perfect valid, doar ca pe o cheie pe care o
 * stie toata lumea. Iar id-ul comenzii il stie si cumparatorul, e chiar in adresa de confirmare.
 *
 * Adica, fara nicio variabila de mediu, oricine putea calcula jetonul si trimite o notificare de
 * „platit" pentru propria comanda: marfa pleaca, factura se emite, banii nu vin niciodata. Si nimic
 * nu s-ar fi vazut, fiindca un HMAC pe cheie goala arata identic cu unul pe cheie adevarata.
 *
 * ⚠ In productie gaura NU e deschisa: `SUPABASE_SERVICE_ROLE_KEY` exista (chiar rutele astea il
 * folosesc ca sa scrie in baza). Ce se repara e ca protectia nu mai poate DISPAREA in tacere la o
 * redenumire de variabila.
 *
 * ⚠ Si abia asa devine probabila: incarcatorul de probe nu aduce niciun `.env`, deci pana azi si
 * semnatorul, si verificatorul lucrau cu `""` in probe. O proba care ar fi spus „un jeton falsificat
 * e respins" ar fi trecut verde fara sa apere nimic. Vezi memoria `probele-semneaza-cu-cheia-goala`.
 *
 * Acelasi tipar ca `semnaturaCheii` din `lib/utils/cheie-neghicibila.ts`, adus la fail-closed pe
 * 04.08.2026. Modulul asta ramasese pe dinafara.
 */
function ipnSecret(): string {
  const s = process.env.NETOPIA_IPN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!s) {
    throw new Error(
      "Lipseste secretul de semnare a notificarilor Netopia (NETOPIA_IPN_SECRET sau "
      + "SUPABASE_SERVICE_ROLE_KEY). Fara el, jetonul de autentificare al IPN-ului poate fi calculat "
      + "de oricine stie id-ul comenzii, deci o notificare de „platit” ar putea fi falsificata.",
    );
  }
  return s;
}

export function signNetopiaIpn(orderId: string): string {
  return createHmac("sha256", ipnSecret()).update(orderId).digest("base64url");
}

/**
 * Jetonul primit corespunde comenzii?
 *
 * ⚠ Lipsa secretului ARUNCA de aici, si asta e dinadins. Alternativa ar fi sa intoarcem `false`,
 * adica sa respingem tacut fiecare notificare: platile ar inceta sa se mai inregistreze, fara ca
 * nimeni sa afle de ce. Aruncarea iese ca `500`, iar Netopia REPETA notificarea, deci plata nu se
 * pierde: se inregistreaza de indata ce variabila e pusa la loc.
 */
export function verifyNetopiaIpn(orderId: string, token: string | null | undefined): boolean {
  if (!token || !orderId) return false;
  const expected = Buffer.from(signNetopiaIpn(orderId));
  const provided = Buffer.from(token);
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
