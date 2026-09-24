"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import {
  criteriiGoale, criteriiValide, felValid, numeValid,
  type CriteriiSegment, type FelSegment,
} from "@/lib/customers/segmente";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEGMENTELE SALVATE ALE MAGAZINULUI                            (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ AUTORIZAREA O FACE RLS, ca la restul paginii de clienti: politica de pe
 * `customer_segments` cere ca magazinul sa fie al celui logat. Un `businessId`
 * strain nu scrie nimic si nu citeste nimic — nu fiindca verificam noi aici, ci
 * fiindca baza refuza. De-aia se foloseste clientul OBISNUIT, nu cel de
 * administrare: cu cheia de serviciu, RLS n-ar mai apara nimic, si singura paza
 * ar fi ramas un `if` din fisierul asta.
 *
 * ⚠ CRITERIILE SE CURATA INCA O DATA AICI. Vin din browser, deci sunt date
 * straine, oricat de curate le-ar fi trimis pagina noastra.
 */

/** Cate segmente poate avea un magazin. */
const CATE_INCAP = 50;

export interface SegmentSalvat {
  id: string;
  nume: string;
  fel: FelSegment;
  criterii: CriteriiSegment;
  creatLa: string;
  /** Cati oameni are lista, pentru segmentele cu `fel = "lista"`. */
  cati?: number;
}

export async function salveazaSegment(
  businessId: string,
  numeBrut: string,
  criteriiBrute: unknown,
): Promise<{ segment: SegmentSalvat } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie să fii autentificat." };

  const n = numeValid(numeBrut);
  if ("eroare" in n) return { error: n.eroare };

  const criterii = criteriiValide(criteriiBrute);
  /*
    ⚠ UN SEGMENT FARA NICIUN FILTRU E O CAPCANA: se salveaza, apare in lista cu
    un nume care promite o multime ingusta, si deschide tot magazinul. Nimeni
    n-ar avea de unde sa banuiasca, fiindca lista chiar are clienti in ea.
  */
  if (criteriiGoale(criterii)) {
    return { error: "Pune întâi un filtru: un segment fără filtre e tot magazinul." };
  }

  /*
    ⚠ Plafonul se numara INAINTE de scriere, si numai pe magazinul asta. Fara el,
    un buton apasat de cincizeci de ori lasa cincizeci de randuri pe care nu le
    mai citeste nimeni, si fila devine de nefolosit.
  */
  const { count } = await supabase
    .from("customer_segments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if ((count ?? 0) >= CATE_INCAP) {
    return { error: `Ai deja ${CATE_INCAP} de segmente salvate. Șterge unul înainte să adaugi altul.` };
  }

  const { data, error } = await supabase
    .from("customer_segments")
    .insert({
      business_id: businessId,
      nume: n.nume,
      fel: "criterii",
      criterii: {
        segment: criterii.segment, valoare: criterii.valoare, q: criterii.q,
        judet: criterii.judet, canal: criterii.canal, cont: criterii.cont,
      },
      creat_de: user.id,
    })
    .select("id, nume, fel, criterii, creat_la")
    .single();

  if (error) {
    /*
      ⚠ Numele dublu are mesajul LUI. Indexul unic din baza da un cod anume
      (`23505`); trecut prin „eroare la salvare”, omul ar fi incercat din nou cu
      acelasi nume, la nesfarsit.
    */
    if (error.code === "23505") {
      return { error: `Ai deja un segment cu numele „${n.nume}”.` };
    }
    logError({ action: "salveazaSegment", message: error.message, businessId });
    return { error: "Nu am putut salva segmentul." };
  }

  revalidatePath("/dashboard/customers");
  return {
    segment: {
      id: data.id,
      nume: data.nume,
      fel: felValid(data.fel),
      criterii: criteriiValide(data.criterii),
      creatLa: data.creat_la,
    },
  };
}

