"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randCitit } from "@/lib/supabase/rand-citit";
import type { Json } from "@/types/database.types";
import { poateAprindeConturi } from "@/lib/cont/origine";
import {
  BUGET_MINIM_OBLIGATORIU,
  curataContClientConfig,
  type ContClientConfig,
} from "@/lib/cont/config";

/*
 * ⚠ FIECARE EXPORT DINTR-UN MODUL "use server" E UN ENDPOINT PUBLIC, chemabil cu
 * orice argumente printr-un POST direct. De-aia fiecare isi verifica intai omul,
 * iar regulile si datele stau in `src/lib/cont/config.ts` si `origine.ts`.
 */

export type StareaConturilor = {
  config: ContClientConfig;
  /** Se pot porni conturile (domeniu propriu sanatos)? */
  poate: boolean;
  motiv?: string;
  /** Domeniul propriu, pentru previzualizare si texte. */
  domeniu: string | null;
  cateConturi: number;
  /**
   * Intrari reusite in cont in ultimele 30 de zile. Contul OBLIGATORIU se poate
   * porni numai dupa macar una: ea dovedeste ca domeniul si emailul cu cod merg.
   */
  intrariRecente: number;
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

async function citesteConfig(businessId: string, eticheta: string): Promise<ContClientConfig> {
  /* ⚠ Strict: o pana citita ca „gol" i-ar arata comerciantului comutatorul stins
     cand el il aprinsese, iar prima salvare ar fi scris starea gresita inapoi. */
  const rand = randCitit<{ cont_client_config: unknown }>(
    eticheta,
    await createAdminClient()
      .from("store_settings")
      .select("cont_client_config")
      .eq("business_id", businessId)
      .maybeSingle(),
  );
  return curataContClientConfig(rand?.cont_client_config);
}

async function intrariRecente(businessId: string): Promise<number> {
  const { data } = await createAdminClient().rpc("cont_intrari_recente", { p_business: businessId });
  return typeof data === "number" ? data : 0;
}

export async function incarcaStareaConturilor(businessId: string): Promise<StareaConturilor | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  const config = await citesteConfig(businessId, "cont-client.stare");

  const [{ data: biz }, { data: conturi }, intrari] = await Promise.all([
    admin.from("businesses").select("custom_domain, custom_domain_healthy").eq("id", businessId).single(),
    /* ⚠ Numarul se ia din baza, cu o functie: tabelele contului stau in `privat`,
       pe care PostgREST nu o expune, deci nu se pot numara dintr-un `select`. */
    admin.rpc("cont_cate_conturi", { p_business: businessId }),
    intrariRecente(businessId),
  ]);

  const v = poateAprindeConturi({
    custom_domain: biz?.custom_domain ?? null,
    custom_domain_healthy: biz?.custom_domain_healthy ?? null,
  });

  return {
    config,
    poate: v.poate,
    motiv: v.motiv,
    domeniu: biz?.custom_domain ?? null,
    cateConturi: typeof conturi === "number" ? conturi : 0,
    intrariRecente: intrari,
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

  /*
    ⚠⚠ SE PORNESTE DE LA VALOAREA SALVATA, nu de la implicite. Prima scriere
    completa cu IMPLICITELE, deci un apel care trimitea o singura cheie (un POST
    direct, sau un ecran viitor) readucea la implicit bugetele, butonul si textele.
  */
  const curent = await citesteConfig(businessId, "cont-client.inainte-de-salvare");
  const curatat = curataContClientConfig({ ...curent, ...(input ?? {}) });

  /*
    ⚠⚠ REFUZURILE SUNT AICI, NU IN ECRAN. Comutatoarele se arata stinse si
    neapasabile, dar o actiune de server se poate chema cu orice.

    1. Conturile cer domeniu propriu sanatos: zona de cont se serveste NUMAI pe
       originea magazinului, fiindca pe `www.edinio.com` toate vitrinele impart o
       origine si acolo un cont nu se poate apara.
  */
  if (curatat.enabled) {
    const v = poateAprindeConturi({
      custom_domain: biz?.custom_domain ?? null,
      custom_domain_healthy: biz?.custom_domain_healthy ?? null,
    });
    if (!v.poate) return { error: v.motiv ?? "Conturile nu se pot porni pentru magazinul asta." };
  }

  /*
    2. Contul OBLIGATORIU face ca fiecare vanzare sa atarne de emailul cu cod. Se
       porneste numai dupa ce cineva a intrat macar o data in cont pe magazinul
       asta in ultimele 30 de zile (dovada ca domeniul si emailul merg), si numai
       cu un plafon zilnic de coduri care sa nu opreasca vanzarile dupa cateva
       comenzi.
  */
  if (curatat.obligatoriu) {
    if (!curent.obligatoriu && (await intrariRecente(businessId)) === 0) {
      return {
        error: `Intra o data in contul de client pe ${biz?.custom_domain ?? "domeniul magazinului"} (cu codul primit pe email), ca sa fim siguri ca emailurile ajung. Apoi poti face contul obligatoriu.`,
      };
    }
    if (curatat.buget_email_zilnic < BUGET_MINIM_OBLIGATORIU) {
      return { error: `Cu contul obligatoriu, plafonul zilnic de coduri trebuie sa fie de cel putin ${BUGET_MINIM_OBLIGATORIU}.` };
    }
  }

  const { error } = await admin.rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "cont_client_config",
    p_patch: curatat as unknown as Json,
  });
  if (error) return { error: `Nu am putut salva setarea: ${error.message}` };

  /*
    ⚠ SE RECITESTE SI SE COMPARA TOT OBIECTUL, nu doar comutatorul.
    `jsonb_merge_config` iese TACUT cand magazinul n-are rand in `store_settings`,
    iar o salvare de design facuta in aceeasi clipa trece prin declansatorul care
    rescrie toate coloanele si poate readuce valoarea veche. Amandoua ar fi
    raspuns „salvat" fara sa fie.
  */
  const dupa = await citesteConfig(businessId, "cont-client.dupa-salvare");
  if (JSON.stringify(dupa) !== JSON.stringify(curatat)) {
    return { error: "Setarea nu s-a scris intreaga (poate a salvat altcineva in acelasi timp). Reincarca pagina si incearca din nou." };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, config: curatat };
}
