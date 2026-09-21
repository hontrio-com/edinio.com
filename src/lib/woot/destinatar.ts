import { potrivesteJudetulWoot, potrivesteLocalitateaWoot } from "@/lib/shipping/localitatea-woot";
import { liniaAdresei } from "@/lib/orders/adresa";
import type { WootCity, WootCounty } from "@/lib/woot";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DESTINATARUL WOOT, COMPUS PE SERVER                           (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fereastra de AWB compune destinatarul in browser, dintr-o lista adusa cu doua cereri
 * si din ce alege omul in doua meniuri. Lotul n-are pe cine intreba, deci trebuie sa
 * ajunga singur la acelasi rezultat.
 *
 * ⚠ SE FOLOSESC ACELEASI DOUA POTRIVIRI CA FEREASTRA (`potrivesteJudetulWoot`,
 * `potrivesteLocalitateaWoot`), nu o cautare scrisa aici. Ele stiu ce s-a invatat din
 * comenzi ADEVARATE: „Municipiul Bucuresti" (cum scrie chiar checkoutul nostru, la 25
 * de comenzi din care 23 cu AWB Woot) si „Sector 5", care nu e prefixul lui
 * „Sectorul 5", cum isi numeste Woot sectoarele. O a doua potrivire scrisa aici ar fi
 * inceput corect si s-ar fi departat la prima reparatie facuta doar intr-un loc.
 *
 * ⚠ SI ACEEASI LINIE DE ADRESA. Woot are UN SINGUR camp („Strada, nr."), iar el pleaca
 * intreg la curier. `liniaAdresei` da linia completa, cu numarul in ea; `street` singur
 * ar fi trimis coletul pe strada, fara numar.
 */

export interface DestinatarWoot {
  contact: string;
  phone: string;
  email?: string;
  country_id: 189;
  city_id: number;
  address: string;
}

export type AdresaComenzii = {
  county?: string; city?: string; address?: string; street?: string; street_no?: string;
};

/**
 * Destinatarul, sau `null` cand adresa comenzii nu se potriveste in nomenclatorul lor.
 *
 * ⚠ `null` NU se acopera cu o rezerva. O localitate ghicita ar trimite coletul in alt
 * oras, iar la un lot nimeni nu se uita la fiecare rand. Comanda se sare, se spune de ce,
 * si omul o emite individual, unde poate alege localitatea cu mana.
 */
export async function destinatarulComenzii(
  comanda: {
    customer_name: string | null; customer_phone: string | null; customer_email: string | null;
    shipping_address: unknown;
  },
  judete: WootCounty[],
  oraseleJudetului: (countyId: number) => Promise<WootCity[]>,
): Promise<DestinatarWoot | null> {
  const addr = (comanda.shipping_address ?? {}) as AdresaComenzii;

  const judet = potrivesteJudetulWoot(judete, addr.county ?? "");
  if (!judet) return null;

  const linia = liniaAdresei(addr);
  const orase = await oraseleJudetului(judet.id);
  const oras = potrivesteLocalitateaWoot(orase, addr.city ?? "", linia);
  if (!oras) return null;

  /* Fara adresa n-are ce sa scrie pe AWB, si curierul ar refuza oricum. */
  if (!linia.trim()) return null;

  return {
    contact: comanda.customer_name ?? "",
    phone: comanda.customer_phone ?? "",
    email: comanda.customer_email || undefined,
    country_id: 189,
    city_id: oras.id,
    address: linia,
  };
}
