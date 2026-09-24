"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { BUTON_DISCRET } from "./ui/clase";

/**
 * Copiaza un numar (AWB-ul coletului) in memorie, pentru curierii care nu dau o
 * pagina publica de urmarire: omul il lipeste pe site-ul lor.
 */
export function CopiazaText({ text, eticheta }: { text: string; eticheta: string }) {
  const [copiat, setCopiat] = useState(false);
  return (
    <button
      type="button"
      className={BUTON_DISCRET}
      aria-label={eticheta}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopiat(true);
          setTimeout(() => setCopiat(false), 2000);
        } catch {
          /* Fara acces la memorie (pagina fara HTTPS, permisiune refuzata): numarul
             ramane oricum pe ecran, selectabil. */
        }
      }}
    >
      {copiat ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      <span>{copiat ? "Copiat" : "Copiaza"}</span>
      {/* Anuntul pentru cititoarele de ecran: o eticheta schimbata pe un buton focalizat nu se citeste sigur. */}
      <span role="status" className="sr-only">{copiat ? "Copiat" : ""}</span>
    </button>
  );
}
