import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { PLATFORM_ORIGIN } from "@/lib/seo";

/**
 * Cheia din adresele pe care le primeste theMarketer: feedurile (produse, categorii, branduri, comenzi),
 * generatorul de coduri de reducere si webhookurile.
 *
 * ═══ DE CE O CHEIE A NOASTRA, SI NU CHEIA REST A LOR ═══
 *
 * Pluginul lor oficial pune in adresa cheia REST (`?key=<REST>`). Asa ar fi ajuns cheia REST (cea cu
 * care se aboneaza, se dezaboneaza si se anonimizeaza contacte) in setarile de feed, in jurnalele
 * oricarui proxy si in orice captura de ecran. Cheia noastra deschide numai ce e la adresele noastre si
 * se poate roti fara sa atinga contul theMarketer.
 *
 * ⚠ Generatorul de coduri cere IN PLUS cheia REST, in `key`: asa scrie documentatia lor („if
 * $_GET["key"] === $restApiKey”), deci theMarketer o trimite. Doua chei, doua usi.
 *
 * ═══ CE STA IN BAZA ═══
 *
 * `themarketer_chei` tine numai AMPRENTA (SHA-256), dupa care se cauta la fiecare cerere (o citire cu
 * index). Valoarea in clar sta criptata in `themarketer_config.cheie_feed`, fiindca omul trebuie sa-si
 * poata copia adresele in theMarketer. O scurgere a tabelei de amprente nu da nicio cheie.
 *
 * ⚠ ROTIREA NU STERGE RANDUL, ii pune `revocat_la`: asa se poate raspunde la „de ce nu mai merge
 * feedul”. Cautarea cere `revocat_la is null`, deci cheia veche e moarta din aceeasi clipa.
 */

type Db = SupabaseClient<Database>;

/** 32 de octeti criptografici, `base64url` (43 de caractere, fara `+ / =`: ajung intr-o adresa). */
export function cheieNoua(): string {
  return randomBytes(32).toString("base64url");
}

export function amprentaCheii(cheie: string): string {
  return createHash("sha256").update(cheie, "utf8").digest("hex");
}

/**
 * Sirul are macar FORMA unei chei de-ale noastre? Se intreaba INAINTE de orice client de baza: adresele
 * sunt publice prin definitie, iar fara poarta asta o rafala de chei inventate ar fi devenit trafic in
 * baza, platit de noi.
 */
export function formaCheieValida(cheie: string | null | undefined): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test((cheie ?? "").trim());
}

/**
 * Doua siruri secrete sunt egale? In timp constant, ca durata comparatiei sa nu spuna cate caractere
 * s-au potrivit. Lungimi diferite = diferite (lungimea cheii REST nu e un secret).
 */
export function egaleInTimpConstant(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length || x.length === 0) return false;
  return timingSafeEqual(x, y);
}

/* ═══ ADRESELE ═══
   ⚠ TOATE PE DOMENIUL PLATFORMEI, nu pe cel al magazinului: un comerciant isi poate schimba domeniul,
   iar adresele lipite in theMarketer ar muri in tacere. `www.edinio.com` nu se schimba.
   ⚠ Cheia e in CALE, nu in interogare: calea n-o scriem niciodata in jurnal. */

export type FelFeed = "produse" | "categorii" | "branduri" | "comenzi";

export function adresaFeed(cheie: string, fel: FelFeed): string {
  return `${PLATFORM_ORIGIN}/api/themarketer/${cheie}/${fel}.${fel === "comenzi" ? "json" : "xml"}`;
}

export function adresaGeneratorCoduri(cheie: string): string {
  return `${PLATFORM_ORIGIN}/api/themarketer/${cheie}/cod-reducere`;
}

export type FelWebhook = "dezabonat" | "respins" | "spam";
export const FELURI_WEBHOOK: readonly FelWebhook[] = ["dezabonat", "respins", "spam"];

export function adresaWebhook(cheie: string, fel: FelWebhook): string {
  return `${PLATFORM_ORIGIN}/api/themarketer/${cheie}/webhook/${fel}`;
}

/* ═══ CAUTAREA ═══ */

/**
 * Magazinul caruia ii apartine cheia, sau `null`. ⚠ O citire cazuta ARUNCA: nu e „cheie gresita”, iar
 * apelantul raspunde 503 (mai incearca), nu 404 (adresa nu exista).
 */
export async function magazinulCheii(admin: Db, cheie: string): Promise<string | null> {
  const curata = (cheie ?? "").trim();
  if (!formaCheieValida(curata)) return null;
  const { data, error } = await admin
    .from("themarketer_chei")
    .select("business_id")
    .eq("amprenta", amprentaCheii(curata))
    .is("revocat_la", null)
    .maybeSingle();
  if (error) throw error;
  return (data as { business_id: string } | null)?.business_id ?? null;
}

/** Scrie amprenta unei chei noi. */
export async function inregistreazaCheia(admin: Db, businessId: string, cheie: string): Promise<void> {
  const { error } = await admin
    .from("themarketer_chei")
    .insert({ amprenta: amprentaCheii(cheie), business_id: businessId } as never);
  if (error) throw error;
}

/**
 * Stinge cheile vechi ale magazinului, in afara de cea proaspata. ⚠ SE CHEAMA ULTIMA, dupa ce cheia
 * noua e si in configurare: stinsa mai devreme, o pana intre pasi ar lasa magazinul fara nicio cheie.
 */
export async function stingeCheileVechi(admin: Db, businessId: string, amprentaNoua: string | null): Promise<void> {
  let q = admin
    .from("themarketer_chei")
    .update({ revocat_la: new Date().toISOString() } as never)
    .eq("business_id", businessId)
    .is("revocat_la", null);
  if (amprentaNoua) q = q.neq("amprenta", amprentaNoua);
  const { error } = await q;
  if (error) throw error;
}
