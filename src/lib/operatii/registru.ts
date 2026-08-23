/*
 * FARA "use server" AICI, INTENTIONAT. Nu-l readauga.
 *
 * Acelasi motiv ca la `error-logger.ts`: intr-un modul "use server" FIECARE export
 * devine un endpoint HTTP inregistrat in manifestul global. `deblocheazaOperatie`
 * scrie in registru cu clientul de SISTEM — expusa ca actiune, ar fi lasat pe
 * oricine sa deblocheze operatii alegandu-si singur `businessId`.
 *
 * Modulul se foloseste EXCLUSIV ca functii obisnuite, din cod care ruleaza pe
 * server. Actiunea apelabila din browser se scrie separat si isi verifica omul.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { logError } from "@/lib/error-logger";

/**
 * Registrul operatiilor externe: intentia se scrie INAINTE de apel, rezultatul DUPA.
 *
 * ═══ CE REZOLVA ═══
 *
 * Tiparul de azi, identic in toate cele ~30 de situri (exemplu literal,
 * src/lib/actions/cargus.actions.ts:154-164):
 *
 *     const barCode = await createCargusAwb(config, enriched);   // efect REAL
 *     await supabase.from("orders").update({ cargus_awb_number: barCode, ... })
 *                                  .eq("id", orderId);
 *
 * `error` nu e destructurat, si un UPDATE care nu prinde niciun rand nu da eroare.
 * Daca scrierea se pierde, AWB-ul exista si platit, dar Edinio nu stie — iar omul
 * apasa din nou.
 *
 * ⚠ De ce nu e destul „verifica scrierea si intoarce eroare": AWB-ul CHIAR a fost
 * creat, deci comerciantul care vede eroare apasa din nou si face exact duplicatul.
 * Si nu acopera nici procesul care moare intre POST si UPDATE, nici furnizorul care
 * a creat documentul dar al carui raspuns s-a pierdut.
 *
 * ═══ GARANTIA ═══
 *
 * Rezervarea se scrie INAINTE. Daca incheierea de dupa pica, randul ramane
 * `in_curs` — si atunci a doua apasare e REFUZATA, cu cheia in mesaj. Adica
 * pierderea scrierii nu mai poate produce un duplicat, ci cel mult o operatie de
 * lamurit. Vezi migrations/2026-08-20-registru-operatii-externe.sql.
 */

/** Ce fel de operatie. Trebuie sa ramana in pas cu `operatii_externe_fel_check`. */
export type FelOperatie =
  | "awb" | "anulare_awb" | "ridicare"
  | "factura" | "proforma" | "storno" | "anulare_document"
  | "plata" | "incasare" | "rambursare"
  | "publicare" | "retragere" | "expediere"
  | "proba";

/** Care furnizor. Trebuie sa ramana in pas cu `operatii_externe_furnizor_check`. */
export type FurnizorOperatie =
  | "cargus" | "sameday" | "fancourier" | "dpd" | "woot" | "colete" | "gls" | "pallex" | "ecolet"
  | "posta" | "innoship" | "packeta" | "smartship" | "shipo" | "fedex" | "ups" | "dhl"
  | "smartbill" | "oblio" | "fgo"
  | "stripe" | "netopia" | "ipay" | "klarna" | "revolut"
  | "trendyol" | "aboutyou" | "olx" | "gmc" | "emag"
  | "proba";

/**
 * Verdictul asupra unui esec: a refuzat furnizorul, sau nu stim?
 *
 * ⚠ ASTA E INIMA LUCRARII, nu un detaliu de tipizare.
 *
 *   "esuat"      furnizorul a REFUZAT dovedit (validare, 4xx cu mesaj de la el).
 *                Nu s-a intamplat nimic acolo, deci reincercarea e sigura si
 *                randul NU mai blocheaza.
 *   "necunoscut" timeout, cadere de retea, 5xx, raspuns neinteligibil. Furnizorul
 *                POATE sa fi facut operatia. Randul BLOCHEAZA si iese la om.
 *
 * Un timeout clasificat gresit drept „esec" deblocheaza exact reincercarea care
 * emite al doilea document fiscal. De aceea implicitul e `necunoscut` si
 * `esuat` se da doar cu dovada.
 *
 * Definit o singura data, in `eroare-furnizor`, ca sa nu apara doua liste care pot
 * sa se departeze una de alta.
 */
export type { Verdict } from "@/lib/operatii/eroare-furnizor";
import type { Verdict } from "@/lib/operatii/eroare-furnizor";

