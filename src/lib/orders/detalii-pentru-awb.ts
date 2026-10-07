import { stripDiacritics } from "@/lib/utils/ro-address";

/**
 * Ce aduce formularul de checkout pe AWB: observatiile si, la comenzile vechi, codul postal.
 *
 * ═══ DE CE (cerut de un magazin, 07.10.2026) ═══
 *
 * Campurile personalizate („Punct reper", „Observatii"...) stau in `orders.notes`, ca JSON cheiat
 * pe id-ul campului. Fereastra de AWB nu le citea: observatiile porneau goale, iar curierul nu afla
 * nimic din ce scrisese clientul. Comerciantul bifeaza acum, pe fiecare camp, „Pune pe AWB"
 * (`pe_awb`); numai acelea intra, cu eticheta lor („Punct reper: langa scoala").
 *
 * ⚠ Codul postal dupa NUME e numai pentru comenzile de dinainte de campul adevarat
 * (`postal_field`, scris in `postal_code`): magazinul care a cerut asta si-l facuse singur, ca camp
 * personalizat numit „Cod postal", completat la 86 din 91 de comenzi. Se ia numai cand comanda
 * n-are `postal_code` si numai daca are exact 6 cifre; altfel nimic (nu se ghiceste).
 */
export type CampCheckoutAwb = { id: string; label: string; pe_awb?: boolean };

export type DetaliiPentruAwb = { observatii: string; codPostal: string };

export const FARA_DETALII: DetaliiPentruAwb = { observatii: "", codPostal: "" };

function valori(note: string | null | undefined): Record<string, unknown> | null {
  const brut = (note ?? "").trim();
  if (!brut.startsWith("{")) return null;
  try {
    const v = JSON.parse(brut) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(v: unknown): string {
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "Da" : "";
  return "";
}

const NUME_COD_POSTAL = /^cod\s*postal$/;

export function detaliiPentruAwb(
  note: string | null | undefined,
  campuri: ReadonlyArray<CampCheckoutAwb>,
): DetaliiPentruAwb {
  const v = valori(note);
  if (!v) return FARA_DETALII;

  const observatii = campuri
    .filter((c) => c.pe_awb === true)
    .map((c) => {
      const val = text(v[c.id]);
      if (!val) return "";
      const eticheta = c.label.trim();
      return eticheta ? `${eticheta}: ${val}` : val;
    })
    .filter(Boolean)
    .join("; ");

  const campCod = campuri.find((c) => NUME_COD_POSTAL.test(stripDiacritics(c.label).toLowerCase().trim()));
  const cod = campCod ? text(v[campCod.id]).replace(/\s+/g, "") : "";

  return { observatii, codPostal: /^\d{6}$/.test(cod) ? cod : "" };
}

/**
 * Campurile de checkout din configurarea magazinului, in forma de mai sus. Primeste `page_content`
 * (sau numai `checkout_config`) asa cum vine din baza; orice forma stricata da lista goala.
 */
export function campuriDinConfigurare(checkoutConfig: unknown): CampCheckoutAwb[] {
  const lista = (checkoutConfig as { custom_fields?: unknown } | null)?.custom_fields;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((c): c is { id: string; label?: unknown; pe_awb?: unknown } => !!c && typeof (c as { id?: unknown }).id === "string")
    .map((c) => ({ id: c.id, label: typeof c.label === "string" ? c.label : "", pe_awb: c.pe_awb === true }));
}
