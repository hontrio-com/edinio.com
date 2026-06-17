/**
 * Reusable merchant-built forms. Stored in the `forms` table; referenced by the
 * page form-block via `formId`. The public storefront only ever receives the
 * `PublicForm` subset (no email settings).
 */

export type FormFieldType =
  | "text" | "textarea" | "email" | "phone" | "number" | "select" | "checkbox" | "date";

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // for "select"
  helpText?: string;
}

export interface FormDef {
  id: string;
  name: string;
  fields: FormField[];
  submit_label: string;
  success_message: string;
  email_enabled: boolean;
  email_to: string | null;
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
];

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
    ...(type === "select" ? { options: ["Optiunea 1", "Optiunea 2"] } : {}),
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
