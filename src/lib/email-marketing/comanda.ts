/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE AFLA FURNIZORII DE EMAIL DESPRE SOARTA UNEI COMENZI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE LA 18.09.2026 NU MAI ANUNTA NIMENI DIN APLICATIE. Evenimentele (creata, platita, expediata,
  livrata, anulata, rambursata) le scrie un trigger pe `orders`, in coada
  `email_marketing_coada`, iar `/api/cron/email-marketing` le trimite de aici.

  De ce asa, si nu apeluri presarate prin cod:
    - statusul de expediere si de livrare il pun ~17 urmariri de curier, fiecare in cronul ei; un
      apel uitat intr-una singura ar fi fost un gol tacut. Triggerul le vede pe toate;
    - un 503 al furnizorului pierdea evenimentul; din coada se reincearca.

  ⚠ POARTA DE MARKETPLACE NU STA AICI, ci in fiecare functie a furnizorului, acolo unde se citeste
  comanda (vezi `clientDeMarketplace`).
*/

import type { Furnizor, FelEveniment, Verdict } from "./coada";
import { evenimentMailchimp } from "@/lib/mailchimp-sync";
import { evenimentBrevo } from "@/lib/brevo-sync";
import { evenimentKlaviyo } from "@/lib/klaviyo-sync";

/** Trimite un rand al cozii la furnizorul lui. Nu arunca: fiecare functie isi prinde singura erorile. */
export function trimiteEveniment(furnizor: Furnizor, orderId: string, fel: FelEveniment): Promise<Verdict> {
  switch (furnizor) {
    case "mailchimp": return evenimentMailchimp(orderId, fel);
    case "brevo": return evenimentBrevo(orderId, fel);
    case "klaviyo": return evenimentKlaviyo(orderId, fel);
  }
  return Promise.resolve({ fel: "refuzat", motiv: `furnizor necunoscut: ${String(furnizor)}` });
}
