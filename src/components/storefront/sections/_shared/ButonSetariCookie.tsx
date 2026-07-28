"use client";

import { useEffect, useState } from "react";
import { CONSENT_EVENT, OPEN_SETTINGS_EVENT, readConsent } from "@/lib/cookie-consent";
import { useStoreChrome } from "@/components/storefront/StorefrontProvider";

/**
 * Legatura de redeschidere a panoului de cookie-uri, din blocul legal.
 *
 * Inainte era un buton rotund care plutea peste magazin, in stanga jos, pe orice
 * pagina. Legea cere ca retragerea consimtamantului sa fie la fel de usoara ca
 * acordarea lui, nu ca ea sa stea permanent peste continut — o legatura langa
 * politici satisface cerinta si nu mai incurca.
 *
 * Apare doar dupa ce vizitatorul a ales ceva: fara consimtamant salvat nu exista
 * nimic de retras, iar magazinele fara banner de cookie-uri n-ar avea ce
 * deschide.
 */
export function ButonSetariCookie({ className }: { className: string }) {
  const { business } = useStoreChrome();
  const slug = business.slug ?? "";
  const [aAles, setAAles] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const verifica = () => setAAles(readConsent(slug) !== null);
    verifica();
    window.addEventListener(CONSENT_EVENT, verifica);
    return () => window.removeEventListener(CONSENT_EVENT, verifica);
  }, [slug]);

  if (!aAles) return null;

  return (
    <button type="button" className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}>
      Setari cookie-uri
    </button>
  );
}
