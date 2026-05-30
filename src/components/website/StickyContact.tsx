"use client";

import { Phone, MessageCircle } from "lucide-react";

const PHONE = "+40750456809";
const WHATSAPP_URL = `https://wa.me/40750456809`;

export function StickyContact() {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      <a
        href={`tel:${PHONE}`}
        className="inline-flex items-center gap-2 h-12 px-3 md:px-5 rounded-full bg-foreground text-background text-sm font-semibold shadow-lg hover:bg-foreground/90 transition-all duration-200"
      >
        <Phone className="h-4.5 w-4.5 flex-shrink-0" />
        <span className="hidden md:inline">Suna acum</span>
      </a>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 h-12 px-3 md:px-5 rounded-full bg-[#25D366] text-white text-sm font-semibold shadow-lg hover:bg-[#1fba59] transition-all duration-200"
      >
        <MessageCircle className="h-4.5 w-4.5 flex-shrink-0" />
        <span className="hidden md:inline">Mesaj pe WhatsApp</span>
      </a>
    </div>
  );
}
