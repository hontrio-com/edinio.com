"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { Loader2, Check } from "lucide-react";
import { BlockShell } from "../BlockShell";
import { submitPageForm } from "@/lib/actions/page.actions";
import { cuTransparenta } from "@/lib/pages/culori";
import { resolveHref } from "@/lib/pages/href";
import type { ContactBlock } from "@/lib/pages/blocks.types";
import type { FormField, PublicForm } from "@/lib/pages/forms.types";
import { campuriFormularSimplu } from "@/lib/pages/validare-formular";

/*
  ═══════════════════════════════════════════════════════════════════════════
  FORMULARUL DE PE PAGINA                                          (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: mai multe stiluri si optiuni. Stilul tine de LOC (blocul de pe
  pagina), nu de formular: acelasi formular poate arata altfel pe doua pagini.
  Optiunile campurilor (latime, tipurile noi) tin de formular.

  ⚠ Un bloc vechi, fara campurile noi, arata exact ca pana acum: `classic`,
  etichete deasupra, o coloana, buton pe toata latimea in culoarea magazinului.
*/

type Varianta = NonNullable<ContactBlock["variant"]>;

const CAMP: Record<Varianta, string> = {
  classic: "rounded-lg border border-gray-200 bg-white focus:border-gray-400",
  filled: "rounded-lg border border-transparent bg-gray-100 focus:bg-white focus:border-gray-300",
  underline: "rounded-none border-0 border-b-2 border-gray-200 bg-transparent px-0 focus:border-gray-500",
  rounded: "rounded-full border border-gray-200 bg-white px-5 focus:border-gray-400",
  minimal: "rounded-md border border-gray-100 bg-gray-50/60 focus:border-gray-300",
};
const MARIME: Record<string, string> = { sm: "py-2 text-sm", md: "py-2.5 text-sm", lg: "py-3.5 text-base" };
const RAZA_BUTON: Record<string, string> = { sm: "rounded-md", md: "rounded-lg", lg: "rounded-xl", full: "rounded-full" };

/*
  Campurile formularului simplu vin din `campuriFormularSimplu`, aceeasi functie
  cu care serverul verifica trimiterea: doua liste scrise separat s-ar fi
  despartit, iar serverul ar fi refuzat un camp pe care pagina il arata.
*/

