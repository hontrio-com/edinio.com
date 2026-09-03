/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE FACE DINTR-O SESIUNE STRIPE O CONVERSIE RAPORTABILA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E UN MODUL PROPRIU, PUR. Hotararea asta e un sir de porti, iar portile
  se probeaza dandu-le cazuri. Scrisa inauntrul actiunii de server, singura ei
  proba ar fi ceruta o cheie Stripe si o retea — adica una pe care n-o ruleaza
  nimeni la fiecare `npm test`, tocmai la o hotarare despre bani.

  ⚠ CE APARA. Pagina de plan socotea plata reusita din `?success=1` si din
  `sessionStorage` — doua lucruri pe care le stapaneste chiar omul din fata
  ecranului. Cine pornea o plata si o abandona avea deja amandoua.
*/

export type PlataVerificata =
  | {
      ok: true;
      /** Id-ul sesiunii Stripe — chiar perechea folosita de webhook la deduplicare. */
      sesiune: string;
      plan: string;
      /**
       * ⚠ `null` INSEAMNA „STRIPE NU SPUNE", nu „lunar". Turnat „monthly", un
       * abonament anual s-ar raporta lunar si nimic n-ar arata de ce.
       */
      interval: "monthly" | "annual" | null;
      /** Suma INCASATA. Niciodata din tabelul nostru de preturi. */
      suma: number;
      moneda: string;
    }
  | { ok: false; motiv: "neautentificat" | "fara-sesiune" | "alt-om" | "neplatita" | "indisponibil" };

/** Cat din sesiunea Stripe ne trebuie ca sa hotaram. */
export type SesiuneStripe = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
};

/**
 * A cui e sesiunea, si s-a platit chiar?
 *
 * ⚠ SE CER AMANDOUA SEMNELE DE PROPRIETATE. `client_reference_id` e cel oficial,
 * `metadata.user_id` e cel pe care il citeste si webhook-ul. Se pun amandoua la
 * crearea sesiunii; daca vreodata se despart, vreau sa se vada aici.
 *
 * ⚠ SI AMANDOUA SEMNELE DE PLATA. `status: "complete"` spune ca formularul s-a
 * incheiat; `payment_status: "paid"` spune ca banii au plecat. O sesiune se poate
 * incheia si cu plata amanata — atunci nu e o conversie.
 */
export function verdictulPlatii(s: SesiuneStripe, idOmului: string): PlataVerificata {
  const alOmului = s.client_reference_id === idOmului || s.metadata?.user_id === idOmului;
  if (!alOmului) return { ok: false, motiv: "alt-om" };

  if (s.status !== "complete" || s.payment_status !== "paid") return { ok: false, motiv: "neplatita" };

  const suma = s.amount_total;
  if (typeof suma !== "number" || suma <= 0) return { ok: false, motiv: "neplatita" };

  const brut = s.metadata?.interval;
  return {
    ok: true,
    sesiune: s.id,
    plan: s.metadata?.plan ?? "",
    interval: brut === "annual" || brut === "monthly" ? brut : null,
    /* ⚠ Stripe tine banii in subunitati; raportarea se face in unitati intregi. */
    suma: suma / 100,
    moneda: (s.currency ?? "ron").toUpperCase(),
  };
}
