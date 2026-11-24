/**
 * Editarea „Campurilor aditionale” ale unei comenzi (cerut de un magazin, 23.11.2026).
 *
 * Campurile din formularul de comanda („Punct reper”, „Observatii”, „Tara”...) stau in
 * `orders.notes`, ca JSON cheiat pe id-ul campului (`order.actions.ts`, `notes:
 * data.custom_fields`). Panoul le arata pe comanda, dar „Editeaza comanda” nu le putea
 * schimba: o observatie gresita sau un punct de reper uitat ajungeau asa pe AWB, fiindca
 * campurile cu „Pune pe AWB” se citesc din aceeasi coloana (`detalii-pentru-awb.ts`).
 *
 * ═══ REGULILE ═══
 *
 *   - se pot scrie numai campurile din configurarea de AZI a magazinului si cheile care sunt
 *     DEJA pe comanda (un camp sters intre timp din formular isi pastreaza valoarea si se
 *     poate corecta). Orice alta cheie se ignora: actiunea de server e un punct de intrare
 *     public, iar `notes` nu e un loc in care sa se poata scrie orice;
 *   - valoarea goala SCOATE cheia, ca la checkout (acolo un camp necompletat nu se trimite);
 *   - bifa se tine ca la checkout: `"da"` cand e pusa, lipsa cand nu;
 *   - o comanda a carei `notes` e TEXT simplu (comenzi vechi, importuri) nu se atinge: textul
 *     e al clientului, iar transformat in campuri s-ar pierde.
 *
 * ⚠ Functii PURE, fara baza: ce iese aici se proba.
 */

export type TipCampAditional = "text" | "textarea" | "select" | "checkbox";

export type CampAditional = {
  id: string;
  label: string;
  type: TipCampAditional;
  /** Variantele unui camp de tip lista. */
  options: string[];
  /** Campul se pune pe AWB (`pe_awb`): schimbarea lui conteaza doar inaintea emiterii. */
  peAwb: boolean;
};

/** Cea mai lunga valoare a unui camp. Formularul de comanda n-are plafon; coloana e text. */
export const VALOARE_MAX = 500;

/** Valoarea unei bife puse, asa cum o scrie formularul de comanda. */
export const BIFA_PUSA = "da";

const TIPURI: ReadonlySet<string> = new Set(["text", "textarea", "select", "checkbox"]);

/** Campurile din `checkout_config`, cu tipul si variantele lor. Orice forma stricata da lista goala. */
export function campuriAditionaleDinConfigurare(checkoutConfig: unknown): CampAditional[] {
  const lista = (checkoutConfig as { custom_fields?: unknown } | null)?.custom_fields;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((c): c is Record<string, unknown> & { id: string } => !!c && typeof (c as { id?: unknown }).id === "string")
    .map((c) => ({
      id: c.id,
      label: typeof c.label === "string" ? c.label.trim() : "",
      type: typeof c.type === "string" && TIPURI.has(c.type) ? (c.type as TipCampAditional) : "text",
      /* Variantele sunt un singur text, despartit prin virgule (`CheckoutForm.tsx`). */
      options: typeof c.options === "string" ? c.options.split(",").map((o) => o.trim()).filter(Boolean) : [],
      peAwb: c.pe_awb === true,
    }));
}

export type NoteleComenzii =
  /** Fara nimic scris. */
  | { fel: "gol" }
  /** Campuri din formular, cheiate pe id. */
  | { fel: "campuri"; valori: Record<string, string> }
  /** Text simplu, de dinaintea campurilor: nu se editeaza pe campuri. */
  | { fel: "text"; text: string };

function caText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? BIFA_PUSA : "";
  return "";
}

