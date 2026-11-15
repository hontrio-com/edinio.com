"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { logError } from "@/lib/error-logger";
import {
  citesteConfigTbi, esteFormaBannerTbi, FORMA_COD_MAGAZIN, TBI_BANNER_IMPLICIT, TBI_CATEGORIE_IMPLICITA, type TbiConfig,
} from "@/lib/tbi/config";
import {
  aceeasiPereche, amprentaCheii, citesteCheiaPrivata, citesteCheiaPublicaTbi, EroareCheieTbi, type CheieCitita,
} from "@/lib/tbi/cripto";
import { STARI_DESCHISE, type StareTbi } from "@/lib/tbi/stari";
import { anuleazaCerereaTbi } from "@/lib/tbi/server";

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

export type RezultatSalvareTbi =
  | { success: true; amprente: { publica: string | null; privata: string | null } }
  | { success: false; error: string; camp?: keyof TbiConfig };

/**
 * Salveaza configurarea tbi.
 *
 * ⚠ CHEILE SE VERIFICA LA SALVARE, nu la prima comanda. O cheie stricata sau pusa in campul
 * gresit ar fi cazut abia la primul client care alege plata in rate (cheia publica) sau, mai rau,
 * la prima veste de aprobare (cheia privata), cand comanda ar fi ramas neplatita fara ca cineva sa
 * afle. Aici se prind toate trei: cheia care nu se citeste, cheia din alta arhiva, si cele doua
 * chei din ACEEASI pereche (arhiva Comerciant folosita de doua ori).
 *
 * ⚠ Cheile se scriu in forma CANONICA (PEM refacut din cheia citita), nu cum au fost lipite: o
 * cheie lipita pe un singur rand sau cu spatii in plus se citeste azi, iar forma curata nu depinde
 * de toleranta cititorului de maine.
 */
export async function salveazaConfigTbi(businessId: string, input: TbiConfig): Promise<RezultatSalvareTbi> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { success: false, error: om.error };

  /* Secretele vechi se citesc DECRIPTATE (service role), dupa garda de proprietate de mai sus. */
  const admin = createAdminClient();
  const { data: rand, error: eCitire } = await admin
    .from("store_settings").select("tbi_config").eq("business_id", businessId).maybeSingle();
  if (eCitire) return { success: false, error: "Nu am putut citi configurarea existentă. Reîncearcă." };
  const vechi = rand?.tbi_config ?? null;
  const vechea = citesteConfigTbi(vechi);

  const numar = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };
  const curat: TbiConfig = {
    enabled: input.enabled === true,
    sandbox: input.sandbox !== false,
    store_id: String(input.store_id ?? "").trim(),
    username: String(input.username ?? "").trim(),
    /* Taiata: o parola copiata din email vine des cu un spatiu sau un rand nou la coada, iar tbi
       compara exact („Credentials are case sensitive"), deci ar raspunde 401 fara alta explicatie. */
    password: String(input.password ?? "").trim(),
    cheie_publica_tbi: String(input.cheie_publica_tbi ?? "").trim(),
    cheie_privata: String(input.cheie_privata ?? "").trim(),
    suma_minima: numar(input.suma_minima),
    suma_maxima: numar(input.suma_maxima),
    promo: input.promo === true,
    categorie: String(input.categorie ?? "").trim() || TBI_CATEGORIE_IMPLICITA,
    /* O valoare necunoscuta (formular vechi, cerere facuta de mana) cade pe randul discret. */
    banner_produs: esteFormaBannerTbi(input.banner_produs) ? input.banner_produs : TBI_BANNER_IMPLICIT,
  };

  if (curat.store_id && !FORMA_COD_MAGAZIN.test(curat.store_id)) {
    return { success: false, camp: "store_id", error: "Codul magazinului (store_id) are doar litere, cifre, „_”, „-” sau „.”, ca în emailul de la tbi bank (de exemplu magazin_ro)." };
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

  /* Gol = „nu schimba". Cu ce ramane efectiv se verifica perechea si se decide daca e gata. */
  const parolaEfectiva = curat.password || vechea.password;
  const privataEfectiva = curat.cheie_privata || vechea.cheie_privata;

  if (curat.enabled) {
    const lipsa: string[] = [];
    if (!curat.store_id) lipsa.push("codul magazinului");
    if (!curat.username) lipsa.push("utilizatorul");
    if (!parolaEfectiva) lipsa.push("parola");
    if (!curat.cheie_publica_tbi) lipsa.push("cheia publică tbi");
    if (!privataEfectiva) lipsa.push("cheia privată a magazinului");
    if (lipsa.length > 0) {
      return { success: false, error: `Ca să activezi plata în rate lipsește: ${lipsa.join(", ")}.` };
    }
  }

  let publica: CheieCitita | null = null;
  let privata: CheieCitita | null = null;
  try {
    if (curat.cheie_publica_tbi) publica = citesteCheiaPublicaTbi(curat.cheie_publica_tbi);
  } catch (e) {
    if (e instanceof EroareCheieTbi) return { success: false, camp: "cheie_publica_tbi", error: e.message };
    throw e;
  }
  try {
    if (privataEfectiva) privata = citesteCheiaPrivata(privataEfectiva);
  } catch (e) {
    if (e instanceof EroareCheieTbi) return { success: false, camp: "cheie_privata", error: e.message };
    throw e;
  }
  if (publica && privata && aceeasiPereche(publica.cheie, privata.cheie)) {
    return {
      success: false,
      camp: "cheie_publica_tbi",
      error: "Cheia publică tbi și cheia privată sunt din aceeași pereche, deci una e din arhiva greșită. "
        + "Cheia publică tbi este pub.pem din arhiva Chei_SFTL_, iar cheia privată este priv_key.pem din arhiva Chei_Comerciant_.",
    };
  }

  const deScris: TbiConfig = {
    ...curat,
    cheie_publica_tbi: publica ? String(publica.cheie.export({ type: "spki", format: "pem" })) : "",
    /* Numai o cheie NOUA se rescrie; cea veche ramane prin `pastreazaSecretele`. */
    cheie_privata: curat.cheie_privata && privata ? String(privata.cheie.export({ type: "pkcs8", format: "pem" })) : "",
  };
  const finala = pastreazaSecretele("tbi_config", deScris, rand?.tbi_config);

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
  return {
    success: true,
    amprente: {
      publica: publica ? amprentaCheii(publica.cheie) : null,
      privata: privata ? amprentaCheii(privata.cheie) : null,
    },
  };
}

