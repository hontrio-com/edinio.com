"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Eye, EyeOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { register as registerAction } from "@/lib/actions/auth.actions";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "Minim 8 caractere", valid: password.length >= 8 },
    { label: "O litera mare", valid: /[A-Z]/.test(password) },
    { label: "Un numar", valid: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      {checks.map((c) => (
        <div key={c.label} className="flex items-center gap-1.5 text-xs">
          {c.valid ? (
            <Check className="h-3 w-3 text-green-600" />
          ) : (
            <X className="h-3 w-3 text-muted-foreground" />
          )}
          <span className={c.valid ? "text-green-700" : "text-muted-foreground"}>
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { terms: false },
  });

  const password = watch("password") ?? "";

  async function onSubmit(data: RegisterInput) {
    setLoading(true);
    try {
      const result = await registerAction({
        full_name: data.full_name,
        email: data.email,
        password: data.password,
      });
      if (result?.error) {
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
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Creeaza cont gratuit
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Incepe sa construiesti prezenta ta online
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label
            htmlFor="full_name"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Numele tau complet
          </label>
          <input
            id="full_name"
            type="text"
            autoComplete="name"
            placeholder="Ion Popescu"
            {...register("full_name")}
            className="w-full px-3 py-3 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors
              border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
              aria-[invalid=true]:border-destructive"
            aria-invalid={!!errors.full_name}
          />
          {errors.full_name && (
            <p className="mt-1 text-xs text-destructive">{errors.full_name.message}</p>
          )}
        </div>

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
            className="w-full px-3 py-3 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors
              border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
              aria-[invalid=true]:border-destructive"
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Parola
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Alege o parola sigura"
              {...register("password")}
              className="w-full px-3 py-2.5 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground pr-10 transition-colors
                border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                aria-[invalid=true]:border-destructive"
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ascunde parola" : "Arata parola"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <PasswordStrength password={password} />
          {errors.password && (
            <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Confirma parola
          </label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            placeholder="Repeta parola"
            {...register("confirm_password")}
            className="w-full px-3 py-3 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors
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

        <div className="flex items-start gap-2.5 pt-1">
          <input
            id="terms"
            type="checkbox"
            {...register("terms")}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
          />
          <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug cursor-pointer">
            Sunt de acord cu{" "}
            <Link href="/termeni" className="text-primary hover:underline">
              Termenii si conditiile
            </Link>{" "}
            si{" "}
            <Link href="/confidentialitate" className="text-primary hover:underline">
              Politica de confidentialitate
            </Link>
          </label>
        </div>
        {errors.terms && (
          <p className="text-xs text-destructive">{errors.terms.message}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white rounded-lg transition-all
            bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Se creeaza contul..." : "Creeaza cont gratuit"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Ai deja cont?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Conecteaza-te
        </Link>
      </p>
    </>
  );
}
