"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { puneLaCoada } from "@/lib/edinio-marketing/server/coada-conversii";
import { destinatiiActive } from "@/lib/edinio-marketing/server/destinatii-active";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { aduSiVerificaPlata } from "@/lib/edinio-marketing/server/plata-stripe";
import { NON_STORE_SEGMENTS } from "@/proxy";
import { consimtamantulCererii, martoriiCererii } from "@/lib/edinio-marketing/server/consimtamant-server";

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
 * aici — vine din proxy, unde traiesc oricum rutele de aplicatie.
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
  // invoice.payment_succeeded), iar trialul gratuit se acorda mai jos. Cand
  // parametrul exista, oricine putea trimite `plan: "ultra"` si primea planul
  // cel mai scump fara sa plateasca.
  //
  /*
    ATENTIE: ID-UL SESIUNII STRIPE, cand omul vine de la o plata. NU e un
    "am platit" pe cuvantul clientului: serverul il duce la Stripe si intreaba
    acolo. Un id inventat da "n-a platit", adica se cade pe drumul gratuit —
    partea sigura.
  */
  sesiuneStripe?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };

  const slug = normalizeazaSlug(data.slug);
  const motiv = motivSlugRespins(slug);
  if (motiv) return { error: motiv };

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .insert({
      user_id: user.id,
      type: "ministore",
      slug,
      business_name: data.business_name,
      tagline: data.tagline || null,
      phone: data.phone,
      whatsapp: data.whatsapp || null,
      email: data.email || null,
      address: data.address || null,
      city: data.city || null,
      county: data.county || null,
      store_address: data.address || null,
      store_city: data.city || null,
      store_county: data.county || null,
      logo_url: data.logo_url || null,
      cover_url: data.cover_url || null,
      primary_color: data.primary_color,
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

  // Marcheaza onboarding-ul incheiat si acorda trialul gratuit.
  //
  // Coloanele `onboarding_completed`, `plan` si `plan_expires_at` sunt
  // PRIVILEGIATE: clientul utilizatorului nu mai are voie sa le scrie (vezi
  // migrations/2026-08-04-blocare-escaladare-rol.sql), asa ca trecem prin
  // service role.
  //
  /*
    ===========================================================================
    ATENTIE: TRIALUL SE ACORDA ATOMIC, NU DUPA O CITIRE DE MAI DEVREME
    ===========================================================================

    Forma dinainte citea profilul, hotara "n-are plan, deci ii dau trial", si abia
    apoi scria. Intre citire si scriere incape webhook-ul Stripe — care se aprinde
    exact atunci, fiindca plata tocmai s-a incheiat.

    CE STRICA, si nu e despre masurare:

        T0  citim: plan=free, expira=null  ->  hotaram sa dam trial
        T1  webhook-ul scrie: plan=premium, expira=peste un an
        T2  scriem noi ce hotarasem la T0: plan=free, expira=peste 15 zile

    Abonamentul PLATIT al omului e suprascris cu un trial. Nu cade nimic si nu se
    vede nimic: omul plateste si primeste cincisprezece zile gratuite.

    SI COMENTARIUL DE AICI SPUNEA CA E APARAT. Scria ca "conditia pe
    `plan_expires_at is null` face operatia idempotenta". Conditia aia nu exista in
    scriere — era doar `.eq("id", user.id)`. O promisiune, nu o paza.

    Acum sunt DOUA scrieri, fiecare cu treaba ei:
      1. `onboarding_completed` — neconditionat, e adevarat oricum s-ar aseza planul;
      2. trialul — conditionat CHIAR IN SCRIERE, deci baza hotaraste, nu noi.

    SI DACA OMUL A PLATIT, NICI NU SE INCEARCA. Poarta de mai jos intreaba Stripe
    direct: fara ea, cand scrierea noastra ajunge prima, trialul se acorda si se
    RAPORTEAZA `trial_start` pentru cineva care tocmai a cumparat un abonament —
    iar Meta si TikTok vad si "a inceput un trial", si "s-a abonat", pentru aceeasi
    fapta.
  */
  const adminDb = createAdminClient();

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

  /*
    SE INTREABA STRIPE, nu clientul. `data.sesiuneStripe` e doar un id; daca e
    inventat sau al altcuiva, raspunsul e "n-a platit" si se cade pe drumul
    gratuit — adica partea sigura.
  */
  const plata = data.sesiuneStripe
    ? await aduSiVerificaPlata(data.sesiuneStripe, user.id)
    : ({ ok: false, motiv: "fara-sesiune" } as const);

  /*
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ „NU STIU" NU E „N-A PLATIT" — SI PANA AZI ERAU ACELASI LUCRU
    ═══════════════════════════════════════════════════════════════════════════

    `aduSiVerificaPlata` intoarce `ok: false` pentru trei lucruri deosebite:
      - `fara-sesiune`  — n-a fost nicio plata, ori Stripe zice ca sesiunea nu
                          exista. STIM ca n-a platit.
      - `neplatita` / `alt-om` — Stripe a raspuns limpede. STIM.
      - `indisponibil`  — Stripe n-a raspuns. NU STIM NIMIC.

    Ramura de mai jos le trata la fel. Deci: omul chiar plateste, se intoarce cu
    un `cs_...` bun, si exact atunci Stripe are o pana. Noi citim „ok: false",
    acordam trialul si RAPORTAM `trial_start`. Webhook-ul aseaza pe urma planul
    platit, deci omul primeste ce a cumparat — dar la Meta si TikTok raman doua
    fapte pentru una: „a inceput un trial" si „s-a abonat".

    ⚠ SI DE CE TOTUSI SE ACORDA RANDUL. Ar fi fost mai simplu sa taiem de tot cand
    nu stim. Numai ca webhook-ul scrie planul NECONDITIONAT (`webhook/route.ts`),
    deci un trial asezat acum nu poate rapi un abonament — il suprascrie el cand
    ajunge. In schimb, netaiat, cineva care N-A platit si a nimerit pana ar ramane
    fara niciun plan. Deci se taie RAPORTAREA, nu dreptul.

    ⚠ ACEEASI FILOZOFIE CA LA CONSIMTAMANT: cand nu stim, nu trimitem. Acolo se
    numeste fail-closed si e scrisa in `coada-conversii.ts`; aici e acelasi lucru.
  */
  const stiuCaNuAPlatit = !plata.ok && plata.motiv !== "indisponibil";

  let trialAcordat = false;
  if (!plata.ok) {
    /*
      CONDITIA STA IN SCRIERE. Daca intre timp cineva — webhook-ul — a asezat un
      plan, `plan_expires_at` nu mai e gol si scrierea asta nu atinge niciun rand.
      `.select()` ne spune CATE randuri s-au schimbat: aia e singura dovada ca noi
      am acordat trialul, si numai pe ea se raporteaza `trial_start`.

      SI CONDITIA PE `plan` E SCRISA CU `or`, nu cu `in`: pe o coloana care poate
      fi NULL, `in` sare peste gol — vezi lectia din filtrele pe liste.
    */
    const { data: randuri, error: eroareTrial } = await adminDb
      .from("users_profile")
      .update({
        plan: "free",
        plan_expires_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      } as never)
      .eq("id", user.id)
      .is("plan_expires_at", null)
      .or("plan.is.null,plan.eq.free")
      .select("id");

    if (eroareTrial) {
      await logError({
        action: "createBusiness.trial",
        message: eroareTrial.message,
        details: { code: eroareTrial.code },
        userId: user.id,
        severity: "critical",
      });
    }
    trialAcordat = (randuri?.length ?? 0) > 0;
  }

  /*
    ⚠ DOUA CONDITII, SI AMANDOUA TREBUIE. Randul s-a schimbat CHIAR (deci noi
    l-am acordat, nu altcineva), SI stim ca n-a fost nicio plata. A doua fara
    prima raporteaza un trial pe care baza l-a refuzat; prima fara a doua
    raporteaza un trial pentru cineva care tocmai a cumparat.
  */
  const trialRaportat = trialAcordat && stiuCaNuAPlatit;

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
    ═══ ⚠ TRIALUL SE RAPORTEAZA DE UNDE SE ACORDA ═══

    Browserul trage `trial_start` din `onboarding/plan/page.tsx`, cu `event_id`-ul
    egal cu id-ul magazinului — si tot acela e folosit aici, deci furnizorii unesc
    cele doua drumuri si numara UN trial, nu doua.

    ⚠ SI DE CE E LEGAT DE CE S-A SCRIS CHIAR, nu de ce a ales omul in pagina.
    Pagina hotaraste dupa `sessionStorage`; serverul stie cate randuri a schimbat.
    Cand cele doua se despart — plata a intrat intre timp, sau n-a intrat —
    adevarul e al bazei, fiindca dupa ea se si factureaza.

    ⚠ SI NU DUPA O CITIRE DE MAI DEVREME. Pana azi conditia era `!areDejaPlan`,
    adica ce se citise INAINTE de scriere. Intre cele doua incape webhook-ul, si
    atunci se raporta un trial pentru cineva care tocmai platise.

    ⚠ `purchase` NU se pune aici. Suma adevarata o stie doar webhook-ul Stripe, din
    cat s-a incasat; citita din alta parte ar fi o presupunere raportata ca venit.
  */
  if (trialRaportat) {
    const anteturi = await headers();
    /* ⚠ Hotararea se citeste O data: si amprenta, si poarta atarna de ea. */
    const consim = await consimtamantulCererii();
    await puneLaCoada(
      { name: "trial_start", plan_id: "free", event_id: business.id },
      {
        ctx: {
          ip: anteturi.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: anteturi.get("user-agent"),
        },
        amprentaOmului: consim?.vid ?? user.id,
        /* ⚠ Vezi nota din `auth.actions.ts`: `_fbc` leaga trialul de reclama platita. */
        martori: await martoriiCererii(),
      },
      destinatiiActive(),
      { fel: "cookie", stare: consim },
    );
  }

  revalidatePath("/dashboard", "layout");
  /*
    ⚠ `trialRaportat` PLEACA SI CATRE BROWSER, si nu ca sa fie frumos.

    Browserul isi tragea `trial_start` cand `sessionStorage` spunea „free" — adica
    dupa ce ALESESE omul, nu dupa ce s-a intamplat. Cele doua se despart usor:
    planul ales e „free" si totusi trialul nu s-a acordat (avea deja unul), sau
    plata tocmai a intrat. Atunci pleca o conversie din browser fara perechea ei
    de pe server — si Meta o numara singura, fiindca n-are cu ce s-o uneasca.

    Adevarul e unul singur, si e al bazei. Amandoua capetele il citesc de aici, cu
    acelasi `event_id` (id-ul magazinului), deci raman o singura conversie.
  */
  return { success: true, businessId: business.id, slug: business.slug, trialRaportat };
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
