"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";
import { ESEC_CUPON, PREA_MULTE_INCERCARI } from "@/lib/discounts/mesaj";
import { perioadaCodului } from "@/lib/discounts/perioada";
import { limitaValida } from "@/lib/discounts/per-client";
import {
  areRestrangere, cereArborele, extindeCategoriileCodului, parseRestrangere,
  restrangereValida, socotesteReducerea, type LinieDeCupon, type Restrangere,
} from "@/lib/discounts/restrangere";

export interface DiscountData {
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  is_active: boolean;
  /**
   * ⚠ ZILE, nu clipe — si de-aia se si numesc altfel.
   *
   * Campul se chema `expires_at` si purta „YYYY-MM-DD”, adica numele unei clipe
   * peste continutul unei zile. Din nepotrivirea asta a iesit defectul masurat:
   * ziua ajungea in baza ca miezul noptii UTC, deci codul murea la 03:00 ora
   * Romaniei in chiar ziua in care comerciantul il credea viu.
   *
   * Aici sunt ZILE ROMANESTI, asa cum le scrie omul in formular. Prefacerea in
   * clipa exacta se face o singura data, in `perioadaCodului`.
   */
  incepe_in: string | null;
  expira_in: string | null;
  /**
   * De cate ori poate folosi ACELASI om codul. `null` = fara limita.
   * Cine e „acelasi om" se hotaraste in SQL (`discount_customer_key`), nu aici.
   */
  per_customer_limit: number | null;
  /** Pe ce merge codul. Vezi `src/lib/discounts/restrangere.ts`. */
  restrangere: Restrangere;
  /**
   * Merge numai la prima comanda a unui om.
   *
   * ⚠ Implica o singura folosire per client, chiar daca `per_customer_limit` e
   * gol: altfel doua comenzi trimise deodata la primul cumparat ar trece
   * amandoua. Regula e in `reserve_discount_for_customer`.
   */
  doar_prima_comanda: boolean;
}

export interface ValidatedDiscount {
  id: string;
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  discountAmount: number; // 0 for free_shipping
  /**
   * ⚠⚠ PE CE S-A SOCOTIT, si de ce pleaca inapoi catre ecran.
   *
   * La un cod restrans, `value` nu mai spune adevarul: bannerul scria „20%
   * reducere" din valoarea BRUTA a cuponului, in timp ce randul de totaluri
   * arata o suma socotita pe o parte din cos. Cu `baza`, ecranul poate spune
   * „reducerea s-a socotit pe 240 lei din cos".
   */
  baza: number;
  /**
   * ⚠⚠ PE CE COTE DE TVA a cazut reducerea — pentru FACTURA, nu pentru ecran.
   *
   * Pe factura, o suma fara cota proprie se imparte PROPORTIONAL peste toate
   * cotele comenzii, fiindca o reducere obisnuita micsoreaza baza FIECAREI cote.
   * Cu un cod restrans, presupunerea aia nu mai e adevarata. Se pastreaza pe
   * comanda, in `discount_base`. Gol cand liniile n-au cote proprii.
   */
  peCote: { cota: number; valoare: number }[];
  /**
   * ⚠⚠ DACA TRANSPORTUL CHIAR E GRATUIT — si NU se poate deduce din `type`.
   *
   * Pana azi, amandoua oglinzile de pe vitrina puneau transportul pe zero numai
   * fiindca `type === "free_shipping"`, fara sa intrebe daca vreo linie se
   * potriveste. Cu un cod de transport restrans la o categorie, ecranul ar fi
   * scris „Gratuit" iar serverul ar fi incasat transportul: exact tiparul
   * „ecranul scria 350, curierul incasa 500".
   */
  transportGratuit: boolean;
}

