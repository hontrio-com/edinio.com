"use server";

import { revalidatePath } from "next/cache";
import { areCuiDeFacturare, type FirmaFacturare } from "@/lib/billing/firma-abonament";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { aduSiVerificaPlata } from "@/lib/edinio-marketing/server/plata-stripe";
import { NON_STORE_SEGMENTS } from "@/lib/segmente-rezervate";
import { culoareValida, stilDupaId } from "@/lib/onboarding/aspect";
import { designInitial } from "@/lib/onboarding/design-initial";
import type { DesignContext } from "@/lib/storefront/design/types";

/*
 * Adresa magazinului se valideaza AICI, pe server, nu doar in formular.
 *
 * Pana pe 05.08.2026 singura validare (zod + slugify) traia in componenta de
 * onboarding, adica in browser, iar apelantul citeste slug-ul din
 * sessionStorage — deci nici nu era nevoie de un apel brut de actiune, era
 * destul devtools. Migratia din 04.08 a inchis doar UPDATE-ul pe `slug`;
 * INSERT-ul a ramas deschis.
 *
 * Ce scapa apoi din aplicatie: rutele de intoarcere de la plata construiesc
 * `new URL(`/${slug}/confirm...`, baseUrl)`. Un slug care incepe cu „/" face din
 * asta „//evil.com/confirm..." — adica schimba GAZDA, nu calea. Rezultatul e ca
 * https://www.edinio.com/api/stripe/return?... raspunde 307 catre alt domeniu:
 * redirectare deschisa, gazduita pe domeniul platformei, buna de phishing cu
 * marca Edinio. Cine scoate verificarea de mai jos redeschide exact asta.
 *
 * Regula e mai stricta decat cea din formular (care accepta si „---"): minim 3,
 * maxim 50, fara liniuta la capete. Lista de segmente rezervate NU se copiaza
 * aici — vine din `src/lib/segmente-rezervate.ts`, aceeasi lista pe care o
 * citeste si proxy-ul (si pe care o verifica o proba impotriva rutelor de pe disc).
 *
 * Liniutele de la capete se TAIE, nu se refuza. `slugify` le taie deja, dar
 * formularul scurteaza rezultatul la 50 de caractere DUPA aceea, si taietura
 * poate cadea exact pe o liniuta. Un refuz acolo ar pica in ultimul pas al
 * onboarding-ului, pe un slug pe care omul nu l-a scris el.
 */
const SLUG_MAGAZIN = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

function normalizeazaSlug(brut: string): string {
  return (brut ?? "").trim().replace(/^-+|-+$/g, "");
}

function motivSlugRespins(slug: string): string | null {
  if (!SLUG_MAGAZIN.test(slug)) {
    return "Adresa magazinului trebuie sa aiba intre 3 si 50 de caractere, doar litere mici, cifre si liniute, si sa nu inceapa sau sa se termine cu liniuta.";
  }
  if (NON_STORE_SEGMENTS.has(slug)) {
    return "Aceasta adresa este rezervata de platforma. Alege alta.";
  }
  return null;
}

/**
 * Contul are un abonament PLATIT activ (`basic`/`premium`/`ultra` cu data in viitor).
 * `free` si `trial` nu sunt abonament. NU se exporta: intr-un fisier "use server",
 * orice export e o actiune pe care o poate chema oricine.
 */
async function areAbonamentPlatitActiv(db: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data } = await db.from("users_profile").select("plan, plan_expires_at").eq("id", userId).maybeSingle();
  const profil = data as { plan?: string | null; plan_expires_at?: string | null } | null;
  if (!profil?.plan || profil.plan === "free" || profil.plan === "trial" || !profil.plan_expires_at) return false;
  return new Date(profil.plan_expires_at).getTime() > Date.now();
}

