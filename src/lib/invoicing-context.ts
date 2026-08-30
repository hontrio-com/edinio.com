import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Clientul cu care ruleaza facturarea automata.
 *
 * Dispecerul de facturare e chemat din doua feluri de locuri:
 *   - din panou, unde exista sesiune si apelantul a verificat deja proprietarul;
 *   - de pe server, la confirmarea unei plati online (webhook, cron, ruta de
 *     intoarcere), unde NU exista sesiune. Acolo clientul cu cookie-uri nu poate
 *     citi `orders` — tabelul n-are politica publica de citire — deci factura nu
 *     s-ar emite niciodata.
 *
 * De ce un client primit ca argument si nu un simplu steag „sistem": functiile
 * astea sunt exportate din module `"use server"`, deci sunt si actiuni de server
 * apelabile din browser. Un steag ar fi fost trimis de oricine si ar fi dat
 * privilegii de administrator peste comenzile altui magazin — adica emitere de
 * documente fiscale la comanda. Un client Supabase nu e serializabil, deci nu
 * poate fi fabricat dintr-o cerere de browser; verificarea de mai jos respinge
 * orice imitatie si cade inapoi pe clientul cu sesiune, unde RLS decide.
 */
export type SistemClient = SupabaseClient | undefined;

function eClientReal(c: unknown): c is SupabaseClient {
  return !!c && typeof (c as { from?: unknown }).from === "function";
}

/** Clientul de sistem daca a fost dat de un apelant server, altfel cel cu sesiune. */
export async function clientFacturare(sistem: SistemClient): Promise<SupabaseClient> {
  if (eClientReal(sistem)) return sistem;
  return (await createClient()) as unknown as SupabaseClient;
}

/** A venit apelul dintr-un context de server de incredere? */
export function eSistem(sistem: SistemClient): boolean {
  return eClientReal(sistem);
}
