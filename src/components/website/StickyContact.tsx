"use client";

import { Phone } from "lucide-react";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { TELEFON, VERDE_WHATSAPP, WHATSAPP } from "@/lib/website/contact";

/**
 * Cele două butoane rotunde din colț.
 *
 * Numărul, adresa de WhatsApp și verdele veneau scrise aici de mână — a treia
 * copie a aceluiași număr, după subsol și pagina de contact. Acum vin din
 * `lib/website/contact.ts`, ca peste tot.
 */
export function StickyContact() {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5">
      <a
        href={TELEFON.href}
        className="group w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg shadow-foreground/15 hover:scale-110 transition-transform"
        aria-label="Suna acum"
      >
        <Phone className="h-5 w-5" />
      </a>
      <a
        href={WHATSAPP.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group w-12 h-12 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        style={{ backgroundColor: VERDE_WHATSAPP, boxShadow: `0 10px 15px -3px ${VERDE_WHATSAPP}4d` }}
        aria-label={WHATSAPP.label}
      >
        <WhatsAppIcon className="h-6 w-6" />
      </a>
    </div>
  );
}
