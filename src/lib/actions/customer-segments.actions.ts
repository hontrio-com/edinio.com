"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import { criteriiGoale, criteriiValide, numeValid, type CriteriiSegment } from "@/lib/customers/segmente";

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
  criterii: CriteriiSegment;
  creatLa: string;
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
      criterii: { segment: criterii.segment, valoare: criterii.valoare, q: criterii.q },
      creat_de: user.id,
    })
    .select("id, nume, criterii, creat_la")
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
