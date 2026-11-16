"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { logError } from "@/lib/error-logger";
import {
  citesteConfigTbi, esteFormaBannerTbi, FORMA_COD_RESELLER, TBI_BANNER_IMPLICIT, TBI_CATEGORIE_IMPLICITA,
  type ProdusFinantareTbi, type TbiConfig,
} from "@/lib/tbi/config";
import { produseleDeFinantare, verificaLegatura } from "@/lib/tbi/client";
import { STARI_DESCHISE, type StareTbi } from "@/lib/tbi/stari";
import { anuleazaCerereaTbi, ramburseazaCerereaTbi } from "@/lib/tbi/server";

/**
 * Actiunile panoului pentru tbi bank. Fiecare isi verifica omul: un modul "use server" e un set de
 * capete HTTP publice, deci `businessId` venit din browser nu dovedeste nimic.
 */

async function magazinulOmului(businessId: string): Promise<{ ok: true; slug: string | null; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!biz) return { ok: false, error: "Acces interzis" };
  return { ok: true, slug: biz.slug ?? null, userId: user.id };
}

/** Configurarea salvata, cu secretele DECRIPTATE (service role), dupa garda de proprietate. */
async function configSalvata(businessId: string): Promise<{ ok: true; raw: unknown; cfg: TbiConfig } | { ok: false }> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("tbi_config").eq("business_id", businessId).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, raw: data?.tbi_config ?? null, cfg: citesteConfigTbi(data?.tbi_config ?? null) };
}

export type VerificareTbi =
  | { fel: "buna"; produse: ProdusFinantareTbi[] }
  | { fel: "credentiale" | "cheie" | "necunoscut"; mesaj: string };

/**
 * Cele trei valori, verificate la tbi FARA sa se atinga nimic acolo (vezi `verificaLegatura`), plus
 * produsele de finantare ale magazinului, ca omul sa vada ce i-a pus banca in contract.
 */
async function verificaLaTbi(cfg: Pick<TbiConfig, "sandbox" | "reseller_code" | "reseller_key" | "cheie_criptare">): Promise<VerificareTbi> {
  const v = await verificaLegatura(cfg);
  if (v.fel !== "buna") return v;
  const p = await produseleDeFinantare(cfg);
  /* Legatura e dovedita; produsele lipsa (retea) nu o fac mai putin buna. */
  return { fel: "buna", produse: p.fel === "ok" ? p.produse : [] };
}

export type RezultatSalvareTbi =
  | { success: true; avertisment?: string; produse: ProdusFinantareTbi[] | null }
  | { success: false; error: string; camp?: keyof TbiConfig };

/**
 * Salveaza configurarea tbi.
 *
 * ⚠ DATELE DE ACCES SE VERIFICA LA SALVARE, la tbi, nu la prima comanda. O cheie gresita ar fi cazut
 * abia la primul client care alege plata in rate (cererea refuzata) sau, mai rau, la prima veste de
 * aprobare (care nu s-ar fi putut descifra), cand comanda ar fi ramas neplatita fara ca cineva sa afle.
 * Un refuz dovedit (401, 207) opreste salvarea; o retea cazuta nu: se salveaza si se spune.
 */