export interface CerereOperatie {
  /**
   * Magazinul, sau `null` pentru operatiile PLATFORMEI (abonamente, domenii) —
   * acelea nu apartin niciunui magazin. Vezi migrations/2026-08-24: indexul unic e
   * pe expresie cu `coalesce`, tocmai ca `NULL != NULL` sa nu deschida o gaura
   * tacuta exact acolo unde se emit documentele fiscale ale platformei.
   */
  businessId: string | null;
  /** `null` pentru operatii care nu tin de o comanda (ridicare de la curier). */
  orderId: string | null;
  fel: FelOperatie;
  furnizor: FurnizorOperatie;
  /**
   * Deterministă si stabila intre incercari. Pentru facturi include SLOTUL, ca o
   * reemitere legitima dupa storno sa nu fie blocata de documentul desfiintat —
   * vezi `cheieDocument` din src/lib/billing/refacturare.ts:94.
   */
  cheie: string;
}

/** Ce intoarce apelul extern: ce se scrie in registru si ce primeste apelantul. */
export interface RodOperatie<T> {
  /** Numarul AWB, numarul facturii, id-ul de la furnizor. */
  referinta: string;
  /** Serie, url, nume de serviciu. Ce nu incape intr-un singur text. */
  detalii?: Json;
  /** Ce se intoarce mai departe apelantului. */
  valoare: T;
}

export type RezultatOperatie<T> =
  /** S-a facut ACUM. `operatieId` e deja incheiat cu `reusit`. */
  | { fel: "facut"; valoare: T; operatieId: string; referinta: string }
  /**
   * Se facuse deja, cu succes. Furnizorul NU a fost chemat a doua oara.
   * Apelantul scrie coloanele la loc (e idempotent) si raporteaza succes.
   */
  | { fel: "deja"; referinta: string | null; detalii: Json | null }
  /**
   * O operatie identica e `in_curs` sau `necunoscut`. Furnizorul NU a fost chemat.
   * `mesaj` e gata de aratat comerciantului si spune ce are de facut.
   */
  | { fel: "blocat"; mesaj: string; cheie: string; operatieId: string | null }
  /** Furnizorul a fost chemat si a picat, ori nici n-am ajuns sa-l chemam. */
  | { fel: "eroare"; mesaj: string; verdict: Verdict };

/**
 * Cheia unei operatii. Un singur loc care o compune, ca sa nu apara doua forme.
 *
 * `furnizor` intra in cheie chiar daca e si coloana separata: doua case de
 * facturare pe aceeasi comanda sunt operatii DIFERITE si amandoua au voie sa se
 * intample. Fara el, emiterea la Oblio ar bloca-o pe cea la SmartBill.
 */
export function cheieOperatie(
  fel: FelOperatie,
  furnizor: FurnizorOperatie,
  discriminant: string,
): string {
  return `${fel}:${furnizor}:${discriminant}`;
}

/**
 * Ruleaza un apel extern sub protectia registrului.
 *
 * `clasifica` e OBLIGATORIU in semnatura, chiar daca multi apelanti vor intoarce
 * mereu "necunoscut". Motivul e cel de la `slotFacturare`: asa `tsc` enumera
 * apelantii si nimeni nu poate uita sa se gandeasca la el — adica exact omisiunea
 * din care se naste duplicatul. Scrie-l citind wrapperul furnizorului, nu din cap.
 */
