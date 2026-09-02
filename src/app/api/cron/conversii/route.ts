import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import {
  revendica, marcheazaTrimis, marcheazaEsuat, ceiCareAuRetras,
  ARENDA_MS, MS_CERERE_FURNIZOR, aRetras,
} from "@/lib/edinio-marketing/server/coada-conversii";
import { trimiteTikTok } from "@/lib/edinio-marketing/server/trimite-tiktok";
import { trimiteMeta } from "@/lib/edinio-marketing/server/trimite-meta";

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

/*
  ⚠ SINGURUL CRON FARA `maxDuration` — pana azi. Toate celelalte il au de mult; la
  asta a lipsit de la scriere si nimeni n-a observat, fiindca lipsa lui nu se vede
  ca eroare. Se vede ca o functie taiata la mijloc.
*/
export const maxDuration = 60;

/**
 * Cat are voie sa dureze bucla de trimitere.
 *
 * ═══ ⚠ DE CE E MAI MIC DECAT ARENDA, si nu decat `maxDuration` ═══
 *
 * Randurile sunt tinute o arenda de un minut (`ARENDA_MS`), iar cronul porneste
 * din minut in minut. Daca o rulare depaseste arenda, urmatoarea REVENDICA
 * ACELEASI randuri — si le trimite a doua oara, in timp ce prima inca le trimite.
 *
 * Bucla trimite cele 25 de randuri unul dupa altul. Cu termenul de acum, cel mai
 * rau caz al unui singur rand e `MS_CERERE_FURNIZOR`; deci se verifica bugetul
 * INAINTE de fiecare rand, si se lasa loc pentru cererea care tocmai porneste
 * plus marcajul ei in baza.
 *
 * ⚠ CE SE INTAMPLA CU CE RAMANE. Nimic rau: randurile neatinse isi duc arenda
 * pana la capat si sunt luate de rularea urmatoare. Coada nu pierde, doar asteapta
 * un minut.
 */
