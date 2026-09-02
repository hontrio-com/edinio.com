import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { revendica, marcheazaTrimis, marcheazaEsuat } from "@/lib/edinio-marketing/server/coada-conversii";
import { trimiteTikTok } from "@/lib/edinio-marketing/server/trimite-tiktok";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  GOLIREA COZII DE CONVERSII CATRE FURNIZORII DE RECLAME
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CONVERSIILE EDINIO, nu ale magazinelor. Clientii isi trimit singuri
  evenimentele, cu pixelii lor; nimic de aici nu-i atinge.

  ⚠ CE FACE SI CE NU FACE. Ia ce e scadent, incearca sa trimita, si scrie ce s-a
  intamplat. Nu hotaraste nimic despre continut — aia s-a hotarat la punerea la
  coada — si nu reia nimic pe loc: un esec se reprogrameaza, nu se reincearca in
  aceeasi rulare. Doua incercari la o secunda distanta pica la fel.
*/

/** Cate se iau intr-o rulare. Cronul merge din minut in minut. */
const PE_RULARE = 25;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const randuri = await revendica(PE_RULARE);
  if (randuri.length === 0) return NextResponse.json({ ok: true, luate: 0 });

  let trimise = 0, esecuri = 0, refuzate = 0;

  for (const r of randuri) {
    /*
      ⚠ FIECARE RAND IN `try`-ul LUI. Fara asta, o exceptie la al treilea rand ar
      lasa celelalte douazeci si doua revendicate si netrimise — s-ar elibera abia
      peste un minut, si tot asa la fiecare rulare.
    */
    try {
      const rez = r.destinatie === "tiktok"
        ? await trimiteTikTok(r.sarcina)
        /* Meta se adauga aici, in acelasi tipar, cand tokenul are `ads_management`. */
        : { fel: "refuzat" as const, motiv: `destinatia "${r.destinatie}" nu e legata inca` };

      if (rez.fel === "trimis") { await marcheazaTrimis(r.id); trimise++; continue; }

      if (rez.fel === "refuzat") {
        /*
          ⚠ UN REFUZ NU SE REINCEARCA. Mesajul nostru e gresit, sau dreptul
          lipseste — la a saptea incercare raspunsul e acelasi. Se abandoneaza pe
          loc, cu motivul scris, ca sa se vada in jurnal si sa se poata repara.
        */
        await marcheazaEsuat(r.id, 99, rez.motiv);
        refuzate++;
        await logError({
          action: "conversii.refuzat",
          message: `${r.destinatie}/${r.nume_eveniment}: ${rez.motiv}`,
          details: { event_id: r.event_id },
          severity: "warning",
        });
        continue;
      }

      await marcheazaEsuat(r.id, r.incercari + 1, rez.motiv);
      esecuri++;
    } catch (e) {
      await marcheazaEsuat(r.id, r.incercari + 1, e instanceof Error ? e.message : "exceptie");
      esecuri++;
    }
  }

  /*
    ⚠ SE SCRIE IN JURNAL DOAR CAND E CEVA DE SPUS. O rulare in care totul a mers
    n-are ce raporta; una cu esecuri, da. Altfel jurnalul se umple din minut in
    minut si nu se mai citeste — greseala pe care am reparat-o azi la domenii.
  */
  if (esecuri > 0 || refuzate > 0) {
    await logError({
      action: "conversii.rulare",
      message: `${trimise} trimise, ${esecuri} esecuri, ${refuzate} refuzate din ${randuri.length} luate`,
      severity: refuzate > 0 ? "warning" : "info",
    });
  }

  return NextResponse.json({ ok: true, luate: randuri.length, trimise, esecuri, refuzate });
}