/**
 * Deconectarea: configurarea se sterge cu totul (inclusiv parola si cheia privata). Cererile deja
 * trimise raman in baza, cu istoria lor; o veste care mai vine pentru ele nu se mai poate descifra
 * si se spune in jurnal.
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
  poateAnula: boolean;
  istoric: { la: string; text: string }[];
};

function textIntrare(i: Record<string, unknown>): string {
  const fel = String(i.fel ?? "");
  if (fel === "veste") {
    const stare = String(i.stare ?? "");
    const motiv = typeof i.motiv === "string" && i.motiv ? ` (${i.motiv})` : "";
    const nume: Record<string, string> = {
      aprobata: "tbi bank a aprobat finanțarea", in_analiza: "Cererea e în analiză", respinsa: "tbi bank a respins cererea",
      anulata: "Cererea a fost anulată",
    };
    return `${nume[stare] ?? `Stare: ${stare}`}${motiv}`;
  }
  if (fel === "trimisa") return "Cererea a plecat la tbi bank; clientul a fost trimis pe pagina lor";
  if (fel === "anulare") {
    return i.rezultat === "anulata" ? "Anulare trimisă de magazin, confirmată de tbi bank"
      : `Anulare trimisă de magazin, neconfirmată${typeof i.mesaj === "string" ? `: ${i.mesaj}` : ""}`;
  }
  if (fel === "refuz" || fel === "necunoscut") return "Cererea nu a putut fi trimisă la tbi bank";
  return fel || "Eveniment";
}

/** Cererile unei comenzi, pentru panoul din pagina comenzii. Fara jeton si fara adresa lor. */
export async function cererileTbiAleComenzii(
  businessId: string,
  orderId: string,
): Promise<{ cereri: CerereTbiPanou[] } | { error: string }> {
  const om = await magazinulOmului(businessId);
  if (!om.ok) return { error: om.error };
  const { data, error } = await createAdminClient()
    .from("tbi_cereri")
    .select("id, stare, motiv, suma, mediu, created_at, ultima_veste_la, anulare_ceruta_la, istoric")
    .eq("business_id", businessId).eq("order_id", orderId)
    .order("created_at", { ascending: false }).limit(20);
  if (error) return { error: "Nu am putut citi cererile de finanțare." };
  return {
    cereri: (data ?? []).map((c) => ({
      id: c.id,
      stare: c.stare as StareTbi,
      motiv: c.motiv,
      suma: Number(c.suma),
      mediu: c.mediu === "test" ? "test" : "live",
      creata: c.created_at,
      ultimaVeste: c.ultima_veste_la,
      anulareCeruta: c.anulare_ceruta_la,
      poateAnula: STARI_DESCHISE.includes(c.stare as StareTbi),
      istoric: (Array.isArray(c.istoric) ? (c.istoric as Record<string, unknown>[]) : [])
        .filter((i) => i && typeof i === "object" && typeof i.la === "string")
        .map((i) => ({ la: String(i.la), text: textIntrare(i) }))
        .reverse(),
    })),
  };
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
  const admin = createAdminClient();
  const [{ data: cerere, error: eC }, { data: st, error: eS }] = await Promise.all([
    admin.from("tbi_cereri").select("*").eq("id", cerereId).eq("business_id", businessId).eq("order_id", orderId).maybeSingle(),
    admin.from("store_settings").select("tbi_config").eq("business_id", businessId).maybeSingle(),
  ]);
  if (eC || eS) return { success: false, error: "Nu am putut citi cererea. Reîncearcă." };
  if (!cerere) return { success: false, error: "Cererea nu a fost găsită." };
  const r = await anuleazaCerereaTbi(admin, cerere, st?.tbi_config ?? null);
  revalidatePath(`/dashboard/orders/${orderId}`);
  return r.ok ? { success: true, mesaj: r.mesaj } : { success: false, error: r.mesaj };
}
