export const PLANS = ["free", "basic", "premium", "ultra"] as const;
export type PlanId = (typeof PLANS)[number];

// Premium-tier features (e.g. abandoned-cart automations) require Premium or Ultra.
export function isPremiumPlan(plan: string | null | undefined): boolean {
  return plan === "premium" || plan === "ultra";
}

export const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit (15 zile)",
  trial: "Gratuit (15 zile)",
  basic: "Basic",
  premium: "Premium",
  ultra: "Ultra",
  domain: "Domeniu",
};

export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  trial: 0,
  basic: 99,
  premium: 249,
  ultra: 499,
};

// ─── Facturare: lunar vs anual ──────────────────────────────────────────────
export type BillingInterval = "monthly" | "annual";

// Alegand plata anuala, clientul primeste 3 luni gratuite: plateste 9 luni,
// primeste 12. Astfel pretul anual = pretul lunar × 9.
export const ANNUAL_FREE_MONTHS = 3;
export const ANNUAL_PAID_MONTHS = 12 - ANNUAL_FREE_MONTHS; // 9

/** Pretul total facturat o data pe an pentru un plan (lunar × 9). */
export function getAnnualPrice(plan: string): number {
  return (PLAN_PRICES[plan] ?? 0) * ANNUAL_PAID_MONTHS;
}

/** Echivalentul lunar cand platesti anual, pentru afisaj "X lei/luna". */
export function getAnnualMonthlyEquivalent(plan: string): number {
  return Math.round(getAnnualPrice(plan) / 12);
}

/** Cat economisesti intr-un an alegand plata anuala (= 3 luni gratuite). */
export function getAnnualSavings(plan: string): number {
  return (PLAN_PRICES[plan] ?? 0) * ANNUAL_FREE_MONTHS;
}

export const PLAN_COLORS: Record<string, string> = {
  free: "#a1a1aa",
  trial: "#1AB554",
  basic: "#3b82f6",
  premium: "#8b5cf6",
  ultra: "#f59e0b",
};

export const PLAN_BADGE_CLASSES: Record<string, string> = {
  free: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  trial: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  basic: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  premium: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ultra: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export const ROLES = ["user", "admin"] as const;
export type RoleId = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  user: "Utilizator",
  admin: "Admin",
};
