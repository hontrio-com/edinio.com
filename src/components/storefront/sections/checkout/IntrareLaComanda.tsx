"use client";

import { useId, type CSSProperties } from "react";
import { ArrowRight, CheckCircle2, CircleUserRound, Loader2, Mail } from "lucide-react";
import { useIntrareCuCod } from "@/components/storefront/cont/intrare-cu-cod";
import type { ContulLaComanda } from "@/components/storefront/cont/contul-la-comanda";

/**
 * Pasul de intrare in cont din formularul de comanda, cand magazinul cere cont.
 *
 * ⚠⚠ SE DESENEAZA IN AFARA `<form>`-ULUI COMENZII, nu in el. Are formularele lui
 * (adresa, apoi codul), iar un `<form>` pus in alt `<form>` nu e HTML valid:
 * browserul il arunca, si Enter in campul de cod ar fi trimis COMANDA.
 *
 * ⚠ Nu navigheaza nicaieri. Intrarea scrie cookie-ul si atat: cosul, campurile
 * completate si cuponul raman pe loc, iar adresa verificata intra in campul de
 * email cand acela e gol (`useContulLaComanda`).
 *
 * ⚠ Culorile sunt ale formularului de comanda, ca blocul sa para din acelasi card.
 * Butonul ia totusi perechea vitrinei (`--st-primary` cu `--st-primary-contrast`,
 * aleasa pe contrast), nu albul pe culoarea magazinului: la 55 din 71 de magazine
 * albul pe primara cade sub 4,5:1.
 */

const CAMP =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none sm:text-sm";

function stilButon(color: string): CSSProperties {
  return { backgroundColor: `var(--st-primary, ${color})`, color: "var(--st-primary-contrast, #fff)" };
}

const BUTON =
  "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2";

const LEGATURA = "font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground disabled:opacity-50";

export function IntrareLaComanda({ cont, color }: { cont: ContulLaComanda; color: string }) {
  const uid = useId();
  const f = useIntrareCuCod(cont.aIntrat);

  if (cont.logat) {
    return (
      <div className="px-5 pt-4">
        <p role="status" className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 size={15} className="shrink-0 text-foreground" aria-hidden="true" />
          {cont.email ? (
            <span className="min-w-0">
              Comanzi din contul <span className="break-all font-semibold text-foreground">{cont.email}</span>
            </span>
          ) : (
            <span>Esti in cont. Comanda intra in contul tau.</span>
          )}
        </p>
      </div>
    );
  }

  if (!cont.necesar) return null;

  return (
    <div className="px-5 pt-4">
      <section id={cont.idBloc} aria-labelledby={`${uid}-titlu`} className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
            <CircleUserRound size={18} className="text-foreground" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id={`${uid}-titlu`} className="text-sm font-bold text-foreground">Intra in cont ca sa comanzi</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Magazinul primeste comenzi din cont. Iti trimitem un cod pe email, fara parola. Cosul si datele completate raman aici.
            </p>
          </div>
        </div>

        {f.pas === "contact" ? (
          <form onSubmit={f.cereCodul} className="mt-4 space-y-3">
            <div>
              <label htmlFor={`${uid}-email`} className="mb-1 block text-sm font-semibold text-foreground">Adresa de email</label>
              <input
                id={`${uid}-email`}
                name="email"
                type="email"
                autoComplete="email"
                value={f.email}
                onChange={(ev) => f.setEmail(ev.target.value)}
                className={CAMP}
                placeholder="adresa@email.ro"
                required
              />
            </div>
            {f.eroare && <p role="alert" className="text-xs text-red-500">{f.eroare}</p>}
            <button type="submit" disabled={f.asteapta} className={BUTON} style={stilButon(color)}>
              {f.asteapta ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {f.asteapta ? "Se trimite..." : "Trimite-mi un cod"}
              {!f.asteapta && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>
        ) : (
          <form onSubmit={f.trimiteCodul} className="mt-4 space-y-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Mail size={14} className="mt-0.5 shrink-0 text-foreground" aria-hidden="true" />
              <span className="min-w-0">
                {f.mesaj || "Daca adresa e cunoscuta de magazin, codul a plecat."}{" "}
                <span className="break-all font-semibold text-foreground">{f.email}</span>
              </span>
            </p>
            <div>
              <label htmlFor={`${uid}-cod`} className="mb-1 block text-sm font-semibold text-foreground">Codul de sase cifre din email</label>
              <input
                id={`${uid}-cod`}
                name="cod"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={f.cod}
                onChange={(ev) => f.scrieCod(ev.target.value)}
                className={`${CAMP} text-center text-lg tracking-[0.45em] sm:text-lg`}
                placeholder="000000"
                required
              />
            </div>
            {f.eroare && <p role="alert" className="text-xs text-red-500">{f.eroare}</p>}
            <button type="submit" disabled={f.asteapta || f.cod.length !== 6} className={BUTON} style={stilButon(color)}>
              {f.asteapta ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {f.asteapta ? "Se verifica..." : "Intra in cont"}
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <button type="button" onClick={f.schimbaAdresa} className={LEGATURA}>Schimba adresa</button>
              {f.ramas > 0 ? (
                <span className="text-muted-foreground" aria-live="polite">Poti cere alt cod in {f.ramas} s</span>
              ) : (
                <button type="button" onClick={f.retrimite} disabled={f.asteapta} className={LEGATURA}>Retrimite codul</button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