/*
 * UN SINGUR mesaj pentru toate esecurile — vezi `src/lib/discounts/mesaj.ts`,
 * unde sta si motivul intreg.
 *
 * ⚠ MUTAT DE AICI pe 21.09.2026, fiindca au nevoie de el si `placeOrder`, si
 * `placeCartOrder`, si vitrina. Un fisier `"use server"` nu are voie sa exporte
 * decat functii `async`, deci constanta nu putea ramane aici.
 *
 * ⚠⚠ Regula se judeca pe ce EXCLUDE: dupa cautarea codului in baza nu are voie
 * sa existe niciun alt raspuns in afara de `esecCupon`. Proba care o tine e
 * `src/lib/discounts/un-singur-mesaj.test.ts`, si ea citeste CHIAR fisierul
 * asta.
 */

/*
 * Depasirea plafonului pe magazin inseamna ori o incercare de enumerare, ori un
 * prag pus prea jos — in amandoua cazurile cineva trebuie sa afle, fiindca in
 * intervalul acela cumparatorii reali nu-si mai pot folosi cupoanele.
 *
 * Cel mult o alerta pe ora pe magazin: contorul durabil folosit pe dos, ca
 * `error_logs` sa nu se umple exact in timpul abuzului pe care il semnaleaza.
 */
async function alertaCupoane(businessId: string): Promise<void> {
  if (!(await consumaLimita(`alerta:cupon:${businessId}`, 1, 3600)).permis) return;
  await logError({
    action: "validateDiscount.plafonMagazin",
    message: "Prea multe coduri respinse pe magazin intr-un interval scurt (posibila enumerare de cupoane)",
    details: { businessId },
    businessId,
    severity: "warning",
  });
}

/*
 * Raspunsul comun la orice cod respins — si singurul loc unde se atinge contorul
 * PE MAGAZIN.
 *
 * Contorul pe magazin NU are voie sa fie o poarta inaintea cautarii, si asta nu
 * e o subtilitate: `placeOrder` re-valideaza cuponul server-side si, daca
 * validarea nu iese cu „valid", OPRESTE COMANDA (`order.actions.ts:962` si
 * `:2599` — `if (!dres.valid) return { error: dres.error }`). Un contor pe
 * magazin verificat inainte de cautare inseamna deci ca oricine trimite ~300 de
 * coduri inventate la 10 minute (0,5 cereri pe secunda, pe ID-ul de magazin din
 * pachetul public) blocheaza plasarea ORICAREI comenzi care poarta un cod de
 * reducere, la toti cumparatorii magazinului. Si nu se desface singur: contorul
 * se stergea doar la o validare REUSITA, iar cat timp e epuizat nicio validare
 * nu mai reuseste.
 *
 * Asa, contorul se consuma NUMAI pe esecuri si nu refuza niciodata: un cod
 * VALID trece intotdeauna, indiferent cat s-a acumulat. Ce ramane e un semnal de
 * enumerare in `error_logs`. Frana propriu-zisa e `cupon:ip` de mai sus — o
 * limita pe apelant, care nu poate fi intoarsa de un tert impotriva
 * cumparatorilor magazinului.
 *
 * Nu se reseteaza la validare reusita: contorul numara acum doar respingeri,
 * deci o stergere n-ar face decat sa acopere enumerarea care intercaleaza un cod
 * bun la fiecare rafala.
 */
async function esecCupon(businessId: string): Promise<{ valid: false; error: string }> {
  const lim = await consumaLimita(`cupon:biz:${businessId}`, 300, 600);
  if (!lim.permis) await alertaCupoane(businessId);
  return { valid: false, error: ESEC_CUPON };
}