export async function cuRegistru<T>(
  admin: SupabaseClient<Database>,
  cerere: CerereOperatie,
  executa: () => Promise<RodOperatie<T>>,
  clasifica: (e: unknown) => Verdict,
  /**
   * „Mai e vie legatura pe care ar adopta-o?"
   *
   * ⚠ FARA ASTA, O ELIBERARE PICATA INVIE UN DOCUMENT MORT.
   *
   * Anularea unui AWB elibereaza slotul prin `marcheazaAnulata`. Dar acela e un al
   * doilea dus-intors, si poate pica — caz in care randul ramane `reusit` desi la
   * curier nu mai exista nimic. Urmatoarea emitere ar primi `deja` si ar scrie
   * inapoi pe comanda AWB-ul ANULAT: transport inexistent, marfa care nu pleaca.
   *
   * Apelantul stie ce e pe comanda ACUM. Daca spune ca legatura nu mai exista,
   * randul e vechi: se elibereaza aici si rezervarea se reia O SINGURA data.
   * Asa greseala se repara singura la prima incercare de dupa, in loc sa astepte
   * o interventie in baza.
   *
   * Se lasa nedat acolo unde adoptarea e mereu corecta (facturile: numarul lor nu
   * se sterge de pe comanda decat printr-o reemitere, care are oricum alta cheie).
   */
  legaturaVie?: (referinta: string | null) => Promise<boolean>,
): Promise<RezultatOperatie<T>> {
  const r1 = await incearca(admin, cerere, executa, clasifica);

  if (r1.fel === "deja" && legaturaVie) {
    const vie = await legaturaVie(r1.referinta);
    if (!vie) {
      await logError({
        action: "cuRegistru.slotVechi",
        message: `Registrul avea ${cerere.fel} ${cerere.furnizor} ca reusita (${r1.referinta}), dar comanda nu o mai poarta — probabil o anulare a carei eliberare s-a pierdut. Eliberez si reiau.`,
        details: { cheie: cerere.cheie, orderId: cerere.orderId, referinta: r1.referinta },
        businessId: cerere.businessId ?? undefined,
        severity: "warning",
      });
      await marcheazaAnulata(admin, cerere.businessId, cerere.cheie);
      // O SINGURA reluare: daca nici acum nu se rezerva, altceva e in joc si
      // apelantul primeste raspunsul stabil, nu o bucla.
      return incearca(admin, cerere, executa, clasifica);
    }
  }

  return r1;
}

async function incearca<T>(
  admin: SupabaseClient<Database>,
  cerere: CerereOperatie,
  executa: () => Promise<RodOperatie<T>>,
  clasifica: (e: unknown) => Verdict,
): Promise<RezultatOperatie<T>> {
  const { data: rez, error: eRez } = await admin.rpc("rezerva_operatie_externa", {
    p_business_id: cerere.businessId,
    p_order_id: cerere.orderId,
    p_fel: cerere.fel,
    p_furnizor: cerere.furnizor,
    p_cheie: cerere.cheie,
  });

  const r = rez as {
    rezervat?: boolean; id?: string; motiv?: string;
    referinta_externa?: string | null; detalii?: Json | null;
    incercari?: number; creat_la?: string;
  } | null;

  /*
   * ⚠ REGISTRUL INDISPONIBIL OPRESTE APELUL. E invers decat la `stripe_events`.
   *
   * Acolo regula e „procesez fara dedupe", si e corecta: un eveniment Stripe
   * pierdut nu mai vine niciodata, deci un duplicat rar bate o plata pierduta.
   *
   * Aici e pe dos. Operatia e pornita de OM, cu buton, si se poate relua peste
   * un minut fara sa se piarda nimic — iar raul de evitat e chiar duplicatul: un
   * AWB platit a doua oara, sau o a doua factura la ANAF. Deci cand nu putem
   * garanta unicitatea, nu chemam furnizorul.
   *
   * Regula generala, pentru cand se cableaza si caile de webhook: daca apelantul
   * POATE relua, refuza; daca nu poate (webhook care nu mai vine), continua.
   */
  if (eRez || !r) {
    await logError({
      action: "cuRegistru.rezerva",
      message: `Registrul de operatii externe nu a raspuns; ${cerere.fel} ${cerere.furnizor} NU a fost trimis: ${eRez?.message ?? "raspuns gol"}`,
      details: { cheie: cerere.cheie, orderId: cerere.orderId, code: eRez?.code },
      businessId: cerere.businessId ?? undefined,
      severity: "critical",
    });
    return {
      fel: "eroare",
      verdict: "esuat", // nu s-a chemat nimic, deci nimic de lamurit la furnizor
      mesaj: "Nu am putut porni operatia in siguranta. Incearca din nou peste un minut.",
    };
  }

  if (r.rezervat !== true) {
    if (r.motiv === "reusit") {
      return { fel: "deja", referinta: r.referinta_externa ?? null, detalii: r.detalii ?? null };
    }
    return {
      fel: "blocat",
      cheie: cerere.cheie,
      operatieId: r.id ?? null,
      mesaj: mesajBlocat(r.motiv, cerere, r.incercari),
    };
  }

  const operatieId = r.id as string;

  let rod: RodOperatie<T>;
  try {
    rod = await executa();
  } catch (e) {
    const verdict = clasifica(e);
    const mesaj = e instanceof Error ? e.message : String(e);
    await incheie(admin, cerere, operatieId, verdict, null, null, mesaj);
    return { fel: "eroare", mesaj, verdict };
  }

  /*
   * Efectul extern S-A PRODUS. De aici incolo nu mai avem voie sa raportam esec pe
   * baza a ce se intampla in baza noastra — de aceea incheierea nu poate schimba
   * rezultatul intors apelantului.
   *
   * Si daca incheierea pica, randul ramane `in_curs`: a doua apasare va fi
   * REFUZATA cu cheia in mesaj, in loc sa cheme furnizorul din nou. Chiar asta e
   * garantia pentru care exista registrul — cazul cel mai prost nu mai e un
   * duplicat, ci o operatie de lamurit.
   */
  await incheie(admin, cerere, operatieId, "reusit", rod.referinta, rod.detalii ?? null, null);
  return { fel: "facut", valoare: rod.valoare, operatieId, referinta: rod.referinta };
}

