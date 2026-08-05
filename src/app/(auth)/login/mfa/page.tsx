"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { verifyMfaLogin, sendMfaOtp, logout } from "@/lib/actions/auth.actions";

/*
 * DE CE AU APARUT „Trimite alt cod" SI „Iesi din cont" (05.08.2026)
 *
 * De cand poarta MFA intreaba „sesiunea ASTA e confirmata?" si nu „exista un cod
 * in curs?", pagina se poate deschide si fara ca vreun cod sa fi fost trimis
 * chiar atunci: sesiune confirmata pe alt dispozitiv si invalidata de o
 * autentificare noua, intoarcere din resetarea de parola, cod expirat de mult.
 * Fara un buton de retrimitere, omul ar fi ramas pe un ecran care cere un cod pe
 * care nu-l are, fara nicio iesire. Actiunile astea DOUA sunt printre putinele
 * care au voie sa ruleze cu sesiunea neconfirmata (vezi `caleAuth` din
 * src/lib/auth/poarta-mfa.ts) — tocmai ca sa nu existe fundatura.
 */
export default function MfaPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [retrimite, setRetrimite] = useState(false);

  async function onRetrimite() {
    setRetrimite(true);
    try {
      const rezultat = await sendMfaOtp();
      if (rezultat && "error" in rezultat) toast.error(rezultat.error);
      else toast.success("Ti-am trimis un cod nou pe email.");
    } catch {
      toast.error("Nu am putut trimite codul. Incearca din nou.");
    } finally {
      setRetrimite(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    try {
      const result = await verifyMfaLogin(code);
      if (result && "error" in result) {
        toast.error(result.error);
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Verificare in doi pasi
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ti-am trimis un cod de 6 cifre pe adresa ta de email. Introdu-l mai jos pentru a continua.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-foreground mb-1.5">
            Cod de verificare
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full px-3 py-3 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-center text-2xl font-mono tracking-[0.5em]"
          />
        </div>

        <button
          type="submit"
          disabled={loading || code.length < 6}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white rounded-lg transition-all bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Se verifica..." : "Verifica"}
        </button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onRetrimite}
          disabled={retrimite}
          className="text-xs font-medium text-primary hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {retrimite ? "Se trimite..." : "Trimite alt cod"}
        </button>
        <button
          type="button"
          // `logout()` se termina cu `redirect()`, care in Server Actions se
          // propaga ca o exceptie speciala tratata de router. O prindem ca sa nu
          // ramana o respingere de promisiune netratata in consola.
          onClick={async () => { try { await logout(); } catch { /* redirect */ } }}
          className="text-xs text-muted-foreground hover:underline"
        >
          Iesi din cont
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Codul este valabil 10 minute. Daca nu ai primit emailul, verifica folderul Spam.
      </p>
    </>
  );
}