export async function createBusiness(data: {
  business_name: string;
  tagline?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  county?: string;
  slug: string;
  logo_url?: string;
  cover_url?: string;
  primary_color: string;
  // NU exista `plan` aici, intentionat. Planul e decis EXCLUSIV pe server:
  // planurile platite vin din webhook-ul Stripe (checkout.session.completed /
  // invoice.payment_succeeded); fara plata confirmata nu se creeaza magazinul. Cand
  // parametrul exista, oricine putea trimite `plan: "ultra"` si primea planul
  // cel mai scump fara sa plateasca.
  //
  /*
    ATENTIE: ID-UL SESIUNII STRIPE, cand omul vine de la o plata. NU e un
    "am platit" pe cuvantul clientului: serverul il duce la Stripe si intreaba
    acolo. Un id inventat da "n-a platit", adica magazinul nu se creeaza —
    partea sigura.
  */
  sesiuneStripe?: string;
  /**
   * Stilul ales la pasul „Aspectul" (`lib/onboarding/aspect.ts`). Venit din
   * browser, deci trece prin `stilDupaId`: un id necunoscut da stilul clasic.
   */
  stil?: string;
  /**
   * Firma verificata in ANAF de `/api/stripe/checkout`, cand omul a platit din
   * onboarding: acolo magazinul nu exista inca, deci datele n-aveau unde sa se
   * scrie. `business_name` de mai sus ramane numele afisat (`store_name`).
   */
  firma?: FirmaFacturare;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  const slug = normalizeazaSlug(data.slug);
  // Venita de la client, deci se primeste doar cu un CUI care trece cifra de control.
  const firma = data.firma && areCuiDeFacturare(data.firma.cui) && data.firma.business_name?.trim()
    ? data.firma
    : null;
  const motiv = motivSlugRespins(slug);
  if (motiv) return { error: motiv };

  /*
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ FARA PLATA, FARA MAGAZIN (12.10.2026: testarea gratuita a fost scoasa)
    ═══════════════════════════════════════════════════════════════════════════

    Pana atunci, cine nu venea de la o plata confirmata primea 15 zile gratuite
    (plan `free` + `plan_expires_at`). Acum magazinul se creeaza NUMAI cand:
      - Stripe confirma plata sesiunii cu care s-a intors omul, sau
      - contul are deja un abonament platit activ (webhook-ul a ajuns primul,
        ori l-a asezat un administrator).

    ⚠ DE CE INAINTE DE INSERT, nu dupa. Un magazin creat si apoi lasat fara plan
    ar fi ramas ACTIV PE VECI: `getInactiveReason` socoteste `free` fara data de
    expirare drept cont activ (asa sunt conturile care nu si-au terminat
    onboarding-ul). Deci intrebarea se pune inainte sa existe ceva de lasat in urma.

    ⚠ „NU STIU" NU E „N-A PLATIT". La `indisponibil` (Stripe n-a raspuns) se
    refuza la fel, dar cu alt motiv: pagina reincearca singura, fiindca intre timp
    webhook-ul aseaza de obicei planul, iar a doua cerere trece prin ramura
    „abonament activ". Omul nu e trimis la o plata noua: ar fi platit de doua ori.

    SE INTREABA STRIPE, nu clientul: `data.sesiuneStripe` e doar un id. Un id
    inventat sau al altcuiva da „n-a platit".

    ⚠ PENTRU READUCEREA TESTARII: vezi istoricul fisierului inainte de 12.10.2026
    (scrierea atomica a trialului, conditionata in UPDATE, si `trial_start`).
  */
  const adminDb = createAdminClient();
  const plata = data.sesiuneStripe
    ? await aduSiVerificaPlata(data.sesiuneStripe, user.id)
    : ({ ok: false, motiv: "fara-sesiune" } as const);

  if (!plata.ok && !(await areAbonamentPlatitActiv(adminDb, user.id))) {
    if (plata.motiv === "indisponibil") {
      return {
        error: "Nu am putut confirma plata cu Stripe chiar acum. Datele magazinului sunt păstrate; reîncearcă în câteva secunde.",
        plataNeconfirmata: true as const,
      };
    }
    return { error: "Ca să creezi magazinul, alege un plan și finalizează plata." };
  }

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .insert({
      user_id: user.id,
      type: "ministore",
      slug,
      business_name: firma?.business_name || data.business_name,
      ...(firma ? {
        store_name: data.business_name,
        cui: firma.cui,
        reg_com: firma.reg_com || null,
      } : {}),
      tagline: data.tagline || null,
      phone: data.phone,
      whatsapp: data.whatsapp || null,
      email: data.email || null,
      address: data.address || firma?.address || null,
      city: data.city || firma?.city || null,
      county: data.county || firma?.county || null,
      store_address: data.address || null,
      store_city: data.city || null,
      store_county: data.county || null,
      logo_url: data.logo_url || null,
      cover_url: data.cover_url || null,
      /* Text venit din browser, pus in CSS-ul magazinului: numai `#rrggbb`. */
      primary_color: culoareValida(data.primary_color),
    })
    .select()
    .single();

  if (bizError) {
    if (bizError.code === "23505") {
      return { error: "Aceasta adresa de magazin este deja folosita. Alege alta." };
    }
    await logError({ action: "createBusiness", message: bizError.message, details: { code: bizError.code, hint: bizError.hint, slug }, userId: user.id, severity: "critical" });
    return { error: "Nu am putut crea magazinul. Incearca din nou." };
  }

  // Create store settings
  await supabase.from("store_settings").insert({ business_id: business.id });

  /*
    ⚠ ASPECTUL ALES LA INSCRIERE (27.09.2026): antetul si subsolul stilului, plus
    hero-ul cu numele magazinului, aprins. Fara el, un magazin nou n-avea hero
    deloc (se aprinde doar cu bannere sau cu slogan, iar la inscriere nu exista
    niciunul), deci pagina incepea direct cu o grila goala.

    Se scrie un design INTREG, construit din cel clasic: `parseStoreDesign` il
    impaca la fiecare citire cu datele magazinului, deci bannerele adaugate mai
    tarziu schimba singure varianta hero-ului (n-are `variantOverride`), iar
    sectiunile aprinse din „Editeaza magazinul" apar in continuare.

    ⚠ NU OPRESTE CREAREA: magazinul exista deja. O scriere cazuta lasa designul
    clasic, adica exact ce primea oricine pana azi.
  */
  {
    const stil = stilDupaId(data.stil);
    const ctx: DesignContext = {
      primaryColor: business.primary_color ?? culoareValida(data.primary_color),
      pageContent: {},
      features: {},
      coverUrl: null,
      tagline: null,
    };
    const design = designInitial(stil.id, ctx);
    const { error: designError } = await supabase
      .from("store_settings")
      .update({ storefront_design: design as never, storefront_design_pub_at: new Date().toISOString() } as never)
      .eq("business_id", business.id);
    if (designError) {
      await logError({ action: "createBusiness.design", message: designError.message, details: { code: designError.code, stil: stil.id }, userId: user.id });
    }
  }

  // Marcheaza onboarding-ul incheiat.
  //
  // `onboarding_completed` e o coloana PRIVILEGIATA: clientul utilizatorului nu
  // mai are voie s-o scrie (vezi migrations/2026-08-04-blocare-escaladare-rol.sql),
  // asa ca trecem prin service role. Planul NU se atinge aici: l-a scris webhook-ul
  // Stripe (sau exista deja), iar fara el n-am fi ajuns pana aici (poarta de sus).
  const { error: profileError } = await adminDb
    .from("users_profile")
    .update({ onboarding_completed: true } as never)
    .eq("id", user.id);

  if (profileError) {
    await logError({
      action: "createBusiness.profileUpdate",
      message: profileError.message,
      details: { code: profileError.code },
      userId: user.id,
      severity: "critical",
    });
  }

  // Send welcome email + notify admin (non-blocking)
  if (user.email) {
    const { data: profile } = await supabase
      .from("users_profile")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const ownerName = profile?.full_name ?? "";
    sendWelcomeEmail(user.email, {
      name: ownerName,
      business_name: data.business_name,
      slug: business.slug,
    }).catch(() => {});
    import("@/lib/email").then(({ sendAdminNewStoreNotification }) => {
      sendAdminNewStoreNotification({
        ownerName,
        ownerEmail: user.email!,
        businessName: data.business_name,
        slug: business.slug,
      }).catch(() => {});
    }).catch(() => {});
  }

  /*
    ⚠ `purchase` NU se pune aici. Suma adevarata o stie doar webhook-ul Stripe, din
    cat s-a incasat; citita din alta parte ar fi o presupunere raportata ca venit.
  */
  revalidatePath("/dashboard", "layout");
  return { success: true, businessId: business.id, slug: business.slug };
}

export async function updateBusiness(
  businessId: string,
  data: Partial<{
    business_name: string;
    store_name: string | null;
    tagline: string | null;
    description: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    county: string | null;
    store_address: string | null;
    store_city: string | null;
    store_county: string | null;
    lat: number | null;
    lng: number | null;
    logo_url: string | null;
    cover_url: string | null;
    primary_color: string;
    social: Record<string, string>;
    gallery: string[];
    features: Record<string, boolean>;
    is_published: boolean;
  }>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  // Lista alba, aplicata la RULARE. Tipul `Partial<{...}>` de mai sus dispare la
  // compilare, iar `data` vine INTREG de la client (e Server Action), deci pana
  // acum orice cheie in plus ajungea direct in UPDATE: `suspended_until: null`
  // anula suspendarea/perioada de gratie, `custom_domain` ocolea validarea si
  // sincronizarea cu Vercel din /api/domains/connect, `slug` permitea mutarea
  // magazinului pe alta adresa. `user_id` era deja blocat de RLS (USING tine loc
  // de WITH CHECK), dar il tinem afara oricum.
  const COLOANE_PERMISE = new Set([
    "business_name", "store_name", "tagline", "description",
    "phone", "whatsapp", "email", "website",
    "address", "city", "county",
    "store_address", "store_city", "store_county",
    "lat", "lng",
    "logo_url", "cover_url", "primary_color",
    "social", "gallery", "features", "is_published",
  ]);

  const payload: Record<string, unknown> = {};
  for (const [cheie, valoare] of Object.entries(data ?? {})) {
    if (COLOANE_PERMISE.has(cheie)) payload[cheie] = valoare;
  }

  if (Object.keys(payload).length === 0) {
    return { error: "Nu exista nimic de salvat." };
  }

  const { error } = await supabase
    .from("businesses")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(payload as any)
    .eq("id", businessId)
    .eq("user_id", user.id);

  if (error) {
    logError({ action: "updateBusiness", message: error.message, details: { code: error.code, hint: error.hint, businessId }, userId: user.id });
    return { error: "Nu am putut salva modificarile." };
  }

  // Note: replaced/removed logo/cover/gallery images are intentionally NOT deleted
  // from R2 here — the Media Library is the single deletion authority. They stay in
  // the library for reuse and are removed only via deleteMedia.

  revalidatePath("/dashboard/editor");
  revalidatePath("/dashboard/features");
  revalidatePath(`/[slug]`, "page");
  return { success: true };
}

export async function getUserBusiness() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data ?? null;
}

