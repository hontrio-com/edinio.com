"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randCitit } from "@/lib/supabase/rand-citit";
import type { Json } from "@/types/database.types";
import { poateAprindeConturi, conturilePornite } from "@/lib/cont/origine";

/*
 * ⚠ FIECARE EXPORT DINTR-UN MODUL "use server" E UN ENDPOINT PUBLIC, chemabil cu
 * orice argumente printr-un POST direct. De-aia fiecare isi verifica intai omul,
 * iar ajutoarele pure stau in `src/lib/cont/origine.ts`.
 */

export type ContClientConfig = {
  enabled: boolean;
  buget_email_zilnic: number;
  buget_sms_zilnic: number;
};

export type StareaConturilor = {
  config: ContClientConfig;
  poate: boolean;
  motiv?: string;
  cateConturi: number;
};

async function guard(businessId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nu esti autentificat." };
  const { data, error } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (error) return { error: "Nu am putut verifica magazinul. Incearca din nou." };
  if (!data) return { error: "Magazin negasit." };
  return { ok: true };
}

const IMPLICIT: ContClientConfig = { enabled: false, buget_email_zilnic: 300, buget_sms_zilnic: 100 };

function curata(brut: unknown): ContClientConfig {
  const o = (brut ?? {}) as Record<string, unknown>;
  const numar = (v: unknown, implicit: number) => {
    const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? Math.min(5000, Math.max(0, Math.trunc(n))) : implicit;
  };
  return {
    /* ⚠ Strict `=== true`, ca si in SQL: sirul „true" nu aprinde nimic. Cele doua
       jumatati ale comutatorului trebuie sa inteleaga acelasi lucru, altfel
       sesiunile raman vii in baza si ecranul le arata stinse. */
    enabled: o.enabled === true,
    buget_email_zilnic: numar(o.buget_email_zilnic, IMPLICIT.buget_email_zilnic),
    buget_sms_zilnic: numar(o.buget_sms_zilnic, IMPLICIT.buget_sms_zilnic),
  };
}

export async function incarcaStareaConturilor(businessId: string): Promise<StareaConturilor | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  /* ⚠ Strict: o pana citita ca „gol" i-ar arata comerciantului comutatorul stins
     cand el il aprinsese, iar prima salvare ar fi scris starea gresita inapoi. */
  const rand = randCitit<{ cont_client_config: unknown; businesses: unknown }>(
    "cont-client.stare",
    await admin
      .from("store_settings")
      .select("cont_client_config")
      .eq("business_id", businessId)
      .maybeSingle(),
  );

  const { data: biz } = await admin
    .from("businesses")
    .select("custom_domain, custom_domain_healthy")
    .eq("id", businessId)
    .single();

  /* ⚠ Numarul se ia din baza, cu o functie: tabelele contului stau in `privat`,
     pe care PostgREST nu o expune, deci nu se pot numara dintr-un `select`. */
  const { data: conturi } = await admin.rpc("cont_cate_conturi", { p_business: businessId });

  const v = poateAprindeConturi({
    custom_domain: biz?.custom_domain ?? null,
    custom_domain_healthy: biz?.custom_domain_healthy ?? null,
  });

  return {
    config: curata(rand?.cont_client_config),
    poate: v.poate,
    motiv: v.motiv,
    cateConturi: typeof conturi === "number" ? conturi : 0,
  };
}

export async function salveazaContClientConfig(
  businessId: string,
  input: Partial<ContClientConfig>,
): Promise<{ success: true; config: ContClientConfig } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  const { data: biz } = await admin
    .from("businesses")
    .select("custom_domain, custom_domain_healthy")
    .eq("id", businessId)
    .single();

  const curatat = curata({ ...IMPLICIT, ...input });

  /*
    ⚠⚠ REFUZUL E AICI, NU IN ECRAN. Comutatorul se arata stins si neapasabil cand
    magazinul n-are domeniu propriu sanatos, dar o actiune de server se poate
    chema cu orice, printr-un POST direct. Iar aprinsa fara domeniu, functia ar
    fi facut promisiunea fara sa poata deschide nimic: zona de cont se serveste
    NUMAI pe originea magazinului, fiindca pe `www.edinio.com` toate vitrinele
    impart o origine si acolo un cont nu se poate apara.
  */
  if (curatat.enabled) {
    const v = poateAprindeConturi({
      custom_domain: biz?.custom_domain ?? null,
      custom_domain_healthy: biz?.custom_domain_healthy ?? null,
    });
    if (!v.poate) return { error: v.motiv ?? "Conturile nu se pot aprinde pentru magazinul asta." };
  }

  const { error } = await admin.rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "cont_client_config",
    p_patch: curatat as unknown as Json,
  });
  if (error) return { error: `Nu am putut salva setarea: ${error.message}` };

  /*
    ⚠ `jsonb_merge_config` IESE TACUT cand magazinul n-are rand in
    `store_settings` (`if v_id is null then return;`), iar actiunea ar fi raspuns
    „salvat" fara sa scrie nimic. Masurat pe 23.09.2026: zero magazine sunt in
    situatia asta, dar unul facut maine ar fi fost. Se reciteste si se compara.
  */
  const dupa = randCitit<{ cont_client_config: unknown }>(
    "cont-client.dupa-salvare",
    await admin.from("store_settings").select("cont_client_config").eq("business_id", businessId).maybeSingle(),
  );
  if (conturilePornite(dupa?.cont_client_config) !== curatat.enabled) {
    return { error: "Setarea nu s-a scris. Magazinul nu are inca un rand de setari; reincarca pagina si incearca din nou." };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, config: curatat };
}
