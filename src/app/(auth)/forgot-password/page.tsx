"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/validations/auth";
import { forgotPassword } from "@/lib/actions/auth.actions";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(data: ForgotPasswordInput) {
    setLoading(true);
    const result = await forgotPassword(data.email);
    if (result.error) {
      toast.error(result.error);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="text-center py-4">
        <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Email trimis
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Daca exista un cont cu aceasta adresa, vei primi un email cu instructiunile de resetare a parolei.
        </p>
        <Link
          href="/login"
          className="text-sm text-primary font-medium hover:underline"
        >
          Inapoi la autentificare
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Resetare parola
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Introdu adresa de email si iti vom trimite un link de resetare
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Adresa de email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="exemplu@email.ro"
            {...register("email")}
            className="w-full px-3 py-2.5 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors
              border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
              aria-[invalid=true]:border-destructive"
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all
            bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Se trimite..." : "Trimite link de resetare"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary font-medium hover:underline">
          Inapoi la autentificare
        </Link>
      </p>
    </>
  );
}