function FieldInput({ field, value, error, onChange, variant, labels, size, accent, pref }: {
  field: FormField; value: string; error?: string; onChange: (v: string) => void;
  variant: Varianta; labels: "above" | "inside" | "hidden"; size: string; accent: string;
  /** Prefixul id-urilor, din id-ul BLOCULUI: doua formulare pe aceeasi pagina aveau aceleasi id-uri (`c-name`). */
  pref: string;
}) {
  const idCamp = `${pref}-${field.id}`;
  const req = field.required ? <span className="text-red-500"> *</span> : null;
  const inputCls = `w-full px-3.5 text-gray-800 placeholder:text-gray-400 outline-none transition-colors ${CAMP[variant]} ${MARIME[size] ?? MARIME.md}`;
  const eticheta = labels === "above"
    ? <label htmlFor={idCamp} className="mb-1 block text-sm font-medium text-gray-700">{field.label}{req}</label>
    : <label htmlFor={idCamp} className="sr-only">{field.label}</label>;
  /* Cu eticheta „in camp”, numele campului devine textul ajutator din camp. */
  const placeholder = labels === "above" ? field.placeholder : `${field.label}${field.required ? " *" : ""}`;
  // Nota campului (26.09.2026): sub orice fel de camp, cu legatura `aria-describedby`.
  const ajutor = field.helpText && <p id={`${idCamp}-nota`} className="mt-1 text-xs text-gray-500">{field.helpText}</p>;
  // Nota si greseala, amandoua citite de cititorul de ecran odata cu campul.
  const descris = [field.helpText ? `${idCamp}-nota` : "", error ? `${idCamp}-gres` : ""].filter(Boolean).join(" ") || undefined;
  const greseala = error && <p id={`${idCamp}-gres`} className="mt-1 text-xs text-red-500">{error}</p>;
  const aria = { "aria-describedby": descris, "aria-required": field.required || undefined, "aria-invalid": error ? true : undefined };
  const stilAccent = { accentColor: accent } as CSSProperties;

  if (field.type === "checkbox") {
    return (
      <div>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" checked={value === "da"} onChange={(e) => onChange(e.target.checked ? "da" : "")}
            className="mt-0.5 h-4 w-4 rounded" style={stilAccent} {...aria} />
          <span className="text-sm text-gray-700">{field.label}{req}</span>
        </label>
        {ajutor}{greseala}
      </div>
    );
  }
  if (field.type === "radio" || field.type === "checkboxes") {
    const alese = new Set(value ? value.split("\u0000") : []);
    return (
      <fieldset aria-describedby={descris} aria-invalid={error ? true : undefined}>
        <legend className={labels === "hidden" ? "sr-only" : "mb-1.5 block text-sm font-medium text-gray-700"}>{field.label}{req}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type={field.type === "radio" ? "radio" : "checkbox"}
                name={idCamp}
                checked={alese.has(o)}
                onChange={(e) => {
                  if (field.type === "radio") { onChange(o); return; }
                  const n = new Set(alese);
                  if (e.target.checked) n.add(o); else n.delete(o);
                  onChange([...n].join("\u0000"));
                }}
                className="h-4 w-4" style={stilAccent}
              />
              {o}
            </label>
          ))}
        </div>
        {ajutor}{greseala}
      </fieldset>
    );
  }
  if (field.type === "textarea") {
    return (
      <div>
        {eticheta}
        <textarea id={idCamp} {...aria} className={`${inputCls} resize-y ${variant === "rounded" ? "!rounded-2xl" : ""}`} rows={4} placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)} />
        {ajutor}{greseala}
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div>
        {eticheta}
        <select id={idCamp} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} {...aria}>
          <option value="">{labels === "above" ? "Alege..." : `${field.label}${field.required ? " *" : ""}`}</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {ajutor}{greseala}
      </div>
    );
  }
  const htmlType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number"
    : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text";
  // Completarea automata a browserului (mai ales pe telefon): numele se recunoaste si dupa eticheta, in formularele construite.
  const autocomplete = field.type === "email" ? "email" : field.type === "phone" ? "tel"
    : field.id === "name" || /^nume( (si|și) prenume| complet)?$/i.test(field.label.trim()) ? "name" : undefined;
  return (
    <div>
      {eticheta}
      <input id={idCamp} type={htmlType} className={inputCls} placeholder={placeholder} value={value} autoComplete={autocomplete} {...aria}
        onChange={(e) => onChange(e.target.value)} />
      {ajutor}{greseala}
    </div>
  );
}