export async function validateDiscount(
  code: string,
  businessId: string,
  subtotal: number,
  /*
   * ⚠⚠ LINIILE COSULUI, PENTRU CODURILE RESTRANSE — si aici e toata subtilitatea.
   *
   * Pe drumul de AFISARE ele vin din browser, ca si `subtotal`: nu sunt de
   * crezut, si nu trebuie sa fie. Raspunsul de acolo doar deseneaza un ecran.
   *
   * Pe drumul care MISCA BANI (`placeOrder` / `placeCartOrder`) vin liniile
   * repretuite de server. ⚠ Si ele se construiesc ANUME: `cartItems` NU contine
   * produsul principal al formularului de comanda, deci un cod restrans chiar la
   * el, folosit de pe pagina lui, n-ar fi gasit nicio linie potrivita — si
   * comanda s-ar fi oprit taman pe drumul pentru care a fost facuta campania.
   *
   * Lipsa lor inseamna „nu stiu liniile": un cod restrans se refuza atunci,
   * fiindca nu se poate hotari. Un cod nerestrans nu le cere deloc.
   */
  linii?: readonly LinieDeCupon[],
): Promise<{ valid: true; discount: ValidatedDiscount } | { valid: false; error: string }> {
  /*
   * Limita de incercari, ca la plasarea comenzii.
   *
   * `validateDiscount` e un export `use server`, adica un endpoint public care
   * raspunde „valid" sau „nu": fara limita, cupoanele unui magazin se afla prin
   * incercari, una dupa alta, fara nicio urma. `placeOrder` are limita de mult;
   * asta n-o avea. Pragul e mai larg, fiindca un om chiar poate gresi codul de
   * cateva ori la rand.
   */
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`validateDiscount:${ip}`, 20, 60_000)) {
    return { valid: false, error: PREA_MULTE_INCERCARI };
  }

  /*
   * A doua linie, DURABILA, si tot PE APELANT.
   *
   * Cea de mai sus e o harta in memoria procesului: pe Vercel plafonul efectiv se
   * inmulteste cu numarul de instante calde si se pierde la fiecare desfasurare.
   * Asta tine in Postgres, deci e singura care chiar numara.
   *
   * Frana ramane cheiata pe IP dinadins. Un plafon PE MAGAZIN pus aici, inaintea
   * cautarii, ar opri plasarea comenzilor tuturor cumparatorilor magazinului —
   * vezi `esecCupon`, unde contorul pe magazin numara doar respingerile si nu
   * refuza pe nimeni.
   */
  const limIp = await consumaLimita(`cupon:ip:${ip}`, 60, 600);
  if (!limIp.permis) {
    return { valid: false, error: PREA_MULTE_INCERCARI };
  }

  /*
   * Client ADMIN, nu cel al vizitatorului.
   *
   * Cumparatorul e anonim, iar tabelul avea o politica de citire publica
   * (`is_active = true`) care ii dadea oricui, printr-o singura cerere cu cheia
   * din pachetul public, TOATE cupoanele active ale platformei: cod, tip,
   * valoare, limite. Politica aceea a fost stearsa, iar singurul drum catre
   * cupoane ramane functia asta, care raspunde doar „valid" sau „nu" pentru un
   * cod anume, si e limitata la incercari.
   */
  const supabase = createAdminClient();

  /*
   * Potrivire EXACTA, nu `ilike`.
   *
   * `ilike` trimite sirul mai departe ca SABLON, iar `%` si `_` raman
   * metacaractere. Cine tasta `%` primea inapoi un cupon adevarat, cu tot cu cod,
   * iar formularul il trimitea mai departe si serverul il acorda. Masurat pe
   * productie: `C%` scotea un cupon de 30%, `B%` unul de 15%. Adica oricine putea
   * lua reducerea magazinului fara sa stie niciun cod.
   *
   * Codurile se scriu cu majuscule la salvare, deci potrivirea exacta pe forma
   * majusculata pastreaza purtarea buna de pana acum: clientul poate scrie cu
   * litere mici.
   */
  const cod = code.trim().toUpperCase();
  if (!cod) return esecCupon(businessId);

  const { data } = await supabase
    .from("discounts")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("code", cod)
    .maybeSingle();

  // Toate esecurile de mai jos raspund identic — vezi `ESEC_CUPON`.
  if (!data) return esecCupon(businessId);

  /*
   * ⚠⚠ PROGRAMAREA SE VERIFICA SI AICI, SI IN `claim_discount_use`.
   *
   * Aici, fiindca altfel cumparatorul n-ar afla nimic pana la plata. Acolo,
   * fiindca aici e doar o CITIRE: intre clipa asta si revendicare trec cateva
   * sute de milisecunde in care codul poate fi stins de comerciant. Poarta din
   * SQL e singura care refuza cu adevarat; asta e doar politetea.
   *
   * ⚠ Clipa din coloana e exacta (vezi `perioadaCodului`), deci cele doua
   * ceasuri — al procesului si `now()` al Postgresului — se uita la acelasi
   * lucru. Pana azi coloana purta o ZI citita ca miezul noptii UTC, si atunci
   * cele doua chiar puteau sa se certe pe trei ore.
   */
  const acum = new Date();
  if (data.starts_at && new Date(data.starts_at) > acum) {
    return esecCupon(businessId);
  }

  if (data.expires_at && new Date(data.expires_at) < acum) {
    return esecCupon(businessId);
  }

  if (data.max_uses !== null && data.uses_count >= data.max_uses) {
    return esecCupon(businessId);
  }

  if (data.min_order_amount !== null && subtotal < data.min_order_amount) {
    return esecCupon(businessId);
  }

  /*
   * ⚠⚠ RESTRANGEREA PE PRODUSE SI CATEGORII.
   *
   * Socoteala sta in `src/lib/discounts/restrangere.ts`, chemata si de aici, si
   * de `placeOrder`. Fara restrangere, ea intoarce LITERA CU LITERA numerele de
   * pana acum — de-aia primeste si `subtotal`, nu doar liniile: liniile pot sa
   * nu acopere tot (extraoptiuni, rotunjiri), iar o schimbare acolo ar fi mutat
   * bani pe TOATE codurile existente, nu doar pe cele noi.
   */
  const restrangere = parseRestrangere(data.restrangere);

  if (areRestrangere(restrangere) && linii === undefined) {
    /*
     * ⚠ Cine cheama fara linii nu poate afla daca un cod restrans se potriveste.
     * Se refuza, nu se acorda „pe incredere": un `valid` dat aici ar fi ajuns pe
     * ecran ca reducere pe tot cosul.
     */
    return esecCupon(businessId);
  }

  /*
   * ⚠ Arborele de categorii se citeste DOAR cand chiar trebuie. Un magazin cu
   * sute de categorii n-are de ce sa fie citit pentru un cod pe produse.
   */
  let categoriiExtinse: Set<string> | undefined;
  let liniiCuCategorii = linii ?? [];

  if (cereArborele(restrangere)) {
    /*
     * ⚠⚠ CATEGORIA FIECAREI LINII SE AFLA AICI, DIN CATALOG — nu se primeste.
     *
     * Vitrina nu stie categoriile (cosul din browser poarta doar id, nume, pret
     * si cantitate), iar daca le-ar sti tot n-ar trebui crezuta: cineva ar
     * trimite o linie inventata din categoria potrivita si ar primi „valid".
     * Asa, browserul spune doar CE produse si CAT fac; raspunsul la „in ce
     * categorie e produsul asta" vine din baza, la fel pe amandoua drumurile.
     */
    const ids = [...new Set(liniiCuCategorii.map((l) => l.productId))];
    const [{ data: arbore }, { data: produse }] = await Promise.all([
      supabase.from("categories").select("id, name, parent_id").eq("business_id", businessId),
      ids.length > 0
        ? supabase.from("products").select("id, category").eq("business_id", businessId).in("id", ids)
        : Promise.resolve({ data: [] as { id: string; category: string | null }[] }),
    ]);
    categoriiExtinse = extindeCategoriileCodului(arbore ?? [], restrangere);
    const peId = new Map((produse ?? []).map((x) => [x.id, x.category ?? null]));
    /* ⚠ Un produs care nu e al magazinului nu primeste categorie, deci nu se potriveste. */
    liniiCuCategorii = liniiCuCategorii.map((l) => ({ ...l, categorie: peId.get(l.productId) ?? null }));
  }

  const socoteala = socotesteReducerea({
    tip: data.type as "percent" | "fixed" | "free_shipping",
    valoare: Number(data.value),
    linii: liniiCuCategorii,
    restrangere,
    categoriiExtinse,
    subtotal,
  });

  /*
   * ⚠⚠ NIMIC POTRIVIT INSEAMNA REFUZ, nu „reducere zero". Ecranul pune
   * transportul pe zero doar din TIPUL cuponului, deci un `free_shipping` intors
   * „valid cu 0 lei" ar fi dat transportul gratuit oricum.
   */
  if (!socoteala.potrivire) return esecCupon(businessId);

  const discountAmount = socoteala.suma;

  // Codul e bun: nu se atinge niciun contor pe magazin, nici la consum, nici la
  // stergere. Vezi `esecCupon` — pe magazin se numara doar respingerile.
  return {
    valid: true,
    discount: {
      id: data.id,
      code: data.code,
      type: data.type as "percent" | "fixed" | "free_shipping",
      value: Number(data.value),
      discountAmount,
      baza: socoteala.baza,
      peCote: socoteala.peCote,
      /* ⚠ Si steagul, nu tipul: vezi `transportGratuit` in `ValidatedDiscount`. */
      transportGratuit: data.type === "free_shipping" && socoteala.potrivire,
    },
  };
}