async function incheie(
  admin: SupabaseClient<Database>,
  cerere: CerereOperatie,
  operatieId: string,
  stare: "reusit" | Verdict,
  referinta: string | null,
  detalii: Json | null,
  eroare: string | null,
): Promise<void> {
  const { data, error } = await admin.rpc("incheie_operatie_externa", {
    p_id: operatieId,
    p_business_id: cerere.businessId,
    p_stare: stare,
    p_referinta_externa: referinta,
    p_detalii: detalii ?? undefined,
    p_eroare: eroare,
  });

  const r = data as { gasit?: boolean; deja?: boolean; stare?: string } | null;
  /*
   * `gasit: true, deja: true` inseamna ca randul era DEJA intr-o stare stabila si
   * incheierea NU a scris nimic. E un succes doar pentru cine se uita la `gasit`.
   *
   * Aici conteaza: daca tocmai am obtinut un AWB real si scrierea lui in registru
   * a fost inghitita pentru ca alta cale incheiase randul intre timp, atunci
   * referinta pe care o avem in mana nu s-a inregistrat nicaieri. E fix starea pe
   * care registrul exista sa n-o mai lase tacuta.
   */
  const ok = r?.gasit === true && r?.deja !== true;
  if (error || !ok) {
    await logError({
      action: "cuRegistru.incheie",
      message:
        stare === "reusit"
          ? `${cerere.fel} ${cerere.furnizor} A REUSIT la furnizor (${referinta}), dar registrul nu s-a putut incheia. Operatia ramane in curs si va bloca o a doua incercare.`
          : `${cerere.fel} ${cerere.furnizor} s-a incheiat cu ${stare}, dar registrul nu a inregistrat.`,
      details: { operatieId, cheie: cerere.cheie, orderId: cerere.orderId, referinta, code: error?.code },
      businessId: cerere.businessId ?? undefined,
      severity: "critical",
    });
  }
}

/**
 * Mesajul pentru comerciant cand operatia e blocata.
 *
 * ACTIONABIL, nu „a esuat": spune ce s-a intamplat, de ce nu reincercam singuri si
 * ce are de facut. Un mesaj care nu lasa nicio miscare de facut il impinge exact
 * catre butonul pe care nu vrem sa-l apese — vezi si `slotFacturare`, unde lectia
 * a fost aceeasi.
 */
function mesajBlocat(
  motiv: string | undefined,
  cerere: CerereOperatie,
  incercari: number | undefined,
): string {
  const nume = numeOperatie(cerere.fel);
  switch (motiv) {
    case "in_curs":
      return `${nume} pentru aceasta comanda este deja in lucru la ${cerere.furnizor}${
        incercari && incercari > 2 ? ` (a ${incercari}-a incercare)` : ""
      }. Nu trimitem a doua oara ca sa nu se creeze un duplicat. Daca a ramas asa, verifica in contul ${cerere.furnizor} dupa comanda si deblocheaza operatia din pagina comenzii.`;
    case "necunoscut":
      return `${nume} a fost trimisa catre ${cerere.furnizor}, dar raspunsul nu a ajuns, deci nu stim daca s-a facut. Verifica in contul ${cerere.furnizor} inainte de a incerca din nou: daca exista deja, o a doua incercare ar produce un duplicat.`;
    case "alt magazin":
    case "comanda negasita":
      return "Comanda nu apartine acestui magazin.";
    case "cursa":
      return "Operatia tocmai s-a incheiat pe alt drum. Reincarca pagina.";
    default:
      return `Operatia nu a putut fi pornita (${motiv ?? "motiv necunoscut"}).`;
  }
}

