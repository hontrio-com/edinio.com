import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { esteTipComanda } from "@/lib/storefront/design/tip-comanda";

/**
 * Formularul de comanda din Setari (`page_content.checkout_config`).
 *
 * Aici stau citirea din baza si verificarea de dinainte de salvare, ca sa le
 * poata folosi si pagina de pe server, si ecranul, si probele. Componenta e
 * „use client", deci o functie exportata din ea nu se poate chema de pe server.
 */

export type ConfigFormular = NonNullable<StorePageContent["checkout_config"]>;
export type CampSuplimentar = NonNullable<ConfigFormular["custom_fields"]>[number];
export type OptiuneExtra = NonNullable<ConfigFormular["extras"]>[number];

const TIPURI_CAMP = new Set<CampSuplimentar["type"]>(["text", "textarea", "select", "checkbox"]);

function obiect(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Configuratia din `page_content`, adusa la forma pe care o poate desena ecranul.
 *
 * Cheile pe care ecranul nu le cunoaste raman in obiect, ca sa plece inapoi
 * neatinse la salvare. Listele primesc forma minima (eticheta text, pret numar),
 * altfel un rand stricat din baza ar darama toata fila la `.trim()`.
 */
export function formularDinPageContent(pageContent: unknown): ConfigFormular {
  const { tip: tipComanda, ...cfg } = obiect(obiect(pageContent).checkout_config);
  const campuri = Array.isArray(cfg.custom_fields) ? cfg.custom_fields : [];
  const extras = Array.isArray(cfg.extras) ? cfg.extras : [];
  return {
    ...(cfg as ConfigFormular),
    // Tipul de checkout (etapa 15) ramane doar cand e unul cunoscut: o valoare stricata n-are ce cauta inapoi in baza.
    ...(esteTipComanda(tipComanda) ? { tip: tipComanda } : {}),
    custom_fields: campuri.map((brut, i) => {
      const c = obiect(brut);
      const tip = TIPURI_CAMP.has(c.type as CampSuplimentar["type"]) ? (c.type as CampSuplimentar["type"]) : "text";
      return {
        ...(c as CampSuplimentar),
        id: typeof c.id === "string" && c.id ? c.id : `cf_r${i}`,
        label: typeof c.label === "string" ? c.label : "",
        type: tip,
        required: c.required === true,
      };
    }),
    extras: extras.map((brut, i) => {
      const e = obiect(brut);
      const pret = Number(e.price);
      return {
        ...(e as OptiuneExtra),
        id: typeof e.id === "string" && e.id ? e.id : `ext_r${i}`,
        label: typeof e.label === "string" ? e.label : "",
        price: Number.isFinite(pret) ? pret : 0,
      };
    }),
  };
}

/** Ce nu poate pleca asa in formularul clientului. Primul gasit, cu locul lui. */
export function problemaFormularului(config: ConfigFormular): string | null {
  for (const [i, camp] of (config.custom_fields ?? []).entries()) {
    if (!camp.label.trim()) return `Câmpul suplimentar ${i + 1} nu are etichetă. Scrie-o sau șterge câmpul.`;
    if (camp.type === "select" && !(camp.options ?? "").split(",").some((o) => o.trim())) {
      return `Câmpul „${camp.label.trim()}” e o listă fără opțiuni. Scrie opțiunile, despărțite prin virgulă.`;
    }
  }
  for (const [i, extra] of (config.extras ?? []).entries()) {
    if (!extra.label.trim()) return `Opțiunea extra ${i + 1} nu are denumire. Scrie-o sau șterge opțiunea.`;
    if (!Number.isFinite(Number(extra.price)) || Number(extra.price) < 0) {
      return `Prețul opțiunii „${extra.label.trim()}” trebuie să fie un număr, 0 sau mai mare.`;
    }
  }
  return null;
}

/** Ce pleaca in baza: etichetele fara spatii pe margini, pretul la doua zecimale. */
export function formularDeSalvat(config: ConfigFormular): ConfigFormular {
  return {
    ...config,
    custom_fields: (config.custom_fields ?? []).map((f) => ({
      ...f,
      label: f.label.trim(),
      ...(f.options !== undefined ? { options: f.options.trim() } : {}),
      ...(f.placeholder !== undefined ? { placeholder: f.placeholder.trim() } : {}),
    })),
    extras: (config.extras ?? []).map((e) => ({
      ...e,
      label: e.label.trim(),
      price: Math.round(Number(e.price) * 100) / 100,
      ...(e.description !== undefined ? { description: e.description.trim() } : {}),
    })),
  };
}
