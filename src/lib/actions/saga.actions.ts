"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import type { BulkResult } from "@/lib/actions/bulk-orders.actions";
import {
  NUME_CLIENT_GENERIC, cheieValida, codFiscalCurat, configCuImplicite, type SagaConfig,
} from "@/lib/saga/config";
import { testeazaConexiunea, type SesiuneSaga } from "@/lib/saga/client";
import {
  ASTEPTARE_MANUALA_MS, MESAJ_OCUPAT, contextulMagazinului, cuLacat, exportaComanda, probaCuCheiaSalvata,
  scrieCheiaRotita,
} from "@/lib/saga/server";
import { motivOprireLot } from "@/lib/saga/reguli";

/*
 * SAGA Web: configurarea si trimiterea in contabilitate a documentelor deja emise.
 * Fisa integrarii: `docs/facturare/SAGA.md`.
 *
 * ⚠ „use server": FIECARE export de aici e un capat public. Se exporta doar actiunile; fiecare isi
 * dovedeste singura proprietarul. Logica (lacatul, cheia rotita, registrul, jurnalul) sta in
 * `src/lib/saga/server.ts`, care NU e „use server".
 */

/* ═══════════════════════════════════════════════════════════════════════════
   AJUTOARE (neexportate)
   ═══════════════════════════════════════════════════════════════════════════ */

