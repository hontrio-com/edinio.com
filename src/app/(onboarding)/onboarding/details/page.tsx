"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Check, X, Loader2, Globe } from "lucide-react";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { businessSchema, type BusinessInput, ROMANIAN_COUNTIES } from "@/lib/validations/business";
import { slugify } from "@/lib/utils/slugify";
import { checkSlugAvailability } from "@/lib/actions/business.actions";
import { trackOnboardingStep } from "@/lib/actions/auth.actions";
import { platformFbq } from "@/components/platform/PlatformMetaPixel";

const DRAFT_KEY = "onboarding_draft_v2";

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

function Checkbox({ checked, onChange, label, size = "md" }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const icon = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none group">
      <div className="relative flex-shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className={`${dim} rounded border-2 flex items-center justify-center transition-colors ${checked ? "bg-primary border-primary" : "border-border bg-surface group-hover:border-primary/50"}`}>
          {checked && <Check className={`${icon} text-white`} strokeWidth={3} />}
        </div>
      </div>
      <span className={`text-foreground ${size === "sm" ? "text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors" : "text-sm"}`}>{label}</span>
    </label>
  );
}

export default function OnboardingDetailsPage() {
  const router = useRouter();
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const slugTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [whatsappSame, setWhatsappSame] = useState(false);

  const {
    register, handleSubmit, watch, setValue, reset, setError, clearErrors,
    formState: { errors },
  } = useForm<BusinessInput>({
    resolver: zodResolver(businessSchema),
  });

  const businessName = watch("business_name") ?? "";
  const slug = watch("slug") ?? "";

  // Track onboarding step + fire CompleteRegistration event
  useEffect(() => {
    trackOnboardingStep("details");
    if (sessionStorage.getItem("platform_registered") === "1") {
      sessionStorage.removeItem("platform_registered");
      platformFbq("CompleteRegistration");
    }
  }, []);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      reset({
        business_name: draft.business_name ?? "",
        tagline: draft.tagline ?? "",
        phone: draft.phone ?? "",
        email: draft.email ?? "",
        address: draft.address ?? "",
        city: draft.city ?? "",
        county: draft.county ?? "",
        slug: draft.slug ?? "",
      });
      if (draft.online_only) setOnlineOnly(true);
      if (draft.whatsapp_same) setWhatsappSame(true);
    } catch {}
  }, [reset]);

  // Autosave to localStorage on every form change
  useEffect(() => {
    const { unsubscribe } = watch((values) => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          ...values,
          online_only: onlineOnly,
          whatsapp_same: whatsappSame,
        }));
      } catch {}
    });
    return unsubscribe;
  }, [watch, onlineOnly, whatsappSame]);

  // Save when checkboxes change
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        ...watch(),
        online_only: onlineOnly,
        whatsapp_same: whatsappSame,
      }));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineOnly, whatsappSame]);

  // Auto-generate slug from business name
  useEffect(() => {
    if (businessName) {
      setValue("slug", slugify(businessName).slice(0, 50), { shouldValidate: false });
    }
  }, [businessName, setValue]);

  // Debounced slug availability check
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

  function onSubmit(data: BusinessInput) {
    if (slugStatus === "taken") return;

    // Conditional address validation (Zod allows empty; we validate manually when not online-only)
    if (!onlineOnly) {
      let hasError = false;
      if (!data.address || data.address.trim().length < 5) {
        setError("address", { message: "Minim 5 caractere" });
        hasError = true;
      }
      if (!data.city || data.city.trim().length < 2) {
        setError("city", { message: "Minim 2 caractere" });
        hasError = true;
      }
      if (!data.county) {
        setError("county", { message: "Selecteaza judetul" });
        hasError = true;
      }
      if (hasError) return;
    }

    const storeData = {
      ...data,
      whatsapp: whatsappSame ? data.phone : undefined,
      address: onlineOnly ? undefined : data.address,
      city: onlineOnly ? undefined : data.city,
      county: onlineOnly ? undefined : data.county,
      online_only: onlineOnly,
    };

    sessionStorage.setItem("onboarding_details", JSON.stringify(storeData));
    platformFbq("Lead");
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
              <input id="business_name" type="text" placeholder="ex: Floraria Mirei"
                {...register("business_name")} className={inputCls(!!errors.business_name)} />
            </Field>

            <Field label="Slogan (optional)" htmlFor="tagline" error={errors.tagline?.message}>
              <input id="tagline" type="text" placeholder="ex: Flori proaspete, livrare rapida"
                {...register("tagline")} className={inputCls(!!errors.tagline)} maxLength={120} />
            </Field>
          </div>

          {/* Contact */}
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Telefon" htmlFor="phone" error={errors.phone?.message}>
                <input id="phone" type="tel" placeholder="0712 345 678"
                  {...register("phone", {
                    setValueAs: (v: string) => v.replace(/[\s\-().+]/g, ""),
                  })}
                  className={inputCls(!!errors.phone)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Email (optional)" htmlFor="email" error={errors.email?.message}>
                  <input id="email" type="email" placeholder="contact@magazinul-tau.ro"
                    {...register("email")} className={inputCls(!!errors.email)} />
                </Field>
              </div>
            </div>

            <Checkbox
              checked={whatsappSame}
              onChange={setWhatsappSame}
              label="Disponibil si pe WhatsApp (acelasi numar de telefon)"
            />
          </div>

          {/* Locatie */}
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Locatie</h2>
              <Checkbox
                checked={onlineOnly}
                onChange={(v) => {
                  setOnlineOnly(v);
                  if (v) {
                    clearErrors(["address", "city", "county"]);
                    setValue("address", "");
                    setValue("city", "");
                    setValue("county", "");
                  }
                }}
                label="Activitate exclusiv online"
                size="sm"
              />
            </div>

            {onlineOnly ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
                <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Adresa fizica nu este necesara. Clientii iti vor putea comanda online.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field label="Strada si numarul" htmlFor="address" error={errors.address?.message}>
                    <input id="address" type="text" placeholder="ex: Calea Victoriei 42"
                      {...register("address")} className={inputCls(!!errors.address)} />
                  </Field>
                </div>
                <Field label="Oras sau comuna" htmlFor="city" error={errors.city?.message}>
                  <input id="city" type="text" placeholder="ex: Bucuresti"
                    {...register("city")} className={inputCls(!!errors.city)} />
                </Field>
                <Field label="Judet" htmlFor="county" error={errors.county?.message}>
                  <select id="county" {...register("county")} className={inputCls(!!errors.county) + " cursor-pointer"}>
                    <option value="">Selecteaza</option>
                    {ROMANIAN_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>

          {/* Adresa magazin online */}
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Adresa magazinului online
            </h2>
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
