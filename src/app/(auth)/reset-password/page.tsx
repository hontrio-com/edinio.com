"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/validations/auth";
import { resetPassword } from "@/lib/actions/auth.actions";

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit(data: ResetPasswordInput) {
    setLoading(true);
    const result = await resetPassword(data.password);
    if (result.error) {
      toast.error(result.error);
    } else {
      setDone(true);
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Parola a fost resetata
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Parola ta a fost actualizata cu succes. Te poti conecta acum.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white rounded-lg bg-primary hover:bg-primary/90 transition-all"
        >
          Mergi la autentificare
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Parola noua
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alege o parola noua sigura pentru contul tau
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Parola noua
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
            className="w-full px-3 py-2.5 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors
              border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
              aria-[invalid=true]:border-destructive"
            aria-invalid={!!errors.password}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Confirma parola noua
          </label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            {...register("confirm_password")}
            className="w-full px-3 py-2.5 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors
              border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
              aria-[invalid=true]:border-destructive"
            aria-invalid={!!errors.confirm_password}
          />
          {errors.confirm_password && (
            <p className="mt-1 text-xs text-destructive">
              {errors.confirm_password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all
            bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Se salveaza..." : "Seteaza parola noua"}
        </button>
      </form>
    </>
  );
}
