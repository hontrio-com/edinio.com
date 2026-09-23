"use client";

import { useEffect, useState, type FormEvent } from "react";

/**
 * Intrarea cu cod pe email, fara marcaj: pagina de intrare (`FormularIntrare`) si
 * pasul de intrare din formularul de comanda (`IntrareLaComanda`) o deseneaza
 * fiecare in felul lui, dar cererile si mesajele sunt aceleasi, dintr-un loc.
 *
 * ⚠ Raspunsul serverului la pasul unu e ACELASI si cand adresa e cunoscuta, si
 * cand nu e. Nu se incearca sa se ghiceasca nimic si nu se arata alt text: ar fi
 * transformat ecranul intr-un oracol prin care oricine afla ce adrese cunoaste
 * magazinul.
 *
 * ⚠ „Retrimite codul" asteapta un minut, iar plafoanele adevarate stau in baza
 * (cinci coduri in 15 minute pe destinatie, si pe IP). Numaratoarea de aici doar
 * nu-l lasa pe om sa loveasca plafonul din nerabdare.
 */

const ASTEPTARE_RETRIMITERE = 60;

export function useIntrareCuCod(dupaIntrare: (email: string) => void) {
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

  async function cereCodul(e: FormEvent) {
    e.preventDefault();
    if (asteapta) return;
    if (await cere()) setPas("cod");
  }

  async function trimiteCodul(e: FormEvent) {
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
        dupaIntrare(email.trim());
      }
    } catch {
      setEroare("Nu am putut deschide contul. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

  function schimbaAdresa() {
    setPas("contact");
    setCod("");
    setEroare("");
  }

  return {
    pas,
    email,
    setEmail,
    cod,
    /** Numai cifre: tastatura numerica de pe telefon mai strecoara spatii. */
    scrieCod: (v: string) => setCod(v.replace(/\D/g, "").slice(0, 6)),
    mesaj,
    eroare,
    asteapta,
    ramas,
    cereCodul,
    trimiteCodul,
    retrimite: () => void cere(),
    schimbaAdresa,
  };
}