async function proprietar(businessId: string): Promise<{ ok: true; userId: string } | { error: string }> {
  if (!businessId) return { error: "Magazin negăsit." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat." };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!biz) return { error: "Magazin negăsit." };
  return { ok: true, userId: user.id };
}

const PLAFON_TEXT = 120;
const text = (v: unknown, max = PLAFON_TEXT) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Salveaza si ACTIVEAZA integrarea (`enabled: true`), cu proba de conexiune INAINTE de scriere.
 *
 * ⚠ TOTUL SUB LACATUL MAGAZINULUI. Configurarea veche se citeste, se imbina si se scrie inapoi
 * intreaga; daca intre citire si scriere un apel SAGA (cronul) ar roti cheia, scrierea noastra ar
 * pune la loc cheia VECHE, iar urmatorul apel ar fi blocat. Sub lacat, nicio rotatie nu se poate
 * strecura intre ele.
 *
 * ⚠ PROBA SE FACE NUMAI CAND E CE PROBA: cheie noua, cod fiscal schimbat, sau integrarea nu era
 * activa. O schimbare de optiuni pe o integrare activa nu atinge SAGA. Altfel o cheie moarta l-ar
 * fi impiedicat pe comerciant chiar sa OPREASCA trimiterea automata.
 *
 * ⚠ PROBA POATE ROTI CHEIA. Cheia noua pleaca odata cu salvarea; iar daca proba s-a facut cu cheia
 * deja salvata, se scrie pe loc (`scrieCheiaRotita`), oricum s-ar termina salvarea.
 */
export async function saveSagaConfig(
  businessId: string,
  input: SagaConfig,
): Promise<{ success: true; avertisment?: string } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;

  const codFiscal = codFiscalCurat(input?.cod_fiscal);
  if (!codFiscal) return { error: "Codul fiscal al firmei nu arată bine. Scrie-l exact ca în SAGA, de exemplu RO12345678 sau 12345678." };
  const cheieTastata = typeof input?.api_key === "string" ? input.api_key.trim() : "";
  if (cheieTastata && !cheieValida(cheieTastata)) {
    return { error: "Cheia de acces nu arată bine (fără spații, așa cum o copiezi din SAGA Web)." };
  }

  const curat: SagaConfig = {
    enabled: true,
    cod_fiscal: codFiscal,
    api_key: cheieTastata,
    import_automat: input?.import_automat === true,
    trimite_stornari: input?.trimite_stornari !== false,
    trimitere_automata: input?.trimitere_automata === true,
    trimitere_automata_de_la: null,
    clienti_pf: input?.clienti_pf === "generic" ? "generic" : "fiecare",
    nume_client_generic: text(input?.nume_client_generic) || NUME_CLIENT_GENERIC,
    tva_la_incasare: input?.tva_la_incasare === true,
    gestiune: text(input?.gestiune, 20),
  };

  const admin = createAdminClient();
  const r = await cuLacat(admin, businessId, ASTEPTARE_MANUALA_MS, async (): Promise<{ success: true; avertisment?: string } | { error: string }> => {
    /* ⚠ Configurarea veche, cu cheia de serviciu: pe clientul comerciantului cheia ar fi sosit
       `enc.v1.…`, iar `pastreazaSecretele` ar fi „pastrat-o" asa. Si cu `error`: o citire cazuta
       nu are voie sa para o configurare goala, scrisa apoi peste cea buna. */
    const { data: vechi, error: eVechi } = await createAdminClient()
      .from("store_settings").select("saga_config").eq("business_id", businessId).maybeSingle();
    if (eVechi) return { error: "Setările de acum nu s-au putut citi, deci nu am scris nimic. Încearcă din nou." };

    const final = pastreazaSecretele("saga_config", curat, vechi?.saga_config) as SagaConfig;
    const veche = configCuImplicite((vechi?.saga_config ?? null) as Partial<SagaConfig> | null);
    /* Cheia GOALA din formular inseamna „n-o schimba", si asta nu atarna de lista comuna de secrete
       (in care `saga_config` intra abia la legare). */
    if (!cheieTastata) final.api_key = veche.api_key;
    if (!final.api_key) return { error: "Completează cheia de acces SAGA (din SAGA Web: Utilizatori, Integrare API)." };

    /* Clipa pornirii trimiterii automate: documentele de dinainte nu pleaca singure. */
    final.trimitere_automata_de_la = curat.trimitere_automata
      ? (veche.trimitere_automata && veche.trimitere_automata_de_la ? veche.trimitere_automata_de_la : new Date().toISOString())
      : null;

    const deProbat = !!cheieTastata || final.cod_fiscal !== veche.cod_fiscal || veche.enabled !== true;
    let avertisment: string | undefined;
    if (deProbat) {
      const peCheiaSalvata = final.api_key === veche.api_key;
      let cheieSalvata = veche.api_key;
      const sesiune: SesiuneSaga = {
        codFiscal: final.cod_fiscal,
        cheie: final.api_key,
        async laCheieNoua(noua: string) {
          final.api_key = noua;
          if (peCheiaSalvata) {
            const s = await scrieCheiaRotita(admin, businessId, cheieSalvata, noua);
            if (s === "scrisa") cheieSalvata = noua;
            else if (s === "eroare") throw new Error("cheia rotita nu s-a putut scrie");
          }
        },
      };
      const proba = await testeazaConexiunea(sesiune);
      if (!proba.ok && proba.refuz) return { error: proba.error };
      if (!proba.ok) avertisment = `Setările s-au salvat, dar acum nu am putut verifica legătura cu SAGA: ${proba.error}`;
    }

    /* ⚠ Cu `.select()`: o scriere care n-a atins niciun rand (RLS, magazin sters) nu da eroare, iar
       „salvat" spus atunci ar fi o minciuna. Zero randuri nu e succes. */
    const supabase = await createClient();
    const { data: scrise, error: eScriere } = await supabase.from("store_settings").update({
      saga_config: final as unknown as Json,
      updated_at: new Date().toISOString(),
    }).eq("business_id", businessId).select("business_id");
    const error = eScriere ?? (!scrise || scrise.length === 0 ? { message: "niciun rand scris" } : null);
    if (error) {
      if (cheieTastata && final.api_key !== cheieTastata) {
        /* Proba a rotit cheia NOUA, iar salvarea a cazut: cheia rotita nu mai e nicaieri. */
        await logError({
          action: "saga.salvareCuCheieRotita",
          message: "Proba a primit o cheie SAGA noua, dar setarile nu s-au salvat; cheia tastata poate fi deja blocata.",
          businessId,
          userId: p.userId,
          severity: "warning",
        });
        return { error: "Setările nu s-au putut salva, iar SAGA a schimbat deja cheia la verificare. Generează o cheie nouă în SAGA Web și salvează din nou." };
      }
      return { error: "Setările nu s-au putut salva. Încearcă din nou." };
    }
    return avertisment ? { success: true, avertisment } : { success: true };
  });

  if (r.fel === "ocupat") return { error: MESAJ_OCUPAT };
  if (r.fel === "eroare") return { error: r.mesaj };
  return r.valoare;
}

