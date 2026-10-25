import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import {
  amprenta, codNou, formaCoduluiValida, formaJetonuluiValida, jetonNou, verificaPkce,
} from "./jetoane";

/**
 * Codurile de autorizare si conexiunile cu Hontrio, in baza.
 *
 * ⚠ TOATE SE CHEAMA CU CLIENTUL DE SISTEM. Tabelele au RLS fara politici, deci clientul
 * comerciantului nu vede nimic in ele. Cine cheama de aici a dovedit deja, separat, ca magazinul e al
 * omului (actiunile de server) sau ca jetonul e bun (rutele API).
 */

type Db = SupabaseClient<Database>;

/** Cat traieste un cod. RFC 6749 (4.1.2) recomanda cel mult 10 minute. */
export const DURATA_COD_MS = 10 * 60_000;

/**
 * Cat se pastreaza un cod dupa ce a expirat.
 *
 * ⚠ NU SE STERGE LA SCHIMB, ci abia peste o zi: randul folosit e chiar dovada ca o a doua venire a
 * codului e o refolosire, si nu un cod inventat. Vezi `schimbaCodul`.
 */
const PASTRARE_COD_MS = 24 * 3600_000;

/** Cel mult o scriere a lui `ultima_folosire` la atatea minute. Vezi `marcheazaFolosirea`. */
const PAS_MARCAJ_MS = 5 * 60_000;

export type MotivRevocare = "comerciant" | "hontrio" | "inlocuita" | "cod_refolosit";

export async function creeazaCod(
  admin: Db,
  date: { businessId: string; userId: string; redirectUri: string; codeChallenge: string },
  acum: number = Date.now(),
): Promise<string> {
  /*
   * Curatenia codurilor vechi, la fiecare cod nou. Volumul e cat al conectarilor, deci mic; un cron
   * separat ar fi fost inca un lucru de supravegheat. O curatenie cazuta nu opreste conectarea.
   */
  try {
    await admin.from("hontrio_coduri").delete().lt("expira_la", new Date(acum - PASTRARE_COD_MS).toISOString());
  } catch {
    /* informativ */
  }

  const cod = codNou();
  const { error } = await admin.from("hontrio_coduri").insert({
    amprenta: amprenta(cod),
    business_id: date.businessId,
    aprobat_de: date.userId,
    redirect_uri: date.redirectUri,
    code_challenge: date.codeChallenge,
    creat_la: new Date(acum).toISOString(),
    expira_la: new Date(acum + DURATA_COD_MS).toISOString(),
  });
  if (error) throw error;
  return cod;
}

export type RezultatSchimb =
  | { fel: "ok"; jeton: string; businessId: string; conexiuneId: string }
  /*
   * ⚠ UN SINGUR FEL DE „NU", oricare ar fi motivul: cod necunoscut, folosit, expirat, alta adresa de
   * intoarcere, verificator gresit. RFC 6749 le cere pe toate ca `invalid_grant`, iar un raspuns care
   * le-ar deosebi ar spune cuiva care incearca coduri cat de aproape a ajuns.
   */
  | { fel: "refuzat" };

/**
 * Schimbul codului pe un jeton (RFC 6749, 4.1.3 si RFC 7636, 4.6).
 *
 * ═══ ⚠ CODUL SE REVENDICA INAINTEA ORICAREI VERIFICARI ═══
 *
 * `update ... where folosit_la is null` e atomic: din doua cereri simultane cu acelasi cod, exact
 * una primeste randul. Verificat intai si marcat abia la sfarsit, codul ar fi putut fi schimbat de
 * doua ori, pe doua jetoane. Un cod revendicat si apoi refuzat (adresa gresita, verificator gresit)
 * ramane ars, si asa trebuie: cine l-a trimis gresit nu primeste a doua incercare pe el.
 *
 * ═══ ⚠ A DOUA VENIRE A UNUI COD REVOCA JETONUL DAT PE EL ═══
 *
 * RFC 6749 (10.5): codul folosit de doua ori inseamna ca cineva l-a prins pe drum. Nu stim care din
 * cele doua cereri a fost cea buna, deci se stinge conexiunea nascuta din el, iar comerciantul o
 * reface. Tot de aici se acopera si cazul nevinovat: Hontrio n-a primit raspunsul la primul schimb
 * (o pana de retea) si reincearca. Jetonul dat atunci n-a ajuns la nimeni, deci stingerea lui e
 * exact ce trebuie.
 */
