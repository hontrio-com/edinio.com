/*
  Pozele produselor dintr-o lista de comenzi sau de cereri de retur, si taierea unei liste de
  id-uri in grupe. Modul de SERVER: il cheama doar paginile, niciodata o piesa din browser.
*/

import { primaImagine } from "@/lib/parteneri/hontrio";
import type { createClient } from "@/lib/supabase/server";

type Baza = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cate id-uri intra intr-o cerere: lista merge in ADRESA ei, iar una prea lunga e respinsa. */
const PE_CERERE = 100;

/** Taie o lista in grupe de cel mult `cate`, pentru filtrele `in(...)` care merg in adresa cererii. */
export function inGrupe<T>(lista: readonly T[], cate = PE_CERERE): T[][] {
  const pas = Math.max(1, Math.trunc(cate));
  const grupe: T[][] = [];
  for (let i = 0; i < lista.length; i += pas) grupe.push(lista.slice(i, i + pas));
  return grupe;
}

/**
 * Id-urile de produs din liniile date, fara repetari.
 *
 * ⚠ Doar cele care chiar sunt UUID: liniile venite de pe marketplace pot purta alt fel de cod in
 * `product_id`, iar o singura valoare care nu e UUID face baza sa refuze TOATA cererea
 * (`invalid input syntax for type uuid`), adica nicio poza pentru nicio comanda.
 */
export function iduriDeProdus(randuri: readonly { items?: unknown }[]): string[] {
  const iduri = new Set<string>();
  for (const r of randuri) {
    for (const p of Array.isArray(r.items) ? (r.items as { product_id?: unknown }[]) : []) {
      if (typeof p?.product_id === "string" && UUID.test(p.product_id)) iduri.add(p.product_id);
    }
  }
  return [...iduri];
}

/**
 * Prima poza a fiecarui produs din liniile date, pe id de produs.
 *
 * Id-urile se cer in grupe de o suta, deodata: taiata la primele 120, lista lasa fara poza
 * produsele din coada unei pagini cu multe produse diferite.
 *
 * @param randuri Randuri cu o coloana `items` (comenzi sau cereri de retur): fiecare linie are `product_id`.
 * @param idMagazin Magazinul ale carui produse se cauta: o linie nu poate arata poza altui magazin.
 */
export async function pozeleProduselor(
  supabase: Baza,
  randuri: readonly { items?: unknown }[],
  idMagazin: string,
): Promise<Record<string, string>> {
  const poze: Record<string, string> = {};
  const iduri = iduriDeProdus(randuri);
  if (iduri.length === 0) return poze;
  const raspunsuri = await Promise.all(
    inGrupe(iduri).map((grup) => supabase.from("products").select("id, images").eq("business_id", idMagazin).in("id", grup)),
  );
  for (const { data: produse } of raspunsuri) {
    for (const p of produse ?? []) {
      const poza = primaImagine(p.images);
      if (poza) poze[p.id] = poza;
    }
  }
  return poze;
}
