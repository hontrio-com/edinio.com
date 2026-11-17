import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { alegeInRotatie } from "@/lib/marketplace/rotatie";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";
import {
  comenziDeExportat, contextulMagazinului, exportaComanda, magazineCuTrimitereAutomata, probaCuCheiaSalvata,
} from "@/lib/saga/server";
import { mesajStornariLipsa } from "@/lib/saga/config";
import { golesteRapoarteleComenzilorSterse, ultimaIncercareAMagazinului } from "@/lib/saga/jurnal";
import { trebuieProbaInainte } from "@/lib/saga/reguli";

/**
 * Trimiterea AUTOMATA in SAGA a documentelor noi: factura si stornarea, pe magazinele care au
 * pornit-o (`saga_config.trimitere_automata`).
 *
 * ═══ CE PLEACA ═══
 *
 * Numai documentele emise prin Edinio DUPA pornirea trimiterii automate (`trimitere_automata_de_la`):
 * cele de dinainte le-a introdus probabil deja contabilul, iar SAGA nu deduplica (integratorul Odoo:
 * o retrimitere „ar dubla facturile in SAGA"). Fereastra e de cel mult zece zile; ce ramane in urma
 * trimite omul din lista comenzilor.
 *
 * ⚠ NU SE REIA CE CERE UN OM: un document respins de SAGA, nelamurit (registrul il blocheaza oricum)
 * sau pe care nu l-am putut compune ramane in panoul comenzii. Se reiau doar refuzurile de acces, de
 * cel mult trei ori: cheia reparata de comerciant trebuie sa lase documentele sa plece singure.
 *
 * ⚠ O CHEIE REFUZATA SAU UN SAGA CAZUT NU SE INCEARCA PE FIECARE DOCUMENT. Daca ultima incercare a
 * magazinului a fost refuzata SAU nelamurita, intai o proba de conexiune (o citire); daca nu da 200,
 * magazinul se sare. Altfel o pana SAGA ar fi lasat cate un document nou „nelamurit" la fiecare
 * trecere, oprit apoi pana il dezleaga un om.
 *
 * ⚠ ROTATIA PE MAGAZINE vine din ceasul absolut (`alegeInRotatie`), cu pasul cronului (30 de minute):
 * cu multe magazine, toate ajung pe rand, nu doar primele din lista.
 *
 * ⚠ CHEIA SE ROTESTE si apelurile aceluiasi magazin se serializeaza prin lacatul din `server.ts`.
 * Cronul NU asteapta lacatul: un magazin ocupat (un om apasa chiar atunci) se lasa pe trecerea urmatoare.
 *
 * ⚠ JURNALUL CRONULUI NU POARTA DATE PERSONALE: doar numere si identificatori de magazin.
 *
 * ⚠ PASTRAREA: tot aici se sterg randurile din `saga_exporturi` mai vechi de 24 de luni (vezi la final).
 *
 * Programarea, in `vercel.json`: `7,37 * * * *`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cat timp se mai PORNESTE un document. ⚠ Termenul se verifica inaintea FIECARUI document
 * (`exportaComanda` il primeste), nu doar pe comanda: o comanda poate avea patru documente. Un document
 * pornit in ultima clipa tine cel mult ~55 s (30 s importul, 15 s proba de dupa un 400, plus lacatul,
 * registrul, cheia rotita si jurnalul); cu 60 s rezerva, se incheie sub `maxDuration` si cronul isi
 * intoarce raspunsul, in loc sa fie taiat.
 */
