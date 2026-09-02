import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import type { EvenimentEdinio } from "../evenimente";
import type { ContextTrimitere } from "./sarcina-tiktok";
import { dupaEsec, candSeReincearca } from "./ritm-reincercari";
import type { Json } from "@/types/database.types";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  COADA DE CONVERSII: PUNEREA, REVENDICAREA, INCHEIEREA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE O COADA SI NU O TRIMITERE PE LOC. Actiunea care creeaza un cont sau
  primeste o cerere de oferta n-are voie sa astepte dupa serverele Meta sau
  TikTok: un raspuns lent al lor ar incetini inscrierea omului, iar unul picat ar
  trebui reincercat de undeva. Coada desparte cele doua vieti.
*/

export type Destinatie = "meta" | "tiktok";

/** Ce se pastreaza langa eveniment, ca sa se poata construi mesajul mai tarziu. */
export type SarcinaPastrata = {
  ev: EvenimentEdinio;
  ctx: ContextTrimitere;
  /** Samanta din care iese `external_id`-ul furnizorului. Niciodata un email. */
  amprentaOmului: string;
  /*
    ⚠ CLIPA IN CARE S-A PETRECUT, nu cea in care se trimite.

    Calculata la trimitere, un rand care asteapta in coada si se reincearca ore in
    sir ar fi raportat cu ceasul de atunci. Furnizorii atribuie conversia dupa
    `event_time`: o inscriere de marti seara ar cadea miercuri dimineata, pe alta
    campanie — sau, dupa sapte zile, ar fi respinsa de tot.

    Optionala fiindca randurile puse la coada inainte de reparatia asta n-o au.
  */
  cand?: string;
};

export type RandDeTrimis = {
  id: string;
  destinatie: Destinatie;
  nume_eveniment: string;
  event_id: string;
  sarcina: SarcinaPastrata;
  incercari: number;
};

const TABELA = "edinio_conversion_outbox";

/*
  ⚠ SE PASTREAZA EVENIMENTUL, NU MESAJUL GATA FACUT.

  Daca am fi pastrat mesajul construit, o reparatie a cartografierii (si azi am
  facut doua) n-ar fi atins randurile deja puse la coada — ar fi plecat cu forma
  veche, ore mai tarziu, si nimic n-ar fi aratat de ce. Asa, mesajul se cladeste
  la trimitere, din cartografierea de atunci.
*/
export async function puneLaCoada(
  ev: EvenimentEdinio,
  sarcina: Omit<SarcinaPastrata, "ev">,
  destinatii: readonly Destinatie[],
): Promise<void> {
  const eventId = (ev as { event_id?: string }).event_id;
  if (!eventId) return;
  if (destinatii.length === 0) return;

  const cand = new Date().toISOString();
  const randuri = destinatii.map(d => ({
    destinatie: d,
    nume_eveniment: ev.name,
    event_id: eventId,
    sarcina: { ev, cand, ...sarcina } as unknown as Json,
  }));

  try {
    /*
      ⚠ `ignoreDuplicates` PESTE INDEXUL UNIC. Idempotenta sta in baza, nu aici:
      o a doua punere la coada pentru acelasi (destinatie, eveniment, event_id) nu
      creeaza un al doilea rand. Deci nici o actiune reluata, nici o pagina
      reincarcata nu produc doua conversii.
    */
    await createAdminClient().from(TABELA).upsert(randuri, {
      onConflict: "destinatie,nume_eveniment,event_id",
      ignoreDuplicates: true,
    });
  } catch (e) {
    /*
      ⚠ O COADA CARE NU PRIMESTE N-ARE VOIE SA STRICE INSCRIEREA. Masuratoarea e
      a doua in ordinea importantei; omul care isi face cont e prima. Se scrie in
      jurnal si se merge mai departe.
    */
    await logError({
      action: "conversii.puneLaCoada",
      message: e instanceof Error ? e.message : "punerea la coada a esuat",
      details: { eveniment: ev.name, destinatii: [...destinatii] },
      severity: "warning",
    });
  }
}

/**
 * Ia din coada ce e de trimis ACUM, si il marcheaza ca luat.
 *
 * ═══ ⚠ DE CE REVENDICAREA E O SCRIERE, NU O CITIRE ═══
 *
 * Doua rulari de cron se pot suprapune — Vercel nu garanteaza ca una s-a incheiat
 * inainte sa porneasca urmatoarea. Daca fiecare ar CITI randurile scadente si
 * apoi le-ar trimite, amandoua ar trimite aceleasi conversii.
 *
 * Aici randurile se iau printr-un UPDATE care le impinge programarea inainte, si
 * se intorc chiar randurile actualizate. Postgres serializeaza scrierile pe
 * acelasi rand: a doua rulare asteapta, apoi isi reevalueaza filtrul si nu mai
 * gaseste nimic — fiindca prima a mutat deja `next_retry_at`.
 *
 * ⚠ SI DE CE „INAINTE CU UN MINUT" SI NU O INCUIETOARE SEPARATA: daca rularea
 * moare la jumatate, randul se elibereaza singur peste un minut. O incuietoare
 * ar fi trebuit desfacuta de cineva, iar cine moare nu desface nimic.
 */
export async function revendica(limita: number): Promise<RandDeTrimis[]> {
  /*
    ⚠ NUMELE ARGUMENTULUI (`limita`) TREBUIE SA FIE EXACT. PostgREST alege functia
    dupa numele argumentelor, nu dupa pozitie: scris gresit, apelul trece de
    typecheck si de build, si cade abia la prima rulare.
  */
  const { data, error } = await createAdminClient()
    .rpc("edinio_revendica_conversii", { limita });

  if (error) {
    await logError({
      action: "conversii.revendica",
      message: error.message,
      severity: "error",
    });
    return [];
  }
  return (data ?? []) as unknown as RandDeTrimis[];
}

export async function marcheazaTrimis(id: string): Promise<void> {
  await createAdminClient().from(TABELA)
    .update({ trimis_la: new Date().toISOString(), ultima_eroare: null })
    .eq("id", id);
}

/**
 * Dupa un esec: se programeaza urmatoarea incercare, sau se abandoneaza.
 *
 * ⚠ MOTIVUL SE PASTREAZA SI LA ABANDON. Un rand abandonat fara motiv scris e o
 * conversie pierduta despre care nu se mai poate afla nimic — iar peste o luna
 * nimeni nu mai stie daca a fost o pana a lor sau o greseala a noastra.
 */
export async function marcheazaEsuat(id: string, incercariDeAcum: number, eroare: string): Promise<void> {
  const h = dupaEsec(incercariDeAcum);
  const comun = { incercari: incercariDeAcum, ultima_eroare: eroare.slice(0, 500) };

  await createAdminClient().from(TABELA).update(
    h.fel === "abandoneaza"
      ? { ...comun, abandonat_la: new Date().toISOString() }
      : { ...comun, next_retry_at: candSeReincearca(new Date(), h.pesteMinute) },
  ).eq("id", id);
}
