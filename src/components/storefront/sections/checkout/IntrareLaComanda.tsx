"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleUserRound, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { useAutentificare } from "@/components/storefront/cont/autentificare-client";
import type { ContulLaComanda } from "@/components/storefront/cont/contul-la-comanda";

/**
 * Pasul de intrare in cont din formularul de comanda, cand magazinul cere cont:
 * email si parola, contul nou, parola uitata, si codul de pe email ca al doilea
 * pas. Cererile sunt ale lui `useAutentificare`, aceleasi ca pe pagina de intrare.
 *
 * ⚠⚠ SE DESENEAZA IN AFARA `<form>`-ULUI COMENZII, nu in el. Are formularele lui,
 * iar un `<form>` pus in alt `<form>` nu e HTML valid: browserul il arunca, si
 * Enter in campul de cod ar fi trimis COMANDA.
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

function CampParola({ id, eticheta, valoare, schimba, autoComplete }: {
  id: string; eticheta: string; valoare: string; schimba: (v: string) => void; autoComplete: "current-password" | "new-password";
}) {
  const [vizibila, setVizibila] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-foreground">{eticheta}</label>
      <div className="relative">
        <input
          id={id}
          type={vizibila ? "text" : "password"}
          autoComplete={autoComplete}
          value={valoare}
          onChange={(ev) => schimba(ev.target.value)}
          className={`${CAMP} pr-10`}
          required
        />
        <button
          type="button"
          onClick={() => setVizibila((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={vizibila ? "Ascunde parola" : "Arata parola"}
          aria-pressed={vizibila}
        >
          {vizibila ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function IntrareLaComanda({ cont, color }: { cont: ContulLaComanda; color: string }) {
  const uid = useId();
  const a = useAutentificare({ dupaIntrare: cont.aIntrat });
  const campCod = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (a.pas === "cod") campCod.current?.focus();
  }, [a.pas]);

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

  const titlu = a.pas === "cod"
    ? "Verifica-ti emailul"
    : a.mod === "inregistrare" ? "Creeaza un cont ca sa comanzi" : a.mod === "uitata" ? "Ai uitat parola?" : "Intra in cont ca sa comanzi";

  return (
    <div className="px-5 pt-4">
      <section id={cont.idBloc} aria-labelledby={`${uid}-titlu`} className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
            <CircleUserRound size={18} className="text-foreground" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id={`${uid}-titlu`} className="text-sm font-bold text-foreground">{titlu}</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Magazinul primeste comenzi din cont. Cosul si datele completate raman aici.
            </p>
          </div>
        </div>

        {a.pas === "date" && a.mod !== "uitata" && (
          <div role="group" aria-label="Intra sau creeaza cont" className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
            {(["intrare", "inregistrare"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={a.mod === m}
                disabled={a.asteapta}
                onClick={() => a.schimbaMod(m)}
                className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                  a.mod === m ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "intrare" ? "Am cont" : "Cont nou"}
              </button>
            ))}
          </div>
        )}

        {a.pas === "date" ? (
          <form onSubmit={a.trimiteDatele} className="mt-4">
            <fieldset disabled={a.asteapta} className="m-0 min-w-0 space-y-3 border-0 p-0">
            <div>
              <label htmlFor={`${uid}-email`} className="mb-1 block text-sm font-semibold text-foreground">Adresa de email</label>
              <input
                id={`${uid}-email`}
                type="email"
                autoComplete="email"
                value={a.email}
                onChange={(ev) => a.setEmail(ev.target.value)}
                className={CAMP}
                placeholder="adresa@email.ro"
                required
              />
            </div>
            {a.mod !== "uitata" && (
              <CampParola
                id={`${uid}-parola`}
                eticheta={a.mod === "inregistrare" ? "Alege o parola (cel putin 8 caractere)" : "Parola"}
                valoare={a.parola}
                schimba={a.setParola}
                autoComplete={a.mod === "inregistrare" ? "new-password" : "current-password"}
              />
            )}
            {a.eroare && <p role="alert" className="text-xs text-red-500">{a.eroare}</p>}
            <button type="submit" disabled={a.asteapta} className={BUTON} style={stilButon(color)}>
              {a.asteapta ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {a.asteapta ? "Se trimite..." : a.mod === "intrare" ? "Intra in cont" : a.mod === "inregistrare" ? "Creeaza contul" : "Trimite-mi un cod"}
              {!a.asteapta && <ArrowRight size={16} aria-hidden="true" />}
            </button>
            <div className="text-center text-xs">
              {a.mod === "intrare" ? (
                <button type="button" onClick={() => a.schimbaMod("uitata")} className={LEGATURA}>Ai uitat parola?</button>
              ) : a.mod === "uitata" ? (
                <button type="button" onClick={() => a.schimbaMod("intrare")} className={`inline-flex items-center gap-1 ${LEGATURA}`}>
                  <ArrowLeft size={12} aria-hidden="true" /> Inapoi la intrare
                </button>
              ) : (
                <span className="text-muted-foreground">
                  Iti confirmam adresa cu un cod pe email. Creand contul, esti de acord cu{" "}
                  <Link href="/politici/termeni" target="_blank" className={LEGATURA}>termenii magazinului</Link> si ai citit{" "}
                  <Link href="/politici/confidentialitate" target="_blank" className={LEGATURA}>politica de confidentialitate</Link>.
                </span>
              )}
            </div>
            </fieldset>
          </form>
        ) : (
          <form onSubmit={a.trimiteCodul} className="mt-4">
            <fieldset disabled={a.asteapta} className="m-0 min-w-0 space-y-3 border-0 p-0">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Mail size={14} className="mt-0.5 shrink-0 text-foreground" aria-hidden="true" />
              <span className="min-w-0">
                {a.mesaj || "Daca adresa poate fi folosita, codul a plecat."}{" "}
                <span className="break-all font-semibold text-foreground">{a.emailPas}</span>
              </span>
            </p>
            <div>
              <label htmlFor={`${uid}-cod`} className="mb-1 block text-sm font-semibold text-foreground">Codul de sase cifre din email</label>
              <input
                ref={campCod}
                id={`${uid}-cod`}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={a.cod}
                onChange={(ev) => a.scrieCod(ev.target.value)}
                className={`${CAMP} text-center text-lg tracking-[0.45em] sm:text-lg`}
                placeholder="000000"
                required
              />
            </div>
            {a.mod === "uitata" && (
              <CampParola id={`${uid}-parola-noua`} eticheta="Parola noua (cel putin 8 caractere)" valoare={a.parolaNoua} schimba={a.setParolaNoua} autoComplete="new-password" />
            )}
            <label className="flex items-start gap-2 text-xs text-foreground">
              <input type="checkbox" checked={a.tineMinte} onChange={(ev) => a.setTineMinte(ev.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Tine minte acest dispozitiv 60 de zile
                <span className="block text-muted-foreground">Nu bifa pe un calculator folosit si de altii.</span>
              </span>
            </label>
            {a.eroare && <p role="alert" className="text-xs text-red-500">{a.eroare}</p>}
            <button type="submit" disabled={a.asteapta || a.cod.length !== 6} className={BUTON} style={stilButon(color)}>
              {a.asteapta ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {a.asteapta ? "Se verifica..." : a.mod === "uitata" ? "Schimba parola si intra" : a.mod === "inregistrare" ? "Confirma contul" : "Intra in cont"}
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <button type="button" onClick={a.inapoi} className={`inline-flex items-center gap-1 ${LEGATURA}`}>
                <ArrowLeft size={12} aria-hidden="true" /> Inapoi
              </button>
              {a.ramas > 0 ? (
                <span className="text-muted-foreground">Poti cere alt cod in {a.ramas} s</span>
              ) : (
                <button type="button" onClick={() => void a.retrimite()} disabled={a.asteapta} className={LEGATURA}>Retrimite codul</button>
              )}
            </div>
            </fieldset>
          </form>
        )}
      </section>
    </div>
  );
}
