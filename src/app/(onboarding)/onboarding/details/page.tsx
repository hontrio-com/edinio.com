"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Check, X, Loader2, Store } from "lucide-react";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { slugify } from "@/lib/utils/slugify";
import { checkSlugAvailability } from "@/lib/actions/business.actions";
import { trackOnboardingStep } from "@/lib/actions/auth.actions";
import { platformFbq } from "@/components/platform/PlatformMetaPixel";

const schema = z.object({
  business_name: z.string().min(2, "Minim 2 caractere").max(100),
  phone: z.string().regex(/^07[0-9]{8}$/, "Format invalid: 07XXXXXXXX"),
  slug: z
    .string()
    .min(3, "Minim 3 caractere")
    .max(50, "Maxim 50 caractere")
    .regex(/^[a-z0-9-]+$/, "Doar litere mici, cifre si liniute"),
});

type FormData = z.infer<typeof schema>;

const inputCls = (invalid: boolean) =>
  `w-full px-4 py-3.5 text-sm border rounded-xl bg-surface text-foreground placeholder:text-muted-foreground transition-colors
  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
  ${invalid ? "border-destructive ring-destructive/20" : "border-border"}`;

export default function OnboardingDetailsPage() {
  const router = useRouter();
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const slugTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const businessName = watch("business_name") ?? "";
  const slug = watch("slug") ?? "";

  // Track step + fire pixel + transfer plan from cookie (Google OAuth flow)
  useEffect(() => {
    trackOnboardingStep("details");
    if (sessionStorage.getItem("platform_registered") === "1") {
      sessionStorage.removeItem("platform_registered");
      platformFbq("CompleteRegistration");
    }
    // Google OAuth: plan comes via cookie since sessionStorage doesn't survive redirect
    const cookieMatch = document.cookie.match(/preselected_plan=(\w+)/);
    if (cookieMatch && ["basic", "premium", "ultra"].includes(cookieMatch[1])) {
      sessionStorage.setItem("preselected_plan", cookieMatch[1]);
      document.cookie = "preselected_plan=; path=/; max-age=0";
    }
  }, []);

  // Auto-generate slug from business name
  useEffect(() => {
    if (businessName) {
      setValue("slug", slugify(businessName).slice(0, 50), { shouldValidate: false });
    }
  }, [businessName, setValue]);

  // Debounced slug check
  const checkSlug = useCallback((value: string) => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    if (!value || value.length < 3 || !/^[a-z0-9-]+$/.test(value)) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    slugTimerRef.current = setTimeout(async () => {
      const available = await checkSlugAvailability(value);
      setSlugStatus(available ? "available" : "taken");
    }, 600);
  }, []);

  useEffect(() => { checkSlug(slug); }, [slug, checkSlug]);

  function onSubmit(data: FormData) {
    if (slugStatus === "taken") return;

    sessionStorage.setItem("onboarding_details", JSON.stringify({
      business_name: data.business_name,
      phone: data.phone,
      slug: data.slug,
    }));

    platformFbq("Lead");
    router.push("/onboarding/plan");
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 sm:py-10">
      <OnboardingProgress currentStep={1} />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Store className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Creeaza-ti magazinul
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Doar 2 informatii si magazinul tau e online
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-5">
            {/* Numele magazinului */}
            <div>
              <label htmlFor="business_name" className="block text-sm font-semibold text-foreground mb-1.5">
                Numele magazinului
              </label>
              <input
                id="business_name"
                type="text"
                placeholder="ex: Floraria Mirei"
                {...register("business_name")}
                className={inputCls(!!errors.business_name)}
                autoFocus
              />
              {errors.business_name && <p className="mt-1 text-xs text-destructive">{errors.business_name.message}</p>}
            </div>

            {/* Telefon */}
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-foreground mb-1.5">
                Numarul de telefon
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="0712 345 678"
                {...register("phone", { setValueAs: (v: string) => v.replace(/[\s\-().+]/g, "") })}
                className={inputCls(!!errors.phone)}
              />
              {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Clientii te vor contacta la acest numar</p>
            </div>
          </div>

          {/* Adresa magazin online */}
          <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6">
            <label htmlFor="slug" className="block text-sm font-semibold text-foreground mb-1.5">
              Adresa magazinului online
            </label>
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
                  edinio.com/<span className="text-foreground font-semibold">{slug}</span>
                </span>
              </div>
            )}
            {errors.slug && <p className="mt-1 text-xs text-destructive">{errors.slug.message}</p>}
            {slugStatus === "taken" && !errors.slug && (
              <p className="mt-1 text-xs text-destructive">Aceasta adresa este deja folosita.</p>
            )}
            {slugStatus === "available" && (
              <p className="mt-1 text-xs text-green-700">Adresa este disponibila!</p>
            )}
          </div>

          <button
            type="submit"
            disabled={slugStatus === "taken" || slugStatus === "checking"}
            className="w-full py-3.5 text-sm font-semibold text-white rounded-xl transition-all
              bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continua
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Poti adauga logo, descriere si toate detaliile din dashboard dupa creare
          </p>
        </form>
      </motion.div>
    </div>
  );
}
