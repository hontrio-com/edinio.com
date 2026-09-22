import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OFERTELE CARE AU RĂMAS FĂRĂ PRODUSE                           (23.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de el: „notificare când un produs din pachet rămâne fără stoc”. A ales
 * să afle pe două căi — clopoțelul din panou ȘI un semn pe ecranul de Oferte.
 * Semnul de pe ecran îl pune chiar pagina (`offers_page` aduce starea de stoc);
 * asta e cealaltă jumătate: vestea care ajunge la om fără să deschidă ecranul.
 *
 * ⚠⚠ SE ANUNȚĂ DOAR CE A MURIT DE TOT, nu orice pierdere. O ofertă căreia i-a
 * căzut unul din patru încă se vede și încă vinde; un rând în clopoțel pentru ea
 * ar fi transformat notificarea în zgomot — și atunci nici cea adevărată n-ar mai
 * fi citită. Cine vrea și pierderile mici le vede pe ecran, unde stau scrise.
 *
 * ⚠⚠ ȘI SE SPUNE O SINGURĂ DATĂ. `offers.fara_stoc_anuntat_la` ține minte când
 * s-a spus. Fără el, cronul ar fi scris același rând în fiecare zi până când
 * comerciantul ar fi stins oferta ca să scape de el. Urma se ȘTERGE când oferta
 * se întregește la loc, deci dacă produsul se epuizează din nou peste o lună, se
 * spune din nou.
 *
 * ⚠ CE NU POATE ȘTI: `offer_stoc` numără STOCUL, nu „se poate lua dintr-o
 * apăsare”. Un produs cu variante sau cu personalizare e aruncat din set de
 * vitrină, iar steagul ăla stă în `products.page_sections`, un jsonb pe care SQL
 * nu-l citește. Deci există oferte moarte pe ecran pe care cronul ăsta nu le
 * vede. Scris și în migrație.
 *
 * ⚠ ZILNIC, nu din oră în oră: un stoc epuizat nu e o urgență de minute, iar
 * frecvența n-ar schimba decât cât de repede sună — nu de câte ori, fiindcă
 * urma de mai sus oprește repetarea.
 */

/** Câte oferte se cercetează într-o rulare. */
const MAX_OFERTE = 500;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let anuntate = 0;
  let uitate = 0;

  try {
    /*
      ⚠ O EROARE NU E O LISTĂ GOALĂ. Fără ramura asta, o interogare căzută ar fi
      dat `data: null`, cronul ar fi răspuns „zero de anunțat” și nimeni n-ar fi
      aflat că paza nu mai rulează — exact felul de tăcere pe care îl vânăm.
    */
    const { data: deAnuntat, error } = await admin.rpc("oferte_de_anuntat_fara_stoc", { plafon: MAX_OFERTE });
    if (error) {
      logError({ action: "oferte-fara-stoc", message: error.message, details: { pas: "citire" } });
      return NextResponse.json({ ok: false, error: "citirea ofertelor a cazut" }, { status: 500 });
    }

    for (const o of deAnuntat ?? []) {
      /*
        ⚠ SE SCRIE ÎNTÂI URMA, apoi notificarea, și nu invers. Dacă notificarea
        reușește și urma nu, mâine se spune din nou — zgomot. Invers, cel mai rău
        caz e o veste pierdută, pe care ecranul o arată oricum.
      */
      const { error: eUrma } = await admin
        .from("offers")
        .update({ fara_stoc_anuntat_la: new Date().toISOString() })
        .eq("id", o.offer_id)
        .is("fara_stoc_anuntat_la", null);
      if (eUrma) {
        logError({ action: "oferte-fara-stoc", message: eUrma.message, details: { offerId: o.offer_id } });
        continue;
      }

      const { error: eNot } = await admin.from("notifications").insert({
        user_id: o.user_id,
        type: "oferta_fara_stoc",
        title: "O ofertă nu se mai poate cumpăra",
        message:
          `„${o.nume}” nu mai are niciun produs pe stoc, deci nu se mai arată cumpărătorilor. `
          + "Adaugă stoc sau schimbă produsele din ofertă.",
      });
      if (eNot) {
        logError({ action: "oferte-fara-stoc", message: eNot.message, details: { offerId: o.offer_id } });
        continue;
      }
      anuntate++;
    }

    /*
      ⚠⚠ SI DRUMUL ÎNAPOI. O ofertă care s-a întregit trebuie să-și piardă urma,
      altfel a doua epuizare ar fi trecut în tăcere — iar atunci notificarea ar fi
      funcționat exact o dată pe ofertă, pe viață.

      Se cer doar cele ÎNSEMNATE, și se șterge urma celor care nu mai sunt moarte.
    */
    const { data: insemnate } = await admin
      .from("offers")
      .select("id, business_id")
      .not("fara_stoc_anuntat_la", "is", null)
      .limit(MAX_OFERTE);

    /* Starea de stoc se cere o dată pe magazin, nu o dată pe ofertă. */
    const peMagazin = new Map<string, Map<string, { cerute: number; ramase: number }>>();
    for (const o of insemnate ?? []) {
      if (!peMagazin.has(o.business_id)) {
        const { data: stoc } = await admin.rpc("offer_stoc", { bid: o.business_id });
        peMagazin.set(o.business_id, new Map((stoc ?? []).map((s) => [s.offer_id, s])));
      }
      const s = peMagazin.get(o.business_id)!.get(o.id);
      /* Fără rând în `offer_stoc` înseamnă că oferta n-are listă fixă de produse
         (automată, sau de cantitate): urma n-are ce păzi, deci se șterge. */
      const moarta = !!s && s.cerute > 0 && s.ramase === 0;
      if (moarta) continue;
      const { error: eUitat } = await admin
        .from("offers").update({ fara_stoc_anuntat_la: null }).eq("id", o.id);
      if (!eUitat) uitate++;
    }

    return NextResponse.json({ ok: true, anuntate, uitate, cercetate: (deAnuntat ?? []).length });
  } catch (e) {
    logError({ action: "oferte-fara-stoc", message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, error: "cronul a cazut" }, { status: 500 });
  }
}
