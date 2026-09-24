"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { BUTON_PRIMAR, BUTON_SECUNDAR, CAMP, ETICHETA_CAMP, FOCUS, STIL_PRIMAR } from "./ui/clase";
import { Mesaj } from "./ui/piese";
import { LUNGIME_MINIMA } from "@/lib/cont/parola-reguli";

/**
 * Parola contului, din cont.
 *
 * ⚠ Parola veche se cere cand exista: o sesiune lasata deschisa pe un calculator
 * strain nu are voie sa schimbe singura parola si sa-l incuie pe om afara.
 * ⚠ Dupa schimbare, celelalte dispozitive ies din cont; omul ramane inauntru aici.
 */
export function SchimbaParola({ areParola }: { areParola: boolean }) {
  const router = useRouter();
  const [deschis, setDeschis] = useState(false);
  const [veche, setVeche] = useState("");
  const [noua, setNoua] = useState("");
  const [vizibile, setVizibile] = useState(false);
  const [eroare, setEroare] = useState("");
  const [gata, setGata] = useState(false);
  const [asteapta, setAsteapta] = useState(false);

  async function trimite(e: React.FormEvent) {
    e.preventDefault();
    if (asteapta) return;
    setEroare("");
    if ([...noua].length < LUNGIME_MINIMA) {
      setEroare(`Parola noua trebuie sa aiba cel putin ${LUNGIME_MINIMA} caractere.`);
      return;
    }
    setAsteapta(true);
    try {
      const r = await fetch("/api/cont/parola", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actiune: "schimba", parolaVeche: veche, parolaNoua: noua }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEroare(j.eroare ?? "Nu am putut schimba parola.");
        return;
      }
      /* Parola s-a schimbat, dar sesiunea n-a putut fi redeschisa: la intrare, cu parola noua. */
      if (j.reintra === true) {
        window.location.href = "/cont/intra?parola=1";
        return;
      }
      setGata(true);
      setDeschis(false);
      setVeche("");
      setNoua("");
      router.refresh();
    } catch {
      setEroare("Nu am putut schimba parola. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

  if (!deschis) {
    return (
      <div className="space-y-3">
        {gata && <Mesaj fel="succes">Parola a fost schimbata. Ai fost deconectat de pe celelalte dispozitive.</Mesaj>}
        {!areParola && !gata && (
          <p className="text-sm leading-relaxed text-[var(--st-muted)]">
            Contul tau nu are inca o parola. Seteaz-o ca sa poti intra cu emailul si parola.
          </p>
        )}
        <button type="button" onClick={() => setDeschis(true)} className={BUTON_SECUNDAR}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {areParola || gata ? "Schimba parola" : "Seteaza o parola"}
        </button>
      </div>
    );
  }

  const tip = vizibile ? "text" : "password";
  return (
    <form onSubmit={trimite} className="max-w-md space-y-4">
      {(areParola || gata) && (
        <div>
          <label htmlFor="parola-veche" className={ETICHETA_CAMP}>Parola actuala</label>
          <input id="parola-veche" autoFocus type={tip} autoComplete="current-password" value={veche}
            onChange={(e) => setVeche(e.target.value)} className={CAMP} required />
        </div>
      )}
      <div>
        <label htmlFor="parola-noua-cont" className={ETICHETA_CAMP}>Parola noua</label>
        <input id="parola-noua-cont" type={tip} autoComplete="new-password" value={noua}
          onChange={(e) => setNoua(e.target.value)} className={CAMP} required />
        <p className="mt-1.5 text-xs text-[var(--st-muted)]">Cel putin {LUNGIME_MINIMA} caractere.</p>
      </div>
      <button type="button" onClick={() => setVizibile((v) => !v)} aria-pressed={vizibile}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-sm text-sm text-[var(--st-muted)] hover:text-[var(--st-text)] ${FOCUS}`}>
        {vizibile ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        {vizibile ? "Ascunde parolele" : "Arata parolele"}
      </button>
      {eroare && <Mesaj fel="eroare">{eroare}</Mesaj>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={asteapta} className={BUTON_PRIMAR} style={STIL_PRIMAR}>
          {asteapta ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {asteapta ? "Se salveaza..." : "Salveaza parola"}
        </button>
        <button type="button" onClick={() => { setDeschis(false); setEroare(""); }} className={BUTON_SECUNDAR}>
          Renunta
        </button>
      </div>
    </form>
  );
}