export async function schimbaCodul(
  admin: Db,
  date: { cod: string; redirectUri: string; verificator: string },
  acum: number = Date.now(),
): Promise<RezultatSchimb> {
  if (!formaCoduluiValida(date.cod)) return { fel: "refuzat" };
  const amprentaCod = amprenta(date.cod);
  const acumIso = new Date(acum).toISOString();

  const { data: revendicate, error } = await admin
    .from("hontrio_coduri")
    .update({ folosit_la: acumIso })
    .eq("amprenta", amprentaCod)
    .is("folosit_la", null)
    .select("business_id, aprobat_de, redirect_uri, code_challenge, expira_la");
  if (error) throw error;
  const cod = revendicate?.[0];

  if (!cod) {
    const { data: vechi, error: eVechi } = await admin
      .from("hontrio_coduri").select("business_id, conexiune_id").eq("amprenta", amprentaCod).maybeSingle();
    if (eVechi) throw eVechi;
    if (vechi) {
      if (vechi.conexiune_id) await revocaConexiunea(admin, vechi.conexiune_id, "cod_refolosit", acum);
      await logError({
        action: "hontrio/token",
        message: "cod de autorizare folosit a doua oara; conexiunea nascuta din el a fost revocata",
        details: { conexiune: vechi.conexiune_id }, businessId: vechi.business_id, severity: "warning",
      });
    }
    return { fel: "refuzat" };
  }

  if (Date.parse(cod.expira_la) <= acum) return { fel: "refuzat" };
  /* RFC 6749 (4.1.3): aceeasi adresa ca la autorizare, caracter cu caracter. */
  if (cod.redirect_uri !== date.redirectUri) return { fel: "refuzat" };
  if (!verificaPkce(date.verificator, cod.code_challenge)) return { fel: "refuzat" };

  const jeton = jetonNou();
  const { data: conexiune, error: eIns } = await admin
    .from("hontrio_conexiuni")
    .insert({ business_id: cod.business_id, amprenta: amprenta(jeton), aprobat_de: cod.aprobat_de, creat_la: acumIso })
    .select("id")
    .single();
  if (eIns) throw eIns;

  const { error: eLeg } = await admin
    .from("hontrio_coduri").update({ conexiune_id: conexiune.id }).eq("amprenta", amprentaCod);
  if (eLeg) throw eLeg;

  /*
   * ⚠ CELELALTE CONEXIUNI SE STING ABIA ACUM, dupa ce cea noua exista. Un magazin are o singura
   * legatura cu Hontrio: reconectarea (alt cont Hontrio, sau acelasi cu jetonul pierdut) o inlocuieste
   * pe cea veche. Stinsa mai devreme, o pana intre cei doi pasi ar fi lasat magazinul fara nicio
   * legatura si fara ca Hontrio sa fi primit vreun jeton.
   */
  const { error: eStinge } = await admin
    .from("hontrio_conexiuni")
    .update({ revocat_la: acumIso, motiv_revocare: "inlocuita" })
    .eq("business_id", cod.business_id)
    .is("revocat_la", null)
    .neq("id", conexiune.id);
  if (eStinge) throw eStinge;

  return { fel: "ok", jeton, businessId: cod.business_id, conexiuneId: conexiune.id };
}

export interface ConexiuneGasita {
  id: string;
  businessId: string;
  ultimaFolosire: string | null;
}

/**
 * Conexiunea activa a jetonului, sau `null`.
 *
 * ⚠ O CITIRE CAZUTA ARUNCA, nu intoarce `null`: apelantul raspunde 503 la eroare si 401 la lipsa.
 * Un 401 dat la o pana de o clipa i-ar spune lui Hontrio ca legatura a fost rupta, iar el i-ar cere
 * comerciantului sa se reconecteze degeaba.
 */
export async function conexiuneaJetonului(admin: Db, jeton: string): Promise<ConexiuneGasita | null> {
  if (!formaJetonuluiValida(jeton)) return null;
  const { data, error } = await admin
    .from("hontrio_conexiuni")
    .select("id, business_id, ultima_folosire")
    .eq("amprenta", amprenta(jeton))
    .is("revocat_la", null)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, businessId: data.business_id, ultimaFolosire: data.ultima_folosire } : null;
}

/**
 * Cand a citit Hontrio ultima oara: singurul semn, in panoul Edinio, ca legatura traieste.
 *
 * ⚠ CEL MULT O SCRIERE LA CINCI MINUTE. O sincronizare inseamna zeci de pagini citite la rand, iar o
 * scriere la fiecare ar fi fost trafic de baza pentru o informatie care se citeste la minut.
 * ⚠ NU ARUNCA: un marcaj nescris nu e motiv sa nu plece raspunsul.
 */
export async function marcheazaFolosirea(admin: Db, c: ConexiuneGasita, acum: number = Date.now()): Promise<void> {
  if (c.ultimaFolosire && acum - Date.parse(c.ultimaFolosire) < PAS_MARCAJ_MS) return;
  try {
    await admin.from("hontrio_conexiuni").update({ ultima_folosire: new Date(acum).toISOString() }).eq("id", c.id);
  } catch {
    /* informativ */
  }
}

export async function revocaConexiunea(admin: Db, id: string, motiv: MotivRevocare, acum: number = Date.now()): Promise<void> {
  const { error } = await admin
    .from("hontrio_conexiuni")
    .update({ revocat_la: new Date(acum).toISOString(), motiv_revocare: motiv })
    .eq("id", id)
    .is("revocat_la", null);
  if (error) throw error;
}

/** Deconectarea din panoul Edinio: tot ce e activ pe magazin. */
export async function revocaConexiunileMagazinului(
  admin: Db, businessId: string, motiv: MotivRevocare, acum: number = Date.now(),
): Promise<void> {
  const { error } = await admin
    .from("hontrio_conexiuni")
    .update({ revocat_la: new Date(acum).toISOString(), motiv_revocare: motiv })
    .eq("business_id", businessId)
    .is("revocat_la", null);
  if (error) throw error;
}

export interface StareConexiune {
  creataLa: string;
  ultimaFolosire: string | null;
}

/** Legatura activa a magazinului, pentru panou. Arunca la o citire cazuta, din motivul de mai sus. */
export async function conexiuneaActiva(admin: Db, businessId: string): Promise<StareConexiune | null> {
  const { data, error } = await admin
    .from("hontrio_conexiuni")
    .select("creat_la, ultima_folosire")
    .eq("business_id", businessId)
    .is("revocat_la", null)
    .order("creat_la", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { creataLa: data.creat_la, ultimaFolosire: data.ultima_folosire } : null;
}
