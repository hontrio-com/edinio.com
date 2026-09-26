/**
 * Reusable merchant-built forms. Stored in the `forms` table; referenced by the
 * page form-block via `formId`. The public storefront only ever receives the
 * `PublicForm` subset (no email settings).
 */

export type FormFieldType =
  | "text" | "textarea" | "email" | "phone" | "number" | "select" | "checkbox" | "date"
  /* 25.09.2026 */
  | "radio" | "checkboxes"
  /* 26.09.2026 */
  | "datetime";

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // for "select", "radio", "checkboxes"
  helpText?: string;
  /** 25.09.2026: jumatate de rand (alaturi de alt camp, cand formularul are doua coloane). */
  width?: "full" | "half";
}

export interface FormDef {
  id: string;
  name: string;
  fields: FormField[];
  submit_label: string;
  success_message: string;
  email_enabled: boolean;
  email_to: string | null;
  mailchimp_enabled: boolean;
  brevo_enabled: boolean;
  klaviyo_enabled: boolean;
}

/** Public-safe subset rendered on the storefront (no email settings exposed). */
export interface PublicForm {
  id: string;
  name: string;
  fields: FormField[];
  submit_label: string;
  success_message: string;
}

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Text scurt" },
  { value: "textarea", label: "Text lung" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefon" },
  { value: "number", label: "Numar" },
  { value: "select", label: "Lista (alegere)" },
  { value: "checkbox", label: "Bifa (accept)" },
  { value: "date", label: "Data" },
  { value: "datetime", label: "Data și ora" },
  { value: "radio", label: "Alegere unică (butoane)" },
  { value: "checkboxes", label: "Alegere multiplă (bife)" },
];

/*
  ⚠ LIMITELE (26.09.2026). Cerute de el: „sa nu poata face campuri la infinit”.
  Masurat pe productie: cel mai mare formular are 5 campuri, niciunul nu are
  optiuni, iar niciun magazin nu are mai mult de un formular. Limitele stau de
  cateva ori peste, deci nu ating nimic real; se aplica si in editor (pe loc)
  si pe server (`form.actions.ts`), unde se poate ajunge si pe langa editor.
*/
export const MAX_CAMPURI = 30;
export const MAX_OPTIUNI = 30;
export const MAX_FORMULARE = 50;

/** Tipurile cu lista de optiuni. */
export const CU_OPTIUNI: FormFieldType[] = ["select", "radio", "checkboxes"];
export const esteTipCamp = (t: unknown): t is FormFieldType => FORM_FIELD_TYPES.some((x) => x.value === t);

