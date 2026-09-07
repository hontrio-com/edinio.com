import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { PREFIX_INCARCARI } from "@/lib/customization/adresa";
import { listeazaIncarcari, stergeIncarcari } from "@/lib/r2";
import { cheileComenzii, deSters, pragulComenzilor, LUNI_PE_COMANDA, ZILE_ORFAN } from "./reguli";
import { cheieMiniatura } from "@/lib/customization/fisiere-private";

/**
 * Sterge fisierele incarcate de cumparatori care nu mai au de ce sa existe.
 *
 * Regula si motivarea ei stau in `reguli.ts`, ca modul PUR. Aici stau doar portile pe care
 * regula nu le poate cunoaste: a raspuns baza? s-a terminat listarea? cate se sterg intr-o rulare?
 *
 * ═══ ⚠ TOT CE E MAI JOS CADE INCHIS ═══
 *
 * Fiecare treapta care nu se poate duce la capat OPRESTE stergerea, nu o continua cu ce a apucat
 * sa afle. Motivul e asimetria: o rulare sarita se reia peste 24 de ore si nu costa nimic, iar o
 * stergere gresita e definitiva — sunt fisierele dupa care se produce marfa, si pozele unor
 * oameni. „Am citit doar jumatate din comenzi" nu inseamna „restul fisierelor sunt orfane".
 */
export const runtime = "nodejs";

/**
 * Cate se sterg cel mult intr-o rulare.
 *
 * ⚠ NU E O OPTIMIZARE, E O FRANA DE MANA. Un defect in regula — un prag socotit invers, o multime
 * de chei aparate ramasa goala — ar sterge TOT depozitul de personalizari intr-o singura rulare.
 * Cu plafonul, prima zi ia cel mult atat, iar cifra iese in log si in `logError` ca sa se vada.
 * Cronul ruleaza zilnic, deci o curatenie adevarata cu restante se face oricum in cateva zile.
 */
const MAX_STERGERI_PE_RULARE = 500;

/** Cate obiecte se listeaza cel mult, ca o galeata crescuta sa nu tina ruta ocupata la nesfarsit. */
const MAX_OBIECTE_LISTATE = 50_000;

