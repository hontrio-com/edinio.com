"use server";

import { revalidatePath } from "next/cache";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createWebhook, deleteWebhook, refundOrder, revolutReady, toMinor, type RevolutConfig, type RevolutConfigInput } from "@/lib/revolut";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { cheieOperatie, cuRegistru } from "@/lib/operatii/registru";
import { eroareRefuz, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
}

/**
 * Save the merchant's Revolut config. The client only sends the editable fields
 * (`enabled`, `sandbox`, `secret_key`, `title`) — the server-only `webhook_id` /
 * `signing_secret` are read from the existing stored config so they never travel to
 * the browser. On (re)connect we auto-register a signed webhook once and store its
 * secret; if the key or environment changes, the stale webhook is dropped and a
 * fresh one is registered. Webhook registration doubles as a secret-key check.
 */
export async function saveRevolutConfig(
  businessId: string,
  input: RevolutConfigInput,
): Promise<{ success: boolean; error?: string; warning?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  // Cheia veche se citeste cu SERVICE ROLE: cu ea se sterge webhook-ul invechit
  // DIRECT la Revolut, iar clientul utilizatorului nu mai primeste `secret_key`
  // decriptat, ci `enc.v1.…` — stergerea ar esua tacit si magazinul ar ramane cu
  // webhook-uri orfane pana la plafonul de 10. Proprietarul e verificat mai sus.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings")
    .select("revolut_config")
    .eq("business_id", businessId)
    .single();
  const existing = (settings?.revolut_config ?? {}) as Partial<RevolutConfig>;

  // Trim: pasted keys often carry stray whitespace / a trailing newline, which
  // silently breaks the Bearer auth header at checkout.
  const cheieDinFormular = input.secret_key.trim();
  const clean: RevolutConfig = {
    enabled: input.enabled,
    sandbox: input.sandbox,
    secret_key: cheieDinFormular,
    title: input.title.trim() || "Revolut",
    webhook_id: existing.webhook_id,
    signing_secret: existing.signing_secret,
  };

  /*
   * Cheia cu care se VORBESTE cu Revolut in salvarea asta.
   *
   * Formularul primeste `secret_key` MASCAT (vezi lib/integrari/secrete.ts), deci
   * la orice salvare obisnuita — un comutator, alt titlu — campul soseste GOL.
   * „Gol" inseamna „nu o schimba", nu „alta cheie", si tocmai asta se citea gresit
   * mai jos: `keyChanged` iesea adevarat la fiecare salvare, webhook-ul VIU era
   * sters la Revolut, iar reinregistrarea nu mai pornea (cere o cheie negoala).
   * Magazinul ramanea cu `signing_secret` pentru un webhook care nu mai exista,
   * adica fara confirmari de plata, si nimic nu semnala nimic.
   */
  const cheieEfectiva = cheieDinFormular || (existing.secret_key ?? "");

  // The old webhook was registered under the previous key/environment — if either
  // changed it is stale, so remove it (best effort, with the OLD credentials) and
  // force a fresh registration below.
  const keyChanged = !!cheieDinFormular && !!existing.secret_key && existing.secret_key !== cheieDinFormular;
  const envChanged = existing.sandbox !== undefined && existing.sandbox !== clean.sandbox;
  if ((keyChanged || envChanged) && existing.webhook_id && existing.secret_key) {
    await deleteWebhook(
      { secret_key: existing.secret_key, sandbox: existing.sandbox ?? clean.sandbox },
      existing.webhook_id,
    ).catch(() => { /* stale webhook, ignore */ });
    clean.webhook_id = undefined;
    clean.signing_secret = undefined;
  }

  // Register the signed webhook once, only when enabled and not yet registered.
  // Se inregistreaza cu `cheieEfectiva`: la o schimbare de mediu fara retastarea
  // cheii, `clean.secret_key` e gol si vechea conditie sarea peste reinregistrare
  // exact dupa ce stersese webhook-ul de mai sus.
  let warning: string | undefined;
  if (clean.enabled && cheieEfectiva && !clean.signing_secret) {
    const url = `${appUrl()}/api/revolut/webhook?businessId=${encodeURIComponent(businessId)}`;
    const wh = await createWebhook({ ...clean, secret_key: cheieEfectiva }, url, ["ORDER_COMPLETED"]);
    if (wh.ok && wh.data?.signing_secret) {
      clean.webhook_id = wh.data.id;
      clean.signing_secret = wh.data.signing_secret;
    } else {
      warning =
        wh.error ||
        "Cheia a fost salvata, dar nu am putut inregistra webhook-ul Revolut. Verifica cheia secreta (are nevoie de permisiuni de webhook).";
    }
  }

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  //
  // Citirea a stat DINADINS pe clientul utilizatorului pana la 15.08.2026, cu un
  // argument bun: aici valoarea nu pleaca nicaieri, doar se scrie inapoi, si asa
  // nu scoteam o parola in clar degeaba. A fost mutata pe service role fiindca
  // `pastreazaSecretele` cere asta prin contract (secrete.ts) si fiindca fisierul
  // asta e chiar exemplul de ce conteaza: `saveRevolutConfig` CHEAMA Revolut dupa
  // salvare (`createWebhook` cu `secret_key`), si o face dintr-o A DOUA citire, pe
  // `existing`. Doua citiri cu doua reguli diferite in aceeasi functie e exact
  // capcana in care a cazut restul platformei. Expunerea in plus e in acelasi
  // proces care oricum decripteaza `existing` cu cateva linii mai sus.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("revolut_config").eq("business_id", businessId).maybeSingle();
  const cleanFinal = pastreazaSecretele("revolut_config", clean, vechi?.revolut_config);

  const { error } = await supabase
    .from("store_settings")
    .update({ revolut_config: cleanFinal as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };

  revalidatePath("/dashboard/features/revolut");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true, warning };
}

