// Centralizeaza conditia „cont inactiv" (abonament neplatit / trial expirat).
// Aceeasi logica pe care o foloseste storefront-ul public ca sa ascunda magazinul
// (vezi src/app/(public)/[slug]/page.tsx): fie perioada de gratie a unui abonament
// platit a expirat (`suspended_until` in trecut), fie planul gratuit/trial a expirat.
//
// Functie PURA (nu componenta/hook) — de aceea apelul `Date.now()` de aici nu
// incalca regula ESLint react-hooks/purity cand e apelata dintr-un Server Component.

export type InactiveReason = "trial" | "subscription";

// Plasa de siguranta pentru planuri PLATITE: un abonament cu plan_expires_at mult
// in trecut (peste dunning-ul de ~3 sapt + gratie 15 zile) FARA suspended_until
// inseamna un abonament pierdut care nu a fost prins de subscription.deleted (ex.
// webhook ratat sau abandon la schimbarea planului). Peste acest prag il tratam ca
// inactiv. Marginea de 45 zile > 36 zile (dunning+gratie), deci nu prinde niciodata
// un abonament aflat legitim in dunning.
const PAID_INACTIVE_CUTOFF_DAYS = 45;

interface Params {
  plan: string;
  planExpiresAt: string | null;
  suspendedUntils?: (string | null | undefined)[];
}

/** Motivul pentru care contul e inactiv, sau `null` daca e activ. */
export function getInactiveReason(params: Params): InactiveReason | null {
  const now = Date.now();

  // Abonament platit anulat de Stripe → perioada de gratie a expirat.
  if (params.suspendedUntils?.some((s) => s && new Date(s).getTime() < now)) {
    return "subscription";
  }

  // Plan gratuit / trial expirat.
  if ((params.plan === "free" || params.plan === "trial") && params.planExpiresAt) {
    if (new Date(params.planExpiresAt).getTime() < now) return "trial";
  }

  // Plasa de siguranta pentru abonamente platite pierdute (fara suspended_until).
  if (params.plan !== "free" && params.plan !== "trial" && params.planExpiresAt) {
    const daysPast = (now - new Date(params.planExpiresAt).getTime()) / 86_400_000;
    if (daysPast > PAID_INACTIVE_CUTOFF_DAYS) return "subscription";
  }

  return null;
}

/** `true` daca dashboard-ul trebuie blocat pana la reactivare. */
export function isSubscriptionInactive(params: Params): boolean {
  return getInactiveReason(params) !== null;
}
