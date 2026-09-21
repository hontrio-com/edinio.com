"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import { stareAdaugareValida, type ClientNou, type StareAdaugare } from "@/lib/customers/gestionare";
import { CATI_DEODATA, citesteUrma, type UrmaAnonimizarii } from "@/lib/customers/anonimizare";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADAUGAREA DE MANA SI STERGEREA UNUI CONTACT (etapa G)         (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ TOATA JUDECATA E IN BAZA, in `customer_add_manual` si
 * `customer_delete_contact`. Fisierul asta duce si aduce, atat.
 *
 * Si asta fiindca acolo se naste cheia clientului (`customers.key` e coloana
 * GENERATA, iar `order_customer_key` face acelasi lucru pentru comenzi). Ca sa
 * hotarasc din JavaScript daca omul exista deja, ar fi trebuit sa rescriu
 * `normalize_phone` — a treia copie a aceleiasi reguli, pe chiar drumul pe care
 * se hotaraste daca stergem pe cineva.
 *
 * ⚠ CLIENTUL OBISNUIT, nu cel de administrare: functiile sunt `security invoker`,
 * deci RLS de pe `customers` si `orders` le margineste la magazinul celui logat.
 * Cu cheia de serviciu, singura paza ar fi ramas un `if` din fisierul asta.
 */

export async function adaugaClient(
  businessId: string,
  date: ClientNou,
): Promise<{ stare: StareAdaugare } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie să fii autentificat." };

  const { data, error } = await supabase.rpc("customer_add_manual", {
    bid: businessId,
    p_name: date.name.trim().slice(0, 120),
    p_email: date.email.trim().slice(0, 160) || undefined,
    p_phone: date.phone.trim().slice(0, 40) || undefined,
    p_address: date.address.trim().slice(0, 200) || undefined,
    p_city: date.city.trim().slice(0, 80) || undefined,
    p_county: date.county.trim().slice(0, 80) || undefined,
    p_postcode: date.postcode.trim().slice(0, 20) || undefined,
  });

  if (error) {
    logError({ action: "adaugaClient", message: error.message, businessId });
    return { error: "Nu am putut adăuga clientul." };
  }

  /*
    ⚠ STAREA SE VALIDEAZA, nu se crede. Daca functia capata maine o a cincea
    stare, ecranul n-are voie s-o citeasca drept izbanda si sa inchida formularul
    peste un client care n-a intrat.
  */
  const stare = stareAdaugareValida(data?.[0]?.stare);
  if (!stare) {
    logError({
      action: "adaugaClient", businessId, severity: "warning",
      message: `baza a raspuns cu o stare necunoscuta: ${JSON.stringify(data?.[0]?.stare)}`,
    });
    return { error: "Nu am înțeles răspunsul bazei. Reîncarcă pagina și uită-te în listă." };
  }

  if (stare === "adaugat") revalidatePath("/dashboard/customers");
  return { stare };
}

export async function stergeContact(
  businessId: string,
  cheie: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie să fii autentificat." };

  const { data, error } = await supabase.rpc("customer_delete_contact", {
    bid: businessId,
    p_key: cheie,
  });

  if (error) {
    logError({ action: "stergeContact", message: error.message, businessId });
    return { error: "Nu am putut șterge contactul." };
  }

  /*
    ⚠⚠ ZERO RANDURI NU E IZBANDA, si nu se trece cu vederea. Inseamna fie ca
    omul are comenzi (si atunci paza din baza a facut exact ce trebuia), fie ca
    altcineva l-a sters intre timp. „Gata, l-am sters" peste zero randuri l-ar
    lasa pe comerciant sa creada ca a facut curat, iar contactul ar fi acolo la
    urmatoarea reincarcare.
  */
  if ((data ?? 0) === 0) {
    return {
      error:
        "Nu am șters nimic. Ori clientul are comenzi — și atunci nu se șterge, fiindcă "
        + "rămân facturile și AWB-urile lui — ori l-a șters altcineva înaintea ta.",
    };
  }

  revalidatePath("/dashboard/customers");
  return { ok: true };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANONIMIZAREA (G3)                                             (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ NU SE POATE LUA INAPOI, si atinge randuri din cinci tabele. Toata
 * judecata e in `customer_anonymize`, intr-o singura tranzactie: pe jumatate
 * facuta, ar fi lasat numele sters din comenzi dar telefonul intreg in cosuri.
 *
 * ⚠ Plafon pe cati deodata. Nu din prudenta abstracta: functia parcurge cinci
 * tabele pe fiecare cheie, iar o selectie de cinci sute ar tine tranzactia
 * deschisa peste limita de timp a rutei si s-ar da inapoi dupa un minut de
 * asteptare, fara ca omul sa stie daca s-a facut ceva sau nu.
 */

export async function anonimizeazaClienti(
  businessId: string,
  chei: string[],
): Promise<{ urma: UrmaAnonimizarii } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie să fii autentificat." };

  /* ⚠ Se curata si aici: vin din browser, deci sunt date straine. */
  const curate = [...new Set(chei.filter((c) => typeof c === "string" && c.trim() !== ""))];
  if (curate.length === 0) return { error: "N-ai ales niciun client." };
  if (curate.length > CATI_DEODATA) {
    return { error: `Maximum ${CATI_DEODATA} de clienți deodată. Ai ales ${curate.length}.` };
  }

  const { data, error } = await supabase.rpc("customer_anonymize", {
    bid: businessId,
    p_keys: curate,
  });

  if (error) {
    logError({ action: "anonimizeazaClienti", message: error.message, businessId });
    /*
      ⚠ „A eșuat" ar fi o minciuna periculoasa aici. Functia e o tranzactie, deci
      ori s-a facut tot, ori nimic — dar daca a cazut legatura DUPA commit, noi
      n-avem de unde sti. Se spune sa se uite, nu se spune ca n-a mers.
      Aceeasi regula ca la emiterea AWB-urilor in lot.
    */
    return {
      error:
        "N-am primit confirmarea de la bază. Reîncarcă pagina și uită-te la client "
        + "înainte să reiei: se poate să fi mers.",
    };
  }

  const urma = citesteUrma(data?.[0]);
  /* ⚠ Numai daca s-a atins ceva: altfel se reface pagina degeaba. */
  if (urma.comenzi + urma.contacte + urma.cosuri + urma.retururi + urma.mesaje > 0) {
    revalidatePath("/dashboard/customers");
  }
  return { urma };
}
