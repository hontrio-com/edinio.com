import type { Field } from "./registry";

/**
 * Curatarea valorilor venite din jsonb, pe descriptorii `fields` din registru.
 *
 * Mutata din `parse.ts` (etapa 11 din `docs/editor-magazin/PLAN.md`): o folosesc si sectiunile, si coloanele
 * subsolului (`blocuri.ts`), iar `blocuri.ts` nu poate importa din `parse.ts` (il importa el). Fara dependente la
 * rulare de registru: doar tipul `Field`.
 */

export const MAX_REPEATER_ITEMS = 24;
export const MAX_PRODUCT_IDS = 24;
export const MAX_TEXT = 200;
export const MAX_TEXTAREA = 2000;

export function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * Culorile ajung intr-un atribut `style` ca valori de variabile CSS. CSSOM refuza
 * oricum valorile invalide, dar acceptam explicit doar notatiile pe care le poate
 * produce editorul, ca sa nu depindem de asta.
 */
const COLOR_RE =
  /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|oklch\([\d\s.,%/]+\)|var\(--[a-z0-9-]+\)|transparent|currentColor)$/i;

export function sanitizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v && v.length <= 64 && COLOR_RE.test(v) ? v : undefined;
}

/** Linkuri stocate: acceptam doar ce e sigur de randat. Vezi si lib/pages/href.ts. */
export function sanitizeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v || v.length > 500) return undefined;
  if (v.startsWith("#") || v.startsWith("/")) return v;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v;
  // Orice altceva cu schema (javascript:, data:, vbscript:) e respins.
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? undefined : v;
}

export function sanitizeImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v || v.length > 1000) return undefined;
  return /^(https?:\/\/|\/)/i.test(v) ? v : undefined;
}

export function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.slice(0, max);
  return v.length ? v : undefined;
}

export function clamp(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, min), max);
}

function sanitizeField(field: Field, value: unknown): unknown {
  switch (field.type) {
    case "text":
      return str(value, field.maxLength ?? MAX_TEXT);
    case "textarea":
      return str(value, field.maxLength ?? MAX_TEXTAREA);
    case "link":
      return sanitizeHref(value);
    case "toggle":
      return typeof value === "boolean" ? value : undefined;
    case "select":
      return oneOf(value, field.options.map((o) => o.value));
    case "color":
      return sanitizeColor(value);
    case "image":
      return sanitizeImage(value);
    case "range":
      return clamp(value, field.min, field.max);
    case "icon":
      return typeof value === "string" && /^[A-Za-z0-9]{1,40}$/.test(value) ? value : undefined;
    case "category":
      return str(value, MAX_TEXT);
    case "products":
      return Array.isArray(value)
        ? value.filter((x): x is string => typeof x === "string" && x.length <= 64).slice(0, MAX_PRODUCT_IDS)
        : undefined;
    case "actions": {
      if (!Array.isArray(value)) return undefined;
      const permise = new Map(field.options.map((o) => [o.value, o.value]));
      const vazute = new Set<string>();
      const out: { key: string; on: boolean }[] = [];
      for (const item of value) {
        const key = permise.get(obj(item).key as string);
        if (!key || vazute.has(key)) continue;
        vazute.add(key);
        out.push({ key, on: obj(item).on !== false });
      }
      // Actiunile lipsa se adauga aprinse la coada: lista salvata trebuie sa
      // ramana completa, altfel una noua n-ar mai putea fi pornita niciodata.
      for (const o of field.options) {
        if (!vazute.has(o.value)) out.push({ key: o.value, on: true });
      }
      return out;
    }
    case "repeater": {
      if (!Array.isArray(value)) return undefined;
      const items = value
        .slice(0, field.max ?? MAX_REPEATER_ITEMS)
        .map((item) => sanitizeSettings(field.fields, obj(item)));
      return items;
    }
    default:
      return undefined;
  }
}

export function sanitizeSettings(fields: Field[], raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = sanitizeField(field, raw[field.key]);
    if (value !== undefined) out[field.key] = value;
  }
  return out;
}
