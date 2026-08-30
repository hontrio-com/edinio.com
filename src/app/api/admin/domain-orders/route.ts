import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDomainToVercel } from "@/lib/vercel";
import { valideazaDomeniuClient } from "@/lib/platform-hosts";

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    orderId: string;
    status: string;
    admin_notes?: string;
  };

  const { orderId, status, admin_notes } = body;

  if (!orderId || !status) {
    return NextResponse.json({ error: "Date incomplete" }, { status: 400 });
  }

  const validStatuses = ["pending", "processing", "completed", "cancelled", "refunded"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Status invalid" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get the order first
  const { data: order } = await supabase
    .from("domain_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Comanda nu a fost gasita" }, { status: 404 });
  }

  /*
   * Domeniul comenzii trece prin ACEEASI validare ca la conectarea manuala.
   *
   * Ruta asta chema `addDomainToVercel` direct, fara `valideazaDomeniuClient`,
   * spre deosebire de /api/domains/connect. Deci un domeniu scris gresit in
   * comanda — sau chiar o gazda a platformei — ajungea nefiltrat si in
   * `custom_domain`, si in proiectul Vercel; iar la prima deconectare din panoul
   * comerciantului acelasi nume s-ar fi sters din proiect.
   *
   * Se verifica INAINTE de orice scriere, si numai pe „completed": marcarea unei
   * comenzi drept anulata sau rambursata nu are de ce sa fie blocata de un
   * domeniu invalid.
   */
  let domeniu = "";
  if (status === "completed") {
    const verdict = valideazaDomeniuClient(order.domain);
    if (!verdict.ok) {
      return NextResponse.json(
        {
          error:
            `Domeniul comenzii („${order.domain}") nu poate fi conectat: ${verdict.motiv} ` +
            `Corecteaza domeniul comenzii inainte de a o finaliza.`,
        },
        { status: 400 },
      );
    }
    domeniu = verdict.domeniu;
  }

  // Update order status
  const { error } = await supabase
    .from("domain_orders")
    .update({
      status,
      admin_notes: admin_notes ?? null,
    })
    .eq("id", orderId);

  if (error) {
    return NextResponse.json({ error: "Eroare la actualizare" }, { status: 500 });
  }

  const avertismente: string[] = [];

  // If completed, create domain record.
  // DOAR la PRIMA trecere in „completed": acelasi PATCH trimite si admin_notes,
  // deci o simpla corectare de nota pe o comanda deja finalizata reintra aici.
  // Fara garda, mai insera un rand in `domains` cu alt expiry_date calculat din
  // now() — doua scadente contradictorii pentru acelasi domeniu, vizibile
  // clientului in panoul lui.
  // Garda acopera DOAR randul din `domains`; legarea de magazin si apelul la
  // Vercel sunt mai jos, in afara ei, ca sa ramana reluabile.
  if (status === "completed" && order.status !== "completed") {
    // Scadenta se numara de la data comenzii (momentul platii), nu de la now():
    // asa iese aceeasi valoare oricand s-ar re-rula finalizarea.
    const expiryDate = order.created_at ? new Date(order.created_at) : new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + order.period);

    const domainRow = {
      business_id: order.business_id,
      user_id: order.user_id,
      domain: domeniu,
      status: "active",
      source: "purchased",
      expiry_date: expiryDate.toISOString().split("T")[0],
      auto_renew: true,
    };

    // Upsert manual (citeste apoi scrie), nu `.upsert({ onConflict })`: pe
    // `domains` nu exista UNIQUE pe (business_id, domain) in productie, iar
    // onConflict fara constrangere cade cu 42P10. Vezi migratia
    // 2026-08-05-domenii-fara-duplicat.sql, neaplicata inca.
    const { data: existingDomain } = await supabase
      .from("domains")
      .select("id")
      .eq("business_id", order.business_id)
      .eq("domain", domeniu)
      .limit(1)
      .maybeSingle();

    const { error: domainError } = existingDomain
      ? await supabase.from("domains").update(domainRow).eq("id", existingDomain.id)
      : await supabase.from("domains").insert(domainRow);

    if (domainError) {
      console.error("[domain-orders] domains write failed:", domainError);
      avertismente.push(
        `Comanda e marcata finalizata, dar randul din lista de domenii nu a fost scris (${domainError.message}). ` +
        `Domeniul nu va aparea la client in „Domeniile tale".`,
      );
    }
  }

  if (status === "completed") {
    /*
     * Legarea de magazin se RELUEAZA la fiecare salvare pe „completed", nu doar la
     * prima tranzitie — altfel un esec aici nu mai putea fi reparat niciodata din
     * interfata, fiindca statusul comenzii era deja „completed" si garda de mai
     * sus taia a doua incercare.
     *
     * Ca sa ramana si reluabila, si sigura, se scrie doar cand magazinul nu are
     * deja alt domeniu: exact protectia pe care o dadea garda, dar explicita si
     * raportata, nu tacuta.
     */
    const { data: biz, error: bizReadError } = await supabase
      .from("businesses")
      .select("custom_domain")
      .eq("id", order.business_id)
      .maybeSingle();

    if (bizReadError || !biz) {
      avertismente.push(
        `Nu am putut citi magazinul comenzii, deci domeniul ${domeniu} NU a fost legat de el. ` +
        `Salveaza comanda din nou ca sa reincerci.`,
      );
    } else if (biz.custom_domain && biz.custom_domain !== domeniu) {
      avertismente.push(
        `Magazinul are deja conectat domeniul ${biz.custom_domain}, deci NU l-am inlocuit cu ${domeniu}. ` +
        `Daca schimbarea e dorita, comerciantul o face din panoul lui.`,
      );
    } else if (biz.custom_domain !== domeniu) {
      const { error: bizError } = await supabase
        .from("businesses")
        .update({
          custom_domain: domeniu,
          // Domeniu nou-nout: sanatatea e NECUNOSCUTA, nu mostenita. `null` lasa
          // proxy-ul sa redirectioneze catre el pana la proba contrarie.
          custom_domain_healthy: null,
          custom_domain_checked_at: null,
        })
        .eq("id", order.business_id);

      if (bizError) {
        // Clientul a PLATIT. Pana acum eroarea asta nici macar nu era citita, deci
        // adminul primea „conectat automat" pe o comanda in care magazinul nu
        // apucase sa afle ca are domeniu.
        console.error("[domain-orders] businesses.custom_domain write failed:", bizError);
        avertismente.push(
          `Comanda e marcata finalizata, dar domeniul ${domeniu} NU a fost legat de magazin (${bizError.message}). ` +
          `Magazinul nu il foloseste si nici cronul de reconciliere nu il vede. Salveaza comanda din nou ca sa reincerci.`,
        );
      }
    }

    /*
     * Vercel (SSL + rutare) se reia la FIECARE salvare pe „completed". Esecul de
     * aici NU pica cererea, iar resalvarea comenzii e singura cale prin care
     * adminul il poate relua. Reapelarea e sigura: atasarea trateaza „deja in
     * proiectul nostru" drept succes.
     *
     * Metoda e „nameservere", nu implicita: pentru un domeniu cumparat prin
     * platforma NOI tinem registrarul, deci noi ii punem si nameserverele catre
     * Vercel — si atunci zona TREBUIE sa existe la Vercel, altfel nameserverele
     * raspund REFUSED si domeniul e mort din prima zi. Paguba de care fereste
     * metoda implicita („inregistrari" nu atinge zona, deci nu pierde MX-urile)
     * nu exista aici: domeniul e nou si nu are inca niciun email pe el.
     */
    const vercelResult = await addDomainToVercel(domeniu, { metoda: "nameservere" });

    // Verdictul ajunge la ADMIN, nu doar in console.error. Calea asta e cea pe
    // care merge fiecare domeniu cumparat prin platforma, iar pana acum spunea
    // „conectat automat" indiferent de rezultat. Asa a stat `atelierullarisei.ro`
    // doua zile complet cazut fara ca nimeni sa aiba de unde afla.
    if (!vercelResult.success) {
      console.error("[domain-orders] Vercel add failed:", vercelResult.error);
      avertismente.push(
        `Domeniul NU a fost conectat la Vercel: ${vercelResult.error} ` +
        `Pana se rezolva, domeniul nu functioneaza deloc. Salveaza comanda din nou ca sa reincerci, ` +
        `sau asteapta reconcilierea orara.`,
      );
    } else if (vercelResult.warning) {
      avertismente.push(vercelResult.warning);
    }
  }

  return NextResponse.json({
    success: true,
    warning: avertismente.length ? avertismente.join(" ") : undefined,
  });
}