function numeOperatie(fel: FelOperatie): string {
  switch (fel) {
    case "awb": return "Emiterea AWB";
    case "anulare_awb": return "Anularea AWB";
    case "ridicare": return "Comanda de ridicare";
    case "factura": return "Emiterea facturii";
    case "proforma": return "Emiterea proformei";
    case "storno": return "Stornarea";
    case "anulare_document": return "Anularea documentului";
    case "plata": return "Plata";
    case "incasare": return "Incasarea";
    case "rambursare": return "Rambursarea";
    case "publicare": return "Publicarea pe marketplace";
    case "retragere": return "Retragerea de pe marketplace";
    case "expediere": return "Confirmarea expedierii";
    case "proba": return "Proba";
  }
}

/**
 * Verdictul implicit: NU STIM.
 *
 * Se foloseste acolo unde wrapperul furnizorului arunca acelasi `Error` si pentru
 * un refuz, si pentru o cadere de retea, si n-avem cum sa le deosebim din afara.
 * A bloca din prudenta e recuperabil — omul primeste cheia si verifica. A debloca
 * din greseala nu e.
 */
export const nuStim = (): Verdict => "necunoscut";

/**
 * „Operatia asta a fost ANULATA la furnizor, elibereaza slotul."
 *
 * ⚠ FARA ASTA, REGISTRUL INVIE DOCUMENTE MOARTE.
 *
 * Cheia unui AWB e `awb:<furnizor>:<orderId>`, fara discriminant — dar AWB-urile
 * se anuleaza, si dupa anulare comanda are voie sa primeasca altul. Fara eliberare,
 * randul ramanea `reusit`, iar a doua emitere intra pe ramura „adopta rezultatul"
 * si scria pe comanda numarul AWB-ului ANULAT: un transport care nu mai exista la
 * curier, si marfa care nu pleaca niciodata.
 *
 * Se cheama DUPA ce furnizorul a confirmat anularea, niciodata inainte.
 *
 * `false` nu e o eroare in sine: o comanda de dinaintea registrului nu are ce sa
 * elibereze. Apelantul decide daca il intereseaza — la AWB il intereseaza, fiindca
 * un esec aici blocheaza urmatoarea emitere.
 */
export async function marcheazaAnulata(
  admin: SupabaseClient<Database>,
  businessId: string | null,
  cheie: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("marcheaza_operatie_anulata", {
    p_business_id: businessId,
    p_cheie: cheie,
  });
  if (error) {
    console.error("[registru] eliberarea slotului dupa anulare a esuat:", cheie, error.message);
    return false;
  }
  return (data as { gasit?: boolean } | null)?.gasit === true;
}

// ─── Supapa: operatii ramase atarnate ────────────────────────────────────────
//
// ⚠ Supapa NU e o etapa urmatoare, e parte din aceeasi livrare.
//
// Un registru care poate bloca fara sa poata debloca ar fi mai rau decat lipsa
// lui: prima cadere de retea ar lasa o comanda fara AWB pana la o interventie in
// baza. `in_curs` nu expira singur, si asta e deliberat (expirarea automata ar
// reface exact operatia pe care furnizorul a apucat-o) — deci trebuie sa existe
// un om care spune „am verificat, nu exista acolo".

export interface OperatieAtarnata {
  id: string;
  fel: FelOperatie;
  furnizor: FurnizorOperatie;
  stare: "in_curs" | "necunoscut";
  cheie: string;
  incercari: number;
  ultimaEroare: string | null;
  creatLa: string;
}

/**
 * ⚠ Cat asteptam inainte sa numim o operatie `in_curs` „atarnata".
 *
 * Fara pragul asta, panoul ar arata ca „ramasa neterminata" chiar operatia care
 * TOCMAI a plecat si inca asteapta raspunsul — SmartBill si curierii raspund in
 * secunde bune, iar pagina se poate reincarca intre timp. Si ar oferi, langa ea,
 * butonul „Am verificat, deblocheaza": comerciantul l-ar apasa, ar debloca o
 * operatie care in acel moment CHIAR se executa, si a doua apasare ar produce
 * exact duplicatul pe care tot mecanismul il inchide.
 *
 * Trei minute e mult peste orice apel real (limita de timp a functiilor e sub
 * atat) si destul de scurt cat sa nu tina comerciantul in ceata.
 *
 * `necunoscut` NU are prag: acolo apelul s-a incheiat deja, doar raspunsul a fost
 * neinteligibil. Nu mai avem ce astepta.
 */
export const PRAG_ATARNATA_MS = 3 * 60 * 1000;