export function ContactFormBlockView({ block, form, businessId, pageId, color, disabled, basePath = "" }: {
  block: ContactBlock; form?: PublicForm; businessId: string; pageId?: string; color: string; disabled?: boolean; basePath?: string;
}) {
  const fields = form ? form.fields : campuriFormularSimplu(block);
  /* Momentul afisarii: serverul refuza (tacut) o trimitere mai rapida decat poate un om. */
  const afisat = useRef<number | null>(null);
  useEffect(() => { afisat.current = Date.now(); }, []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [hp, setHp] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const successMessage = form?.success_message || block.successMessage || "Mulțumim! Mesajul a fost trimis.";
  const submitLabel = form?.submit_label || block.buttonLabel || "Trimite";
  const variant: Varianta = block.variant ?? "classic";
  const labels = block.labels ?? "above";
  const size = block.size ?? "md";
  const accent = block.accent || color;
  const culoareButon = block.buttonColor || color;
  const doua = !!block.twoColumns;

  function validate() {
    const e: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.id] ?? "").trim();
      if (f.required) {
        if (f.type === "checkbox" && v !== "da") e[f.id] = "Bifează pentru a continua";
        else if (f.type !== "checkbox" && !v) e[f.id] = f.type === "radio" || f.type === "checkboxes" ? "Alege o variantă" : "Câmp obligatoriu";
      }
      if (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) e[f.id] = "Adresa de email nu pare corectă";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    if (disabled) return;
    if (!validate()) return;
    // Cu id-ul campului: serverul reconstruieste raspunsul din definitie (`valideazaTrimitere`).
    const payload = fields.map((f) => ({
      id: f.id,
      label: f.label,
      value: f.type === "checkbox" ? (values[f.id] === "da" ? "Da" : "Nu") : (values[f.id] ?? "").trim(),
    }));
    const durata = afisat.current ? Date.now() - afisat.current : undefined;
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof submitPageForm>>;
      try {
        res = await submitPageForm({
          businessId, formId: form?.id ?? null, pageId, blockId: block.id, fields: payload, honeypot: hp, durata,
        });
      } catch {
        /* ⚠ SINGURUL MANER DIN ARC CARE VORBESTE CU UN CUMPARATOR, nu cu comerciantul. Aici nu
           exista nici `toast`, nici `router`: greseala se arata in pagina, sub buton, exact ca
           raspunsul de eroare al serverului de mai jos. `setDone(true)` a ramas DUPA `try`, deci
           nu i se spune ca a trimis cand nu stim asta. */
        setServerError(
          "Nu am primit răspuns de la server, așa că nu știm dacă mesajul a ajuns. "
          + "Încearcă din nou peste puțin timp; dacă ajunsese deja, se poate să fie primit de două ori.",
        );
        return;
      }
      if ("error" in res) { setServerError(res.error); return; }
      /* Dupa trimitere, alta pagina (ex. „Multumim”), daca asa a ales comerciantul. */
      if (block.afterSubmit === "redirect" && block.redirectHref) {
        const tinta = resolveHref(block.redirectHref, basePath);
        if (tinta !== "#") { window.location.assign(tinta); return; }
      }
      setDone(true);
    });
  }

  const aliniereButon = block.buttonFull === false
    ? block.buttonAlign === "left" ? "justify-start" : block.buttonAlign === "right" ? "justify-end" : "justify-center"
    : "";

  const continut = done ? (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: cuTransparenta(accent, 0.1), color: accent }}>
        <Check className="h-7 w-7" />
      </div>
      <p className="text-base font-semibold text-foreground">{successMessage}</p>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className={`mx-auto max-w-lg text-left ${doua ? "grid gap-x-4 gap-y-3.5 pg-sm:max-w-2xl pg-sm:grid-cols-2" : "space-y-3.5"}`} noValidate>
      {/* honeypot: ascuns pentru oamenii reali */}
      <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)}
        className="hidden" aria-hidden style={{ display: "none" }} />
      {fields.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Acest formular nu are niciun câmp încă.</p>
      ) : (
        fields.map((f) => (
          <div key={f.id} className={doua && f.width !== "half" ? "pg-sm:col-span-2" : ""}>
            <FieldInput field={f} value={values[f.id] ?? ""} error={errors[f.id]} pref={`c-${block.id}`}
              onChange={(v) => {
                setValues((s) => ({ ...s, [f.id]: v }));
                // Greseala dispare cand omul corecteaza campul, nu abia la urmatoarea trimitere.
                if (errors[f.id]) setErrors((s) => { const n = { ...s }; delete n[f.id]; return n; });
              }}
              variant={variant} labels={labels} size={size} accent={accent} />
          </div>
        ))
      )}
      {serverError && <p className={`text-center text-sm text-red-500 ${doua ? "pg-sm:col-span-2" : ""}`}>{serverError}</p>}
      <div className={`${doua ? "pg-sm:col-span-2" : ""} ${block.buttonFull === false ? `flex ${aliniereButon}` : ""}`}>
        <button type="submit" disabled={isPending || disabled || fields.length === 0}
          className={`flex items-center justify-center gap-2 px-8 font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 ${block.buttonFull === false ? "" : "w-full"} ${size === "lg" ? "py-4 text-base" : "py-3.5 text-sm"} ${RAZA_BUTON[block.buttonRadius ?? (variant === "rounded" ? "full" : "lg")]}`}
          style={{ backgroundColor: culoareButon, color: block.buttonTextColor || "#fff", boxShadow: `0 4px 16px ${cuTransparenta(culoareButon, 0.27)}` }}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {disabled ? "Previzualizare" : submitLabel}
        </button>
      </div>
    </form>
  );

  return (
    <BlockShell style={{ width: "narrow", ...block.style }}>
      <div className={block.card ? "rounded-3xl border border-border p-6 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)] pg-sm:p-10" : ""}
        style={block.card ? { backgroundColor: block.cardBg ?? "var(--color-surface)" } : undefined}>
        {block.title && (
          <h2 className={`pg-titlu text-center text-2xl font-black tracking-tight text-foreground pg-sm:text-3xl ${block.subtitle ? "mb-2" : "mb-6"}`}>{block.title}</h2>
        )}
        {block.subtitle && <p className="mb-6 text-center text-muted-foreground">{block.subtitle}</p>}
        {continut}
      </div>
    </BlockShell>
  );
}
