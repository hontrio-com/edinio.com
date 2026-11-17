import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  STARI_EXPORT, type CasaFacturare, type ExportJurnal, type StareExport, type SursaExport, type TipDocumentSaga,
} from "./config";

/*
 * FARA "use server" AICI, INTENTIONAT: intr-un modul „use server" fiecare export devine un capat
 * HTTP public. Functiile de mai jos scriu cu cheia de SERVICIU dupa un `businessId` primit ca
 * argument; expuse, ar fi lasat pe oricine sa scrie in jurnalul altui magazin.
 */

/**
 * Jurnalul exporturilor in SAGA (`public.saga_exporturi`): cate un rand pe INCERCARE, cu ce a
 * raspuns SAGA. Il citesc panoul comenzii (ce s-a intamplat cu documentul) si cronul (ce nu mai
 * pleaca singur).
 *
 * ⚠ NU E REGISTRUL. Registrul de operatii externe (`operatii_externe`) e cel care nu lasa acelasi
 * document sa plece de doua ori; jurnalul doar POVESTESTE. Un rand de jurnal pierdut nu deschide
 * drumul unui duplicat, cel mult lasa panoul fara raportul SAGA.
 *
 * Numele coloanelor se tin in `COLOANE_JURNAL`, intr-un singur loc; tipurile tabelei sunt in
 * `database.types.ts` (`saga_exporturi`).
 *
 * ⚠ FARA DATE PERSONALE IN PLUS: nu se scrie XML-ul (are numele si adresa clientului), ci doar
 * identitatea documentului, starea si raportul SAGA (taiat). Raportul poate pomeni numele
 * clientului: e al magazinului si numai el il vede (RLS).
 */

const TABELA = "saga_exporturi";
const COLOANE_JURNAL =
  "id, order_id, cheie, casa, tip, serie, numar, data_document, total, stare, cod_http, import_automat, sursa, fisier, mesaj, raport, creat_la";

/** Plafoanele, aceleasi ca in constrangerile tabelei (migratia `2027-02-06-factureaza-easybill-saga.sql`). */
const PLAFON_MESAJ = 1_000;
const PLAFON_RAPORT = 4_000;

/** Cate chei intra intr-un `.in()`: adresa unei cereri PostgREST are limita de lungime. */
const CHEI_PE_CERERE = 80;

export interface RandJurnalNou {
  businessId: string;
  orderId: string | null;
  cheie: string;
  casa: CasaFacturare;
  tip: TipDocumentSaga;
  serie: string;
  numar: string;
  /** „YYYY-MM-DD", sau `null` cand nu s-a putut afla (atunci starea e `nepregatit`). */
  dataDocument: string | null;
  /** Totalul cu TVA trimis (cu semn), sau `null` cand fisierul nu s-a compus. */
  total: number | null;
  stare: StareExport;
  codHttp: number | null;
  importAutomat: boolean;
  sursa: SursaExport;
  fisier: string | null;
  mesaj: string | null;
  raport: string | null;
}

export interface RandJurnal extends ExportJurnal {
  id: string;
  orderId: string | null;
  cheie: string;
  casa: CasaFacturare;
  tip: TipDocumentSaga;
  serie: string;
  numar: string;
  dataDocument: string | null;
  total: number | null;
  importAutomat: boolean;
  fisier: string | null;
}