/**
 * Se vede operatia asta in panou?
 *
 * Sta separat, ca functie pura, DINADINS. Varianta dintai punea conditia intr-un
 * `.or("stare.eq.necunoscut,and(stare.eq.in_curs,creat_la.lt.…)")` — sintaxa
 * PostgREST, pe care n-o pot proba local (cheile Supabase din `.env.local` sunt
 * goale). Iar aici o gresala de sintaxa nu da eroare, da LISTA GOALA: supapa ar
 * fi disparut fara ca nimeni sa afle.
 *
 * Interogarea aduce acum ambele stari — sunt cel mult cateva randuri pe comanda —
 * si pragul se decide aici, unde se poate proba cu un test.
 */
export function eAtarnata(
  op: { stare: "in_curs" | "necunoscut"; creatLa: string },
  acum: number = Date.now(),
): boolean {
  if (op.stare === "necunoscut") return true;
  const t = Date.parse(op.creatLa);
  // Data necitibila: o aratam. Mai bine un chenar in plus decat o operatie ascunsa.
  if (Number.isNaN(t)) return true;
  return acum - t >= PRAG_ATARNATA_MS;
}

/** Ce sta atarnat pe o comanda, pentru pagina ei. Lista goala e cazul normal. */
export async function operatiiAtarnate(
  admin: SupabaseClient<Database>,
  businessId: string,
  orderId: string,
): Promise<OperatieAtarnata[]> {
  /*
   * Clientul NU se mai ingusteaza aici: `operatii_externe` e acum in tipurile
   * generate, deci si numele tabelei si al fiecarei coloane sunt verificate.
   * Pana acum se scria `admin as unknown as SupabaseClient`, iar sub el
   * `.select("coloana_inexistenta")` ar fi trecut nevazut.
   */
  const { data, error } = await admin
    .from("operatii_externe")
    .select("id, fel, furnizor, stare, cheie, incercari, ultima_eroare, creat_la")
    .eq("business_id", businessId)
    .eq("order_id", orderId)
    .in("stare", ["in_curs", "necunoscut"])
    .order("creat_la", { ascending: false });

  if (error) {
    console.error("[registru] nu am putut citi operatiile atarnate:", error.message);
    return [];
  }
  return (data ?? [])
    .map((r: Record<string, unknown>) => ({
      id: String(r.id),
      fel: r.fel as FelOperatie,
      furnizor: r.furnizor as FurnizorOperatie,
      stare: r.stare as "in_curs" | "necunoscut",
      cheie: String(r.cheie),
      incercari: Number(r.incercari ?? 0),
      ultimaEroare: (r.ultima_eroare as string | null) ?? null,
      creatLa: String(r.creat_la),
    }))
    .filter((op) => eAtarnata(op));
}

/**
 * „Am verificat la furnizor, operatia nu exista acolo. Da-mi voie sa reincerc."
 *
 * Marcheaza randul `esuat`, deci nu mai blocheaza. Apelantul TREBUIE sa fi
 * verificat mai intai ca omul detine magazinul: functia din baza verifica
 * `business_id`, dar nu are de unde sti cine e omul.
 *
 * Se scrie in `admin_audit_log` la apelant, nu aici: deblocarea e o decizie
 * asumata, si trebuie sa se stie cine a luat-o.
 */
export async function deblocheazaOperatie(
  admin: SupabaseClient<Database>,
  /** `null` pentru operatiile platformei — vezi `CerereOperatie.businessId`. */
  businessId: string | null,
  operatieId: string,
  motiv: string,
): Promise<{ ok: true; stabilizata: boolean } | { ok: false; mesaj: string }> {
  const { data, error } = await admin.rpc("incheie_operatie_externa", {
    p_id: operatieId,
    p_business_id: businessId,
    p_stare: "esuat",
    p_eroare: `deblocat de comerciant: ${motiv}`.slice(0, 500),
  });

  const r = data as { gasit?: boolean; deja?: boolean; stare?: string } | null;
  if (error || r?.gasit !== true) {
    return { ok: false, mesaj: "Nu am putut debloca operatia. Reincarca pagina si incearca din nou." };
  }

  /*
   * `deja: true` = operatia s-a incheiat SINGURA intre afisarea panoului si
   * apasare, deci deblocarea n-a scris nimic.
   *
   * Nu e o eroare — dar nici „poti incerca din nou" nu e adevarat: daca s-a
   * stabilizat pe `reusit`, randul blocheaza in continuare, si pe buna dreptate.
   * Apelantul primeste steagul ca sa nu spuna o minciuna linistitoare.
   */
  return { ok: true, stabilizata: r.deja === true };
}
