"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  areEtichete,
  eroriPeColet,
  idColete,
  numereColet,
  pdfDinEtichete,
  probaConexiune,
  stariColet,
  tipareste,
  type GlsConfig,
} from "@/lib/gls/client";
import { coletGls, type DateExpediere, type OptiuniServicii } from "@/lib/gls/expediere";
import { dataDinNet } from "@/lib/gls/data-net";
import { cheieEticheta } from "@/lib/gls/eticheta";
import { uploadToR2 } from "@/lib/r2";
import type { Json } from "@/types/database.types";

/**
 * Actiunile GLS (MyGLS).
 *
 * ⚠ Se probeaza DIRECT IN PRODUCTIE, pe contractul unui client real. Fiecare
 * apel care creeaza ceva la GLS trece prin registrul de operatii externe, ca o
 * a doua apasare pe buton sa nu produca al doilea colet facturat.
 */

// ─── Configurare ──────────────────────────────────────────────────────────────

/**
 * Proprietarul magazinului. Se verifica INAINTE de orice citire cu service role.
 *
 * ⚠ Discriminantul e `ok`, nu prezenta lui `error`. Cu o uniune pe „are camp
 * error", TypeScript nu poate ingusta: `error: string` cuprinde si sirul gol,
 * deci `if (ctx.error)` nu exclude ramura de esec, iar `supabase` ramane
 * „possibly undefined" la fiecare folosire.
 */
type Proprietar =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> };

async function proprietar(businessId: string): Promise<Proprietar> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { ok: false, error: "Acces interzis" };

  return { ok: true, supabase };
}

