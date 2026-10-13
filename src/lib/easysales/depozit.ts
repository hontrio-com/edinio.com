import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { logError } from "@/lib/error-logger";
import type { EasySalesConfig } from "./tipuri";

/**
 * Tot ce atinge baza pentru configurarea easySales, in spatele unei singure interfete.
 *
 * ═══ DE CE O INTERFATA, SI NU `admin` PASAT PESTE TOT ═══
 *
 * Fluxul tokenului are o regula care nu se poate dovedi citind codul: doua fire concurente fac
 * EXACT o cerere la `/oauth/token`. Ea sta pe zavorul din baza (`easysales_ia_emiterea`). Cu o
 * interfata, proba pune in loc un depozit in memorie cu ACEEASI semantica (versiune, zavor cu
 * termen, scriere numai cu zavorul propriu) si numara cererile la serverul fals. Cu un client
 * Supabase falsificat lant cu lant, proba ar fi dovedit cablajul falsului, nu regula.
 *
 * ⚠ IMPLEMENTAREA ADEVARATA E O TRADUCERE SUBTIRE a RPC-urilor din migratia fundatiei. Regulile
 * stau in SQL, unde le-au probat cele 13 probe de pe DEMO; aici nu se ia nicio hotarare.
 */
export interface DepozitEasySales {
  /** ⚠ Arunca `EroareCitireBaza` cand citirea pica: o citire cazuta nu are voie sa arate ca un config gol. */
  citesteConfig(businessId: string): Promise<EasySalesConfig>;
  /** Imbinare atomica in Postgres (`jsonb_merge_config`): `null` scris anume pe un secret il sterge. */
  peticConfig(businessId: string, petic: Partial<EasySalesConfig>): Promise<boolean>;
  /** Id-ul zavorului, sau `null` cand altcineva emite ori versiunea s-a miscat. */
  iaEmiterea(businessId: string, versiuneVazuta: number, leaseSec: number): Promise<string | null>;
  scrieTokenul(businessId: string, zavor: string, petic: Partial<EasySalesConfig>): Promise<boolean>;
  elibereazaEmiterea(businessId: string, zavor: string): Promise<void>;
  scrieJurnal(rand: RandJurnal): Promise<void>;
}

/** Un rand din `easysales_request_log`. Fara corpuri, antete sau adrese intregi. */
export interface RandJurnal {
  business_id: string;
  corelatie: string | null;
  metoda: string;
  cale: string;
  status: number;
  verdict: string;
  durata_ms: number | null;
  rata_ramasa: number | null;
  cod: string | null;
  mesaj: string | null;
}

type Admin = SupabaseClient<Database>;

/**
 * Citirea configurarii, cu service role (vederea decripteaza numai pentru el).
 *
 * ⚠ `maybeSingle`: un magazin fara rand de setari e o stare legitima, si atunci `{}` e chiar
 * raspunsul. Ce nu e legitim e sa nu poti citi si sa spui „gol": apelantii ar scrie apoi peste
 * acreditari (incidentul Trendyol din 24.08.2026).
 */
export async function citesteConfigEasySales(admin: Admin, businessId: string): Promise<EasySalesConfig> {
  const { data, error } = await admin
    .from("store_settings").select("easysales_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.config", error.message);
  const brut = (data as { easysales_config?: unknown } | null)?.easysales_config;
  return brut && typeof brut === "object" && !Array.isArray(brut) ? (brut as EasySalesConfig) : {};
}

export function depozitDinSupabase(admin: Admin): DepozitEasySales {
  return {
    citesteConfig: (businessId) => citesteConfigEasySales(admin, businessId),

    async peticConfig(businessId, petic) {
      if (Object.keys(petic).length === 0) return true;
      const { error } = await admin.rpc("jsonb_merge_config", {
        p_business_id: businessId,
        p_column: "easysales_config",
        p_patch: petic as unknown as Json,
      });
      if (error) {
        await logError({
          action: "easysales.config",
          message: `peticul de configurare nu s-a scris: ${error.message}`,
          details: { campuri: Object.keys(petic) },
          businessId, severity: "warning",
        });
        return false;
      }
      return true;
    },

    async iaEmiterea(businessId, versiuneVazuta, leaseSec) {
      const { data, error } = await admin.rpc("easysales_ia_emiterea", {
        p_business: businessId, p_versiune_vazuta: versiuneVazuta, p_lease_sec: leaseSec,
      });
      if (error) {
        /* ⚠ Fara zavor nu se emite. Un zavor necitit inseamna „nu stiu cine emite", iar o emitere
           pe ghicite ar putea revoca tokenul altui fir. */
        await logError({
          action: "easysales.token", severity: "warning", businessId,
          message: `zavorul emiterii nu s-a putut lua: ${error.message}`,
        });
        return null;
      }
      return typeof data === "string" && data ? data : null;
    },

    async scrieTokenul(businessId, zavor, petic) {
      const { data, error } = await admin.rpc("easysales_scrie_tokenul", {
        p_business: businessId, p_zavor: zavor, p_patch: petic as unknown as Json,
      });
      if (error) {
        await logError({
          action: "easysales.token", severity: "critical", businessId,
          message: `tokenul emis nu s-a putut scrie: ${error.message}`,
        });
        return false;
      }
      return data === true;
    },

    async elibereazaEmiterea(businessId, zavor) {
      const { error } = await admin.rpc("easysales_elibereaza_emiterea", { p_business: businessId, p_zavor: zavor });
      if (error) {
        /* Zavorul expira oricum in 30 de secunde; eliberarea doar scurteaza asteptarea altora. */
        await logError({
          action: "easysales.token", severity: "warning", businessId,
          message: `zavorul emiterii nu s-a putut elibera: ${error.message}`,
        });
      }
    },

    async scrieJurnal(rand) {
      try {
        const { error } = await admin.from("easysales_request_log").insert(rand);
        if (error) throw new Error(error.message);
      } catch (e) {
        /* ⚠ Jurnalul e o urma, nu o parte din lucrare: o cerere nu cade fiindca n-am putut scrie
           randul ei. Dar nici `catch {}` gol: tacerea e chiar defectul pe care il vanam. */
        await logError({
          action: "easysales.jurnal", severity: "warning", businessId: rand.business_id,
          message: `randul de jurnal nu s-a putut scrie: ${e instanceof Error ? e.message : String(e)}`,
          details: { cale: rand.cale, verdict: rand.verdict },
        });
      }
    },
  };
}
