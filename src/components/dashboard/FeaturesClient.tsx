"use client";

import { useState, useTransition } from "react";
import { Image, MapPin, MessageCircle, Mail, Smartphone, Star, Zap, Lock, ShoppingBag, Truck, CreditCard } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { updateBusiness } from "@/lib/actions/business.actions";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];

interface Features {
  show_gallery?: boolean;
  show_contact?: boolean;
  floating_whatsapp?: boolean;
  show_about?: boolean;
}

const ACTIVE_FEATURES: {
  key: keyof Features;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  requiresWhatsApp?: boolean;
}[] = [
  { key: "show_gallery", icon: Image, title: "Galerie foto", description: "Afiseaza o galerie de fotografii pe pagina magazinului." },
  { key: "show_about", icon: ShoppingBag, title: "Descriere magazin", description: "Afiseaza sectiunea de descriere si despre noi pe mini-store." },
  { key: "show_contact", icon: MapPin, title: "Informatii de contact", description: "Afiseaza telefon, email, adresa si locatia la baza paginii." },
  { key: "floating_whatsapp", icon: MessageCircle, title: "Buton WhatsApp flotant", description: "Buton fix in colt pentru contact rapid pe WhatsApp.", requiresWhatsApp: true },
];

const COMING_SOON = [
  { icon: Truck, title: "Tracking livrare", description: "Trimite clientilor link de tracking automat dupa expediere." },
  { icon: CreditCard, title: "Plata online (card)", description: "Accepta plati cu cardul direct pe site." },
  { icon: Mail, title: "Email confirmare comanda", description: "Clientul primeste email de confirmare dupa fiecare comanda." },
  { icon: Smartphone, title: "SMS notificari", description: "Primesti SMS instant la fiecare comanda noua." },
  { icon: Star, title: "Recenzii produse", description: "Clientii pot lasa recenzii verificate pentru produse." },
];

export function FeaturesClient({ business }: { business: Business }) {
  const [isPending, startTransition] = useTransition();
  const rawFeatures = (business.features as Features) ?? {};

  const [features, setFeatures] = useState<Features>({
    show_gallery: rawFeatures.show_gallery !== false,
    show_about: rawFeatures.show_about !== false,
    show_contact: rawFeatures.show_contact !== false,
    floating_whatsapp: rawFeatures.floating_whatsapp !== false,
  });

  function toggle(key: keyof Features) {
    const newVal = !features[key];
    setFeatures((prev) => ({ ...prev, [key]: newVal }));
    startTransition(async () => {
      const result = await updateBusiness(business.id, { features: { ...features, [key]: newVal } });
      if (result.error) { setFeatures((prev) => ({ ...prev, [key]: !newVal })); toast.error(result.error); }
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Integrari</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Activeaza sau dezactiveaza functiile disponibile pe mini-store-ul tau.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Integrari active</h2>
        <div className="space-y-3">
          {ACTIVE_FEATURES.map((feature) => {
            const Icon = feature.icon;
            const enabled = features[feature.key] !== false;
            const disabled = feature.requiresWhatsApp && !business.whatsapp;
            return (
              <div key={feature.key} className={cn(
                "flex items-start gap-4 p-5 rounded-xl border transition-all",
                enabled && !disabled ? "border-primary/30 bg-primary/5" : "border-border bg-surface",
                disabled && "opacity-60"
              )}>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                  enabled && !disabled ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{feature.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {disabled ? "Necesita numar de WhatsApp in editor." : feature.description}
                      </p>
                    </div>
                    <button type="button" onClick={() => toggle(feature.key)} disabled={isPending || disabled}
                      className={cn("relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex-shrink-0 disabled:cursor-not-allowed",
                        enabled && !disabled ? "bg-primary" : "bg-muted-foreground/30")}>
                      <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                        enabled && !disabled ? "translate-x-5" : "translate-x-0")} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Vanzari pe Google</h2>
        <Link href="/dashboard/features/google-merchant"
          className="flex items-start gap-4 p-5 rounded-xl border border-border bg-surface hover:border-primary/40 hover:bg-primary/5 transition-all">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Google Merchant Center</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Listeaza produsele pe Google Shopping si sincronizeaza stoc + pret automat.</p>
              </div>
              <span className="text-xs font-semibold text-primary shrink-0">Configureaza →</span>
            </div>
          </div>
        </Link>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" /> In curand
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COMING_SOON.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex items-start gap-3 p-4 rounded-xl border border-dashed border-border bg-surface opacity-65">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-semibold text-foreground">{f.title}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                      <Lock className="h-2.5 w-2.5" /> In curand
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