export async function saveGlsConfig(
  businessId: string,
  config: GlsConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /*
   * Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
   * primeste mascate, deci o salvare obisnuita nu trebuie sa le stearga. Fara
   * asta, mascarea ar distruge integrarea la prima apasare pe „Salveaza".
   */
  const { data: vechi } = await supabase
    .from("store_settings").select("gls_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("gls_config", config, vechi?.gls_config);

  const { error } = await supabase.from("store_settings").update({
    gls_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectGls(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    gls_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune pentru panou.
 *
 * ⚠ Face o CITIRE la GLS, nu o emitere. Un „testeaza conexiunea" care creeaza
 * AWB ar factura un colet real la fiecare apasare — iar butonul se apasa de zece
 * ori pana iese configurarea.
 */
export async function testGlsConnectionAction(
  businessId: string,
  config: GlsConfig,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  /* Parola poate veni mascata din formular: se ia cea salvata. */
  const parola = await secretDinConfig(businessId, "gls_config", "password", config.password);
  if (!parola) return { error: "Completeaza parola MyGLS." };
  if (!config.username) return { error: "Completeaza utilizatorul MyGLS." };
  if (!config.client_number) return { error: "Completeaza Client Number-ul din contract." };

  const r = await probaConexiune({ ...config, password: parola });
  return r.ok ? { ok: true } : { error: r.eroare };
}

// ─── Context pentru AWB ───────────────────────────────────────────────────────

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /*
   * ⚠ Configul se citeste cu SERVICE ROLE. Vederea `public.store_settings` nu
   * decripteaza pentru `authenticated`, deci pe clientul utilizatorului parola ar
   * veni `enc.v1.…` si GLS ar respinge orice expediere. Service role ocoleste
   * RLS — de aceea proprietatea magazinului s-a verificat mai sus.
   */
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }, { data: firma }] = await Promise.all([
    admin.from("store_settings").select("gls_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    supabase
      .from("businesses")
      .select("business_name, store_name, store_address, store_city, store_county, address, city, county, phone, email")
      .eq("id", businessId)
      .single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.gls_config as GlsConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_number) {
    return { error: "GLS nu este configurat complet" as const };
  }

  return { supabase, config, order, firma };
}

export type DateAwbGls = {
  destinatar: DateExpediere["destinatar"];
  /*
   * ⚠ EXPEDITORUL NU VINE DIN BROWSER.
   *
   * Se compune pe server, din datele magazinului. Altfel oricine cu o sesiune de
   * comerciant ar putea emite un AWB pe contul GLS al magazinului cu orice
   * adresa de ridicare — inclusiv una straina, pe cheltuiala lui.
   */
  numarColete: number;
  ramburs?: number;
  valoare?: number;
  continut?: string | null;
  servicii?: OptiuniServicii;
};

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

export async function createGlsAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbGls,
): Promise<{ awb: string; etichetaBase64: string | null } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order, firma } = ctx;

  const comanda = order as typeof order & { gls_awb_number?: string | null };
  if (comanda.gls_awb_number) return { error: "AWB GLS a fost deja creat" };

  /*
   * ⚠ Expeditorul se compune AICI, din datele magazinului — nu vine din browser.
   *
   * `store_*` sunt adresa publica a magazinului (de unde se ridica marfa); daca
   * lipsesc, se cade pe adresa firmei. Fara niciuna, GLS ar primi o adresa de
   * ridicare goala si ar refuza expedierea — mai bine o spunem noi, clar.
   */
  const expeditor = {
    nume: firma?.store_name || firma?.business_name || "",
    strada: firma?.store_address || firma?.address || "",
    oras: firma?.store_city || firma?.city || "",
    judet: firma?.store_county || firma?.county || null,
    telefon: firma?.phone ?? null,
    email: firma?.email ?? null,
    tara: "RO",
  };
  if (!expeditor.nume || !expeditor.strada || !expeditor.oras) {
    return {
      error: "Completeaza adresa magazinului (nume, strada, oras) in setari — GLS o cere ca adresa de ridicare.",
    };
  }

  /*
   * Verificarile care NU ating GLS raman inaintea rezervarii: o comanda fara
   * adresa n-are de ce sa ocupe un slot in registru.
   */
  if (!date.destinatar?.oras?.trim() || !date.destinatar?.strada?.trim()) {
    return { error: "Comanda nu are adresa de livrare completa (oras si strada)." };
  }

  const referinta = String(order.order_number ?? orderId).slice(0, 40);

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId,
      fel: "awb",
      furnizor: "gls",
      cheie: cheieOperatie("awb", "gls", orderId),
    },
    async () => {
      const colet = coletGls({
        referinta,
        destinatar: date.destinatar,
        expeditor,
        clientNumber: Number(config.client_number),
        numarColete: date.numarColete,
        ramburs: date.ramburs,
        valoare: date.valoare,
        continut: date.continut,
        servicii: date.servicii,
      });

      const raspuns = await tipareste(config, [colet]);

      /*
       * ⚠ Un raspuns poate avea SI etichete, SI erori. Aici insa e un singur
       * colet: daca a picat, nu exista nimic de salvat, iar mesajul lui GLS e
       * mult mai util decat un „a esuat" generic.
       *
       * E un REFUZ dovedit (validare la ei), deci reincercarea dupa corectarea
       * datelor e libera — exact ce vrea comerciantul sa poata face.
       */
      const erori = eroriPeColet(raspuns);
      if (!areEtichete(raspuns) || numereColet(raspuns).length === 0) {
        throw Object.assign(
          new Error(erori.length ? `GLS a refuzat: ${erori.join("; ")}` : "GLS nu a intors nicio eticheta"),
          { verdictFurnizor: "esuat" as const },
        );
      }

      const numere = numereColet(raspuns);
      /*
       * ⚠ `ParcelId` se pastreaza in registru, nu pe comanda: `DeleteLabels` si
       * `GetPrintedLabels` il cer pe EL, nu numarul de pe eticheta. Fara el nu
       * se poate nici anula AWB-ul, nici retipari eticheta din GLS.
       */
      const ids = idColete(raspuns);
      const pdf = pdfDinEtichete(raspuns);
      return {
        referinta: numere[0],
        detalii: { numere, parcelIds: ids, avertismente: erori },
        valoare: {
          awb: numere[0],
          etichetaBase64: pdf ? pdf.toString("base64") : null,
        },
      };
    },
    /* `apelMyGls` marcheaza singur refuzul, inclusiv 200 cu ErrorCode in corp. */
    verdictFurnizor,
    /* Pe `deja`: mai poarta comanda AWB-ul din registru? Daca nu, e urma unei
       anulari a carei eliberare s-a pierdut — se elibereaza si se reia. */
    async () => !!comanda.gls_awb_number,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  /*
   * Pe `deja`, coletul exista de la o incercare careia i s-a pierdut scrierea.
   * ⚠ Eticheta NU se mai poate recupera din registru — MyGLS o intoarce o
   * singura data, la creare. Comerciantul o retipareste din panou, dar AWB-ul se
   * leaga inapoi de comanda aici, ca sa nu se emita al doilea colet.
   */
  const rezultat =
    r.fel === "facut"
      ? r.valoare
      : { awb: r.referinta ?? "", etichetaBase64: null };

  /*
   * ⚠ ETICHETA SE SALVEAZA ACUM SAU NICIODATA.
   *
   * MyGLS o intoarce o singura data. Se urca in R2 INAINTE de a raspunde
   * browserului, ca sa existe si dupa ce omul inchide pagina.
   *
   * Esecul urcarii NU opreste raspunsul: coletul exista deja la GLS, iar
   * browserul primeste oricum PDF-ul in `etichetaBase64` si il descarca. Ar fi
   * absurd sa intoarcem eroare pentru un fisier de rezerva si sa-l trimitem pe
   * om sa apese din nou — a doua apasare nu mai poate obtine eticheta oricum.
   */
  if (r.fel === "facut" && rezultat.etichetaBase64) {
    try {
      await uploadToR2(
        Buffer.from(rezultat.etichetaBase64, "base64"),
        cheieEticheta(businessId, orderId),
        "application/pdf",
      );
    } catch (e) {
      await logError({
        action: "gls.salveazaEticheta",
        message: `AWB GLS ${rezultat.awb} emis, dar eticheta NU s-a putut salva: ${(e as Error).message}. Comerciantul o are doar din descarcarea automata.`,
        details: { orderId, businessId, awb: rezultat.awb },
        businessId,
        severity: "warning",
      });
    }
  }

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    gls_awb_number: rezultat.awb,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).select("id");

  /*
   * ⚠ Coletul EXISTA la GLS. Un esec de scriere nu mai are voie sa se intoarca
   * la om ca eroare — l-ar trimite sa apese din nou, iar a doua apasare ar
   * factura al doilea colet. Registrul retine deja operatia, deci reincercarea o
   * adopta si reface doar scrierea.
   */
  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "gls.createAwb",
      message: `AWB GLS creat (${rezultat.awb}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, awb: rezultat.awb, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  }

  return rezultat;
}

// ─── Urmarire ─────────────────────────────────────────────────────────────────

export type StareAfisata = {
  cod: string;
  descriere: string;
  data: string | null;
  depozit: string | null;
};

/**
 * Starile unui colet, pentru panou.
 *
 * ⚠ Citire pura: nu creeaza nimic la GLS, deci NU trece prin registru si se
 * poate reincerca oricat.
 *
 * ⚠ `StatusDate` vine in formatul .NET `/Date(1712345678000+0200)/`, nu ISO.
 * Trecut direct intr-un `new Date()`, iese „Invalid Date" si in panou apare gol.
 */
export async function getGlsParcelStatusAction(
  businessId: string,
  orderId: string,
): Promise<{ stari: StareAfisata[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { config, order } = ctx;

  const awb = (order as typeof order & { gls_awb_number?: string | null }).gls_awb_number;
  if (!awb) return { error: "Comanda nu are AWB GLS" };

  try {
    const stari = await stariColet(config, awb);
    return {
      stari: stari.map((s) => ({
        cod: s.StatusCode ?? "",
        descriere: s.StatusDescription ?? "",
        data: dataDinNet(s.StatusDate),
        depozit: s.DepotCity ?? null,
      })),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