const taie = (v: string | null | undefined, max: number): string | null => {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Scrie o incercare. NU ARUNCA: jurnalul nu are voie sa transforme o trimitere reusita intr-un
 * esec (comerciantul ar retrimite). Intoarce `false` cand n-a scris, ca apelantul sa spuna in jurnalul
 * platformei.
 */
export async function scrieInJurnal(admin: SupabaseClient<Database>, r: RandJurnalNou): Promise<boolean> {
  try {
    const { error } = await admin.from(TABELA).insert({
      business_id: r.businessId,
      order_id: r.orderId,
      cheie: r.cheie,
      casa: r.casa,
      tip: r.tip,
      serie: r.serie.slice(0, 40),
      numar: r.numar.slice(0, 60),
      data_document: r.dataDocument,
      total: r.total,
      stare: r.stare,
      cod_http: r.codHttp,
      import_automat: r.importAutomat,
      sursa: r.sursa,
      fisier: taie(r.fisier, 200),
      mesaj: taie(r.mesaj, PLAFON_MESAJ),
      raport: taie(r.raport, PLAFON_RAPORT),
    });
    if (error) {
      console.error("[saga/jurnal] randul nu s-a scris:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[saga/jurnal] randul nu s-a scris:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

function dinRand(r: Record<string, unknown>): RandJurnal | null {
  const stare = String(r.stare ?? "") as StareExport;
  if (!STARI_EXPORT.includes(stare)) return null;
  const numar = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    id: String(r.id),
    orderId: (r.order_id as string | null) ?? null,
    cheie: String(r.cheie ?? ""),
    casa: String(r.casa ?? "") as CasaFacturare,
    tip: (r.tip === "storno" ? "storno" : "factura"),
    serie: String(r.serie ?? ""),
    numar: String(r.numar ?? ""),
    dataDocument: (r.data_document as string | null) ?? null,
    total: numar(r.total),
    stare,
    codHttp: numar(r.cod_http),
    importAutomat: r.import_automat === true,
    sursa: (r.sursa === "lot" || r.sursa === "automat" ? r.sursa : "manual") as SursaExport,
    fisier: (r.fisier as string | null) ?? null,
    mesaj: (r.mesaj as string | null) ?? null,
    raport: (r.raport as string | null) ?? null,
    creatLa: String(r.creat_la ?? ""),
  };
}

export type CitireJurnal = { ok: true; randuri: RandJurnal[] } | { ok: false };

/**
 * Incercarile unor documente, de la cea mai noua la cea mai veche.
 *
 * ⚠ `{ ok: false }` NU E „nimic trimis": o citire cazuta tratata drept lista goala ar fi lasat cronul
 * sa retrimita documente deja intrate (registrul le-ar opri, dar fiecare ar costa o rezervare si un
 * mesaj fals). Apelantul sare documentele, nu le trimite.
 */
export async function jurnalulCheilor(
  admin: SupabaseClient<Database>,
  businessId: string,
  chei: readonly string[],
): Promise<CitireJurnal> {
  const unice = [...new Set(chei.filter(Boolean))];
  const randuri: RandJurnal[] = [];
  for (let i = 0; i < unice.length; i += CHEI_PE_CERERE) {
    const { data, error } = await admin
      .from(TABELA)
      .select(COLOANE_JURNAL)
      .eq("business_id", businessId)
      .in("cheie", unice.slice(i, i + CHEI_PE_CERERE))
      .order("creat_la", { ascending: false })
      .limit(1000);
    if (error) {
      console.error("[saga/jurnal] citirea a cazut:", error.message);
      return { ok: false };
    }
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const x = dinRand(r);
      if (x) randuri.push(x);
    }
  }
  randuri.sort((a, b) => Date.parse(b.creatLa) - Date.parse(a.creatLa));
  return { ok: true, randuri };
}

/** Incercarile documentelor unei comenzi (pentru panou), de la cea mai noua. */
export async function jurnalulComenzii(
  admin: SupabaseClient<Database>,
  businessId: string,
  orderId: string,
): Promise<CitireJurnal> {
  const { data, error } = await admin
    .from(TABELA)
    .select(COLOANE_JURNAL)
    .eq("business_id", businessId)
    .eq("order_id", orderId)
    .order("creat_la", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[saga/jurnal] citirea comenzii a cazut:", error.message);
    return { ok: false };
  }
  const randuri = ((data ?? []) as Record<string, unknown>[]).map(dinRand).filter((x): x is RandJurnal => x !== null);
  return { ok: true, randuri };
}

/**
 * Ultima incercare a magazinului, oricare document. Cronul o intreaba ca sa nu treaca prin toate
 * documentele cu o cheie refuzata: daca ultima a fost `refuzat`, intai o proba de conexiune.
 */
export async function ultimaIncercareAMagazinului(
  admin: SupabaseClient<Database>,
  businessId: string,
): Promise<{ ok: true; rand: RandJurnal | null } | { ok: false }> {
  const { data, error } = await admin
    .from(TABELA)
    .select(COLOANE_JURNAL)
    .eq("business_id", businessId)
    .order("creat_la", { ascending: false })
    .limit(1);
  if (error) return { ok: false };
  const r = ((data ?? []) as Record<string, unknown>[])[0];
  return { ok: true, rand: r ? dinRand(r) : null };
}

/**
 * Raportul SAGA si mesajul nu supravietuiesc comenzii.
 *
 * ⚠ La stergerea comenzii, `order_id` devine NULL (`on delete set null`), dar randul ramane in jurnal
 * pana la 24 de luni. Raportul si mesajul pot pomeni clientul (le scrie SAGA), iar o comanda stearsa e,
 * de cele mai multe ori, o cerere de stergere a datelor. Identitatea documentului (casa, serie, numar,
 * starea) ramane: e a magazinului si nu numeste pe nimeni.
 */
export async function golesteRapoarteleComenzilorSterse(
  admin: SupabaseClient<Database>,
): Promise<{ ok: true } | { ok: false; mesaj: string }> {
  const { error } = await admin
    .from(TABELA)
    .update({ raport: null, mesaj: null })
    .is("order_id", null)
    .or("raport.not.is.null,mesaj.not.is.null");
  return error ? { ok: false, mesaj: error.message } : { ok: true };
}

/** Ultima incercare pe fiecare document, din randuri ordonate de la nou la vechi. */
export function ultimaPeCheie(randuri: readonly RandJurnal[]): Map<string, RandJurnal> {
  const m = new Map<string, RandJurnal>();
  for (const r of randuri) if (!m.has(r.cheie)) m.set(r.cheie, r);
  return m;
}

/** Cate incercari are fiecare document. */
export function incercariPeCheie(randuri: readonly RandJurnal[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of randuri) m.set(r.cheie, (m.get(r.cheie) ?? 0) + 1);
  return m;
}