export async function salveazaConfigTbi(businessId: string, input: TbiConfig): Promise<RezultatSalvareTbi> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { success: false, error: om.error };

  /* Secretele vechi se citesc DECRIPTATE (service role), dupa garda de proprietate de mai sus. */
  const admin = createAdminClient();
  const { data: rand, error: eCitire } = await admin
    .from("store_settings").select("tbi_config").eq("business_id", businessId).maybeSingle();
  if (eCitire) return { success: false, error: "Nu am putut citi configurarea existentă. Reîncearcă." };
  const vechea = citesteConfigTbi(rand?.tbi_config ?? null);

  const numar = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };
  const curat: TbiConfig = {
    enabled: input.enabled === true,
    sandbox: input.sandbox !== false,
    reseller_code: String(input.reseller_code ?? "").trim(),
    /* Taiate: o valoare copiata din email vine des cu un spatiu sau un rand nou la coada, iar tbi
       compara exact, deci ar raspunde 401 (sau 207) fara alta explicatie. */
    reseller_key: String(input.reseller_key ?? "").trim(),
    cheie_criptare: String(input.cheie_criptare ?? "").trim(),
    suma_minima: numar(input.suma_minima),
    suma_maxima: numar(input.suma_maxima),
    categorie: String(input.categorie ?? "").trim() || TBI_CATEGORIE_IMPLICITA,
    /* O valoare necunoscuta (formular vechi, cerere facuta de mana) cade pe randul discret. */
    banner_produs: esteFormaBannerTbi(input.banner_produs) ? input.banner_produs : TBI_BANNER_IMPLICIT,
  };

  if (curat.reseller_code && !FORMA_COD_RESELLER.test(curat.reseller_code)) {
    return { success: false, camp: "reseller_code", error: "Codul de reseller are doar litere, cifre, „_”, „-” sau „.”, ca în emailul de la tbi bank (de exemplu magazin_ro)." };
  }
  if (!/^\d{1,9}$/.test(curat.categorie)) {
    return { success: false, camp: "categorie", error: "Codul de categorie e un număr întreg (implicit 1)." };
  }
  if (!Number.isFinite(curat.suma_minima) || curat.suma_minima < 0) {
    return { success: false, camp: "suma_minima", error: "Suma minimă trebuie să fie un număr pozitiv, în lei." };
  }
  if (!Number.isFinite(curat.suma_maxima) || curat.suma_maxima <= 0 || curat.suma_maxima > 1_000_000) {
    return { success: false, camp: "suma_maxima", error: "Suma maximă trebuie să fie un număr între 1 și 1.000.000 de lei." };
  }
  if (curat.suma_minima > curat.suma_maxima) {
    return { success: false, camp: "suma_minima", error: "Suma minimă nu poate fi mai mare decât suma maximă." };
  }

  /* Gol = „nu schimba". Cu ce ramane efectiv se verifica legatura si se decide daca e gata. */
  const efectiva = {
    sandbox: curat.sandbox,
    reseller_code: curat.reseller_code,
    reseller_key: curat.reseller_key || vechea.reseller_key,
    cheie_criptare: curat.cheie_criptare || vechea.cheie_criptare,
  };
  const complete = !!(efectiva.reseller_code && efectiva.reseller_key && efectiva.cheie_criptare);

  if (curat.enabled && !complete) {
    const lipsa: string[] = [];
    if (!efectiva.reseller_code) lipsa.push("codul de reseller");
    if (!efectiva.reseller_key) lipsa.push("cheia de reseller");
    if (!efectiva.cheie_criptare) lipsa.push("cheia de criptare");
    return { success: false, error: `Ca să activezi plata în rate lipsește: ${lipsa.join(", ")}.` };
  }

  /*
   * Se verifica numai cand s-a schimbat ceva din ce ajunge la tbi (datele de acces sau mediul): un
   * comutator sau o limita nu trebuie sa astepte banca.
   */
  const schimbateLaTbi = efectiva.reseller_code !== vechea.reseller_code || !!curat.reseller_key || !!curat.cheie_criptare
    || efectiva.sandbox !== vechea.sandbox;
  let avertisment: string | undefined;
  let produse: ProdusFinantareTbi[] | null = null;
  if (complete && schimbateLaTbi) {
    const v = await verificaLaTbi(efectiva);
    if (v.fel === "buna") produse = v.produse;
    else if (v.fel === "credentiale") return { success: false, camp: "reseller_key", error: `${v.mesaj} Verifică codul și cheia de reseller din emailul tbi și mediul ales (test sau real).` };
    else if (v.fel === "cheie") return { success: false, camp: "cheie_criptare", error: `${v.mesaj} Copiaz-o din nou din emailul tbi, întreagă.` };
    else avertisment = `Am salvat, dar nu am putut verifica datele la tbi bank acum (${v.mesaj}). Apasă „Verifică legătura” peste câteva minute.`;
  }

  const finala = pastreazaSecretele("tbi_config", curat, rand?.tbi_config);
  const supabase = await createClient();
  const { error } = await supabase
    .from("store_settings")
    .update({ tbi_config: finala as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (error) {
    await logError({ action: "salveazaConfigTbi", message: error.message, details: { code: error.code }, businessId, userId: om.userId, severity: "error" });
    return { success: false, error: "Configurarea nu s-a putut salva. Reîncearcă." };
  }

  revalidatePath("/dashboard/features/tbi");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (om.slug) revalidatePath(`/${om.slug}`);
  return { success: true, avertisment, produse };
}

/**
 * Produsele de finantare ale magazinului, pentru panou (cerute dupa montarea paginii). `null` cand
 * datele de acces nu sunt complete.
 */
export async function produseleTbiAleMagazinului(
  businessId: string,
): Promise<{ produse: ProdusFinantareTbi[] } | { produse: null; mesaj: string | null }> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { produse: null, mesaj: om.error };
  const salvata = await configSalvata(businessId);
  if (!salvata.ok) return { produse: null, mesaj: "Nu am putut citi configurarea salvată." };
  const { cfg } = salvata;
  if (!cfg.reseller_code || !cfg.reseller_key) return { produse: null, mesaj: null };
  const r = await produseleDeFinantare(cfg);
  return r.fel === "ok" ? { produse: r.produse } : { produse: null, mesaj: r.mesaj };
}