export async function createDiscount(businessId: string, data: DiscountData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  /*
   * ⚠ ZILELE SE PREFAC IN CLIPE AICI, pe server, nu in formular. Trimisa gata
   * prefacuta din browser, clipa ar fi purtat fusul CALCULATORULUI
   * comerciantului: cine isi tine laptopul pe ora Londrei ar fi pornit campania
   * cu doua ore mai tarziu decat vecinul lui din acelasi oras.
   */
  const perioada = perioadaCodului(data.incepe_in, data.expira_in);
  if ("error" in perioada) return { error: perioada.error };

  /*
   * ⚠ Aceeasi regula ca in formular, chemata — nu scrisa a doua oara. Baza are
   * si ea o constrangere (`per_customer_limit >= 1`), dar ea ar fi iesit ca o
   * eroare de Postgres, nu ca o propozitie pentru om.
   */
  const perClient = limitaValida(data.per_customer_limit);
  if ("error" in perClient) return { error: perClient.error };

  /*
   * ⚠ Un cod restrans la NIMIC („doar pe produsele astea", cu lista goala) nu se
   * salveaza: n-ar prinde nicio linie, deci ar raspunde cu acelasi mesaj unic ca
   * un cod inexistent — si comerciantul l-ar cauta o saptamana.
   */
  const restrans = restrangereValida(data.restrangere);
  if ("error" in restrans) return { error: restrans.error };

  const { error } = await supabase.from("discounts").insert({
    business_id: businessId,
    code: data.code.trim().toUpperCase(),
    type: data.type,
    value: data.value,
    min_order_amount: data.min_order_amount,
    max_uses: data.max_uses,
    is_active: data.is_active,
    starts_at: perioada.starts_at,
    expires_at: perioada.expires_at,
    per_customer_limit: perClient.limita,
    restrangere: data.restrangere as unknown as never,
    doar_prima_comanda: data.doar_prima_comanda,
  });

  if (error) {
    if (error.code === "23505") return { error: "Acest cod exista deja." };
    logError({ action: "createDiscount", message: error.message, details: { code: error.code, hint: error.hint, businessId }, userId: user.id });
    return { error: "Eroare la salvare. Incearca din nou." };
  }

  revalidatePath("/dashboard/discounts");
  return { success: true };
}

