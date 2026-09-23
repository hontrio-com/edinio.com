"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import { BUTON_PRIMAR, CAMP, ETICHETA_CAMP, LEGATURA, STIL_PRIMAR } from "./ui/clase";
import { useIntrareCuCod } from "./intrare-cu-cod";

/**
 * Intrarea in contul de cumparator: doi pasi, fara parola. Cererile si regulile
 * lor (acelasi raspuns pentru orice adresa, asteptarea la retrimitere) sunt in
 * `useIntrareCuCod`, impartite cu pasul de intrare din formularul de comanda.
 *
 * ⚠ H6: ecranele noi se scriu FARA diacritice, ca restul vitrinei
 * („Finalizeaza comanda”), nu ca panoul.
 */
export function FormularIntrare() {
  const router = useRouter();
  const {
    pas, email, setEmail, cod, scrieCod, mesaj, eroare, asteapta, ramas,
    cereCodul, trimiteCodul, retrimite, schimbaAdresa,
  } = useIntrareCuCod(() => {
    /*
      ⚠ `refresh()` INAINTE de `push()`, si ordinea conteaza.
      Cookie-ul tocmai a fost scris de ruta, dar Router Cache-ul clientului
      tine payloadul RSC 30 de secunde (`next.config.ts`, `staleTimes.dynamic`).
      Fara `refresh()`, omul ar fi ajuns pe o pagina randata ca si cum n-ar fi
      logat, si ar fi fost trimis inapoi la intrare.
    */
    router.refresh();
    router.push("/cont");
  });

  if (pas === "cod") {
    return (
      <form onSubmit={trimiteCodul} className="space-y-5">
        <div className="flex items-start gap-3 rounded-[var(--st-radius-sm)] bg-[var(--st-primary-soft)] px-4 py-3">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--st-text)]" aria-hidden="true" />
          <div className="min-w-0 text-sm leading-relaxed text-[var(--st-text)]">
            <p>{mesaj || "Daca adresa e cunoscuta de magazin, codul a plecat."}</p>
            <p className="mt-0.5 text-[var(--st-muted)]">
              Adresa: <span className="break-all font-semibold text-[var(--st-text)]">{email}</span>
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="cod" className={ETICHETA_CAMP}>Codul de sase cifre din email</label>
          <input
            id="cod"
            name="cod"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={cod}
            onChange={(ev) => scrieCod(ev.target.value)}
            className={`${CAMP} py-3 text-center text-xl tracking-[0.5em] sm:text-xl`}
            placeholder="000000"
            required
          />
        </div>
        {eroare && <p role="alert" className="text-sm text-[var(--st-text)]">{eroare}</p>}
        <button type="submit" disabled={asteapta || cod.length !== 6} className={`${BUTON_PRIMAR} w-full`} style={STIL_PRIMAR}>
          {asteapta ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {asteapta ? "Se verifica..." : "Intra in cont"}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={schimbaAdresa}
            className={LEGATURA}
          >
            Schimba adresa
          </button>
          {ramas > 0 ? (
            <span className="text-[var(--st-muted)]" aria-live="polite">Poti cere alt cod in {ramas} s</span>
          ) : (
            <button type="button" onClick={retrimite} disabled={asteapta} className={LEGATURA}>
              Retrimite codul
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={cereCodul} className="space-y-5">
      <div>
        <label htmlFor="email" className={ETICHETA_CAMP}>Adresa de email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          className={CAMP}
          placeholder="adresa@exemplu.ro"
          required
        />
        <p className="mt-2 text-xs leading-relaxed text-[var(--st-muted)]">
          Foloseste adresa cu care ai comandat: comenzile se leaga singure de ea.
        </p>
      </div>
      {eroare && <p role="alert" className="text-sm text-[var(--st-text)]">{eroare}</p>}
      <button type="submit" disabled={asteapta} className={`${BUTON_PRIMAR} w-full`} style={STIL_PRIMAR}>
        {asteapta ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {asteapta ? "Se trimite..." : "Trimite-mi un cod"}
        {!asteapta && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </button>
      <p className="text-center text-xs leading-relaxed text-[var(--st-muted)]">
        Fara parola. Iti trimitem un cod de sase cifre, valabil zece minute.
      </p>
    </form>
  );
}
