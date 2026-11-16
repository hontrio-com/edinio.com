import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";
import { citesteConfigTbi } from "@/lib/tbi/config";
import { descifreazaDeLaTbi } from "@/lib/tbi/cripto";
import { citesteVesteaTbi } from "@/lib/tbi/stari";
import { aplicaVesteaTbi, hashJeton } from "@/lib/tbi/server";

/**
 * Vestile tbi Fusion Pay („Status Updates"): fiecare schimbare de stare a unei cereri de finantare
 * (la `statusURL`) si a unei rambursari (la `refundLink`). Corpul: `{ "data": "<criptat>" }`.
 *
 * ═══ CUM SE DOVEDESTE O VESTE (trei lacate, in ordinea asta) ═══
 *
 *   1. JETONUL din adresa: 256 de biti aleatori, pusi de noi in `statusURL` / `refundLink`, care pleaca
 *      la tbi numai CRIPTAT (in `data`). In baza sta doar amprenta lui. Un jeton necunoscut se opreste
 *      aici, inainte de orice citire a corpului si de orice descifrare.
 *   2. DESCIFRAREA cu cheia de criptare a magazinului caruia ii apartine cererea.
 *   3. `OrderId` din veste trebuie sa fie CHIAR id-ul cererii de pe jeton. Altfel o veste adevarata,
 *      prinsa de la o cerere, n-ar putea fi rejucata pe jetonul alteia.
 *
 * ⚠ De ce nu e de ajuns criptarea: AES-CTR fara MAC nu dovedeste cine a scris (vezi `cripto.ts`), iar
 * cheia o are si tbi. Criptarea ascunde, nu semneaza. Lacatul care dovedeste e jetonul.
 *
 * ═══ CE RASPUNDE ═══
 *
 *   200  vestea s-a aplicat (sau repeta ce stiam);
 *   400  vestea nu se poate citi (corp gol, cheie gresita, JSON stricat): repetata, ar da la fel;
 *   404  jeton necunoscut;
 *   503  baza n-a raspuns: o repetare a vestii are sens.
 * Documentatia lor nu spune daca repeta vestile; 503 e doar sansa, nu plasa. Plasa e cronul
 * `tbi-reconciliere`, care intreaba starea cererilor ramase deschise.
 */

export const dynamic = "force-dynamic";

const JETON = /^[A-Za-z0-9_-]{43}$/;
/** O veste e de cateva sute de octeti; plafonul taie corpurile care n-au ce cauta aici. */
const CORP_MAXIM = 256 * 1024;

type Ia = (cheie: string) => string | null | undefined;

