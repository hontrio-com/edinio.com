import { TOATE_GHIDURILE } from "@/lib/website/ajutor";
import { construiesteIndex } from "@/lib/website/ajutor-cautare";

/**
 * Indexul de căutare al centrului de ajutor, ca fișier.
 *
 * ═══ DE CE UN FIȘIER ȘI NU DATELE ÎN PACHET ═══
 *
 * Căutarea are nevoie de toate cele 406 de ghiduri, dar NUMAI atunci când omul
 * chiar scrie ceva în câmp. Împachetate cu pagina, cele 1,1 MB de text plecau spre
 * fiecare vizitator, inclusiv spre cei care deschid `/ajutor`, se uită la
 * categorii și apasă pe una. Se vedea: pagina se randa în secunde.
 *
 * Acum indexul se aduce la PRIMA ATINGERE a câmpului de căutare, ca scriptul
 * reCAPTCHA de la formulare (vezi `lib/website/recaptcha-client.ts`, unde e scris
 * același raționament). 149 KB comprimați, doar pentru cine caută.
 *
 * ═══ SE CONSTRUIEȘTE DIN DATE, NU SE ȚINE DE MÂNĂ ═══
 *
 * ⚠ Un fișier JSON scris separat s-ar fi despărțit de ghiduri la prima corectură,
 * și nu s-ar fi văzut: căutarea ar fi găsit un titlu vechi și ar fi dus la o adresă
 * care nu mai există. Aici indexul iese din `TOATE_GHIDURILE` de fiecare dată când
 * se construiește site-ul, deci nu poate rămâne în urmă.
 *
 * `force-static` îl prerandă la build și îl servește ca pe orice fișier static.
 * Nu e o cerere către server la fiecare căutare, e o singură descărcare, pusă în
 * memoria browserului de acolo încolo.
 *
 * ⚠ LA MUTAREA PE `ajutor.edinio.com` se mută și ruta asta, altfel pagina de
 * căutare de pe subdomeniu ar cere un fișier de pe celălalt domeniu, iar
 * `connect-src 'self'` din politica de securitate a conținutului l-ar opri.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(construiesteIndex(TOATE_GHIDURILE), {
    headers: {
      /*
        Un an, cu `immutable`: fișierul se schimbă doar la o construcție nouă a
        site-ului, iar atunci se schimbă și pagina care îl cere. Fără asta, fiecare
        vizită ar fi întrebat serverul dacă s-a schimbat ceva, pentru un fișier
        care aproape niciodată nu s-a schimbat.
      */
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