const MARJA_MARCAJ_MS = 4_000;
const BUGET_MS = ARENDA_MS - MS_CERERE_FURNIZOR - MARJA_MARCAJ_MS;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  /* ⚠ Ceasul porneste INAINTE de revendicare: arenda incepe acolo, nu la prima trimitere. */
  const inceput = Date.now();

  const randuri = await revendica(PE_RULARE);
  if (randuri.length === 0) return NextResponse.json({ ok: true, luate: 0 });

  /*
    ═══ ⚠ POARTA 3: ULTIMA VERIFICARE, PE LOTUL REVENDICAT ═══

    Randurile astea au trecut de poarta de la punere — deci acordul exista atunci.
    Dar `revendica` le tine o arenda de un minut, iar in fereastra aia omul poate
    apasa „retrage". O singura interogare pentru tot lotul, nu una pe rand.
  */
  const retrasi = await ceiCareAuRetras(randuri.map((r) => r.vizitator ?? ""));

  /*
    ⚠ DACA NU SE POATE AFLA CINE A RETRAS, NU PLEACA NIMIC. Randurile raman
    revendicate; arenda expira intr-un minut si le ia rularea urmatoare. Costul e
    o intarziere de un minut pentru o masuratoare; celalalt cost ar fi o conversie
    plecata pentru un om care a spus nu. Vezi nota din `ceiCareAuRetras`.
  */
  if (retrasi === null) {
    await logError({
      action: "conversii.amanatFaraVerificare",
      message: `${randuri.length} conversii amanate: nu s-a putut afla cine si-a retras acordul`,
      severity: "warning",
    });
    return NextResponse.json({ ok: true, luate: randuri.length, amanate: randuri.length, motiv: "verificare-acord-indisponibila" });
  }

  let trimise = 0, esecuri = 0, refuzate = 0, oprite = 0, amanate = 0, nesigure = 0;

  for (const r of randuri) {
    /*
      ⚠ SE OPRESTE INAINTE SA EXPIRE ARENDA, nu dupa. Vezi `BUGET_MS`. Randurile
      ramase nu se pierd: se iau la rularea urmatoare.
    */
    if (Date.now() - inceput > BUGET_MS) { amanate++; continue; }

    /*
      ⚠ FIECARE RAND IN `try`-ul LUI. Fara asta, o exceptie la al treilea rand ar
      lasa celelalte douazeci si doua revendicate si netrimise — s-ar elibera abia
      peste un minut, si tot asa la fiecare rulare.
    */
    if (r.vizitator && retrasi.has(r.vizitator)) {
      /*
        ⚠ ABANDON, NU ESEC, si severitate `info` la raportare. O retragere e o
        alegere a omului, nu o defectiune a noastra. Numarata ca eroare, fiecare
        retragere ar aprinde jurnalul si l-ar face de necitit — greseala pe care
        am reparat-o deja la domenii.
      */
      await marcheazaEsuat(r.id, 99, "consimtamant retras intre revendicare si trimitere");
      oprite++;
      continue;
    }

    /*
      ═══ ⚠ ULTIMA INTREBARE, IMEDIAT INAINTEA CERERII CATRE FURNIZOR ═══

      Verificarea pe lot de mai sus s-a facut o data, la inceput. Intre ea si
      randul asta pot trece zeci de secunde, si in ele omul poate apasa „retrage".
      Nimic nu opreste o cerere deja plecata pe fir — dar fereastra se stramteaza
      pana aproape de zero intreband din nou aici.

      ⚠ SI NU INLOCUIESTE INTREBAREA PE LOT: aceea ramane, fiindca opreste
      randurile stiute retrase FARA sa mai deschida vreo cerere.
    */
    if (r.vizitator) {
      const acumRetras = await aRetras(r.vizitator);
      if (acumRetras === null) { nesigure++; continue; }
      if (acumRetras) {
        await marcheazaEsuat(r.id, 99, "consimtamant retras intre revendicare si trimitere");
        oprite++;
        continue;
      }
    }

    try {
      const rez =
        r.destinatie === "tiktok" ? await trimiteTikTok(r.sarcina)
        : r.destinatie === "meta" ? await trimiteMeta(r.sarcina)
        : { fel: "refuzat" as const, motiv: `destinatia "${r.destinatie}" nu e cunoscuta` };

      if (rez.fel === "trimis") { await marcheazaTrimis(r.id, r.sarcina); trimise++; continue; }

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
  if (oprite > 0) {
    await logError({
      action: "conversii.opritePrinRetragere",
      message: `${oprite} conversii nu s-au trimis: acordul s-a retras dupa revendicare`,
      severity: "info",
    });
  }

  /*
    ⚠ AMANAREA SE STRIGA, nu se inghite. Daca o rulare nu apuca sa duca lotul pana
    la capat, coada creste in tacere si nimeni n-ar afla decat dupa ce se aduna.
    E singurul semn ca `PE_RULARE` a devenit prea mare pentru un minut.
  */
  /*
    ⚠ SI CELE PENTRU CARE N-AM PUTUT INTREBA. Se strigă separat de `amanate`: alea
    n-au incaput in arenda, astea n-au putut fi verificate. Doua pricini deosebite
    n-au voie sa arate la fel in jurnal.
  */
  if (nesigure > 0) {
    await logError({
      action: "conversii.nesigure",
      message: `${nesigure} conversii n-au plecat: verificarea finala a acordului n-a raspuns`,
      severity: "warning",
    });
  }

  if (amanate > 0) {
    await logError({
      action: "conversii.amanate",
      message: `${amanate} conversii au ramas pentru rularea urmatoare: lotul nu incape in arenda de ${ARENDA_MS / 1000}s`,
      severity: "warning",
    });
  }

  if (esecuri > 0 || refuzate > 0) {
    await logError({
      action: "conversii.rulare",
      message: `${trimise} trimise, ${esecuri} esecuri, ${refuzate} refuzate din ${randuri.length} luate`,
      severity: refuzate > 0 ? "warning" : "info",
    });
  }

  return NextResponse.json({ ok: true, luate: randuri.length, trimise, esecuri, refuzate, oprite, amanate, nesigure });
}