export async function checkSlugAvailability(slug: string): Promise<boolean> {
  /*
   * Aceleasi reguli ca la INSERT, si pe aceeasi valoare NORMALIZATA.
   *
   * Pasul 1 al onboarding-ului e ULTIMUL loc in care omul mai poate schimba
   * adresa: dupa el vine alegerea planului, iar pentru planurile platite
   * `createBusiness` ruleaza abia la INTOARCEREA de la Stripe, cu abonamentul
   * deja incasat (onboarding/plan/page.tsx: `finalizeBusiness` din ramura
   * `?success=1`). Orice „liber" mincinos aici se plateste acolo: toast de
   * eroare, niciun magazin, si nicio cale inapoi in afara de a relua plata.
   *
   * Doua feluri de minciuna, amandoua aparute odata cu verificarea de pe server:
   *   - segment rezervat („demo", „start", „contact") — oracolul zicea „liber",
   *     serverul refuza;
   *   - forma nenormalizata — „florarie-" chiar nu exista in tabel, dar se
   *     insereaza „florarie", care poate fi luata, deci 23505 dupa plata.
   *     (Liniuta terminala nu e ipotetica: formularul taie la 50 de caractere
   *     DUPA slugify, iar taietura poate cadea pe o liniuta.)
   *
   * Raspunsul ramane boolean, deci un slug rezervat apare in interfata drept
   * „deja folosita". Nu e formularea ideala, dar e adevarata — adresa e luata,
   * de platforma — si opreste omul INAINTE de plata, ceea ce conteaza.
   */
  const normalizat = normalizeazaSlug(slug);
  if (motivSlugRespins(normalizat)) return false;

  // Use admin client to bypass RLS — unpublished businesses are hidden from anon
  // but the UNIQUE constraint still blocks the INSERT
  const admin = createAdminClient();
  const { data } = await admin
    .from("businesses")
    .select("id")
    .eq("slug", normalizat)
    .maybeSingle();
  return !data;
}
