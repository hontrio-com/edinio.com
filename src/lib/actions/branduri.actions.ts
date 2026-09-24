"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { brandCanonic, curataBrand } from "@/lib/dashboard/branduri";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { proiecteazaImediat } from "@/lib/storefront/catalog/proiector";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueAboutYouSyncMany } from "@/lib/aboutyou/queue";
import { enqueueTrendyolSyncMany } from "@/lib/trendyol/queue";
import { enqueueEmagSyncMany } from "@/lib/emag/queue";
import { logError } from "@/lib/error-logger";

/**
 * Administrarea brandurilor, din Produse > Branduri. Lista magazinului sta in
 * `brands` (ca la categorii); pe produs, brandul ramane in `page_sections.google.brand`.
 *
 * ⚠⚠ ORICE EXPORT DE AICI E UN CAPAT PUBLIC: Next le rezolva dintr-un manifest global,
 * deci o actiune se poate chema de oriunde, cu orice argumente. Fiecare verifica deci
 * SINGURA utilizatorul si ca magazinul e al lui; functiile din baza sunt oricum
 * `security invoker`, deci RLS-ul le mai margineste o data la produsele lui.
 *
 * ⚠ Redenumirea, unirea si stergerea sunt aceeasi operatie in baza
 * (`produse_redenumeste_brandul`): produsele cu brandul vechi primesc brandul nou,
 * sau niciunul. Dupa ea pleaca aceleasi cozi ca la schimbarea categoriei: brandul
 * intra in feeduri si pe marketplace-uri.
 */

type Rezultat = { success: true; count: number } | { error: string };

async function magazinulMeu(businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  return { supabase, ok: !!biz };
}

async function schimba(businessId: string, vechi: string, nou: string | null): Promise<Rezultat> {
  const { supabase, ok } = await magazinulMeu(businessId);
  if (!ok) return { error: "Magazin negasit." };

  const { data: atinse, error } = await supabase.rpc("produse_redenumeste_brandul", {
    p_business: businessId,
    p_vechi: vechi,
    p_nou: nou,
  });
  if (error) {
    await logError({ action: "branduri/schimba", message: error.message, businessId, severity: "error" });
    return { error: "Nu am putut salva. Incearca din nou." };
  }
  const ids = (atinse ?? []) as string[];
  if (ids.length > 0) {
    dupaRaspuns(() => enqueueGmcSyncMany(businessId, ids), "enqueueGmcSyncMany", businessId);
    dupaRaspuns(() => enqueueOlxSyncMany(businessId, ids), "enqueueOlxSyncMany", businessId);
    dupaRaspuns(() => enqueueAboutYouSyncMany(businessId, ids), "enqueueAboutYouSyncMany", businessId);
    dupaRaspuns(() => enqueueTrendyolSyncMany(businessId, ids), "enqueueTrendyolSyncMany", businessId);
    dupaRaspuns(() => enqueueEmagSyncMany(businessId, ids), "enqueueEmagSyncMany", businessId);
    await proiecteazaImediat(businessId);
  }
  revalidatePath("/dashboard/products/brands");
  revalidatePath("/dashboard/products");
  return { success: true, count: ids.length };
}

/**
 * Redenumeste un brand pe toate produsele lui. Daca numele nou exista deja (si
 * difera doar prin majuscule), produsele trec pe forma EXISTENTA: asa se si unesc
 * dublurile („ARMAF” in „Armaf”).
 */
export async function redenumesteBrandul(businessId: string, vechi: string, nou: string): Promise<Rezultat> {
  const brandVechi = curataBrand(vechi);
  const scris = curataBrand(nou);
  if (!brandVechi) return { error: "Brand negasit." };
  if (!scris) return { error: "Scrie noul nume al brandului." };

  const { supabase, ok } = await magazinulMeu(businessId);
  if (!ok) return { error: "Magazin negasit." };
  const { data: existente } = await supabase.rpc("produse_branduri", { p_business: businessId });
  /* Forma existenta castiga, cu exceptia brandului redenumit insusi (altfel „ARMAF” -> „Armaf” n-ar schimba nimic). */
  const altele = (existente ?? []).map((b) => b.brand).filter((b) => b !== brandVechi);
  const tinta = brandCanonic(scris, altele);
  if (tinta === brandVechi) return { success: true, count: 0 };
  return schimba(businessId, brandVechi, tinta);
}

