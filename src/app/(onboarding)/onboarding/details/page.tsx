"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Check, X, Loader2 } from "lucide-react";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { businessSchema, type BusinessInput, ROMANIAN_COUNTIES } from "@/lib/validations/business";
import { slugify } from "@/lib/utils/slugify";
import { checkSlugAvailability } from "@/lib/actions/business.actions";

const inputCls = (invalid: boolean) =>
  `w-full px-3 py-3 text-sm border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground transition-colors
  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
  ${invalid ? "border-destructive ring-destructive/20" : "border-border"}`;

function Field({
  label, htmlFor, error, helper, children,
}: {
  label: string; htmlFor: string; error?: string; helper?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {helper && !error && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

export default function OnboardingDetailsPage() {
  const router = useRouter();
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [slugTimer, setSlugTimer] = useState<NodeJS.Timeout | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<BusinessInput>({
    resolver: zodResolver(businessSchema),
  });

  const businessName = watch("business_name") ?? "";
  const slug = watch("slug") ?? "";

  // Auto-generate slug from business name
  useEffect(() => {
    if (businessName) {
      setValue("slug", slugify(businessName).slice(0, 50), { shouldValidate: false });
    }
  }, [businessName, setValue]);

  // Debounced slug check
  const checkSlug = useCallback((value: string) => {
    if (slugTimer) clearTimeout(slugTimer);
    if (!value || value.length < 3 || !/^[a-z0-9-]+$/.test(value)) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const t = setTimeout(async () => {
      const available = await checkSlugAvailability(value);
      setSlugStatus(available ? "available" : "taken");
    }, 600);
    setSlugTimer(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { checkSlug(slug); }, [slug, checkSlug]);

  function onSubmit(data: BusinessInput) {
    if (slugStatus === "taken") return;
    sessionStorage.setItem("onboarding_details", JSON.stringify(data));
    router.push("/onboarding/customize");
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
      <OnboardingProgress currentStep={1} />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
            Informatii despre magazinul tau
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            Completeaza datele de baza - le poti modifica oricand
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Identitate */}
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identitate</h2>

            <Field label="Numele magazinului" htmlFor="business_name" error={errors.business_name?.message}>
              <input id="business_name" type="text" placeholder="ex: Floraria Mirei" {...register("business_name")} className={inputCls(!!errors.business_name)} />
            </Field>

            <Field label="Slogan (optional)" htmlFor="tagline" error={errors.tagline?.message}>
              <input id="tagline" type="text" placeholder="ex: Flori proaspete, livrare rapida" {...register("tagline")} className={inputCls(!!errors.tagline)} maxLength={120} />
            </Field>
          </div>

          {/* Contact */}
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Telefon" htmlFor="phone" error={errors.phone?.message}>
                <input id="phone" type="tel" placeholder="0712 345 678" {...register("phone")} className={inputCls(!!errors.phone)} />
              </Field>
              <Field label="WhatsApp (optional)" htmlFor="whatsapp" error={errors.whatsapp?.message} helper="Lasati gol daca e acelasi cu telefonul">
                <input id="whatsapp" type="tel" placeholder="0712 345 678" {...register("whatsapp")} className={inputCls(!!errors.whatsapp)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Email (optional)" htmlFor="email" error={errors.email?.message}>
                  <input id="email" type="email" placeholder="contact@magazinul-tau.ro" {...register("email")} className={inputCls(!!errors.email)} />
                </Field>
              </div>
            </div>
          </div>

          {/* Locatie */}
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Locatie</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Strada si numarul" htmlFor="address" error={errors.address?.message}>
                  <input id="address" type="text" placeholder="ex: Calea Victoriei 42" {...register("address")} className={inputCls(!!errors.address)} />
                </Field>
              </div>
              <Field label="Oras sau comuna" htmlFor="city" error={errors.city?.message}>
                <input id="city" type="text" placeholder="ex: Bucuresti" {...register("city")} className={inputCls(!!errors.city)} />
              </Field>
              <Field label="Judet" htmlFor="county" error={errors.county?.message}>
                <select id="county" {...register("county")} className={inputCls(!!errors.county) + " cursor-pointer"}>
                  <option value="">Selecteaza</option>
                  {ROMANIAN_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Adresa magazin */}
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Adresa magazinului online</h2>
            <div className="relative">
              <input
                id="slug"
                type="text"
                {...register("slug")}
                onChange={(e) => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                  setValue("slug", val, { shouldValidate: true });
                }}
                className={inputCls(!!errors.slug || slugStatus === "taken") + " pr-9"}
                placeholder="magazinul-tau"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {slugStatus === "available" && <Check className="h-4 w-4 text-green-600" />}
                {slugStatus === "taken" && <X className="h-4 w-4 text-destructive" />}
              </div>
            </div>
            {slug && (
              <div className="mt-2 px-3 py-2 bg-muted rounded-lg">
                <span className="text-xs font-mono text-muted-foreground">
                  edinio.ro/<span className="text-foreground font-semibold">{slug}</span>
                </span>
              </div>
            )}
            {errors.slug && <p className="mt-1 text-xs text-destructive">{errors.slug.message}</p>}
            {slugStatus === "taken" && !errors.slug && (
              <p className="mt-1 text-xs text-destructive">Aceasta adresa este deja folosita.</p>
            )}
            {slugStatus === "available" && (
              <p className="mt-1 text-xs text-green-700">Adresa este disponibila.</p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={slugStatus === "taken" || slugStatus === "checking"}
              className="w-full sm:w-auto px-8 py-3.5 sm:py-3 text-sm font-medium text-white rounded-lg transition-all
                bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continua
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