/**
 * „Verifica legatura", din panou: cu valorile din formular, iar unde un secret e gol, cu cel salvat.
 * Nu salveaza nimic si nu atinge nimic la tbi.
 */
export async function verificaLegaturaTbi(
  businessId: string,
  input: Pick<TbiConfig, "sandbox" | "reseller_code" | "reseller_key" | "cheie_criptare">,
): Promise<VerificareTbi> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { fel: "necunoscut", mesaj: om.error };
  const salvata = await configSalvata(businessId);
  if (!salvata.ok) return { fel: "necunoscut", mesaj: "Nu am putut citi configurarea salvată. Reîncearcă." };
  const cfg = {
    sandbox: input.sandbox !== false,
    reseller_code: String(input.reseller_code ?? "").trim(),
    reseller_key: String(input.reseller_key ?? "").trim() || salvata.cfg.reseller_key,
    cheie_criptare: String(input.cheie_criptare ?? "").trim() || salvata.cfg.cheie_criptare,
  };
  if (!cfg.reseller_code || !cfg.reseller_key || !cfg.cheie_criptare) {
    return { fel: "necunoscut", mesaj: "Completează codul de reseller, cheia de reseller și cheia de criptare." };
  }
  if (!FORMA_COD_RESELLER.test(cfg.reseller_code)) {
    return { fel: "credentiale", mesaj: "Codul de reseller are doar litere, cifre, „_”, „-” sau „.”." };
  }
  return verificaLaTbi(cfg);
}

/**
 * Deconectarea: configurarea se sterge cu totul (inclusiv cheile). Cererile deja trimise raman in
 * baza, cu istoria lor; o veste care mai vine pentru ele nu se mai poate descifra si se spune in jurnal.
 */
export async function deconecteazaTbi(businessId: string): Promise<{ success: boolean; error?: string }> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { success: false, error: om.error };
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").update({ tbi_config: null }).eq("business_id", businessId);
  if (error) return { success: false, error: "Eroare la ștergere." };
  revalidatePath("/dashboard/features/tbi");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (om.slug) revalidatePath(`/${om.slug}`);
  return { success: true };
}

