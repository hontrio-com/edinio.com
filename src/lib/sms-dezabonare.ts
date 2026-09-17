import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cine a cerut sa nu mai fie sunat. O singura regula, pentru AMANDOI furnizorii de SMS.
 *
 * ═══ ⚠⚠ DE CE S-A MUTAT AICI (17.09.2026) ═══
 *
 * Garda de dezabonare s-a nascut ieri, la SMSO, si statea in `smso-urma.ts`. Masurat azi, asta o
 * facea aproape degeaba: in recuperarea cosurilor abandonate **notice.ro se incearca PRIMUL**, iar
 * `sendNoticeAbandonedSms` intoarce `handled: true`, deci calea SMSO (cu garda) nu se mai atinge
 * niciodata. La orice magazin cu notice.ro pornit, garda de ieri era ocolita in intregime.
 *
 * O regula despre cine NU are voie sa fie sunat nu poate sta in fisierul UNUI furnizor.
 *
 * ⚠⚠ SI NORMALIZAREA TREBUIE SA FIE ACEEASI, ALTFEL TABELUL MINTE. `sms_optout` e cheiat pe
 * `(business_id, phone)`. notice.ro isi normalizeaza numerele la `07XXXXXXXX` (`normalizeNoticePhone`),
 * SMSO la `7XXXXXXXX`. Scrise fiecare cu forma lui, acelasi om ar fi fost DOUA randuri, si niciuna
 * dintre garzi n-ar fi gasit randul scris de cealalta. De aceea `numarNormalizat` de aici e singura
 * forma care atinge tabelul, oricine ar scrie.
 */

type Admin = SupabaseClient;

/**
 * Numarul, adus la o forma unica: fara prefixul de tara, fara zeroul de inceput.
 *
 * ⚠ IN ORDINEA ASTA, si prima forma a functiei o gresea: taia un singur zero, deci
 * `0040722334455` ajungea `040722334455` in loc de `722334455`. Acelasi om ar fi fost doua randuri in
 * lista de dezabonati si ar fi primit mesajul oricum. Prins de proba, nu de citit codul.
 *
 * ⚠ Un numar romanesc normalizat are 9 cifre si incepe cu 7, deci nu se poate confunda niciodata cu
 * prefixul de tara taiat mai sus.
 */
export function numarNormalizat(phone: string): string {
  let c = String(phone ?? "").replace(/\D/g, "");
  if (c.startsWith("00")) c = c.slice(2);
  if (c.startsWith("40")) c = c.slice(2);
  if (c.startsWith("0")) c = c.slice(1);
  return c;
}

/** Ce scrie omul cand vrea sa nu mai primeasca. „STOP” e forma ceruta de lege in Romania. */
export const CUVINTE_DE_OPRIRE = ["stop", "unsubscribe", "dezabonare", "dezabonat"];

/**
 * A cerut omul sa fie oprit?
 *
 * ⚠ SE UITA DOAR LA PRIMUL CUVANT, nu oriunde in text: „nu ma opri din cumparat” n-ar trebui sa
 * dezaboneze pe nimeni. Aceeasi regula pentru raspunsurile venite de la SMSO (pe webhook) si pentru
 * cele citite de la notice.ro (prin tragere), fiindca omul scrie acelasi lucru pe amandoua.
 */
export function ceruOprirea(body: string | null | undefined): boolean {
  const t = String(body ?? "").trim().toLowerCase();
  if (!t) return false;
  const primul = t.split(/\s+/)[0]?.replace(/[^\p{L}]/gu, "") ?? "";
  return CUVINTE_DE_OPRIRE.includes(primul);
}

/** Numerele care nu mai primesc MARKETING de la magazinul asta, indiferent de furnizor. */
export async function dezabonatii(admin: Admin, businessId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from("sms_optout").select("phone").eq("business_id", businessId);
  /*
   * ⚠ O CITIRE PICATA NU DESCHIDE LISTA. Intoarsa goala, campania ar suna exact oamenii care au
   * cerut sa nu mai fie sunati. Se arunca, iar apelantul opreste trimiterea.
   */
  if (error) throw new Error(`lista de dezabonati nu s-a putut citi: ${error.message}`);
  return new Set((data ?? []).map((r) => numarNormalizat(String((r as { phone: string }).phone))));
}

/** E numarul asta oprit de la marketing? Intrebare pentru un singur om, folosita langa trimitere. */
export async function esteDezabonat(
  admin: Admin, businessId: string, phone: string,
): Promise<{ oprit: boolean; nesigur: boolean }> {
  const { data, error } = await admin
    .from("sms_optout").select("id")
    .eq("business_id", businessId).eq("phone", numarNormalizat(phone)).limit(1);
  /*
   * ⚠ O citire picata se intoarce ca `nesigur`, iar apelantul NU trimite. Citita pe dos, garda ar
   * suna exact oamenii care au cerut sa nu mai fie sunati, si tocmai cand baza are o problema.
   */
  if (error) return { oprit: false, nesigur: true };
  return { oprit: !!(data && data.length > 0), nesigur: false };
}

/** Il trecem pe lista. Idempotent: a doua oara nu strica nimic. */
export async function tineMinteDezabonarea(
  admin: Admin, businessId: string, phone: string, sursa: string,
): Promise<void> {
  const { error } = await admin
    .from("sms_optout")
    .upsert({ business_id: businessId, phone: numarNormalizat(phone), sursa } as never,
            { onConflict: "business_id,phone", ignoreDuplicates: true });
  if (error) console.error("[sms] dezabonarea nu s-a putut scrie:", { businessId, error: error.message });
}
