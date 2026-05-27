"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { verifyMfaLogin } from "@/lib/actions/auth.actions";

export default function MfaPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

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

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Codul este valabil 10 minute. Daca nu ai primit emailul, verifica folderul Spam.
      </p>
    </>
  );
}
