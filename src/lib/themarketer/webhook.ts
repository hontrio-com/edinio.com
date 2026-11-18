import type { FelWebhook } from "./chei";

/**
 * Adresele dintr-un corp de webhook theMarketer. Pura.
 *
 * Formele lor (developers.themarketer.com/reference/contact-unsubscribed, /email-bounced,
 * /email-marked-as-spam): `{"email": …}` pentru dezabonare si spam, `{"email": …, "bounce_type":
 * "bounce_hard" | "bounce_soft"}` pentru respingere. Se primeste si o lista de astfel de obiecte.
 *
 * ⚠ NUMAI RESPINGEREA DEFINITIVA OPRESTE TRIMITERILE. O respingere temporara (`bounce_soft`: cutie
 * plina, server picat) nu spune nimic despre adresa; oprita pentru atat, omul n-ar mai primi nici
 * emailul de cos abandonat cand cutia lui se goleste.
 */
export function adreseDinWebhook(fel: FelWebhook, corp: unknown): string[] {
  const lista = Array.isArray(corp) ? corp : [corp];
  const iesire: string[] = [];
  for (const brut of lista.slice(0, 500)) {
    if (!brut || typeof brut !== "object") continue;
    const o = brut as { email?: unknown; client_email?: unknown; bounce_type?: unknown };
    if (fel === "respins" && String(o.bounce_type ?? "").toLowerCase() !== "bounce_hard") continue;
    const email = typeof o.email === "string" ? o.email : typeof o.client_email === "string" ? o.client_email : "";
    const e = email.trim().toLowerCase();
    if (e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) iesire.push(e);
  }
  return [...new Set(iesire)];
}