/**
 * Adauga un brand in lista magazinului, fara sa-l puna inca pe vreun produs (ca
 * „Categorie noua”). Se aplica apoi din produs sau din lista de produse.
 * Un brand care exista deja, in orice forma de majuscule, nu se mai adauga.
 */
export async function adaugaBrandul(businessId: string, nume: string): Promise<Rezultat> {
  const scris = curataBrand(nume);
  if (!scris) return { error: "Scrie numele brandului." };

  const { supabase, ok } = await magazinulMeu(businessId);
  if (!ok) return { error: "Magazin negasit." };
  const { data: existente } = await supabase.rpc("produse_branduri", { p_business: businessId });
  const cheie = scris.toLocaleLowerCase("ro");
  const deja = (existente ?? []).find((b) => curataBrand(b.brand).toLocaleLowerCase("ro") === cheie);
  if (deja) return { error: `Brandul „${deja.brand}” exista deja.` };

  const { error } = await supabase.from("brands").insert({ business_id: businessId, name: scris });
  if (error) {
    /* 23505: adaugat intre timp (alt tab, dublu clic), tot „exista deja”. */
    if (error.code === "23505") return { error: `Brandul „${scris}” exista deja.` };
    await logError({ action: "branduri/adauga", message: error.message, businessId, severity: "error" });
    return { error: "Nu am putut salva. Incearca din nou." };
  }
  revalidatePath("/dashboard/products/brands");
  revalidatePath("/dashboard/products");
  return { success: true, count: 0 };
}

/**
 * Logo-ul si descrierea unui brand, pentru pagina lui din magazin.
 *
 * Un brand purtat doar de produse n-are inca rand in lista: il primeste acum
 * (`brand_salveaza_detalii`). Logo-ul vine din `uploadImage` (octetii verificati
 * acolo); aici se cere doar sa fie o adresa `https`, ca si constrangerea din baza.
 */
export async function salveazaDetaliileBrandului(
  businessId: string,
  nume: string,
  detalii: { logo: string | null; descriere: string },
): Promise<Rezultat> {
  const brand = curataBrand(nume);
  if (!brand) return { error: "Brand negasit." };
  const logo = typeof detalii.logo === "string" ? detalii.logo.trim() : "";
  if (logo && (!/^https:\/\//.test(logo) || logo.length > 1000)) return { error: "Adresa logo-ului nu e valida." };
  const descriere = typeof detalii.descriere === "string" ? detalii.descriere.trim() : "";
  if (descriere.length > 5000) return { error: "Descrierea poate avea cel mult 5000 de caractere." };

  const { supabase, ok } = await magazinulMeu(businessId);
  if (!ok) return { error: "Magazin negasit." };
  const { error } = await supabase.rpc("brand_salveaza_detalii", {
    p_business: businessId,
    p_nume: brand,
    p_logo: logo || null,
    p_descriere: descriere || null,
  });
  if (error) {
    await logError({ action: "branduri/detalii", message: error.message, businessId, severity: "error" });
    return { error: "Nu am putut salva. Incearca din nou." };
  }
  revalidatePath("/dashboard/products/brands");
  return { success: true, count: 0 };
}

/** Uneste un brand in altul existent (toate produsele lui trec pe cel ales). */
export async function unesteBrandul(businessId: string, dinBrand: string, inBrand: string): Promise<Rezultat> {
  const din = curataBrand(dinBrand);
  const in_ = curataBrand(inBrand);
  if (!din || !in_) return { error: "Alege brandurile de unit." };
  if (din === in_) return { success: true, count: 0 };
  return schimba(businessId, din, in_);
}

/** Scoate brandul de pe toate produsele lui. Produsele raman; numai brandul pleaca. */
export async function stergeBrandul(businessId: string, brand: string): Promise<Rezultat> {
  const b = curataBrand(brand);
  if (!b) return { error: "Brand negasit." };
  return schimba(businessId, b, null);
}
