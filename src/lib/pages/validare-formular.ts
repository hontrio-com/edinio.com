import type { ContactBlock } from "./blocks.types";
import type { FormField } from "./forms.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CE SE PRIMESTE DINTR-UN FORMULAR, VERIFICAT PE SERVER             (26.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Pana acum serverul lua lista `{eticheta, valoare}` asa cum o trimitea
  browserul: oricine ocolea pagina putea trimite campuri inventate, fara
  campurile obligatorii, cu „email”-uri care nu erau email si optiuni care nu
  existau, iar toate ajungeau in „Mesaje” si in emailul comerciantului.

  Acum raspunsul se RECONSTRUIESTE din definitia formularului: numai campurile
  lui, in ordinea lui, cu etichetele lui, fiecare verificat dupa tip. Ce nu e
  in definitie nu trece.
*/

export interface CampPrimit { id?: string; label: string; value: string }

/** Campurile formularului simplu (blocul de contact fara formular propriu). */
export function campuriFormularSimplu(block: Pick<ContactBlock, "showPhone" | "showMessage" | "consent" | "consentText">): FormField[] {
  const f: FormField[] = [
    { id: "name", label: "Nume", type: "text", required: true, placeholder: "Numele tau", width: "half" },
    { id: "email", label: "Email", type: "email", required: true, placeholder: "adresa@email.ro", width: "half" },
  ];
  if (block.showPhone !== false) f.push({ id: "phone", label: "Telefon", type: "phone", required: false, placeholder: "Telefon (optional)" });
  if (block.showMessage !== false) f.push({ id: "message", label: "Mesaj", type: "textarea", required: true, placeholder: "Mesajul tau" });
  if (block.consent) f.push({ id: "acord", label: block.consentText || "Sunt de acord cu prelucrarea datelor mele pentru a primi un răspuns.", type: "checkbox", required: true });
  return f;
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const TELEFON = /^[+0-9 ()./-]{6,24}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DATA_ORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

const scurt = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

export function valideazaTrimitere(
  definitie: FormField[],
  primite: CampPrimit[],
): { campuri: { label: string; value: string }[] } | { error: string } {
  const dupaId = new Map<string, string>();
  const dupaEticheta = new Map<string, string>();
  for (const p of primite ?? []) {
    if (!p || typeof p.label !== "string") continue;
    const v = String(p.value ?? "");
    if (typeof p.id === "string" && p.id) dupaId.set(p.id, v);
    dupaEticheta.set(p.label, v);
  }

  const campuri: { label: string; value: string }[] = [];
  for (const f of definitie) {
    let v = (dupaId.get(f.id) ?? dupaEticheta.get(f.label) ?? "").trim();
    v = scurt(v, f.type === "textarea" ? 5000 : 500);
    const eticheta = f.label.slice(0, 120);

    if (f.type === "checkbox") {
      const bifat = v === "Da" || v === "da";
      if (f.required && !bifat) return { error: `Bifează „${eticheta}” ca să poți trimite.` };
      campuri.push({ label: eticheta, value: bifat ? "Da" : "Nu" });
      continue;
    }
    if (!v) {
      if (f.required) return { error: `Completează câmpul „${eticheta}”.` };
      campuri.push({ label: eticheta, value: "" });
      continue;
    }

    switch (f.type) {
      case "email":
        if (!EMAIL.test(v)) return { error: `„${eticheta}” nu pare o adresă de email.` };
        break;
      case "phone":
        if (!TELEFON.test(v)) return { error: `„${eticheta}” nu pare un număr de telefon.` };
        break;
      case "number":
        if (!Number.isFinite(Number(v.replace(",", ".")))) return { error: `„${eticheta}” trebuie să fie un număr.` };
        break;
      case "date":
        if (!DATA.test(v)) return { error: `„${eticheta}” nu e o dată.` };
        break;
      case "datetime": {
        const m = DATA_ORA.exec(v);
        if (!m) return { error: `„${eticheta}” nu e o dată cu oră.` };
        // Scrisa ca in Romania: 26.09.2026, 14:30.
        v = `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]}`;
        break;
      }
      case "select":
      case "radio":
        if (!(f.options ?? []).includes(v)) return { error: `Alege una dintre variantele de la „${eticheta}”.` };
        break;
      case "checkboxes": {
        // Browserul trimite bifele despartite de \u0000 (o optiune poate avea virgula in ea).
        // Fara separator: intai valoarea INTREAGA (o singura bifa „Livrare, montaj” era taiata la virgula si refuzata).
        const optiuni = f.options ?? [];
        const alese = (v.includes("\u0000") ? v.split("\u0000") : optiuni.includes(v.trim()) ? [v] : v.split(/,\s*/)).map((x) => x.trim()).filter(Boolean);
        if (alese.some((x) => !optiuni.includes(x))) return { error: `Alege variante din lista de la „${eticheta}”.` };
        // „; ” intre bife: o optiune poate avea virgula in ea, deci „, ” le amesteca in Mesaje si in email.
        v = alese.join("; ");
        break;
      }
    }
    campuri.push({ label: eticheta, value: v });
  }
  if (campuri.length === 0) return { error: "Formularul nu are niciun câmp." };
  return { campuri };
}

/** Sub atat timp de la afisare, o trimitere e a unui robot (un om nu completeaza atat de repede). */
export const DURATA_MINIMA_MS = 1200;
