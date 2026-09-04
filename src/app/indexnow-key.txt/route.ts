import { cheia } from "@/lib/indexnow";

/**
 * Fișierul prin care Bing dovedește că adresa e a noastră.
 *
 * Protocolul IndexNow cere ca la `keyLocation` să stea un fișier text care
 * conține CHIAR cheia trimisă în cerere. Bing îl cere înainte să accepte
 * adresele; fără el, orice trimitere primește `403`.
 *
 * ⚠ CHEIA NU E UN SECRET, și e important de spus ca să nu fie tratată ca unul.
 * Prin definiția protocolului, ea e publică: oricine poate deschide adresa asta
 * și o vede. Rostul ei nu e să ascundă, ci să lege trimiterile de cineva care
 * poate scrie pe domeniu. Stă totuși în mediu, nu în cod, ca să poată fi
 * schimbată fără o desfășurare — dacă cineva ar începe să trimită în numele
 * nostru, o cheie nouă îi taie legătura pe loc.
 *
 * ⚠ CALEA E FIXĂ, nu `/{cheie}.txt` cum îngăduie protocolul la rădăcină. Un
 * segment de rădăcină cu nume imprevizibil ar trece prin proxy ca posibil slug
 * de magazin și ar interoga baza la fiecare verificare a lui Bing. Calea asta e
 * trecută în `NON_STORE_SEGMENTS`, deci proxy-ul o lasă să treacă fără nicio
 * întrebare.
 *
 * ⚠ FĂRĂ CHEIE ÎN MEDIU, 404 — nu un fișier gol. Un fișier gol ar fi un răspuns
 * valid care nu conține cheia, adică exact cazul în care Bing întoarce `403` și
 * ne apropie de pragul de spam degeaba. Iar cronul, la rândul lui, nu trimite
 * nimic fără cheie. Cele două tac împreună.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const k = cheia();
  if (!k) return new Response("Not found", { status: 404 });
  return new Response(k, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      /* Bing îl cere rar, dar trebuie să vadă cheia CURENTĂ: o cheie schimbată
         și un fișier ținut în cache o oră înseamnă o oră de `403`. */
      "cache-control": "no-store",
      /* Adresa n-are ce căuta în index: nu e conținut, e o dovadă. */
      "x-robots-tag": "noindex",
    },
  });
}
