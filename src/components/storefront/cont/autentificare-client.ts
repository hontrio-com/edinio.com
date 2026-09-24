"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
 * ⚠⚠ UN RASPUNS VENIT DUPA O SCHIMBARE SE ARUNCA. Fiecare cerere poarta
 * „generatia" formularului; schimbarea filei, „Inapoi" sau „Ai uitat parola?"
 * o ridica. Fara asta, raspunsul unei intrari (un cod de pas doi) ateriza peste
 * ecranul de resetare: omul vedea „Parola noua", intra, si credea ca a schimbat
 * parola. Iar pasul codului arata adresa CU CARE s-a cerut codul, nu ce s-a
 * scris intre timp in camp.
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
  /** Adresa pe care a plecat codul: pasul al doilea o arata si o foloseste pe ea. */
  const [emailPas, setEmailPas] = useState("");
  const [parola, setParola] = useState("");
  const [parolaNoua, setParolaNoua] = useState("");
  const [cod, setCod] = useState("");
  /* ⚠ Nebifat: pe un calculator al altcuiva, o bifa uitata ar fi lasat contul fara pasul doi. */
  const [tineMinte, setTineMinte] = useState(false);
  const [mesaj, setMesaj] = useState("");
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);
  const [ramas, setRamas] = useState(0);
  const generatie = useRef(0);

  useEffect(() => {
    if (ramas <= 0) return;
    const t = setTimeout(() => setRamas((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [ramas]);

  function schimbaMod(m: ModAutentificare) {
    generatie.current++;
    setMod(m);
    setPas("date");
    setCod("");
    setParola("");
    setParolaNoua("");
    setEroare("");
    setMesaj("");
    setAsteapta(false);
  }

  function inapoi() {
    generatie.current++;
    setPas("date");
    setCod("");
    setAsteapta(false);
  }

  function laPasulCodului(m: unknown, adresa: string) {
    setEmailPas(adresa);
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
    const gen = generatie.current;
    const adresa = email.trim();
    let reusit = false;
    setAsteapta(true);
    try {
      if (mod === "intrare") {
        const { ok, j } = await trimite("/api/cont/intra", { email: adresa, parola });
        if (gen !== generatie.current) return;
        if (ok && j.ok === true) {
          reusit = true;
          dupaIntrare(adresa);
        } else if (ok && j.pas === "cod") laPasulCodului(j.mesaj, adresa);
        else setEroare(text(j.eroare, "Nu am putut sa te autentificam."));
      } else {
        const { ok, j } = mod === "inregistrare"
          ? await trimite("/api/cont/inregistrare", { email: adresa, parola })
          : await trimite("/api/cont/parola", { actiune: "uitata", email: adresa });
        if (gen !== generatie.current) return;
        if (ok && j.pas === "cod") laPasulCodului(j.mesaj, adresa);
        else setEroare(text(j.eroare, "Nu am putut trimite codul."));
      }
    } catch {
      if (gen === generatie.current) setEroare("Nu am putut trimite cererea. Verifica legatura la internet.");
    } finally {
      /* ⚠ Dupa reusita butonul ramane oprit: pagina pleaca, iar o a doua apasare ar
         fi trimis inca o cerere fara provocare. */
      if (gen === generatie.current && !reusit) setAsteapta(false);
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
    const gen = generatie.current;
    let reusit = false;
    setAsteapta(true);
    try {
      const { ok, j } = await trimite("/api/cont/pas", {
        actiune: "confirma",
        cod,
        tineMinte,
        ...(mod === "uitata" ? { parola: parolaNoua } : {}),
      });
      if (gen !== generatie.current) return;
      if (ok && j.ok === true) {
        reusit = true;
        dupaIntrare(emailPas);
      } else if (j.expirat === true) {
        inapoi();
        setEroare(text(j.eroare, "Timpul pentru confirmare a expirat. Incepe din nou."));
      } else setEroare(text(j.eroare, "Nu am putut verifica codul."));
    } catch {
      if (gen === generatie.current) setEroare("Nu am putut verifica codul. Verifica legatura la internet.");
    } finally {
      if (gen === generatie.current && !reusit) setAsteapta(false);
    }
  }

  async function retrimite() {
    if (asteapta || ramas > 0) return;
    setEroare("");
    const gen = generatie.current;
    setAsteapta(true);
    try {
      const { ok, j } = await trimite("/api/cont/pas", { actiune: "retrimite" });
      if (gen !== generatie.current) return;
      if (ok) {
        setMesaj(text(j.mesaj, ""));
        setRamas(ASTEPTARE_RETRIMITERE);
      } else if (j.expirat === true) {
        inapoi();
        setEroare(text(j.eroare, "Timpul pentru confirmare a expirat. Incepe din nou."));
      } else setEroare(text(j.eroare, "Nu am putut trimite alt cod."));
    } catch {
      if (gen === generatie.current) setEroare("Nu am putut trimite alt cod. Verifica legatura la internet.");
    } finally {
      if (gen === generatie.current) setAsteapta(false);
    }
  }

  return {
    mod,
    pas,
    email,
    setEmail,
    emailPas,
    parola,
    setParola,
    parolaNoua,
    setParolaNoua,
    cod,
    /** Numai cifre, taiat la sase: un cod lipit ca „123 456" ramane intreg. */
    scrieCod: (v: string) => setCod(v.replace(/\D/g, "").slice(0, 6)),
    tineMinte,
    setTineMinte,
    mesaj,
    eroare,
    asteapta,
    ramas,
    schimbaMod,
    inapoi: () => {
      inapoi();
      setEroare("");
    },
    trimiteDatele,
    trimiteCodul,
    retrimite,
  };
}

export type Autentificare = ReturnType<typeof useAutentificare>;
