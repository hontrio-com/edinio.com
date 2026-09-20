import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CINE E VIZITATORUL, FARA SA AFLAM CINE E
  ═══════════════════════════════════════════════════════════════════════════

  Pana acum, fiecare randare de pagina scria un rand fara nicio identitate. De
  aceea „vizitatori activi" numara afisari, iar rata de conversie imparta
  comenzile la afisari (vezi `docs/redesign/STATISTICI.md`).

  ⚠ FARA COOKIE, DINADINS. Un cookie de analitica ar fi cerut acordul din
  bannerul de cookie-uri, iar proprietarul a hotarat ca in panou nu se pune
  banner. Aici identitatea se deduce din amprenta cererii: adresa IP, browserul
  si magazinul, trecute printr-o functie de dispersie cu o sare care se schimba
  zilnic.

  ⚠ AMPRENTA NU AJUNGE NICAIERI. In rand se scriu doar rezultatele dispersiei.
  Sarea zilei se sterge dupa sapte zile, deci peste doua saptamani nici cu baza
  in mana nu se mai poate afla de la ce adresa a venit cineva: n-ar mai exista
  cu ce sa refaci dispersia.

  ⚠ VIZITATORUL SE NUMARA PE ZI. Sarea se schimba la miezul noptii, deci acelasi
  om primeste maine alt `visitor_id`. Nu e o scapare: fara cookie, „acelasi om
  saptamana viitoare" nu se poate sti, si nici nu vrem sa se poata.
*/

const MINUTE_DE_INACTIVITATE = 30;

/*
  Sarea se tine si in memoria procesului, o zi.

  ⚠ Nu e o optimizare de dragul vitezei: fara ea, fiecare randare de pagina de
  magazin ar fi insemnat inca o cerere la baza, pe drumul cel mai cald al
  platformei. Cheia e ziua, deci la miezul noptii cade singura.
*/
let sareTinutaMinte: { zi: string; sare: string } | null = null;

async function sareaZilei(ziRomaneasca: string): Promise<string | null> {
  if (sareTinutaMinte?.zi === ziRomaneasca) return sareTinutaMinte.sare;

  const { data, error } = await createAdminClient().rpc("analitice_sarea_zilei" as never);
  const sare = typeof data === "string" ? data : null;
  if (error || !sare) return null;

  sareTinutaMinte = { zi: ziRomaneasca, sare };
  return sare;
}

function ziRomaneasca(acum: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(acum);
}

function dispersie(...bucati: string[]): string {
  return createHash("sha256").update(bucati.join("|")).digest("hex").slice(0, 32);
}

export type IdentitateAnalitica = {
  visitorId: string | null;
  sessionId: string | null;
};

/**
 * Vizitatorul si sesiunea pentru cererea de fata.
 *
 * ⚠ SESIUNEA E ALUNECATOARE: 30 de minute de INACTIVITATE, nu o fereastra fixa
 * de jumatate de ora. De aceea se cauta ultimul eveniment al aceluiasi
 * vizitator; daca e mai nou de atat, sesiunea lui continua. O fereastra fixa ar
 * fi taiat in doua pe oricine navigheaza peste un sfert de ora rotund si ar fi
 * umflat numarul de sesiuni exact la magazinele unde oamenii stau mult.
 *
 * ⚠ La orice piedica se intorc `null`-uri, iar evenimentul se scrie oricum,
 * fara identitate: o vizita nenumarata e mai buna decat o pagina de magazin
 * care nu se mai randeaza.
 */
export async function identitateAnalitica({
  businessId, ip, userAgent, acum = new Date(),
}: {
  businessId: string;
  ip: string | null;
  userAgent: string | null;
  acum?: Date;
}): Promise<IdentitateAnalitica> {
  try {
    if (!ip) return { visitorId: null, sessionId: null };

    const sare = await sareaZilei(ziRomaneasca(acum));
    if (!sare) return { visitorId: null, sessionId: null };

    const visitorId = dispersie(sare, businessId, ip, userAgent ?? "");

    const de_la = new Date(acum.getTime() - MINUTE_DE_INACTIVITATE * 60_000).toISOString();
    const { data } = await createAdminClient()
      .from("site_analytics")
      .select("session_id")
      .eq("business_id", businessId)
      .eq("visitor_id", visitorId)
      .gte("created_at", de_la)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      visitorId,
      sessionId: data?.session_id ?? randomUUID(),
    };
  } catch {
    /* Analitica nu are voie sa strice randarea unui magazin. */
    return { visitorId: null, sessionId: null };
  }
}
