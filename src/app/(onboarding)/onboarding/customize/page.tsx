"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Upload, X, Check } from "lucide-react";
import { toast } from "sonner";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";

const COLOR_PRESETS = [
  { value: "#1AB554", label: "Verde Edinio" },
  { value: "#1E3A5F", label: "Albastru" },
  { value: "#8B1A1A", label: "Bordo" },
  { value: "#374151", label: "Slate" },
  { value: "#D97706", label: "Portocaliu" },
  { value: "#6D28D9", label: "Violet" },
  { value: "#E11D48", label: "Roz" },
  { value: "#0891B2", label: "Cyan" },
];

function ImageUpload({
  label, aspectRatio, preview, onFile, onRemove,
}: {
  label: string; aspectRatio: string; preview: string | null;
  onFile: (f: File) => void; onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-border" style={{ aspectRatio }}>
          <img src={preview} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={onRemove}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-border flex items-center justify-center hover:bg-white transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          style={{ aspectRatio, minHeight: "120px" }}
          onClick={() => ref.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center px-4">
            <span className="text-primary font-medium">Incarca</span> sau trage aici
          </p>
          <p className="text-xs text-muted-foreground">JPG, PNG, WebP - max 2MB</p>
          <input ref={ref} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </div>
      )}
    </div>
  );
}

export default function OnboardingCustomizePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#1AB554");
  const [customHex, setCustomHex] = useState("#1AB554");

  useEffect(() => {
    const stored = sessionStorage.getItem("onboarding_details");
    if (!stored) { router.replace("/onboarding/details"); return; }
    try { setDetails(JSON.parse(stored)); } catch { router.replace("/onboarding/details"); }
  }, [router]);

  async function uploadImage(file: File, bucket: string): Promise<string | null> {
    const { uploadImage: upload } = await import("@/lib/upload");
    const result = await upload(file, bucket);
    if ("error" in result) return null;
    return result.url;
  }

  async function handleContinue() {
    if (!details) return;
    setLoading(true);

    try {
      let logoUrl: string | undefined;
      let coverUrl: string | undefined;

      if (logoFile) logoUrl = (await uploadImage(logoFile, "logos")) ?? undefined;
      if (coverFile) coverUrl = (await uploadImage(coverFile, "covers")) ?? undefined;

      sessionStorage.setItem("onboarding_customize", JSON.stringify({
        logo_url: logoUrl,
        cover_url: coverUrl,
        primary_color: primaryColor,
      }));
      router.push("/onboarding/plan");
    } catch {
      toast.error("A aparut o eroare la incarcarea imaginilor.");
      setLoading(false);
    }
  }

  const businessName = String(details?.business_name ?? "");

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      <OnboardingProgress currentStep={2} />

      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">Personalizeaza magazinul</h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">Adauga logo, imagine de fundal si culorile tale</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-5">
              <ImageUpload label="Logo (optional)" aspectRatio="1/1" preview={logoPreview}
                onFile={(f) => { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); }}
                onRemove={() => { setLogoFile(null); setLogoPreview(null); }} />
              <ImageUpload label="Imagine de fundal (optional)" aspectRatio="16/7" preview={coverPreview}
                onFile={(f) => { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }}
                onRemove={() => { setCoverFile(null); setCoverPreview(null); }} />
            </div>

            <div className="bg-surface border border-border rounded-xl p-4 sm:p-6">
              <label className="block text-sm font-medium text-foreground mb-3">Culoarea principala</label>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {COLOR_PRESETS.map((p) => (
                  <button key={p.value} type="button" onClick={() => { setPrimaryColor(p.value); setCustomHex(p.value); }}
                    title={p.label}
                    className="w-8 h-8 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: p.value,
                      borderColor: primaryColor === p.value ? "white" : p.value,
                      boxShadow: primaryColor === p.value ? `0 0 0 2px ${p.value}` : "none",
                      transform: primaryColor === p.value ? "scale(1.15)" : "scale(1)",
                    }} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={customHex}
                  onChange={(e) => { setCustomHex(e.target.value); setPrimaryColor(e.target.value); }}
                  className="w-9 h-9 rounded-lg border border-border cursor-pointer" />
                <input type="text" value={customHex}
                  onChange={(e) => { setCustomHex(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setPrimaryColor(e.target.value); }}
                  className="w-28 px-2.5 py-1.5 text-sm border border-border rounded-lg bg-surface font-mono focus:outline-none focus:border-primary"
                  maxLength={7} placeholder="#1AB554" />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground">Previzualizare</p>
            <div className="rounded-xl overflow-hidden border border-border shadow-sm">
              <div className="relative px-5 py-8 text-white"
                style={{
                  background: coverPreview
                    ? `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)),url(${coverPreview}) center/cover`
                    : primaryColor,
                }}>
                <div className="flex items-center gap-3 mb-4">
                  {logoPreview
                    ? <img src={logoPreview} alt="" className="w-12 h-12 rounded-xl object-cover bg-white/20" />
                    : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg bg-white/20">
                        {businessName?.[0]?.toUpperCase() ?? "M"}
                      </div>
                  }
                  <div>
                    <div className="font-semibold text-base">{businessName || "Numele magazinului"}</div>
                    <div className="text-xs text-white/70">Mini-Store</div>
                  </div>
                </div>
                <div className="inline-block px-4 py-2 rounded-lg text-sm font-medium bg-white/25">
                  Vezi produsele
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Check className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Totul este optional</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Poti modifica logo-ul, imaginea si culorile oricand din panoul de control.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 pt-6 border-t border-border">
          <button type="button" onClick={() => router.push("/onboarding/details")} disabled={loading}
            className="py-3 sm:py-2.5 px-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors text-center sm:text-left disabled:opacity-40">
            Inapoi
          </button>
          <button type="button" onClick={handleContinue} disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 sm:py-3 text-sm font-medium text-white rounded-lg
              bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Se incarca..." : "Continua"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