/**
 * „Testează conexiunea", fara sa salveze configurarea: o citire fara efect (soldul unui cont).
 *
 * ⚠ O CHEIE NOUA, NESALVATA, NU SE PROBEAZA AICI. SAGA poate raspunde la orice apel cu o cheie noua,
 * iar cea veche se blocheaza. O proba fara salvare n-ar avea unde pastra cheia primita: cheia
 * tastata ar muri chiar la proba, iar salvarea de dupa ar pleca cu ea. Cheia noua se verifica la
 * „Salvează", care o si pastreaza (vezi `saveSagaConfig`). Aici se probeaza cheia SALVATA, cu codul
 * fiscal din formular, iar o rotatie se scrie inapoi in configurare: aceea nu e o salvare a
 * formularului, e pastrarea cheii in viata.
 *
 * Cheia salvata vine prin `secretDinConfig`, care face si garda de proprietate.
 */
export async function testSagaConfig(
  businessId: string,
  input: Pick<SagaConfig, "api_key" | "cod_fiscal">,
): Promise<{ ok: true } | { error: string }> {
  const salvata = await secretDinConfig(businessId, "saga_config", "api_key");
  const tastata = typeof input?.api_key === "string" ? input.api_key.trim() : "";
  if (tastata && tastata !== salvata) {
    return { error: "Cheia nouă se verifică la salvare: SAGA poate schimba cheia la fiecare apel, iar o cheie schimbată la o probă fără salvare s-ar pierde. Apasă „Salvează”: salvarea face proba și păstrează cheia." };
  }
  if (!salvata) {
    /* Fara cheie salvata, sau omul nu e proprietarul (`secretDinConfig` intoarce gol in ambele). */
    const p = await proprietar(businessId);
    if ("error" in p) return p;
    return { error: "Completează cheia de acces SAGA și apasă „Salvează”: salvarea face și proba." };
  }
  const codFiscal = codFiscalCurat(input?.cod_fiscal);
  if (!codFiscal) return { error: "Codul fiscal al firmei nu arată bine. Scrie-l exact ca în SAGA, de exemplu RO12345678." };

  const r = await probaCuCheiaSalvata(createAdminClient(), businessId, codFiscal);
  return r.ok ? { ok: true } : { error: r.error };
}

export async function disconnectSaga(businessId: string): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  /* ⚠ Cu `.select()`: zero randuri atinse nu e o deconectare, iar cheia ar ramane in baza. */
  const supabase = await createClient();
  const { data: scrise, error } = await supabase.from("store_settings").update({
    saga_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId).select("business_id");
  if (error || !scrise || scrise.length === 0) return { error: "Deconectarea nu s-a putut salva. Încearcă din nou." };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRIMITEREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * „Trimite în SAGA" din pagina comenzii: factura vie si stornarea ei, cate n-au intrat inca.
 *
 * `trimise` = documentele intrate acum. `avertisment` = ce trebuie sa afle omul desi ceva a plecat
 * (raportul SAGA cu avertismente, stornarea refuzata dupa ce factura a intrat).
 */
export async function exportaComandaInSaga(
  businessId: string,
  orderId: string,
): Promise<{ trimise: number; avertisment?: string } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  if (!orderId) return { error: "Comanda negăsită." };

  const r = await exportaComanda(createAdminClient(), businessId, orderId, {
    sursa: "manual",
    asteptareMs: ASTEPTARE_MANUALA_MS,
  });
  if ("error" in r) return r;
  if (r.nimic) return { error: r.nimic };
  /* ⚠ Avertismentele (factura inlocuita fara stornare, judetul) se spun si cand nimic n-a plecat. */
  if (r.trimise === 0 && r.erori.length) return { error: [...r.erori, ...r.avertismente].join(" ") };
  if (r.trimise === 0 && r.deja > 0) {
    return {
      trimise: 0,
      avertisment: ["Documentele comenzii sunt deja în SAGA, deci nu le-am trimis a doua oară.", ...r.avertismente].join(" "),
    };
  }
  const deSpus = [...r.avertismente, ...r.erori];
  return deSpus.length ? { trimise: r.trimise, avertisment: deSpus.join(" ") } : { trimise: r.trimise };
}

