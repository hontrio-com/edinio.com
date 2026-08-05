import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEmailConfig, buildStoreSender, type StoreEmailSender } from "./config";

/**
 * Load the store's email sender (branding + optional SMTP) for a business, so
 * callers can pass it to the store-facing email helpers. Reuse the result for
 * all emails of a single order.
 *
 * DOUA interogari, nu una, si dinadins.
 *
 * `email_config.smtp.pass` e parola serverului de email al comerciantului: pleaca
 * la nodemailer, deci trebuie sa fie in CLAR. Vederea `store_settings` nu mai
 * decripteaza pentru `anon`/`authenticated`, iar unul dintre apelanti (trimiterea
 * manuala de recuperare a cosului) intra aici cu clientul utilizatorului — acolo
 * parola ar veni ca sir `enc.v1.…`, SMTP-ul ar refuza autentificarea si emailul
 * ar pleca, tacut, pe canalul de rezerva, cu marca Edinio.
 *
 * De aceea `email_config` se citeste separat, cu service role.
 *
 * POARTA NU E RANDUL `businesses`. Pe el exista politica publica
 * `Public can view published businesses USING (is_published = true)`, deci ORICE
 * sesiune — inclusiv a altui comerciant — citeste randul oricarui magazin
 * publicat. Daca ne-am fi oprit acolo, un apel cu clientul utilizatorului si un
 * `businessId` strain ar fi scos parola SMTP a altui magazin, si asta ar fi fost
 * o bresa intre chiriasi, nu o mutare de citire.
 *
 * Poarta e randul din `store_settings`, cerut in ACEEASI interogare si tot cu
 * clientul PRIMIT: pe tabelul din spate politica e `Owners can manage store
 * settings` (owner-only), deci un neproprietar primeste `null` acolo si iese cu
 * expeditorul implicit — exact ce intorcea si legatura `store_settings(email_config)`
 * de dinainte, cand RLS filtra copilul. Autorizarea de ieri e pastrata bit cu bit;
 * doar VALOAREA se ia dupa aceea cu service role, ca sa vina decriptata.
 * `business_id` nu e camp secret, deci citirea lui nu decripteaza nimic.
 *
 * Cu client de admin (cron, webhookuri de comanda) ambele citiri trec, iar poarta
 * ramane codul apelant, care a rezolvat deja `business_id` dintr-o comanda.
 */
export async function getStoreEmailSender(
  admin: SupabaseClient<Database>,
  businessId: string,
): Promise<StoreEmailSender | undefined> {
  const { data } = await admin
    .from("businesses")
    .select("store_name, business_name, logo_url, primary_color, slug, custom_domain, email, store_settings(business_id)")
    .eq("id", businessId)
    .single();
  if (!data) return undefined;

  // Magazinul n-are rand de setari SAU apelantul n-are voie sa-l vada: in ambele
  // cazuri raspunsul corect e acelasi, expeditorul cu marca magazinului si fara
  // SMTP propriu. Nu se distinge intre ele dinadins — asa nici nu se poate afla
  // dintr-un apel daca un magazin strain are sau nu server de email configurat.
  const vizibil = Array.isArray(data.store_settings) ? data.store_settings[0] : data.store_settings;
  if (!vizibil) return buildStoreSender(parseEmailConfig(null), data);

  const { data: ss } = await createAdminClient()
    .from("store_settings")
    .select("email_config")
    .eq("business_id", businessId)
    .single();
  return buildStoreSender(parseEmailConfig(ss?.email_config), data);
}