export async function disconnectRevolut(
  businessId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  // SERVICE ROLE: cheia pleaca spre Revolut ca sa stearga webhook-ul, iar clientul
  // utilizatorului nu mai primeste `secret_key` decriptat, ci `enc.v1.…`.
  // Proprietarul e verificat mai sus, deci ocolirea RLS nu deschide alt magazin.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings")
    .select("revolut_config")
    .eq("business_id", businessId)
    .single();
  const existing = settings?.revolut_config as RevolutConfig | null;

  // Remove the registered webhook so we don't leave orphans / hit the 10-webhook cap.
  if (existing?.webhook_id && existing.secret_key) {
    await deleteWebhook(existing, existing.webhook_id).catch(() => { /* ignore */ });
  }

  const { error } = await supabase
    .from("store_settings")
    .update({ revolut_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };

  revalidatePath("/dashboard/features/revolut");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

/**
 * ═══ RAMBURSAREA BANILOR PRIN REVOLUT (17.09.2026) ═══
 *
 * ⚠ `refundOrder` exista scrisa in `lib/revolut.ts` si NU O CHEMA NIMENI. A treia oara acelasi
 * tipar (iPay, Klarna, Revolut): o unealta despre care nimeni n-ar fi aflat ca e stricata.
 *
 * ⚠⚠ ACTIUNE SEPARATA, nu legata de selectorul de status: acolo „rambursat" e o eticheta pusa dupa
 * o rambursare facuta de mana in portalul lor. Legata, apasarea obisnuita ar trimite banii a doua oara.
 *
 * ⚠ SI STATUSUL NU SE SCRIE DE AICI: adevarul despre bani il da `refunded_amount` de pe comanda lor,
 * iar cronul il citeste si trece comanda prin ACEEASI regula ca o rambursare facuta in portal. Un
 * singur drum catre „rambursat".
 */
export async function rambourseazaPrinRevolut(
  orderId: string,
): Promise<{ success: boolean; error?: string; mesaj?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, order_number, payment_status, payment_method, total, revolut_order_id")
    .eq("id", orderId)
    .single();
  if (!order) return { success: false, error: "Comanda nu exista" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { success: false, error: "Acces interzis" };

  if (order.payment_method !== "revolut") {
    return { success: false, error: "Comanda nu a fost platita prin Revolut." };
  }
  if (order.payment_status === "refunded") {
    return { success: false, error: "Comanda e deja marcata rambursata." };
  }
  if (order.payment_status !== "paid") {
    return { success: false, error: "Nu se poate rambursa o comanda care nu e platita." };
  }
  const revolutOrderId = (order.revolut_order_id as string | null)?.trim();
  if (!revolutOrderId) {
    return { success: false, error: "Comanda nu are un identificator de comanda Revolut, deci rambursarea trebuie facuta din portalul Revolut." };
  }

  const suma = Number(order.total);
  if (!Number.isFinite(suma) || suma <= 0) {
    return { success: false, error: "Totalul comenzii nu e o suma valida." };
  }

  const { data: st } = await admin
    .from("store_settings").select("revolut_config").eq("business_id", order.business_id).maybeSingle();
  const cfg = st?.revolut_config as RevolutConfig | null;
  if (!revolutReady(cfg)) return { success: false, error: "Revolut nu e configurat pentru acest magazin." };

  const cheie = await secretDinConfig(order.business_id, "revolut_config", "secret_key");
  const cheamaCu: RevolutConfig = { ...cfg!, ...(cheie ? { secret_key: cheie } : {}) };

  const r = await cuRegistru(
    admin,
    {
      businessId: order.business_id,
      orderId,
      fel: "rambursare",
      furnizor: "revolut",
      cheie: cheieOperatie("rambursare", "revolut", orderId),
    },
    async () => {
      const rod = await refundOrder(cheamaCu, revolutOrderId, toMinor(suma));
      /* ⚠ Tacerea nu e incuviintare: un raspuns care nu e `ok` opreste totul. */
      if (!rod.ok) throw eroareRefuz(rod.error || "Revolut a refuzat rambursarea.");
      return { referinta: revolutOrderId, detalii: { suma } as never, valoare: rod };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { success: false, error: r.mesaj };
  if (r.fel === "deja") {
    return { success: true, mesaj: "Rambursarea fusese deja trimisa la Revolut pentru aceasta comanda." };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  return {
    success: true,
    mesaj: `Rambursarea de ${suma.toFixed(2)} lei a fost trimisa la Revolut. `
      + "Comanda se marcheaza rambursata dupa ce ei confirma, in cel mult 15 minute.",
  };
}