export async function stergeSegment(
  businessId: string,
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie să fii autentificat." };

  const { error } = await supabase
    .from("customer_segments")
    .delete()
    .eq("id", id)
    /* Aparare in adancime: un id ratacit nu poate atinge alt magazin. */
    .eq("business_id", businessId);

  if (error) {
    logError({ action: "stergeSegment", message: error.message, businessId });
    return { error: "Nu am putut șterge segmentul." };
  }

  /*
    ⚠ NU SE STERGE NICIUN CLIENT. Un segment e o intrebare pusa datelor, nu un
    dosar cu oameni in el: scos, oamenii raman toti acolo unde erau. Scris aici
    fiindca butonul spune „Șterge” si langa el sta o cifra cu oameni.
  */
  revalidatePath("/dashboard/customers");
  return { ok: true };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEGMENTUL CU LISTA FIXA                                       (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Al doilea fel de segment, cerut ca acțiune în masă: „adaugă într-un segment".
 *
 * ⚠⚠ ȘI E CHIAR CAPCANA DE CARE SE FEREAU PRIMELE. Un segment cu criterii se
 * recalculează singur; unul cu listă rămâne cum a fost în clipa bifării: cine
 * cumpără mâine NU intră, iar cine s-a dezabonat RĂMÂNE. Proprietarul a fost
 * întrebat și a ales-o oricum, deci se face — dar deosebirea se scrie pe ecran,
 * lângă fiecare astfel de segment, cu data listei.
 */

/** Cati oameni incap intr-o lista. Acelasi plafon ca la anonimizare. */
const CATI_INCAP_IN_LISTA = 500;

export async function salveazaListaDeClienti(
  businessId: string,
  numeBrut: string,
  chei: string[],
): Promise<{ segment: SegmentSalvat } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie să fii autentificat." };

  const n = numeValid(numeBrut);
  if ("eroare" in n) return { error: n.eroare };

  /* ⚠ Vin din browser: se curata, se scot dubletele, se plafoneaza. */
  const curate = [...new Set(chei.filter((c) => typeof c === "string" && c.trim() !== ""))];
  if (curate.length === 0) return { error: "N-ai bifat niciun client." };
  if (curate.length > CATI_INCAP_IN_LISTA) {
    return { error: `Maximum ${CATI_INCAP_IN_LISTA} de clienți într-o listă.` };
  }

  const { count } = await supabase
    .from("customer_segments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if ((count ?? 0) >= CATE_INCAP) {
    return { error: `Ai deja ${CATE_INCAP} de segmente salvate. Șterge unul înainte să adaugi altul.` };
  }

  const { data, error } = await supabase
    .from("customer_segments")
    .insert({
      business_id: businessId,
      nume: n.nume,
      fel: "lista",
      /* ⚠ Criteriile raman goale: lista NU e o intrebare, e un raspuns inghetat. */
      criterii: {},
      creat_de: user.id,
    })
    .select("id, nume, fel, criterii, creat_la")
    .single();

  if (error) {
    if (error.code === "23505") return { error: `Ai deja un segment cu numele „${n.nume}”.` };
    logError({ action: "salveazaListaDeClienti", message: error.message, businessId });
    return { error: "Nu am putut salva lista." };
  }

  /*
    ⚠ OAMENII SE SCRIU DUPA SEGMENT, si o cadere aici lasa un segment GOL, nu
    unul pe jumatate. Gol se vede pe ecran („0 clienți") si se poate sterge; pe
    jumatate ar fi trecut neobservat si ar fi plecat o campanie catre o parte din
    cine trebuia.
  */
  const { error: eMembri } = await supabase
    .from("customer_segment_members")
    .insert(curate.map((cheie) => ({ segment_id: data.id, cheie })));

  if (eMembri) {
    logError({ action: "salveazaListaDeClienti.membri", message: eMembri.message, businessId });
    /* Se sterge segmentul gol, ca sa nu ramana o promisiune fara continut. */
    await supabase.from("customer_segments").delete().eq("id", data.id).eq("business_id", businessId);
    return { error: "Nu am putut scrie lista de clienți. Nu s-a salvat nimic." };
  }

  revalidatePath("/dashboard/customers");
  return {
    segment: {
      id: data.id,
      nume: data.nume,
      fel: "lista",
      criterii: criteriiValide(data.criterii),
      creatLa: data.creat_la,
      cati: curate.length,
    },
  };
}
