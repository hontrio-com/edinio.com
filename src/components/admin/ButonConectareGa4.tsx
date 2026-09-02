"use client";

import { useState, useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
import { porneste, deconecteaza } from "@/lib/actions/admin-analytics.actions";

/**
 * Porneste legarea contului Google pentru rapoartele din admin.
 *
 * ⚠ `window.location.href`, nu `router.push`: adresa e a lui Google, deci o
 * navigare a browserului intreg, nu una a aplicatiei.
 */
export function ButonConectareGa4({ eticheta = "Conecteaza Google" }: { eticheta?: string }) {
  const [seLucreaza, incepe] = useTransition();
  const [eroare, setEroare] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={seLucreaza}
        onClick={() => incepe(async () => {
          setEroare(null);
          const r = await porneste();
          if ("error" in r) { setEroare(r.error); return; }
          window.location.href = r.url;
        })}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {seLucreaza ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        {eticheta}
      </button>
      {eroare && <p className="mt-2 text-sm text-destructive">{eroare}</p>}
    </div>
  );
}

/**
 * Rupe legatura cu Google.
 *
 * ⚠ SPUNE CE NU FACE. Apasarea sterge jetonul de la NOI; accesul dat aplicatiei
 * Edinio ramane in contul Google pana cand omul il retrage de acolo. Fara randul
 * asta, cineva ar crede ca a revocat si de partea lor.
 */
export function ButonDeconectareGa4({ email }: { email?: string }) {
  const [seLucreaza, incepe] = useTransition();
  const [intreaba, setIntreaba] = useState(false);

  if (!intreaba) {
    return (
      <button
        type="button"
        onClick={() => setIntreaba(true)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        Deconecteaza{email ? ` ${email}` : ""}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Sigur? Rapoartele dispar pana la o noua conectare.</span>
      <button
        type="button"
        disabled={seLucreaza}
        onClick={() => incepe(async () => { await deconecteaza(); })}
        className="font-semibold text-destructive hover:underline disabled:opacity-60"
      >
        {seLucreaza ? "Se rupe..." : "Da, deconecteaza"}
      </button>
      <button type="button" onClick={() => setIntreaba(false)} className="text-muted-foreground hover:underline">
        Nu
      </button>
    </span>
  );
}
