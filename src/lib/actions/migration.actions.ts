"use server";

import { sendMigrationLeadToAdmin } from "@/lib/email";
import { logError } from "@/lib/error-logger";

const PLATFORMS = ["Shopify", "Gomag", "MerchantPro", "WooCommerce", "Sellavi", "Alta"];

export type MigrationLeadResult = { ok: true } | { ok: false; error: string };

export async function submitMigrationLead(input: {
  name: string;
  phone: string;
  platform: string;
  productsCount: string;
}): Promise<MigrationLeadResult> {
  const name = (input.name ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const platform = (input.platform ?? "").trim();
  const productsCount = (input.productsCount ?? "").trim();

  if (!phone) {
    return { ok: false, error: "Numarul de telefon este obligatoriu." };
  }
  const digits = phone.replace(/[\s.\-()]/g, "");
  if (!/^\+?\d{9,15}$/.test(digits)) {
    return { ok: false, error: "Introdu un numar de telefon valid." };
  }
  const safePlatform = PLATFORMS.includes(platform) ? platform : "Alta";

  try {
    await sendMigrationLeadToAdmin({
      name: name || "(nespecificat)",
      phone,
      platform: safePlatform,
      productsCount: productsCount || "(nespecificat)",
    });
    return { ok: true };
  } catch (err) {
    await logError({
      action: "submitMigrationLead",
      message: err instanceof Error ? err.message : "Eroare necunoscuta",
      severity: "error",
    });
    return { ok: false, error: "A aparut o eroare. Te rugam sa incerci din nou." };
  }
}
