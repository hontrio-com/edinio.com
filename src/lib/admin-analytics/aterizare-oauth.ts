import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { exchangeCode, credentialeCorporate } from "@/lib/google-analytics/oauth";
import { listAccountSummaries, listDataStreams } from "@/lib/google-analytics/client";
import { scrieConexiune, type ConexiuneGa4Admin } from "./conexiune";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  INTOARCEREA DE LA GOOGLE, CAND CINE A PLECAT ERA PLATFORMA
  ═══════════════════════════════════════════════════════════════════════════════

  Aterizarea e aceeasi ruta ca la magazine (`/api/google-analytics/oauth/callback`)
  — un singur `redirect_uri` inregistrat in Google Cloud. Ea desparte cele doua
  drumuri dupa starea semnata si cheama functia asta pentru al nostru.
*/

const CATRE = "/admin/analytics";

function inapoi(origine: string, raspuns: string): NextResponse {
  return NextResponse.redirect(`${origine}${CATRE}?ga=${raspuns}`);
}

export async function aterizareAdminGa4(origine: string, cod: string | null): Promise<NextResponse> {
  /*
    ⚠ GARDA DIN NOU, AICI. Starea semnata leaga intoarcerea de plecare, dar nu
    spune CINE se intoarce: cine ar apuca un link de aterizare in cele 15 minute
    de viata ale lui si-ar lega propriul cont Google de platforma. Costul
    verificarii e o interogare; costul lipsei ei e un cont strain in rapoartele
    noastre.
  */
  const admin = await requireAdminApi();
  if (!admin) return inapoi(origine, "neautorizat");

  if (!cod) return inapoi(origine, "anulat");

  /* ⚠ Aceeasi aplicatie ca la plecare. Vezi nota din `admin-analytics.actions.ts`. */
  const tok = await exchangeCode(cod, credentialeCorporate());
  if ("error" in tok) return inapoi(origine, "eroare");

  /*
    ⚠ FARA `refresh_token` LEGATURA E DE O ORA. Google il da doar la primul
    consimtamant, sau cand se cere `prompt=consent` — pe care `buildAuthUrl` il
    cere mereu, tocmai pentru asta. Daca totusi lipseste, se opreste aici: o
    legatura care moare peste o ora e mai rea decat niciuna, fiindca rapoartele
    ar merge azi si ar tacea maine.
  */
  if (!tok.refreshToken) return inapoi(origine, "farajeton");

  const c: ConexiuneGa4Admin = {
    refresh_token: tok.refreshToken,
    email_conectat: tok.email ?? undefined,
    conectat_la: new Date().toISOString(),
  };

  /*
    Descoperim proprietatile la care are acces contul. Cand e una singura, o
    alegem noi — e cazul obisnuit si scuteste un ecran.

    ⚠ CAND SUNT MAI MULTE, NU GHICIM. Un raport construit pe proprietatea gresita
    arata cifre adevarate despre altcineva, si nimic nu pare stricat. Alegerea
    ramane pe seama omului, in pagina.
  */
  const sumar = await listAccountSummaries(tok.accessToken);
  const proprietati: { id: string; nume: string; cont: string }[] = [];
  if (!("error" in sumar)) {
    for (const cont of sumar.data.accountSummaries ?? []) {
      for (const p of cont.propertySummaries ?? []) {
        const id = (p.property ?? "").split("/").pop() ?? "";
        if (id) proprietati.push({ id, nume: p.displayName ?? "", cont: cont.displayName ?? "" });
      }
    }
  }

  if (proprietati.length === 1) {
    const p = proprietati[0];
    c.property_id = p.id;
    c.property_name = p.nume;
    c.cont_google = p.cont;

    const fluxuri = await listDataStreams(tok.accessToken, p.id);
    if (!("error" in fluxuri)) {
      const web = (fluxuri.data.dataStreams ?? []).find(
        f => f.type === "WEB_DATA_STREAM" && f.webStreamData?.measurementId,
      );
      c.masurare_id = web?.webStreamData?.measurementId;
    }
  }

  await scrieConexiune(c, admin.id);

  if (proprietati.length === 1) return inapoi(origine, "gata");
  if (proprietati.length === 0) return inapoi(origine, "faraproprietati");
  return inapoi(origine, "alegeproprietatea");
}
