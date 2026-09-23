"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LUNGIME_MINIMA } from "@/lib/cont/parola-reguli";

/**
 * Intrarea, contul nou si resetarea parolei, fara marcaj: pagina de intrare
 * (`FormularIntrare`) si pasul din formularul de comanda (`IntrareLaComanda`) le
 * deseneaza fiecare in felul lui, dar cererile si mesajele sunt aceleasi.
 *
 *   intrare:       email + parola  -> (pe un dispozitiv nou) codul de pe email
 *   inregistrare:  email + parola  -> codul de pe email -> contul exista
 *   uitata:        email           -> codul de pe email + parola noua
 *
 * ⚠ Mesajele de la server pentru contul nou si pentru resetare sunt ACELEASI si
 * cand adresa are cont, si cand nu are. Formularul nu incearca sa ghiceasca nimic.
 *
 * ⚠ „Retrimite codul" asteapta un minut; plafoanele adevarate stau in baza.
 */

export type ModAutentificare = "intrare" | "inregistrare" | "uitata";

const ASTEPTARE_RETRIMITERE = 60;

async function trimite(adresa: string, corp: unknown): Promise<{ ok: boolean; j: Record<string, unknown> }> {
  const r = await fetch(adresa, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corp),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, j };
}

function text(v: unknown, rezerva: string): string {
  return typeof v === "string" && v ? v : rezerva;
}

export function useAutentificare({
  modInitial = "intrare",
  dupaIntrare,
}: {
  modInitial?: ModAutentificare;
  /** Omul a intrat (sau contul lui nou exista). Primeste adresa folosita. */
  dupaIntrare: (email: string) => void;
}) {
  const [mod, setMod] = useState<ModAutentificare>(modInitial);
  const [pas, setPas] = useState<"date" | "cod">("date");
  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [parolaNoua, setParolaNoua] = useState("");
  const [cod, setCod] = useState("");
  const [tineMinte, setTineMinte] = useState(true);
  const [mesaj, setMesaj] = useState("");
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);
  const [ramas, setRamas] = useState(0);

  useEffect(() => {
    if (ramas <= 0) return;
    const t = setTimeout(() => setRamas((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [ramas]);

  function schimbaMod(m: ModAutentificare) {
    setMod(m);
    setPas("date");
    setCod("");
    setParola("");
    setParolaNoua("");
    setEroare("");
    setMesaj("");
  }

  function laPasulCodului(m: unknown) {
    setMesaj(text(m, ""));
    setCod("");
    setPas("cod");
    setRamas(ASTEPTARE_RETRIMITERE);
  }

  async function trimiteDatele(e: FormEvent) {
    e.preventDefault();
    if (asteapta) return;
    setEroare("");
    if (mod === "inregistrare" && [...parola].length < LUNGIME_MINIMA) {
      setEroare(`Parola trebuie sa aiba cel putin ${LUNGIME_MINIMA} caractere.`);
      return;
    }
    setAsteapta(true);
    try {
      if (mod === "intrare") {
        const { ok, j } = await trimite("/api/cont/intra", { email, parola });
        if (!ok) setEroare(text(j.eroare, "Nu am putut deschide contul."));
        else if (j.pas === "cod") laPasulCodului(j.mesaj);
        else dupaIntrare(email.trim());
      } else if (mod === "inregistrare") {
        const { ok, j } = await trimite("/api/cont/inregistrare", { email, parola });
        if (!ok) setEroare(text(j.eroare, "Nu am putut trimite codul."));
        else laPasulCodului(j.mesaj);
      } else {
        const { ok, j } = await trimite("/api/cont/parola", { actiune: "uitata", email });
        if (!ok) setEroare(text(j.eroare, "Nu am putut trimite codul."));
        else laPasulCodului(j.mesaj);
      }
    } catch {
      setEroare("Nu am putut trimite cererea. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

  async function trimiteCodul(e: FormEvent) {
    e.preventDefault();
    if (asteapta) return;
    setEroare("");
    if (mod === "uitata" && [...parolaNoua].length < LUNGIME_MINIMA) {
      setEroare(`Parola noua trebuie sa aiba cel putin ${LUNGIME_MINIMA} caractere.`);
      return;
    }
    setAsteapta(true);
    try {
      const { ok, j } = await trimite("/api/cont/pas", {
        actiune: "confirma",
        cod,
        tineMinte,
        ...(mod === "uitata" ? { parola: parolaNoua } : {}),
      });
      if (!ok) setEroare(text(j.eroare, "Nu am putut verifica codul."));
      else dupaIntrare(email.trim());
    } catch {
      setEroare("Nu am putut verifica codul. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

  async function retrimite() {
    if (asteapta || ramas > 0) return;
    setEroare("");
    setAsteapta(true);
    try {
      const { ok, j } = await trimite("/api/cont/pas", { actiune: "retrimite" });
      if (!ok) setEroare(text(j.eroare, "Nu am putut trimite alt cod."));
      else {
        setMesaj(text(j.mesaj, ""));
        setRamas(ASTEPTARE_RETRIMITERE);
      }
    } catch {
      setEroare("Nu am putut trimite alt cod. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

  return {
    mod,
    pas,
    email,
    setEmail,
    parola,
    setParola,
    parolaNoua,
    setParolaNoua,
    cod,
    /** Numai cifre: tastatura numerica de pe telefon mai strecoara spatii. */
    scrieCod: (v: string) => setCod(v.replace(/\D/g, "").slice(0, 6)),
    tineMinte,
    setTineMinte,
    mesaj,
    eroare,
    asteapta,
    ramas,
    schimbaMod,
    inapoi: () => {
      setPas("date");
      setCod("");
      setEroare("");
    },
    trimiteDatele,
    trimiteCodul,
    retrimite,
  };
}

export type Autentificare = ReturnType<typeof useAutentificare>;