let counter = 0;
export function newFieldId(): string {
  counter += 1;
  return `f_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createFormField(type: FormFieldType = "text"): FormField {
  return {
    id: newFieldId(),
    label: type === "checkbox" ? "Sunt de acord" : "Camp nou",
    type,
    required: false,
    placeholder: "",
    ...(CU_OPTIUNI.includes(type) ? { options: ["Opțiunea 1", "Opțiunea 2"] } : {}),
  };
}

/** Default fields for a freshly created form (a basic contact form). */
export function defaultFormFields(): FormField[] {
  return [
    { id: newFieldId(), label: "Nume", type: "text", required: true, placeholder: "Numele tau" },
    { id: newFieldId(), label: "Email", type: "email", required: true, placeholder: "adresa@email.ro" },
    { id: newFieldId(), label: "Telefon", type: "phone", required: false, placeholder: "07xxxxxxxx" },
    { id: newFieldId(), label: "Mesaj", type: "textarea", required: true, placeholder: "Mesajul tau" },
  ];
}

/* ─── Sabloanele de formular nou (26.09.2026) ─────────────────────────────── */

const camp = (label: string, type: FormFieldType, extra: Partial<FormField> = {}): FormField => ({
  id: newFieldId(), label, type, required: false, placeholder: "", ...extra,
});

export const SABLOANE_FORMULAR = [
  { cheie: "gol", nume: "Formular gol", descriere: "Pornești de la zero.", buton: "Trimite", multumire: "Mulțumim! Am primit mesajul." },
  { cheie: "contact", nume: "Contact", descriere: "Nume, email, telefon și mesaj.", buton: "Trimite mesajul", multumire: "Mulțumim! Îți răspundem cât de repede putem." },
  { cheie: "oferta", nume: "Cerere de ofertă", descriere: "Ce produs, câte bucăți, pentru cine.", buton: "Cere oferta", multumire: "Mulțumim! Îți trimitem oferta în cel mult o zi lucrătoare." },
  { cheie: "programare", nume: "Programare", descriere: "Serviciul, data și ora dorite.", buton: "Programează-mă", multumire: "Mulțumim! Te sunăm să confirmăm programarea." },
  { cheie: "retur", nume: "Retur sau garanție", descriere: "Numărul comenzii, motivul și detaliile.", buton: "Trimite cererea", multumire: "Am primit cererea. Te contactăm în 1-2 zile lucrătoare." },
  { cheie: "feedback", nume: "Părerea ta", descriere: "Cât de mulțumit e clientul și ce am putea face mai bine.", buton: "Trimite părerea", multumire: "Mulțumim că ne-ai spus!" },
  { cheie: "eveniment", nume: "Înscriere la eveniment", descriere: "Nume, contact și câte persoane vin.", buton: "Mă înscriu", multumire: "Te-ai înscris! Îți trimitem detaliile pe email." },
  { cheie: "b2b", nume: "Colaborare B2B", descriere: "Firmă, CUI, persoană de contact.", buton: "Trimite", multumire: "Mulțumim! Revenim cu o propunere." },
] as const;

export type SablonFormular = (typeof SABLOANE_FORMULAR)[number]["cheie"];
export const esteSablonFormular = (v: unknown): v is SablonFormular => SABLOANE_FORMULAR.some((x) => x.cheie === v);

/** Campurile unui sablon, cu id-uri noi (se cheama pe server, la creare). */
export function campuriSablon(sablon: SablonFormular): FormField[] {
  switch (sablon) {
    case "gol": return [];
    case "contact": return defaultFormFields();
    case "oferta": return [
      camp("Nume", "text", { required: true, width: "half", placeholder: "Numele tău" }),
      camp("Firmă", "text", { width: "half", placeholder: "Opțional" }),
      camp("Email", "email", { required: true, width: "half", placeholder: "adresa@email.ro" }),
      camp("Telefon", "phone", { required: true, width: "half", placeholder: "07xx xxx xxx" }),
      camp("Ce produs te interesează", "text", { required: true }),
      camp("Cantitate", "number", { width: "half", placeholder: "Ex: 10" }),
      camp("Termen dorit", "date", { width: "half" }),
      camp("Detalii", "textarea", { helpText: "Dimensiuni, culori, personalizări: orice ne ajută la ofertă." }),
    ];
    case "programare": return [
      camp("Nume", "text", { required: true, width: "half" }),
      camp("Telefon", "phone", { required: true, width: "half" }),
      camp("Email", "email", {}),
      camp("Serviciul dorit", "select", { required: true, options: ["Consultanță", "Montaj", "Vizită în showroom"] }),
      camp("Data și ora", "datetime", { required: true, helpText: "Te sunăm să confirmăm, dacă ora nu e liberă îți propunem alta." }),
      camp("Observații", "textarea", {}),
    ];
    case "retur": return [
      camp("Nume", "text", { required: true, width: "half" }),
      camp("Număr comandă", "text", { required: true, width: "half", placeholder: "Ex: #1042", helpText: "Îl găsești în emailul de confirmare a comenzii." }),
      camp("Email", "email", { required: true, width: "half" }),
      camp("Telefon", "phone", { width: "half" }),
      camp("Motivul", "radio", { required: true, options: ["Retur (nu mai vreau produsul)", "Produs defect / garanție", "Am primit alt produs"] }),
      camp("Ce s-a întâmplat", "textarea", { required: true }),
      camp("Sunt de acord cu prelucrarea datelor pentru soluționarea cererii", "checkbox", { required: true }),
    ];
    case "feedback": return [
      camp("Cât de mulțumit ești?", "radio", { required: true, options: ["Foarte mulțumit", "Mulțumit", "Așa și așa", "Nemulțumit"] }),
      camp("Ce ți-a plăcut?", "checkboxes", { options: ["Produsele", "Prețurile", "Livrarea", "Comunicarea"] }),
      camp("Ce am putea face mai bine?", "textarea", {}),
      camp("Email (dacă vrei să-ți răspundem)", "email", {}),
    ];
    case "eveniment": return [
      camp("Nume", "text", { required: true, width: "half" }),
      camp("Telefon", "phone", { required: true, width: "half" }),
      camp("Email", "email", { required: true }),
      camp("Câte persoane", "number", { required: true, width: "half", placeholder: "1" }),
      camp("Mențiuni", "textarea", { helpText: "Alergii, nevoi speciale sau orice vrei să știm." }),
    ];
    case "b2b": return [
      camp("Firmă", "text", { required: true, width: "half" }),
      camp("CUI", "text", { width: "half", placeholder: "RO12345678" }),
      camp("Persoană de contact", "text", { required: true }),
      camp("Email", "email", { required: true, width: "half" }),
      camp("Telefon", "phone", { required: true, width: "half" }),
      camp("Ce ne propui", "textarea", { required: true }),
    ];
  }
}
