"use client";

import { useId, useState, useTransition } from "react";
import { Check, Loader2, Mail } from "lucide-react";
import { BlockShell } from "../BlockShell";
import { aboneazaNewsletter } from "@/lib/actions/page.actions";
import { cuTransparenta } from "@/lib/pages/culori";
import type { NewsletterBlock } from "@/lib/pages/blocks.types";

const camp = "w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-400";

/**
 * Abonarea la newsletter. Adresa pleaca la furnizorii conectati (vezi
 * `aboneazaNewsletter`); bifa de acord e obligatorie si pe server.
 */
export function NewsletterBlockView({ block, color, businessId, pageId, disabled }: {
  block: NewsletterBlock; color: string; businessId: string; pageId?: string; disabled?: boolean;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [nume, setNume] = useState("");
  const [telefon, setTelefon] = useState("");
  const [acord, setAcord] = useState(false);
  const [hp, setHp] = useState("");
  const [eroare, setEroare] = useState<string | null>(null);
  const [gata, setGata] = useState(false);
  const [trimite, start] = useTransition();
  const culoare = block.buttonColor || color;
  const layout = block.layout ?? "card";

  function abonare(e: React.FormEvent) {
    e.preventDefault();
    setEroare(null);
    if (disabled || !pageId) return;
    if (!acord) { setEroare("Bifează acordul ca să te poți abona."); return; }
    start(async () => {
      let r: Awaited<ReturnType<typeof aboneazaNewsletter>>;
      try {
        r = await aboneazaNewsletter({ businessId, pageId, blockId: block.id, email, nume, telefon, acord, honeypot: hp });
      } catch {
        setEroare("Nu am primit răspuns. Încearcă din nou peste puțin timp.");
        return;
      }
      if ("error" in r) { setEroare(r.error); return; }
      setGata(true);
    });
  }

  const text = (
    <div className={layout === "inline" ? "pg-md:max-w-md" : ""}>
      {block.title && <h2 className="pg-titlu text-2xl pg-sm:text-3xl font-black tracking-tight text-foreground">{block.title}</h2>}
      {block.subtitle && <p className="mt-2 text-muted-foreground">{block.subtitle}</p>}
    </div>
  );

  const formular = gata ? (
    <div className="flex items-center gap-3 rounded-xl p-4" style={{ backgroundColor: cuTransparenta(culoare, 0.08) }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: culoare }}><Check className="h-5 w-5" /></span>
      <p className="font-semibold text-foreground">{block.successMessage || "Mulțumim! Te-ai abonat."}</p>
    </div>
  ) : (
    <form onSubmit={abonare} className="w-full space-y-3 text-left" noValidate>
      <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} className="hidden" aria-hidden />
      {(block.askName || block.askPhone) && (
        <div className={`grid gap-3 ${block.askName && block.askPhone ? "pg-sm:grid-cols-2" : ""}`}>
          {block.askName && <input value={nume} onChange={(e) => setNume(e.target.value)} placeholder="Numele tău" autoComplete="name" aria-label="Numele tău" className={camp} />}
          {block.askPhone && <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefon" type="tel" autoComplete="tel" aria-label="Telefon" className={camp} />}
        </div>
      )}
      <div className="flex flex-col gap-2 pg-sm:flex-row">
        <label htmlFor={`${id}-e`} className="sr-only">Adresa de email</label>
        <input id={`${id}-e`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="adresa@email.ro" autoComplete="email" className={`${camp} flex-1`} />
        <button type="submit" disabled={trimite || disabled}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{ backgroundColor: culoare }}>
          {trimite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {disabled ? "Previzualizare" : block.buttonLabel || "Mă abonez"}
        </button>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={acord} onChange={(e) => setAcord(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded" style={{ accentColor: culoare }} />
        <span>{block.consentText || "Sunt de acord să primesc emailuri cu noutăți și oferte."} Te poți dezabona oricând.</span>
      </label>
      {eroare && <p className="text-sm text-red-600" role="alert">{eroare}</p>}
    </form>
  );

  if (layout === "split") {
    return (
      <BlockShell style={{ width: "container", ...block.style }}>
        <div className="grid items-center overflow-hidden rounded-3xl border border-border bg-surface pg-md:grid-cols-2">
          {block.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={block.image} alt="" loading="lazy" className="h-56 w-full object-cover pg-md:h-full" />
            : <div className="hidden h-full min-h-[240px] pg-md:block" style={{ background: `linear-gradient(135deg, ${culoare}, ${cuTransparenta(culoare, 0.4)})` }} />}
          <div className="space-y-5 p-6 pg-sm:p-10">{text}{formular}</div>
        </div>
      </BlockShell>
    );
  }
  if (layout === "inline") {
    return (
      <BlockShell style={{ width: "container", ...block.style }}>
        <div className="flex flex-col gap-6 pg-md:flex-row pg-md:items-center pg-md:justify-between">{text}<div className="pg-md:w-[28rem]">{formular}</div></div>
      </BlockShell>
    );
  }
  return (
    <BlockShell style={{ width: "narrow", ...block.style }}>
      <div className={`space-y-5 text-center ${layout === "card" ? "rounded-3xl border border-border bg-surface p-6 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)] pg-sm:p-10" : ""}`}>
        {text}
        {formular}
      </div>
    </BlockShell>
  );
}
