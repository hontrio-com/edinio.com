import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";

/**
 * Valoarea reala a unui camp secret, pentru actiunile pornite din formular.
 *
 * DE CE EXISTA. De cand configuratiile pleaca spre browser MASCATE (vezi
 * `mascheazaConfig`), formularul nu mai are parola sau tokenul. Salvarea e
 * acoperita — `pastreazaSecretele` pastreaza valoarea veche cand primeste gol.
 * Dar pasii care VORBESC cu furnizorul pornind de la ce e in formular —
 * „conecteaza-te si adu-mi punctele de ridicare", „testeaza conexiunea" — ar
 * trimite sirul gol si ar primi „credentiale invalide". Comerciantul vede o
 * integrare aparent stricata, desi totul e salvat corect.
 *
 * Regula: ce vine de la client are intaietate (asa se poate TESTA o credentiala
 * noua inainte de a o salva); cand vine gol, cadem pe cea din baza.
 *
 * ⚠ DAR INTAIETATEA VINE A DOUA, DUPA IDENTITATE, si nu din estetica.
 *
 * Pana pe 09.09.2026, `if (dinFormular) return dinFormular` sta INAINTEA lui
 * `getUser`. Toti cei 19 apelanti ai functiei, „testeaza conexiunea" si
 * „incarca datele contului", in 17 fisiere de actiuni, se bazau pe ea ca pe o
 * poarta si nu mai verificau nimic ei insisi. Cu scurtatura prima, oricine
 * trimitea o parola NEVIDA sarea peste tot blocul de mai jos: `businessId`
 * devenea decorativ, sesiunea nu se cerea deloc (poarta MFA lasa sa treaca
 * cererile fara cookie), iar platforma raspundea la `api.fancourier.ro/login`
 * pentru oricine, de cate ori voia.
 *
 * Ce a costat, probat pe FAN: compusa cu un cache de token cheiat fara secret,
 * o singura cerere neautentificata scotea contul altui comerciant, denumire,
 * persoana de contact, ambele telefoane, emailul si IBAN-ul din
 * `reports/branches`. Vezi proba din `fancourier.token.test.ts`.
 *
 * Reordonarea de mai jos nu ia nimic din functionalitate: proprietarul
 * autentificat isi testeaza mai departe credentiala noua inainte de a o salva.
 * Doar ca acum trebuie sa fie el.
 *
 * Proprietatea se verifica de fiecare data cu clientul utilizatorului, deci
 * nimeni nu poate citi secretul altui magazin trimitand alt `businessId`.
 * Intoarce sirul gol la orice esec — apelantul trateaza asta ca „lipseste".
 *
 * CITIREA PROPRIU-ZISA SE FACE CU SERVICE ROLE, si abia dupa ce proprietatea a
 * fost dovedita mai sus. Din 2026-08-05, vederea `store_settings` nu mai
 * decripteaza pentru `anon`/`authenticated`, deci pe clientul utilizatorului
 * functia asta ar fi intors chiar `enc.v1.…` — adica exact ce era ea facuta sa
 * previna: sirul care nu e credentiala, trimis mai departe la furnizor, cu
 * „credentiale invalide" ca raspuns si nimic in mesaj despre cauza reala.
 */
export async function secretDinConfig(
  businessId: string,
  cheieConfig: keyof typeof CAMPURI_SECRETE & string,
  camp: string,
  primitDeLaClient?: string,
): Promise<string> {
  if (!businessId) return "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return "";

  // Abia AICI, cu proprietarul dovedit: credentiala din formular are intaietate.
  const dinFormular = (primitDeLaClient ?? "").trim();
  if (dinFormular) return dinFormular;

  const { data, error } = await createAdminClient()
    .from("store_settings").select(cheieConfig).eq("business_id", businessId).single();
  // `error` verificat explicit: fara el, un refuz de citire (drept revocat,
  // cache PostgREST vechi) ar arata identic cu „nu exista credentiala salvata",
  // iar comerciantul ar primi mesajul gresit. Vezi incidentul MFA din 04.08.2026.
  if (error || !data) return "";

  const config = (data as unknown as Record<string, unknown>)[cheieConfig];
  if (!config || typeof config !== "object") return "";
  const valoare = (config as Record<string, unknown>)[camp];
  return typeof valoare === "string" ? valoare.trim() : "";
}
