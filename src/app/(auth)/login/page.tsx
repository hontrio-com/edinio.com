"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { login } from "@/lib/actions/auth.actions";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setLoading(true);
    try {
      const result = await login(data);
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
          Bine ai revenit
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecteaza-te la contul tau Edinio
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
            className="w-full px-3 py-3 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors
              border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
              aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20"
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Parola
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline"
            >
              Ai uitat parola?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Parola ta"
              {...register("password")}
              className="w-full px-3 py-3 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground pr-10 transition-colors
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
          {errors.password && (
            <p className="mt-1 text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white rounded-lg transition-all
            bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Se conecteaza..." : "Conecteaza-te"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Nu ai cont?{" "}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Creeaza cont gratuit
        </Link>
      </p>
    </>
  );
}