/** Cate comenzi se citesc pe pagina. ⚠ PostgREST taie oricum la 1000. */
const PAGINA = 500;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const acum = new Date();

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  /*
   * ═══ 1. CHEILE APARATE: comenzile din ultimele `LUNI_PE_COMANDA` luni ═══
   *
   * ⚠ SE PAGINEAZA, si nu de forma: PostgREST intoarce cel mult 1000 de randuri, tacut. O singura
   * cerere ar fi parut ca merge si ar fi lasat neaparate fisierele de pe comenzile de dupa a
   * mia — adica exact cele mai noi ar fi fost cele mai expuse.
   */
  const prag = pragulComenzilor(acum);
  const aparate = new Set<string>();
  let comenziCitite = 0;

  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await admin
      .from("orders")
      .select("id, updated_at, items")
      /*
       * ═══ ⚠ CEASUL PORNESTE DE LA ULTIMA ATINGERE, NU DE LA PLASARE ═══
       *
       * Era `created_at`. Cu el, o comanda lucrata luni de zile (precomanda, tipar in asteptare,
       * retur) isi pierdea machetele in timp ce atelierul inca avea nevoie de ele.
       *
       * ⚠ SI DE CE NU DE LA FINALIZARE, cum ar parea firesc: fiindca finalizarea nu vine.
       * Masurat pe 07.09.2026, din 389 de comenzi — 175 stau la `shipped` si nu ajung niciodata
       * `delivered`. Aproape jumatate din comenzi n-ar fi pornit ceasul NICIODATA, iar pozele
       * cumparatorilor ar fi ramas pe veci. Un termen care nu se scurge nu e o retentie.
       *
       * `updated_at` le imapaca pe amandoua: cat timp cineva lucreaza la comanda, fisierele stau;
       * cand nu se mai atinge nimeni de ea, ceasul curge si se opreste singur. Si e mereu >=
       * `created_at`, deci nicio comanda nu poate expira mai devreme decat pana acum.
       *
       * ⚠ Masurat: 358 din 389 de comenzi sunt atinse dupa plasare, in medie la 3 zile, cel mult
       * la 56. Deci pentru aproape toate cele doua ceasuri dau acelasi termen — schimbarea nu
       * prelungeste retentia in fapt, doar nu mai taie peste o comanda inca vie.
       */
      .gte("updated_at", prag.toISOString())
      .order("updated_at", { ascending: true })
      .range(de, de + PAGINA - 1);

    if (error) {
      /* ⚠ CADE INCHIS: fara lista intreaga de chei aparate nu se sterge NIMIC. */
      await logError({
        action: "curata-fisiere.comenzi",
        message: `citirea comenzilor a esuat, nu se sterge nimic: ${error.message}`,
        severity: "error",
      });
      return NextResponse.json({ ok: false, motiv: "comenzile nu s-au putut citi" }, { status: 200 });
    }

    for (const c of data ?? []) {
      comenziCitite++;
      for (const cheie of cheileComenzii(c.items, PREFIX_INCARCARI)) aparate.add(cheie);
    }

    if (!data || data.length < PAGINA) break;
  }

  /*
   * ═══ 1b. SI COSURILE INCA RECUPERABILE ═══
   *
   * ⚠ GAURA PE CARE O INCHIDE, masurata pe 07.09.2026: 23 de cosuri DESCHISE mai vechi de 30 de
   * zile. Fisierele lor nu erau pe nicio comanda, deci cronul le vedea drept orfani si le stergea —
   * iar linkul de recuperare, care merge mai departe, refacea linia cu cheia unui fisier ai carui
   * octeti nu mai exista. Clientul ajungea la un cos cu poza lui lipsa, fara sa afle de ce.
   *
   * ⚠ NU EXISTA PANA DE CURAND. Cat timp `AbandonedCartItem` avea cinci campuri si nu purta
   * personalizarea, `liniiRecuperabile` sarea liniile personalizate: nu era nimic de aparat. De cand
   * le poarta si le reface, cele doua subsisteme trebuie sa spuna acelasi lucru — si nu-l spuneau.
   *
   * ⚠ ACELASI PRAG CA LA COMENZI, si dinadins unul singur. Un cos deschis de peste sase luni nu mai
   * e o vanzare care se recupereaza; peste pragul asta fisierele lui pot pleca. Doua praguri
   * diferite ar fi insemnat o fereastra in care un cos e „recuperabil" si fisierele lui nu mai sunt.
   *
   * ⚠ SI NUMAI CELE `open`: un cos `converted` are deja comanda lui, iar comanda il apara prin
   * bucla de mai sus, cu propriul termen socotit de la data ei.
   */
  let cosuriCitite = 0;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await admin
      .from("abandoned_carts")
      .select("id, items")
      .eq("status", "open")
      .gte("last_activity_at", prag.toISOString())
      .order("last_activity_at", { ascending: true })
      .range(de, de + PAGINA - 1);

    if (error) {
      /* ⚠ CADE INCHIS, ca la comenzi: fara lista intreaga nu se sterge NIMIC. */
      await logError({
        action: "curata-fisiere.cosuri",
        message: `citirea cosurilor abandonate a esuat, nu se sterge nimic: ${error.message}`,
        severity: "error",
      });
      return NextResponse.json({ ok: false, motiv: "cosurile nu s-au putut citi" }, { status: 200 });
    }

    for (const c of data ?? []) {
      cosuriCitite++;
      for (const cheie of cheileComenzii(c.items, PREFIX_INCARCARI)) aparate.add(cheie);
    }

    if (!data || data.length < PAGINA) break;
  }

  /*
   * ═══ ⚠ SI MINIATURILE LOR ═══
   *
   * Miniatura nu sta in nicio comanda: cheia ei se deriva din a originalului, la servire. Deci
   * pasii de mai sus n-o pot vedea, si fara randurile astea fiecare miniatura ar fi iesit ORFANA
   * si ar fi fost stearsa dupa treizeci de zile. Panoul ar fi cazut inapoi pe original, tacut:
   * nimic stricat pe ecran, doar factura de egress inapoi de unde a plecat, si nimeni n-ar fi
   * stiut de ce.
   *
   * ⚠ SE IA O COPIE A MULTIMII, fiindca se adauga in ea chiar in timp ce se parcurge.
   *
   * ⚠ SE ADAUGA FARA SA SE INTREBE DACA EXISTA: o cheie aparata care nu e in depozit nu costa
   * nimic (verdictul se da pe obiectele listate), iar o interogare pe fiecare cheie ar fi insemnat
   * mii de `HeadObject` la fiecare rulare.
   */
  const cheiAparate = aparate.size;
  for (const cheie of [...aparate]) aparate.add(cheieMiniatura(cheie));

  /*
   * ═══ 2. CE E IN DEPOZIT ═══
   *
   * ⚠ LISTAREA TREBUIE SA SE TERMINE. Oprita la jumatate, restul obiectelor pur si simplu n-ar fi
   * fost vazute — asta e nevatamator (nu se sterg). Dar daca listarea CADE la mijloc, ce s-a
   * adunat pana atunci e o multime partiala, si nimic din ea nu e gresit de sters... cu o
   * conditie: cheile aparate sunt deja intregi. Sunt, fiindca vin de la pasul 1, care a cazut
   * inchis. Deci o listare incompleta doar amana, nu strica — si totusi se opreste, ca sa nu se
   * raporteze o curatenie „terminata" care n-a fost.
   */
  let obiecte: { cheie: string; incarcatLa: Date; bucket: string }[];
  let trunchiat: boolean;

  try {
    /*
     * ⚠ AMANDOUA GALETILE. De cand incarcarile se scriu intr-o galeata PRIVATA, cele urcate
     * inainte au ramas in cea veche — iar retentia trebuie sa le prinda si pe ele, altfel tocmai
     * fisierele din galeata PUBLICA ar fi ramas acolo pe veci.
     */
    const r = await listeazaIncarcari(PREFIX_INCARCARI, MAX_OBIECTE_LISTATE);
    obiecte = r.obiecte;
    trunchiat = r.trunchiat;
  } catch (e) {
    await logError({
      action: "curata-fisiere.listare",
      message: `listarea depozitului a esuat, nu se sterge nimic: ${(e as Error).message}`,
      severity: "error",
    });
    return NextResponse.json({ ok: false, motiv: "depozitul nu s-a putut lista" }, { status: 200 });
  }

  /* ═══ 3. VERDICTUL, dat de modulul pur ═══ */
  const verdicte = deSters(obiecte, aparate, acum);

  const plafonat = verdicte.length > MAX_STERGERI_PE_RULARE;
  const deExecutat = plafonat ? verdicte.slice(0, MAX_STERGERI_PE_RULARE) : verdicte;
  if (plafonat) {
    /*
     * ⚠ SE ANUNTA, NU SE TACE. Plafonul atins inseamna ori o curatenie cu restante (prima rulare
     * peste ani de fisiere), ori un defect in regula. Amandoua vor sa fie vazute de om.
     */
    await logError({
      action: "curata-fisiere.plafon",
      message: `${verdicte.length} fisiere de sters, plafonul e ${MAX_STERGERI_PE_RULARE}; restul la rularea urmatoare`,
      severity: "warning",
    });
  }

  /* ═══ 4. STERGEREA. Raspunsul se citeste in `stergeMulteDinR2` — vezi nota de acolo. ═══ */
  /*
   * ⚠ FIECARE CHEIE SE STERGE DIN GALEATA EI. Aceeasi cheie poate exista in amandoua in timpul
   * migrarii; stearsa din cea gresita, ar fi iesit „stearsa" fara sa dispara nimic — si cronul ar
   * fi raportat, in fiecare zi, o curatenie care nu s-a facut.
   */
  const galeataCheii = new Map(obiecte.map((o) => [o.cheie, o.bucket]));
  const { sterse, esecuri } = await stergeIncarcari(
    deExecutat.map((v) => ({ cheie: v.cheie, bucket: galeataCheii.get(v.cheie) ?? "" })),
  );

  if (esecuri.length) {
    await logError({
      action: "curata-fisiere.stergere",
      message: `${esecuri.length} fisiere n-au putut fi sterse: ${esecuri.slice(0, 10).join("; ")}`,
      severity: "warning",
    });
  }

  const raport = {
    ok: true,
    comenziCitite,
    cosuriCitite,
    /*
     * ⚠ CATE CHEI S-AU GASIT IN DATE, nu cate sunt in multime. Multimea mai poarta si cheile
     * DERIVATE ale miniaturilor, care nu stau nicaieri; numarate impreuna, raportul s-ar fi
     * dublat peste noapte fara ca nimic sa se fi schimbat in comenzi, iar omul care-l citeste
     * l-ar fi luat drept semn.
     */
    cheiAparate,
    obiecte: obiecte.length,
    trunchiat,
    deSters: verdicte.length,
    sterse,
    esecuri: esecuri.length,
    orfani: verdicte.filter((v) => v.motiv === "orfan").length,
    comenziVechi: verdicte.filter((v) => v.motiv === "comanda-veche").length,
    reguli: { ZILE_ORFAN, LUNI_PE_COMANDA },
  };
  console.log("[curata-fisiere]", JSON.stringify(raport));
  return NextResponse.json(raport);
}