/** Cate comenzi intra intr-un lot: cate are o pagina din lista comenzilor. */
const MAX_LOT = 50;

/**
 * ⚠ BUGETUL LOTULUI. Ruta listei are `maxDuration = 300`. Un document poate tine: 20 s asteptarea
 * lacatului + 30 s importul + 15 s proba de dupa un 400 + scrierile, adica ~70 s. Termenul se verifica
 * inaintea FIECARUI document (o comanda poate avea patru: doua case, fiecare cu factura si stornarea
 * ei), deci cu 200 s, documentul pornit in ultima clipa se incheie sub 300 si actiunea isi intoarce
 * rezultatul, nu o taiere muta.
 */
const BUGET_LOT_MS = 200_000;

/**
 * Trimite in SAGA documentele comenzilor selectate, una cate una (lacatul magazinului le-ar
 * serializa oricum). Rezumatul are forma lui `bulkGenerateInvoices`.
 */
export async function exportaComenzileInSaga(
  businessId: string,
  orderIds: string[],
): Promise<BulkResult | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;

  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return { error: "Nicio comandă selectată." };
  if (ids.length > MAX_LOT) {
    return { error: `Un lot poate avea cel mult ${MAX_LOT} de comenzi, iar aici sunt ${ids.length}. Împarte-le în loturi mai mici.` };
  }

  const admin = createAdminClient();
  const ctx = await contextulMagazinului(admin, businessId);
  if ("error" in ctx) return ctx;

  /* Numerele comenzilor, pentru mesaje; si filtrul de magazin, inainte de orice. */
  const { data: comenzi, error: eCitire } = await admin
    .from("orders").select("id, order_number").eq("business_id", businessId).in("id", ids);
  if (eCitire) return { error: `Nu am putut citi comenzile selectate: ${eCitire.message}` };
  const numere = new Map((comenzi ?? []).map((c) => [c.id, String(c.order_number ?? c.id)]));

  const rezultat: BulkResult = { total: numere.size, done: 0, skipped: 0, failed: 0, errors: [], avertismente: [] };
  const termen = Date.now() + BUGET_LOT_MS;

  for (const id of ids) {
    const order = numere.get(id);
    if (!order) continue;
    if (Date.now() >= termen) { rezultat.oprit = true; break; }

    let r: Awaited<ReturnType<typeof exportaComanda>>;
    try {
      r = await exportaComanda(admin, businessId, id, {
        sursa: "lot", asteptareMs: ASTEPTARE_MANUALA_MS, context: ctx, termen,
      });
    } catch (e) {
      rezultat.failed++;
      rezultat.errors.push({ order, message: e instanceof Error ? e.message : "Trimiterea a căzut." });
      continue;
    }
    if ("error" in r) {
      rezultat.failed++;
      rezultat.errors.push({ order, message: r.error });
      continue;
    }
    if (r.trimise > 0) rezultat.done++;
    else if (r.erori.length) rezultat.failed++;
    else rezultat.skipped++;
    for (const m of r.erori) rezultat.errors.push({ order, message: m });
    /* Cate unul pe comanda, cu numarul ei: lista arata primele trei. */
    if (r.avertismente.length) rezultat.avertismente?.push(`#${order}: ${r.avertismente.join(" ")}`);

    /*
     * Cheia refuzata, pierduta, SAGA cazut sau ocupat: urmatoarele ar pati la fel, deci lotul se opreste
     * (`oprit`) si SPUNE de ce (`motivOprire`, C3); restul comenzilor se pot relua. Fara motiv, lista
     * spune timpul, iar asta ar fi fost o minciuna la o cheie refuzata.
     */
    if (r.oprire) {
      rezultat.oprit = true;
      const motiv = motivOprireLot(r.oprire);
      if (motiv) rezultat.motivOprire = motiv;
      break;
    }
  }

  await logError({
    action: "saga.exportLot",
    message: `done=${rezultat.done} skipped=${rezultat.skipped} failed=${rezultat.failed}${rezultat.oprit ? " oprit" : ""}${rezultat.motivOprire ? " oprit-motiv" : ""}`,
    details: { businessId, cerute: ids.length },
    businessId,
    userId: p.userId,
    severity: "info",
  });
  return rezultat;
}