export async function updateDiscount(discountId: string, businessId: string, data: DiscountData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  // ⚠ Aceeasi prefacere ca la creare — vezi `createDiscount`.
  const perioada = perioadaCodului(data.incepe_in, data.expira_in);
  if ("error" in perioada) return { error: perioada.error };

  /*
   * ⚠ Aceeasi regula ca in formular, chemata — nu scrisa a doua oara. Baza are
   * si ea o constrangere (`per_customer_limit >= 1`), dar ea ar fi iesit ca o
   * eroare de Postgres, nu ca o propozitie pentru om.
   */
  const perClient = limitaValida(data.per_customer_limit);
  if ("error" in perClient) return { error: perClient.error };

  /*
   * ⚠ Un cod restrans la NIMIC („doar pe produsele astea", cu lista goala) nu se
   * salveaza: n-ar prinde nicio linie, deci ar raspunde cu acelasi mesaj unic ca
   * un cod inexistent — si comerciantul l-ar cauta o saptamana.
   */
  const restrans = restrangereValida(data.restrangere);
  if ("error" in restrans) return { error: restrans.error };

  const { error } = await supabase
    .from("discounts")
    .update({
      code: data.code.trim().toUpperCase(),
      type: data.type,
      value: data.value,
      min_order_amount: data.min_order_amount,
      max_uses: data.max_uses,
      is_active: data.is_active,
      starts_at: perioada.starts_at,
      expires_at: perioada.expires_at,
      per_customer_limit: perClient.limita,
      restrangere: data.restrangere as unknown as never,
      doar_prima_comanda: data.doar_prima_comanda,
      updated_at: new Date().toISOString(),
    })
    .eq("id", discountId)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") return { error: "Acest cod exista deja." };
    logError({ action: "updateDiscount", message: error.message, details: { code: error.code, hint: error.hint, discountId, businessId }, userId: user.id });
    return { error: "Eroare la salvare. Incearca din nou." };
  }

  revalidatePath("/dashboard/discounts");
  return { success: true };
}

