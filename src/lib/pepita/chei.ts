import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { PLATFORM_ORIGIN } from "@/lib/seo";

/**
 * Cheile integrarii Pepita: cea din adresele de feed si cea din adresa de comenzi.
 *
 * ═══ ⚠ DE CE EXISTA CHEI, DESI DOCUMENTATIA LOR ZICE DOAR „ar fi util" ═══
 *
 * Documentul lor scrie: „It might be useful to agree on a common key (a random
 * string of sufficient length) for the API", cu exemplul
 * `https://api.partneraruhaz.hu/order/store?apikey=qwerty`. Adica o sugestie, si
 * o sugestie cu un exemplu prost.
 *
 * La noi nu e optionala. Adresa de comenzi CREEAZA comenzi si SCADE stoc, iar
 * feedul arata intreg catalogul unui magazin cu preturi si stocuri. Fara cheie,
 * oricine ar putea, cu un id ghicit, sa citeasca catalogul altui comerciant sau
 * sa-i inventeze comenzi.
 *
 * ═══ ⚠ CE STA IN BAZA SI CE NU ═══
 *
 * `pepita_chei` tine numai AMPRENTA (SHA-256) cheii, si dupa ea se cauta la
 * fiecare cerere: o citire cu index, nu o parcurgere a tuturor magazinelor.
 * Valoarea in clar sta o singura data, criptata, in `store_settings.pepita_config`,
 * fiindca omul trebuie sa si-o poata copia in mesajul catre Pepita.
 *
 * Deci o scurgere a tabelei de amprente nu da nimanui nicio cheie.
 *
 * ⚠ ROTIREA NU STERGE RANDUL, ii pune `revocat_la`. Asa se poate raspunde la
 * intrebarea „de ce nu mai merge feedul", si asa se vede in jurnal ca a fost
 * folosita o cheie veche. Cautarea cere `revocat_la is null`, deci cheia veche e
 * moarta din aceeasi clipa.
 */

type Db = SupabaseClient<Database>;

export type FelCheie = "feed" | "comenzi";

/**
 * O cheie noua.
 *
 * 32 de octeti din generatorul criptografic al sistemului, scrisi `base64url`
 * (43 de caractere). `base64url` fiindca ajunge intr-o adresa: fara `+`, `/` sau
 * `=`, deci nu are ce sa se strice la copiere sau la codare.
 *
 * ⚠ NU `Math.random()`, NU un UUID si NU o data. Un UUID v4 are 122 de biti si ar
 * fi fost destul, dar poarta si o structura recunoscuta; aici nu e nevoie de
 * nicio structura.
 */
export function cheieNoua(): string {
  return randomBytes(32).toString("base64url");
}

/** Amprenta dupa care se cauta cheia. Nu se poate intoarce la valoarea ei. */
export function amprentaCheii(cheie: string): string {
  return createHash("sha256").update(cheie, "utf8").digest("hex");
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADRESELE PE CARE LE PRIMESTE PEPITA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ TOATE PE DOMENIUL PLATFORMEI, nu pe cel al magazinului.
 *
 * Un comerciant isi poate schimba sau pierde domeniul propriu; adresele date
 * odata catre Pepita ar muri atunci in tacere, iar comenzile ar inceta sa mai
 * ajunga fara ca nimeni sa apese nimic. `www.edinio.com` nu se schimba.
 *
 * ⚠ SI CHEIA E IN CALE, nu in interogare. Sirurile de interogare ajung in
 * jurnalele serverelor, in referrer si in uneltele de urmarire; calea ajunge si
 * ea, dar noi controlam ce scriem, iar ruta noastra nu scrie niciodata adresa.
 * Adresa de comenzi accepta si forma `?apikey=`, fiindca asa arata exemplul lor
 * si e cu putinta sa o ceara asa.
 */
export function adresaFeedProduse(cheie: string): string {
  return `${PLATFORM_ORIGIN}/api/pepita/produse/${cheie}.xml`;
}

export function adresaFeedStoc(cheie: string): string {
  return `${PLATFORM_ORIGIN}/api/pepita/stoc/${cheie}.xml`;
}

export function adresaComenzi(cheie: string): string {
  return `${PLATFORM_ORIGIN}/api/pepita/comenzi/${cheie}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAUTAREA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CheieGasita {
  businessId: string;
  fel: FelCheie;
}

/**
 * Magazinul caruia ii apartine cheia, sau `null`.
 *
 * ⚠ FELUL SE VERIFICA. O cheie de feed folosita pe adresa de comenzi nu trebuie
 * sa deschida nimic: altfel, cheia pe care comerciantul o lipeste in mesaje si
 * o poate arata pe ecran ar deveni si cheia care creeaza comenzi.
 *
 * ⚠ Se cheama cu clientul de sistem, dar filtrul dupa magazin nu dispare de
 * aceea: rezultatul E chiar magazinul, si tot ce urmeaza se leaga de el.
 */
export async function magazinulCheii(admin: Db, fel: FelCheie, cheie: string): Promise<CheieGasita | null> {
  const curata = (cheie ?? "").trim();
  /*
   * ⚠ Forma se verifica INAINTE de baza. Fara asta, orice sir din adresa ar
   * porni o interogare, deci un atac ieftin ar deveni trafic in baza de date.
   */
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(curata)) return null;

  const { data, error } = await admin
    .from("pepita_chei")
    .select("business_id, fel")
    .eq("amprenta", amprentaCheii(curata))
    .eq("fel", fel)
    .is("revocat_la", null)
    .maybeSingle();

  /*
   * ⚠ O CITIRE CAZUTA NU E „cheie gresita". Se intoarce `null` in amandoua
   * cazurile, fiindca apelantul nu poate face nimic altceva, dar apelantul
   * raspunde 503 la eroare si 401 la lipsa, iar deosebirea o face `error`.
   */
  if (error) throw error;
  const rand = data as { business_id: string; fel: string } | null;
  return rand ? { businessId: rand.business_id, fel: rand.fel as FelCheie } : null;
}

/**
 * Pune o cheie noua si o revoca pe cea veche, in aceasta ordine.
 *
 * ⚠ INTAI CEA NOUA. Invers, o pana intre cei doi pasi ar lasa magazinul fara
 * nicio cheie valida, deci cu feedul mort si comenzile respinse, si nimic nu
 * l-ar mai reporni de la sine.
 */
export async function roteste(admin: Db, businessId: string, fel: FelCheie): Promise<string> {
  const cheie = cheieNoua();
  const { error: eNou } = await admin.from("pepita_chei").insert({
    business_id: businessId,
    fel,
    amprenta: amprentaCheii(cheie),
  } as never);
  if (eNou) throw eNou;

  const { error: eVechi } = await admin
    .from("pepita_chei")
    .update({ revocat_la: new Date().toISOString() } as never)
    .eq("business_id", businessId)
    .eq("fel", fel)
    .is("revocat_la", null)
    .neq("amprenta", amprentaCheii(cheie));
  if (eVechi) throw eVechi;

  return cheie;
}

/**
 * Revoca toate cheile magazinului. Se cheama la deconectare.
 *
 * ⚠ NU STERGE randurile: istoricul comenzilor deja importate ramane, iar o
 * incercare de folosire a unei chei revocate se poate explica.
 */
export async function revocaToate(admin: Db, businessId: string): Promise<void> {
  const { error } = await admin
    .from("pepita_chei")
    .update({ revocat_la: new Date().toISOString() } as never)
    .eq("business_id", businessId)
    .is("revocat_la", null);
  if (error) throw error;
}
