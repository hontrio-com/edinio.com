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
 *
 * ═══ ⚠ `z-30`, NU `z-50`. DEASUPRA PAGINII, SUB MENIU ═══
 *
 * Erau pe `z-50`, adică pe același etaj cu bara de sus. Meniul de telefon
 * (`site-header/MobileNav`) e pe `z-40`, așa că butoanele astea rămâneau
 * DEASUPRA lui cât timp era deschis: două cercuri plutind peste lista de
 * pagini, exact în colțul în care stă degetul.
 *
 * Nu se rezolvă ascunzându-le cât e meniul deschis — ar fi însemnat stare
 * împărțită între două componente care n-au nimic una cu alta. Etajele sunt
 * de-ajuns, dacă sunt puse în ordinea potrivită:
 *
 *   z-50  bara de sus (rămâne mereu vizibilă, are butonul de închidere)
 *   z-40  meniul de telefon, deschis
 *   z-30  butoanele astea
 *
 * ⚠ Cine mai adaugă ceva plutitor pe site intră tot pe `z-30` sau sub. Peste
 * `z-40` nu are voie nimic în afară de bară: orice altceva acoperă meniul.
 */
export function StickyContact() {
  return (
    <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-2.5">
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
