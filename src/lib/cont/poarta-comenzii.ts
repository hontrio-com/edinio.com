import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteDomeniulPropriu } from "@/lib/platform-hosts";
import { logError } from "@/lib/error-logger";
import { MESAJ_CONT_NECESAR, curataContClientConfig } from "./config";
import { sesiuneCurenta } from "./sesiune";

/**
 * Poarta contului la plasarea unei comenzi de vitrina, si contul de care se leaga.
 *
 * ⚠⚠ E PE SERVER, IN AMBELE ACTIUNI (`placeOrder`, `placeCartOrder`). Pusa numai
 * in formular s-ar fi ocolit: actiunile sunt endpointuri publice, chemabile cu
 * orice `business_id`, de pe orice gazda.
 *
 * ⚠⚠ SE CHEAMA INAINTE DE ORICE SCRIERE (jurnalul ofertelor, ANAF, numarul
 * comenzii, cuponul, stocul). Pusa dupa, o comanda refuzata ar fi lasat cupon si
 * stoc blocate si gauri in numerotare.
 *
 * ⚠⚠ CADE DESCHIS acolo unde un „nu" ar opri vanzarile fara vina cumparatorului:
 *   - domeniul propriu e masurat CAZUT: vitrina se serveste atunci pe
 *     `www.edinio.com`, unde contul nu poate exista;
 *   - bugetul zilnic de coduri pe email e epuizat: un strain l-ar putea arde de
 *     pe cateva IP-uri si ar fi oprit toate comenzile magazinului.
 * In ambele cazuri comanda merge ca vizitator si se scrie un avertisment.
 *
 * ⚠ Magazinele fara conturi pornite nu platesc nimic: iese pe primul rand, fara
 * cookie si fara nicio cerere noua.
 */

export type RezultatPoarta =
  | { ok: true; contId: string | null }
  | { ok: false; mesaj: string; contNecesar: boolean };

export async function poartaContuluiLaComanda(p: {
  businessId: string;
  config: unknown;
  /**
   * `false` numai la intrebarea formularului (`/api/cont/stare`): acolo nu se
   * plaseaza nimic, iar un avertisment la fiecare deschidere a formularului ar
   * ingropa avertismentele adevarate, cele de la trimitere.
   */
  jurnal?: boolean;
}): Promise<RezultatPoarta> {
  const jurnal = p.jurnal !== false;
  const cfg = curataContClientConfig(p.config);
  if (!cfg.enabled) return { ok: true, contId: null };

  const admin = createAdminClient();
  const { data: biz } = await admin
    .from("businesses")
    .select("custom_domain, custom_domain_healthy")
    .eq("id", p.businessId)
    .maybeSingle();
  const domeniu = biz?.custom_domain ?? null;
  const host = (await headers()).get("host");

  if (!esteDomeniulPropriu(host, domeniu)) {
    if (!cfg.obligatoriu) return { ok: true, contId: null };
    if (biz?.custom_domain_healthy === false) {
      if (jurnal) await logError({
        action: "cont/poarta-comenzii",
        message: "cont obligatoriu, dar domeniul e cazut: comanda merge ca vizitator",
        businessId: p.businessId,
        severity: "warning",
      });
      return { ok: true, contId: null };
    }
    /* Vitrina nu se serveste legitim pe alta gazda cand domeniul e sanatos (307). */
    return {
      ok: false,
      contNecesar: false,
      mesaj: domeniu
        ? `Comenzile se trimit de pe ${domeniu}. Deschide magazinul acolo ca sa comanzi.`
        : "Magazinul primeste comenzi doar de pe domeniul lui.",
    };
  }

  let contId: string | null = null;
  try {
    contId = (await sesiuneCurenta(p.businessId))?.contId ?? null;
  } catch {
    /* ⚠ `sesiuneCurenta` arunca la o pana de baza. Aici nu are voie: formularul ar fi
       spus „nu stim daca s-a inregistrat comanda". */
    if (cfg.obligatoriu) {
      return { ok: false, contNecesar: false, mesaj: "Nu am putut verifica contul. Incearca din nou in cateva momente." };
    }
    return { ok: true, contId: null };
  }

  if (contId || !cfg.obligatoriu) return { ok: true, contId };

  const { data: epuizat } = await admin.rpc("cont_buget_email_epuizat", { p_business: p.businessId });
  if (epuizat === true) {
    if (jurnal) await logError({
      action: "cont/poarta-comenzii",
      message: "cont obligatoriu, dar plafonul zilnic de coduri e epuizat: comanda merge ca vizitator",
      businessId: p.businessId,
      severity: "warning",
    });
    return { ok: true, contId: null };
  }

  return { ok: false, contNecesar: true, mesaj: MESAJ_CONT_NECESAR };
}

/**
 * Leaga de cont comanda tocmai plasata, cand omul era logat.
 *
 * ⚠ DUPA insert si FARA sa poata rupe comanda: comanda exista deja, iar o eroare
 * intoarsa omului ar fi dus la retrimitere si la dubluri. Se scrie un avertisment
 * si atat; la urmatoarea intrare, maturarea o leaga daca emailul se potriveste.
 */
export async function leagaComandaPlasata(businessId: string, contId: string | null, orderId: string): Promise<void> {
  if (!contId) return;
  try {
    const { error } = await createAdminClient().rpc("cont_leaga_comanda_plasata", {
      p_business: businessId,
      p_cont: contId,
      p_order: orderId,
    });
    if (error) throw error;
  } catch (e) {
    await logError({
      action: "cont/leaga-comanda",
      message: `legarea comenzii de cont a esuat: ${String(e)}`,
      businessId,
      details: { orderId },
      severity: "warning",
    });
  }
}
