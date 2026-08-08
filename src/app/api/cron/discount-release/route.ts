import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { cuponulSePoateElibera, ORE_PANA_LA_ELIBERARE, type ComandaDeMaturat } from "./reguli";

/**
 * Da inapoi utilizarile de cupon ramase agatate de plati online care nu s-au
 * incheiat niciodata.
 *
 * Comanda cu plata cu cardul se insereaza INAINTE de redirectul catre procesator,
 * iar utilizarea cuponului se revendica atomic chiar inainte de insert. Clientul
 * care se razgandeste pe pagina bancii lasa o comanda neplatita si o utilizare
 * consumata, si nimic nu o mai atinge: anularea din panou si stergerea au acum
 * fiecare drumul lor de eliberare (`updateOrder`, `deleteOrder`), dar comanda pe
 * care nu o atinge nimeni ramane asa pentru totdeauna.
 *
 * Masurat pe productie 2026-08-04: 2 comenzi online neplatite in „pending" mai
 * vechi de 24 de ore, 0 cu cupon, deci prima rulare elibereaza zero utilizari.
 * Reparatia e pentru prima campanie cu cupon limitat — azi singurul cupon cu
 * limita adevarata e CADOU30, cu 4 utilizari cu totul.
 *
 * Ce NU face: nu anuleaza si nu atinge in niciun fel comanda. Comanda neplatita
 * ramane a comerciantului, cu totul; se intoarce doar contorul campaniei.
 */
function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
}

/** Cate comenzi se cerceteaza intr-o rulare. Cronul ruleaza din ora in ora. */
const MAX_COMENZI = 500;

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Curata contoarele de limitare expirate (tabela `rate_limits`). Merge aici
  // fiindca acesta e cronul orar cel mai usor; nu are legatura cu cupoanele, dar
  // altfel tabela ar creste la nesfarsit.
  await admin.rpc("curata_limite").then(() => {}, () => {});

  /*
   * Alarma de drift a modelului de citire al catalogului.
   *
   * Sta aici din acelasi motiv ca `curata_limite`, si dintr-unul mai serios:
   * repo-ul n-are CI, deci un test nu pazeste nimic in productie. Cronul orar plus
   * `error_logs` sunt singurul mecanism de aplicare nesupravegheat care exista.
   *
   * `catalog_produs` si `products` sunt doua surse de adevar; cand diverg, nimic
   * nu tipa — catalogul arata doar gresit. Functia compara un esantion si scrie in
   * `error_logs` la nepotrivire, deci divergenta apare in /admin/logs.
   *
   * Inghitit: o alarma care nu poate rula n-are voie sa opreasca eliberarea
   * cupoanelor, care e treaba adevarata a acestui cron.
   */
  await admin.rpc("catalog_verifica", { p_esantion: 300 }).then(() => {}, () => {});

  /*
   * Agregarea zilnica a analiticelor.
   *
   * `site_analytics` are un rand pe eveniment si nu se sterge niciodata: 54.980
   * de randuri si 12 MB numai din trafic normal. Panoul nu citeste niciodata
   * evenimente individuale pe intervale mari — cere chiar gruparea asta — iar
   * agregatul e de 33,8 ori mai mic.
   *
   * DOUA zile, nu una: rularea reface si ziua de ieri, deci un cron sarit sau un
   * eveniment intarziat se repara singur la urmatoarea trecere. Functia STERGE si
   * rescrie fereastra, nu aduna, deci rularea de doua ori pe aceeasi zi nu
   * dubleaza nimic.
   *
   * Inca NU citeste nimeni din ea, si asta e deliberat: mutarea panoului pe
   * agregat i-ar schimba cifrele (cere „de acum minus 30 de zile", cu ora cu tot,
   * iar o zi intreaga nu poate raspunde la asta). Motivul intreg e in
   * migrations/2026-08-16-analitice-zilnice.sql.
   *
   * Inghitit, ca si alarma de mai sus: treaba adevarata a acestui cron e
   * eliberarea cupoanelor.
   */
  await admin.rpc("agregeaza_analitice", { p_zile: 2 }).then(() => {}, () => {});

  // `?ore=` largeste sau stramteaza pragul pentru o verificare manuala; rularea
  // programata foloseste implicitul.
  const ore = Math.min(Math.max(Number(req.nextUrl.searchParams.get("ore")) || ORE_PANA_LA_ELIBERARE, 1), 24 * 30);
  const acum = Date.now();
  const pana = new Date(acum - ore * 3600_000).toISOString();

  /*
   * Filtrul pe `discount_code`, nu pe `discount_id`.
   *
   * Amandoua ar merge in SQL, dar `discount_id` inca nu e in tipurile generate,
   * iar `.not()` cere un nume de coloana cunoscut. Codul e scris pe comanda exact
   * atunci cand s-a revendicat o utilizare, deci multimea e aceeasi sau mai larga
   * — iar `release_order_discount` respinge oricum comenzile fara `discount_id`.
   */
  const { data: comenzi } = await admin
    .from("orders")
    .select("id, business_id, payment_method, payment_status, status, created_at, discount_code")
    .eq("payment_status", "unpaid")
    .eq("status", "pending")
    .not("discount_code", "is", null)
    .lt("created_at", pana)
    .order("created_at", { ascending: true })
    .limit(MAX_COMENZI);

  if (!comenzi || comenzi.length === 0) {
    return NextResponse.json({ ok: true, cercetate: 0, eliberate: 0 });
  }

  let eliberate = 0;

  for (const c of comenzi) {
    if (!cuponulSePoateElibera(c as ComandaDeMaturat, acum, ore)) continue;
    // Functia din baza pune marcajul si scade contorul in aceeasi tranzactie,
    // deci doua rulari suprapuse (sau o anulare facuta in acelasi timp din panou)
    // nu pot scadea de doua ori. `true` = chiar acum s-a scazut.
    const { data: dat, error } = await admin.rpc("release_order_discount" as never, { p_order_id: c.id } as never);
    if (error) {
      console.error("[discount-release] eliberare esuata pentru comanda", c.id, error.message);
      continue;
    }
    if (dat === true) {
      eliberate++;
      console.log("[discount-release] utilizare data inapoi pentru comanda", c.id, c.discount_code);
    }
  }

  console.log(`[discount-release] cercetate ${comenzi.length}, eliberate ${eliberate}`);
  return NextResponse.json({ ok: true, cercetate: comenzi.length, eliberate });
}
