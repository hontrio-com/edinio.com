"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/**
 * Sectiunea de contact, varianta classic: telefon, email si adresa magazinului,
 * fiecare afisat doar daca e completat in setari.
 */
export function ContactClassic() {
  const { business, features, color } = useStoreChrome();
  const areDate = !!(business.phone || business.email || business.store_address);
  /*
   * `!== true`, nu `=== false`: sectiunea e OPRITA implicit si apare doar cand
   * comerciantul o cere. Datele de contact sunt oricum in footer, la fel si
   * identitatea firmei, care nici nu se poate ascunde.
   *
   * A doua poarta pe acelasi comutator: `SectionRenderer` verifica deja `enabled`
   * din design. Se tin la fel dinadins, ca sectiunea sa nu reapara pe vreo cale
   * care ar randa-o direct.
   */
  if (features.show_contact !== true || !areDate) return null;

  const iconBox = { backgroundColor: `${color}20`, color };

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4">Contact</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {business.phone && (
          <a href={`tel:${business.phone}`}
            className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:border-primary/30 hover:bg-primary/5 transition-all">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={iconBox}>
              <Phone className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Telefon</p>
              <p className="text-sm font-semibold text-foreground">{business.phone}</p>
            </div>
          </a>
        )}
        {business.email && (
          <a href={`mailto:${business.email}`}
            className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:border-primary/30 hover:bg-primary/5 transition-all">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={iconBox}>
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Email</p>
              <p className="text-sm font-semibold text-foreground truncate">{business.email}</p>
            </div>
          </a>
        )}
        {business.store_address && (
          <div className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={iconBox}>
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Adresa</p>
              <p className="text-sm font-semibold text-foreground">
                {business.store_address}{business.store_city ? `, ${business.store_city}` : ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
