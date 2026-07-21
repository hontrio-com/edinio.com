import type { StoreEmailSender, EmailTemplateKind } from "./config";

function subst(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => vars[String(k).toLowerCase()] ?? "");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Resolve subject + heading + intro + button for an email kind: the merchant's
 * saved override (with {{variable}} substitution) when set, otherwise the
 * built-in default. Overrides are plain text edited in place, so they are
 * escaped; the intro keeps line breaks. Applies regardless of SMTP — a merchant
 * who customised the text opted in explicitly.
 */
export function renderTemplate(
  sender: StoreEmailSender | undefined,
  kind: EmailTemplateKind,
  defaults: { subject: string; intro: string; heading?: string; button?: string },
  vars: Record<string, string>,
): { subject: string; intro: string; heading: string; button: string } {
  const o = sender?.templates?.[kind];
  const subject = o?.subject?.trim() ? subst(o.subject, vars) : defaults.subject;
  const intro = o?.intro?.trim()
    ? `<div style="font-size:14px;color:#71717a;line-height:1.7;margin:0 0 24px 0;">${esc(subst(o.intro, vars)).replace(/\n/g, "<br>")}</div>`
    : defaults.intro;
  const heading = o?.heading?.trim() ? esc(subst(o.heading, vars)) : (defaults.heading ?? "");
  const button = o?.button?.trim() ? esc(subst(o.button, vars)) : (defaults.button ?? "");
  return { subject, intro, heading, button };
}

// UI metadata: which templates are editable, their default copy (shown as a hint)
// and their allowed variables. Client-safe (no server imports).
export interface TemplateDef {
  kind: EmailTemplateKind;
  label: string;
  description: string;
  defaultSubject: string;
  defaultHeading?: string;   // when set, the title is editable in place for this kind
  defaultIntro: string;
  defaultButton?: string;    // when set, this kind has an editable call-to-action label
  variables: { token: string; label: string }[];
}

export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    kind: "order_confirmation",
    label: "Confirmare comanda",
    description: "Emailul primit de client imediat dupa ce plaseaza o comanda.",
    defaultSubject: "Comanda ta {{numar_comanda}} a fost primita",
    defaultHeading: "Comanda ta a fost plasata!",
    defaultIntro: "Multumim, {{nume_client}}! Comanda ta la {{nume_magazin}} a fost primita si va fi procesata in curand.",
    variables: [
      { token: "nume_client", label: "Nume client" },
      { token: "nume_magazin", label: "Nume magazin" },
      { token: "numar_comanda", label: "Numar comanda" },
      { token: "total", label: "Total comanda" },
    ],
  },
  {
    kind: "order_status",
    label: "Actualizare status comanda",
    description: "Emailul primit de client cand comanda isi schimba statusul (confirmata / expediata / livrata).",
    defaultSubject: "Actualizare comanda {{numar_comanda}}",
    defaultIntro: "Buna, {{nume_client}}! Iti trimitem un update despre comanda ta la {{nume_magazin}}.",
    variables: [
      { token: "nume_client", label: "Nume client" },
      { token: "nume_magazin", label: "Nume magazin" },
      { token: "numar_comanda", label: "Numar comanda" },
      { token: "status", label: "Status comanda" },
    ],
  },
  {
    kind: "abandoned_cart",
    label: "Cos abandonat",
    description: "Emailul de recuperare trimis clientilor care au lasat produse in cos.",
    defaultSubject: "Ai uitat ceva in cos la {{nume_magazin}}",
    defaultHeading: "Ti-au ramas produse in cos",
    defaultIntro: "Buna, {{nume_client}}! Ai lasat cateva produse in cosul tau la {{nume_magazin}}. Le-am pastrat pentru tine, finalizeaza comanda inainte sa se epuizeze.",
    defaultButton: "Finalizeaza comanda",
    variables: [
      { token: "nume_client", label: "Nume client" },
      { token: "nume_magazin", label: "Nume magazin" },
    ],
  },
  {
    kind: "new_order",
    label: "Comanda noua (catre tine)",
    description: "Notificarea pe care o primesti tu cand intra o comanda noua in magazin.",
    defaultSubject: "Comanda noua {{numar_comanda}} - {{nume_client}}",
    defaultHeading: "Comanda noua!",
    defaultIntro: "Ai primit o comanda noua la magazinul {{nume_magazin}}.",
    variables: [
      { token: "nume_magazin", label: "Nume magazin" },
      { token: "numar_comanda", label: "Numar comanda" },
      { token: "nume_client", label: "Nume client" },
      { token: "total", label: "Total comanda" },
    ],
  },
];
