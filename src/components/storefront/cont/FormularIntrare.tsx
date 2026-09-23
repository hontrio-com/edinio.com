"use client";

import { useState } from "react";

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
 */
export function FormularIntrare({ color }: { color: string }) {
  const [pas, setPas] = useState<"contact" | "cod">("contact");
  const [email, setEmail] = useState("");
  const [cod, setCod] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);

  async function cereCodul(e: React.FormEvent) {
    e.preventDefault();
    if (asteapta) return;
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
      } else {
        setMesaj(j.mesaj ?? "");
        setPas("cod");
      }
    } catch {
      setEroare("Nu am putut trimite codul. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
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
        /* ⚠ Navigare de DOCUMENT, nu `router.push`: cookie-ul tocmai a fost scris
           de ruta, iar Router Cache-ul clientului tine payloadul RSC 30 de
           secunde (`next.config.ts`, `staleTimes.dynamic`). Cu o navigare de
           client, omul ar fi ajuns pe o pagina randata ca si cum n-ar fi logat. */
        window.location.assign("/cont");
      }
    } catch {
      setEroare("Nu am putut deschide contul. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

  if (pas === "cod") {
    return (
      <form onSubmit={trimiteCodul} className="space-y-4">
        {mesaj && <p className="text-sm text-muted-foreground leading-relaxed">{mesaj}</p>}
        <div>
          <label htmlFor="cod" className="block text-sm font-medium text-foreground mb-1.5">
            Codul din email
          </label>
          <input
            id="cod"
            name="cod"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={cod}
            onChange={(ev) => setCod(ev.target.value.replace(/\D/g, ""))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-lg tracking-[0.4em] text-center text-foreground outline-none focus:ring-2"
            placeholder="000000"
            required
          />
        </div>
        {eroare && <p className="text-sm text-red-600">{eroare}</p>}
        <button
          type="submit"
          disabled={asteapta || cod.length !== 6}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: color }}
        >
          {asteapta ? "Se verifica..." : "Intra in cont"}
        </button>
        <button
          type="button"
          onClick={() => { setPas("contact"); setCod(""); setEroare(""); }}
          className="w-full text-sm text-muted-foreground underline"
        >
          Schimba adresa de email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={cereCodul} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
          Adresa de email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2"
          placeholder="adresa@exemplu.ro"
          required
        />
      </div>
      {eroare && <p className="text-sm text-red-600">{eroare}</p>}
      <button
        type="submit"
        disabled={asteapta}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: color }}
      >
        {asteapta ? "Se trimite..." : "Trimite-mi un cod"}
      </button>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Nu ai nevoie de parola. Iti trimitem un cod de sase cifre pe email, valabil zece minute.
      </p>
    </form>
  );
}