export type CerereTbiPanou = {
  id: number;
  stare: StareTbi;
  motiv: string | null;
  suma: number;
  mediu: "test" | "live";
  creata: string;
  ultimaVeste: string | null;
  anulareCeruta: string | null;
  contract: string | null;
  poateAnula: boolean;
  /** Credit aprobat, cu datele tbi pentru rambursare (cererile vechi, fara ele, se ramburseaza din portalul lor). */
  poateRambursa: boolean;
  /** Cat s-a cerut deja inapoi din Edinio (rambursari inregistrate la tbi), in lei. */
  rambursatCerut: number;
  istoric: { la: string; text: string }[];
};

const lei = (n: number) => `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} lei`;

function textIntrare(i: Record<string, unknown>): string {
  const fel = String(i.fel ?? "");
  if (fel === "veste" || fel === "interogare") {
    const cod = Number(i.status_id);
    if (cod === 4) return "tbi bank a înregistrat rambursarea";
    if (cod === 5) return "tbi bank procesează rambursarea";
    if (cod === 6) return "tbi bank a încheiat rambursarea";
    const stare = String(i.stare ?? "");
    const motiv = typeof i.motiv === "string" && i.motiv ? ` (${i.motiv})` : "";
    const nume: Record<string, string> = {
      aprobata: "tbi bank a aprobat finanțarea", in_analiza: "Cererea e în analiză", respinsa: "tbi bank a respins cererea",
      anulata: "Cererea a fost anulată",
    };
    const de = fel === "interogare" ? " (aflat întrebând tbi bank)" : "";
    return `${nume[stare] ?? `Stare: ${stare}`}${motiv}${de}`;
  }
  if (fel === "trimisa") return "Cererea a plecat la tbi bank; clientul a fost trimis pe pagina lor";
  if (fel === "anulare") {
    if (i.rezultat === "locala") return "Anulată de magazin (cererea nu ajunsese la tbi bank)";
    return i.rezultat === "anulata" ? "Anulare trimisă de magazin, confirmată de tbi bank"
      : `Anulare trimisă de magazin, neconfirmată${typeof i.mesaj === "string" ? `: ${i.mesaj}` : ""}`;
  }
  if (fel === "rambursare") {
    const suma = Number(i.suma);
    const ce = `Rambursare ${i.tip === "partial" ? "parțială" : "integrală"}${Number.isFinite(suma) ? ` de ${lei(suma)}` : ""}`;
    return i.rezultat === "inregistrata" ? `${ce}, înregistrată la tbi bank`
      : `${ce} cerută, neconfirmată${typeof i.mesaj === "string" ? `: ${i.mesaj}` : ""}`;
  }
  if (fel === "refuz" || fel === "necunoscut") return "Cererea nu a putut fi trimisă la tbi bank";
  return fel || "Eveniment";
}

/** Cererile unei comenzi, pentru panoul din pagina comenzii. Fara jetoane si fara adresa lor. */
export async function cererileTbiAleComenzii(
  businessId: string,
  orderId: string,
): Promise<{ cereri: CerereTbiPanou[] } | { error: string }> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { error: om.error };
  const { data, error } = await createAdminClient()
    .from("tbi_cereri")
    .select("id, stare, motiv, suma, mediu, created_at, ultima_veste_la, anulare_ceruta_la, istoric, contract, tbi_order_id")
    .eq("business_id", businessId).eq("order_id", orderId)
    .order("created_at", { ascending: false }).limit(20);
  if (error) return { error: "Nu am putut citi cererile de finanțare." };
  return {
    cereri: (data ?? []).map((c) => {
      const intrari = (Array.isArray(c.istoric) ? (c.istoric as Record<string, unknown>[]) : [])
        .filter((i) => i && typeof i === "object" && typeof i.la === "string");
      const rambursatCerut = intrari
        .filter((i) => i.fel === "rambursare" && i.rezultat === "inregistrata")
        .reduce((s, i) => s + (Number(i.suma) || 0), 0);
      return {
        id: c.id,
        stare: c.stare as StareTbi,
        motiv: c.motiv,
        suma: Number(c.suma),
        mediu: c.mediu === "test" ? "test" : "live",
        creata: c.created_at,
        ultimaVeste: c.ultima_veste_la,
        anulareCeruta: c.anulare_ceruta_la,
        contract: c.contract,
        poateAnula: STARI_DESCHISE.includes(c.stare as StareTbi),
        poateRambursa: c.stare === "aprobata" && !!c.tbi_order_id && rambursatCerut < Number(c.suma) - 0.005,
        rambursatCerut: Math.round(rambursatCerut * 100) / 100,
        istoric: intrari.map((i) => ({ la: String(i.la), text: textIntrare(i) })).reverse(),
      };
    }),
  };
}

