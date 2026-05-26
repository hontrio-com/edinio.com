export const PLAN_PRODUCT_LIMITS: Record<string, number> = {
  free:    10,
  basic:   500,
  premium: 2500,
  ultra:   Infinity,
};

export function getProductLimit(plan: string): number {
  return PLAN_PRODUCT_LIMITS[plan] ?? PLAN_PRODUCT_LIMITS.free;
}

export function isAtProductLimit(plan: string, currentCount: number): boolean {
  const limit = getProductLimit(plan);
  return currentCount >= limit;
}
