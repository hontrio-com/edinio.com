export const PLANS = ["free", "basic", "premium", "ultra"] as const;
export type PlanId = (typeof PLANS)[number];

export const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit",
  basic: "Basic",
  premium: "Premium",
  ultra: "Ultra",
};

export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  basic: 99,
  premium: 249,
  ultra: 499,
};

export const PLAN_COLORS: Record<string, string> = {
  free: "#a1a1aa",
  basic: "#3b82f6",
  premium: "#8b5cf6",
  ultra: "#f59e0b",
};

export const PLAN_BADGE_CLASSES: Record<string, string> = {
  free: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
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
