"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Eye, EyeOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { register as registerAction } from "@/lib/actions/auth.actions";
import { GoogleAuthButton } from "@/components/ui/GoogleAuthButton";
import { stergeCiorna } from "@/lib/onboarding/ciorna";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "Cel puțin 8 caractere", valid: password.length >= 8 },
    { label: "O literă mare", valid: /[A-Z]/.test(password) },
    { label: "O cifră", valid: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {checks.map((c) => (
        <div key={c.label} className="flex items-center gap-1.5 text-xs">
          {c.valid ? (
            <Check className="h-3 w-3 text-primary" />
          ) : (
            <X className="h-3 w-3 text-muted-foreground" />
          )}
          <span className={c.valid ? "text-foreground" : "text-muted-foreground"}>
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const preselectedPlan = searchParams.get("plan");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch("password") ?? "";

  async function onSubmit(data: RegisterInput) {
    setLoading(true);
    /* Un cont nou nu mosteneste inscrierea neterminata a altcuiva de pe acelasi calculator (nume, telefon). */
    stergeCiorna();
    if (preselectedPlan && ["basic", "premium", "ultra"].includes(preselectedPlan)) {
      sessionStorage.setItem("preselected_plan", preselectedPlan);
    }
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
          Creează-ți contul
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          15 zile gratuit, fără card. În câteva minute ai magazinul online.
        </p>
      </div>

      {/*
        ⚠ GOOGLE PRIMUL (27.09.2026): e drumul cu un singur clic, deci sta deasupra
        formularului, nu sub el, unde ajungea doar cine derula dupa ce il citise.
      */}
      <GoogleAuthButton label="Continuă cu Google" preselectedPlan={preselectedPlan} />
      <div className="relative my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">sau cu email</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label
            htmlFor="full_name"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Numele tău
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
              placeholder="Alege o parolă"
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
              aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
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

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white rounded-lg transition-all
            bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Se creează contul…" : "Creează contul"}
        </button>

        {/*
          ⚠ ACORDUL E O PROPOZITIE, NU O BIFA (27.09.2026). Bifa nu se pastra nicaieri:
          `register` nu primea `terms`, deci era un pas in plus fara nicio urma. Textul
          sta langa buton, unde se citeste inainte de apasare.
        */}
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Creând contul, ești de acord cu{" "}
          <Link href="/termeni" className="underline underline-offset-2 hover:text-foreground">Termenii și condițiile</Link>{" "}
          și cu{" "}
          <Link href="/confidentialitate" className="underline underline-offset-2 hover:text-foreground">Politica de confidențialitate</Link>.
        </p>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Ai deja cont?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Conectează-te
        </Link>
      </p>
    </>
  );
}