/** Ce tine `orders.notes`, citit o data. */
export function citesteNotele(note: string | null | undefined): NoteleComenzii {
  const brut = (note ?? "").trim();
  if (!brut) return { fel: "gol" };
  let v: unknown;
  try {
    v = JSON.parse(brut);
  } catch {
    return { fel: "text", text: brut };
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return { fel: "text", text: brut };
  const valori: Record<string, string> = {};
  for (const [cheie, val] of Object.entries(v as Record<string, unknown>)) {
    const t = caText(val);
    if (t.trim()) valori[cheie] = t;
  }
  return { fel: "campuri", valori };
}

/**
 * Campurile de aratat in fereastra de editare: cele din configurare, in ordinea ei, apoi
 * cheile ramase pe comanda de la campuri care nu mai sunt in formular (ca text simplu, cu
 * eticheta data de apelant).
 */
export function campuriDeEditat(
  configurate: ReadonlyArray<CampAditional>,
  note: NoteleComenzii,
  etichetaCheiiVechi: (cheie: string) => string,
): CampAditional[] {
  if (note.fel === "text") return [];
  const stiute = new Set(configurate.map((c) => c.id));
  const vechi = note.fel === "campuri"
    ? Object.keys(note.valori).filter((k) => !stiute.has(k)).map((k): CampAditional => ({
        id: k, label: etichetaCheiiVechi(k), type: "text", options: [], peAwb: false,
      }))
    : [];
  return [...configurate, ...vechi];
}

export type RezultatEditare =
  | { ok: true; note: string | null; schimbat: boolean }
  | { ok: false; error: string };

/**
 * `orders.notes` dupa editare.
 *
 * `cerute` e ce a trimis fereastra (orice forma: vine dintr-o actiune de server); `configurate`
 * sunt campurile de azi ale magazinului.
 */
export function noteleDupaEditare(
  noteVechi: string | null | undefined,
  cerute: unknown,
  configurate: ReadonlyArray<CampAditional>,
): RezultatEditare {
  const acum = citesteNotele(noteVechi);
  if (acum.fel === "text") {
    return { ok: false, error: "Comanda are o mențiune scrisă ca text simplu, nu câmpuri din formular, deci nu se poate edita pe câmpuri." };
  }
  if (!cerute || typeof cerute !== "object" || Array.isArray(cerute)) {
    return { ok: false, error: "Date invalide." };
  }

  const vechi = acum.fel === "campuri" ? acum.valori : {};
  const dupaId = new Map(configurate.map((c) => [c.id, c]));
  const permise = new Set([...dupaId.keys(), ...Object.keys(vechi)]);
  const noi: Record<string, string> = { ...vechi };

  for (const [cheie, brut] of Object.entries(cerute as Record<string, unknown>)) {
    if (!permise.has(cheie)) continue;
    const camp = dupaId.get(cheie);
    let valoare = caText(brut);
    if (camp?.type === "checkbox") {
      valoare = valoare.trim().toLowerCase() === BIFA_PUSA ? BIFA_PUSA : "";
    } else if (camp?.type === "textarea") {
      valoare = valoare.replace(/\r\n/g, "\n").trim();
    } else {
      valoare = valoare.replace(/\s+/g, " ").trim();
    }
    if (valoare.length > VALOARE_MAX) {
      return { ok: false, error: `„${camp?.label || cheie}” are peste ${VALOARE_MAX} de caractere.` };
    }
    /* O lista primeste numai una dintre variantele ei; valoarea veche, scoasa intre timp din
       lista, ramane cum era daca fereastra o trimite neschimbata. */
    if (camp?.type === "select" && valoare && !camp.options.includes(valoare) && valoare !== vechi[cheie]) {
      return { ok: false, error: `„${valoare}” nu e printre variantele câmpului „${camp.label || cheie}”.` };
    }
    if (valoare) noi[cheie] = valoare; else delete noi[cheie];
  }

  const chei = Object.keys(noi);
  const schimbat = chei.length !== Object.keys(vechi).length || chei.some((k) => noi[k] !== vechi[k]);
  return { ok: true, note: chei.length > 0 ? JSON.stringify(noi) : null, schimbat };
}
