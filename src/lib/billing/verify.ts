import { lookupAnaf } from "@/lib/anaf/lookup";
import type { BillingCompany } from "./company";

/**
 * Reconfirma la ANAF datele de firma primite de la browser, inainte ca ele sa
 * ajunga in baza si de acolo pe o factura.
 *
 * De ce nu e de ajuns ce a trimis clientul. Formularul chiar interogheaza ANAF,
 * dar `placeOrder`/`placeCartOrder` sunt exporturi dintr-un modul `"use server"`,
 * adica endpointuri publice: oricine poate trimite direct un CUI real cu o
 * denumire inventata. Cifra de control din `parseBillingCompany` prinde greselile
 * de tastare, nu si minciunile — iar denumirea si statutul de platitor de TVA
 * sunt exact cele doua lucruri care fac o factura corecta sau falsa.
 *
 * TREI RASPUNSURI, NU DOUA. Distinctia asta e tot rostul functiei:
 *
 *   - ANAF confirma firma  -> datele lui inlocuiesc ce a trimis clientul, `verified: true`.
 *   - ANAF spune ca acel CUI NU EXISTA (`reason: "not_found"`) -> `null`, si
 *     comanda e refuzata cu un mesaj sub campul de CUI. E un raspuns pozitiv, nu
 *     o pana: un cod inventat care nimereste din intamplare cifra de control n-are
 *     ce cauta pe o factura fiscala, unde ar fi respins la e-Factura si ar trebui
 *     stornat.
 *   - orice altceva (serviciu cazut, timeout, corp neinteligibil) -> se pastreaza
 *     ce a trimis clientul, cu `verified: false`. Un serviciu al statului cu o zi
 *     proasta nu are voie sa opreasca incasarile magazinului; panoul si emailul
 *     spun insa clar ca datele n-au fost confirmate, ca sa se uite comerciantul
 *     la ele inainte de a emite.
 *
 * SE VERIFICA `reason`, NU STATUTUL HTTP. „Nu exista firma asta" si „n-am inteles
 * ce mi-a raspuns ANAF" primesc amandoua 404 in unele forme; deosebite doar dupa
 * numar, al doilea caz ar fi refuzat comenzi ale unor firme cat se poate de reale.
 *
 * Doua secunde, nu zece: aici se asteapta pe drumul critic al plasarii comenzii,
 * nu intr-un formular. `cui` NU se schimba niciodata — el a fost deja validat si
 * e cheia dupa care s-a facut interogarea.
 */
export async function verifyBillingCompany(company: BillingCompany): Promise<BillingCompany | null> {
  try {
    const r = await lookupAnaf(company.cui, 2_000);

    if (!r.ok) {
      // Doar „negasit" e un verdict; restul sunt pene de serviciu.
      if (r.reason === "not_found") return null;
      return { ...company, verified: false };
    }

    return {
      ...company,
      company_name: r.company.business_name || company.company_name,
      reg_com: r.company.reg_com || company.reg_com,
      vat_payer: r.company.vat_payer,
      inactive: r.company.inactive,
      verified: true,
    };
  } catch {
    return { ...company, verified: false };
  }
}