const BUGET_MS = maxDuration * 1000 - 60_000;
/** Magazine pe trecere, prin rotatie. */
const MAGAZINE_PE_TRECERE = 20;
/** Comenzi pe magazin, pe trecere: un magazin cu multe documente nu le infometeaza pe celelalte. */
const COMENZI_PE_MAGAZIN = 10;
/** Documente pe trecere, la toate magazinele: plafonul de efort al unei rulari. */
const DOCUMENTE_PE_TRECERE = 60;
/** Pasul rotatiei, in minute: cronul ruleaza o data la 30 de minute. */
const PAS_ROTATIE = 30;
/** Cat se pastreaza jurnalul trimiterilor (24 de luni). */
const ZILE_PASTRARE_JURNAL = 730;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const termen = Date.now() + BUGET_MS;

  const { ids, error } = await magazineCuTrimitereAutomata(admin);
  if (error) {
    /* Citirea principala nu are voie sa taca: o baza cazuta n-ar trebui sa arate ca „nimic de facut". */
    await logError({ action: "saga/cron-export", message: `citirea magazinelor a cazut: ${error}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const magazine = alegeInRotatie(ids, MAGAZINE_PE_TRECERE, PAS_ROTATIE);
  let trimise = 0;
  let erori = 0;
  let sarite = 0;
  let documente = 0;

  /*
   * ⚠ O semnalare care nu ajunge la om nu e o semnalare: clopotelul din panou, nu doar jurnalul. Si se
   * trimite PE LOC, nu la sfarsitul trecerii: o trecere taiata de platforma nu mai ajunge la sfarsit, iar
   * semnalarile stiute pana atunci s-ar fi pierdut. Documentele lor nu se mai reiau, deci nici n-ar mai fi
   * fost spuse vreodata.
   */
  const proprietari = new Map<string, string | null>();
  const semnaleaza = async (businessId: string, titlu: string, mesaj: string) => {
    try {
      if (!proprietari.has(businessId)) {
        const h = await proprietariiMagazinelor(admin, [businessId]);
        proprietari.set(businessId, h.get(businessId) ?? null);
      }
      await semnaleazaExpedierea(admin, {
        userId: proprietari.get(businessId) ?? null,
        businessId,
        tip: "saga",
        titlu,
        mesaj: mesaj.slice(0, 1_000),
        actiune: "saga/cron-export",
      });
    } catch (e) {
      console.error("[saga/cron-export] semnalarea nu s-a scris:", e instanceof Error ? e.message : String(e));
    }
  };

  for (const businessId of magazine) {
    if (Date.now() >= termen || documente >= DOCUMENTE_PE_TRECERE) { sarite++; continue; }
    try {
      const ctx = await contextulMagazinului(admin, businessId);
      if ("error" in ctx) { sarite++; continue; }
      if (!ctx.config.trimitere_automata) { sarite++; continue; }

      /* Ultima incercare a fost refuzata sau nelamurita: intai o proba (o citire), nu un document. */
      const ultima = await ultimaIncercareAMagazinului(admin, businessId);
      if (!ultima.ok) { sarite++; continue; }
      if (trebuieProbaInainte(ultima.rand?.stare)) {
        const proba = await probaCuCheiaSalvata(admin, businessId, null, 0);
        if (!proba.ok) { sarite++; continue; }
      }

      const plan = await comenziDeExportat(admin, businessId, ctx, COMENZI_PE_MAGAZIN);
      if (!plan.ok) {
        erori++;
        await logError({ action: "saga/cron-export", message: "planul magazinului nu s-a putut citi", businessId, severity: "warning" });
        continue;
      }

      for (const orderId of plan.orderIds) {
        if (Date.now() >= termen || documente >= DOCUMENTE_PE_TRECERE) { sarite++; break; }
        const r = await exportaComanda(admin, businessId, orderId, {
          sursa: "automat",
          asteptareMs: 0,
          emiseDupa: ctx.config.trimitere_automata_de_la,
          regulaCron: true,
          context: ctx,
          termen,
        });
        if ("error" in r) { erori++; continue; }
        trimise += r.trimise;
        documente += r.trimise + r.erori.length;
        erori += r.erori.length;

        /*
         * Omul afla de documentele care cer o mana: respinse de SAGA, nelamurite (registrul le
         * blocheaza) sau pe care nu le-am putut compune. O data pe document, fiindca cronul nu le
         * reia. ⚠ Fara textul SAGA: el poate pomeni clientul, iar mesajul ajunge si in jurnalul
         * platformei. Raportul intreg sta in panoul comenzii, numai al magazinului.
         */
        const cerOMana = r.probleme.filter((x) => x.stare === "respins" || x.stare === "necunoscut" || x.stare === "nepregatit");
        if (cerOMana.length) {
          await semnaleaza(businessId, "Un document n-a intrat în SAGA",
            `${cerOMana.map((x) => x.eticheta).join(", ")}: trimiterea automată în SAGA nu a reușit. Vezi motivul și raportul SAGA în panoul SAGA din pagina comenzii.`);
        }
        /* Factura inlocuita fara stornare in SAGA: o data, la prima incercare a documentului care a inlocuit-o. */
        if (r.stornariLipsa.length) {
          await semnaleaza(businessId, "O stornare nu apare în SAGA", mesajStornariLipsa(r.stornariLipsa));
        }
        if (r.oprire === "acces" && ultima.rand?.stare !== "refuzat") {
          await semnaleaza(businessId, "SAGA a refuzat cheia de acces",
            "Trimiterea automată în SAGA s-a oprit: SAGA a refuzat cererea, de obicei din cauza cheii de acces sau a codului fiscal. "
              + "Verifică-le în Integrări, SAGA; documentele pleacă singure după ce legătura merge din nou.");
        }
        if (r.oprire === "cheie") {
          await semnaleaza(businessId, "SAGA a schimbat cheia de acces",
            "SAGA a trimis o cheie de acces nouă, iar Edinio nu a putut-o păstra. Dacă trimiterile următoare sunt refuzate, "
              + "generează o cheie nouă în SAGA Web (Utilizatori, Integrare API) și salveaz-o în Integrări, SAGA.");
        }
        if (r.oprire) break;
      }
    } catch (e) {
      /* ⚠ Un magazin cazut nu opreste trecerea. */
      erori++;
      await logError({
        action: "saga/cron-export",
        message: `magazinul a cazut: ${e instanceof Error ? e.message : String(e)}`,
        businessId,
        severity: "critical",
      });
    }
  }

  /*
   * Pastrarea jurnalului: 24 de luni. Jurnalul nu e registrul (acela opreste duplicatul), iar
   * rapoartele SAGA pot pomeni clientul; peste doi ani nu mai servesc la nimic. Indexul pe `creat_la`
   * face stergerea ieftina, iar fiecare trecere sterge doar ce a imbatranit de la cea dinainte.
   * O cadere se spune, dar nu strica trecerea.
   */
  const pragJurnal = new Date(Date.now() - ZILE_PASTRARE_JURNAL * 86_400_000).toISOString();
  const { error: eCuratenie } = await admin.from("saga_exporturi").delete().lt("creat_la", pragJurnal);
  if (eCuratenie) {
    await logError({ action: "saga/cron-export", message: `curatenia jurnalului a cazut: ${eCuratenie.message}`, severity: "warning" });
  }
  /* Raportul si mesajul SAGA nu supravietuiesc comenzii sterse (pot numi clientul). */
  const golire = await golesteRapoarteleComenzilorSterse(admin);
  if (!golire.ok) {
    await logError({ action: "saga/cron-export", message: `golirea rapoartelor comenzilor sterse a cazut: ${golire.mesaj}`, severity: "warning" });
  }

  return NextResponse.json({ ok: true, magazine: magazine.length, trimise, erori, sarite });
}
