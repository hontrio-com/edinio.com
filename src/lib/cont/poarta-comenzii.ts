import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteDomeniulPropriu } from "@/lib/platform-hosts";
import { logError } from "@/lib/error-logger";
import { MESAJ_CONT_NECESAR, curataContClientConfig } from "./config";
import { sesiuneCurenta } from "./sesiune";
import { COOKIE_CONT } from "./jeton";

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
 *   - magazinul nu mai are domeniu propriu (deconectat), cu setarea ramasa pe
 *     obligatoriu: acelasi lucru, vitrina merge pe `www.edinio.com`;
 *   - randul magazinului nu se poate citi (o pana a bazei);
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
  const cfg = curataContClientConfig(p.config);
  if (!cfg.enabled) return { ok: true, contId: null };

  /*
    ⚠ Cont OPTIONAL si niciun cookie de cont: nu e nimic de cerut si nimic de
    legat, deci nicio cerere in plus pe drumul comenzii.
  */
  if (!cfg.obligatoriu && !(await cookies()).get(COOKIE_CONT)?.value) {
    return { ok: true, contId: null };
  }

  const avertizeaza = async (message: string) => {
    if (p.jurnal === false) return;
    await logError({ action: "cont/poarta-comenzii", message, businessId: p.businessId, severity: "warning" });
  };

  const admin = createAdminClient();
  const { data: biz, error: eroareMagazin } = await admin
    .from("businesses")
    .select("custom_domain, custom_domain_healthy")
    .eq("id", p.businessId)
    .maybeSingle();
  if (eroareMagazin) {
    /* ⚠ Fara randul magazinului nu se poate judeca originea; o pana a bazei nu
       are voie sa opreasca vanzarile. */
    await avertizeaza(`domeniul magazinului nu s-a putut citi, comanda merge ca vizitator: ${eroareMagazin.message}`);
    return { ok: true, contId: null };
  }
  const domeniu = biz?.custom_domain ?? null;
  const host = (await headers()).get("host");

  if (!esteDomeniulPropriu(host, domeniu)) {
    if (!cfg.obligatoriu) return { ok: true, contId: null };
    /*
      ⚠⚠ Fara domeniu (deconectat din Setari, ori setarea scrisa direct) sau cu el
      masurat cazut: vitrina se serveste pe `www.edinio.com`, unde contul nu exista
      si formularul nu arata niciun pas de intrare. Un refuz aici ar fi oprit TOATE
      vanzarile magazinului; comanda merge ca vizitator si se scrie un avertisment.
    */
    if (!domeniu || biz?.custom_domain_healthy === false) {
      await avertizeaza(!domeniu
        ? "cont obligatoriu, dar magazinul nu are domeniu propriu: comanda merge ca vizitator"
        : "cont obligatoriu, dar domeniul e cazut: comanda merge ca vizitator");
      return { ok: true, contId: null };
    }
    /* Domeniul e sanatos: vitrina nu se serveste legitim pe alta gazda (307). */
    return {
      ok: false,
      contNecesar: false,
      mesaj: `Comenzile se trimit de pe ${domeniu}. Deschide magazinul acolo ca sa comanzi.`,
    };
  }

  let contId: string | null = null;
  try {
    contId = (await sesiuneCurenta(p.businessId))?.contId ?? null;
  } catch (e) {
    /* ⚠ `sesiuneCurenta` arunca la o pana de baza. Aici nu are voie: formularul ar fi
       spus „nu stim daca s-a inregistrat comanda". */
    await avertizeaza(`sesiunea contului nu s-a putut verifica: ${String(e)}`);
    if (cfg.obligatoriu) {
      return { ok: false, contNecesar: false, mesaj: "Nu am putut verifica contul. Incearca din nou in cateva momente." };
    }
    return { ok: true, contId: null };
  }

  if (contId || !cfg.obligatoriu) return { ok: true, contId };

  const { data: epuizat, error: eroareBuget } = await admin.rpc("cont_buget_email_epuizat", { p_business: p.businessId });
  if (eroareBuget) await avertizeaza(`plafonul de coduri nu s-a putut citi: ${eroareBuget.message}`);
  if (epuizat === true) {
    await avertizeaza("cont obligatoriu, dar plafonul zilnic de coduri e epuizat: comanda merge ca vizitator");
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

/**
 * Adresa confirmata a contului, pentru o comanda plasata din cont FARA email in
 * formular (magazinul poate ascunde campul). ⚠ Fara ea, omul logat nu primea nici
 * confirmarea comenzii, nici emailurile de stare. `null` la orice problema: comanda
 * merge mai departe asa cum a venit.
 */
export async function emailulContului(businessId: string, contId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().rpc("cont_parola_contului", { p_business: businessId, p_cont: contId });
    const r = Array.isArray(data) ? data[0] : data;
    return typeof r?.email === "string" && r.email.trim() ? r.email.trim() : null;
  } catch {
    return null;
  }
}
