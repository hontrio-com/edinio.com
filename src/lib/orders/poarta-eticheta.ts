import { NextResponse } from "next/server";
import { motivContInactiv } from "@/lib/subscription-server";

/* ═══════════════════════════════════════════════════════════════════════════
   POARTA RUTELOR CARE SERVESC ETICHETA UNUI AWB DEJA EMIS
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ DE CE O POARTA SINGURA, SI NU PATRU RANDURI IN FIECARE RUTA. Sunt opt rute de
   eticheta (cargus, colete, dpd, ecolet, fancourier, gls, sameday, woot). Regula
   scrisa de opt ori se dezbina la a noua: cine o adauga copiaza fisierul de langa,
   si daca acela e cel fara poarta, lipsa se propaga tacut. Exact motivul pentru
   care `poarta-awb.ts` e o poarta singura. `poarta-eticheta.test.ts` cere ca
   fiecare ruta sa cheme functia asta, deci uitarea nu mai e cu putinta.

   ⚠ CE APARA. Blocarea abonamentului e o redirectionare de PAGINA, facuta in
   layout-ul de dashboard: nu atinge rutele astea. Adresa lor ramane in istoricul
   browserului, cu `orderId` si `businessId` in ea, deci un magazin suspendat putea
   sa-si traga mai departe etichetele, iar fiecare cerere cheama API-ul curierului cu
   credentialele comerciantului, adica pe integrarea platita prin platforma.

   ⚠ CONTRA-ARGUMENTUL, scris aici ca sa poata fi intors in cunostinta de cauza:
   eticheta nu creeaza nimic. AWB-ul EXISTA deja si e deja facturat de curier, iar un
   refuz aici lasa un colet fizic care nu mai poate fi predat. Cine judeca altfel
   decat s-a judecat pe 13.09.2026 are aici si faptele, si motivul, si poate scoate
   poarta din toate cele opt locuri dintr-o singura atingere.

   Emiterea, care CHIAR cheltuie, e aparata separat si de mult, in `poarta-awb.ts`.
*/

/**
 * Raspunsul de refuz cand contul nu mai e activ, sau `null` cand se poate servi.
 *
 * Se cheama DUPA ce s-a dovedit ca magazinul e al celui logat: `businessId` vine din
 * adresa, deci pana la verificarea aia nu inseamna nimic.
 */
export async function poartaEtichetei(businessId: string): Promise<NextResponse | null> {
  const motiv = await motivContInactiv(businessId);
  return motiv ? NextResponse.json({ error: motiv }, { status: 402 }) : null;
}