export async function toggleDiscount(discountId: string, businessId: string, isActive: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const { error } = await supabase
    .from("discounts")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", discountId)
    .eq("business_id", businessId);

  if (error) return { error: "Eroare la actualizare." };
  revalidatePath("/dashboard/discounts");
  return { success: true };
}

export async function deleteDiscount(discountId: string, businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const { error } = await supabase
    .from("discounts")
    .delete()
    .eq("id", discountId)
    .eq("business_id", businessId);

  if (error) return { error: "Eroare la stergere." };
  revalidatePath("/dashboard/discounts");
  return { success: true };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMENZILE PE CARE S-A FOLOSIT UN COD                          (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pentru fișa codului din sertar. Până acum nu se putea afla, din panou, CINE a
 * folosit un cod — doar câte utilizări are.
 *
 * ⚠ CLIENTUL OBIȘNUIT, nu cel de administrare: RLS de pe `orders` mărginește la
 * magazinul celui logat. Restul fișierului folosește clientul admin fiindcă
 * acolo cumpărătorul e ANONIM (validarea unui cupon la checkout); aici e
 * comerciantul, logat, deci granița e RLS.
 *
 * ⚠ Se leagă pe `discount_id`, nu pe textul codului: `discount_code` e o
 * fotografie din clipa comenzii, iar un cod redenumit ar rupe legătura.
 */
export interface ComandaCuCod {
  id: string;
  order_number: string;
  status: string;
  total: number;
  discount_amount: number;
  shipping_cost: number;
  customer_name: string;
  created_at: string;
}

/** Câte comenzi se aduc odată în fișă. */
const COMENZI_IN_FISA = 50;

export async function getDiscountOrders(
  businessId: string,
  discountId: string,
): Promise<{ comenzi: ComandaCuCod[]; maiSunt: boolean } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie să fii autentificat." };

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, total, discount_amount, shipping_cost, customer_name, created_at")
    .eq("business_id", businessId)
    .eq("discount_id", discountId)
    .order("created_at", { ascending: false })
    /*
      ⚠ Se cere UNA PESTE plafon, ca să se poată spune „mai sunt" fără o a doua
      interogare de numărare. Un `count: exact` ar fi însemnat încă o parcurgere
      a tabelei de comenzi la fiecare deschidere a fișei.
    */
    .limit(COMENZI_IN_FISA + 1);

  if (error) {
    logError({ action: "getDiscountOrders", message: error.message, businessId });
    return { error: "Nu am putut încărca comenzile codului." };
  }

  const toate = data ?? [];
  return {
    comenzi: toate.slice(0, COMENZI_IN_FISA).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      total: Number(o.total),
      discount_amount: Number(o.discount_amount ?? 0),
      shipping_cost: Number(o.shipping_cost ?? 0),
      customer_name: o.customer_name,
      created_at: o.created_at,
    })),
    maiSunt: toate.length > COMENZI_IN_FISA,
  };
}