async function cerereaSiConfigul(businessId: string, orderId: string, cerereId: number) {
  const admin = createAdminClient();
  const [{ data: cerere, error: eC }, { data: st, error: eS }] = await Promise.all([
    admin.from("tbi_cereri").select("*").eq("id", cerereId).eq("business_id", businessId).eq("order_id", orderId).maybeSingle(),
    admin.from("store_settings").select("tbi_config").eq("business_id", businessId).maybeSingle(),
  ]);
  return { admin, cerere, raw: st?.tbi_config ?? null, eroare: !!(eC || eS) };
}

/**
 * „Anuleaza cererea de finantare", din pagina comenzii. Buton SEPARAT de selectorul de stare al
 * comenzii (vezi `revolut-banii-si-semnatura.test.ts`): anularea comenzii n-are voie sa porneasca
 * singura un apel catre banca, iar cronul `tbi-reconciliere` o face oricum pentru comenzile anulate.
 */
export async function anuleazaCerereaTbiDinPanou(
  businessId: string,
  orderId: string,
  cerereId: number,
): Promise<{ success: true; mesaj: string } | { success: false; error: string }> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { success: false, error: om.error };
  const { admin, cerere, raw, eroare } = await cerereaSiConfigul(businessId, orderId, cerereId);
  if (eroare) return { success: false, error: "Nu am putut citi cererea. Reîncearcă." };
  if (!cerere) return { success: false, error: "Cererea nu a fost găsită." };
  const r = await anuleazaCerereaTbi(admin, cerere, raw);
  revalidatePath(`/dashboard/orders/${orderId}`);
  return r.ok ? { success: true, mesaj: r.mesaj } : { success: false, error: r.mesaj };
}

/**
 * „Rambursează la tbi bank", din pagina comenzii: pentru un credit aprobat (marfa returnata, comanda
 * anulata dupa aprobare). Ca anularea, e un buton separat, niciodata un efect al starii comenzii.
 */
export async function ramburseazaTbiDinPanou(
  businessId: string,
  orderId: string,
  cerereId: number,
  p: { tip: "integral" | "partial"; suma: number },
): Promise<{ success: true; mesaj: string } | { success: false; error: string }> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { success: false, error: om.error };
  if (p?.tip !== "integral" && p?.tip !== "partial") return { success: false, error: "Alege rambursarea integrală sau parțială." };
  const { admin, cerere, raw, eroare } = await cerereaSiConfigul(businessId, orderId, cerereId);
  if (eroare) return { success: false, error: "Nu am putut citi cererea. Reîncearcă." };
  if (!cerere) return { success: false, error: "Cererea nu a fost găsită." };
  const r = await ramburseazaCerereaTbi(admin, cerere, raw, { tip: p.tip, suma: Number(p.suma) });
  revalidatePath(`/dashboard/orders/${orderId}`);
  return r.ok ? { success: true, mesaj: r.mesaj } : { success: false, error: r.mesaj };
}