function dinCampuri(ia: Ia): string | null {
  for (const cheie of ["data", "Data"]) {
    const v = ia(cheie);
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/**
 * `data` din cerere, oricum ar veni. Documentatia arata un corp JSON; se primesc si formularul
 * obisnuit, `multipart` si parametrul din adresa, ca o schimbare de codare la ei sa nu ne opreasca.
 */
async function valoareaVestii(request: NextRequest): Promise<string | null> {
  const tip = (request.headers.get("content-type") ?? "").toLowerCase();
  const octeti = Buffer.from(await request.arrayBuffer());
  if (octeti.length > CORP_MAXIM) return null;
  const text = octeti.toString("utf8");

  if (tip.includes("json") || /^\s*\{/.test(text)) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      if (j && typeof j === "object") {
        const v = dinCampuri((k) => (typeof j[k] === "string" ? (j[k] as string) : null));
        if (v) return v;
      }
    } catch { /* nu e JSON */ }
  }
  if (tip.includes("multipart/form-data")) {
    try {
      const fd = await new Response(octeti, { headers: { "content-type": tip } }).formData();
      const v = dinCampuri((k) => { const x = fd.get(k); return typeof x === "string" ? x : null; });
      if (v) return v;
    } catch { /* cade pe celelalte forme */ }
  }
  if (text.includes("=")) {
    /* ⚠ `URLSearchParams` face din `+` spatiu; `normalizeazaBase64` il intoarce. */
    const v = dinCampuri((k) => new URLSearchParams(text).get(k));
    if (v) return v;
  }
  return dinCampuri((k) => request.nextUrl.searchParams.get(k));
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ jeton: string }> }) {
  if (!rateLimit(`tbi-veste:${clientIp(request)}`, 240, 60_000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const { jeton } = await ctx.params;
  if (!JETON.test(jeton ?? "")) return NextResponse.json({ ok: false }, { status: 404 });

  const admin = createAdminClient();
  /* Amprenta e hex, deci intra in filtru fara nicio scapare. */
  const amprenta = hashJeton(jeton);
  const { data: cerere, error: eC } = await admin
    .from("tbi_cereri").select("*")
    .or(`jeton_hash.eq.${amprenta},jetoane_rambursare.cs.{${amprenta}}`)
    .maybeSingle();
  if (eC) {
    await logError({ action: "tbi/notificare", message: `cererea nu s-a putut citi: ${eC.message}`, severity: "critical" });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (!cerere) return NextResponse.json({ ok: false }, { status: 404 });

  const { data: st, error: eS } = await admin
    .from("store_settings").select("tbi_config").eq("business_id", cerere.business_id).maybeSingle();
  if (eS) {
    await logError({ action: "tbi/notificare", message: `configurarea nu s-a putut citi: ${eS.message}`, details: { cerere: cerere.id }, businessId: cerere.business_id, severity: "critical" });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  /*
   * ⚠ O VESTE CARE NU SE POATE DESCIFRA SE SPUNE COMERCIANTULUI. Cauza aproape sigura e cheia de
   * criptare schimbata sau stearsa dupa trimiterea cererii. Cat ramane asa, NICIO aprobare nu ajunge
   * la comenzi: banca aproba, clientul semneaza, iar comanda sta „neplatita". Aceeasi lectie ca la
   * semnatura Revolut: o tacere aici opreste integrarea fara sa afle nimeni.
   */
  const strigaCheia = async (motiv: string) => {
    await logError({
      action: "tbi/notificare",
      message: `vestea tbi nu se poate descifra: ${motiv}`,
      details: { cerere: cerere.id, orderId: cerere.order_id },
      businessId: cerere.business_id,
      severity: "critical",
    });
    if ((await consumaLimita(`tbi-cheie:${cerere.business_id}`, 1, 6 * 3600)).permis) {
      const proprietari = await proprietariiMagazinelor(admin, [cerere.business_id]);
      await semnaleazaExpedierea(admin, {
        userId: proprietari.get(cerere.business_id) ?? null,
        businessId: cerere.business_id,
        orderId: cerere.order_id,
        orderNumber: cerere.order_number,
        tip: "plata",
        titlu: "Veștile tbi bank nu se pot citi",
        mesaj: "tbi bank a trimis starea unei cereri de finanțare, dar ea nu se poate descifra cu cheia de criptare salvată. "
          + "Verifică în Integrări > tbi bank cheia de criptare din emailul tbi (butonul „Verifică legătura”). "
          + "Până atunci, aprobările nu ajung la comenzi.",
        actiune: "tbi/notificare",
        detalii: { cerere: cerere.id, motiv },
      });
    }
  };

  const cfg = citesteConfigTbi(st?.tbi_config);
  if (!cfg.cheie_criptare.trim()) {
    await strigaCheia("cheia de criptare lipseste din configurare");
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const valoare = await valoareaVestii(request);
  if (!valoare) {
    await logError({ action: "tbi/notificare", message: "veste fara data", details: { cerere: cerere.id, tip: request.headers.get("content-type") }, businessId: cerere.business_id, severity: "warning" });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let text: string;
  try {
    text = descifreazaDeLaTbi(valoare, cfg.cheie_criptare);
  } catch (e) {
    await strigaCheia((e as Error).message);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const veste = citesteVesteaTbi(text);
  if ("eroare" in veste) {
    /* CTR fara MAC: cheia gresita da text fara sens, care cade aici ca „nu e JSON". */
    if (veste.eroare.includes("JSON")) await strigaCheia(veste.eroare);
    else await logError({ action: "tbi/notificare", message: `vestea nu se poate citi: ${veste.eroare}`, details: { cerere: cerere.id }, businessId: cerere.business_id, severity: "error" });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (veste.orderId !== String(cerere.id)) {
    await logError({
      action: "tbi/notificare",
      message: "vestea poarta alt OrderId decat cererea de pe jeton: ignorata",
      details: { cerere: cerere.id, orderIdVeste: veste.orderId.slice(0, 40) },
      businessId: cerere.business_id,
      severity: "critical",
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const r = await aplicaVesteaTbi(admin, cerere, veste);
  if (r.fel === "reincearca") {
    await logError({ action: "tbi/notificare", message: `vestea nu s-a putut aplica: ${r.mesaj}`, details: { cerere: cerere.id, status_id: veste.statusId }, businessId: cerere.business_id, severity: "critical" });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
