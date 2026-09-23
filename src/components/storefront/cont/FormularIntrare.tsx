"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import { BUTON_PRIMAR, CAMP, ETICHETA_CAMP, LEGATURA, STIL_PRIMAR } from "./ui/clase";

/**
 * Intrarea in contul de cumparator: doi pasi, fara parola.
 *
 * ⚠ H6: ecranele noi se scriu FARA diacritice, ca restul vitrinei
 * („Finalizeaza comanda"), nu ca panoul.
 *
 * ⚠ Raspunsul serverului la pasul unu e ACELASI si cand adresa e cunoscuta, si
 * cand nu e. Formularul nu incearca sa ghiceasca nimic si nu arata alt text: ar
 * fi transformat ecranul intr-un oracol prin care oricine afla ce adrese cunoaste
 * magazinul.
 *
 * ⚠ „Retrimite codul" asteapta un minut, iar plafoanele adevarate stau in baza
 * (cinci coduri in 15 minute pe destinatie, si pe IP). Numaratoarea de aici doar
 * nu-l lasa pe om sa loveasca plafonul din nerabdare.
 */

const ASTEPTARE_RETRIMITERE = 60;

export function FormularIntrare() {
  const router = useRouter();
  const [pas, setPas] = useState<"contact" | "cod">("contact");
  const [email, setEmail] = useState("");
  const [cod, setCod] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);
  const [ramas, setRamas] = useState(0);

  useEffect(() => {
    if (ramas <= 0) return;
    const t = setTimeout(() => setRamas((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [ramas]);

  async function cere(): Promise<boolean> {
    setAsteapta(true);
    setEroare("");
    try {
      const r = await fetch("/api/cont/cod", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fel: "email", destinatie: email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEroare(j.eroare ?? "Nu am putut trimite codul. Incearca din nou.");
        return false;
      }
      setMesaj(j.mesaj ?? "");
      setRamas(ASTEPTARE_RETRIMITERE);
      return true;
    } catch {
      setEroare("Nu am putut trimite codul. Verifica legatura la internet.");
      return false;
    } finally {
      setAsteapta(false);
    }
  }

  async function cereCodul(e: React.FormEvent) {
    e.preventDefault();
    if (asteapta) return;
    if (await cere()) setPas("cod");
  }

  async function trimiteCodul(e: React.FormEvent) {
    e.preventDefault();
    if (asteapta) return;
    setAsteapta(true);
    setEroare("");
    try {
      const r = await fetch("/api/cont/intra", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fel: "email", destinatie: email, cod }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEroare(j.eroare ?? "Nu am putut deschide contul.");
      } else {
        /*
          ⚠ `refresh()` INAINTE de `push()`, si ordinea conteaza.
          Cookie-ul tocmai a fost scris de ruta, dar Router Cache-ul clientului
          tine payloadul RSC 30 de secunde (`next.config.ts`, `staleTimes.dynamic`).
          Fara `refresh()`, omul ar fi ajuns pe o pagina randata ca si cum n-ar fi
          logat, si ar fi fost trimis inapoi la intrare.
        */
        router.refresh();
        router.push("/cont");
      }
    } catch {
      setEroare("Nu am putut deschide contul. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

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
            onChange={(ev) => setCod(ev.target.value.replace(/\D/g, ""))}
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
            onClick={() => { setPas("contact"); setCod(""); setEroare(""); }}
            className={LEGATURA}
          >
            Schimba adresa
          </button>
          {ramas > 0 ? (
            <span className="text-[var(--st-muted)]" aria-live="polite">Poti cere alt cod in {ramas} s</span>
          ) : (
            <button type="button" onClick={() => void cere()} disabled={asteapta} className={LEGATURA}>
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
